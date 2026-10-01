// Router único de la API — spec 020 v3 / deploy.
//
// Vercel Hobby limita a 12 el número de funciones por despliegue. En vez de
// una función por endpoint (~18), se despliega ESTA única función, y
// `vercel.json` reescribe `/api/*` -> `/api/router?__p=*`. Delega en los
// handlers, que viven en directorios `api/_<dominio>/` (el prefijo `_` hace
// que Vercel no los trate como funciones). Las URLs públicas no cambian:
// siguen siendo `/api/<dominio>/v1/<recurso>`.
//
// (No se usa `api/[...path].ts`: el enrutado zero-config de Vercel para el
// directorio `api/` genera un catch-all roto que solo casa un segmento.)
//
// Runtime Node (no edge): al empaquetar todos los handlers + sus datos
// (distritos, histórico) el bundle supera el límite de 1 MB del edge en Hobby.
// El límite de body de 4,5 MB no aplica aquí (ninguna respuesta se acerca).

import meteoActual from '../src/server/meteo-actual';
import meteoAvisos from '../src/server/avisos-meteo';
import meteoPrediccion from '../src/server/meteo-prediccion';
import aireActual from '../src/server/aire-actual';
import traficoEstado from '../src/server/trafico-estado';
import traficoHistorico from '../src/server/trafico-historico';
import valenbisiEstaciones from '../src/server/valenbisi-estaciones';
import aparcamientoEstado from '../src/server/aparcamiento-estado';
import pulsoDistrito from '../src/server/pulso-distrito';
import insightsActual from '../src/server/insights-actual';
import fallasActual from '../src/server/fallas-actual';
import mediaticoItems from '../src/server/mediatico-items';
import mediaticoTendencia from '../src/server/mediatico-tendencia';
import viaPublicaIncidencias from '../src/server/via-publica-incidencias';
import geoDistritos from '../src/server/geo-distritos';
import mockDensidad from '../src/server/mock-densidad';
import agendaEventos from '../src/server/agenda-eventos';
import movilidadAvisos from '../src/server/movilidad-avisos';
import meteoZona from '../src/server/meteo-zona';
import pluviometrosSaih from '../src/server/pluviometros-saih';
import altimetriaValencia from '../src/server/altimetria-valencia';
import riesgoEscorrentia from '../src/server/riesgo-escorrentia';
import sintesisIa from '../src/server/sintesis-ia';
import sintesisIaV2 from '../src/server/sintesis-ia-v2';
import avametEstaciones from '../src/server/avamet-estaciones';
import zas from '../src/server/zas';
import equipamientosCriticos from '../src/server/equipamientos-criticos';
import decisionSugerencias from '../src/server/decision-sugerencias';
import authLogin from '../src/server/auth-login';
import authLogout from '../src/server/auth-logout';
import authEstado from '../src/server/auth-estado';

type Handler = (req: Request) => Promise<Response>;

const RUTAS: Record<string, Handler> = {
  'meteo/v1/actual': meteoActual,
  'meteo/v1/avisos': meteoAvisos,
  'meteo/v1/prediccion-corto-plazo': meteoPrediccion,
  'aire/v1/actual': aireActual,
  'trafico/v1/estado': traficoEstado,
  'trafico/v1/historico': traficoHistorico,
  'valenbisi/v1/estaciones': valenbisiEstaciones,
  'aparcamiento/v1/estado': aparcamientoEstado,
  'pulso/v1/distrito': pulsoDistrito,
  'insights/v1/actual': insightsActual,
  'fallas/v1/actual': fallasActual,
  'mediatico/v1/items': mediaticoItems,
  'mediatico/v1/tendencia': mediaticoTendencia,
  'via-publica/v1/incidencias': viaPublicaIncidencias,
  'geo/v1/distritos': geoDistritos,
  'mock/v1/densidad-personas': mockDensidad,
  'agenda/v1/eventos': agendaEventos,
  'movilidad/v1/avisos-incidencias-previsiones': movilidadAvisos,
  'emergencia/v1/meteo-zona': meteoZona,
  'emergencia/v1/pluviometros': pluviometrosSaih,
  'emergencia/v1/altimetria': altimetriaValencia,
  'emergencia/v1/riesgo-escorrentia': riesgoEscorrentia,
  'sintesis/v1/actual': sintesisIa,
  'sintesis/v2/actual': sintesisIaV2,
  'emergencia/v1/avamet': avametEstaciones,
  'emergencia/v1/zas': zas,
  'emergencia/v1/equipamientos-criticos': equipamientosCriticos,
  'decision/v1/sugerencias': decisionSugerencias,
  'auth/v1/login': authLogin,
  'auth/v1/logout': authLogout,
  'auth/v1/estado': authEstado,
};

const BASE = 'http://d.invalid';

async function dispatch(req: Request): Promise<Response> {
  // En el runtime Node de Vercel, `req.url` es una ruta relativa; en edge y en
  // el dev server es absoluta. Normalizamos con una base ficticia.
  const url = new URL(req.url, BASE);

  // En producción la ruta llega vía rewrite de vercel.json en `__p`; en dev y
  // como fallback se saca del propio pathname.
  const cruda = url.searchParams.get('__p') ?? url.pathname.replace(/^\/api\//, '');
  const ruta = cruda.replace(/^\/+/, '').replace(/\/+$/, '');

  const h = RUTAS[ruta];
  if (!h) {
    return new Response(JSON.stringify({ error: `Ruta de API no encontrada: ${ruta}` }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // Se reconstruye la Request con URL absoluta y la ruta real (sin los params
  // internos del router), para que cada handler haga `new URL(req.url)` sin
  // romperse y vea sus propios query params.
  const urlReal = new URL(`/api/${ruta}`, BASE);
  for (const [k, v] of url.searchParams) {
    if (k !== '__p' && k !== 'path') urlReal.searchParams.set(k, v);
  }
  const reqReal = new Request(urlReal, req);
  return h(reqReal);
}

// Vercel (runtime Node) ignora el valor devuelto por `export default` (lo trata
// como `(req, res) => void`). Para usar el estilo Web `Request -> Response` hay
// que exportar métodos HTTP con nombre.
export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
export const HEAD = dispatch;
export const OPTIONS = dispatch;
