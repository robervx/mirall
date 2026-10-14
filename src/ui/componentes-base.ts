// Componentes base de la identidad visual Mirall v2 (spec 056, Fase 1).
//
// Mismo patrón que panel-utils.ts: funciones puras que devuelven
// `HTMLElement`, sin librería de UI — cada panel/pantalla que migre a su
// fase importa de aquí en vez de reinventar su propio marcado. Las clases
// CSS que consumen (`mv2-*`) viven en estilos.css, junto a los tokens.

import { escapeHtml } from './panel-utils';
import { iconoSvg, type NombreIcono } from './iconos';

export type Severidad = 'ok' | 'watch' | 'alert';

function severidadAColor(severidad: Severidad): string {
  if (severidad === 'alert') return 'var(--danger)';
  if (severidad === 'watch') return 'var(--warning)';
  return 'var(--accent)';
}

// ---- 7.1 Botones ----

interface OpcionesBoton {
  texto: string;
  variante: 'primary' | 'secondary' | 'pill-small';
  icono?: NombreIcono;
  iconoAlFinal?: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function crearBoton(opts: OpcionesBoton): HTMLElement {
  const el = document.createElement(opts.href ? 'a' : 'button') as HTMLButtonElement | HTMLAnchorElement;
  el.className = `mv2-btn mv2-btn--${opts.variante}`;
  if (opts.href) (el as HTMLAnchorElement).href = opts.href;
  if (!opts.href) (el as HTMLButtonElement).type = 'button';
  if (opts.disabled) {
    if ('disabled' in el) (el as HTMLButtonElement).disabled = true;
    el.setAttribute('aria-disabled', 'true');
  }

  const partes: string[] = [];
  if (opts.icono && !opts.iconoAlFinal) partes.push(iconoSvg(opts.icono, 16));
  partes.push(`<span>${escapeHtml(opts.texto)}</span>`);
  if (opts.icono && opts.iconoAlFinal) partes.push(iconoSvg(opts.icono, 16));
  el.innerHTML = partes.join('');

  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

// ---- 7.2 Chip de filtro ----

interface OpcionesChip {
  texto: string;
  activo?: boolean;
  onClick?: () => void;
}

export function crearChip(opts: OpcionesChip): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'mv2-chip';
  el.classList.toggle('is-active', Boolean(opts.activo));
  el.setAttribute('aria-pressed', String(Boolean(opts.activo)));
  el.textContent = opts.texto;
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

// ---- 7.4 Interruptor (toggle) ----

interface OpcionesToggle {
  checked: boolean;
  etiquetaAccesible: string;
  tamañoMovil?: boolean;
  onChange?: (checked: boolean) => void;
}

export function crearToggle(opts: OpcionesToggle): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `mv2-toggle${opts.tamañoMovil ? ' mv2-toggle--mobile' : ''}`;
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-checked', String(opts.checked));
  el.setAttribute('aria-label', opts.etiquetaAccesible);
  el.innerHTML = '<span class="mv2-toggle__tirador"></span>';
  el.addEventListener('click', () => {
    const nuevoEstado = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(nuevoEstado));
    opts.onChange?.(nuevoEstado);
  });
  return el;
}

// ---- 7.5 Tarjeta de datos (DataCard) ----

export type EstadoDataCard = 'ready' | 'loading' | 'empty' | 'error' | 'stale';

interface OpcionesDataCard {
  id: string;
  titulo: string;
  icono: NombreIcono;
  meta?: string; // "fuente · antigüedad"
  live?: boolean;
  highlighted?: boolean;
  estado?: EstadoDataCard;
  mensajeVacio?: string;
  mensajeError?: string;
  onReintentar?: () => void;
}

/** Crea el contenedor del DataCard (cabecera lista, cuerpo vacío a rellenar
 * por el llamante con `.querySelector('.mv2-card__body')`, salvo en estados
 * vacío/error/cargando, que se auto-rellenan). */
export function crearDataCard(opts: OpcionesDataCard): HTMLElement {
  const card = document.createElement('section');
  card.id = opts.id;
  card.className = 'mv2-card';
  card.classList.toggle('mv2-card--highlighted', Boolean(opts.highlighted));
  card.setAttribute('aria-labelledby', `${opts.id}__titulo`);

  const metaHtml =
    opts.estado === 'stale' && opts.meta
      ? `<span class="mv2-card__meta mv2-card__meta--stale">${escapeHtml(opts.meta)}</span>`
      : opts.meta
        ? `<span class="mv2-card__meta">${escapeHtml(opts.meta)}</span>`
        : '';

  const liveHtml =
    opts.live && opts.estado !== 'stale'
      ? '<span class="mv2-card__live"><span class="mv2-card__live-dot"></span>EN VIVO</span>'
      : '';

  card.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg(opts.icono, 16)}</span>
      <h3 id="${opts.id}__titulo" class="mv2-card__title">${escapeHtml(opts.titulo)}</h3>
      ${liveHtml}
      ${metaHtml}
    </header>
    <div class="mv2-card__body"></div>
  `;

  const body = card.querySelector('.mv2-card__body') as HTMLElement;
  pintarEstadoDataCard(body, opts);

  return card;
}

/** Repinta el cuerpo de un DataCard ya creado según su estado — para los
 * casos `loading`/`empty`/`error`; `ready` lo rellena el llamante a mano. */
export function pintarEstadoDataCard(body: HTMLElement, opts: Pick<OpcionesDataCard, 'estado' | 'mensajeVacio' | 'mensajeError' | 'onReintentar'>): void {
  if (opts.estado === 'loading') {
    body.innerHTML = `
      <div class="mv2-card__skeleton" style="height:14px;width:70%"></div>
      <div class="mv2-card__skeleton" style="height:14px;width:90%"></div>
      <div class="mv2-card__skeleton" style="height:14px;width:50%"></div>
    `;
    return;
  }
  if (opts.estado === 'empty') {
    body.innerHTML = `<p class="mv2-card__estado">${escapeHtml(opts.mensajeVacio ?? 'Sin datos disponibles ahora mismo.')}</p>`;
    return;
  }
  if (opts.estado === 'error') {
    const boton = crearBoton({ texto: 'Reintentar', variante: 'pill-small' });
    if (opts.onReintentar) boton.addEventListener('click', opts.onReintentar);
    body.innerHTML = `
      <p class="mv2-card__estado--error">${iconoSvg('triangle-alert', 16)}<span>${escapeHtml(opts.mensajeError ?? 'No se ha podido cargar la fuente.')}</span></p>
    `;
    body.appendChild(boton);
  }
}

// ---- 7.6 KPI / cifra ----

interface OpcionesKpi {
  etiqueta: string;
  valor: string;
  unidad?: string;
  severidad?: Severidad;
  textoEstado?: string;
}

export function crearKpi(opts: OpcionesKpi): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mv2-kpi';
  const estadoHtml =
    opts.severidad && opts.textoEstado
      ? `<span class="mv2-kpi__estado mv2-kpi__estado--${opts.severidad}"><span class="mv2-kpi__estado-dot"></span>${escapeHtml(opts.textoEstado)}</span>`
      : '';
  el.innerHTML = `
    <span class="mv2-kpi__label">${escapeHtml(opts.etiqueta)}</span>
    <span class="mv2-kpi__valor-fila">
      <span class="mv2-kpi-m mv2-tabular">${escapeHtml(opts.valor)}</span>
      ${opts.unidad ? `<span class="mv2-kpi__unidad">${escapeHtml(opts.unidad)}</span>` : ''}
    </span>
    ${estadoHtml}
  `;
  return el;
}

// ---- 7.7 Barras ----

interface OpcionesBarraFila {
  etiqueta: string;
  valorTexto: string;
  porcentaje: number; // 0-100
  severidad?: Severidad;
  umbralPorcentaje?: number;
}

export function crearBarraFila(opts: OpcionesBarraFila): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mv2-bar-row';
  const colorClase =
    opts.severidad === 'alert' ? 'mv2-bar-fill--danger' : opts.severidad === 'watch' ? 'mv2-bar-fill--warning' : '';
  const umbralHtml =
    opts.umbralPorcentaje !== undefined
      ? `<span class="mv2-bar-threshold" style="left:${opts.umbralPorcentaje}%"></span>`
      : '';
  el.innerHTML = `
    <span class="mv2-bar-row__label">${escapeHtml(opts.etiqueta)}</span>
    <span class="mv2-bar-track">
      <span class="mv2-bar-fill ${colorClase}" style="right:${100 - opts.porcentaje}%"></span>
      ${umbralHtml}
    </span>
    <span class="mv2-bar-row__valor mv2-tabular">${escapeHtml(opts.valorTexto)}</span>
  `;
  return el;
}

// ---- 7.8 Fila de lista / señal ----

interface OpcionesFilaSeñal {
  tipo: string; // "TRÁFICO", "EMERGENCIAS 112"...
  colorPunto: string; // valor CSS (var semántica o hex)
  hora: string;
  cuerpo: string;
}

export function crearFilaSeñal(opts: OpcionesFilaSeñal): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mv2-row';
  el.innerHTML = `
    <span class="mv2-row__punto" style="background:${opts.colorPunto}"></span>
    <span class="mv2-row__contenido">
      <span class="mv2-row__cabecera">
        <span class="mv2-row__tipo" style="color:${opts.colorPunto}">${escapeHtml(opts.tipo)}</span>
        <span class="mv2-row__hora">${escapeHtml(opts.hora)}</span>
      </span>
      <span class="mv2-row__cuerpo">${escapeHtml(opts.cuerpo)}</span>
    </span>
  `;
  return el;
}

// ---- 7.9 Pills / etiquetas ----

interface OpcionesPill {
  texto: string;
  variante: 'danger' | 'info' | 'neutral' | 'live';
  icono?: NombreIcono;
}

export function crearPill(opts: OpcionesPill): HTMLElement {
  const el = document.createElement('span');
  el.className = `mv2-pill mv2-pill--${opts.variante}`;
  const puntoHtml = opts.variante === 'live' ? '<span class="mv2-pill__dot"></span>' : '';
  const iconoHtml = opts.icono ? iconoSvg(opts.icono, 11) : '';
  el.innerHTML = `${puntoHtml}${iconoHtml}<span>${escapeHtml(opts.texto)}</span>`;
  return el;
}

export { severidadAColor };
