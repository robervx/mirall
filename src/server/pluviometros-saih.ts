// GET /api/emergencia/v1/pluviometros — spec 044 §4. Llama a saih.chj.es a
// través de la caché con TTL de 15 min (mismo TTL que spec 001, la lluvia
// cambia rápido mientras llueve). El array `estaciones` viene embebido en el
// HTML de `saih.chj.es/mapa-lluvias` (verificado en vivo el 2026-09-17, sin
// autenticación) — no hay JSON API separada, así que se extrae con una
// expresión regular sobre el `<script>` que lo declara.
import { getOrFetch } from './_shared/cache';
import { normalizarPluviometrosSaih, type EstacionSaihCruda, type PluviometroSaih } from '../services/pluviometros-saih';

export const config = { runtime: 'edge' };

const CACHE_KEY = 'emergencia:pluviometros-saih:v1';
const TTL_MS = 15 * 60 * 1000;
const SAIH_URL = 'https://saih.chj.es/mapa-lluvias';
const USER_AGENT = 'vlc-monitor-emergencia-bot/1.0 (+https://github.com/robervx/mirall)';

async function fetchPluviometros(): Promise<PluviometroSaih[]> {
  const res = await fetch(SAIH_URL, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`saih.chj.es respondió HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/let estaciones = (\[.*?\]);/);
  if (!m) throw new Error('No se encontró el array "estaciones" en el HTML de saih.chj.es (estructura cambiada)');
  const crudas = JSON.parse(m[1]!) as EstacionSaihCruda[];
  return normalizarPluviometrosSaih(crudas);
}

export default async function handler(): Promise<Response> {
  try {
    const { value: estaciones, fresh } = await getOrFetch(CACHE_KEY, TTL_MS, fetchPluviometros);
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
