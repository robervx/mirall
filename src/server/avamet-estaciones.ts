// GET /api/emergencia/v1/avamet — spec 044 v4. Estaciones reales de AVAMET
// dentro de Valencia ciudad (temperatura, humedad, viento y precipitación
// por zona) — caché con TTL de 15 min, igual que el resto de fuentes
// meteorológicas de este repo (spec 001). El array `data` viene embebido en
// el HTML de `mxo-mxo.php?territori=c15` (sin autenticación, sin API JSON
// separada) — verificado en vivo el 2026-09-17.
import { getOrFetch } from './_shared/cache';
import { normalizarEstacionesAvamet, type EstacionAvametCruda, type EstacionAvamet } from '../services/avamet-estaciones';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'emergencia:avamet-estaciones:v1';
const TTL_MS = 15 * 60 * 1000;
const AVAMET_URL = 'https://www.avamet.org/mxo-mxo.php?territori=c15';
const USER_AGENT = 'vlc-monitor-emergencia-bot/1.0 (+https://github.com/robervx/mirall)';

async function fetchEstacionesAvamet(): Promise<EstacionAvamet[]> {
  const res = await fetch(AVAMET_URL, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`avamet.org respondió HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/var data = (\[.*?\]);/);
  if (!m) throw new Error('No se encontró el array "data" en el HTML de avamet.org (estructura cambiada)');
  const crudas = JSON.parse(m[1]!) as EstacionAvametCruda[];
  return normalizarEstacionesAvamet(crudas);
}

export default async function handler(): Promise<Response> {
  try {
    const { value: estaciones, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchEstacionesAvamet);
    return new Response(JSON.stringify({ estaciones, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=900',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
