// Punto de entrada de la guía de estilos interna (`/guia-estilos/`) — spec 056
// Fase 1. Renderiza cada componente base del catálogo para comparación visual
// manual contra las capturas del paquete de diseño. No es producto público.

import {
  crearBoton,
  crearChip,
  crearToggle,
  crearKpi,
  crearBarraFila,
  crearFilaSeñal,
  crearPill,
  crearDataCard,
  pintarEstadoDataCard,
} from '../ui/componentes-base';
import { iconoElemento, type NombreIcono } from '../ui/iconos';

function porId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`guia-estilos: falta #${id}`);
  return el;
}

function fila(contenedor: HTMLElement, ...hijos: HTMLElement[]): void {
  const f = document.createElement('div');
  f.className = 'ge-fila';
  hijos.forEach((h) => f.appendChild(h));
  contenedor.appendChild(f);
}

// ---- Color ----
const TOKENS_COLOR: Array<[string, string]> = [
  ['--bg', 'Fondo'],
  ['--surface', 'Surface'],
  ['--surface-2', 'Surface 2'],
  ['--border', 'Border'],
  ['--text-primary', 'Texto primario'],
  ['--text-secondary', 'Texto secundario'],
  ['--text-muted', 'Texto muted'],
  ['--accent', 'Acento (lima)'],
  ['--danger', 'Danger'],
  ['--warning', 'Warning'],
  ['--info', 'Info'],
];
{
  const sec = porId('ge-color');
  const f = document.createElement('div');
  f.className = 'ge-fila';
  for (const [token, nombre] of TOKENS_COLOR) {
    const sw = document.createElement('div');
    sw.className = 'ge-swatch';
    sw.innerHTML = `<span class="ge-swatch-color" style="background:var(${token})"></span><span>${nombre}<br>${token}</span>`;
    f.appendChild(sw);
  }
  sec.appendChild(f);
}

// ---- Tipografía ----
{
  const sec = porId('ge-tipografia');
  const clases = [
    'mv2-display-xl',
    'mv2-display-l',
    'mv2-display-m',
    'mv2-title-xl',
    'mv2-title-l',
    'mv2-title-m',
    'mv2-title-s',
    'mv2-title-xs',
    'mv2-kpi-l',
    'mv2-body-l',
    'mv2-body',
    'mv2-body-s',
    'mv2-label-mono',
    'mv2-meta-mono',
  ];
  for (const c of clases) {
    const p = document.createElement('p');
    p.className = c;
    p.style.margin = '0 0 10px';
    p.textContent = `${c} — La ciudad reflejada en tiempo real 123.456`;
    sec.appendChild(p);
  }
}

// ---- Botones ----
{
  const sec = porId('ge-botones');
  fila(
    sec,
    crearBoton({ texto: 'Ver el mapa en directo', variante: 'primary', icono: 'arrow-right', iconoAlFinal: true }),
    crearBoton({ texto: 'Leer el manifiesto', variante: 'secondary', icono: 'file-text' }),
    crearBoton({ texto: 'Ver en mapa', variante: 'pill-small', icono: 'arrow-up-right', iconoAlFinal: true }),
    crearBoton({ texto: 'Deshabilitado', variante: 'primary', disabled: true }),
  );
}

// ---- Chips + segmentado ----
{
  const sec = porId('ge-chips');
  fila(
    sec,
    crearChip({ texto: 'Todo', activo: true }),
    crearChip({ texto: 'Movilidad' }),
    crearChip({ texto: 'Clima' }),
    crearChip({ texto: 'Ruido' }),
  );
  const segmentado = document.createElement('div');
  segmentado.className = 'mv2-segmented';
  segmentado.innerHTML = `
    <button type="button" class="mv2-segmented__tab is-active">${iconoElemento('map' as NombreIcono, 14).outerHTML} Mapa</button>
    <button type="button" class="mv2-segmented__tab">${iconoElemento('brain-circuit' as NombreIcono, 14).outerHTML} Inteligencia</button>
  `;
  sec.appendChild(segmentado);
}

// ---- Toggles ----
{
  const sec = porId('ge-toggles');
  fila(
    sec,
    crearToggle({ checked: true, etiquetaAccesible: 'Capa de tráfico (activa)' }),
    crearToggle({ checked: false, etiquetaAccesible: 'Capa de obras (inactiva)' }),
    crearToggle({ checked: true, etiquetaAccesible: 'Capa de ruido (activa, móvil)', tamañoMovil: true }),
  );
}

// ---- KPI ----
{
  const sec = porId('ge-kpis');
  fila(
    sec,
    crearKpi({ etiqueta: 'Calidad del aire', valor: '42', unidad: 'ICA', severidad: 'ok', textoEstado: 'Buena' }),
    crearKpi({ etiqueta: 'Ruido medio', valor: '77', unidad: 'dB', severidad: 'watch', textoEstado: 'Alto' }),
    crearKpi({ etiqueta: 'Tráfico', valor: 'Denso', severidad: 'alert', textoEstado: 'Congestión' }),
  );
}

// ---- Barras ----
{
  const sec = porId('ge-barras');
  const contenedor = document.createElement('div');
  contenedor.style.maxWidth = '420px';
  contenedor.style.display = 'flex';
  contenedor.style.flexDirection = 'column';
  contenedor.style.gap = '10px';
  contenedor.appendChild(crearBarraFila({ etiqueta: 'Poblats de l’Oest', valorTexto: '40,9 m', porcentaje: 100 }));
  contenedor.appendChild(
    crearBarraFila({ etiqueta: 'C/ Doctor Serrano', valorTexto: '67,2', porcentaje: 80, severidad: 'alert', umbralPorcentaje: 65 }),
  );
  contenedor.appendChild(crearBarraFila({ etiqueta: 'Av. del Port', valorTexto: '28,8°', porcentaje: 60, severidad: 'watch' }));
  porId('ge-barras').appendChild(contenedor);
}

// ---- Filas de señal ----
{
  const sec = porId('ge-filas');
  const contenedor = document.createElement('div');
  contenedor.style.maxWidth = '480px';
  contenedor.appendChild(
    crearFilaSeñal({ tipo: 'TRÁFICO', colorPunto: 'var(--danger)', hora: '15:39', cuerpo: 'Retención de 12 min en Av. del Port.' }),
  );
  contenedor.appendChild(
    crearFilaSeñal({ tipo: 'AYUNTAMIENTO', colorPunto: 'var(--accent)', hora: '15:12', cuerpo: 'Farola reparada en C/ Cádiz.' }),
  );
  contenedor.appendChild(
    crearFilaSeñal({ tipo: 'EVENTO', colorPunto: 'var(--warning)', hora: '14:50', cuerpo: 'Valencia Basket vs Hapoel, 20:45, Roig Arena.' }),
  );
  sec.appendChild(contenedor);
}

// ---- Pills ----
{
  const sec = porId('ge-pills');
  fila(
    sec,
    crearPill({ texto: 'Impacto en vía pública', variante: 'danger', icono: 'triangle-alert' }),
    crearPill({ texto: 'Ciutat Vella', variante: 'info' }),
    crearPill({ texto: 'ZAS Russafa', variante: 'neutral' }),
    crearPill({ texto: 'LIVE', variante: 'live' }),
  );
}

// ---- DataCard — estados ----
{
  const sec = porId('ge-cards');
  const grid = document.createElement('div');
  grid.className = 'ge-cards';

  const ready = crearDataCard({ id: 'ge-card-ready', titulo: 'Meteorología por zona', icono: 'thermometer', meta: 'AVAMET · hace 3 min', live: true });
  ready.querySelector('.mv2-card__body')!.innerHTML = '<p class="mv2-body">28,8° · 9 km/h OSO · 0,0 mm</p>';
  grid.appendChild(ready);

  const loading = crearDataCard({ id: 'ge-card-loading', titulo: 'Ruido en Russafa', icono: 'audio-lines', estado: 'loading' });
  grid.appendChild(loading);

  const empty = crearDataCard({
    id: 'ge-card-empty',
    titulo: 'Riesgo de acumulación de agua',
    icono: 'droplets',
    estado: 'empty',
    mensajeVacio: 'Sin lluvia registrada ahora mismo.',
  });
  grid.appendChild(empty);

  const error = crearDataCard({
    id: 'ge-card-error',
    titulo: 'Cámaras en vías de acceso',
    icono: 'cctv',
    estado: 'error',
    mensajeError: 'No se ha podido cargar DGT.',
    onReintentar: () => console.log('reintentar'),
  });
  grid.appendChild(error);

  const staleCard = crearDataCard({
    id: 'ge-card-stale',
    titulo: 'Agenda de eventos',
    icono: 'calendar-days',
    meta: 'hace 56 min',
    estado: 'stale',
  });
  const staleBody = staleCard.querySelector('.mv2-card__body') as HTMLElement;
  pintarEstadoDataCard(staleBody, { estado: undefined });
  staleBody.innerHTML = '<p class="mv2-body">92 eventos (último dato bueno, atenuado).</p>';
  staleBody.style.opacity = '0.6';
  grid.appendChild(staleCard);

  const highlighted = crearDataCard({
    id: 'ge-card-highlighted',
    titulo: 'Recomendaciones de actuación',
    icono: 'sparkles',
    meta: 'Mirall IA · hace instantes',
    highlighted: true,
  });
  highlighted.querySelector('.mv2-card__body')!.innerHTML = '<p class="mv2-body">Prever congestión en Quatre Carreres 19:30–21:00.</p>';
  grid.appendChild(highlighted);

  sec.appendChild(grid);
}

// ---- Iconografía ----
{
  const sec = porId('ge-iconos');
  const grid = document.createElement('div');
  grid.className = 'ge-icons';
  const nombres: NombreIcono[] = [
    'scan-eye', 'brain-circuit', 'map', 'locate', 'map-pin', 'flame', 'box', 'book-open', 'settings', 'menu', 'x',
    'panel-left-close', 'chevrons-up-down', 'wind', 'volume-2', 'audio-lines', 'car', 'bike', 'construction',
    'trees', 'message-circle', 'landmark', 'sparkles', 'radio-tower', 'thermometer', 'mountain', 'droplets',
    'cctv', 'calendar-days', 'newspaper', 'trending-up', 'shield-check', 'triangle-alert', 'arrow-up-right',
    'arrow-right', 'file-text', 'layout-grid', 'layers', 'rotate-ccw', 'chevron-down', 'bell', 'github', 'mail',
    'rss', 'building-2', 'check', 'database', 'plus', 'minus', 'locate-fixed',
  ];
  for (const n of nombres) {
    const item = document.createElement('div');
    item.className = 'ge-icon-item';
    item.appendChild(iconoElemento(n, 20));
    const label = document.createElement('span');
    label.textContent = n;
    item.appendChild(label);
    grid.appendChild(item);
  }
  sec.appendChild(grid);
}
