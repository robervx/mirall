import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { MARCA } from './src/config/marca';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(rootDir, 'api');
const serverDir = path.join(rootDir, 'src/server');

/**
 * Réplica local, para `npm run dev`, del router de API que en producción es una
 * única función (`api/router.js`, bundle de `api/_router-src.ts`). Traduce
 * IncomingMessage/ServerResponse de Node a la Fetch API y delega en el mismo
 * router (handlers en `src/server/`, estilo web `Request -> Response`).
 *
 * No sustituye al runtime real de Vercel — solo evita tener que desplegar para
 * probar la API. Ver CLAUDE.md §6 (arquitectura) y §2 (el frontend siempre
 * habla con /api/..., nunca con la fuente externa).
 */
function apiDevPlugin(): Plugin {
  return {
    name: 'vlc-monitor-api-dev',
    configureServer(server: ViteDevServer) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }

        const url = new URL(req.url, 'http://localhost');

        try {
          // En producción, Vercel reescribe /api/* -> /api/router (una función, por el
          // límite de 12 de Hobby). En dev delegamos en el mismo router.
          const mod = await server.ssrLoadModule(path.join(apiDir, '_router-src.ts'));
          const handler = mod.GET ?? mod.default;
          if (typeof handler !== 'function') {
            next();
            return;
          }

          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
            duplex: hasBody ? 'half' : undefined,
          } as RequestInit);

          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          next(err instanceof Error ? err : new Error(String(err)));
        }
      };

      server.middlewares.use(middleware);
    },
  };
}

/**
 * Réplica local del gate de `middleware.ts` (spec 018) para `npm run dev`.
 * Vite no ejecuta el Edge Middleware de Vercel, así que sin esto el gate no
 * se puede verificar en local. Solo se activa si `AUTH_SECRET` está definido
 * — sin esa variable, `npm run dev` sigue funcionando sin barrera. Igual que
 * en producción: el gate (spec 018) es opcional y solo se activa con
 * `AUTH_SECRET` + `APP_USERS` (ADR-002).
 */
function authDevPlugin(): Plugin {
  return {
    name: 'vlc-monitor-auth-dev',
    configureServer(server: ViteDevServer) {
      const authModule = path.join(serverDir, '_shared/auth.ts');
      const loginModule = path.join(serverDir, '_shared/pagina-login.ts');

      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        const secret = process.env.AUTH_SECRET;
        if (!secret) {
          next();
          return;
        }

        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        const esRutaApp = pathname === '/mapa' || pathname === '/mapa/' || pathname === '/mapa/index.html';
        const esApiProtegida = pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/');
        if (!esRutaApp && !esApiProtegida) {
          next();
          return;
        }

        try {
          const { verificarSesion, leerCookie, COOKIE_NOMBRE } = await server.ssrLoadModule(authModule);
          const token = leerCookie(req.headers.cookie, COOKIE_NOMBRE);
          const sesion = await verificarSesion(token, secret);
          if (sesion) {
            next();
            return;
          }
          if (esApiProtegida) {
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'no autenticado' }));
            return;
          }
          const { paginaLogin } = await server.ssrLoadModule(loginModule);
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(paginaLogin());
        } catch (err) {
          next(err instanceof Error ? err : new Error(String(err)));
        }
      };

      server.middlewares.use(middleware);
    },
  };
}

/**
 * En `npm run dev` la raíz sirve la landing pública (spec 053) — correcto en
 * producción (`publico`, el único despliegue real en Vercel), pero `master`
 * es la línea de trabajo interna (ADR-007) y quien arranca el dev server
 * aquí quiere la herramienta operativa, no la landing. Redirección solo de
 * servidor de desarrollo (`configureServer`, no afecta a `vite build` ni a
 * `vite preview`, que sirve el build real): `/` exacto → `/mapa/`. `/proceso`
 * y el resto de rutas siguen igual.
 */
function devMapaPorDefectoPlugin(): Plugin {
  return {
    name: 'vlc-monitor-dev-mapa-por-defecto',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (pathname === '/' || pathname === '/index.html') {
          res.statusCode = 302;
          res.setHeader('location', '/mapa/');
          res.end();
          return;
        }
        next();
      });
    },
  };
}

/**
 * PWA — spec 028. Manifest + service worker (Workbox vía generateSW).
 * `registerType: 'prompt'`: nunca recarga sola, muestra un aviso (src/pwa.ts).
 * `devOptions.enabled: false`: en `npm run dev` no se registra ningún SW.
 */
function pwaPlugin(): Plugin[] {
  return VitePWA({
    registerType: 'prompt',
    includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32.png', 'assets/logo.png'],
    manifest: {
      name: MARCA.nombre,
      short_name: MARCA.nombre,
      description: `${MARCA.descriptor} — movilidad, meteo, aire, eventos e incidencias de València.`,
      lang: 'es',
      start_url: '/mapa/',
      scope: '/mapa/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#0b1f33',
      theme_color: '#0b1f33',
      categories: ['utilities', 'navigation'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // El shell (index.html) NO se precachea: la navegación va por NetworkFirst
      // (abajo) para que el gate de acceso (spec 018) decida en cada carga si
      // sirve la app o la pantalla de login. El precache solo lleva los assets.
      globPatterns: ['**/*.{js,css,svg,woff2}'],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // Nunca cachear autenticación ni la pantalla de login.
          urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/auth/'),
          handler: 'NetworkOnly',
        },
        {
          // Navegación: red primero (recoge login/app según sesión y versiones
          // nuevas); si no hay red, sirve la última carga buena.
          urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'mirall-shell',
            networkTimeoutSeconds: 3,
            expiration: { maxEntries: 2 },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // Datos: pinta al instante desde caché y refresca en segundo plano.
          // Un 401 NO se cachea (statuses: [200]) y se propaga al frontend.
          urlPattern: ({ url }: { url: URL }) => /^\/api\/.+\/v1\//.test(url.pathname),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'mirall-datos',
            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
            cacheableResponse: { statuses: [200] },
          },
        },
        // Nota: NO se intercepta OpenFreeMap (tiles del mapa base). Enrutar sus
        // respuestas por el SW —aunque sea NetworkOnly— dejaba el mapa base en
        // blanco en producción (el worker de MapLibre GL lee las teselas
        // vectoriales de un modo que no tolera el paso por Cache/respondWith).
        // Sin regla, el navegador las sirve nativamente. El offline de teselas
        // del área ya vista queda como fast-follow con verificación propia.
      ],
    },
    devOptions: { enabled: false },
  }) as Plugin[];
}

// Config mínima de arranque (fase F0), ampliada en la spec 000 con el plugin
// de API, en la spec 018 con el gate de acceso local y en la 028 con la PWA.
export default defineConfig(({ mode }) => {
  // En dev, propaga a process.env las variables de servidor definidas en .env,
  // para que tanto el gate local (authDevPlugin) como las funciones de api/
  // — que leen process.env directamente, igual que en Vercel — las vean.
  // Vite solo expone al cliente las VITE_*; estas nunca llegan al bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const clave of ['AUTH_SECRET', 'APP_USERS', 'GOOGLE_GENERATIVE_AI_API_KEY', 'DATABASE_URL']) {
    if (env[clave] && !process.env[clave]) process.env[clave] = env[clave];
  }

  return {
    plugins: [devMapaPorDefectoPlugin(), authDevPlugin(), apiDevPlugin(), ...pwaPlugin()],
    server: {
      port: Number(process.env.DEV_PORT) || 3000,
    },
    // Multi-página (spec 053): landing en la raíz, la herramienta operativa en
    // /mapa, la página de proceso en /proceso. Sin esto el build solo emite
    // index.html (comportamiento por defecto de Vite de una sola página).
    build: {
      rollupOptions: {
        input: {
          landing: path.join(rootDir, 'index.html'),
          mapa: path.join(rootDir, 'mapa/index.html'),
          proceso: path.join(rootDir, 'proceso/index.html'),
        },
      },
    },
    // maplibre-gl v6 localiza su worker con `new URL(..., import.meta.url)` +
    // `new Worker(url, {type:'module'})`, relativo a su propio módulo. El dep
    // optimizer de Vite prebundlea maplibre-gl en un único fichero bajo
    // .vite/deps/ (esa URL relativa deja de apuntar a nada real) — el mapa
    // nunca pinta nada. Excluirlo del optimizador hace que Vite sirva el
    // paquete tal cual está en node_modules/, con el worker al lado donde
    // MapLibre lo espera.
    optimizeDeps: { exclude: ['maplibre-gl'] },
    worker: { format: 'es' },
  };
});
