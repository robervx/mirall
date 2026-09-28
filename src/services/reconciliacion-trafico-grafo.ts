/**
 * Reconciliación tráfico ↔ grafo viario — spec 032. Función pura, sin red:
 * empareja los ~412 tramos con estado real de la capa de tráfico (spec 004,
 * `Geoportal`, segmentación propia) con los tramos del grafo viario de OSM
 * (spec 020, segmentación distinta e independiente) mediante nombre
 * normalizado + solape geométrico dentro de un buffer — no es un *snap*
 * punto→línea, es conciliar dos segmentaciones de la misma calle (spec 032
 * §0). No se fuerzan emparejamientos de baja confianza: cobertura parcial es
 * el resultado esperado (spec 032 §7).
 */
import type { Coordenada } from './proximidad';
import { construirIndiceEspacial, type IndiceRedViaria } from './red-viaria-indice';
import type { Tramo } from './red-viaria';
import type { TramoTrafico } from './trafico';

export type MetodoEmparejamiento = 'nombre+solape' | 'solape' | 'sinEmparejar';
export type ConfianzaEmparejamiento = 'alta' | 'media' | 'baja';

export interface EmparejamientoTraficoGrafo {
  idTramoTrafico: string;
  idsTramoGrafo: string[];
  metodo: MetodoEmparejamiento;
  solapeFraccion: number; // 0-1
  confianza: ConfianzaEmparejamiento;
}

export interface EstadoTraficoPorTramoGrafo {
  idTramoGrafo: string;
  estado: TramoTrafico['estado'] | null;
  idTramoTraficoOrigen: string | null;
  observedAt: string | null;
}

/** Buffer de solape — dentro de este radio, un punto del tramo de tráfico "cae sobre" un tramo del grafo (spec 032 §3, rango sugerido 15-20 m). */
const BUFFER_SOLAPE_M = 20;
/** Radio inicial de búsqueda en el índice espacial — más pequeño que el buffer general de spec 020 (250 m) porque aquí solo interesan candidatos ya dentro del buffer de solape. */
const RADIO_BUSQUEDA_INICIAL_M = 30;

const PREFIJOS_VIA = [
  'carrer de la',
  'carrer del',
  'carrer de les',
  'carrer dels',
  'carrer de',
  'carrer',
  'calle de la',
  'calle del',
  'calle de',
  'calle',
  'avinguda de la',
  'avinguda del',
  'avinguda de',
  'avinguda',
  'avenida de la',
  'avenida del',
  'avenida de',
  'avenida',
  'plaça de la',
  'plaça del',
  'plaça de',
  'plaça',
  'plaza de la',
  'plaza del',
  'plaza de',
  'plaza',
  'passeig de',
  'paseo de',
  'camí de',
  'camino de',
  'ronda de',
  'ronda',
  'gran via de',
  'gran via',
];

/**
 * Normaliza un nombre de vía para comparar entre dos fuentes con estilo
 * distinto (Geoportal "CALLE COLÓN", OSM "Carrer de Colom") — sin acentos,
 * minúsculas, sin el prefijo de tipo de vía. Heurística documentada, no
 * pretende resolver contra el nomenclátor oficial (eso es la resolución
 * CDNCV pendiente en spec 020 §7).
 */
export function normalizarNombreCalle(nombre: string | null): string | null {
  if (!nombre) return null;
  let normalizado = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const prefijo of PREFIJOS_VIA) {
    if (normalizado.startsWith(`${prefijo} `)) {
      normalizado = normalizado.slice(prefijo.length + 1).trim();
      break;
    }
  }
  return normalizado.length > 0 ? normalizado : null;
}

function coordenadasDe(geometry: GeoJSON.LineString | GeoJSON.MultiLineString): Coordenada[] {
  if (geometry.type === 'LineString') return geometry.coordinates as Coordenada[];
  return geometry.coordinates.flat() as Coordenada[];
}

/** Puntos de muestreo del tramo: sus vértices + el punto medio de cada segmento, para no depender de la densidad de vértices de la fuente. */
function puntosMuestreo(geometry: GeoJSON.LineString | GeoJSON.MultiLineString): Coordenada[] {
  const coords = coordenadasDe(geometry);
  if (coords.length === 0) return [];
  const puntos: Coordenada[] = [coords[0]!];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    puntos.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    puntos.push(b);
  }
  return puntos;
}

/**
 * Empareja cada tramo de tráfico con los tramos de grafo que solapan su
 * geometría dentro del buffer. Un tramo de tráfico largo puede cubrir varios
 * tramos de grafo consecutivos — se reparten los puntos muestreados entre
 * ellos y cada uno recibe su fracción de solape.
 */
export function emparejarTraficoConGrafo(
  tramosTrafico: TramoTrafico[],
  tramosGrafo: Tramo[],
  indiceOpcional?: IndiceRedViaria,
): EmparejamientoTraficoGrafo[] {
  const indice = indiceOpcional ?? construirIndiceEspacial(tramosGrafo);
  const nombrePorIdGrafo = new Map(tramosGrafo.map((t) => [t.idTramo, normalizarNombreCalle(t.nombreCalle)]));

  return tramosTrafico.map((tt) => {
    const puntos = puntosMuestreo(tt.geometry);
    if (puntos.length === 0) {
      return { idTramoTrafico: tt.id, idsTramoGrafo: [], metodo: 'sinEmparejar', solapeFraccion: 0, confianza: 'baja' };
    }

    const nombreTrafico = normalizarNombreCalle(tt.nombre);
    const conteoPorIdGrafo = new Map<string, number>();
    let puntosEmparejados = 0;

    for (const punto of puntos) {
      const resultado = indice.tramoMasCercano(punto, RADIO_BUSQUEDA_INICIAL_M);
      if (!resultado || resultado.distanciaMetros > BUFFER_SOLAPE_M) continue;
      puntosEmparejados++;
      const idGrafo = resultado.tramo.idTramo;
      conteoPorIdGrafo.set(idGrafo, (conteoPorIdGrafo.get(idGrafo) ?? 0) + 1);
    }

    if (conteoPorIdGrafo.size === 0) {
      return { idTramoTrafico: tt.id, idsTramoGrafo: [], metodo: 'sinEmparejar', solapeFraccion: 0, confianza: 'baja' };
    }

    // Solo se incluyen los tramos de grafo que cubren una parte no
    // despreciable del recorrido (evita "ruido" de un único punto suelto
    // que cayó cerca de un tramo de grafo irrelevante).
    const idsTramoGrafo = [...conteoPorIdGrafo.entries()]
      .filter(([, n]) => n / puntos.length >= 0.1)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    if (idsTramoGrafo.length === 0) {
      return { idTramoTrafico: tt.id, idsTramoGrafo: [], metodo: 'sinEmparejar', solapeFraccion: 0, confianza: 'baja' };
    }

    const solapeFraccion = puntosEmparejados / puntos.length;
    const nombreCoincide =
      nombreTrafico !== null && idsTramoGrafo.some((id) => nombrePorIdGrafo.get(id) === nombreTrafico);

    const metodo: MetodoEmparejamiento = nombreCoincide ? 'nombre+solape' : 'solape';
    const confianza: ConfianzaEmparejamiento =
      nombreCoincide && solapeFraccion >= 0.7
        ? 'alta'
        : solapeFraccion >= 0.5
          ? 'media'
          : 'baja';

    return { idTramoTrafico: tt.id, idsTramoGrafo, metodo, solapeFraccion, confianza };
  });
}

/**
 * Proyecta el estado real de tráfico sobre los tramos del grafo — para que
 * el cordón/simulador (specs 021/022/031) puedan ofrecer un corte real como
 * pre-marcado, editable, nunca impuesto (spec 032 §7, `CLAUDE.md` §4).
 * `sinEmparejar` y confianza `baja` no proyectan estado (más vale no dato
 * que un dato ruidoso).
 */
export function proyectarEstadoSobreGrafo(
  emparejamientos: EmparejamientoTraficoGrafo[],
  tramosTrafico: TramoTrafico[],
): EstadoTraficoPorTramoGrafo[] {
  const traficoPorId = new Map(tramosTrafico.map((t) => [t.id, t]));
  const resultado = new Map<string, EstadoTraficoPorTramoGrafo>();

  for (const emp of emparejamientos) {
    if (emp.metodo === 'sinEmparejar' || emp.confianza === 'baja') continue;
    const tt = traficoPorId.get(emp.idTramoTrafico);
    if (!tt) continue;
    for (const idGrafo of emp.idsTramoGrafo) {
      resultado.set(idGrafo, {
        idTramoGrafo: idGrafo,
        estado: tt.estado,
        idTramoTraficoOrigen: tt.id,
        observedAt: tt.observedAt,
      });
    }
  }
  return [...resultado.values()];
}
