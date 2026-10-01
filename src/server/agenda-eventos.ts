// GET /api/agenda/v1/eventos — endpoint definido en
// specs/027-agenda-eventos-scraping.md §4. Sin llamada de red ni caché
// propia: lee el snapshot ya escrito por scripts/scrape-agenda-eventos.ts
// (bundleado en build time, mismo patrón que data/trafico-historico.json de
// spec 017).
//
// Filtro de vigencia en cada petición (bug real corregido 2026-10-01, ver
// memoria de proyecto): el snapshot scrapeado nunca "caduca" sus propios
// eventos — sin este filtro, un evento ya pasado se quedaba visible en
// /inteligencia hasta el siguiente scrape (hasta 6h, spec 027 §4 cron).
import { eventosVigentes, type SnapshotAgenda } from '../services/agenda-eventos';
import snapshot from '../../data/agenda-eventos.json' with { type: 'json' };

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  const bruto = snapshot as SnapshotAgenda;
  const datos: SnapshotAgenda = { ...bruto, eventos: eventosVigentes(bruto.eventos, Date.now()) };

  return new Response(JSON.stringify(datos), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=600, stale-while-revalidate=3600',
    },
  });
}
