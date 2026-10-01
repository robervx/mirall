/**
 * Motor de insights de la spec 013 (specs/013-motor-insights-alertas.md §3, §6)
 * y su v2 de correlación operativa (specs/024-motor-insights-v2-correlacion.md).
 * Función pura, sin red — combina datos ya obtenidos de las specs 001 (meteo),
 * 002 (aire), 004 (tráfico), 008 (Fallas), 010 (Pulso de Distrito) y 016
 * (predicción a corto plazo).
 *
 * "Avisa, no actúa" (CLAUDE.md §4): cada insight lleva un borrador de texto
 * listo para copiar, nunca una acción ni una lista de destinatarios — ver
 * specs/013-motor-insights-alertas.md §0. Las reglas de correlación de spec
 * 024 siguen el mismo principio de spec 013 §0/§8: reglas declarativas
 * independientes, nunca un score compuesto ponderado entre señales.
 */
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { PulsoDistrito, EscenarioActivo } from './pulso-escenarios';
import type { PrediccionCortoPlazo } from './prediccion-corto-plazo';
import type { TramoTrafico } from './trafico';
import type { DatosFallas } from './fallas';
import type { AvisoMeteo } from './avisos-meteo';

export type SeveridadInsight = 'aviso' | 'urgente';

export type TipoInsight =
  | 'calor-extremo'
  | 'frio-extremo'
  | 'aire-mala-calidad'
  | 'lluvia-intensa-prevista'
  | 'lluvia-prevista'
  | 'viento-fuerte'
  | 'trafico-concentrado-distrito'
  | 'trafico-en-zona-fallas'
  | 'trafico-empeora'
  | 'lluvia-mas-trafico-denso'
  | 'pulso-distrito'
  | 'aviso-oficial-meteo';

export interface ProtocoloSugerido {
  asunto: string;
  cuerpo: string;
}

export type FuenteInsight = '001' | '002' | '004' | '008' | '010' | '016' | '023' | '026';

export interface Insight {
  id: string;
  tipo: TipoInsight;
  severidad: SeveridadInsight;
  titulo: string;
  descripcion: string;
  protocoloSugerido: ProtocoloSugerido;
  distritoCodigo?: string;
  fuenteSpec: FuenteInsight[];
  // 'viento-fuerte' también usa fuenteSpec ['001'] (mismo EstadoMeteo, campo vientoRachas).
  detectedAt: string;
  fetchedAt: string;
  /**
   * Solo en `tipo: 'aviso-oficial-meteo'` — nivel real del aviso oficial
   * (GVA Emergencias). Permite al banner persistente (petición explícita
   * del usuario, 2026-10-01) distinguir un aviso rojo de uno naranja sin
   * tener que parsear el texto de `titulo`. `severidad` no basta: naranja y
   * rojo comparten `'urgente'` (ver `SEVERIDAD_POR_NIVEL_AVISO`).
   */
  nivelAvisoOficial?: AvisoMeteo['nivel'];
}

export interface PanelInsights {
  insights: Insight[];
  fetchedAt: string;
  source: 'vlc-monitor-insights';
}

// Exportados para que el dashboard de KPIs (spec 034) pinte el mismo semáforo
// sin duplicar el número.
export const UMBRAL_CALOR_TEMPERATURA = 38;
export const UMBRAL_CALOR_SENSACION = 42;
/** Banda de aviso más temprana — spec 013 v4b §9.2. */
export const UMBRAL_CALOR_AVISO_TEMPERATURA = 35;
const UMBRAL_FRIO_TEMPERATURA = 0;
export const UMBRAL_LLUVIA_MM = 5;
/** Probabilidad de precipitación que dispara `lluvia-prevista` (regla blanda, v4b §9.2). Exportado — spec 010 v4 lo reutiliza para el escenario de lluvia. */
export const UMBRAL_LLUVIA_PROB_PCT = 60;
// Basado en rachas (vientoRachas), no en velocidad sostenida — más indicativo
// del riesgo real, mismo criterio que usan los avisos AEMET por viento.
// Heurística documentada, no un umbral oficial — igual disclaimer que spec 010 §7.
// Exportados para que el panel de meteo (main.ts) pinte el mismo semáforo
// sin duplicar el umbral en dos sitios.
export const UMBRAL_VIENTO_AVISO_KMH = 50;
export const UMBRAL_VIENTO_URGENTE_KMH = 70;

function insightCalorExtremo(meteo: EstadoMeteo, fetchedAt: string): Insight | null {
  const esExtremo = meteo.temperatura >= UMBRAL_CALOR_TEMPERATURA || meteo.sensacionTermica >= UMBRAL_CALOR_SENSACION;
  const esAviso = meteo.temperatura >= UMBRAL_CALOR_AVISO_TEMPERATURA;
  if (!esExtremo && !esAviso) return null;

  const severidad: SeveridadInsight = esExtremo ? 'urgente' : 'aviso';
  const umbral = esExtremo
    ? `umbral de calor extremo (${UMBRAL_CALOR_TEMPERATURA}°C / ${UMBRAL_CALOR_SENSACION}°C sensación)`
    : `umbral de aviso de calor (${UMBRAL_CALOR_AVISO_TEMPERATURA}°C)`;
  return {
    id: 'calor-extremo:ciudad',
    tipo: 'calor-extremo',
    severidad,
    titulo: `${esExtremo ? 'Calor extremo' : 'Aviso de calor'} — ${Math.round(meteo.temperatura)}°C en Valencia`,
    descripcion: `Temperatura ${meteo.temperatura}°C, sensación térmica ${meteo.sensacionTermica}°C — por encima del ${umbral}.`,
    protocoloSugerido: {
      asunto: `${esExtremo ? 'Posible activación de protocolo de calor' : 'Aviso de calor'} — Valencia`,
      cuerpo:
        `Se ha detectado una temperatura de ${meteo.temperatura}°C (sensación térmica ${meteo.sensacionTermica}°C) ` +
        `en Valencia a las ${meteo.observedAt}. Se sugiere valorar ${esExtremo ? 'la activación del protocolo de calor extremo' : 'medidas preventivas de calor'}: ` +
        'hidratación y rotación de las unidades en calle, prioridad a zonas sin sombra. ' +
        'Dato de origen: Open-Meteo (Mirall, spec 001). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: ['001'],
    detectedAt: meteo.observedAt,
    fetchedAt,
  };
}

function insightFrioExtremo(meteo: EstadoMeteo, fetchedAt: string): Insight | null {
  if (meteo.temperatura > UMBRAL_FRIO_TEMPERATURA) return null;
  return {
    id: 'frio-extremo:ciudad',
    tipo: 'frio-extremo',
    severidad: 'aviso',
    titulo: `Frío extremo — ${Math.round(meteo.temperatura)}°C en Valencia`,
    descripcion: `Temperatura ${meteo.temperatura}°C — igual o por debajo del umbral de frío extremo (${UMBRAL_FRIO_TEMPERATURA}°C).`,
    protocoloSugerido: {
      asunto: 'Posible aviso de frío extremo / riesgo de helada — Valencia',
      cuerpo:
        `Se ha detectado una temperatura de ${meteo.temperatura}°C en Valencia a las ${meteo.observedAt}. ` +
        'Se sugiere valorar aviso a las unidades sobre riesgo de helada en calzada y protocolo de frío para personas sin techo. ' +
        'Dato de origen: Open-Meteo (Mirall, spec 001). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: ['001'],
    detectedAt: meteo.observedAt,
    fetchedAt,
  };
}

function insightVientoFuerte(meteo: EstadoMeteo, fetchedAt: string): Insight | null {
  if (meteo.vientoRachas < UMBRAL_VIENTO_AVISO_KMH) return null;
  const severidad: SeveridadInsight = meteo.vientoRachas >= UMBRAL_VIENTO_URGENTE_KMH ? 'urgente' : 'aviso';
  return {
    id: 'viento-fuerte:ciudad',
    tipo: 'viento-fuerte',
    severidad,
    titulo: `Viento fuerte — rachas de ${Math.round(meteo.vientoRachas)} km/h`,
    descripcion: `Rachas de ${meteo.vientoRachas} km/h (velocidad sostenida ${meteo.vientoVelocidad} km/h) — por encima del umbral de viento fuerte (${UMBRAL_VIENTO_AVISO_KMH} km/h).`,
    protocoloSugerido: {
      asunto: 'Aviso de viento fuerte — Valencia',
      cuerpo:
        `Se han detectado rachas de ${meteo.vientoRachas} km/h (velocidad sostenida ${meteo.vientoVelocidad} km/h) ` +
        `en Valencia a las ${meteo.observedAt}. Se sugiere valorar aviso a unidades sobre riesgo de caída de objetos/ramas, ` +
        'precaución con estructuras temporales (casetas, carpas) y vía pública. ' +
        'Dato de origen: Open-Meteo (Mirall, spec 001). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: ['001'],
    detectedAt: meteo.observedAt,
    fetchedAt,
  };
}

function insightAireMalaCalidad(aire: CalidadAire, fetchedAt: string): Insight | null {
  if (aire.categoria !== 'Mala' && aire.categoria !== 'Muy mala') return null;
  const severidad: SeveridadInsight = aire.categoria === 'Muy mala' ? 'urgente' : 'aviso';
  return {
    id: 'aire-mala-calidad:ciudad',
    tipo: 'aire-mala-calidad',
    severidad,
    titulo: `Calidad del aire ${aire.categoria.toLowerCase()} — índice ${aire.indiceEuropeo}`,
    descripcion: `Índice europeo de calidad del aire ${aire.indiceEuropeo} (${aire.categoria}), PM2.5 ${aire.pm25} µg/m³.`,
    protocoloSugerido: {
      asunto: `Aviso de calidad del aire ${aire.categoria.toLowerCase()} — Valencia`,
      cuerpo:
        `El índice europeo de calidad del aire está en ${aire.indiceEuropeo} (${aire.categoria}), PM2.5 ${aire.pm25} µg/m³, ` +
        `NO₂ ${aire.dioxidoNitrogeno} µg/m³ a las ${aire.observedAt}. Se sugiere valorar recomendaciones a la ciudadanía (grupos sensibles) ` +
        'y revisar si aplica alguna restricción según el protocolo municipal de calidad del aire. ' +
        'Dato de origen: Open-Meteo Air Quality (Mirall, spec 002). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: ['002'],
    detectedAt: aire.observedAt,
    fetchedAt,
  };
}

function insightsLluviaIntensa(prediccion: PrediccionCortoPlazo, fetchedAt: string): Insight[] {
  return prediccion.predicciones
    .filter((tramo) => tramo.precipitacion >= UMBRAL_LLUVIA_MM)
    .map((tramo) => ({
      id: `lluvia-intensa-prevista:${tramo.horaObjetivo}`,
      tipo: 'lluvia-intensa-prevista' as const,
      severidad: 'aviso' as const,
      titulo: `Lluvia intensa prevista — ${tramo.precipitacion}mm hacia las ${tramo.horaObjetivo}`,
      descripcion: `Predicción de ${tramo.precipitacion}mm de precipitación (${tramo.probabilidadPrecipitacion}% de probabilidad) para ${tramo.horaObjetivo}.`,
      protocoloSugerido: {
        asunto: 'Aviso de lluvia intensa prevista — Valencia',
        cuerpo:
          `Open-Meteo prevé ${tramo.precipitacion}mm de precipitación (${tramo.probabilidadPrecipitacion}% de probabilidad) ` +
          `para las ${tramo.horaObjetivo} en Valencia. Se sugiere valorar aviso preventivo a unidades sobre puntos de ` +
          'inundación habituales y refuerzo en pasos de peatones/zonas bajas. ' +
          'Dato de origen: Open-Meteo (Mirall, spec 016). Revisar y decidir antes de actuar.',
      },
      fuenteSpec: ['016'] as FuenteInsight[],
      detectedAt: tramo.horaObjetivo,
      fetchedAt,
    }));
}

// weather_code WMO de lluvia/chubascos/tormenta (51-67 llovizna/lluvia, 80-82 chubascos, 95-99 tormenta).
function esCodigoLluvia(weatherCode: number): boolean {
  return (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    (weatherCode >= 95 && weatherCode <= 99)
  );
}

/**
 * Regla blanda (spec 013 v4b §9.2): "va a llover" en las próximas horas, sin
 * llegar al umbral de lluvia *intensa* (`insightsLluviaIntensa`, >= 5 mm). Se
 * excluyen los tramos que ya cubre esa regla para no duplicar el aviso.
 */
/**
 * "HH:MM" en hora local — bug real corregido (2026-10-01, ver memoria de
 * proyecto): el título/descripción de este insight interpolaban
 * `horaObjetivo` tal cual (ISO completo, "2026-10-01T17:00:00.000Z"), un
 * timestamp lleno de ceros que no aporta nada legible. La predicción es
 * siempre a pocas horas vista (spec 016, ventana de 4h) — basta la hora, no
 * hace falta fecha ni "hoy/mañana".
 */
function formatoHoraPrediccion(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function insightsLluviaPrevista(prediccion: PrediccionCortoPlazo, fetchedAt: string): Insight[] {
  return prediccion.predicciones
    .filter((tramo) => tramo.precipitacion < UMBRAL_LLUVIA_MM)
    .filter(
      (tramo) =>
        tramo.probabilidadPrecipitacion >= UMBRAL_LLUVIA_PROB_PCT ||
        (tramo.precipitacion > 0 && esCodigoLluvia(tramo.weatherCode)),
    )
    .map((tramo) => {
      const hora = formatoHoraPrediccion(tramo.horaObjetivo);
      return {
        id: `lluvia-prevista:${tramo.horaObjetivo}`,
        tipo: 'lluvia-prevista' as const,
        severidad: 'aviso' as const,
        titulo: `Lluvia prevista hacia las ${hora}`,
        descripcion: `Predicción: ${tramo.probabilidadPrecipitacion}% de probabilidad de precipitación (${tramo.precipitacion} mm) para las ${hora}.`,
        protocoloSugerido: {
          asunto: 'Aviso de lluvia prevista — Valencia',
          cuerpo:
            `Open-Meteo prevé lluvia hacia las ${hora} en Valencia ` +
            `(${tramo.probabilidadPrecipitacion}% de probabilidad, ${tramo.precipitacion} mm estimados). ` +
            'Se sugiere aviso preventivo a unidades y atención a puntos de acumulación de agua habituales. ' +
            'Dato de origen: Open-Meteo (Mirall, spec 016). Revisar y decidir antes de actuar.',
        },
        fuenteSpec: ['016'] as FuenteInsight[],
        detectedAt: tramo.horaObjetivo,
        fetchedAt,
      };
    });
}

// Peso ordinal de cada estado de tráfico para detectar "empeora" (spec 013 v4b §9.1).
const NIVEL_TRAFICO: Record<string, number> = { fluido: 0, denso: 1, congestionado: 2, cortado: 3 };

/**
 * Un tramo sube de nivel entre dos lecturas consecutivas de tráfico. Requiere
 * estado previo (lo guarda el endpoint); en la primera evaluación no hay previo
 * y no dispara nada. Se agrupa por distrito.
 */
function insightsTraficoEmpeora(
  actual: TramoTrafico[],
  previo: TramoTrafico[] | null,
  fetchedAt: string,
): Insight[] {
  if (!previo || previo.length === 0) return [];
  const nivelPrevio = new Map(previo.map((t) => [t.id, NIVEL_TRAFICO[t.estado] ?? 0]));

  interface Empeorado {
    tramo: TramoTrafico;
    destino: number;
  }
  const empeorados: Empeorado[] = [];
  for (const t of actual) {
    const nivelAhora = NIVEL_TRAFICO[t.estado];
    if (nivelAhora === undefined) continue; // 'sin-datos'
    const antes = nivelPrevio.get(t.id);
    if (antes === undefined) continue; // tramo nuevo, no hay con qué comparar
    if (nivelAhora > antes) empeorados.push({ tramo: t, destino: nivelAhora });
  }
  if (empeorados.length === 0) return [];

  const porDistrito = new Map<string, Empeorado[]>();
  for (const e of empeorados) {
    const clave = e.tramo.distrito ?? '__ciudad__';
    const lista = porDistrito.get(clave);
    if (lista) lista.push(e);
    else porDistrito.set(clave, [e]);
  }

  return [...porDistrito.entries()].map(([clave, lista]) => {
    const hayGrave = lista.some((e) => e.destino >= 2); // congestionado o cortado
    const nombreZona = clave === '__ciudad__' ? 'Valencia' : lista[0]!.tramo.distrito!;
    // v5 (DoD de V1, 2026-09-16): el título nombraba solo el distrito — para
    // saber dónde mirar hace falta la calle más afectada, no solo la zona.
    const masSevero = [...lista].sort((a, b) => b.destino - a.destino)[0]!;
    const nombreCalle = masSevero.tramo.nombre || nombreZona;
    const masEnStr = lista.length > 1 ? ` y ${lista.length - 1} más` : '';
    const titulo = `Tráfico a peor en ${nombreCalle}${masEnStr} (${nombreZona})`;
    return {
      id: `trafico-empeora:${clave}`,
      tipo: 'trafico-empeora' as const,
      severidad: (hayGrave ? 'urgente' : 'aviso') as SeveridadInsight,
      titulo,
      descripcion:
        `${lista.length} tramo${lista.length === 1 ? ' ha' : 's han'} subido de nivel de tráfico respecto a la lectura anterior` +
        ` (${lista
          .slice(0, 3)
          .map((e) => `${e.tramo.nombre}: ${e.tramo.estado}`)
          .join('; ')}${lista.length > 3 ? '…' : ''}).`,
      protocoloSugerido: {
        asunto: `Empeoramiento de tráfico — ${nombreZona}`,
        cuerpo:
          `Se ha detectado que ${lista.length} tramo${lista.length === 1 ? '' : 's'} de ${nombreZona} ` +
          `ha${lista.length === 1 ? '' : 'n'} pasado a un estado de tráfico peor entre dos lecturas consecutivas. ` +
          'Se sugiere valorar si hace falta reforzar la regulación en la zona o avisar de rutas alternativas. ' +
          'Dato de origen: Ajuntament de València (Mirall, spec 004). Revisar y decidir antes de actuar.',
      },
      distritoCodigo: clave === '__ciudad__' ? undefined : clave,
      fuenteSpec: ['004'] as FuenteInsight[],
      detectedAt: fetchedAt,
      fetchedAt,
    };
  });
}

// Exportados — spec 010 v4 (`pulso-escenarios.ts`) reutiliza estos mismos
// umbrales para el umbral dual de tráfico, en vez de crear un cuarto juego
// de números mágicos (spec 010 §3).
export const UMBRAL_TRAFICO_CONCENTRADO_AVISO = 3;
export const UMBRAL_TRAFICO_CONCENTRADO_URGENTE = 6;

function nombreDistritoOCodigo(distritos: PulsoDistrito[] | null, codigo: string): string {
  return distritos?.find((d) => d.distritoCodigo === codigo)?.distritoNombre ?? codigo;
}

/** spec 024 §6 — multiplicidad de tramos en vez de persistencia temporal: el motor sigue sin estado (spec 013 §8). */
function insightsTraficoConcentrado(
  tramos: TramoTrafico[],
  distritos: PulsoDistrito[] | null,
  fetchedAt: string,
): Insight[] {
  const afectadosPorDistrito = new Map<string, number>();
  const monitorizadosPorDistrito = new Map<string, number>();
  for (const tramo of tramos) {
    if (!tramo.distrito) continue;
    monitorizadosPorDistrito.set(tramo.distrito, (monitorizadosPorDistrito.get(tramo.distrito) ?? 0) + 1);
    if (tramo.estado === 'congestionado' || tramo.estado === 'cortado') {
      afectadosPorDistrito.set(tramo.distrito, (afectadosPorDistrito.get(tramo.distrito) ?? 0) + 1);
    }
  }

  const insights: Insight[] = [];
  for (const [codigo, afectados] of afectadosPorDistrito) {
    if (afectados < UMBRAL_TRAFICO_CONCENTRADO_AVISO) continue;
    const nombre = nombreDistritoOCodigo(distritos, codigo);
    const monitorizados = monitorizadosPorDistrito.get(codigo) ?? afectados;
    const severidad: SeveridadInsight = afectados >= UMBRAL_TRAFICO_CONCENTRADO_URGENTE ? 'urgente' : 'aviso';
    insights.push({
      id: `trafico-concentrado-distrito:${codigo}`,
      tipo: 'trafico-concentrado-distrito',
      severidad,
      titulo: `Tráfico denso concentrado — ${nombre}`,
      descripcion: `${afectados} de ${monitorizados} tramos monitorizados en ${nombre} están congestionados o cortados ahora mismo.`,
      protocoloSugerido: {
        asunto: `Concentración de tráfico denso — ${nombre}`,
        cuerpo:
          `Se han detectado ${afectados} tramos en estado congestionado o cortado (de ${monitorizados} monitorizados) en ${nombre}. ` +
          'Se sugiere valorar revisar la situación sobre el terreno. ' +
          'Dato de origen: Geoportal Ajuntament de València (Mirall, spec 004). Revisar y decidir antes de actuar.',
      },
      distritoCodigo: codigo,
      fuenteSpec: ['004'],
      detectedAt: fetchedAt,
      fetchedAt,
    });
  }
  return insights;
}

/**
 * spec 024 §6 — deliberadamente solo `zonasMovilidadReducida`, no
 * monumentos/carpas (esos están poblados todo el año, ver spec 024 §6):
 * es la única señal de Fallas genuinamente estacional.
 */
function insightsTraficoEnZonaFallas(
  tramos: TramoTrafico[],
  fallas: DatosFallas,
  distritos: PulsoDistrito[] | null,
  fetchedAt: string,
): Insight[] {
  const distritosConZonaFallas = new Set(
    fallas.zonasMovilidadReducida.map((z) => z.distrito).filter((d): d is string => d !== null),
  );
  if (distritosConZonaFallas.size === 0) return [];

  const distritosConTraficoDenso = new Set(
    tramos
      .filter((t) => t.distrito && (t.estado === 'congestionado' || t.estado === 'cortado'))
      .map((t) => t.distrito!),
  );

  const insights: Insight[] = [];
  for (const codigo of distritosConZonaFallas) {
    if (!distritosConTraficoDenso.has(codigo)) continue;
    const nombre = nombreDistritoOCodigo(distritos, codigo);
    insights.push({
      id: `trafico-en-zona-fallas:${codigo}`,
      tipo: 'trafico-en-zona-fallas',
      severidad: 'urgente',
      titulo: `Tráfico denso en zona de Fallas activa — ${nombre}`,
      descripcion: `${nombre} tiene tráfico congestionado o cortado y una zona de movilidad reducida de Fallas activa a la vez.`,
      protocoloSugerido: {
        asunto: `Concurrencia de tráfico denso y zona de Fallas — ${nombre}`,
        cuerpo:
          `Se ha detectado tráfico congestionado o cortado coincidiendo con una zona de movilidad reducida de Fallas activa en ${nombre}. ` +
          'Se sugiere valorar reforzar la zona sobre el terreno. ' +
          'Datos de origen: Geoportal Ajuntament de València (Mirall, specs 004 y 008). Revisar y decidir antes de actuar.',
      },
      distritoCodigo: codigo,
      fuenteSpec: ['004', '008'],
      detectedAt: fetchedAt,
      fetchedAt,
    });
  }
  return insights;
}

/** spec 024 §6 — refuerza el insight de lluvia ya existente en vez de duplicarlo; no reemplaza insightsLluviaIntensa. */
function insightLluviaMasTrafico(
  insightsLluvia: Insight[],
  tramos: TramoTrafico[],
  distritos: PulsoDistrito[] | null,
  fetchedAt: string,
): Insight | null {
  if (insightsLluvia.length === 0) return null;

  const distritosConTraficoDenso = Array.from(
    new Set(
      tramos
        .filter((t) => t.distrito && (t.estado === 'congestionado' || t.estado === 'cortado'))
        .map((t) => t.distrito!),
    ),
  );
  if (distritosConTraficoDenso.length === 0) return null;

  const nombres = distritosConTraficoDenso.map((codigo) => nombreDistritoOCodigo(distritos, codigo)).join(', ');
  return {
    id: 'lluvia-mas-trafico-denso:ciudad',
    tipo: 'lluvia-mas-trafico-denso',
    severidad: 'urgente',
    titulo: 'Lluvia intensa prevista con tráfico ya denso',
    descripcion: `Hay lluvia intensa prevista y tráfico ya congestionado o cortado en: ${nombres}.`,
    protocoloSugerido: {
      asunto: 'Lluvia intensa prevista con tráfico ya denso — Valencia',
      cuerpo:
        `Además de la lluvia intensa prevista, ya hay tráfico congestionado o cortado en: ${nombres}. ` +
        'Se sugiere valorar priorizar el refuerzo preventivo en esas zonas antes de que llegue la lluvia. ' +
        'Datos de origen: Open-Meteo y Geoportal Ajuntament de València (Mirall, specs 016 y 004). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: ['016', '004'],
    detectedAt: fetchedAt,
    fetchedAt,
  };
}

const FUENTES_POR_ESCENARIO: Record<EscenarioActivo['id'], FuenteInsight[]> = {
  'incidencia-sobre-trafico-denso': ['004', '026'],
  'fallas-y-trafico': ['004', '008'],
  'lluvia-inminente-sobre-trafico-denso': ['004', '016'],
};

/**
 * spec 010 v4 §6 — una tarjeta y un toast por **distrito**, no uno por
 * escenario: si un distrito tiene varios escenarios `vivo`+`confirmado` a
 * la vez, se pliegan en un único Insight con todos los motivos y chips de
 * fuente. Los escenarios `sombra` (lluvia) nunca generan alerta aquí — eso
 * es justamente lo que significa "modo sombra" (spec 010 §10.3).
 */
function insightsPulsoDistrito(distritos: PulsoDistrito[], fetchedAt: string): Insight[] {
  const insights: Insight[] = [];
  for (const d of distritos) {
    const activos = d.escenariosActivos.filter((e) => e.modo === 'vivo' && e.confirmado);
    if (activos.length === 0) continue;

    const fuentes = new Set<FuenteInsight>(['010']);
    for (const e of activos) for (const f of FUENTES_POR_ESCENARIO[e.id]) fuentes.add(f);

    const severidad: SeveridadInsight = activos.some((e) => e.nivel === 'prioritario') ? 'urgente' : 'aviso';
    const motivos = activos.map((e) => e.motivo).join(' ');

    insights.push({
      id: `pulso-distrito:${d.distritoCodigo}`,
      tipo: 'pulso-distrito',
      severidad,
      titulo: `Pulso — ${d.distritoNombre} (${activos.length} escenario${activos.length === 1 ? '' : 's'})`,
      descripcion: motivos + (d.notaAire ? ` ${d.notaAire}` : ''),
      protocoloSugerido: {
        asunto: `Pulso de Distrito — ${d.distritoNombre}`,
        cuerpo:
          `${motivos} Se sugiere valorar revisar la situación sobre el terreno o reforzar la regulación en la zona. ` +
          'Dato de origen: Mirall, escenarios de conjunción (spec 010). Revisar y decidir antes de actuar.',
      },
      distritoCodigo: d.distritoCodigo,
      fuenteSpec: [...fuentes],
      detectedAt: d.observedAt,
      fetchedAt,
    });
  }
  return insights;
}

const SEVERIDAD_POR_NIVEL_AVISO: Record<AvisoMeteo['nivel'], SeveridadInsight> = {
  amarillo: 'aviso',
  naranja: 'urgente',
  rojo: 'urgente',
};

/**
 * spec 001 v4 §2 — avisos oficiales de fenómenos adversos (GVA Emergencias e
 * Interior, scraping), uno por aviso vigente. Reutiliza el modal bloqueante
 * ya existente de spec 013 en vez de una UI nueva: es exactamente el "avisa,
 * no actúa" que pide CLAUDE.md §4 para una alerta decretada por un organismo
 * oficial, sin depender de ninguna API key.
 */
function insightsAvisoOficial(avisos: AvisoMeteo[], fetchedAt: string): Insight[] {
  return avisos.map((aviso) => ({
    id: `aviso-oficial-meteo:${aviso.id}`,
    tipo: 'aviso-oficial-meteo' as const,
    severidad: SEVERIDAD_POR_NIVEL_AVISO[aviso.nivel],
    titulo: `Aviso oficial ${aviso.nivel} — ${aviso.titulo}`,
    descripcion: aviso.resumen ?? aviso.titulo,
    protocoloSugerido: {
      asunto: `Aviso oficial ${aviso.nivel} de fenómenos adversos — Comunitat Valenciana`,
      cuerpo:
        `Emergencias e Interior (Generalitat Valenciana) ha activado un aviso nivel ${aviso.nivel}: "${aviso.titulo}". ` +
        `${aviso.resumen ?? ''} Fuente: ${aviso.url}. ` +
        'Dato de origen: sala de prensa de Emergencias e Interior, GVA (Mirall, spec 001). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: ['001'],
    detectedAt: aviso.publicadoEn,
    fetchedAt,
    nivelAvisoOficial: aviso.nivel,
  }));
}

export function calcularInsights(
  meteo: EstadoMeteo,
  aire: CalidadAire,
  distritos: PulsoDistrito[] | null,
  prediccion: PrediccionCortoPlazo | null,
  tramosTrafico: TramoTrafico[] | null = null,
  datosFallas: DatosFallas | null = null,
  tramosTraficoPrevios: TramoTrafico[] | null = null,
  avisosOficiales: AvisoMeteo[] | null = null,
): PanelInsights {
  const fetchedAt = new Date().toISOString();

  const insightsLluvia = prediccion ? insightsLluviaIntensa(prediccion, fetchedAt) : [];

  const insights: Insight[] = [
    insightCalorExtremo(meteo, fetchedAt),
    insightFrioExtremo(meteo, fetchedAt),
    insightVientoFuerte(meteo, fetchedAt),
    insightAireMalaCalidad(aire, fetchedAt),
    ...insightsLluvia,
    ...(avisosOficiales ? insightsAvisoOficial(avisosOficiales, fetchedAt) : []),
    ...(prediccion ? insightsLluviaPrevista(prediccion, fetchedAt) : []),
    ...(distritos ? insightsPulsoDistrito(distritos, fetchedAt) : []),
    ...(tramosTrafico ? insightsTraficoConcentrado(tramosTrafico, distritos, fetchedAt) : []),
    ...(tramosTrafico && datosFallas ? insightsTraficoEnZonaFallas(tramosTrafico, datosFallas, distritos, fetchedAt) : []),
    ...(tramosTrafico ? insightsTraficoEmpeora(tramosTrafico, tramosTraficoPrevios, fetchedAt) : []),
    ...(tramosTrafico ? [insightLluviaMasTrafico(insightsLluvia, tramosTrafico, distritos, fetchedAt)] : []),
  ].filter((insight): insight is Insight => insight !== null);

  return { insights, fetchedAt, source: 'vlc-monitor-insights' };
}
