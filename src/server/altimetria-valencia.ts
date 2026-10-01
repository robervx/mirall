// GET /api/emergencia/v1/altimetria — spec 044 §4 / spec 052 v2 §3. Dato
// estático (seedeado una sola vez con `npm run seed:altimetria`, fuente
// IGN) — sin llamada de red ni caché propia, igual que
// data/distritos-valencia.json.
//
// Spec 052 v2: además del resumen por distrito (ya existía), sirve también
// la rejilla de puntos reales (`puntos`, ~198 muestras a ~600 m de paso) que
// antes calculaba el seed y descartaba — la usa la capa de mapa de
// altimetría para pintar una rejilla real en vez de un choropleth de 19
// distritos (ver src/services/altimetria.ts `featureCollectionAltimetriaPuntos`).
import type { MuestraElevacion, ResumenAltimetriaDistrito } from '../services/altimetria';
import altimetria from '../../data/altimetria-valencia.json' with { type: 'json' };
import altimetriaPuntos from '../../data/altimetria-puntos.json' with { type: 'json' };

export const config = { runtime: 'edge' };

export default async function handler(): Promise<Response> {
  return new Response(
    JSON.stringify({
      distritos: altimetria as ResumenAltimetriaDistrito[],
      puntos: altimetriaPuntos as MuestraElevacion[],
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    },
  );
}
