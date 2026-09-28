// Detección escritorio / móvil — spec 029 §3.
//
// Una sola app responsive: NO hay UA sniffing ni detección en servidor. El
// layout se decide con `matchMedia('(max-width: 640px) and (pointer: coarse)')`
// (el `pointer: coarse` evita tratar una ventana de escritorio estrecha como
// un móvil), y el usuario puede forzar uno de los dos desde el pie del sidebar.
//
// El resultado se refleja en `<html data-layout="movil|escritorio">`, sobre lo
// que enganchan las reglas CSS de móvil. Un script inline en index.html fija
// ese atributo antes del primer pintado para que no haya parpadeo.

export type Layout = 'escritorio' | 'movil';
export type LayoutForzado = Layout | null;

export const CLAVE_OVERRIDE = 'mirall:layout-forzado';
export const CONSULTA_MOVIL = '(max-width: 640px) and (pointer: coarse)';

/** Layout resultante dado el override manual y si el medio "es móvil". */
export function resolverLayout(forzado: LayoutForzado, medioEsMovil: boolean): Layout {
  if (forzado === 'movil' || forzado === 'escritorio') return forzado;
  return medioEsMovil ? 'movil' : 'escritorio';
}

export function getLayoutForzado(): LayoutForzado {
  try {
    const v = localStorage.getItem(CLAVE_OVERRIDE);
    return v === 'movil' || v === 'escritorio' ? v : null;
  } catch {
    return null;
  }
}

function guardarLayoutForzado(v: LayoutForzado): void {
  try {
    if (v) localStorage.setItem(CLAVE_OVERRIDE, v);
    else localStorage.removeItem(CLAVE_OVERRIDE);
  } catch {
    // almacenamiento no disponible (modo privado, etc.) — el override no persiste
  }
}

let mql: MediaQueryList | null = null;
let layoutActual: Layout = 'escritorio';
const oyentes = new Set<(l: Layout) => void>();

function medioEsMovil(): boolean {
  if (mql) return mql.matches;
  try {
    return window.matchMedia(CONSULTA_MOVIL).matches;
  } catch {
    return false;
  }
}

function recalcular(): void {
  const nuevo = resolverLayout(getLayoutForzado(), medioEsMovil());
  const yaAplicado = document.documentElement.dataset.layout === nuevo;
  if (nuevo === layoutActual && yaAplicado) return;
  layoutActual = nuevo;
  document.documentElement.dataset.layout = nuevo;
  oyentes.forEach((cb) => cb(nuevo));
}

export function getLayout(): Layout {
  return layoutActual;
}

export function esMovil(): boolean {
  return layoutActual === 'movil';
}

/** Fuerza un layout (o `null` para volver a automático) y lo persiste. */
export function setLayoutForzado(v: LayoutForzado): void {
  guardarLayoutForzado(v);
  recalcular();
}

/**
 * Suscribe a cambios de layout. Invoca `cb` inmediatamente con el layout
 * actual, para que el consumidor haga su montaje inicial en el mismo sitio
 * donde gestiona los cambios.
 */
export function onCambioLayout(cb: (l: Layout) => void): void {
  oyentes.add(cb);
  cb(layoutActual);
}

/** Llamar una vez, al principio de main(). */
export function initDeteccionDispositivo(): void {
  try {
    mql = window.matchMedia(CONSULTA_MOVIL);
    mql.addEventListener('change', recalcular);
  } catch {
    mql = null;
  }
  // Sincroniza `layoutActual` con lo que el script inline ya dejó en el <html>.
  const inicial = document.documentElement.dataset.layout;
  layoutActual = inicial === 'movil' ? 'movil' : 'escritorio';
  recalcular();
}
