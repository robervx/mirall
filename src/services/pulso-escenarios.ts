/**
 * Evaluador consolidado de escenarios de conjunción — spec 010 v4
 * (specs/010-indice-pulso-distrito.md §3-§6, §10). Función pura, sin red:
 * combina tráfico (spec 004), incidencias de vía pública (spec 026), zonas
 * de movilidad reducida de Fallas (spec 008) y el nowcast de lluvia
 * (spec 016), ya obtenidos por quien la llama. La consumen tanto el
 * endpoint del Pulso (`api/pulso/v1/distrito`) como el motor de insights
 * (`api/insights/v1/actual`) — un único evaluador, no dos paralelos
 * (spec 010 §6).
 *
 * Sin score compuesto: cada escenario es una conjunción AND de condiciones
 * con umbral, nunca una suma ponderada de señales heterogéneas (CLAUDE.md
 * §4, spec 013 §0, spec 024 §0, spec 010 §10.1).
 */
import type { TramoTrafico, EstadoTramo } from './trafico';
import { puntoMedio } from './trafico';
import type { IncidenciaViaPublica } from './via-publica';
import type { ZonaMovilidadReducida } from './fallas';
import { centroidePoligono } from './fallas';
import type { PrediccionCortoPlazo } from './prediccion-corto-plazo';
import type { CalidadAire } from './calidad-aire';
import type { EquipamientoCritico } from './equipamientos-criticos';
import { distanciaPuntoALinea } from './proximidad';
import {
  UMBRAL_TRAFICO_CONCENTRADO_AVISO,
  UMBRAL_TRAFICO_CONCENTRADO_URGENTE,
  UMBRAL_LLUVIA_PROB_PCT,
} from './insights';

export type NivelPulso = 'sin-senal' | 'seguimiento' | 'prioritario';
export type ModoEscenario = 'vivo' | 'sombra';
export type IdEscenario =
  | 'incidencia-sobre-trafico-denso'
  | 'fallas-y-trafico'
  | 'lluvia-inminente-sobre-trafico-denso'
  | 'corte-cerca-equipamiento-critico';

export interface TramoAfectado {
  id: string;
  nombre: string;
  estado: string;
  puntoMedio: [number, number];
}

export interface EscenarioActivo {
  id: IdEscenario;
  nivel: 'seguimiento' | 'prioritario';
  modo: ModoEscenario;
  /** true tras verse en 2 evaluaciones consecutivas (histéresis, §6) — la UI solo pinta vivo+confirmado. */
  confirmado: boolean;
  /** Horizonte en minutos; null = "inmediato" (escenarios 1 y 2, que no anticipan, solo constatan). */
  anticipacionMin: number | null;
  motivo: string;
  /** Barrios afectados — [] en v4 (spec 010 §7: sin geometría de barrio verificada todavía). */
  zonas: string[];
  centroideAfectado: [number, number];
  tramosAfectados: TramoAfectado[];
  incidencia?: { id: string; descripcion: string; tipo: string; lat: number; lon: number };
  zonaFallas?: { nombre: string; centroide: [number, number] };
  /** v5 (spec 010) — solo en 'corte-cerca-equipamiento-critico'. */
  equipamientoCritico?: { id: string; nombre: string; categoria: 'sanidad' | 'bomberos'; distanciaM: number };
}

export interface PulsoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  /** Máximo nivel entre los escenarios modo 'vivo' y confirmado === true; 'sin-senal' si ninguno. */
  nivel: NivelPulso;
  monitorizacion: 'suficiente' | 'insuficiente';
  tramosMonitorizados: number;
  /** Incluye 'sombra' y los no confirmados, para trazabilidad — spec 010 §4. */
  escenariosActivos: EscenarioActivo[];
  notaAire: string | null;
  observedAt: string;
  fetchedAt: string;
  source: 'vlc-monitor-pulso';
}

export interface RespuestaPulso {
  distritos: PulsoDistrito[];
  fresh: boolean;
}

interface DistritoBasico {
  codigo: string;
  nombre: string;
}

/**
 * Estado de histéresis por "<distrito>:<escenarioId>". `confirmado` y
 * `ultimoEscenario` son una elaboración deliberada sobre el contrato mínimo
 * de spec 010 §6 (que solo pedía `{primeraDeteccion, ultimaDeteccion}`): sin
 * guardar el contenido de la última detección no hay forma de seguir
 * pintando el escenario durante la ventana de permanencia una vez deja de
 * detectarse — el mapa necesita algo que dibujar, no solo un timestamp.
 */
export interface EstadoEscenario {
  primeraDeteccion: string;
  ultimaDeteccion: string;
  confirmado: boolean;
  ultimoEscenario: Omit<EscenarioActivo, 'confirmado' | 'modo'>;
}
export type EstadoHisteresisPulso = Record<string, EstadoEscenario>;

export interface EntradaPulso {
  distritos: DistritoBasico[];
  tramos: TramoTrafico[];
  incidencias: IncidenciaViaPublica[];
  zonasFallas: ZonaMovilidadReducida[];
  prediccion: PrediccionCortoPlazo | null;
  aire: CalidadAire | null;
  /** Estado de tráfico de la evaluación anterior — para el gate "trafico-empeora" del escenario 3. Mismo dato que usa spec 013 v4b. */
  tramosPrevios: TramoTrafico[] | null;
  /** v5 (spec 010) — para 'corte-cerca-equipamiento-critico'. Asset estático (spec 054), sin TTL propio. */
  equipamientosCriticos: EquipamientoCritico[];
  /** Inyectable para tests deterministas; por defecto la hora real. */
  ahora?: string;
}

export interface ResultadoPulso {
  distritos: PulsoDistrito[];
  estadoHisteresis: EstadoHisteresisPulso;
}

const MIN_TRAMOS_MONITORIZACION = 3;
const PERMANENCIA_TRAS_CONFIRMAR_MS = 20 * 60 * 1000;
const PCT_TRAFICO_CONCENTRADO = 0.25;
const DIAS_INCIDENCIA_RECIENTE = 7;
const HORIZONTE_LLUVIA_MIN = 120; // 2h — spec 010 §3
const MAX_TRAMOS_AFECTADOS_MOSTRADOS = 5;
const CENTRO_CIUDAD_FALLBACK: [number, number] = [-0.3763, 39.4699]; // Ciutat Vella — solo si un escenario de ciudad no tiene ningún tramo que anclar
/** v5 (spec 010 §3) — heurística de partida sin calibrar, ver spec para el porqué de 250 m. */
const RADIO_EQUIPAMIENTO_CRITICO_M = 250;

const IDS_ESCENARIO: IdEscenario[] = [
  'incidencia-sobre-trafico-denso',
  'fallas-y-trafico',
  'lluvia-inminente-sobre-trafico-denso',
  'corte-cerca-equipamiento-critico',
];

const MODO_POR_ESCENARIO: Record<IdEscenario, ModoEscenario> = {
  'incidencia-sobre-trafico-denso': 'vivo',
  'fallas-y-trafico': 'vivo',
  'lluvia-inminente-sobre-trafico-denso': 'sombra',
  // v5 — determinista (estado oficial de tráfico + geometría real), mismo
  // criterio de bajo riesgo de ruido que justificó ir a 'vivo' desde el
  // principio a los dos primeros escenarios (§10.3 de la spec).
  'corte-cerca-equipamiento-critico': 'vivo',
};

// Mismo orden que insights.ts (NIVEL_TRAFICO), duplicado deliberadamente
// pequeño en vez de importar un detalle interno de otro módulo — ver
// comentario de MODO_POR_ESCENARIO.
const NIVEL_ESTADO: Record<EstadoTramo, number> = {
  fluido: 0,
  denso: 1,
  congestionado: 2,
  cortado: 3,
  'sin-datos': -1,
};

function claveHisteresis(distrito: string, escenarioId: IdEscenario): string {
  return `${distrito}:${escenarioId}`;
}

function tramoAfectadoDe(t: TramoTrafico): TramoAfectado {
  return { id: t.id, nombre: t.nombre, estado: t.estado, puntoMedio: puntoMedio(t.geometry) };
}

function centroideMedio(puntos: [number, number][]): [number, number] {
  if (puntos.length === 0) return CENTRO_CIUDAD_FALLBACK;
  const lon = puntos.reduce((s, p) => s + p[0], 0) / puntos.length;
  const lat = puntos.reduce((s, p) => s + p[1], 0) / puntos.length;
  return [lon, lat];
}

interface AgregadoDistrito {
  codigo: string;
  nombre: string;
  tramos: TramoTrafico[];
  monitorizados: number;
  problematicos: TramoTrafico[]; // congestionado | cortado
}

/**
 * `monitorizados` cuenta todos los tramos con distrito asignado, igual
 * estado sea el que sea — mismo criterio que `insightsTraficoConcentrado`
 * de insights.ts (spec 024 §6), para que "N de M tramos monitorizados" en la
 * UI signifique siempre lo mismo en toda la app.
 */
function agregarPorDistrito(distritos: DistritoBasico[], tramos: TramoTrafico[]): Map<string, AgregadoDistrito> {
  const mapa = new Map<string, AgregadoDistrito>();
  for (const d of distritos) {
    mapa.set(d.codigo, { codigo: d.codigo, nombre: d.nombre, tramos: [], monitorizados: 0, problematicos: [] });
  }
  for (const t of tramos) {
    if (!t.distrito) continue;
    const ag = mapa.get(t.distrito);
    if (!ag) continue;
    ag.tramos.push(t);
    ag.monitorizados += 1;
    if (t.estado === 'congestionado' || t.estado === 'cortado') ag.problematicos.push(t);
  }
  return mapa;
}

function trafficoConcentradoConPct(ag: AgregadoDistrito): boolean {
  if (ag.monitorizados === 0) return false;
  return (
    ag.problematicos.length >= UMBRAL_TRAFICO_CONCENTRADO_AVISO &&
    ag.problematicos.length / ag.monitorizados >= PCT_TRAFICO_CONCENTRADO
  );
}

function trafficoConcentradoAbsoluto(ag: AgregadoDistrito, umbral: number): boolean {
  return ag.problematicos.length >= umbral;
}

/**
 * spec 010 §3/§7: no hay campo booleano "afecta a calzada" en spec 026, solo
 * `afectacion: string` en texto libre sin lista cerrada de valores — se
 * aproxima buscando "calzada" como palabra, documentado como heurística, no
 * como dato estructurado.
 */
function afectaCalzada(inc: IncidenciaViaPublica): boolean {
  return inc.afectacion.toLowerCase().includes('calzada');
}

/**
 * spec 010 §3: `tipo ∈ {incidencias, festejos}` o `tipo = obras` con
 * afectación de calzada — Y en cualquier caso `vigenciaDesde` ≤ 7 días. La
 * segunda condición se lee aplicada a los tres casos (no solo a `obras`),
 * consistente con el riesgo documentado en §7 ("si no, se encendería
 * siempre en distritos céntricos con obras/festejos largos").
 */
function incidenciaElegible(inc: IncidenciaViaPublica, ahoraMs: number): boolean {
  const tipoOk =
    inc.tipo === 'incidencias' || inc.tipo === 'festejos' || (inc.tipo === 'obras' && afectaCalzada(inc));
  if (!tipoOk) return false;
  const dias = (ahoraMs - new Date(inc.vigenciaDesde).getTime()) / 86_400_000;
  return dias >= 0 && dias <= DIAS_INCIDENCIA_RECIENTE;
}

type DeteccionCruda = Omit<EscenarioActivo, 'confirmado' | 'modo'>;

function detectarIncidenciaSobreTraficoDenso(
  agregados: Map<string, AgregadoDistrito>,
  incidencias: IncidenciaViaPublica[],
  ahoraMs: number,
): Map<string, DeteccionCruda> {
  const detecciones = new Map<string, DeteccionCruda>();
  const porDistrito = new Map<string, IncidenciaViaPublica[]>();
  for (const inc of incidencias) {
    if (!inc.distritoCodigo || !incidenciaElegible(inc, ahoraMs)) continue;
    const lista = porDistrito.get(inc.distritoCodigo) ?? [];
    lista.push(inc);
    porDistrito.set(inc.distritoCodigo, lista);
  }
  for (const [codigo, incs] of porDistrito) {
    const ag = agregados.get(codigo);
    if (!ag || !trafficoConcentradoConPct(ag)) continue;
    const inc = incs[0]!; // dedup por distrito — una tarjeta, no una por incidencia (spec 010 §6)
    detecciones.set(codigo, {
      id: 'incidencia-sobre-trafico-denso',
      nivel: 'prioritario',
      anticipacionMin: null,
      motivo: `Incidencia "${inc.descripcion}" en ${inc.calle} coincide con ${ag.problematicos.length} tramos de tráfico denso en ${ag.nombre}.`,
      zonas: [],
      centroideAfectado: [inc.lon, inc.lat],
      tramosAfectados: ag.problematicos.slice(0, MAX_TRAMOS_AFECTADOS_MOSTRADOS).map(tramoAfectadoDe),
      incidencia: { id: inc.id, descripcion: inc.descripcion, tipo: inc.tipo, lat: inc.lat, lon: inc.lon },
    });
  }
  return detecciones;
}

function detectarFallasYTrafico(
  agregados: Map<string, AgregadoDistrito>,
  zonas: ZonaMovilidadReducida[],
): Map<string, DeteccionCruda> {
  const detecciones = new Map<string, DeteccionCruda>();
  const porDistrito = new Map<string, ZonaMovilidadReducida[]>();
  for (const z of zonas) {
    if (!z.distrito) continue;
    const lista = porDistrito.get(z.distrito) ?? [];
    lista.push(z);
    porDistrito.set(z.distrito, lista);
  }
  for (const [codigo, zs] of porDistrito) {
    const ag = agregados.get(codigo);
    if (!ag || ag.problematicos.length === 0) continue;
    const zona = zs[0]!;
    const centroide = centroidePoligono(zona.geometry);
    detecciones.set(codigo, {
      id: 'fallas-y-trafico',
      nivel: 'prioritario',
      anticipacionMin: null,
      motivo: `Zona de movilidad reducida de Fallas activa en ${ag.nombre}, coincidiendo con ${ag.problematicos.length} tramos de tráfico denso.`,
      zonas: [],
      centroideAfectado: centroide,
      tramosAfectados: ag.problematicos.slice(0, MAX_TRAMOS_AFECTADOS_MOSTRADOS).map(tramoAfectadoDe),
      zonaFallas: { nombre: zona.descripcion, centroide },
    });
  }
  return detecciones;
}

/** Mismo criterio que `insightsTraficoEmpeora` de insights.ts (spec 013 v4b), reimplementado aquí en vez de importado (esa función no está exportada). */
function distritosConTraficoEmpeorado(tramos: TramoTrafico[], previos: TramoTrafico[] | null): Set<string> {
  const distritos = new Set<string>();
  if (!previos || previos.length === 0) return distritos;
  const nivelPrevio = new Map(previos.map((t) => [t.id, NIVEL_ESTADO[t.estado] ?? 0]));
  for (const t of tramos) {
    if (!t.distrito) continue;
    const antes = nivelPrevio.get(t.id);
    if (antes === undefined) continue;
    const ahora = NIVEL_ESTADO[t.estado] ?? 0;
    if (ahora > antes) distritos.add(t.distrito);
  }
  return distritos;
}

function lluviaInminente(
  prediccion: PrediccionCortoPlazo | null,
  ahoraMs: number,
): { activa: boolean; anticipacionMin: number | null } {
  if (!prediccion) return { activa: false, anticipacionMin: null };
  for (const p of prediccion.predicciones) {
    const minutos = (new Date(p.horaObjetivo).getTime() - ahoraMs) / 60_000;
    if (minutos > HORIZONTE_LLUVIA_MIN) continue;
    if (p.probabilidadPrecipitacion >= UMBRAL_LLUVIA_PROB_PCT || p.precipitacion >= 2) {
      return { activa: true, anticipacionMin: Math.max(0, Math.round(minutos)) };
    }
  }
  return { activa: false, anticipacionMin: null };
}

function detectarLluviaSobreTrafico(
  agregados: Map<string, AgregadoDistrito>,
  prediccion: PrediccionCortoPlazo | null,
  tramosEmpeorados: Set<string>,
  ahoraMs: number,
): Map<string, DeteccionCruda> {
  const detecciones = new Map<string, DeteccionCruda>();
  const { activa, anticipacionMin } = lluviaInminente(prediccion, ahoraMs);
  if (!activa) return detecciones;

  for (const [codigo, ag] of agregados) {
    const traficoMalo = trafficoConcentradoAbsoluto(ag, UMBRAL_TRAFICO_CONCENTRADO_URGENTE) || tramosEmpeorados.has(codigo);
    if (!traficoMalo) continue;
    const tramosRef = ag.problematicos.length > 0 ? ag.problematicos : ag.tramos;
    detecciones.set(codigo, {
      id: 'lluvia-inminente-sobre-trafico-denso',
      nivel: 'seguimiento',
      anticipacionMin,
      // Deliberado: nunca "va a llover en <distrito>" — el nowcast es de
      // ciudad, la localización la pone el tráfico (spec 010 §3/§7).
      motivo: `Riesgo de lluvia en la ciudad en los próximos ${anticipacionMin ?? '?'} min, coincidiendo con tráfico ya denso en ${ag.nombre}.`,
      zonas: [],
      centroideAfectado: centroideMedio(tramosRef.map((t) => puntoMedio(t.geometry))),
      tramosAfectados: ag.problematicos.slice(0, MAX_TRAMOS_AFECTADOS_MOSTRADOS).map(tramoAfectadoDe),
    });
  }
  return detecciones;
}

/**
 * v5 (spec 010 §3) — "¿puede un corte bloquear el acceso de una ambulancia o un camión
 * de bomberos?". Recomendación #1 (de mayor valor) de un análisis del asesor de ciencia
 * de datos del proyecto (2026-10-01). Decisiones de diseño explícitas, ver spec:
 * - Solo tramos `cortado` (no `congestionado` — demasiado frecuente cerca de hospitales
 *   grandes, habría disparado casi siempre).
 * - Solo categorías `sanidad`/`bomberos` — `policia` excluida a propósito (límite ético,
 *   CLAUDE.md §4, el mismo cruce ahí suena a orientar vigilancia, no logística).
 * - Dedup por distrito: si hay varios cortes cerca de varios equipamientos, se queda el
 *   par (tramo, equipamiento) más cercano — una tarjeta, no una por corte.
 */
function detectarCorteCercaEquipamientoCritico(
  agregados: Map<string, AgregadoDistrito>,
  tramos: TramoTrafico[],
  equipamientos: EquipamientoCritico[],
): Map<string, DeteccionCruda> {
  const detecciones = new Map<string, DeteccionCruda>();
  const criticos = equipamientos.filter((e) => e.categoria === 'sanidad' || e.categoria === 'bomberos');
  if (criticos.length === 0) return detecciones;

  interface Candidato {
    tramo: TramoTrafico;
    equipamiento: EquipamientoCritico;
    distanciaM: number;
  }
  const porDistrito = new Map<string, Candidato[]>();
  for (const t of tramos) {
    if (t.estado !== 'cortado' || !t.distrito) continue;
    let masCercano: { equipamiento: EquipamientoCritico; distanciaM: number } | null = null;
    for (const e of criticos) {
      const d = distanciaPuntoALinea([e.lon, e.lat], t.geometry);
      if (d <= RADIO_EQUIPAMIENTO_CRITICO_M && (!masCercano || d < masCercano.distanciaM)) {
        masCercano = { equipamiento: e, distanciaM: d };
      }
    }
    if (!masCercano) continue;
    const lista = porDistrito.get(t.distrito) ?? [];
    lista.push({ tramo: t, equipamiento: masCercano.equipamiento, distanciaM: masCercano.distanciaM });
    porDistrito.set(t.distrito, lista);
  }

  for (const [codigo, candidatos] of porDistrito) {
    const ag = agregados.get(codigo);
    if (!ag) continue;
    candidatos.sort((a, b) => a.distanciaM - b.distanciaM);
    const mejor = candidatos[0]!;
    const distanciaRedondeada = Math.round(mejor.distanciaM);
    detecciones.set(codigo, {
      id: 'corte-cerca-equipamiento-critico',
      nivel: 'prioritario',
      anticipacionMin: null,
      motivo: `Corte en ${mejor.tramo.nombre} a ${distanciaRedondeada} m de ${mejor.equipamiento.nombre} (${mejor.equipamiento.categoria}), podría afectar al acceso de emergencias.`,
      zonas: [],
      centroideAfectado: puntoMedio(mejor.tramo.geometry),
      tramosAfectados: candidatos.slice(0, MAX_TRAMOS_AFECTADOS_MOSTRADOS).map((c) => tramoAfectadoDe(c.tramo)),
      equipamientoCritico: {
        id: mejor.equipamiento.id,
        nombre: mejor.equipamiento.nombre,
        categoria: mejor.equipamiento.categoria as 'sanidad' | 'bomberos',
        distanciaM: distanciaRedondeada,
      },
    });
  }
  return detecciones;
}

export function calcularPulsoEscenarios(entrada: EntradaPulso, estadoPrevio: EstadoHisteresisPulso): ResultadoPulso {
  const ahoraIso = entrada.ahora ?? new Date().toISOString();
  const ahoraMs = new Date(ahoraIso).getTime();
  const fetchedAt = new Date().toISOString();

  const agregados = agregarPorDistrito(entrada.distritos, entrada.tramos);
  const tramosEmpeorados = distritosConTraficoEmpeorado(entrada.tramos, entrada.tramosPrevios);

  const detecciones = new Map<IdEscenario, Map<string, DeteccionCruda>>([
    ['incidencia-sobre-trafico-denso', detectarIncidenciaSobreTraficoDenso(agregados, entrada.incidencias, ahoraMs)],
    ['fallas-y-trafico', detectarFallasYTrafico(agregados, entrada.zonasFallas)],
    [
      'lluvia-inminente-sobre-trafico-denso',
      detectarLluviaSobreTrafico(agregados, entrada.prediccion, tramosEmpeorados, ahoraMs),
    ],
    [
      'corte-cerca-equipamiento-critico',
      detectarCorteCercaEquipamientoCritico(agregados, entrada.tramos, entrada.equipamientosCriticos),
    ],
  ]);

  const estadoNuevo: EstadoHisteresisPulso = {};
  const escenariosPorDistrito = new Map<string, EscenarioActivo[]>();
  for (const d of entrada.distritos) escenariosPorDistrito.set(d.codigo, []);

  for (const escenarioId of IDS_ESCENARIO) {
    const porDistrito = detecciones.get(escenarioId)!;
    for (const d of entrada.distritos) {
      const clave = claveHisteresis(d.codigo, escenarioId);
      const previo = estadoPrevio[clave];
      const detectadoAhora = porDistrito.get(d.codigo);

      if (detectadoAhora) {
        // Confirmado si ya se había visto en la evaluación anterior (2
        // evaluaciones consecutivas) — cold start (sin estado previo) nunca
        // confirma en su primera aparición, aunque sí queda registrado.
        const confirmadoFinal = previo !== undefined;
        estadoNuevo[clave] = {
          primeraDeteccion: previo?.primeraDeteccion ?? ahoraIso,
          ultimaDeteccion: ahoraIso,
          confirmado: confirmadoFinal,
          ultimoEscenario: detectadoAhora,
        };
        escenariosPorDistrito
          .get(d.codigo)!
          .push({ ...detectadoAhora, modo: MODO_POR_ESCENARIO[escenarioId], confirmado: confirmadoFinal });
        continue;
      }

      // Ya no se detecta: ¿sigue dentro de la ventana de permanencia y
      // estaba confirmado? (un escenario nunca confirmado no "permanece" —
      // eso sería mostrar como pasado algo que nunca llegó a confirmarse).
      if (previo?.confirmado && ahoraMs - new Date(previo.ultimaDeteccion).getTime() <= PERMANENCIA_TRAS_CONFIRMAR_MS) {
        estadoNuevo[clave] = previo;
        escenariosPorDistrito
          .get(d.codigo)!
          .push({ ...previo.ultimoEscenario, modo: MODO_POR_ESCENARIO[escenarioId], confirmado: true });
      }
      // en cualquier otro caso, la entrada se deja caer — limpieza natural del mapa de histéresis.
    }
  }

  const distritosResultado: PulsoDistrito[] = entrada.distritos.map((d) => {
    const ag = agregados.get(d.codigo);
    const monitorizados = ag?.monitorizados ?? 0;
    const escenariosActivos = escenariosPorDistrito.get(d.codigo) ?? [];

    const nivelesVivosConfirmados = escenariosActivos
      .filter((e) => e.modo === 'vivo' && e.confirmado)
      .map((e) => e.nivel);
    const nivel: NivelPulso = nivelesVivosConfirmados.includes('prioritario')
      ? 'prioritario'
      : nivelesVivosConfirmados.includes('seguimiento')
        ? 'seguimiento'
        : 'sin-senal';

    const notaAire =
      nivel !== 'sin-senal' && entrada.aire && (entrada.aire.categoria === 'Mala' || entrada.aire.categoria === 'Muy mala')
        ? `Calidad del aire ${entrada.aire.categoria.toLowerCase()} en la ciudad ahora mismo.`
        : null;

    return {
      distritoCodigo: d.codigo,
      distritoNombre: d.nombre,
      nivel,
      monitorizacion: monitorizados < MIN_TRAMOS_MONITORIZACION ? 'insuficiente' : 'suficiente',
      tramosMonitorizados: monitorizados,
      escenariosActivos,
      notaAire,
      observedAt: ahoraIso,
      fetchedAt,
      source: 'vlc-monitor-pulso' as const,
    };
  });

  return { distritos: distritosResultado, estadoHisteresis: estadoNuevo };
}
