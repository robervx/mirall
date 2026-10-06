/**
 * Contrato y normalización de la spec 055 (specs/055-emt-buses-en-vivo.md §3).
 * Fuente: Geoportal ArcGIS del Ayuntamiento (sin API key), capa agregada
 * EMT/Seguimiento_EMT/MapServer/384 ("Buses EMT") — posición GPS en vivo de
 * todos los autobuses en circulación, todas las líneas a la vez.
 */

export interface BusEmt {
  id: string;
  linea: string;
  trayecto: string;
  lat: number;
  lon: number;
  observedAt: string;
  fetchedAt: string;
  source: 'ajuntament-valencia-geoportal';
}

interface ArcGisBusFeature {
  attributes: {
    gid: number | null;
    linea: string | null;
    trayecto: string | null;
    fecha: number | null;
  };
  geometry: { x: number; y: number } | null;
}

interface ArcGisBusResponse {
  features?: ArcGisBusFeature[];
  error?: { message: string };
}

const GEOPORTAL_EMT_BUSES_URL =
  'https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer/384/query?where=1=1&outFields=gid,linea,trayecto,fecha&outSR=4326&f=json';

export async function fetchBusesEmt(): Promise<BusEmt[]> {
  const res = await fetch(GEOPORTAL_EMT_BUSES_URL, {
    headers: { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' },
  });
  if (!res.ok) {
    throw new Error(`Geoportal (EMT buses) respondió HTTP ${res.status}`);
  }
  const body = (await res.json()) as ArcGisBusResponse;

  // Mismo caso real ya documentado en valenbisi.ts/trafico.ts: el Geoportal a
  // veces responde HTTP 200 con un cuerpo de error del propio ArcGIS Server.
  if (body.error) {
    throw new Error(`Geoportal (EMT buses) devolvió un error de ArcGIS: ${body.error.message}`);
  }
  if (!Array.isArray(body.features)) {
    throw new Error('Geoportal (EMT buses) respondió sin "features" — posible incidencia del servicio');
  }

  const fetchedAt = new Date().toISOString();

  return body.features
    .filter(
      (
        f,
      ): f is ArcGisBusFeature & {
        geometry: { x: number; y: number };
        attributes: { gid: number; linea: string; trayecto: string; fecha: number };
      } =>
        f.geometry !== null &&
        f.attributes.gid !== null &&
        f.attributes.linea !== null &&
        f.attributes.trayecto !== null &&
        f.attributes.fecha !== null,
    )
    .map((f) => ({
      id: String(f.attributes.gid),
      linea: f.attributes.linea,
      trayecto: f.attributes.trayecto,
      lat: f.geometry.y,
      lon: f.geometry.x,
      observedAt: new Date(f.attributes.fecha).toISOString(),
      fetchedAt,
      source: 'ajuntament-valencia-geoportal' as const,
    }));
}
