/**
 * Contrato y normalización de la spec 055 (specs/055-emt-buses-en-vivo.md §3).
 * Fuente: Geoportal ArcGIS del Ayuntamiento (sin API key), capa
 * OPENDATA/Trafico/MapServer/226 ("Paradas EMT") — dato estático (seed único,
 * mismo patrón que equipamientos-criticos.ts).
 */

export interface ParadaEmt {
  id: string;
  nombre: string;
  lineas: string[];
  lat: number;
  lon: number;
  fetchedAt: string;
  source: 'geoportal-valencia-emt-paradas';
}

export interface ArcGisParadaFeature {
  attributes: {
    id_parada: number | null;
    denominacion: string | null;
    lineas: string | null;
    suprimida: number | null;
  };
  geometry: { x: number; y: number } | null;
}

export function normalizarParadasEmt(features: ArcGisParadaFeature[], fetchedAt: string): ParadaEmt[] {
  return features
    .filter(
      (f): f is ArcGisParadaFeature & { geometry: { x: number; y: number }; attributes: { id_parada: number; denominacion: string; lineas: string | null; suprimida: number } } =>
        f.geometry !== null && f.attributes.id_parada !== null && f.attributes.denominacion !== null && f.attributes.suprimida !== 1,
    )
    .map((f) => ({
      id: String(f.attributes.id_parada),
      nombre: f.attributes.denominacion,
      lineas: (f.attributes.lineas ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      lat: f.geometry.y,
      lon: f.geometry.x,
      fetchedAt,
      source: 'geoportal-valencia-emt-paradas' as const,
    }));
}
