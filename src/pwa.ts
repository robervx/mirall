// PWA — registro del service worker + aviso de actualización + reacción a 401.
// Ver specs/028-pwa-instalable-offline.md.
import { registerSW } from 'virtual:pwa-register';

/** Llamar una vez, al principio de main(). */
export function initPwa(): void {
  interceptar401();

  // El SW solo existe en el build (devOptions.enabled: false). En `npm run dev`
  // no hay nada que registrar.
  if (import.meta.env.DEV) return;

  const actualizar = registerSW({
    onNeedRefresh() {
      mostrarAvisoActualizacion(() => {
        void actualizar(true);
      });
    },
  });
}

/**
 * Spec 028 §3: si un endpoint de datos responde 401 (sesión caducada), el
 * frontend recarga para que el gate (spec 018) sirva la pantalla de login.
 * `/api/auth/*` se excluye — sus 401 los maneja quien llama.
 */
function interceptar401(): void {
  const fetchOriginal = window.fetch.bind(window);
  let recargando = false;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const respuesta = await fetchOriginal(input, init);
    if (respuesta.status !== 401) return respuesta;

    try {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href, window.location.href);
      const esApiProtegida =
        url.origin === window.location.origin &&
        url.pathname.startsWith('/api/') &&
        !url.pathname.startsWith('/api/auth/');
      if (esApiProtegida && !recargando) {
        recargando = true;
        window.location.reload();
      }
    } catch {
      // input no interpretable como URL — no hacemos nada
    }
    return respuesta;
  };
}

function mostrarAvisoActualizacion(aplicar: () => void): void {
  if (document.getElementById('pwa-toast')) return;

  const toast = document.createElement('div');
  toast.id = 'pwa-toast';

  const texto = document.createElement('span');
  texto.textContent = 'Nueva versión disponible';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Actualizar';
  boton.addEventListener('click', () => {
    toast.remove();
    aplicar();
  });

  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'pwa-toast__cerrar';
  cerrar.setAttribute('aria-label', 'Descartar');
  cerrar.textContent = '✕';
  cerrar.addEventListener('click', () => toast.remove());

  toast.append(texto, boton, cerrar);
  document.body.appendChild(toast);
}

/**
 * Spec 028 §3: en logout se borra la caché de datos del SW para no dejar
 * información de la sesión anterior accesible sin conexión. Llamado desde
 * el botón "Cerrar sesión" (src/ui/chasis.ts).
 */
export async function limpiarCacheDatos(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    await caches.delete('mirall-datos');
  } catch {
    // sin permisos de Cache Storage (modo privado, etc.) — no bloquea el logout
  }
}
