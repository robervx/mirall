// GET /api/emergencia/v1/equipamientos-criticos — spec 054 §4. Sirve el
// asset estático versionado (data/equipamientos-criticos.json, generado por
// scripts/seed-equipamientos-criticos.ts) — nunca llama al geoportal en el
// momento de la petición, mismo patrón que geo-distritos.ts.
import type { EquipamientoCritico } from '../services/equipamientos-criticos';
import equipamientos from '../../data/equipamientos-criticos.json' with { type: 'json' };

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  return new Response(JSON.stringify({ equipamientos: equipamientos as EquipamientoCritico[] }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Baja frecuencia de cambio (ver spec 054 §4) — cacheable de forma agresiva, igual que distritos.
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
