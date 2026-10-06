// GET /api/transporte/v1/emt-paradas — spec 055 §4. Sirve el asset estático
// versionado (data/emt-paradas.json, generado por scripts/seed-emt-paradas.ts)
// — nunca llama al geoportal en el momento de la petición, mismo patrón que
// equipamientos-criticos.ts.
import type { ParadaEmt } from '../services/emt-paradas';
import paradas from '../../data/emt-paradas.json' with { type: 'json' };

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify({ paradas: paradas as ParadaEmt[] }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Baja frecuencia de cambio (ver spec 055 §4) — cacheable de forma agresiva, igual que equipamientos críticos.
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
