// Fila 2 "Clima y terreno" de /inteligencia — spec 044/046, rediseñada a
// DataCard (spec 056 Fase 4, §8.5). Cada caja tira de su propio endpoint y
// hace su propio polling, nunca comparten estado entre sí:
//   1. Altimetría (estática, IGN) — `montarAltimetriaPanel`.
//   2. Meteorología por zona — fusiona AVAMET (estaciones reales),
//      Open-Meteo por distrito (modelo) y pluviómetros SAIH (reales) como
//      pestañas de una misma tarjeta — `montarMeteorologiaZonaPanel`. El
//      documento de diseño solo pide 2 pestañas (Estaciones reales |
//      Distritos modelo); se añade una tercera ("Pluviómetros SAIH") en vez
//      de meter los pluviómetros reales dentro de la pestaña "modelo" —
//      etiquetarlos como modelo cuando son dato medido sería inexacto.
//   3. Riesgo de acumulación de agua (spec 046) — `montarRiesgoEscorrentiaPanel`.
//      El diseño pide un badge único "NIVEL ACTUAL: Bajo/Medio/Alto", pero el
//      modelo real es deliberadamente un ranking ordinal sin bandas fijas
//      (ver comentario de `renderRiesgoEscorrentia`, decisión ya tomada con
//      el asesor de ciencia de datos, spec 046 §3: con 19 distritos, cortes
//      fijos son arbitrarios y se confunden con niveles oficiales de
//      Protección Civil/AEMET) — se adapta el bloque destacado a ese modelo
//      real en vez de inventar una banda que la propia spec 046 rechazó.
// "Capacidad de absorción" queda fuera — sin fuente oficial identificada, no
// se inventa una heurística (§7, mismo criterio que EMT en spec 007 o Waze
// en spec 015).
import type { ResumenAltimetriaDistrito } from '../services/altimetria';
import type { LluviaVientoDistrito } from '../services/meteo-zona';
import type { PluviometroSaih } from '../services/pluviometros-saih';
import type { EstacionAvamet } from '../services/avamet-estaciones';
import { ADVERTENCIA_RIESGO_ESCORRENTIA, type RiesgoEscorrentiaDistrito } from '../services/riesgo-escorrentia';
import { escapeHtml, metaFrescuraCorta, startPolling } from './panel-utils';
import { iconoSvg } from './iconos';

async function fetchAltimetria(): Promise<ResumenAltimetriaDistrito[]> {
  const res = await fetch('/api/emergencia/v1/altimetria');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/altimetria -> HTTP ${res.status}`);
  const body = (await res.json()) as { distritos: ResumenAltimetriaDistrito[] };
  return body.distritos;
}

async function fetchMeteoZona(): Promise<{ distritos: LluviaVientoDistrito[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/meteo-zona');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/meteo-zona -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: LluviaVientoDistrito[]; fresh: boolean };
}

async function fetchPluviometros(): Promise<{ estaciones: PluviometroSaih[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/pluviometros');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/pluviometros -> HTTP ${res.status}`);
  return (await res.json()) as { estaciones: PluviometroSaih[]; fresh: boolean };
}

async function fetchAvamet(): Promise<{ estaciones: EstacionAvamet[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/avamet');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/avamet -> HTTP ${res.status}`);
  return (await res.json()) as { estaciones: EstacionAvamet[]; fresh: boolean };
}

async function fetchRiesgoEscorrentia(): Promise<{ distritos: RiesgoEscorrentiaDistrito[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/riesgo-escorrentia');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/riesgo-escorrentia -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: RiesgoEscorrentiaDistrito[]; fresh: boolean };
}

// ---------------------------------------------------------------------------
// Caja 1 — Altimetría (estática, IGN) — §8.5.4
// ---------------------------------------------------------------------------

function renderAltimetria(distritos: ResumenAltimetriaDistrito[]): string {
  if (distritos.length === 0) return '<div class="mv2-card__estado">Sin datos de altimetría.</div>';
  const ordenado = [...distritos].sort((a, b) => b.elevacionMediaM - a.elevacionMediaM);
  const max = Math.max(...ordenado.map((d) => d.elevacionMediaM));
  return ordenado
    .map((d) => {
      const pct = max > 0 ? Math.round((d.elevacionMediaM / max) * 100) : 0;
      const baja = d.elevacionMediaM < 8;
      return `
        <div class="mv2-bar-row">
          <span class="mv2-bar-row__label">${escapeHtml(d.distritoNombre)}</span>
          <span class="mv2-bar-track"><span class="mv2-bar-fill${baja ? ' mv2-bar-fill--info' : ''}" style="right:${100 - pct}%"></span></span>
          <span class="mv2-bar-row__valor mv2-tabular">${d.elevacionMediaM.toFixed(1)} m</span>
        </div>
      `;
    })
    .join('');
}

export function montarAltimetriaPanel(): void {
  const root = document.createElement('section');
  root.id = 'altimetria-panel';
  root.className = 'mv2-card';
  root.dataset.vistaInteligenciaCard = '';
  root.dataset.categoria = 'clima';
  root.hidden = true;
  root.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg('mountain', 16)}</span>
      <h3 class="mv2-card__title">Altimetría por distrito</h3>
      <span class="mv2-card__meta">IGN · estático</span>
    </header>
    <div class="mv2-card__body">
      <p class="mv2-body-s" style="color:var(--text-secondary);margin:0">De más alto a más bajo. Anticipa dónde se acumula el agua por gravedad.</p>
      <div id="altimetria-list" style="display:flex;flex-direction:column;gap:8px"></div>
    </div>
  `;
  document.body.appendChild(root);
  const list = root.querySelector('#altimetria-list')!;

  fetchAltimetria()
    .then((distritos) => {
      list.innerHTML = renderAltimetria(distritos);
    })
    .catch((err: unknown) => {
      list.innerHTML = `<p class="mv2-card__estado--error">${iconoSvg('triangle-alert', 16)}<span>Altimetría no disponible.</span></p>`;
      console.error('Fallo al cargar altimetría:', err);
    });
}

// ---------------------------------------------------------------------------
// Caja 2 — Meteorología por zona (AVAMET real | Open-Meteo modelo |
// pluviómetros SAIH reales), tres pestañas — §8.5.3
// ---------------------------------------------------------------------------

function colorTemp(c: number): string {
  return c >= 28.5 ? 'var(--warning)' : 'var(--text-primary)';
}

function renderAvametTabla(estaciones: EstacionAvamet[]): string {
  if (estaciones.length === 0) return '<div class="mv2-card__estado">Sin estaciones AVAMET disponibles ahora mismo.</div>';
  const max = Math.max(...estaciones.map((e) => e.temperaturaC), 1);
  const ordenado = [...estaciones].sort((a, b) => b.temperaturaC - a.temperaturaC);
  const filas = ordenado
    .map((e) => {
      const pct = Math.max(0, Math.min(100, Math.round((e.temperaturaC / max) * 100)));
      return `
        <tr>
          <td class="meteo-zona-tabla__estacion">${escapeHtml(e.nombre)}</td>
          <td class="meteo-zona-tabla__temp">
            <span class="mv2-bar-track" style="width:56px"><span class="mv2-bar-fill" style="right:${100 - pct}%;background:${colorTemp(e.temperaturaC)}"></span></span>
            <span class="mv2-tabular" style="color:${colorTemp(e.temperaturaC)}">${e.temperaturaC.toFixed(1)}°</span>
          </td>
          <td class="mv2-tabular meteo-zona-tabla__viento">${e.vientoKmh.toFixed(0)} ${escapeHtml(e.vientoDireccion)}</td>
          <td class="mv2-tabular meteo-zona-tabla__lluvia">${e.precipitacionDiaMm.toFixed(1)}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <table class="meteo-zona-tabla">
      <thead><tr><th>ESTACIÓN</th><th>TEMP.</th><th>VIENTO</th><th>LLUVIA</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderMeteoZonaDistritos(distritos: LluviaVientoDistrito[]): string {
  if (distritos.length === 0) return '<div class="mv2-card__estado">Sin datos de lluvia/viento por distrito.</div>';
  const ordenado = [...distritos].sort((a, b) => b.precipitacionMm - a.precipitacionMm || b.rachaKmh - a.rachaKmh);
  return `
    <p class="mv2-body-s" style="color:var(--warning);margin:0 0 10px">Por distrito es un modelo (Open-Meteo), no una estación real.</p>
    ${ordenado
      .map(
        (d) => `
      <div class="mv2-row">
        <span class="mv2-row__contenido">
          <span class="mv2-row__cabecera"><span class="mv2-row__tipo" style="color:var(--text-secondary)">${escapeHtml(d.distritoNombre)}</span></span>
          <span class="mv2-row__cuerpo mv2-tabular">${d.precipitacionMm.toFixed(1)} mm · ${d.vientoKmh.toFixed(0)} km/h (ráfaga ${d.rachaKmh.toFixed(0)})</span>
        </span>
      </div>`,
      )
      .join('')}
  `;
}

function renderPluviometros(estaciones: PluviometroSaih[]): string {
  if (estaciones.length === 0) return '<div class="mv2-card__estado">Sin pluviómetros con dato cerca de Valencia ahora mismo.</div>';
  return estaciones
    .map(
      (e) => `
      <div class="mv2-row">
        <span class="mv2-row__contenido">
          <span class="mv2-row__cabecera"><span class="mv2-row__tipo" style="color:var(--text-secondary)">${escapeHtml(e.nombre)} · ${escapeHtml(e.poblacion)}</span></span>
          <span class="mv2-row__cuerpo mv2-tabular">1h: ${e.litrosM2_1h.toFixed(1)} · 4h: ${e.litrosM2_4h.toFixed(1)} · 12h: ${e.litrosM2_12h.toFixed(1)} · 24h: <strong>${e.litrosM2_24h.toFixed(1)}</strong> l/m²</span>
        </span>
      </div>`,
    )
    .join('');
}

export function montarMeteorologiaZonaPanel(): void {
  const root = document.createElement('section');
  root.id = 'meteorologia-zona-panel';
  root.className = 'mv2-card';
  root.dataset.vistaInteligenciaCard = '';
  root.dataset.categoria = 'clima';
  root.hidden = true;
  root.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg('thermometer', 16)}</span>
      <h3 class="mv2-card__title">Meteorología por zona</h3>
      <span class="mv2-card__meta" id="meteorologia-zona-meta"></span>
    </header>
    <div class="mv2-segmented mv2-segmented--inset meteorologia-zona__tabs" role="tablist" style="margin:12px 18px 0">
      <button type="button" class="mv2-segmented__tab is-active" role="tab" aria-selected="true" data-tab="avamet">Estaciones reales</button>
      <button type="button" class="mv2-segmented__tab" role="tab" aria-selected="false" data-tab="distritos">Distritos (modelo)</button>
      <button type="button" class="mv2-segmented__tab" role="tab" aria-selected="false" data-tab="saih">Pluviómetros (SAIH)</button>
    </div>
    <div class="mv2-card__body">
      <div data-tabpanel="avamet" id="meteorologia-avamet-body"></div>
      <div data-tabpanel="distritos" id="meteorologia-distritos-body" hidden></div>
      <div data-tabpanel="saih" id="meteorologia-saih-body" hidden></div>
    </div>
  `;
  document.body.appendChild(root);

  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.meteorologia-zona__tabs .mv2-segmented__tab'));
  const paneles = Array.from(root.querySelectorAll<HTMLElement>('[data-tabpanel]'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      paneles.forEach((p) => {
        p.hidden = p.dataset.tabpanel !== tab.dataset.tab;
      });
    });
  });

  const meta = root.querySelector<HTMLElement>('#meteorologia-zona-meta')!;
  const avametBody = root.querySelector<HTMLElement>('#meteorologia-avamet-body')!;
  const distritosBody = root.querySelector<HTMLElement>('#meteorologia-distritos-body')!;
  const saihBody = root.querySelector<HTMLElement>('#meteorologia-saih-body')!;

  async function refrescarAvamet(): Promise<void> {
    try {
      const { estaciones, fresh } = await fetchAvamet();
      avametBody.innerHTML = renderAvametTabla(estaciones);
      meta.textContent = metaFrescuraCorta('AVAMET', new Date().toISOString());
      meta.classList.toggle('mv2-card__meta--stale', !fresh);
    } catch (err) {
      avametBody.textContent = 'Estaciones AVAMET no disponibles';
      console.error('Fallo al cargar estaciones AVAMET:', err);
    }
  }

  async function refrescarDistritos(): Promise<void> {
    try {
      const { distritos } = await fetchMeteoZona();
      distritosBody.innerHTML = renderMeteoZonaDistritos(distritos);
    } catch (err) {
      distritosBody.textContent = 'Lluvia/viento por distrito no disponible';
      console.error('Fallo al cargar lluvia/viento por distrito:', err);
    }
  }

  async function refrescarSaih(): Promise<void> {
    try {
      const { estaciones } = await fetchPluviometros();
      saihBody.innerHTML = renderPluviometros(estaciones);
    } catch (err) {
      saihBody.textContent = 'Pluviómetros no disponibles';
      console.error('Fallo al cargar pluviómetros:', err);
    }
  }

  startPolling(refrescarAvamet, 15 * 60 * 1000);
  startPolling(refrescarDistritos, 15 * 60 * 1000);
  startPolling(refrescarSaih, 15 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Caja 3 — Riesgo de acumulación de agua (spec 046) — §8.5.5
// ---------------------------------------------------------------------------

function renderRiesgoEscorrentia(distritos: RiesgoEscorrentiaDistrito[]): { nivelHtml: string; listaHtml: string } {
  const activos = distritos.filter((d) => d.activo);
  if (activos.length === 0) {
    return {
      nivelHtml: `
        <span class="riesgo-escorrentia__etiqueta">NIVEL ACTUAL</span>
        <span class="riesgo-escorrentia__valor riesgo-escorrentia__valor--ok">Sin lluvia activa</span>
        <p class="mv2-body-s" style="color:var(--text-secondary);margin:8px 0 0">0,0 mm registrados en todas las estaciones. El indicador solo se activa con lluvia en curso.</p>
      `,
      listaHtml: '',
    };
  }
  const ordenado = [...activos].sort((a, b) => b.indiceRelativo - a.indiceRelativo);
  const max = ordenado[0]!.indiceRelativo;
  const nivelHtml = `
    <span class="riesgo-escorrentia__etiqueta">NIVEL ACTUAL</span>
    <span class="riesgo-escorrentia__valor riesgo-escorrentia__valor--watch">${max}<span class="riesgo-escorrentia__sobre100">/100</span></span>
    <p class="mv2-body-s" style="color:var(--text-secondary);margin:8px 0 0">Lluvia en curso — ranking relativo por distrito, no una banda fija (19 distritos no admiten cortes "bajo/medio/alto" sin ser arbitrarios).</p>
  `;
  const listaHtml = `
    <p class="mv2-label-mono" style="color:var(--text-muted);margin:16px 0 8px">ZONAS MÁS EXPUESTAS AHORA</p>
    ${ordenado
      .slice(0, 6)
      .map(
        (d) => `
      <div class="mv2-row">
        <span class="mv2-row__punto" style="background:var(--warning);margin-top:7px"></span>
        <span class="mv2-row__contenido">
          <span class="mv2-row__cuerpo">${escapeHtml(d.distritoNombre)}</span>
        </span>
        <span class="mv2-tabular" style="color:var(--text-secondary);align-self:center">${d.indiceRelativo}</span>
      </div>`,
      )
      .join('')}
  `;
  return { nivelHtml, listaHtml };
}

export function montarRiesgoEscorrentiaPanel(): void {
  const root = document.createElement('section');
  root.id = 'riesgo-escorrentia-panel';
  root.className = 'mv2-card';
  root.dataset.vistaInteligenciaCard = '';
  root.dataset.categoria = 'clima';
  root.hidden = true;
  root.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg('droplets', 16)}</span>
      <h3 class="mv2-card__title">Riesgo de acumulación de agua</h3>
      <span class="mv2-card__meta">spec 046</span>
    </header>
    <div class="mv2-card__body">
      <div class="riesgo-escorrentia__bloque" id="riesgo-escorrentia-nivel"></div>
      <div id="riesgo-escorrentia-lista"></div>
      <p class="mv2-body-s" style="color:var(--text-muted);margin:12px 0 0">${escapeHtml(ADVERTENCIA_RIESGO_ESCORRENTIA)}</p>
    </div>
  `;
  document.body.appendChild(root);
  const nivelEl = root.querySelector<HTMLElement>('#riesgo-escorrentia-nivel')!;
  const listaEl = root.querySelector<HTMLElement>('#riesgo-escorrentia-lista')!;

  async function refrescarEscorrentia(): Promise<void> {
    try {
      const { distritos } = await fetchRiesgoEscorrentia();
      const { nivelHtml, listaHtml } = renderRiesgoEscorrentia(distritos);
      nivelEl.innerHTML = nivelHtml;
      listaEl.innerHTML = listaHtml;
    } catch (err) {
      nivelEl.innerHTML = `<p class="mv2-card__estado--error">${iconoSvg('triangle-alert', 16)}<span>Riesgo de acumulación de agua no disponible.</span></p>`;
      console.error('Fallo al cargar riesgo de escorrentía:', err);
    }
  }

  startPolling(refrescarEscorrentia, 15 * 60 * 1000);
}
