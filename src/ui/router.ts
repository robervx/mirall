// Router por hash — spec 040 (mapa/inteligencia), ampliado en spec 056 Fase 5
// con `barrios`/`capas` (pantallas móviles propias del `TabBar`, §8.7/§9 del
// documento de diseño — en escritorio/tablet no existe una pantalla dedicada
// para ninguna de las dos, así que `main.ts` las trata como alias de `mapa`
// fuera de layout móvil, ver su callback de `initRouter`). Sin dependencia
// nueva (`CLAUDE.md` §5, "sin framework"). El resto del estado en URL
// (`?layers=&foco=`, spec 000) vive en la query string, independiente del
// hash — cambiar de vista nunca lo toca ni recarga la página.
export type Vista = 'mapa' | 'inteligencia' | 'barrios' | 'capas';

const HASH_POR_VISTA: Record<Exclude<Vista, 'mapa'>, string> = {
  inteligencia: '#/inteligencia',
  barrios: '#/barrios',
  capas: '#/capas',
};

export function vistaActual(): Vista {
  const entrada = Object.entries(HASH_POR_VISTA).find(([, hash]) => hash === location.hash);
  return (entrada?.[0] as Vista | undefined) ?? 'mapa';
}

export function irAVista(vista: Vista): void {
  const hash = vista === 'mapa' ? '#/' : HASH_POR_VISTA[vista];
  if (location.hash !== hash) location.hash = hash;
}

/** Aplica `data-vista` a `<html>` (mismo patrón que `data-layout`, ver `deteccion-dispositivo.ts`) y avisa a `cb` en cada cambio, incluida la llamada inicial. */
export function initRouter(cb: (vista: Vista) => void): void {
  const aplicar = (): void => {
    const vista = vistaActual();
    document.documentElement.dataset.vista = vista;
    cb(vista);
  };
  window.addEventListener('hashchange', aplicar);
  aplicar();
}
