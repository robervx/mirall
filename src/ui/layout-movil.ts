// Controlador del layout móvil — spec 029.
//
// En móvil (`<html data-layout="movil">`, ver deteccion-dispositivo.ts):
//   - `#info-panels` pasa a ser un bottom sheet arrastrable de 3 estados;
//   - `#controls` (capas), `#media-panel`, `#tendencia-panel`, `#camaras-panel`,
//     `#camaras-dgt-panel` (spec 043), `#agenda-panel`,
//     `#actualidad-redes-panel` (spec 040), `#apoyo-decision-panel` (spec 041),
//     `#altimetria-panel`/`#meteo-zona-panel` (spec 044), `#senales-ia-panel`/
//     `#recomendaciones-ia-panel` (spec 047, sustituye a `#sintesis-ia-panel`
//     de spec 045), `#protocolos-panel` (spec 042), `#movilidad-avisos-panel`
//     (spec 048) y `#zas-ruido-panel` (spec 049) se reparentan dentro del
//     sheet para que todo quede en un único sitio con scroll —
//     la vista activa (`:root[data-vista]`, ver `router.ts`) decide cuáles de
//     ellos son visibles, independientemente de dónde vivan en el DOM;
//   - al volver a escritorio se deshace todo (los paneles vuelven a <body>).
//
// El CSS vive en index.html bajo `:root[data-layout='movil']`.
import { onCambioLayout, type Layout } from './deteccion-dispositivo';
import {
  ESTADOS_SHEET,
  FRACCION_SHEET,
  estadoMasCercano,
  esEstadoSheet,
  siguienteEstado,
  type EstadoSheet,
} from './bottom-sheet';

const CLAVE_ESTADO = 'mirall:bottomsheet-estado';
const ALTURA_TIRADOR_PX = 44;
const IDS_REPARENTABLES = [
  'controls',
  'media-panel',
  'tendencia-panel',
  'camaras-panel',
  'camaras-dgt-panel',
  'agenda-panel',
  'actualidad-redes-panel',
  'apoyo-decision-panel',
  'altimetria-panel',
  'meteo-zona-panel',
  'senales-ia-panel',
  'recomendaciones-ia-panel',
  'protocolos-panel',
  'movilidad-avisos-panel',
  'zas-ruido-panel',
] as const;

let sheet: HTMLElement | null = null;
let tirador: HTMLButtonElement | null = null;
let estado: EstadoSheet = 'medio';
let montado = false;

function leerEstadoGuardado(): EstadoSheet {
  try {
    const v = localStorage.getItem(CLAVE_ESTADO);
    return esEstadoSheet(v) ? v : 'medio';
  } catch {
    return 'medio';
  }
}

function guardarEstado(e: EstadoSheet): void {
  try {
    localStorage.setItem(CLAVE_ESTADO, e);
  } catch {
    /* almacenamiento no disponible */
  }
}

function getInfoPanels(): HTMLElement {
  let el = document.getElementById('info-panels');
  if (!el) {
    el = document.createElement('div');
    el.id = 'info-panels';
    document.body.appendChild(el);
  }
  return el;
}

function alturaCss(e: EstadoSheet): string {
  if (e === 'oculto') return `${ALTURA_TIRADOR_PX}px`;
  return `${Math.round(FRACCION_SHEET[e] * 100)}svh`;
}

function aplicarEstado(e: EstadoSheet, persistir = true): void {
  if (!sheet || !tirador) return;
  estado = e;
  sheet.dataset.sheet = e;
  sheet.style.height = alturaCss(e);
  const idx = ESTADOS_SHEET.indexOf(e);
  tirador.setAttribute('aria-label', `Paneles (${e}). Pulsa para ${siguienteEstado(e)}.`);
  tirador.setAttribute('aria-expanded', String(idx > 0));
  if (persistir) guardarEstado(e);
}

function crearTirador(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'sheet-tirador';
  b.innerHTML = '<span id="sheet-tirador__barra"></span>';

  let arrastrando = false;
  let movido = false;
  let yInicial = 0;
  let alturaInicial = 0;

  const onMove = (ev: PointerEvent) => {
    if (!arrastrando || !sheet) return;
    const delta = yInicial - ev.clientY;
    if (Math.abs(delta) > 4) movido = true;
    const h = Math.min(
      Math.max(ALTURA_TIRADOR_PX, alturaInicial + delta),
      Math.round(window.innerHeight * 0.95),
    );
    sheet.style.height = `${h}px`;
  };

  const onUp = (ev: PointerEvent) => {
    if (!arrastrando) return;
    arrastrando = false;
    b.releasePointerCapture?.(ev.pointerId);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (movido && sheet) {
      const frac = sheet.getBoundingClientRect().height / window.innerHeight;
      aplicarEstado(estadoMasCercano(frac));
    } else {
      aplicarEstado(siguienteEstado(estado));
    }
  };

  b.addEventListener('pointerdown', (ev: PointerEvent) => {
    if (!sheet) return;
    arrastrando = true;
    movido = false;
    yInicial = ev.clientY;
    alturaInicial = sheet.getBoundingClientRect().height;
    b.setPointerCapture?.(ev.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  // Teclado: flechas y Enter/Espacio ciclan estados.
  b.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      const i = Math.min(ESTADOS_SHEET.length - 1, ESTADOS_SHEET.indexOf(estado) + 1);
      aplicarEstado(ESTADOS_SHEET[i] as EstadoSheet);
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      const i = Math.max(0, ESTADOS_SHEET.indexOf(estado) - 1);
      aplicarEstado(ESTADOS_SHEET[i] as EstadoSheet);
    }
  });

  return b;
}

function reparentar(destino: HTMLElement | 'body'): void {
  for (const id of IDS_REPARENTABLES) {
    const el = document.getElementById(id);
    if (!el) continue;
    const parent = destino === 'body' ? document.body : destino;
    if (el.parentElement !== parent) parent.appendChild(el);
  }
  // #controls (capas) va arriba del todo, justo bajo el tirador.
  if (destino !== 'body' && tirador) {
    const controls = document.getElementById('controls');
    if (controls) destino.insertBefore(controls, tirador.nextSibling);
  }
}

function activarMovil(): void {
  sheet = getInfoPanels();
  if (!tirador) tirador = crearTirador();
  if (tirador.parentElement !== sheet) sheet.prepend(tirador);
  reparentar(sheet);
  aplicarEstado(leerEstadoGuardado(), false);
  montado = true;
}

function desactivarMovil(): void {
  if (!montado) return;
  reparentar('body');
  tirador?.remove();
  if (sheet) {
    sheet.style.height = '';
    delete sheet.dataset.sheet;
  }
  montado = false;
}

function onLayout(layout: Layout): void {
  if (layout === 'movil') activarMovil();
  else desactivarMovil();
}

/** Llamar una vez, después de que main() haya construido los paneles. */
export function initLayoutMovil(): void {
  onCambioLayout(onLayout);
}
