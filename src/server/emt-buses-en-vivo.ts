// GET /api/transporte/v1/emt-buses — spec 055 §4. Llama al Geoportal a través
// de la caché con TTL de 20 s (stale-on-error) — cadencia medida en vivo
// contra la fuente real (cada bus actualiza su posición cada 15-20 s).
import { getOrFetch } from './_shared/cache';
import { fetchBusesEmt } from '../services/emt-buses';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'emt:valencia-buses:v1';
const TTL_MS = 20 * 1000;

export default async function handler(): Promise<Response> {
  try {
    const { value: buses, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchBusesEmt);
    return new Response(JSON.stringify({ buses, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=10, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
