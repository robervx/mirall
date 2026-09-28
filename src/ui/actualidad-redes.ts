// Panel "Actualidad institucional en redes" — spec 039, sección del sidebar (spec 019).
//
// Cada entidad puede tener un widget de Facebook (Page Plugin) y/o de X (embed
// de timeline vía publish.x.com) — ninguno de los dos usa la API de pago
// (CLAUDE.md §3, aclarado tras `ADR-003`). Sin filtrado ni fusión cronológica
// entre entidades: es una limitación estructural de los iframes de origen
// cruzado que Facebook/X controlan por completo, no un defecto de esta
// implementación (spec 039 §1) — cada ficha muestra su propio widget.
//
// Carga diferida (spec 039 §4/§6): los SDK de Facebook y de X, que fijan sus
// propias cookies, solo se piden la primera vez que se abre la ficha de una
// entidad — nunca en el arranque de la app ni al abrir el panel en general.
import { ENTIDADES_REDES, type EntidadRed } from '../config/entidades-redes';

const TIEMPO_FALLBACK_MS = 8000;

// v3 (DoD de V1) — "elegir qué cuentas leer": mismo patrón de localStorage
// que `panel-preferences.ts` (un set de ids *ocultos*, no de visibles, para
// que una entidad nueva en el registro aparezca visible por defecto sin
// tener que tocar la preferencia guardada de nadie).
const ENTIDADES_OCULTAS_KEY = 'mirall:entidades-redes-ocultas';

function leerOcultas(): Set<string> {
  try {
    const raw = localStorage.getItem(ENTIDADES_OCULTAS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function guardarOcultas(ocultas: Set<string>): void {
  try {
    localStorage.setItem(ENTIDADES_OCULTAS_KEY, JSON.stringify([...ocultas]));
  } catch {
    /* no-op — localStorage no disponible (privado/bloqueado), se pierde la preferencia, no la funcionalidad */
  }
}

export function isEntidadVisible(id: string): boolean {
  return !leerOcultas().has(id);
}

export function setEntidadVisible(id: string, visible: boolean): void {
  const ocultas = leerOcultas();
  if (visible) ocultas.delete(id);
  else ocultas.add(id);
  guardarOcultas(ocultas);
}

interface VentanaConSdks extends Window {
  FB?: { init: (opts: Record<string, unknown>) => void; XFBML: { parse: (el?: HTMLElement) => void } };
  fbAsyncInit?: () => void;
  twttr?: { widgets?: { load: (el?: HTMLElement) => void } };
}

let fbSdkPromise: Promise<void> | null = null;
let xSdkPromise: Promise<VentanaConSdks['twttr']> | null = null;

function cargarFacebookSdk(): Promise<void> {
  if (fbSdkPromise) return fbSdkPromise;
  fbSdkPromise = new Promise((resolve) => {
    const w = window as VentanaConSdks;
    if (w.FB) {
      resolve();
      return;
    }
    if (!document.getElementById('fb-root')) {
      const root = document.createElement('div');
      root.id = 'fb-root';
      document.body.appendChild(root);
    }
    w.fbAsyncInit = () => {
      w.FB!.init({ xfbml: false, version: 'v21.0' });
      resolve();
    };
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/es_ES/sdk.js#xfbml=0&version=v21.0';
    // Bug real (reportado por el usuario, 2026-09-17): un bloqueador de
    // anuncios/red/CSP puede impedir que este script cargue — sin `onerror`,
    // `fbAsyncInit` nunca se dispara y esta promesa (compartida por todas las
    // fichas de Facebook, no solo la que la pidió primero) se queda colgada
    // para siempre. Con esto, el `await` de `montarWidgetFacebook` resuelve
    // igualmente y cada ficha cae a su fallback de las 8s en vez de quedarse
    // en blanco sin explicación (ver también el reordenado en esa función).
    script.onerror = () => resolve();
    document.body.appendChild(script);
  });
  return fbSdkPromise;
}

function cargarXSdk(): Promise<VentanaConSdks['twttr']> {
  if (xSdkPromise) return xSdkPromise;
  xSdkPromise = new Promise((resolve) => {
    const w = window as VentanaConSdks;
    if (w.twttr?.widgets) {
      resolve(w.twttr);
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://platform.twitter.com/widgets.js';
    script.onload = () => resolve((window as VentanaConSdks).twttr);
    // Mismo motivo que en cargarFacebookSdk: `platform.twitter.com` es de lo
    // más bloqueado por bloqueadores de anuncios — sin `onerror` la promesa
    // (compartida por todas las fichas de X) se queda colgada para siempre.
    script.onerror = () => resolve(undefined);
    document.body.appendChild(script);
  });
  return xSdkPromise;
}

/** Ficha simple con enlace directo — spec 039 §6: nunca un hueco roto si el widget no carga. */
export function construirTarjetaFallback(nombre: string, url: string): HTMLAnchorElement {
  const enlace = document.createElement('a');
  enlace.className = 'red-entidad__fallback';
  enlace.href = url;
  enlace.target = '_blank';
  enlace.rel = 'noopener noreferrer';
  enlace.textContent = `${nombre} — ver publicaciones ↗`;
  return enlace;
}

function programarFallback(container: HTMLElement, nombre: string, url: string, ms = TIEMPO_FALLBACK_MS): void {
  window.setTimeout(() => {
    if (container.querySelector('iframe')) return; // el widget ya renderizó
    container.innerHTML = '';
    container.appendChild(construirTarjetaFallback(nombre, url));
  }, ms);
}

async function montarWidgetFacebook(container: HTMLElement, pageUrl: string): Promise<void> {
  // Bug real (2026-09-17): antes se programaba el fallback DESPUÉS de esperar
  // al SDK — si ese `await` no resolvía nunca (ver `cargarFacebookSdk`), el
  // fallback tampoco se llegaba a programar y la ficha se quedaba en blanco
  // para siempre, sin aviso. Programarlo ya, antes de esperar nada, garantiza
  // que a los 8s hay un fallback pase lo que pase con el SDK.
  programarFallback(container, 'Facebook', pageUrl);
  await cargarFacebookSdk();
  const div = document.createElement('div');
  div.className = 'fb-page';
  div.dataset.href = pageUrl;
  div.dataset.tabs = 'timeline';
  div.dataset.width = '280';
  div.dataset.height = '360';
  div.dataset.smallHeader = 'true';
  div.dataset.hideCover = 'true';
  div.dataset.showFacepile = 'false';
  container.appendChild(div);
  (window as VentanaConSdks).FB?.XFBML.parse(container);
}

async function montarWidgetX(container: HTMLElement, handle: string): Promise<void> {
  // Mismo motivo que montarWidgetFacebook — ver ese comentario.
  programarFallback(container, `@${handle}`, `https://x.com/${handle}`);
  const twttr = await cargarXSdk();
  const enlace = document.createElement('a');
  enlace.className = 'twitter-timeline';
  enlace.setAttribute('data-height', '360');
  enlace.setAttribute('data-chrome', 'noheader nofooter');
  enlace.href = `https://twitter.com/${handle}?ref_src=twsrc%5Etfw`;
  enlace.textContent = `Tuits de @${handle}`;
  container.appendChild(enlace);
  twttr?.widgets?.load(container);
}

/**
 * Ficha de una entidad como acordeón: el shell (título, contenedores vacíos)
 * se construye ya, sin cargar ningún SDK — solo al abrirla por primera vez se
 * piden los widgets de verdad (spec 039 §4).
 */
export function construirFichaEntidad(entidad: EntidadRed): HTMLDetailsElement {
  const det = document.createElement('details');
  det.className = 'red-entidad';
  det.dataset.entidadId = entidad.id;

  const sum = document.createElement('summary');
  sum.className = 'red-entidad__titulo';
  sum.textContent = entidad.nombre;
  det.appendChild(sum);

  const cuerpo = document.createElement('div');
  cuerpo.className = 'red-entidad__cuerpo';
  det.appendChild(cuerpo);

  let cargado = false;
  det.addEventListener('toggle', () => {
    if (!det.open || cargado) return;
    cargado = true;
    if (entidad.facebookPageUrl) {
      const cont = document.createElement('div');
      cont.className = 'red-entidad__widget';
      cuerpo.appendChild(cont);
      void montarWidgetFacebook(cont, entidad.facebookPageUrl);
    }
    if (entidad.xHandle) {
      const cont = document.createElement('div');
      cont.className = 'red-entidad__widget';
      cuerpo.appendChild(cont);
      void montarWidgetX(cont, entidad.xHandle);
    }
  });

  return det;
}

/** "Elegir qué cuentas leer" — un checkbox por entidad, preferencia persistida (spec 039 v3). */
function buildSelectorEntidades(fichas: Map<string, HTMLDetailsElement>): HTMLDetailsElement {
  const selector = document.createElement('details');
  selector.className = 'red-entidad-selector';

  const sum = document.createElement('summary');
  sum.className = 'red-entidad-selector__titulo';
  sum.textContent = 'Elegir qué cuentas leer';
  selector.appendChild(sum);

  for (const entidad of ENTIDADES_REDES) {
    const row = document.createElement('label');
    row.className = 'sidebar-panel-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isEntidadVisible(entidad.id);
    checkbox.addEventListener('change', () => {
      setEntidadVisible(entidad.id, checkbox.checked);
      const ficha = fichas.get(entidad.id);
      if (ficha) ficha.hidden = !checkbox.checked;
    });

    const text = document.createElement('span');
    text.textContent = entidad.nombre;

    row.append(checkbox, text);
    selector.appendChild(row);
  }

  return selector;
}

export function buildActualidadRedesContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content actualidad-redes';

  const intro = document.createElement('p');
  intro.className = 'cordon-intro';
  intro.textContent =
    'Cuentas oficiales de organismos de la ciudad. Cada ficha carga su propio widget al abrirla, sin filtro ni orden único entre entidades — limitación de los iframes de Facebook/X, no de esta app.';
  wrap.appendChild(intro);

  const aviso = document.createElement('p');
  aviso.className = 'glosario-nota';
  aviso.textContent = 'Al abrir una ficha se cargan los scripts oficiales de Meta y/o X, que pueden fijar sus propias cookies.';
  wrap.appendChild(aviso);

  const fichas = new Map<string, HTMLDetailsElement>();
  for (const entidad of ENTIDADES_REDES) {
    const ficha = construirFichaEntidad(entidad);
    ficha.hidden = !isEntidadVisible(entidad.id);
    fichas.set(entidad.id, ficha);
  }

  wrap.appendChild(buildSelectorEntidades(fichas));
  for (const ficha of fichas.values()) wrap.appendChild(ficha);

  return wrap;
}
