/**
 * Interpolación espacial IDW (Inverse Distance Weighting) para dibujar una
 * superficie de color continua por debajo de las insignias de temperatura
 * (spec 050 v4) y precipitación (spec 051 v4) — petición explícita del
 * usuario (2026-10-01): "una superficie de color que permita ver en qué
 * zonas hay más calor/precipitación", igual que la tinta hipsométrica de
 * altimetría (spec 052 v2).
 *
 * Diferencia honesta con spec 052: la altimetría interpola sobre ~198
 * muestras REALES del IGN en una rejilla regular de ~600 m — cada celda
 * pintada es una medición real. Aquí solo hay ~13-15 estaciones AVAMET
 * reales y dispersas de forma muy irregular (ver verificación en vivo,
 * 2026-10-01: de 650 m entre estaciones vecinas en el casco urbano a más de
 * 4.8 km para la estación de Carpesa, aislada al norte). Esto NO es una
 * rejilla de datos medidos: es una estimación calculada (IDW, Shepard 1968)
 * a partir de esos puntos reales, y se presenta como tal en la leyenda
 * (nunca como si tuviera la resolución de 052).
 *
 * Para no extrapolar donde no hay cobertura real (CLAUDE.md §4 + honestidad
 * ya aplicada en spec 050/051 §7), cada celda de la rejilla de salida se
 * descarta si la estación real más cercana queda a más de
 * `DISTANCIA_MAXIMA_INTERPOLACION_M`. Con los datos reales verificados esto
 * deja islas de cobertura alrededor de cada estación/clúster de estaciones
 * — Carpesa, o el Saler/l'Albufera (separadas ~9-11 km del resto), no
 * quedan unidas por un degradado ficticio al resto de la ciudad.
 */
import { distanciaMetros } from './proximidad';

export interface EstacionInterpolable {
  lat: number;
  lon: number;
  valor: number;
}

export interface CeldaInterpolada {
  lat: number;
  lon: number;
  valor: number;
  distanciaEstacionMasCercanaM: number;
}

export interface OpcionesRejillaInterpolada {
  pasoLat: number;
  pasoLon: number;
  /** Radio máximo (metros) a la estación real más cercana — más allá, la celda se descarta, no se extrapola. */
  distanciaMaximaM: number;
  /** Potencia de la ponderación IDW (Shepard 1968 usa 2 — por defecto). */
  potencia?: number;
}

const POTENCIA_IDW_DEFECTO = 2;
const METROS_POR_GRADO_LAT = 111_320;

function metrosAGradosLat(m: number): number {
  return m / METROS_POR_GRADO_LAT;
}

function metrosAGradosLon(m: number, latGrados: number): number {
  const cosLat = Math.cos((latGrados * Math.PI) / 180) || 1;
  return m / (METROS_POR_GRADO_LAT * cosLat);
}

/**
 * Valor interpolado en (lat, lon) a partir de estaciones reales — media
 * ponderada por 1/distancia^potencia (IDW, Shepard 1968). Si (lat, lon)
 * coincide con una estación real (distancia < 1 m), devuelve su valor
 * exacto en vez de dividir por ~0 (defensa, no se ha visto en los datos
 * reales de AVAMET pero se cubre, mismo criterio que
 * `avamet-estaciones.ts`/`altimetria.ts`).
 */
export function valorIdw(
  estaciones: EstacionInterpolable[],
  lat: number,
  lon: number,
  potencia: number = POTENCIA_IDW_DEFECTO,
): { valor: number; distanciaMasCercanaM: number } {
  let sumaPesos = 0;
  let sumaPesoValor = 0;
  let distanciaMasCercanaM = Infinity;
  for (const e of estaciones) {
    const d = distanciaMetros([lon, lat], [e.lon, e.lat]);
    if (d < distanciaMasCercanaM) distanciaMasCercanaM = d;
    if (d < 1) {
      return { valor: e.valor, distanciaMasCercanaM: 0 };
    }
    const peso = 1 / d ** potencia;
    sumaPesos += peso;
    sumaPesoValor += peso * e.valor;
  }
  return {
    valor: sumaPesos > 0 ? sumaPesoValor / sumaPesos : 0,
    distanciaMasCercanaM,
  };
}

/**
 * Genera una rejilla regular de celdas interpoladas sobre el área cubierta
 * por las estaciones reales (su bbox + un margen igual a
 * `distanciaMaximaM`), descartando las celdas que queden más lejos de esa
 * distancia de cualquier estación real — sin estaciones no hay rejilla
 * (`[]`, no un error).
 */
export function rejillaInterpolada(estaciones: EstacionInterpolable[], opciones: OpcionesRejillaInterpolada): CeldaInterpolada[] {
  if (estaciones.length === 0) return [];
  const { pasoLat, pasoLon, distanciaMaximaM, potencia = POTENCIA_IDW_DEFECTO } = opciones;
  const lats = estaciones.map((e) => e.lat);
  const lons = estaciones.map((e) => e.lon);
  const latCentral = lats.reduce((a, b) => a + b, 0) / lats.length;
  const margenLat = metrosAGradosLat(distanciaMaximaM);
  const margenLon = metrosAGradosLon(distanciaMaximaM, latCentral);
  const latMin = Math.min(...lats) - margenLat;
  const latMax = Math.max(...lats) + margenLat;
  const lonMin = Math.min(...lons) - margenLon;
  const lonMax = Math.max(...lons) + margenLon;

  const celdas: CeldaInterpolada[] = [];
  for (let lat = latMin; lat <= latMax; lat += pasoLat) {
    for (let lon = lonMin; lon <= lonMax; lon += pasoLon) {
      const { valor, distanciaMasCercanaM } = valorIdw(estaciones, lat, lon, potencia);
      if (distanciaMasCercanaM > distanciaMaximaM) continue;
      celdas.push({ lat, lon, valor, distanciaEstacionMasCercanaM: distanciaMasCercanaM });
    }
  }
  return celdas;
}

/** Celda cuadrada (GeoJSON Polygon) centrada en (lat, lon) del tamaño de paso dado — mismo patrón que `celdaCuadrada` de altimetria.ts, con paso propio (no el de la rejilla del IGN). */
export function celdaCuadradaInterpolada(lat: number, lon: number, pasoLat: number, pasoLon: number): GeoJSON.Polygon {
  const dLat = pasoLat / 2;
  const dLon = pasoLon / 2;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon - dLon, lat - dLat],
        [lon + dLon, lat - dLat],
        [lon + dLon, lat + dLat],
        [lon - dLon, lat + dLat],
        [lon - dLon, lat - dLat],
      ],
    ],
  };
}

/** Convierte la rejilla interpolada en un `FeatureCollection` listo para un `GeoJsonLayer` — función pura, igual criterio que `featureCollectionAltimetriaPuntos`. */
export function featureCollectionInterpolada(
  celdas: CeldaInterpolada[],
  pasoLat: number,
  pasoLon: number,
): GeoJSON.FeatureCollection<GeoJSON.Polygon, { valor: number; distanciaEstacionMasCercanaM: number }> {
  return {
    type: 'FeatureCollection',
    features: celdas.map((c) => ({
      type: 'Feature',
      geometry: celdaCuadradaInterpolada(c.lat, c.lon, pasoLat, pasoLon),
      properties: { valor: c.valor, distanciaEstacionMasCercanaM: c.distanciaEstacionMasCercanaM },
    })),
  };
}

// Spec 050/051 v4 — constantes compartidas por las dos capas (temperatura y
// precipitación comparten estaciones, geometría y radio de cobertura; solo
// cambia el color). Paso de rejilla ~250 m (visualmente suave sin generar
// miles de celdas); radio de cobertura 2.5 km, elegido a partir del
// espaciado real entre estaciones verificado en vivo el 2026-10-01: conecta
// los pares de estaciones vecinas del casco urbano (650 m - ~2 km típico, el
// salto más grande "razonable" dentro del clúster es 2.46 km entre el
// Saler y Tancat de la Pipa, ambas en l'Albufera) sin tender un puente
// ficticio hacia estaciones realmente aisladas (Carpesa, a 4.8 km de la más
// cercana).
export const PASO_LAT_INTERPOLACION = 0.00225; // ~250 m
export const PASO_LON_INTERPOLACION = 0.0029; // ~250 m a la latitud de Valencia (cos 39.47° ≈ 0.772)
export const DISTANCIA_MAXIMA_INTERPOLACION_M = 2500;
