// Gate de acceso — ver specs/018-acceso-protegido-dominio.md §4.
//
// Vercel Edge Middleware (framework-agnóstico): se ejecuta en el edge antes de
// servir cualquier ruta que encaje con `config.matcher`. Sin cookie de sesión
// válida:
//   - petición de navegación (Accept: text/html) → sirve la pantalla de login
//     en la MISMA URL, status 200, sin redirect (no ensucia el historial).
//   - petición a /api/*  → 401 JSON.
//
// Se excluyen del matcher: los assets que necesita la propia pantalla de login
// (/assets/*), los assets PWA (spec 028) y /api/auth/* (login/logout/estado).

import { verificarSesion, leerCookie, COOKIE_NOMBRE } from './src/server/_shared/auth';
import { paginaLogin } from './src/server/_shared/pagina-login';

export const config = {
  // Se dejan pasar sin gate: los assets del build, los iconos y ficheros PWA
  // (manifest, service worker, runtime de Workbox) y los endpoints de auth.
  matcher: [
    '/((?!assets/|icons/|data/|favicon|robots\\.txt|manifest\\.webmanifest|sw\\.js|workbox-|registerSW\\.js|api/auth/).*)',
  ],
};

// Spec 053: la landing y la página de proceso son contenido de presentación,
// no la herramienta — quedan siempre públicas aunque el despliegue tenga el
// gate activo (AUTH_SECRET). El gate solo protege /mapa.
const RUTAS_PUBLICAS = new Set(['/', '/proceso', '/proceso/', '/proceso/index.html']);

export default async function middleware(request: Request): Promise<Response | undefined> {
  const secret = process.env.AUTH_SECRET;
  const pathname = new URL(request.url).pathname;
  const esApi = pathname.startsWith('/api/');

  if (RUTAS_PUBLICAS.has(pathname)) return undefined;

  // Spec 030 / ADR-002: el gate es OPCIONAL. Sin AUTH_SECRET, la app se sirve
  // abierta (repo público / demo). Con AUTH_SECRET + APP_USERS, queda tras el
  // gate (despliegues privados).
  if (!secret) return undefined;

  const token = leerCookie(request.headers.get('cookie'), COOKIE_NOMBRE);
  const sesion = await verificarSesion(token, secret);
  if (sesion) return undefined; // sesión válida → deja pasar

  return respuestaNoAutenticado(esApi);
}

function respuestaNoAutenticado(esApi: boolean, mensaje = 'no autenticado'): Response {
  if (esApi) {
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(paginaLogin(), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
