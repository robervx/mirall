// Iconografía Mirall v2 (spec 056) — Lucide, vía `lucide-static` (SVG crudo,
// sin runtime de framework: cada icono se importa como string con `?raw` y se
// inserta en el DOM, igual de "vanilla" que el resto del proyecto).
//
// Catálogo según la sección 6 del documento de diseño. `github` no existe en
// Lucide (retiraron los logos de marca por licencia) — se vendoriza aparte,
// GITHUB_MARK, con el trazo mínimo oficial de GitHub (MIT).

import iconoScanEye from 'lucide-static/icons/scan-eye.svg?raw';
import iconoBrainCircuit from 'lucide-static/icons/brain-circuit.svg?raw';
import iconoMap from 'lucide-static/icons/map.svg?raw';
import iconoLocate from 'lucide-static/icons/locate.svg?raw';
import iconoMapPin from 'lucide-static/icons/map-pin.svg?raw';
import iconoFlame from 'lucide-static/icons/flame.svg?raw';
import iconoBox from 'lucide-static/icons/box.svg?raw';
import iconoBookOpen from 'lucide-static/icons/book-open.svg?raw';
import iconoSettings from 'lucide-static/icons/settings.svg?raw';
import iconoMenu from 'lucide-static/icons/menu.svg?raw';
import iconoX from 'lucide-static/icons/x.svg?raw';
import iconoPanelLeftClose from 'lucide-static/icons/panel-left-close.svg?raw';
import iconoChevronsUpDown from 'lucide-static/icons/chevrons-up-down.svg?raw';
import iconoWind from 'lucide-static/icons/wind.svg?raw';
import iconoVolume2 from 'lucide-static/icons/volume-2.svg?raw';
import iconoAudioLines from 'lucide-static/icons/audio-lines.svg?raw';
import iconoCar from 'lucide-static/icons/car.svg?raw';
import iconoBike from 'lucide-static/icons/bike.svg?raw';
import iconoConstruction from 'lucide-static/icons/construction.svg?raw';
import iconoTrees from 'lucide-static/icons/trees.svg?raw';
import iconoMessageCircle from 'lucide-static/icons/message-circle.svg?raw';
import iconoLandmark from 'lucide-static/icons/landmark.svg?raw';
import iconoSparkles from 'lucide-static/icons/sparkles.svg?raw';
import iconoRadioTower from 'lucide-static/icons/radio-tower.svg?raw';
import iconoThermometer from 'lucide-static/icons/thermometer.svg?raw';
import iconoMountain from 'lucide-static/icons/mountain.svg?raw';
import iconoDroplets from 'lucide-static/icons/droplets.svg?raw';
import iconoCctv from 'lucide-static/icons/cctv.svg?raw';
import iconoCalendarDays from 'lucide-static/icons/calendar-days.svg?raw';
import iconoNewspaper from 'lucide-static/icons/newspaper.svg?raw';
import iconoTrendingUp from 'lucide-static/icons/trending-up.svg?raw';
import iconoShieldCheck from 'lucide-static/icons/shield-check.svg?raw';
import iconoTriangleAlert from 'lucide-static/icons/triangle-alert.svg?raw';
import iconoArrowUpRight from 'lucide-static/icons/arrow-up-right.svg?raw';
import iconoArrowRight from 'lucide-static/icons/arrow-right.svg?raw';
import iconoFileText from 'lucide-static/icons/file-text.svg?raw';
import iconoLayoutGrid from 'lucide-static/icons/layout-grid.svg?raw';
import iconoLayers from 'lucide-static/icons/layers.svg?raw';
import iconoRotateCcw from 'lucide-static/icons/rotate-ccw.svg?raw';
import iconoChevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import iconoBell from 'lucide-static/icons/bell.svg?raw';
import iconoMail from 'lucide-static/icons/mail.svg?raw';
import iconoRss from 'lucide-static/icons/rss.svg?raw';
import iconoBuilding2 from 'lucide-static/icons/building-2.svg?raw';
import iconoCheck from 'lucide-static/icons/check.svg?raw';
import iconoDatabase from 'lucide-static/icons/database.svg?raw';
import iconoPlus from 'lucide-static/icons/plus.svg?raw';
import iconoMinus from 'lucide-static/icons/minus.svg?raw';
import iconoLocateFixed from 'lucide-static/icons/locate-fixed.svg?raw';

const GITHUB_MARK = `<svg class="lucide lucide-github" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
  <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.86 10.9.57.1.78-.25.78-.55v-2.17c-3.2.7-3.88-1.35-3.88-1.35-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.07.78 2.16v3.2c0 .3.2.65.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/>
</svg>`;

const ICONOS: Record<string, string> = {
  'scan-eye': iconoScanEye,
  'brain-circuit': iconoBrainCircuit,
  map: iconoMap,
  locate: iconoLocate,
  'map-pin': iconoMapPin,
  flame: iconoFlame,
  box: iconoBox,
  'book-open': iconoBookOpen,
  settings: iconoSettings,
  menu: iconoMenu,
  x: iconoX,
  'panel-left-close': iconoPanelLeftClose,
  'chevrons-up-down': iconoChevronsUpDown,
  wind: iconoWind,
  'volume-2': iconoVolume2,
  'audio-lines': iconoAudioLines,
  car: iconoCar,
  bike: iconoBike,
  construction: iconoConstruction,
  trees: iconoTrees,
  'message-circle': iconoMessageCircle,
  landmark: iconoLandmark,
  sparkles: iconoSparkles,
  'radio-tower': iconoRadioTower,
  thermometer: iconoThermometer,
  mountain: iconoMountain,
  droplets: iconoDroplets,
  cctv: iconoCctv,
  'calendar-days': iconoCalendarDays,
  newspaper: iconoNewspaper,
  'trending-up': iconoTrendingUp,
  'shield-check': iconoShieldCheck,
  'triangle-alert': iconoTriangleAlert,
  'arrow-up-right': iconoArrowUpRight,
  'arrow-right': iconoArrowRight,
  'file-text': iconoFileText,
  'layout-grid': iconoLayoutGrid,
  layers: iconoLayers,
  'rotate-ccw': iconoRotateCcw,
  'chevron-down': iconoChevronDown,
  bell: iconoBell,
  github: GITHUB_MARK,
  mail: iconoMail,
  rss: iconoRss,
  'building-2': iconoBuilding2,
  check: iconoCheck,
  database: iconoDatabase,
  plus: iconoPlus,
  minus: iconoMinus,
  'locate-fixed': iconoLocateFixed,
};

export type NombreIcono = keyof typeof ICONOS;

/** Markup SVG crudo de un icono, a un tamaño dado (px), color heredado del
 * texto (`stroke="currentColor"` en el SVG fuente de Lucide). Decorativo por
 * defecto (`aria-hidden`) — si el icono va solo (botón sin texto), el control
 * que lo envuelve debe llevar su propio `aria-label`. */
export function iconoSvg(nombre: NombreIcono, tamaño = 18): string {
  const crudo = ICONOS[nombre];
  if (!crudo) {
    console.error(`iconoSvg: icono desconocido "${nombre}"`);
    return '';
  }
  return crudo
    .replace(/width="24"/, `width="${tamaño}"`)
    .replace(/height="24"/, `height="${tamaño}"`)
    .replace('<svg', '<svg aria-hidden="true" focusable="false"');
}

/** Igual que `iconoSvg` pero como nodo DOM listo para insertar. */
export function iconoElemento(nombre: NombreIcono, tamaño = 18): HTMLElement {
  const envoltorio = document.createElement('span');
  envoltorio.className = 'mv2-icono';
  envoltorio.innerHTML = iconoSvg(nombre, tamaño);
  return envoltorio.firstElementChild as HTMLElement;
}
