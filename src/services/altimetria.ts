/**
 * Altimetría de Valencia por distrito — spec 044 §2/§4. Fuente: IGN
 * (Instituto Geográfico Nacional), servicio WMS INSPIRE del Modelo Digital
 * del Terreno (`servicios.idee.es/wms-inspire/mdt`, capa
 * `EL.ElevationGridCoverage`) — datos geográficos oficiales de libre
 * reutilización. Verificado en vivo el 2026-09-17 con `GetFeatureInfo` en
 * varios puntos reales de Valencia (resultados coherentes con la topografía
 * conocida de la ciudad: 0-30 m, prácticamente plana).
 *
 * Dato **estático** (la altimetría no cambia) — se seedea una sola vez
 * (`scripts/seed-altimetria.ts`), igual que el grafo viario de spec 020, no
 * es un pipeline con caché/TTL.
 */

export interface MuestraElevacion {
  lat: number;
  lon: number;
  elevacionM: number;
  distritoCodigo: string;
}

export interface ResumenAltimetriaDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  elevacionMinM: number;
  elevacionMaxM: number;
  elevacionMediaM: number;
  muestras: number;
}

/** Sentinel NODATA real que devuelve el WMS del IGN sobre mar/zonas sin cobertura (verificado en vivo). */
export const NODATA_IGN = -32767;

// Spec 052 v2 — paso real de la rejilla que consulta `scripts/seed-altimetria.ts`
// al WMS del IGN (~600 m). Única fuente de verdad de estas dos constantes:
// el script las usa para generar la rejilla de consulta y `celdaCuadrada`
// (más abajo) las usa para dibujar, en el cliente, una celda del mismo
// tamaño alrededor de cada punto — así la celda pintada coincide con el
// área real que representa la muestra, sin hueco ni solape entre celdas
// contiguas de la rejilla.
export const PASO_LAT_REJILLA = 0.0054;
export const PASO_LON_REJILLA = 0.007;

/**
 * Celda cuadrada (GeoJSON Polygon) centrada en (lat, lon) con el tamaño de
 * la rejilla real del IGN — la unidad de dibujo de la capa de mapa (spec
 * 052 v2 §5): en vez de un choropleth de 19 distritos, una "alfombra" de
 * ~198 celdas reales sin espacios entre sí.
 */
export function celdaCuadrada(lat: number, lon: number): GeoJSON.Polygon {
  const dLat = PASO_LAT_REJILLA / 2;
  const dLon = PASO_LON_REJILLA / 2;
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

/**
 * Convierte la rejilla de puntos reales (`data/altimetria-puntos.json`) en
 * un `FeatureCollection` de celdas cuadradas listo para un `GeoJsonLayer` —
 * función pura, sin I/O, igual que `resumenAltimetriaPorDistrito` (mismo
 * criterio que `generarHotspotsDensidadMock`, spec 003 §2: cálculo
 * determinista en cliente, no hace falta un endpoint que lo precalcule).
 */
export function featureCollectionAltimetriaPuntos(
  puntos: MuestraElevacion[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon, { elevacionM: number; distritoCodigo: string }> {
  return {
    type: 'FeatureCollection',
    features: puntos.map((p) => ({
      type: 'Feature',
      geometry: celdaCuadrada(p.lat, p.lon),
      properties: { elevacionM: p.elevacionM, distritoCodigo: p.distritoCodigo },
    })),
  };
}

/** Agrupa muestras de elevación ya resueltas por distrito y calcula min/max/media. */
export function resumenAltimetriaPorDistrito(
  muestras: MuestraElevacion[],
  nombrePorCodigo: Map<string, string>,
): ResumenAltimetriaDistrito[] {
  const porDistrito = new Map<string, number[]>();
  for (const m of muestras) {
    if (m.elevacionM === NODATA_IGN) continue;
    const arr = porDistrito.get(m.distritoCodigo) ?? [];
    arr.push(m.elevacionM);
    porDistrito.set(m.distritoCodigo, arr);
  }
  return [...porDistrito.entries()]
    .map(([codigo, valores]) => ({
      distritoCodigo: codigo,
      distritoNombre: nombrePorCodigo.get(codigo) ?? codigo,
      elevacionMinM: Math.min(...valores),
      elevacionMaxM: Math.max(...valores),
      elevacionMediaM: valores.reduce((a, b) => a + b, 0) / valores.length,
      muestras: valores.length,
    }))
    .sort((a, b) => b.elevacionMediaM - a.elevacionMediaM);
}
