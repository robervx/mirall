// Punto de entrada — mapa base + capa de distritos (spec 000) + capa mock de
// densidad de personas (spec 003). MapLibre GL (tiles) + deck.gl (overlay
// interleaved) — sin globo 3D, ver CLAUDE.md §5.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Causa raíz real del mapa en blanco (investigada 2026-09-25, ver memoria de
// proyecto): maplibre-gl localiza su worker con una URL relativa calculada en
// tiempo de ejecución a partir de `import.meta.url` de su propio módulo. Vite/
// Rollup incrusta ese módulo dentro del bundle principal en producción (deja
// de ser un fichero propio), así que esa URL calculada apunta a
// `/assets/maplibre-gl-worker.mjs`, que nunca se genera — 404 real,
// confirmado en producción. Sin worker, MapLibre no puede parsear ninguna
// tesela vectorial: nunca dispara 'load', así que el mapa se queda vacío para
// siempre (sin ningún error, porque nada llega a fallar de forma ruidosa).
// La solución documentada de la propia librería para bundlers es no dejar
// que lo adivine: pasarle explícitamente la URL real con `setWorkerUrl`
// antes de crear el primer `Map`.
//
// OJO — `?url` (probado y descartado) NO basta: solo copia el fichero tal
// cual, sin bundlear. `maplibre-gl-worker.mjs` importa a su vez
// `./maplibre-gl-shared.mjs` (fichero propio de la librería, no tocado por
// Vite con `?url`), así que ese import relativo también 404 — el worker
// falla al instanciarse como módulo ES, con un error silencioso y genérico
// (`ErrorEvent` sin mensaje) que no llega a la consola principal por
// defecto. `?worker&url` sí trata este fichero como un entrypoint de verdad:
// Vite lo bundlea (resuelve e inlinea sus propios imports) y emite un único
// fichero de worker autocontenido — sin dependencias sueltas que puedan
// faltar en dist/assets.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, ScatterplotLayer, IconLayer, TextLayer } from '@deck.gl/layers';
import type { PickingInfo, Color } from '@deck.gl/core';
import { preloadDistrictGeometry, getDistrictCentroid, getLoadedDistricts } from './services/district-geometry';
import type { DensidadDistritoMock } from './services/densidad-personas-mock';
import { generarHotspotsDensidadMock } from './services/densidad-personas-mock';
import type { Insight, PanelInsights } from './services/insights';
import type { CalidadAire } from './services/calidad-aire';
import type { TramoTrafico, EstadoTramo } from './services/trafico';
import type { HistoricoTrafico } from './services/trafico-historico';
import { sparklinePath } from './services/trafico-historico';
import type { EstacionValenbisi } from './services/valenbisi';
import type { Aparcamiento } from './services/aparcamiento';
import type { PulsoDistrito, EscenarioActivo } from './services/pulso-escenarios';
import type { DatosFallas, MonumentoFalla } from './services/fallas';
import type { ItemMediatico } from './services/mediatico';
import type { VentanaTendencia } from './services/tendencia-terminos';
import type { EventoAgenda, SnapshotAgenda } from './services/agenda-eventos';
import type { AvisoMovilidad, SnapshotAvisosMovilidad } from './services/movilidad-incidencias-previsiones';
import type { IncidenciaViaPublica, TipoIncidenciaViaPublica } from './services/via-publica';
import type { RiesgoEscorrentiaDistrito } from './services/riesgo-escorrentia';
import type { EstacionAvamet } from './services/avamet-estaciones';
import type { ZonaZas, SonometroRuzafa, PanelZas } from './services/zas';
import type { ResumenAltimetriaDistrito, MuestraElevacion } from './services/altimetria';
import { featureCollectionAltimetriaPuntos } from './services/altimetria';
import { mountChasis } from './ui/chasis';
import { applyPanelVisibility, PANEL_PREFERENCES_REGISTRY } from './ui/panel-preferences';
import { registrarFrescura } from './ui/estado-frescura';
import { montarDashboardKpis, registrarKpi } from './ui/dashboard-kpis';
import { setFocoDistrito, getFocoDistrito, onCambioFoco, montarChipFoco } from './ui/foco-distrito';
import { initPwa } from './pwa';
import { initDeteccionDispositivo } from './ui/deteccion-dispositivo';
import { initLayoutMovil } from './ui/layout-movil';
import {
  actualizarTramosTrafico,
  actualizarEstacionesValenbisi,
  actualizarAparcamientos,
} from './services/capas-activas-store';
import {
  onCambioModoCordon,
  reportarUbicacionElegida,
  toggleCorteManual,
  getTramoPorId,
  getEstadoModoCordon,
} from './ui/modo-cordon';
import {
  onCambioModoSimulacion,
  toggleTramoCortado,
  getTramoPorIdSimulacion,
  getEstadoModoSimulacion,
} from './ui/modo-simulacion-cortes';
import { cargarGrafoViario } from './services/grafo-viario-cliente';
import { montarCamarasPanel, montarCamarasDgtPanel } from './ui/camaras-panel';
import { montarMeteoActualPanel, montarPrediccionPanel } from './ui/meteo-panel';
import { buildActualidadRedesContent } from './ui/actualidad-redes';
import { initRouter } from './ui/router';
import { montarApoyoDecisionPanel } from './ui/apoyo-decision-panel';
import { montarAltimetriaPanel, montarMeteoZonaPanel } from './ui/emergencia-meteo-panel';
import { montarSenalesPanel } from './ui/senales-ia-panel';
import { montarRecomendacionesPanel } from './ui/recomendaciones-actuacion-panel';
import { buildProtocolosContent } from './ui/protocolos-panel';
import { onPeticionCentrarMapa } from './ui/centrar-mapa';
import { escapeHtml, metaFrescura, formatoFechaHora, buildInfoPanel, startPolling } from './ui/panel-utils';
import { marcadoresSentido, type MarcadorSentido } from './services/flechas-sentido';
import { puntosFlujoParaTramo } from './services/flujo-animado';
import type { Coordenada } from './services/proximidad';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const VALENCIA_CENTER: [number, number] = [-0.3763, 39.4699];
const DEFAULT_ZOOM = 12;
// Duración del ciclo del efecto de flujo animado de la capa de tráfico real
// (spec 004) — cuánto tarda un punto en recorrer un tramo completo. Más
// lento que un efecto "urgente" a propósito (petición del usuario: "a un
// ritmo algo más lento para que no sature") — con ~400 tramos visibles a la
// vez, un ritmo rápido satura visualmente y consume más CPU sin necesidad.
const DURACION_CICLO_FLUJO_TRAFICO_MS = 4500;
// Animación del desvío en el simulador de cortes (spec 022 v6) — el punto
// recorre toda la ruta alternativa en este tiempo. Suele haber muy pocas
// rutas a la vez (una por corte), así que puede ir algo más vivo que el
// flujo de tráfico general.
const DURACION_CICLO_RERUTA_MS = 3200;

interface DistritoProperties {
  codigo: string;
  nombre: string;
}

interface MapUrlState {
  center: [number, number];
  zoom: number;
  distrito: string | null;
}

function readStateFromUrl(): MapUrlState {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const zoomParam = params.get('zoom');
  const distrito = params.get('distrito');

  let center = VALENCIA_CENTER;
  if (view) {
    const [lon, lat] = view.split(',').map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) center = [lon as number, lat as number];
  }
  const zoom = Number.isFinite(Number(zoomParam)) && zoomParam ? Number(zoomParam) : DEFAULT_ZOOM;

  return { center, zoom, distrito: distrito ?? null };
}

function writeStateToUrl(state: MapUrlState): void {
  const params = new URLSearchParams();
  params.set('view', `${state.center[0].toFixed(5)},${state.center[1].toFixed(5)}`);
  params.set('zoom', state.zoom.toFixed(2));
  if (state.distrito) params.set('distrito', state.distrito);
  // spec 040 — no pisar el hash de vista (#/inteligencia): replaceState
  // sustituye la URL entera, así que hay que conservarlo explícitamente.
  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(null, '', newUrl);
}

// Amarillo pálido -> rojo intenso, según intensidad 0-1 — ver spec 003 §5.
function colorIntensidad(intensidad: number): Color {
  const r = 255;
  const g = Math.round(220 - intensidad * 190);
  const b = Math.round(150 - intensidad * 150);
  const a = Math.round(40 + intensidad * 180);
  return [r, Math.max(0, g), Math.max(0, b), a];
}

// Flecha de sentido como icono SVG (no glifo de fuente) — el TextLayer con
// caracteres ▶/◀ fallaba en algunos móviles (atlas de fuente sin ese glifo:
// se veía como marcas sueltas "de error"). Blanco + `mask` para tintarlo.
const ICONO_FLECHA_SENTIDO = {
  id: 'flecha-sentido',
  url:
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 4 L19 12 L7 20 Z" fill="#fff"/></svg>',
    ),
  width: 24,
  height: 24,
  mask: true,
};

// FeatureCollection de líneas a partir de ids de tramo del grafo viario
// (specs 021/022/031) — resuelve cada id contra el store del modo activo.
function featuresDeTramos(
  ids: string[],
  resolver: (id: string) => { geometria: GeoJSON.LineString } | undefined,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: ids
      .map(resolver)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
  };
}

// Marcadores de sentido para un conjunto concreto de tramos (los implicados
// en el análisis activo) — mucho menos ruido visual que pintar una flecha
// por cada calle del viewport, sobre todo en móvil.
function marcadoresSentidoParaIds(
  ids: Iterable<string>,
  resolver: (id: string) => import('./services/red-viaria').Tramo | undefined,
): MarcadorSentido[] {
  const tramos = [...new Set(ids)]
    .map(resolver)
    .filter((t): t is NonNullable<typeof t> => !!t);
  return marcadoresSentido(tramos);
}

// Spec 013 — "avisa, no actúa" (CLAUDE.md §4): cada tarjeta ofrece un
// borrador para copiar, nunca un envío automático ni una lista de
// destinatarios. Guardamos el último panel para que el listener de clic
// (delegado, ver más abajo) pueda leer el texto exacto a copiar.
let ultimoPanelInsights: PanelInsights | null = null;

// Spec 013 v4/v5 — cuando aparece un insight con un id que no estaba en la
// evaluación anterior, salta una alerta. `null` = todavía no ha habido
// primera carga → esa primera se puebla en silencio (no es "nueva").
let idsInsightsPrevios: Set<string> | null = null;

// v5 (DoD de V1, 2026-09-16): el toast de esquina que se autocerraba solo a
// los 10s pasa a un modal bloqueante — exige cierre explícito. Si llegan
// varias alertas nuevas a la vez, se ven una a una (cola), nunca varios
// modales superpuestos. No existía ningún <dialog>/modal en el repo antes de
// esto — reutiliza el patrón de backdrop/focus-trap/Esc del sidebar móvil
// (`src/ui/chasis.ts`), adaptado aquí porque vive en un módulo distinto.
let colaAlertasModal: Insight[] = [];
let focoPrevioAlertaModal: HTMLElement | null = null;

function elementosModalAlerta(): { backdrop: HTMLDivElement; modal: HTMLDivElement } {
  let backdrop = document.getElementById('alert-modal-backdrop') as HTMLDivElement | null;
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'alert-modal-backdrop';
    backdrop.hidden = true;
    const modal = document.createElement('div');
    modal.id = 'alert-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'alert-modal-titulo');
    modal.tabIndex = -1;
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) cerrarAlertaModalActual();
    });
    document.body.appendChild(backdrop);
  }
  return { backdrop, modal: document.getElementById('alert-modal') as HTMLDivElement };
}

function onKeydownAlertaModal(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') {
    cerrarAlertaModalActual();
    return;
  }
  if (ev.key === 'Tab') {
    const { modal } = elementosModalAlerta();
    const focusables = modal.querySelectorAll<HTMLElement>('button');
    if (focusables.length === 0) return;
    const primero = focusables[0]!;
    const ultimo = focusables[focusables.length - 1]!;
    if (ev.shiftKey && document.activeElement === primero) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && document.activeElement === ultimo) {
      ev.preventDefault();
      primero.focus();
    }
  }
}

function renderAlertaModalActual(): void {
  const { backdrop, modal } = elementosModalAlerta();
  const insight = colaAlertasModal[0];

  if (!insight) {
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKeydownAlertaModal);
    if (focoPrevioAlertaModal) {
      focoPrevioAlertaModal.focus?.();
      focoPrevioAlertaModal = null;
    }
    return;
  }

  modal.className = `alert-modal--${insight.severidad}`;
  modal.innerHTML = `
    <div class="alert-modal__header">
      <span class="alert-modal__contador">${colaAlertasModal.length > 1 ? `1 de ${colaAlertasModal.length}` : ''}</span>
      <button type="button" class="alert-modal__cerrar" aria-label="Cerrar">✕</button>
    </div>
    <div class="alert-modal__cuerpo">
      <div class="alert-modal__titulo" id="alert-modal-titulo">${escapeHtml(insight.titulo)}</div>
      <div class="alert-modal__desc">${escapeHtml(insight.descripcion)}</div>
      <div class="alert-modal__momento">Detectado ${formatoFechaHora(insight.detectedAt)}</div>
    </div>
    <div class="alert-modal__footer">
      <button type="button" class="alert-modal__ver">Ver en el panel</button>
    </div>
  `;

  modal.querySelector('.alert-modal__cerrar')!.addEventListener('click', cerrarAlertaModalActual);
  modal.querySelector('.alert-modal__ver')!.addEventListener('click', () => {
    const panel = document.getElementById('insights-panel');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    panel?.classList.add('info-panel--resaltado');
    window.setTimeout(() => panel?.classList.remove('info-panel--resaltado'), 1500);
    cerrarAlertaModalActual();
  });

  if (backdrop.hidden) {
    focoPrevioAlertaModal = document.activeElement as HTMLElement | null;
    backdrop.hidden = false;
    document.addEventListener('keydown', onKeydownAlertaModal);
  }
  modal.querySelector<HTMLButtonElement>('.alert-modal__cerrar')!.focus();
}

function cerrarAlertaModalActual(): void {
  colaAlertasModal.shift();
  renderAlertaModalActual();
}

function mostrarModalAlerta(insight: Insight): void {
  colaAlertasModal.push(insight);
  renderAlertaModalActual();
}

function procesarNuevasAlertas(panel: PanelInsights): void {
  const idsAhora = new Set(panel.insights.map((i) => i.id));
  if (idsInsightsPrevios !== null) {
    for (const insight of panel.insights) {
      if (!idsInsightsPrevios.has(insight.id)) mostrarModalAlerta(insight);
    }
  }
  idsInsightsPrevios = idsAhora;
}

if (import.meta.env.DEV) {
  // Ayuda de verificación en dev: dispara una alerta de prueba en el modal.
  (window as unknown as { __toastAlertaDemo?: (sev?: 'aviso' | 'urgente') => void }).__toastAlertaDemo = (
    sev = 'urgente',
  ) =>
    mostrarModalAlerta({
      id: `demo:${Date.now()}`,
      tipo: 'calor-extremo',
      severidad: sev,
      titulo: sev === 'urgente' ? 'Calor extremo — 39°C en Valencia' : 'Aviso de calor — 35°C',
      descripcion: 'Alerta de prueba para verificar el modal (spec 013 v5).',
      protocoloSugerido: { asunto: '', cuerpo: '' },
      fuenteSpec: ['001'],
      detectedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    } as Insight);
}

function renderInsightsPanel(root: HTMLDivElement, panel: PanelInsights, fresh: boolean): void {
  ultimoPanelInsights = panel;
  procesarNuevasAlertas(panel);

  const nUrgentes = panel.insights.filter((i) => i.severidad === 'urgente').length;
  registrarKpi({
    clave: 'alertas',
    etiqueta: 'Alertas',
    valor: panel.insights.length === 0 ? '0' : String(panel.insights.length),
    tono: panel.insights.length === 0 ? 'ok' : nUrgentes > 0 ? 'urgente' : 'aviso',
  });

  if (panel.insights.length === 0) {
    root.innerHTML = `
      <div class="info-panel__desc">✓ Sin alertas activas</div>
      <div class="info-panel__meta">${metaFrescura('Mirall (insights)', panel.fetchedAt, fresh)}</div>
    `;
    return;
  }

  const tarjetas = panel.insights
    .map((insight, i) => {
      const chips = insight.fuenteSpec
        .map((spec) => `<span class="insight-card__fuente-chip">${spec}</span>`)
        .join('');
      return `
        <div class="insight-card insight-card--${insight.severidad}">
          <div class="insight-card__titulo">${insight.titulo}</div>
          <div class="insight-card__desc">${insight.descripcion}</div>
          <div class="insight-card__momento">Detectado ${formatoFechaHora(insight.detectedAt)}</div>
          <div class="insight-card__fuentes">${chips}</div>
          <button class="insight-card__copiar" type="button" data-insight-index="${i}">Copiar borrador</button>
        </div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="info-panel__desc">⚠ ${panel.insights.length} alerta${panel.insights.length === 1 ? '' : 's'}</div>
    <div class="insight-panel__tarjetas">${tarjetas}</div>
    <div class="info-panel__meta">${metaFrescura('Mirall (insights)', panel.fetchedAt, fresh)}</div>
  `;
}

async function fetchInsightsActual(): Promise<{ panel: PanelInsights; fresh: boolean }> {
  const res = await fetch('/api/insights/v1/actual');
  if (!res.ok) throw new Error(`GET /api/insights/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as { panel: PanelInsights; fresh: boolean };
}

// Colores por banda del European AQI — ver src/services/calidad-aire.ts.
function colorCategoriaAire(categoria: string): string {
  switch (categoria) {
    case 'Buena':
      return '#4caf50';
    case 'Aceptable':
      return '#8bc34a';
    case 'Moderada':
      return '#ffc107';
    case 'Mala':
      return '#ff9800';
    case 'Muy mala':
      return '#e53935';
    default:
      return '#7b1fa2';
  }
}

function renderAirePanel(root: HTMLDivElement, calidad: CalidadAire, fresh: boolean): void {
  root.innerHTML = `
    <div class="info-panel__main">
      <span class="info-panel__badge" style="background:${colorCategoriaAire(calidad.categoria)}">${calidad.indiceEuropeo}</span>
      <span class="info-panel__value info-panel__value--small">${calidad.categoria}</span>
    </div>
    <div class="info-panel__desc">PM2.5 ${calidad.pm25.toFixed(1)} · NO₂ ${calidad.dioxidoNitrogeno.toFixed(1)} µg/m³</div>
    <div class="info-panel__meta">${metaFrescura('Open-Meteo', calidad.fetchedAt, fresh)}</div>
  `;

  registrarKpi({
    clave: 'aire',
    etiqueta: 'Aire',
    valor: `${calidad.indiceEuropeo} · ${calidad.categoria}`,
    tono:
      calidad.categoria === 'Muy mala' || calidad.categoria === 'Extremadamente mala'
        ? 'urgente'
        : calidad.categoria === 'Mala'
          ? 'aviso'
          : calidad.categoria === 'Buena'
            ? 'ok'
            : 'neutro',
  });
}

async function fetchCalidadAireActual(): Promise<{ calidad: CalidadAire; fresh: boolean }> {
  const res = await fetch('/api/aire/v1/actual');
  if (!res.ok) throw new Error(`GET /api/aire/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as { calidad: CalidadAire; fresh: boolean };
}

const COLOR_ESTADO_TRAFICO: Record<EstadoTramo, Color> = {
  fluido: [76, 175, 80, 200],
  denso: [255, 193, 7, 200],
  congestionado: [255, 152, 0, 210],
  cortado: [211, 47, 47, 220],
  'sin-datos': [158, 158, 158, 130],
};

// v4 (DoD de V1, 2026-09-16): los estados no-fluidos no resaltaban frente al
// verde, que domina por ser mayoría de los ~400 tramos. Dos ajustes, sin
// tocar el color en sí: ancho creciente por severidad, y orden de dibujo
// (`ordenarTramosPorSeveridad`) para que lo problemático se pinte encima de
// lo fluido — deck.gl pinta un `GeoJsonLayer` en el orden del array de
// features, no hay una prop de z-order propia.
const ANCHO_ESTADO_TRAFICO: Record<EstadoTramo, number> = {
  'sin-datos': 3,
  fluido: 3,
  denso: 5,
  congestionado: 6,
  cortado: 7,
};

const SEVERIDAD_ESTADO_TRAFICO: Record<EstadoTramo, number> = {
  'sin-datos': 0,
  fluido: 1,
  denso: 2,
  congestionado: 3,
  cortado: 4,
};

function ordenarTramosPorSeveridad(tramos: TramoTrafico[]): TramoTrafico[] {
  return [...tramos].sort((a, b) => SEVERIDAD_ESTADO_TRAFICO[a.estado] - SEVERIDAD_ESTADO_TRAFICO[b.estado]);
}

const ETIQUETA_ESTADO_TRAFICO: Record<EstadoTramo, string> = {
  fluido: 'Fluido',
  denso: 'Denso',
  congestionado: 'Congestionado',
  cortado: 'Cortado',
  'sin-datos': 'Sin datos',
};

function renderTraficoLeyenda(root: HTMLDivElement, tramos: TramoTrafico[], fresh: boolean): void {
  const conteos = new Map<EstadoTramo, number>();
  for (const t of tramos) conteos.set(t.estado, (conteos.get(t.estado) ?? 0) + 1);

  const filas = (Object.keys(ETIQUETA_ESTADO_TRAFICO) as EstadoTramo[])
    .map((estado) => {
      const [r, g, b] = COLOR_ESTADO_TRAFICO[estado];
      return `<div class="trafico-leyenda__row">
        <span class="trafico-leyenda__dot" style="background:rgb(${r},${g},${b})"></span>
        ${ETIQUETA_ESTADO_TRAFICO[estado]} (${conteos.get(estado) ?? 0})
      </div>`;
    })
    .join('');

  const cortados = conteos.get('cortado') ?? 0;
  const problematicos = (conteos.get('denso') ?? 0) + (conteos.get('congestionado') ?? 0) + cortados;
  root.innerHTML = `
    <div class="info-panel__desc">Tráfico — ${problematicos === 0 ? 'todo fluido' : `${problematicos} tramo${problematicos === 1 ? '' : 's'} con carga`}</div>
    ${filas}
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', tramos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;

  registrarKpi({
    clave: 'trafico',
    etiqueta: 'Tráfico',
    valor: problematicos === 0 ? 'fluido' : `${problematicos} con carga`,
    tono: cortados > 0 ? 'urgente' : problematicos > 0 ? 'aviso' : 'ok',
    capaRelacionada: 'toggle-trafico',
  });
}

async function fetchEstadoTraficoActual(): Promise<{ tramos: TramoTrafico[]; fresh: boolean }> {
  const res = await fetch('/api/trafico/v1/estado');
  if (!res.ok) throw new Error(`GET /api/trafico/v1/estado -> HTTP ${res.status}`);
  return (await res.json()) as { tramos: TramoTrafico[]; fresh: boolean };
}

// Spec 017 — sparkline de congestión media de ciudad, últimas 24h. El
// histórico se acumula solo con el cron de GitHub Actions (ver
// .github/workflows/trafico-historico-cron.yml) — recién mergeado apenas
// tiene puntos, así que el "todavía no hay suficiente histórico" es un
// estado normal a corto plazo, no un error.
const SPARK_WIDTH = 140;
const SPARK_HEIGHT = 28;

function renderTraficoHistoricoPanel(root: HTMLDivElement, historico: HistoricoTrafico, fresh: boolean): void {
  if (historico.puntos.length < 2) {
    root.innerHTML = `
      <div class="info-panel__desc">Histórico de tráfico</div>
      <div class="info-panel__meta">Todavía no hay suficiente histórico (empieza a acumularse cada hora)</div>
    `;
    return;
  }

  const valores = historico.puntos.map((p) => p.congestion);
  const puntosSvg = sparklinePath(valores, SPARK_WIDTH, SPARK_HEIGHT);
  const ultimo = Math.round((valores[valores.length - 1] ?? 0) * 100);

  root.innerHTML = `
    <div class="info-panel__desc">Congestión de ciudad — últimas 24h</div>
    <svg class="trafico-historico__spark" viewBox="0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}" preserveAspectRatio="none">
      <polyline points="${puntosSvg}" fill="none" stroke="#b45309" stroke-width="2" />
    </svg>
    <div class="info-panel__value info-panel__value--small">${ultimo}% ahora</div>
    <div class="info-panel__meta">${metaFrescura('Mirall (histórico)', historico.fetchedAt, fresh)}</div>
  `;
}

async function fetchTraficoHistoricoCiudad(): Promise<{ historico: HistoricoTrafico; fresh: boolean }> {
  const res = await fetch('/api/trafico/v1/historico?dias=1');
  if (!res.ok) throw new Error(`GET /api/trafico/v1/historico -> HTTP ${res.status}`);
  const body = (await res.json()) as { historico: HistoricoTrafico };
  return { historico: body.historico, fresh: true };
}

// Rojo (casi sin bicis) -> verde (bicis de sobra); gris si la estación está cerrada.
function colorEstacionValenbisi(estacion: EstacionValenbisi): Color {
  if (!estacion.abierta) return [158, 158, 158, 160];
  const ratio = estacion.capacidadTotal > 0 ? estacion.bicisDisponibles / estacion.capacidadTotal : 0;
  return [Math.round(220 - ratio * 180), Math.round(60 + ratio * 140), 60, 210];
}

function renderValenbisiLeyenda(root: HTMLDivElement, estaciones: EstacionValenbisi[], fresh: boolean): void {
  const totalBicis = estaciones.reduce((sum, e) => sum + e.bicisDisponibles, 0);
  const cerradas = estaciones.filter((e) => !e.abierta).length;
  root.innerHTML = `
    <div class="info-panel__desc">Valenbisi — ${estaciones.length} estaciones</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(40,200,60)"></span>${totalBicis} bicis disponibles</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(158,158,158)"></span>${cerradas} cerradas</div>
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', estaciones[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchEstacionesValenbisiActual(): Promise<{ estaciones: EstacionValenbisi[]; fresh: boolean }> {
  const res = await fetch('/api/valenbisi/v1/estaciones');
  if (!res.ok) throw new Error(`GET /api/valenbisi/v1/estaciones -> HTTP ${res.status}`);
  return (await res.json()) as { estaciones: EstacionValenbisi[]; fresh: boolean };
}

// Verde (libre) -> rojo (casi lleno), según ocupacionPorcentaje 0-100; gris si
// el sensor no reporta (sinDatos, ver src/services/aparcamiento.ts) — nunca se
// interpreta el centinela negativo como "0% ocupado".
function colorOcupacionAparcamiento(aparcamiento: Aparcamiento): Color {
  if (aparcamiento.sinDatos) return [158, 158, 158, 160];
  const ratio = Math.min(1, Math.max(0, aparcamiento.ocupacionPorcentaje / 100));
  return [Math.round(60 + ratio * 180), Math.round(200 - ratio * 160), 60, 210];
}

function renderAparcamientoLeyenda(root: HTMLDivElement, aparcamientos: Aparcamiento[], fresh: boolean): void {
  const conDatos = aparcamientos.filter((a) => !a.sinDatos);
  const plazasLibres = conDatos.reduce((sum, a) => sum + a.plazasLibres, 0);
  const sinDatos = aparcamientos.length - conDatos.length;
  root.innerHTML = `
    <div class="info-panel__desc">Aparcamientos — ${aparcamientos.length} parkings</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(60,200,60)"></span>${plazasLibres} plazas libres (${conDatos.length} parkings con dato)</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(158,158,158)"></span>${sinDatos} sin datos (sensor caído)</div>
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', aparcamientos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchAparcamientosActual(): Promise<{ aparcamientos: Aparcamiento[]; fresh: boolean }> {
  const res = await fetch('/api/aparcamiento/v1/estado');
  if (!res.ok) throw new Error(`GET /api/aparcamiento/v1/estado -> HTTP ${res.status}`);
  return (await res.json()) as { aparcamientos: Aparcamiento[]; fresh: boolean };
}

// v4 (spec 010 §5/§10) — el índice 0-100 se retira; el nivel es ordinal de
// 2 escalones (seguimiento/prioritario) + un tercer estado visual de reposo
// ('sin-senal') con dos tonos de gris según si el distrito tiene tramos de
// tráfico suficientes para evaluar o no ("gris tramado" de la spec — deck.gl
// no soporta patrones de relleno sin shaders propios, se aproxima con menor
// opacidad, documentado aquí en vez de fingir un tramado real).
const COLOR_NIVEL_PULSO: Record<'seguimiento' | 'prioritario', Color> = {
  seguimiento: [255, 193, 7, 200],
  prioritario: [211, 47, 47, 210],
};
const COLOR_PULSO_SIN_SENAL: Color = [158, 158, 158, 90];
const COLOR_PULSO_MONITORIZACION_INSUFICIENTE: Color = [158, 158, 158, 35];

function colorChoroplethPulso(d: PulsoDistrito | undefined): Color {
  if (!d) return COLOR_PULSO_SIN_SENAL;
  if (d.nivel === 'prioritario') return COLOR_NIVEL_PULSO.prioritario;
  if (d.nivel === 'seguimiento') return COLOR_NIVEL_PULSO.seguimiento;
  return d.monitorizacion === 'insuficiente' ? COLOR_PULSO_MONITORIZACION_INSUFICIENTE : COLOR_PULSO_SIN_SENAL;
}

/** Escenarios que la UI pinta (marcador + choropleth): vivo + confirmado — los 'sombra' y los no confirmados quedan solo para trazabilidad (spec 010 §4). */
function escenariosVivosConfirmados(
  distritos: PulsoDistrito[],
): Array<{ distritoCodigo: string; distritoNombre: string; escenario: EscenarioActivo }> {
  return distritos.flatMap((d) =>
    d.escenariosActivos
      .filter((e) => e.modo === 'vivo' && e.confirmado)
      .map((escenario) => ({ distritoCodigo: d.distritoCodigo, distritoNombre: d.distritoNombre, escenario })),
  );
}

function renderPulsoLeyenda(root: HTMLDivElement, distritos: PulsoDistrito[], fresh: boolean): void {
  const prioritarios = distritos.filter((d) => d.nivel === 'prioritario');
  const seguimiento = distritos.filter((d) => d.nivel === 'seguimiento');
  const insuficientes = distritos.filter((d) => d.nivel === 'sin-senal' && d.monitorizacion === 'insuficiente');
  const activos = escenariosVivosConfirmados(distritos);

  registrarKpi({
    clave: 'pulso',
    etiqueta: 'Pulso',
    valor:
      prioritarios.length + seguimiento.length === 0
        ? 'sin señal'
        : `${prioritarios.length} prioritario${prioritarios.length === 1 ? '' : 's'} · ${seguimiento.length} seguimiento`,
    tono: prioritarios.length > 0 ? 'urgente' : seguimiento.length > 0 ? 'aviso' : 'ok',
    capaRelacionada: 'toggle-pulso',
  });

  // spec 036 — si hay un distrito en foco, se antepone su nivel.
  const foco = getFocoDistrito();
  const enFoco = foco ? distritos.find((d) => d.distritoCodigo === foco.codigo) : undefined;

  const filasEscenarios = activos
    .map(({ distritoNombre, escenario }) => {
      const [r, g, b] = COLOR_NIVEL_PULSO[escenario.nivel];
      return `<div class="trafico-leyenda__row">
        <span class="trafico-leyenda__dot" style="background:rgb(${r},${g},${b})"></span>
        ${escapeHtml(distritoNombre)}: ${escapeHtml(escenario.motivo)}
      </div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="info-panel__desc">Pulso de Distrito${activos.length > 0 ? ` — ${activos.length} escenario${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}` : ' — sin escenarios activos'}</div>
    ${enFoco ? `<div class="pulso-leyenda__foco">${escapeHtml(enFoco.distritoNombre)}: <strong>${enFoco.nivel === 'sin-senal' ? 'sin señal' : enFoco.nivel}</strong></div>` : ''}
    ${filasEscenarios || '<div class="trafico-leyenda__row">Sin escenarios activos ahora mismo.</div>'}
    <div class="info-panel__meta">${prioritarios.length} prioritario · ${seguimiento.length} seguimiento · ${insuficientes.length} con monitorización insuficiente</div>
    <div class="info-panel__meta">Heurística documentada, no validada contra ground truth (spec 010 §7).</div>
    <div class="info-panel__meta">${metaFrescura('Mirall (escenarios)', distritos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchPulsoDistritoActual(): Promise<{ distritos: PulsoDistrito[]; fresh: boolean }> {
  const res = await fetch('/api/pulso/v1/distrito');
  if (!res.ok) throw new Error(`GET /api/pulso/v1/distrito -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: PulsoDistrito[]; fresh: boolean };
}

// Dorado — tema Fallas. Infantiles algo más claro para distinguirlos.
const COLOR_MONUMENTO_FALLA: Color = [230, 160, 20, 220];
const COLOR_MONUMENTO_FALLA_INFANTIL: Color = [240, 195, 100, 220];
const COLOR_CARPA_FALLA: Color = [230, 100, 20, 90];
const COLOR_ZONA_MOVILIDAD_REDUCIDA: Color = [180, 30, 140, 100];

function renderFallasLeyenda(root: HTMLDivElement, datos: DatosFallas, fresh: boolean): void {
  const adultos = datos.monumentos.filter((m) => !m.esInfantil).length;
  const infantiles = datos.monumentos.filter((m) => m.esInfantil).length;
  root.innerHTML = `
    <div class="info-panel__desc">Fallas — ${adultos + infantiles} monumentos</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(230,160,20)"></span>${adultos} monumentos</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(240,195,100)"></span>${infantiles} infantiles</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(230,100,20)"></span>${datos.carpas.length} carpas</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(180,30,140)"></span>${datos.zonasMovilidadReducida.length} zonas de movilidad reducida</div>
    ${datos.zonasMovilidadReducida.length === 0 ? '<div class="info-panel__meta">Sin cortes activos fuera de temporada</div>' : ''}
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', datos.monumentos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchDatosFallasActual(): Promise<DatosFallas & { fresh: boolean }> {
  const res = await fetch('/api/fallas/v1/actual');
  if (!res.ok) throw new Error(`GET /api/fallas/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as DatosFallas & { fresh: boolean };
}

// Azul (agua) — distinto del rojo/naranja/dorado ya usados por otras capas.
// Gris neutro cuando `activo` es false (sin lluvia registrada): el índice es
// 0 por diseño de la fórmula (spec 046 §3), no se pinta como si fuera "riesgo
// bajo" — es "no aplica ahora mismo".
const COLOR_ESCORRENTIA_INACTIVO: Color = [148, 163, 184, 40];
function colorChoroplethEscorrentia(d: RiesgoEscorrentiaDistrito | undefined): Color {
  if (!d || !d.activo) return COLOR_ESCORRENTIA_INACTIVO;
  const t = d.indiceRelativo / 100;
  return [Math.round(191 - t * 150), Math.round(219 - t * 130), 255, Math.round(60 + t * 170)];
}

function renderEscorrentiaLeyenda(root: HTMLDivElement, distritos: RiesgoEscorrentiaDistrito[], fresh: boolean): void {
  const activos = distritos.filter((d) => d.activo).sort((a, b) => b.indiceRelativo - a.indiceRelativo);
  const peor = activos[0];
  root.innerHTML =
    activos.length === 0
      ? `
        <div class="info-panel__desc">Riesgo de acumulación de agua</div>
        <div class="trafico-leyenda__row">Sin lluvia registrada ahora mismo — indicador inactivo en los 19 distritos</div>
        <div class="info-panel__meta">${metaFrescura('Geoportal + Open-Meteo', distritos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
      `
      : `
        <div class="info-panel__desc">Riesgo de acumulación de agua — ${activos.length} distrito${activos.length === 1 ? '' : 's'} con lluvia activa</div>
        <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(13,71,161)"></span>Peor comparativamente: ${escapeHtml(peor!.distritoNombre)} (${peor!.indiceRelativo})</div>
        <div class="info-panel__meta">Estimación relativa, no una probabilidad de inundación — no sustituye avisos oficiales</div>
        <div class="info-panel__meta">${metaFrescura('Geoportal + Open-Meteo', distritos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
      `;
}

async function fetchRiesgoEscorrentiaActual(): Promise<{ distritos: RiesgoEscorrentiaDistrito[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/riesgo-escorrentia');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/riesgo-escorrentia -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: RiesgoEscorrentiaDistrito[]; fresh: boolean };
}

// specs 050/051 — reutiliza tal cual el endpoint ya `Implemented` de spec 044,
// sin tocar su contrato de datos (ver specs/050-temperatura-por-zona-capa.md §2).
async function fetchEstacionesAvametActual(): Promise<{ estaciones: EstacionAvamet[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/avamet');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/avamet -> HTTP ${res.status}`);
  return (await res.json()) as { estaciones: EstacionAvamet[]; fresh: boolean };
}

// v2 (2026-09-25, petición del usuario) — estilo "insignia con valor", como
// el mapa embebido de AVAMET (mxo-mxo.php, verificado en vivo: círculo de
// color fijo en pantalla con el número en blanco dentro, mismo tamaño a
// cualquier zoom). Antes era un `ScatterplotLayer` sin texto — ver histórico
// en specs/050 y 051. Radio en píxeles (no metros): un valor legible tiene
// que medir lo mismo en pantalla se acerque o aleje el mapa.
const RADIO_INSIGNIA_ZONA_PX = 14;

/**
 * Compone la insignia "círculo de color fijo + valor encima" (spec 050/051):
 * deck.gl no tiene un tipo de capa único para esto, siempre son 2 capas —
 * `ScatterplotLayer` (radio en píxeles, mide lo mismo a cualquier zoom) +
 * `TextLayer` centrado encima. `updateTriggerFillColor`/`updateTriggerText`
 * son opcionales: solo hace falta pasarlos cuando el accessor correspondiente
 * es una función que depende del propio dato (p. ej. un color por gradiente),
 * no cuando es un color fijo.
 */
function crearCapaInsignia<T>(opciones: {
  id: string;
  data: T[];
  getPosition: (d: T) => [number, number];
  getFillColor: Color | ((d: T) => Color);
  getText: (d: T) => string;
  textSize?: number;
  updateTriggerFillColor?: unknown;
  updateTriggerText?: unknown;
}): [ScatterplotLayer<T>, TextLayer<T>] {
  const { id, data, getPosition, getFillColor, getText, textSize = 12, updateTriggerFillColor, updateTriggerText } = opciones;
  return [
    new ScatterplotLayer<T>({
      id,
      data,
      pickable: false,
      getPosition,
      getFillColor,
      stroked: true,
      getLineColor: [255, 255, 255, 230],
      lineWidthMinPixels: 1.5,
      getRadius: RADIO_INSIGNIA_ZONA_PX,
      radiusUnits: 'pixels',
      updateTriggers: updateTriggerFillColor !== undefined ? { getFillColor: [updateTriggerFillColor] } : undefined,
    }),
    new TextLayer<T>({
      id: `${id}-valor`,
      data,
      pickable: false,
      getPosition,
      getText,
      getSize: textSize,
      getColor: [255, 255, 255, 255],
      fontWeight: 700,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      outlineWidth: 2,
      outlineColor: [0, 0, 0, 160],
      updateTriggers: updateTriggerText !== undefined ? { getText: [updateTriggerText] } : undefined,
    }),
  ];
}

// Spec 050 — gradiente azul (frío) a rojo (cálido), acotado a un rango de
// temperatura urbana realista para Valencia (10-35°C); fuera de rango se
// satura al extremo más cercano, no se extrapola el color.
const TEMPERATURA_ZONA_MIN_C = 10;
const TEMPERATURA_ZONA_MAX_C = 35;
function colorTemperaturaZona(estacion: EstacionAvamet): Color {
  const t = Math.min(
    1,
    Math.max(0, (estacion.temperaturaC - TEMPERATURA_ZONA_MIN_C) / (TEMPERATURA_ZONA_MAX_C - TEMPERATURA_ZONA_MIN_C)),
  );
  return [Math.round(40 + t * 215), Math.round(120 - t * 100), Math.round(215 - t * 195), 220];
}

function renderTemperaturaZonaLeyenda(root: HTMLDivElement, estaciones: EstacionAvamet[], fresh: boolean): void {
  if (estaciones.length === 0) {
    root.innerHTML = `<div class="info-panel__desc">Temperatura por zona — sin estaciones disponibles ahora mismo</div>`;
    return;
  }
  const masCalida = estaciones.reduce((a, b) => (b.temperaturaC > a.temperaturaC ? b : a));
  const masFria = estaciones.reduce((a, b) => (b.temperaturaC < a.temperaturaC ? b : a));
  root.innerHTML = `
    <div class="info-panel__desc">Temperatura por zona — ${estaciones.length} estaciones reales</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(255,20,20)"></span>Más cálida: ${escapeHtml(masCalida.nombre)} (${masCalida.temperaturaC}°C)</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(40,120,215)"></span>Más fría: ${escapeHtml(masFria.nombre)} (${masFria.temperaturaC}°C)</div>
    <div class="info-panel__meta">Solo estas ${estaciones.length} ubicaciones — no es una interpolación de toda la ciudad</div>
    <div class="info-panel__meta">${metaFrescura('AVAMET', estaciones[0]?.observadoEn ?? new Date().toISOString(), fresh)}</div>
  `;
}

// Spec 051 v2 — un único color (azul); el mm exacto ahora se lee en la
// insignia (ver RADIO_INSIGNIA_ZONA_PX), así que el radio deja de codificar
// la cantidad (antes era la única señal — v1, sin texto). 0mm no se oculta:
// es información, igual que antes.
const COLOR_PRECIPITACION_ZONA: Color = [30, 100, 220, 210];

function renderPrecipitacionZonaLeyenda(root: HTMLDivElement, estaciones: EstacionAvamet[], fresh: boolean): void {
  if (estaciones.length === 0) {
    root.innerHTML = `<div class="info-panel__desc">Precipitación — sin estaciones disponibles ahora mismo</div>`;
    return;
  }
  const conLluvia = estaciones.filter((e) => e.precipitacionDiaMm > 0).sort((a, b) => b.precipitacionDiaMm - a.precipitacionDiaMm);
  root.innerHTML =
    conLluvia.length === 0
      ? `
        <div class="info-panel__desc">Precipitación — ${estaciones.length} estaciones reales</div>
        <div class="trafico-leyenda__row">Sin lluvia registrada hoy en ninguna estación</div>
        <div class="info-panel__meta">${metaFrescura('AVAMET', estaciones[0]?.observadoEn ?? new Date().toISOString(), fresh)}</div>
      `
      : `
        <div class="info-panel__desc">Precipitación — ${conLluvia.length} de ${estaciones.length} estaciones con lluvia hoy</div>
        <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(30,100,220)"></span>Máxima hoy: ${escapeHtml(conLluvia[0]!.nombre)} (${conLluvia[0]!.precipitacionDiaMm} mm)</div>
        <div class="info-panel__meta">${metaFrescura('AVAMET', estaciones[0]?.observadoEn ?? new Date().toISOString(), fresh)}</div>
      `;
}

// Spec 049 — morado/violeta: no usado todavía por ninguna otra capa.
const COLOR_ZONA_ZAS: Color = [147, 51, 234, 90];

// Mismas 6 bandas y colores que el Mapa Estratégico de Ruido oficial del
// geoportal (renderer de .../Salud/MapServer/144, verificado en vivo en la
// investigación de spec 049 §2) — no se inventa una escala de color nueva.
function colorBandaRuido(db: number): Color {
  if (db < 55) return [0, 153, 51, 220];
  if (db < 60) return [0, 204, 51, 220];
  if (db < 65) return [204, 204, 2, 220];
  if (db < 70) return [255, 205, 105, 220];
  if (db < 75) return [255, 128, 2, 220];
  return [255, 2, 2, 220];
}

function renderZonasZasLeyenda(root: HTMLDivElement, zonas: ZonaZas[], fresh: boolean): void {
  const nombres = [...new Set(zonas.map((z) => z.nombre))];
  root.innerHTML = `
    <div class="info-panel__desc">Zonas Acústicamente Saturadas — ${nombres.length} declaradas</div>
    <div class="trafico-leyenda__row">${nombres.map(escapeHtml).join(', ') || 'Sin zonas disponibles'}</div>
    <div class="info-panel__meta">Russafa (ZAS más reciente) todavía no está en esta capa del geoportal — ver ruido en directo en /inteligencia</div>
    <div class="info-panel__meta">${metaFrescura('Geoportal de Valencia', zonas[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchPanelZasActual(): Promise<PanelZas & { fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/zas');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/zas -> HTTP ${res.status}`);
  return (await res.json()) as PanelZas & { fresh: boolean };
}

function renderSonometrosRuzafaPanel(root: HTMLDivElement, sonometros: SonometroRuzafa[], fresh: boolean): void {
  if (sonometros.length === 0) {
    root.innerHTML = `
      <div class="media-panel__header">Ruido en Russafa (ZAS)</div>
      <div class="tendencia-panel__insuficiente">Sonómetros no disponibles ahora mismo.</div>
    `;
    return;
  }
  const filas = [...sonometros]
    .sort((a, b) => b.laeqDb - a.laeqDb)
    .map(
      (s) => `
        <div class="trafico-leyenda__row">
          <span class="trafico-leyenda__dot" style="background:rgb(${colorBandaRuido(s.laeqDb).slice(0, 3).join(',')})"></span>
          ${escapeHtml(s.direccion)} — ${s.laeqDb.toFixed(1)} dBA
        </div>`,
    )
    .join('');
  root.innerHTML = `
    <div class="media-panel__header">Ruido en Russafa (ZAS) — ${sonometros.length} sonómetros</div>
    <div class="agenda-panel__aviso">Nivel medio diario (LAeq) del día anterior completo, no instantáneo. Sin coordenadas verificadas para pintarlos en el mapa — ver spec 049 §7.</div>
    <div class="media-panel__list">${filas}</div>
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València (VLCi)', sonometros[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

// Spec 052 v2 — tinta hipsométrica de verdad, no un lerp de 2 colores: la
// convención cartográfica centenaria (IGN, Natural Earth "cross-blended
// hypsometric tints") es verde -> amarillo/ocre -> siena/marrón con varias
// paradas de color, normalmente pensada para 0-4000 m de sierra. Valencia
// es una ciudad casi plana (rango real de la rejilla del IGN: 0.26-50.7 m,
// ver data/altimetria-puntos.json) — aplicar esa escala tal cual la dejaría
// plana/inútil, así que se re-escala al rango real de la ciudad (0-45 m)
// con MÁS paradas de color en la franja baja (0-20 m, donde cae el 90% de
// los puntos reales — ver histograma en spec 052 v2 §5) y menos en la alta
// (20-45 m, apenas unos pocos puntos, probable ruido de borde del WMS más
// que relieve real).
const RAMPA_HIPSOMETRICA: ReadonlyArray<{ m: number; rgb: [number, number, number] }> = [
  { m: 0, rgb: [27, 94, 32] }, // verde oscuro — litoral/huerta, cota ~0
  { m: 5, rgb: [76, 140, 64] },
  { m: 10, rgb: [142, 172, 79] },
  { m: 15, rgb: [190, 183, 93] },
  { m: 20, rgb: [223, 179, 95] }, // amarillo-ocre
  { m: 30, rgb: [200, 138, 82] },
  { m: 45, rgb: [141, 94, 72] }, // siena — cota alta, interior
];

function colorHipsometrico(elevacionM: number, alpha = 190): Color {
  const min = RAMPA_HIPSOMETRICA[0]!;
  const max = RAMPA_HIPSOMETRICA[RAMPA_HIPSOMETRICA.length - 1]!;
  const m = Math.min(max.m, Math.max(min.m, elevacionM));
  for (let i = 0; i < RAMPA_HIPSOMETRICA.length - 1; i++) {
    const a = RAMPA_HIPSOMETRICA[i]!;
    const b = RAMPA_HIPSOMETRICA[i + 1]!;
    if (m <= b.m) {
      const t = (m - a.m) / (b.m - a.m);
      return [
        Math.round(a.rgb[0] + t * (b.rgb[0] - a.rgb[0])),
        Math.round(a.rgb[1] + t * (b.rgb[1] - a.rgb[1])),
        Math.round(a.rgb[2] + t * (b.rgb[2] - a.rgb[2])),
        alpha,
      ];
    }
  }
  return [max.rgb[0], max.rgb[1], max.rgb[2], alpha];
}

/** CSS del degradado de la leyenda — construido de la misma rampa que pinta el mapa, nunca puede desincronizarse. */
function cssGradienteHipsometrico(): string {
  const total = RAMPA_HIPSOMETRICA[RAMPA_HIPSOMETRICA.length - 1]!.m;
  const paradas = RAMPA_HIPSOMETRICA.map((s) => `rgb(${s.rgb.join(',')}) ${((s.m / total) * 100).toFixed(1)}%`).join(', ');
  return `linear-gradient(90deg, ${paradas})`;
}

function renderAltimetriaLeyenda(root: HTMLDivElement, distritos: ResumenAltimetriaDistrito[], puntos: MuestraElevacion[]): void {
  if (distritos.length === 0 || puntos.length === 0) {
    root.innerHTML = `<div class="info-panel__desc">Altimetría — sin datos disponibles ahora mismo</div>`;
    return;
  }
  const masAlto = distritos.reduce((a, b) => (b.elevacionMediaM > a.elevacionMediaM ? b : a));
  const masBajo = distritos.reduce((a, b) => (b.elevacionMediaM < a.elevacionMediaM ? b : a));
  const rgbTexto = (m: number) => colorHipsometrico(m, 255).slice(0, 3).join(',');
  root.innerHTML = `
    <div class="info-panel__desc">Altimetría — tinta hipsométrica, ${puntos.length} puntos reales del IGN (rejilla ~600 m)</div>
    <div class="leyenda-gradiente"><span style="background:${cssGradienteHipsometrico()}"></span></div>
    <div class="leyenda-gradiente__extremos"><span>0 m</span><span>45 m</span></div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(${rgbTexto(masAlto.elevacionMediaM)})"></span>Distrito más alto (media): ${escapeHtml(masAlto.distritoNombre)} (${masAlto.elevacionMediaM.toFixed(1)} m)</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(${rgbTexto(masBajo.elevacionMediaM)})"></span>Distrito más bajo (media): ${escapeHtml(masBajo.distritoNombre)} (${masBajo.elevacionMediaM.toFixed(1)} m)</div>
    <div class="info-panel__meta">Rejilla real del IGN (~600 m de paso), cada celda es una muestra real — no un promedio por distrito</div>
    <div class="info-panel__meta">Fuente: IGN (Instituto Geográfico Nacional) · dato fijo, no cambia con el tiempo</div>
  `;
}

async function fetchAltimetriaActual(): Promise<{ distritos: ResumenAltimetriaDistrito[]; puntos: MuestraElevacion[] }> {
  const res = await fetch('/api/emergencia/v1/altimetria');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/altimetria -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: ResumenAltimetriaDistrito[]; puntos: MuestraElevacion[] };
}

// Spec 026 — mostaza/morado/verde azulado: distintos de rojo (reservado para
// spec 021), naranja (spec 022) y dorado (Fallas, spec 008).
const COLOR_TIPO_VIA_PUBLICA: Record<TipoIncidenciaViaPublica, Color> = {
  obras: [212, 160, 23, 210],
  incidencias: [142, 68, 173, 210],
  festejos: [26, 188, 156, 210],
};
const ZOOM_MINIMO_VIA_PUBLICA = 12; // spec 026 §5/§7 — evita saturar el mapa con 499 puntos a zoom de ciudad

const NOMBRE_TIPO_VIA_PUBLICA: Record<TipoIncidenciaViaPublica, string> = {
  obras: 'Obras',
  incidencias: 'Incidencias',
  festejos: 'Festejos',
};

function renderViaPublicaLeyenda(root: HTMLDivElement, incidencias: IncidenciaViaPublica[], fresh: boolean): void {
  const filas = (Object.keys(COLOR_TIPO_VIA_PUBLICA) as TipoIncidenciaViaPublica[])
    .map((tipo) => {
      const [r, g, b] = COLOR_TIPO_VIA_PUBLICA[tipo];
      const n = incidencias.filter((i) => i.tipo === tipo).length;
      return `<div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(${r},${g},${b})"></span>${NOMBRE_TIPO_VIA_PUBLICA[tipo]} (${n})</div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="info-panel__desc">Incidencias de vía pública — ${incidencias.length} activas</div>
    ${filas}
    <div class="info-panel__meta info-panel__meta--aviso">Las fechas son la vigencia del permiso administrativo, no la duración real confirmada del corte.</div>
    <div class="info-panel__meta">Solo visible acercando el mapa (zoom de calle) · toque un punto para ver el detalle</div>
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València — Geoportal', incidencias[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchIncidenciasViaPublicaActual(): Promise<{ incidencias: IncidenciaViaPublica[]; fresh: boolean }> {
  const res = await fetch('/api/via-publica/v1/incidencias');
  if (!res.ok) throw new Error(`GET /api/via-publica/v1/incidencias -> HTTP ${res.status}`);
  return (await res.json()) as { incidencias: IncidenciaViaPublica[]; fresh: boolean };
}

function formatoFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Tooltip mínimo específico de esta capa — ningún otro layer de puntos del proyecto usa popup todavía, no se construye un sistema genérico sin que otra spec lo pida. */
function buildViaPublicaTooltip(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'via-publica-tooltip';
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function renderViaPublicaTooltip(el: HTMLDivElement, incidencia: IncidenciaViaPublica | null, x: number, y: number): void {
  if (!incidencia) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.left = `${x + 12}px`;
  el.style.top = `${y + 12}px`;
  el.innerHTML = `
    <div class="via-publica-tooltip__tipo">${NOMBRE_TIPO_VIA_PUBLICA[incidencia.tipo]}</div>
    <div class="via-publica-tooltip__calle">${escapeHtml(incidencia.calle)}</div>
    <div class="via-publica-tooltip__afectacion">${escapeHtml(incidencia.afectacion)}</div>
    <div class="via-publica-tooltip__vigencia">Vigente hasta ${formatoFechaCorta(incidencia.vigenciaHasta)}</div>
  `;
}

function formatoTiempoRelativo(fechaIso: string): string {
  const minutos = Math.round((Date.now() - new Date(fechaIso).getTime()) / 60000);
  if (minutos < 1) return 'hace instantes';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

interface MediaPanel {
  root: HTMLDivElement;
  list: HTMLDivElement;
}

function buildMediaPanel(): MediaPanel {
  const root = document.createElement('div');
  root.id = 'media-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">Contexto mediático</div>
    <div class="media-panel__list" id="media-panel-list"></div>
    <div class="info-panel__meta" id="media-panel-meta"></div>
  `;
  document.body.appendChild(root);
  return { root, list: root.querySelector('#media-panel-list')! };
}

// v6 (DoD de V1, 2026-09-16): "es una herramienta para alertas" — un titular
// que lleva demasiado tiempo sin renovarse deja de ser señal de "ahora mismo"
// y se marca como caducado, sin ocultarlo (sigue siendo contexto válido).
const UMBRAL_CADUCADO_MS = 24 * 60 * 60 * 1000; // 24h

// Spec 023 §5: cada ítem enlaza a la noticia; si menciona distrito(s), se muestra
// como chip(s) — atenuado si el match solo pasó por la guarda de contexto de un
// nombre ambiguo (bajaConfianza).
function renderItemMediatico(item: ItemMediatico): string {
  const chips = item.distritosMencionados
    .map((m) => {
      const clase = m.bajaConfianza ? 'media-panel__chip media-panel__chip--baja-confianza' : 'media-panel__chip';
      return `<span class="${clase}">${escapeHtml(m.distritoNombre)}</span>`;
    })
    .join('');

  const viaGoogle = item.fuenteTipo === 'google-news' ? ' · vía Google News' : '';
  const caducado = Date.now() - new Date(item.publicadoEn).getTime() > UMBRAL_CADUCADO_MS;
  const claseItem = caducado ? 'media-panel__item media-panel__item--caducado' : 'media-panel__item';
  const avisoCaducado = caducado
    ? ' · <span class="media-panel__caducado" title="Más de 24h desde su publicación">caducado</span>'
    : '';
  return `
    <a class="${claseItem}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="media-panel__item-titulo">${escapeHtml(item.titulo)}</div>
      <div class="media-panel__item-meta">${escapeHtml(item.fuente)} · ${formatoTiempoRelativo(item.publicadoEn)}${viaGoogle}${avisoCaducado}</div>
      ${chips ? `<div class="media-panel__chips">${chips}</div>` : ''}
    </a>
  `;
}

function renderGrupoMediatico(titulo: string, items: ItemMediatico[]): string {
  if (items.length === 0) return '';
  return `
    <div class="media-panel__grupo-titulo">${escapeHtml(titulo)}</div>
    ${items.map(renderItemMediatico).join('')}
  `;
}

// Mismo TTL que la caché del endpoint (`api/mediatico/v1/items`, spec 009 §4)
// — no se importa desde ahí para no arrastrar código de servidor al bundle
// de cliente (ver comentario equivalente en el polling de más abajo).
const TTL_MEDIATICO_MS = 15 * 60 * 1000;

function renderMediaticoPanel(
  panel: MediaPanel,
  items: ItemMediatico[],
  fresh: boolean,
  fuentesFallidas: string[],
): void {
  const validos = items.filter((item) => /^https?:\/\//i.test(item.url)); // nunca renderizar javascript:/data: aunque venga en el feed

  // v6: ya no hay bucket "ocio y deporte" que ocultar tras un toggle — el
  // filtro (spec 009 §3.1 v6) ya descarta el deporte que no es fútbol antes
  // de llegar aquí, así que lo que sobrevive se trata como cualquier otro
  // titular de ciudad.

  // Spec 023 §5: agrupar por distrito mencionado; un ítem con dos distritos
  // aparece en los dos grupos. Sin mención -> bucket de ciudad (confirmado
  // por hito/institución) o "general, sin confirmar" (spec 009 §3.1).
  const porDistrito = new Map<string, { nombre: string; items: ItemMediatico[] }>();
  const ciudadSinDistrito: ItemMediatico[] = [];
  const generales: ItemMediatico[] = [];

  for (const item of validos) {
    if (item.distritosMencionados.length === 0) {
      (item.ambitoCiudad === 'confirmado' ? ciudadSinDistrito : generales).push(item);
      continue;
    }
    for (const mencion of item.distritosMencionados) {
      const grupo = porDistrito.get(mencion.distritoCodigo) ?? { nombre: mencion.distritoNombre, items: [] };
      grupo.items.push(item);
      porDistrito.set(mencion.distritoCodigo, grupo);
    }
  }

  // spec 036 — si hay un distrito en foco, se filtra a su grupo + los buckets de
  // ciudad/general (que también pueden afectarle); los demás distritos se ocultan.
  const foco = getFocoDistrito();
  const entradasDistrito = foco
    ? [...porDistrito.entries()].filter(([codigo]) => codigo === foco.codigo)
    : [...porDistrito.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));

  const gruposDistrito = entradasDistrito
    .map(([, grupo]) => renderGrupoMediatico(grupo.nombre, grupo.items))
    .join('');

  const partes = [
    gruposDistrito,
    renderGrupoMediatico('València (ciudad)', ciudadSinDistrito),
    renderGrupoMediatico('València (general, sin confirmar)', generales),
  ];

  const vacio = foco
    ? `<div class="tendencia-panel__insuficiente">Sin titulares que mencionen ${foco.nombre} ahora mismo.</div>`
    : '<div class="tendencia-panel__insuficiente">Sin titulares de la ciudad de València ahora mismo.</div>';
  panel.list.innerHTML = (foco ? `<div class="media-panel__foco">Foco: ${foco.nombre}</div>` : '') + (partes.join('') || vacio);

  const meta = panel.root.querySelector('#media-panel-meta')!;
  const fetchedAt = items[0]?.fetchedAt ?? new Date().toISOString();
  const minutosParaProxima = Math.round((TTL_MEDIATICO_MS - (Date.now() - new Date(fetchedAt).getTime())) / 60000);
  const proxima = fresh && minutosParaProxima > 0 ? ` · próxima actualización en ~${minutosParaProxima} min` : '';
  const avisoFallidas = fuentesFallidas.length > 0 ? ` · sin ${fuentesFallidas.join(', ')}` : '';
  meta.innerHTML = metaFrescura('Prensa local', fetchedAt, fresh) + proxima + avisoFallidas;
}

async function fetchItemsMediaticosActual(): Promise<{
  items: ItemMediatico[];
  fresh: boolean;
  fuentesFallidas: string[];
}> {
  const res = await fetch('/api/mediatico/v1/items');
  if (!res.ok) throw new Error(`GET /api/mediatico/v1/items -> HTTP ${res.status}`);
  return (await res.json()) as { items: ItemMediatico[]; fresh: boolean; fuentesFallidas: string[] };
}

// Spec 025 — mínimo de ítems en la ventana para mostrar el ranking como
// representativo; por debajo se avisa en vez de fingir precisión (§6 DoD).
const MINIMO_ITEMS_TENDENCIA = 5;

function buildTendenciaPanel(): { root: HTMLDivElement; list: HTMLDivElement; ventanaSelect: HTMLSelectElement } {
  const root = document.createElement('div');
  root.id = 'tendencia-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">
      Términos en tendencia
      <select id="tendencia-ventana-select" class="tendencia-panel__select">
        <option value="hora">Última hora</option>
        <option value="dia">Último día</option>
      </select>
    </div>
    <div class="media-panel__list" id="tendencia-panel-list"></div>
    <div class="info-panel__meta" id="tendencia-panel-meta"></div>
  `;
  document.body.appendChild(root);
  return {
    root,
    list: root.querySelector('#tendencia-panel-list')!,
    ventanaSelect: root.querySelector('#tendencia-ventana-select')!,
  };
}

function renderTendenciaPanel(
  panel: { root: HTMLDivElement; list: HTMLDivElement },
  ventana: VentanaTendencia,
  fresh: boolean,
): void {
  if (ventana.totalItems < MINIMO_ITEMS_TENDENCIA) {
    panel.list.innerHTML = `<div class="tendencia-panel__insuficiente">Muestra insuficiente (${ventana.totalItems} ítem${ventana.totalItems === 1 ? '' : 's'} en esta ventana) — no se muestra un ranking poco representativo.</div>`;
  } else {
    panel.list.innerHTML = ventana.terminos
      .map((t) => {
        const chips = t.distritosAsociados
          .map((codigo) => {
            const nombre = getLoadedDistricts().find((d) => d.codigo === codigo)?.nombre ?? codigo;
            return `<span class="media-panel__chip">${escapeHtml(nombre)}</span>`;
          })
          .join('');
        return `
          <div class="tendencia-panel__termino">
            <span class="tendencia-panel__palabra">${escapeHtml(t.formaOriginal)}</span>
            <span class="tendencia-panel__frecuencia">${t.frecuencia} ítem${t.frecuencia === 1 ? '' : 's'}</span>
            ${chips ? `<div class="media-panel__chips">${chips}</div>` : ''}
          </div>
        `;
      })
      .join('');
  }

  const meta = panel.root.querySelector('#tendencia-panel-meta')!;
  meta.innerHTML = `${metaFrescura('Mirall (tendencia)', ventana.fetchedAt, fresh)} · ${ventana.totalItems} ítems considerados`;
}

// spec 027 — agenda general de eventos culturales, vía scraping resiliente de
// valencia.es (no una API oficial, ver spec 027 §2). Mismo patrón visual que
// el contexto mediático (spec 009): panel de lista agrupado por distrito
// mencionado + bloque "València (general)".
interface AgendaPanel {
  root: HTMLDivElement;
  list: HTMLDivElement;
}

function buildAgendaPanel(): AgendaPanel {
  const root = document.createElement('div');
  root.id = 'agenda-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">Agenda de eventos</div>
    <div class="agenda-panel__aviso">Contenido extraído por scraping de fuentes públicas (valencia.es, Valencia CF, Levante UD, Roig Arena, Fundación Deportiva Municipal) — no es una API ni un dataset oficial.</div>
    <div class="media-panel__list" id="agenda-panel-list"></div>
    <div class="info-panel__meta" id="agenda-panel-meta"></div>
  `;
  document.body.appendChild(root);
  return { root, list: root.querySelector('#agenda-panel-list')! };
}

function formatoFechaEvento(fechaInicio: string, fechaFin: string): string {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  const fmtFin = fin.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  if (inicio.getTime() === fin.getTime()) return fmtFin;
  const fmtInicio = inicio.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${fmtInicio} – ${fmtFin}`;
}

function renderItemAgenda(evento: EventoAgenda): string {
  const chips = evento.distritosMencionados
    .map((m) => `<span class="media-panel__chip">${escapeHtml(m.distritoNombre)}</span>`)
    .join('');
  const chipImpacto = evento.impactoViaPublica ? '<span class="media-panel__chip media-panel__chip--impacto">⚠ Impacto en vía pública</span>' : '';
  return `
    <a class="media-panel__item" href="${escapeHtml(evento.url)}" target="_blank" rel="noopener noreferrer">
      <div class="media-panel__item-titulo">${escapeHtml(evento.titulo)}</div>
      <div class="media-panel__item-meta">${escapeHtml(evento.categoria || 'Sin categoría')} · ${formatoFechaEvento(evento.fechaInicio, evento.fechaFin)}</div>
      ${chipImpacto || chips ? `<div class="media-panel__chips">${chipImpacto}${chips}</div>` : ''}
    </a>
  `;
}

function renderGrupoAgenda(titulo: string, eventos: EventoAgenda[]): string {
  if (eventos.length === 0) return '';
  return `
    <div class="media-panel__grupo-titulo">${escapeHtml(titulo)}</div>
    ${eventos.map(renderItemAgenda).join('')}
  `;
}

function renderAgendaPanel(panel: AgendaPanel, snapshot: SnapshotAgenda): void {
  const avisoSospechoso = snapshot.estructuraSospechosa
    ? '<div class="tendencia-panel__insuficiente">⚠ Agenda posiblemente desactualizada — la fuente parece haber cambiado de estructura, revisar el scraper. Mostrando el último dato bueno conocido.</div>'
    : '';

  // spec 027 v4 §9 — sección propia con los eventos que generan afluencia/tráfico/
  // cortes reales (fútbol como local, Roig Arena, carreras), ordenados por fecha.
  // No se excluyen de la agrupación por distrito de más abajo — es una prioridad
  // visual añadida, no un reemplazo.
  const eventosImpacto = snapshot.eventos
    .filter((ev) => ev.impactoViaPublica)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  const seccionImpacto = renderGrupoAgenda('⚠ Impacto en vía pública', eventosImpacto);

  const porDistrito = new Map<string, { nombre: string; eventos: EventoAgenda[] }>();
  const generales: EventoAgenda[] = [];
  for (const ev of snapshot.eventos) {
    if (ev.distritosMencionados.length === 0) {
      generales.push(ev);
      continue;
    }
    for (const m of ev.distritosMencionados) {
      const grupo = porDistrito.get(m.distritoCodigo) ?? { nombre: m.distritoNombre, eventos: [] };
      grupo.eventos.push(ev);
      porDistrito.set(m.distritoCodigo, grupo);
    }
  }

  const gruposDistrito = [...porDistrito.entries()]
    .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
    .map(([, grupo]) => renderGrupoAgenda(grupo.nombre, grupo.eventos))
    .join('');

  const listaHtml = [seccionImpacto, gruposDistrito, renderGrupoAgenda('València (general)', generales)].join('');
  const vacio = '<div class="tendencia-panel__insuficiente">Sin eventos en la agenda ahora mismo.</div>';
  panel.list.innerHTML = avisoSospechoso + (listaHtml || (avisoSospechoso ? '' : vacio));

  const meta = panel.root.querySelector('#agenda-panel-meta')!;
  meta.innerHTML =
    metaFrescura('valencia.es (scraping)', snapshot.fetchedAt, !snapshot.estructuraSospechosa) +
    ` · ${snapshot.eventos.length} eventos`;
}

async function fetchAgendaEventosActual(): Promise<SnapshotAgenda> {
  const res = await fetch('/api/agenda/v1/eventos');
  if (!res.ok) throw new Error(`GET /api/agenda/v1/eventos -> HTTP ${res.status}`);
  return (await res.json()) as SnapshotAgenda;
}

// spec 048 — avisos oficiales de movilidad (incidencias y previsiones) de
// valencia.es. Mismo patrón visual que la agenda (spec 027): panel de lista
// con aviso persistente de scraping, sin puntos en el mapa (spec 048 §0/§5).
interface MovilidadPanel {
  root: HTMLDivElement;
  list: HTMLDivElement;
}

function buildMovilidadPanel(): MovilidadPanel {
  const root = document.createElement('div');
  root.id = 'movilidad-avisos-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">Incidencias y previsiones de movilidad</div>
    <div class="agenda-panel__aviso">Contenido extraído por scraping de valencia.es (Ayuntamiento de València) — no es una API ni un dataset oficial.</div>
    <div class="media-panel__list" id="movilidad-avisos-panel-list"></div>
    <div class="info-panel__meta" id="movilidad-avisos-panel-meta"></div>
  `;
  document.body.appendChild(root);
  return { root, list: root.querySelector('#movilidad-avisos-panel-list')! };
}

function formatoFechaAviso(fechaPublicacion: string): string {
  return new Date(fechaPublicacion).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderItemMovilidad(aviso: AvisoMovilidad): string {
  const chipTipo = aviso.tipo === 'prevision'
    ? '<span class="media-panel__chip media-panel__chip--impacto">Previsión</span>'
    : '<span class="media-panel__chip">Incidencia</span>';
  const chipLugar = aviso.lugar ? `<span class="media-panel__chip">${escapeHtml(aviso.lugar)}</span>` : '';
  const enlacePlano = aviso.planoUrl
    ? ` · <a href="${escapeHtml(aviso.planoUrl)}" target="_blank" rel="noopener noreferrer">Ver plano</a>`
    : '';
  return `
    <div class="media-panel__item">
      <div class="media-panel__item-meta">${formatoFechaAviso(aviso.fechaPublicacion)}${enlacePlano}</div>
      <div class="media-panel__item-titulo">${escapeHtml(aviso.descripcion)}</div>
      <div class="media-panel__chips">${chipTipo}${chipLugar}</div>
    </div>
  `;
}

function renderMovilidadPanel(panel: MovilidadPanel, snapshot: SnapshotAvisosMovilidad, fresh: boolean): void {
  const incidencias = snapshot.avisos.filter((a) => a.tipo === 'incidencia');
  const previsiones = snapshot.avisos.filter((a) => a.tipo === 'prevision');

  const bloque = (titulo: string, avisos: AvisoMovilidad[]): string =>
    avisos.length === 0
      ? ''
      : `<div class="media-panel__grupo-titulo">${escapeHtml(titulo)}</div>${avisos.map(renderItemMovilidad).join('')}`;

  const html = bloque('Previsiones', previsiones) + bloque('Incidencias', incidencias);
  panel.list.innerHTML = html || '<div class="tendencia-panel__insuficiente">Sin avisos de movilidad ahora mismo.</div>';

  const meta = panel.root.querySelector('#movilidad-avisos-panel-meta')!;
  meta.innerHTML = metaFrescura('valencia.es (scraping)', snapshot.fetchedAt, fresh) + ` · ${snapshot.avisos.length} avisos`;
}

async function fetchAvisosMovilidadActual(): Promise<{ snapshot: SnapshotAvisosMovilidad; fresh: boolean }> {
  const res = await fetch('/api/movilidad/v1/avisos-incidencias-previsiones');
  if (!res.ok) throw new Error(`GET /api/movilidad/v1/avisos-incidencias-previsiones -> HTTP ${res.status}`);
  const { fresh, ...snapshot } = (await res.json()) as SnapshotAvisosMovilidad & { fresh: boolean };
  return { snapshot, fresh };
}

async function fetchTendenciaActual(ventana: 'hora' | 'dia'): Promise<{ panel: VentanaTendencia; fresh: boolean }> {
  const res = await fetch(`/api/mediatico/v1/tendencia?ventana=${ventana}`);
  if (!res.ok) throw new Error(`GET /api/mediatico/v1/tendencia -> HTTP ${res.status}`);
  return (await res.json()) as { panel: VentanaTendencia; fresh: boolean };
}

interface ControlPanel {
  mockToggle: HTMLInputElement;
  horaSlider: HTMLInputElement;
  horaLabel: HTMLSpanElement;
  horaControl: HTMLDivElement;
  banner: HTMLDivElement;
  traficoToggle: HTMLInputElement;
  valenbisiToggle: HTMLInputElement;
  aparcamientoToggle: HTMLInputElement;
  pulsoToggle: HTMLInputElement;
  fallasToggle: HTMLInputElement;
  riesgoEscorrentiaToggle: HTMLInputElement;
  temperaturaZonaToggle: HTMLInputElement;
  zonasZasToggle: HTMLInputElement;
  precipitacionZonaToggle: HTMLInputElement;
  altimetriaToggle: HTMLInputElement;
  mediaToggle: HTMLInputElement;
  tendenciaToggle: HTMLInputElement;
  agendaToggle: HTMLInputElement;
  movilidadToggle: HTMLInputElement;
  zasRuidoToggle: HTMLInputElement;
  viaPublicaToggle: HTMLInputElement;
  camarasToggle: HTMLInputElement;
  /** spec 033: grupo plegable "Contexto e informativas" y sus adornos. */
  contextoDetails: HTMLDetailsElement;
  contextoContador: HTMLSpanElement;
  presetOperativaBtn: HTMLButtonElement;
}

const SELECTOR_CONTEXTO_ABIERTO_KEY = 'mirall:selector-contexto-abierto';

/** Checkbox desconectado del DOM, marcado — ver nota en `buildControlPanel`. */
function toggleSiempreActivo(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  return input;
}

function buildControlPanel(): ControlPanel {
  const panel = document.createElement('div');
  panel.id = 'controls';

  let contextoAbiertoInicial = false;
  try {
    contextoAbiertoInicial = localStorage.getItem(SELECTOR_CONTEXTO_ABIERTO_KEY) === '1';
  } catch {
    /* localStorage no disponible — arranca plegado */
  }

  panel.innerHTML = `
    <div class="controls__head">
      <span class="controls__title">Capas</span>
      <button type="button" id="preset-operativa" class="controls__preset" title="Enciende tráfico, Pulso de Distrito e incidencias de vía pública">Vista operativa</button>
    </div>
    <div class="controls__group controls__group--primaria">
      <div class="controls__group-head">Prioritarias</div>
      <label class="controls__row">
        <input type="checkbox" id="toggle-riesgo-escorrentia" />
        Riesgo de acumulación de agua
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-temperatura-zona" />
        Temperatura por zona
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-zonas-zas" />
        Zonas Acústicamente Saturadas
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-precipitacion-zona" />
        Precipitación
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-altimetria" />
        Altimetría
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-trafico" />
        Tráfico en tiempo real
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-pulso" />
        Pulso de Distrito
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-via-publica" />
        Incidencias de vía pública
      </label>
    </div>
    <details class="controls__group controls__group--contexto" id="controls-contexto"${contextoAbiertoInicial ? ' open' : ''}>
      <summary class="controls__group-head">
        Contexto e informativas
        <span id="contexto-contador" class="controls__badge"></span>
      </summary>
      <label class="controls__row">
        <input type="checkbox" id="toggle-mock" />
        Densidad de personas
        <span class="mock-badge" title="Datos sintéticos — spec 003, no representan actividad real">MOCK</span>
      </label>
      <div class="controls__row controls__row--hora" id="hora-control" hidden>
        <input type="range" id="hora-slider" min="0" max="23" step="1" value="14" />
        <span id="hora-label">14:00</span>
      </div>
      <label class="controls__row">
        <input type="checkbox" id="toggle-valenbisi" />
        Valenbisi
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-aparcamiento" />
        Aparcamiento
      </label>
      <label class="controls__row">
        <input type="checkbox" id="toggle-fallas" />
        Fallas
      </label>
    </details>
  `;
  document.body.appendChild(panel);

  const contextoDetails = panel.querySelector<HTMLDetailsElement>('#controls-contexto')!;
  contextoDetails.addEventListener('toggle', () => {
    try {
      localStorage.setItem(SELECTOR_CONTEXTO_ABIERTO_KEY, contextoDetails.open ? '1' : '0');
    } catch {
      /* no-op */
    }
  });

  const banner = document.createElement('div');
  banner.id = 'mock-banner';
  banner.textContent = 'Capa de datos SINTÉTICOS (MOCK) — no representa actividad real';
  banner.hidden = true;
  document.body.appendChild(banner);

  return {
    mockToggle: panel.querySelector('#toggle-mock')!,
    horaSlider: panel.querySelector('#hora-slider')!,
    horaLabel: panel.querySelector('#hora-label')!,
    horaControl: panel.querySelector('#hora-control')!,
    banner,
    traficoToggle: panel.querySelector('#toggle-trafico')!,
    valenbisiToggle: panel.querySelector('#toggle-valenbisi')!,
    aparcamientoToggle: panel.querySelector('#toggle-aparcamiento')!,
    pulsoToggle: panel.querySelector('#toggle-pulso')!,
    fallasToggle: panel.querySelector('#toggle-fallas')!,
    riesgoEscorrentiaToggle: panel.querySelector('#toggle-riesgo-escorrentia')!,
    temperaturaZonaToggle: panel.querySelector('#toggle-temperatura-zona')!,
    zonasZasToggle: panel.querySelector('#toggle-zonas-zas')!,
    precipitacionZonaToggle: panel.querySelector('#toggle-precipitacion-zona')!,
    altimetriaToggle: panel.querySelector('#toggle-altimetria')!,
    // spec 040 — cámaras/contexto mediático/tendencia/agenda dejan de ser filas
    // del selector (se mudan a la vista /inteligencia, siempre visibles ahí, no
    // capas de mapa que se enciendan/apaguen). Se crean como checkboxes
    // "toggle" desconectados del DOM, siempre marcados, solo para que el
    // cableado interno de cada panel (`panel.mediaToggle.addEventListener(...)`,
    // `montarCamarasPanel(toggle)`) siga funcionando sin tocar su lógica
    // (`docs/02_DEFINITION_OF_DONE_V1.md`, spec 040 §2: "reubicación, no
    // reimplementación") — `main()` dispara su `change` una vez tras cablear.
    mediaToggle: toggleSiempreActivo(),
    tendenciaToggle: toggleSiempreActivo(),
    agendaToggle: toggleSiempreActivo(),
    movilidadToggle: toggleSiempreActivo(),
    zasRuidoToggle: toggleSiempreActivo(),
    camarasToggle: toggleSiempreActivo(),
    viaPublicaToggle: panel.querySelector('#toggle-via-publica')!,
    contextoDetails,
    contextoContador: panel.querySelector('#contexto-contador')!,
    presetOperativaBtn: panel.querySelector('#preset-operativa')!,
  };
}

async function fetchDensidadMock(hora: string): Promise<DensidadDistritoMock[]> {
  const res = await fetch(`/api/mock/v1/densidad-personas?hora=${encodeURIComponent(hora)}`);
  if (!res.ok) throw new Error(`GET /api/mock/v1/densidad-personas -> HTTP ${res.status}`);
  const body = (await res.json()) as { densidad: DensidadDistritoMock[] };
  return body.densidad;
}

async function main(): Promise<void> {
  initPwa();
  initDeteccionDispositivo();
  mountChasis();

  const initialState = readStateFromUrl();

  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  const map = new maplibregl.Map({
    container: 'map',
    style: OPENFREEMAP_STYLE,
    center: initialState.center,
    zoom: initialState.zoom,
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  // Condición de carrera real (investigada 2026-09-25, ver memoria de
  // proyecto): `renderLayers()` se dispara desde ~30 sitios independientes
  // (toggles, polling, fetches, clics) sin ninguna coordinación entre ellos
  // ni con MapLibre, que carga su estilo/transform interno de forma
  // asíncrona. Cualquiera de esos ~30 disparadores puede ganarle la carrera
  // al propio `load` de MapLibre y empujar capas al overlay de deck.gl antes
  // de que el mapa esté listo para aceptarlas — de ahí el
  // `TypeError: reading 'height'` intermitente dentro del propio bundle de
  // maplibre-gl. No se soluciona añadiendo una comprobación en cada uno de
  // esos ~30 sitios (se olvidaría en el 31): se soluciona en el único punto
  // por el que TODOS pasan antes de tocar el motor de render, `overlay.
  // setProps()` dentro de `renderLayers()` — ver la comprobación de
  // `mapaListo` ahí abajo.
  let mapaListo = false;
  window.addEventListener('resize', () => map.resize());

  // Sin listener propio, MapLibre relanza sus 'error' internos como excepción
  // no controlada (ver investigación de la condición de carrera intermitente
  // en su render/cámara interna, solo en `npm run dev` — nunca en producción).
  // Esto no arregla esa causa raíz (aguas arriba, no en este código), pero
  // evita el "Uncaught" suelto en consola y deja rastro explícito si reaparece.
  map.on('error', (e) => {
    console.error('MapLibre: evento de error interno del mapa:', e.error);
  });

  let selectedDistrito: string | null = initialState.distrito;
  let mockVisible = false;
  let horaSimulada = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  let densidadMock: DensidadDistritoMock[] = [];
  let traficoVisible = false;
  let tramosTrafico: TramoTrafico[] = [];
  let valenbisiVisible = false;
  let estacionesValenbisi: EstacionValenbisi[] = [];
  let aparcamientoVisible = false;
  let aparcamientos: Aparcamiento[] = [];
  let pulsoVisible = false;
  let pulsoDistritos: PulsoDistrito[] = [];
  let fallasVisible = false;
  let datosFallas: DatosFallas = { monumentos: [], carpas: [], zonasMovilidadReducida: [] };
  let riesgoEscorrentiaVisible = false;
  let riesgoEscorrentia: RiesgoEscorrentiaDistrito[] = [];
  // specs 050/051 — temperatura y precipitación por zona son dos capas/toggles
  // independientes que comparten la misma fuente (AVAMET, ya usada por spec
  // 044): un solo fetch/poll sirve a las dos, ver iniciarPollingAvametSiHaceFalta.
  let temperaturaZonaVisible = false;
  let precipitacionZonaVisible = false;
  let estacionesAvamet: EstacionAvamet[] = [];
  let zonasZasVisible = false;
  let zonasZas: ZonaZas[] = [];
  // Spec 052 — dato estático (la altimetría no cambia), un único fetch la
  // primera vez que se activa el checkbox, sin polling (a diferencia de las
  // capas de arriba, que sí refrescan periódicamente).
  let altimetriaVisible = false;
  let altimetriaDistritos: ResumenAltimetriaDistrito[] = [];
  // v2 — rejilla real de puntos IGN (antes se descartaba tras agregar a
  // media por distrito, ver spec 052 v2 §5); es lo que pinta el mapa ahora.
  let altimetriaPuntos: MuestraElevacion[] = [];
  let altimetriaCargada = false;
  // v3 (DoD de V1, 2026-09-16) — los puntos calientes del mock de densidad
  // (más abajo) necesitan los monumentos falleros aunque la capa "Fallas" en
  // sí no esté activada; se cargan una vez, la primera vez que hagan falta.
  let fallasHotspotsCargados = false;
  let viaPublicaVisible = false;
  let incidenciasViaPublica: IncidenciaViaPublica[] = [];
  const viaPublicaTooltip = buildViaPublicaTooltip();

  // Flechas de sentido de circulación del grafo viario (spec 020 §5 / v4).
  // Se pintan (a) siempre con `?debug=grafo` — verificación del grafo — y
  // (b) mientras el modo cordón (021) o el simulador de cortes (022) están
  // activos, para que se vea la dirección de cada vía al planificar un corte
  // (petición del usuario, revisión del gemelo digital). Una flecha por
  // tramo del viewport a partir de zoom de calle: azul = unidireccional,
  // gris = bidireccional. En los modos cordón/simulador solo se pintan sobre
  // los tramos implicados en el análisis (ver renderLayers).
  const DEBUG_GRAFO = new URLSearchParams(window.location.search).get('debug') === 'grafo';
  const ZOOM_MINIMO_FLECHAS_SENTIDO = 15;
  let marcadoresSentidoGrafo: MarcadorSentido[] = [];
  if (DEBUG_GRAFO) {
    void cargarGrafoViario()
      .then((grafo) => {
        marcadoresSentidoGrafo = marcadoresSentido(grafo.tramos);
        renderLayers();
      })
      .catch((err: unknown) => console.error('?debug=grafo: no se pudo cargar el grafo viario:', err));
  }
  const flechasSentidoActivas = (): boolean =>
    DEBUG_GRAFO ||
    getEstadoModoCordon().fase !== 'inactivo' ||
    getEstadoModoSimulacion().fase !== 'inactivo';

  const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
  map.addControl(overlay);

  const distritos = await preloadDistrictGeometry();
  const featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry, DistritoProperties> = {
    type: 'FeatureCollection',
    features: distritos.map((d) => ({
      type: 'Feature',
      geometry: d.geometry,
      properties: { codigo: d.codigo, nombre: d.nombre },
    })),
  };

  function persistViewState(): void {
    const center = map.getCenter();
    writeStateToUrl({ center: [center.lng, center.lat], zoom: map.getZoom(), distrito: selectedDistrito });
  }

  function renderLayers(): void {
    const estadoCordon = getEstadoModoCordon();
    const cordonPropuesta = estadoCordon.resultado?.ok ? estadoCordon.resultado.propuesta : null;
    const cordonUbicacion = estadoCordon.ubicacion;
    const cordonCortesManuales = estadoCordon.cortesManuales;
    const cordonPropFuera = estadoCordon.propagacionFuera;
    const cordonSinEntradaFueraIds = cordonPropFuera?.sinEntrada.map((t) => t.idTramo) ?? [];
    const cordonSinSalidaFueraIds = cordonPropFuera?.sinSalida.map((t) => t.idTramo) ?? [];
    const cordonDesvioFueraIds = cordonPropFuera?.desvio.map((t) => t.idTramo) ?? [];

    const estadoSimulacion = getEstadoModoSimulacion();
    const tramosCortadosIds = estadoSimulacion.tramosCortados;
    const propagacionSim = estadoSimulacion.resultado;
    // "Sin salida" (violeta) reúne los tramos que ya no pueden volver al resto
    // de la ciudad + los que están aislados del todo; "sin entrada" (cian)
    // reúne los que ya no reciben tráfico + los aislados (spec 031 §3).
    const simSinSalidaIds = propagacionSim
      ? [...propagacionSim.tramosSinSalida, ...propagacionSim.tramosAislados].map((t) => t.idTramo)
      : [];
    const simSinEntradaIds = propagacionSim
      ? [...propagacionSim.tramosSinEntrada, ...propagacionSim.tramosAislados].map((t) => t.idTramo)
      : [];
    const simDesvioIds = propagacionSim?.tramosDesvioForzado.map((t) => t.idTramo) ?? [];
    const simRutas = estadoSimulacion.rutasAlternativas;
    const algunModoActivo = estadoCordon.fase !== 'inactivo' || estadoSimulacion.fase !== 'inactivo';

    // Flechas de sentido: con ?debug=grafo se pintan en todo el viewport
    // (ayuda de verificación); en los modos cordón/simulador solo sobre los
    // tramos IMPLICADOS en el análisis (cortes + propagación + rutas), para
    // no llenar el mapa de flechas — en móvil sobre todo se leía como ruido.
    let marcadoresFlechas: MarcadorSentido[] = [];
    if (DEBUG_GRAFO) {
      const b = map.getBounds();
      marcadoresFlechas = marcadoresSentidoGrafo.filter(
        (m) =>
          m.posicion[0] >= b.getWest() &&
          m.posicion[0] <= b.getEast() &&
          m.posicion[1] >= b.getSouth() &&
          m.posicion[1] <= b.getNorth(),
      );
    } else if (estadoSimulacion.fase !== 'inactivo') {
      marcadoresFlechas = marcadoresSentidoParaIds(
        [
          ...tramosCortadosIds,
          ...simSinEntradaIds,
          ...simSinSalidaIds,
          ...simDesvioIds,
          ...simRutas.flatMap((r) => r.tramosRuta),
        ],
        getTramoPorIdSimulacion,
      );
    } else if (estadoCordon.fase !== 'inactivo') {
      marcadoresFlechas = marcadoresSentidoParaIds(
        [
          ...(cordonPropuesta?.tramosCerrados ?? []),
          ...(cordonPropuesta?.tramosCorte ?? []),
          ...cordonCortesManuales,
          ...cordonSinEntradaFueraIds,
          ...cordonSinSalidaFueraIds,
          ...cordonDesvioFueraIds,
        ],
        getTramoPorId,
      );
    }

    // Puntos animados del desvío (spec 022 v6): recorren la ruta alternativa
    // de cada corte. La calle cortada NO se anima — lo que se ve moverse es
    // por dónde da la vuelta el tráfico.
    const faseReruta = (performance.now() % DURACION_CICLO_RERUTA_MS) / DURACION_CICLO_RERUTA_MS;
    const puntosReruta: Coordenada[] = [];
    for (const ruta of simRutas) {
      puntosReruta.push(
        ...puntosFlujoParaTramo(ruta.geometria, 'unidireccional', { fase: faseReruta, puntosPorSentido: 3 }),
      );
    }

    // Efecto de flujo animado — spec 004 (tráfico real), no spec 022. Se
    // quitó del simulador de cortes a petición del usuario: el simulador ya
    // muestra el resultado final (estático) del corte; el flujo en vivo
    // tiene más sentido en la capa de tráfico real, que es donde de verdad
    // hay circulación que visualizar. Solo tramos con circulación real
    // (nunca 'cortado' ni 'sin-datos' — no hay nada que fluya ahí).
    const faseFlujoTrafico = (performance.now() % DURACION_CICLO_FLUJO_TRAFICO_MS) / DURACION_CICLO_FLUJO_TRAFICO_MS;
    const puntosFlujoTrafico: Coordenada[] = [];
    if (traficoVisible) {
      for (const t of tramosTrafico) {
        if (t.estado === 'cortado' || t.estado === 'sin-datos') continue;
        // LineString o MultiLineString (spec 004 §3) — se anima cada parte
        // por separado. Sentido real desconocido en esta fuente (Geoportal,
        // distinta del grafo de spec 020) — se anima en el orden en que
        // llega la geometría, sin afirmar que sea el sentido real de circulación.
        const partes = t.geometry.type === 'LineString' ? [t.geometry.coordinates] : t.geometry.coordinates;
        for (const parte of partes) {
          puntosFlujoTrafico.push(
            ...puntosFlujoParaTramo(parte as Coordenada[], 'unidireccional', {
              fase: faseFlujoTrafico,
              puntosPorSentido: 2,
            }),
          );
        }
      }
    }

    const intensidadPorDistrito = new Map(densidadMock.map((d) => [d.distritoCodigo, d.intensidad]));
    const pulsoPorDistrito = new Map(pulsoDistritos.map((p) => [p.distritoCodigo, p]));
    const riesgoEscorrentiaPorDistrito = new Map(riesgoEscorrentia.map((d) => [d.distritoCodigo, d]));
    // v2 — la capa ya no usa este Map (pintaba por distrito); se mantiene
    // solo para la leyenda (más alto/más bajo). La rejilla se construye más
    // abajo, junto al resto de featureCollections derivadas.
    const altimetriaFeatureCollection = featureCollectionAltimetriaPuntos(altimetriaPuntos);
    // v4 (spec 010 §5) — escenarios vivo+confirmado, base de los marcadores y
    // de los puntos de tramo resaltados (primario); el choropleth de abajo es
    // el contexto.
    const pulsoEscenariosActivos = pulsoVisible ? escenariosVivosConfirmados(pulsoDistritos) : [];
    const pulsoTramosAfectados = pulsoEscenariosActivos.flatMap(({ escenario }) => escenario.tramosAfectados);
    // v3 (DoD de V1, 2026-09-16) — puntos calientes de densidad mock sobre los
    // monumentos falleros reales (spec 008, ya en memoria vía `datosFallas`),
    // en vez de solo un tinte plano por distrito. Cálculo en cliente porque es
    // una función pura y determinista, sin I/O (mismo guardarraíl de spec 003
    // §2) — no hace falta un endpoint nuevo para componer dos cachés.
    const puntosCalientesMock =
      mockVisible && datosFallas.monumentos.length > 0
        ? generarHotspotsDensidadMock(
            horaSimulada,
            datosFallas.monumentos.map((m) => ({ id: m.id, lat: m.lat, lon: m.lon })),
          )
        : [];
    const traficoFeatureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry, { estado: EstadoTramo }> = {
      type: 'FeatureCollection',
      features: ordenarTramosPorSeveridad(tramosTrafico).map((t) => ({
        type: 'Feature',
        geometry: t.geometry,
        properties: { estado: t.estado },
      })),
    };

    const layers = [
      mockVisible &&
        new GeoJsonLayer<DistritoProperties>({
          id: 'movimiento-personas-mock',
          data: featureCollection,
          stroked: false,
          filled: true,
          pickable: false,
          getFillColor: (f) => colorIntensidad(intensidadPorDistrito.get(f.properties.codigo) ?? 0),
          updateTriggers: { getFillColor: [densidadMock] },
        }),
        puntosCalientesMock.length > 0 &&
          new ScatterplotLayer<(typeof puntosCalientesMock)[number]>({
            id: 'movimiento-personas-mock-hotspots',
            data: puntosCalientesMock,
            pickable: false,
            getPosition: (p) => [p.lon, p.lat],
            getFillColor: (p) => colorIntensidad(p.intensidad),
            getRadius: (p) => 25 + p.intensidad * 55,
            radiusMinPixels: 4,
            radiusMaxPixels: 40,
            updateTriggers: { getPosition: [puntosCalientesMock], getFillColor: [puntosCalientesMock] },
          }),
        traficoVisible &&
          new GeoJsonLayer<{ estado: EstadoTramo }>({
            id: 'trafico',
            data: traficoFeatureCollection,
            stroked: true,
            filled: false,
            pickable: false,
            getLineColor: (f) => COLOR_ESTADO_TRAFICO[f.properties.estado],
            getLineWidth: (f) => ANCHO_ESTADO_TRAFICO[f.properties.estado],
            lineWidthMinPixels: 2,
            updateTriggers: { getLineColor: [tramosTrafico], getLineWidth: [tramosTrafico] },
          }),
        puntosFlujoTrafico.length > 0 &&
          new ScatterplotLayer<Coordenada>({
            id: 'trafico-flujo',
            data: puntosFlujoTrafico,
            pickable: false,
            getPosition: (p) => p,
            getFillColor: [255, 255, 255, 230],
            // Borde oscuro — sin esto, un punto blanco casi no se distingue
            // sobre el estilo de mapa claro (OpenFreeMap Liberty), sea cual
            // sea el color de fondo del tramo (verde/ámbar/naranja).
            stroked: true,
            getLineColor: [15, 31, 51, 220],
            lineWidthMinPixels: 1,
            getRadius: 7,
            radiusMinPixels: 3,
            radiusMaxPixels: 5,
          }),
        valenbisiVisible &&
          new ScatterplotLayer<EstacionValenbisi>({
            id: 'valenbisi',
            data: estacionesValenbisi,
            pickable: false,
            getPosition: (e) => [e.lon, e.lat],
            getFillColor: colorEstacionValenbisi,
            getRadius: 35,
            radiusMinPixels: 3,
            updateTriggers: { getFillColor: [estacionesValenbisi] },
          }),
        aparcamientoVisible &&
          new ScatterplotLayer<Aparcamiento>({
            id: 'aparcamiento',
            data: aparcamientos,
            pickable: false,
            getPosition: (a) => [a.lon, a.lat],
            getFillColor: colorOcupacionAparcamiento,
            getRadius: 45,
            radiusMinPixels: 4,
            updateTriggers: { getFillColor: [aparcamientos] },
          }),
        // v4 (spec 010 §5) — de contexto a primario: 1) choropleth del
        // distrito (contexto), 2) puntos de tramo afectado resaltados,
        // 3) marcador + etiqueta por escenario activo (lo más primario).
        pulsoVisible &&
          new GeoJsonLayer<DistritoProperties>({
            id: 'pulso-distrito',
            data: featureCollection,
            stroked: false,
            filled: true,
            pickable: false,
            getFillColor: (f) => colorChoroplethPulso(pulsoPorDistrito.get(f.properties.codigo)),
            updateTriggers: { getFillColor: [pulsoDistritos] },
          }),
        // Spec 052 v2 — rejilla real de ~198 celdas (antes: choropleth de 19
        // distritos), antes que riesgo-escorrentia en el array (se pinta
        // primero) para que, si ambas capas están activas a la vez, la de
        // riesgo de agua (más urgente/accionable) quede encima, nunca tapada.
        altimetriaVisible &&
          new GeoJsonLayer<{ elevacionM: number; distritoCodigo: string }>({
            id: 'altimetria',
            data: altimetriaFeatureCollection,
            stroked: false,
            filled: true,
            pickable: false,
            getFillColor: (f) => colorHipsometrico(f.properties.elevacionM),
            updateTriggers: { getFillColor: [altimetriaPuntos] },
          }),
        riesgoEscorrentiaVisible &&
          new GeoJsonLayer<DistritoProperties>({
            id: 'riesgo-escorrentia',
            data: featureCollection,
            stroked: false,
            filled: true,
            pickable: false,
            getFillColor: (f) => colorChoroplethEscorrentia(riesgoEscorrentiaPorDistrito.get(f.properties.codigo)),
            updateTriggers: { getFillColor: [riesgoEscorrentia] },
          }),
        // v2 — insignia (círculo de color fijo en pantalla) + valor numérico
        // encima, como el mapa embebido de AVAMET (petición del usuario,
        // verificado en vivo contra avamet.org/mxo-mxo.php). Dos capas: el
        // círculo de fondo (ScatterplotLayer, radiusUnits:'pixels' para que
        // mida lo mismo a cualquier zoom) + el texto (TextLayer) centrado
        // encima — deck.gl no tiene un tipo de capa "insignia con texto"
        // único, es el patrón habitual para componerlo.
        ...(temperaturaZonaVisible
          ? crearCapaInsignia<EstacionAvamet>({
              id: 'temperatura-zona',
              data: estacionesAvamet,
              getPosition: (e) => [e.lon, e.lat],
              getFillColor: colorTemperaturaZona,
              getText: (e) => `${Math.round(e.temperaturaC)}°`,
              textSize: 12,
              updateTriggerFillColor: estacionesAvamet,
              updateTriggerText: estacionesAvamet,
            })
          : []),
        ...(precipitacionZonaVisible
          ? crearCapaInsignia<EstacionAvamet>({
              id: 'precipitacion-zona',
              data: estacionesAvamet,
              getPosition: (e) => [e.lon, e.lat],
              getFillColor: COLOR_PRECIPITACION_ZONA,
              getText: (e) => (e.precipitacionDiaMm >= 10 ? Math.round(e.precipitacionDiaMm).toString() : e.precipitacionDiaMm.toFixed(1)),
              textSize: 11,
              updateTriggerText: estacionesAvamet,
            })
          : []),
        zonasZasVisible &&
          new GeoJsonLayer<{ nombre: string }>({
            id: 'zonas-zas',
            data: {
              type: 'FeatureCollection',
              features: zonasZas.map((z) => ({ type: 'Feature', geometry: z.geometry, properties: { nombre: z.nombre } })),
            },
            stroked: true,
            filled: true,
            getFillColor: COLOR_ZONA_ZAS,
            getLineColor: [147, 51, 234, 200],
            lineWidthMinPixels: 2,
            pickable: false,
            updateTriggers: { getFillColor: [zonasZas] },
          }),
        pulsoTramosAfectados.length > 0 &&
          new ScatterplotLayer<(typeof pulsoTramosAfectados)[number]>({
            id: 'pulso-tramos-afectados',
            data: pulsoTramosAfectados,
            pickable: false,
            getPosition: (t) => t.puntoMedio,
            getFillColor: [15, 31, 51, 230],
            stroked: true,
            getLineColor: [255, 255, 255, 230],
            lineWidthMinPixels: 1,
            getRadius: 6,
            radiusMinPixels: 3,
            radiusMaxPixels: 6,
          }),
        pulsoEscenariosActivos.length > 0 &&
          new ScatterplotLayer<(typeof pulsoEscenariosActivos)[number]>({
            id: 'pulso-marcadores',
            data: pulsoEscenariosActivos,
            pickable: true,
            getPosition: (e) => e.escenario.centroideAfectado,
            getFillColor: (e) => COLOR_NIVEL_PULSO[e.escenario.nivel],
            stroked: true,
            getLineColor: [255, 255, 255, 255],
            lineWidthMinPixels: 2,
            getRadius: 14,
            radiusMinPixels: 8,
            radiusMaxPixels: 16,
            onClick: () => {
              pulsoLeyendaRoot.classList.add('is-expandida');
              pulsoLeyendaRoot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              pulsoLeyendaRoot.classList.add('info-panel--resaltado');
              window.setTimeout(() => pulsoLeyendaRoot.classList.remove('info-panel--resaltado'), 1500);
            },
          }),
        pulsoEscenariosActivos.length > 0 &&
          new TextLayer<(typeof pulsoEscenariosActivos)[number]>({
            id: 'pulso-etiquetas',
            data: pulsoEscenariosActivos,
            pickable: false,
            getPosition: (e) => e.escenario.centroideAfectado,
            getText: (e) =>
              e.escenario.anticipacionMin ? `${e.distritoNombre} · ~${e.escenario.anticipacionMin} min` : e.distritoNombre,
            getSize: 12,
            getColor: [15, 31, 51, 255],
            getPixelOffset: [0, -18],
            background: true,
            getBackgroundColor: [255, 255, 255, 220],
            backgroundPadding: [4, 2],
          }),
        fallasVisible &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'fallas-zonas',
            data: {
              type: 'FeatureCollection',
              features: datosFallas.zonasMovilidadReducida.map((z) => ({
                type: 'Feature',
                geometry: z.geometry,
                properties: {},
              })),
            },
            stroked: true,
            filled: true,
            pickable: false,
            getFillColor: COLOR_ZONA_MOVILIDAD_REDUCIDA,
            getLineColor: [180, 30, 140, 200],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        fallasVisible &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'fallas-carpas',
            data: {
              type: 'FeatureCollection',
              features: datosFallas.carpas.map((c) => ({ type: 'Feature', geometry: c.geometry, properties: {} })),
            },
            stroked: true,
            filled: true,
            pickable: false,
            getFillColor: COLOR_CARPA_FALLA,
            getLineColor: [180, 70, 10, 200],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
          }),
        fallasVisible &&
          new ScatterplotLayer<MonumentoFalla>({
            id: 'fallas-monumentos',
            data: datosFallas.monumentos,
            pickable: false,
            getPosition: (m) => [m.lon, m.lat],
            getFillColor: (m) => (m.esInfantil ? COLOR_MONUMENTO_FALLA_INFANTIL : COLOR_MONUMENTO_FALLA),
            getRadius: 18,
            radiusMinPixels: 2,
          }),
        // Spec 026 — solo a partir de zoom de calle (499 puntos activos,
        // satura el mapa antes de eso). pickable solo fuera de los modos
        // cordón/simulación, mismo guard que la capa de distritos.
        viaPublicaVisible &&
          map.getZoom() >= ZOOM_MINIMO_VIA_PUBLICA &&
          new ScatterplotLayer<IncidenciaViaPublica>({
            id: 'via-publica',
            data: incidenciasViaPublica,
            pickable: !algunModoActivo,
            getPosition: (i) => [i.lon, i.lat],
            getFillColor: (i) => COLOR_TIPO_VIA_PUBLICA[i.tipo],
            getRadius: 22,
            radiusMinPixels: 3,
            onHover: (info: PickingInfo<IncidenciaViaPublica>) => {
              renderViaPublicaTooltip(viaPublicaTooltip, info.object ?? null, info.x, info.y);
            },
          }),
        // Spec 021 — modo cordón de incidente. Solo se pinta mientras el
        // modo está activo y hay una propuesta calculada; nunca compite por
        // espacio con el resto de capas porque main.ts oculta los paneles
        // habituales mientras este modo está activo (ver actualizarUiModoCordon).
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-area-socorro',
            data: { type: 'Feature', geometry: cordonPropuesta.geometriaAreaSocorro, properties: {} },
            stroked: true,
            filled: true,
            getFillColor: [245, 158, 11, 35],
            getLineColor: [245, 158, 11, 180],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-area-intervencion',
            data: { type: 'Feature', geometry: cordonPropuesta.geometriaAreaIntervencion, properties: {} },
            stroked: true,
            filled: true,
            getFillColor: [220, 38, 38, 55],
            getLineColor: [220, 38, 38, 200],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-tramos-cerrados',
            data: {
              type: 'FeatureCollection',
              features: cordonPropuesta.tramosCerrados
                .map((id) => getTramoPorId(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            getLineColor: [220, 38, 38, 230],
            getLineWidth: 5,
            lineWidthMinPixels: 3,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-tramos-corte',
            data: {
              type: 'FeatureCollection',
              features: cordonPropuesta.tramosCorte
                .map((id) => getTramoPorId(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            getLineColor: [245, 158, 11, 230],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-tramos-desvio',
            data: {
              type: 'FeatureCollection',
              features: cordonPropuesta.tramosDesvioSugerido
                .map((id) => getTramoPorId(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            getLineColor: [59, 130, 246, 210],
            getLineWidth: 3,
            lineWidthMinPixels: 2,
          }),
        // Spec 021 v3 / 031 — efecto en cadena de cerrados + cortes manuales
        // que SE ESCAPA del área de socorro (lo de dentro es esperado, no se
        // pinta aparte). Mismos colores que el simulador de spec 022.
        cordonSinEntradaFueraIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-propagacion-sin-entrada',
            data: featuresDeTramos(cordonSinEntradaFueraIds, getTramoPorId),
            stroked: true,
            filled: false,
            getLineColor: [6, 182, 212, 225],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
          }),
        cordonSinSalidaFueraIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-propagacion-sin-salida',
            data: featuresDeTramos(cordonSinSalidaFueraIds, getTramoPorId),
            stroked: true,
            filled: false,
            getLineColor: [168, 85, 247, 225],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
          }),
        cordonDesvioFueraIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-propagacion-desvio',
            data: featuresDeTramos(cordonDesvioFueraIds, getTramoPorId),
            stroked: true,
            filled: false,
            getLineColor: [59, 130, 246, 160],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        cordonCortesManuales.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-cortes-manuales',
            data: featuresDeTramos(cordonCortesManuales, getTramoPorId),
            stroked: true,
            filled: false,
            getLineColor: [249, 115, 22, 235],
            getLineWidth: 5,
            lineWidthMinPixels: 3,
          }),
        cordonUbicacion &&
          new ScatterplotLayer<{ position: [number, number] }>({
            id: 'cordon-marcador',
            data: [{ position: cordonUbicacion }],
            pickable: false,
            getPosition: (d) => d.position,
            getFillColor: [255, 60, 0, 255],
            getRadius: 8,
            radiusMinPixels: 6,
            stroked: true,
            getLineColor: [255, 255, 255, 255],
            getLineWidth: 2,
            lineWidthMinPixels: 2,
          }),
        // Spec 022/031 — simulador de cortes. Colores: naranja = cortado a
        // mano; cian = el tráfico ya no puede LLEGAR a ese tramo (aguas abajo
        // del corte); violeta = ese tramo ya no puede SALIR al resto de la
        // ciudad (zona atrapada); azul fino = vía abierta que desemboca en el
        // corte y obliga a desviarse. Rojo queda reservado al cordón real
        // (spec 021), aunque nunca coinciden activos.
        simDesvioIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'simulacion-tramos-desvio',
            data: featuresDeTramos(simDesvioIds, getTramoPorIdSimulacion),
            stroked: true,
            filled: false,
            getLineColor: [59, 130, 246, 170],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        simSinEntradaIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'simulacion-tramos-sin-entrada',
            data: featuresDeTramos(simSinEntradaIds, getTramoPorIdSimulacion),
            stroked: true,
            filled: false,
            getLineColor: [6, 182, 212, 225],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
          }),
        simSinSalidaIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'simulacion-tramos-sin-salida',
            data: featuresDeTramos(simSinSalidaIds, getTramoPorIdSimulacion),
            stroked: true,
            filled: false,
            getLineColor: [168, 85, 247, 225],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
          }),
        // Spec 022 v6 — ruta alternativa de cada corte (verde) + puntos que la
        // recorren (el "flujo que cambia de dirección" que pidió el usuario).
        simRutas.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'simulacion-rutas-alternativas',
            data: {
              type: 'FeatureCollection',
              features: simRutas.map((r) => ({
                type: 'Feature' as const,
                geometry: { type: 'LineString' as const, coordinates: r.geometria },
                properties: {},
              })),
            },
            stroked: true,
            filled: false,
            getLineColor: [22, 163, 74, 180],
            getLineWidth: 3,
            lineWidthMinPixels: 2,
          }),
        tramosCortadosIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'simulacion-tramos-cortados',
            data: featuresDeTramos(tramosCortadosIds, getTramoPorIdSimulacion),
            stroked: true,
            filled: false,
            getLineColor: [249, 115, 22, 235],
            getLineWidth: 5,
            lineWidthMinPixels: 3,
          }),
        puntosReruta.length > 0 &&
          new ScatterplotLayer<Coordenada>({
            id: 'simulacion-flujo-reruta',
            data: puntosReruta,
            pickable: false,
            getPosition: (p) => p,
            getFillColor: [255, 255, 255, 235],
            stroked: true,
            getLineColor: [22, 101, 52, 230],
            lineWidthMinPixels: 1,
            getRadius: 7,
            radiusMinPixels: 3,
            radiusMaxPixels: 5,
          }),
        // Flechas de sentido — spec 020 v4 (icono SVG, no glifo de fuente).
        marcadoresFlechas.length > 0 &&
          map.getZoom() >= ZOOM_MINIMO_FLECHAS_SENTIDO &&
          new IconLayer<MarcadorSentido>({
            id: 'flechas-sentido',
            data: marcadoresFlechas,
            pickable: false,
            getIcon: () => ICONO_FLECHA_SENTIDO,
            getPosition: (m) => m.posicion,
            getAngle: (m) => m.anguloGrados,
            getColor: (m) => (m.sentido === 'unidireccional' ? [37, 99, 235, 230] : [100, 116, 139, 205]),
            getSize: 15,
            sizeUnits: 'pixels',
          }),
        new GeoJsonLayer<DistritoProperties>({
          id: 'distritos',
          data: featureCollection,
          stroked: true,
          filled: !mockVisible && !pulsoVisible,
          // Desactivada mientras el modo cordón (spec 021) o el simulador de
          // cortes (spec 022) están activos: si no, el clic de esos modos
          // también dispara el picking de esta capa y selecciona/pinta el
          // distrito entero encima.
          pickable: !algunModoActivo,
          autoHighlight: false,
          // Sin resaltado visual por hover ni por selección (spec 000 v4): el
          // usuario lo pidió explícitamente porque "iluminar" el distrito le
          // quitaba claridad al leer el mapa y al hacer capturas. El foco de
          // distrito (spec 036) sigue funcionando igual — el clic dispara
          // `setFocoDistrito` y el único indicador visual pasa a ser el chip
          // "Foco: X", no un cambio de color del polígono.
          getFillColor: [30, 144, 255, 25],
          getLineColor: [30, 60, 110, 220],
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          onClick: (info: PickingInfo<GeoJSON.Feature<GeoJSON.Geometry, DistritoProperties>>) => {
            if (getEstadoModoCordon().fase !== 'inactivo' || getEstadoModoSimulacion().fase !== 'inactivo') return;
            const props = info.object?.properties ?? null;
            // Clic en el distrito ya seleccionado → lo deselecciona (toggle).
            const nuevo = props && props.codigo !== selectedDistrito ? props.codigo : null;
            selectedDistrito = nuevo;
            setFocoDistrito(nuevo && props ? { codigo: props.codigo, nombre: props.nombre } : null);
            renderLayers();
            persistViewState();
          },
        }),
    ].filter((layer): layer is Exclude<typeof layer, false> => layer !== false);

    // Único choque con el motor de render — ver el porqué de `mapaListo`
    // junto a `new maplibregl.Map(...)` más arriba. El resto de la función
    // (construir `layers` a partir del estado actual) es puro y barato de
    // repetir; lo único que hay que proteger es este `setProps`.
    if (mapaListo) overlay.setProps({ layers });
  }

  // Spec 021 — modo cordón de incidente: oculta los paneles habituales
  // mientras está activo (evita el amontonamiento y la confusión de tener
  // dos flujos de trabajo a la vez) y gestiona el clic único en el mapa
  // para marcar la ubicación del incidente.
  let clicCordonHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;
  // Segundo handler: en fase 'formulario' el clic corta/descorta una calle a
  // mano (spec 021 v3), igual que el simulador de spec 022.
  let clicCorteManualHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;
  onCambioModoCordon((estadoCordon) => {
    const controlesEl = document.getElementById('controls');
    const infoPanelsEl = document.getElementById('info-panels');
    const activo = estadoCordon.fase !== 'inactivo';
    if (controlesEl) controlesEl.style.display = activo ? 'none' : '';
    if (infoPanelsEl) infoPanelsEl.style.display = activo ? 'none' : '';
    const kpisEl = document.getElementById('dashboard-kpis');
    if (kpisEl) kpisEl.style.display = activo ? 'none' : '';

    if (estadoCordon.fase === 'esperandoClicMapa' && !clicCordonHandler) {
      map.getCanvas().style.cursor = 'crosshair';
      clicCordonHandler = (e) => reportarUbicacionElegida([e.lngLat.lng, e.lngLat.lat]);
      map.on('click', clicCordonHandler);
    } else if (estadoCordon.fase !== 'esperandoClicMapa' && clicCordonHandler) {
      map.off('click', clicCordonHandler);
      clicCordonHandler = null;
      map.getCanvas().style.cursor = '';
    }

    if (estadoCordon.fase === 'formulario' && !clicCorteManualHandler) {
      map.getCanvas().style.cursor = 'crosshair';
      clicCorteManualHandler = (e) => {
        void cargarGrafoViario().then((grafo) => {
          const snap = grafo.indice.tramoMasCercano([e.lngLat.lng, e.lngLat.lat], 60);
          if (snap) toggleCorteManual(snap.tramo.idTramo);
        });
      };
      map.on('click', clicCorteManualHandler);
    } else if (estadoCordon.fase !== 'formulario' && clicCorteManualHandler) {
      map.off('click', clicCorteManualHandler);
      clicCorteManualHandler = null;
      map.getCanvas().style.cursor = '';
    }

    renderLayers();
  });

  // Spec 022 — modo simulador de cortes: cada clic hace snap al tramo más
  // cercano (reutiliza el mismo índice espacial de spec 020) y lo
  // añade/quita del conjunto de cortes. El grafo ya está en caché tras
  // activarSimulacionCortes(), así que cargarGrafoViario() aquí no repite
  // la llamada de red.
  let clicSimulacionHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;

  // Bucle de animación del efecto de flujo de la capa de tráfico (spec 004)
  // — con throttling: sin limitar, un requestAnimationFrame llamaría a
  // renderLayers() a ~60fps, reconstruyendo TODAS las capas (no solo los
  // puntos de flujo) muchas más veces de las necesarias — con ~400 tramos
  // visibles a la vez esto sí se nota, a diferencia del puñado de tramos
  // que maneja el simulador de spec 022. Throttle más generoso aquí a
  // propósito ("que no sature", petición del usuario) y solo activo
  // mientras la capa de tráfico está visible.
  const INTERVALO_RENDER_FLUJO_TRAFICO_MS = 220;
  let animacionFlujoTraficoActiva = false;
  let ultimoRenderFlujoTrafico = 0;
  function tickAnimacionFlujoTrafico(timestamp: number): void {
    if (!animacionFlujoTraficoActiva) return;
    if (timestamp - ultimoRenderFlujoTrafico >= INTERVALO_RENDER_FLUJO_TRAFICO_MS) {
      ultimoRenderFlujoTrafico = timestamp;
      renderLayers();
    }
    requestAnimationFrame(tickAnimacionFlujoTrafico);
  }
  function actualizarAnimacionFlujoTrafico(activar: boolean): void {
    if (activar && !animacionFlujoTraficoActiva) {
      animacionFlujoTraficoActiva = true;
      requestAnimationFrame(tickAnimacionFlujoTrafico);
    } else if (!activar) {
      animacionFlujoTraficoActiva = false;
    }
  }

  // Animación del desvío del simulador de cortes (spec 022 v6) — sólo un
  // puñado de rutas a la vez, así que puede refrescar algo más a menudo que
  // el flujo de tráfico general.
  const INTERVALO_RENDER_RERUTA_MS = 120;
  let animacionRerutaActiva = false;
  let ultimoRenderReruta = 0;
  function tickAnimacionReruta(timestamp: number): void {
    if (!animacionRerutaActiva) return;
    if (timestamp - ultimoRenderReruta >= INTERVALO_RENDER_RERUTA_MS) {
      ultimoRenderReruta = timestamp;
      renderLayers();
    }
    requestAnimationFrame(tickAnimacionReruta);
  }
  function actualizarAnimacionReruta(activar: boolean): void {
    if (activar && !animacionRerutaActiva) {
      animacionRerutaActiva = true;
      requestAnimationFrame(tickAnimacionReruta);
    } else if (!activar) {
      animacionRerutaActiva = false;
    }
  }

  onCambioModoSimulacion((estadoSimulacion) => {
    const controlesEl = document.getElementById('controls');
    const infoPanelsEl = document.getElementById('info-panels');
    const activo = estadoSimulacion.fase !== 'inactivo';
    if (controlesEl) controlesEl.style.display = activo ? 'none' : '';
    if (infoPanelsEl) infoPanelsEl.style.display = activo ? 'none' : '';
    const kpisEl = document.getElementById('dashboard-kpis');
    if (kpisEl) kpisEl.style.display = activo ? 'none' : '';
    actualizarAnimacionReruta(activo && estadoSimulacion.rutasAlternativas.length > 0);

    if (estadoSimulacion.fase === 'seleccionando' && !clicSimulacionHandler) {
      map.getCanvas().style.cursor = 'crosshair';
      clicSimulacionHandler = (e) => {
        void cargarGrafoViario().then((grafo) => {
          const snap = grafo.indice.tramoMasCercano([e.lngLat.lng, e.lngLat.lat], 60);
          if (snap) toggleTramoCortado(snap.tramo.idTramo);
        });
      };
      map.on('click', clicSimulacionHandler);
    } else if (estadoSimulacion.fase !== 'seleccionando' && clicSimulacionHandler) {
      map.off('click', clicSimulacionHandler);
      clicSimulacionHandler = null;
      map.getCanvas().style.cursor = '';
    }

    renderLayers();
  });

  const panel = buildControlPanel();
  panel.horaSlider.value = horaSimulada.slice(0, 2);
  panel.horaLabel.textContent = horaSimulada;

  // spec 033 — grupo "Contexto e informativas": contador de capas activas + se
  // abre solo si hay alguna encendida (p. ej. al llegar por una URL compartida).
  const togglesContexto = [
    panel.mockToggle,
    panel.valenbisiToggle,
    panel.aparcamientoToggle,
    panel.fallasToggle,
  ];
  function actualizarContextoSelector(): void {
    const activas = togglesContexto.filter((t) => t.checked).length;
    panel.contextoContador.textContent = `${activas} / ${togglesContexto.length}`;
    panel.contextoContador.classList.toggle('is-active', activas > 0);
    if (activas > 0 && !panel.contextoDetails.open) panel.contextoDetails.open = true;
  }
  togglesContexto.forEach((t) => t.addEventListener('change', actualizarContextoSelector));

  // spec 033 — preset "Vista operativa": enciende las 3 capas operativas en
  // tiempo real (tráfico, Pulso, incidencias de vía pública) que estén
  // apagadas (dispara su `change` real, que ya persiste) y pliega el grupo de
  // contexto. Desde v3, Pulso vive dentro de "Contexto e informativas" en el
  // HTML (reordenado a petición del usuario) pero sigue siendo una de las 3
  // capas que enciende este preset — si queda plegada tras esto, su casilla
  // sigue marcada, solo no visible hasta reabrir el grupo (mismo comportamiento
  // que ya tenía cualquier otra casilla de contexto activa al usar el preset).
  panel.presetOperativaBtn.addEventListener('click', () => {
    for (const t of [panel.traficoToggle, panel.pulsoToggle, panel.viaPublicaToggle]) {
      if (!t.checked) {
        t.checked = true;
        t.dispatchEvent(new Event('change'));
      }
    }
    panel.contextoDetails.open = false;
  });

  actualizarContextoSelector();

  // spec 034 — dashboard de KPIs: los paneles empujan sus cifras vía registrarKpi()
  // al renderizarse. Clic en un chip con capa relacionada → la activa y hace scroll
  // a su leyenda.
  montarDashboardKpis((idToggle) => {
    const toggle = document.getElementById(idToggle) as HTMLInputElement | null;
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
    }
    const leyenda = document.getElementById(idToggle.replace('toggle-', '') + '-leyenda');
    leyenda?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  async function refreshMockLayer(): Promise<void> {
    densidadMock = await fetchDensidadMock(horaSimulada);
    if (!fallasHotspotsCargados) {
      fallasHotspotsCargados = true;
      try {
        const { fresh, ...datos } = await fetchDatosFallasActual();
        void fresh; // no hace falta aquí — la frescura la gestiona el toggle "Fallas" si se activa
        datosFallas = datos;
      } catch (err) {
        console.error('Fallo al cargar monumentos falleros para los puntos calientes de densidad mock:', err);
      }
    }
    renderLayers();
  }

  panel.mockToggle.addEventListener('change', () => {
    mockVisible = panel.mockToggle.checked;
    panel.horaControl.hidden = !mockVisible;
    panel.banner.hidden = !mockVisible;
    if (mockVisible) {
      refreshMockLayer().catch((err: unknown) => console.error('Fallo al cargar densidad mock:', err));
    } else {
      renderLayers();
    }
  });

  panel.horaSlider.addEventListener('input', () => {
    horaSimulada = `${panel.horaSlider.value.padStart(2, '0')}:00`;
    panel.horaLabel.textContent = horaSimulada;
    if (mockVisible) {
      refreshMockLayer().catch((err: unknown) => console.error('Fallo al cargar densidad mock:', err));
    }
  });

  const traficoLeyendaRoot = buildInfoPanel('trafico-leyenda', { colapsable: true });
  traficoLeyendaRoot.hidden = true;
  let traficoPollingIniciado = false;
  async function refreshTrafico(): Promise<void> {
    try {
      const { tramos, fresh } = await fetchEstadoTraficoActual();
      tramosTrafico = tramos;
      actualizarTramosTrafico(tramos);
      renderLayers();
      renderTraficoLeyenda(traficoLeyendaRoot, tramos, fresh);
    } catch (err) {
      traficoLeyendaRoot.textContent = 'Tráfico no disponible';
      console.error('Fallo al cargar tráfico:', err);
    }
  }

  panel.traficoToggle.addEventListener('change', () => {
    traficoVisible = panel.traficoToggle.checked;
    traficoLeyendaRoot.hidden = !traficoVisible;
    actualizarAnimacionFlujoTrafico(traficoVisible);
    if (traficoVisible && !traficoPollingIniciado) {
      traficoPollingIniciado = true;
      startPolling(refreshTrafico, 3 * 60 * 1000); // igual TTL que la caché del endpoint, spec 004 §4
    } else {
      renderLayers();
    }
  });

  const valenbisiLeyendaRoot = buildInfoPanel('valenbisi-leyenda', { colapsable: true });
  valenbisiLeyendaRoot.hidden = true;
  let valenbisiPollingIniciado = false;
  async function refreshValenbisi(): Promise<void> {
    try {
      const { estaciones, fresh } = await fetchEstacionesValenbisiActual();
      estacionesValenbisi = estaciones;
      actualizarEstacionesValenbisi(estaciones);
      renderLayers();
      renderValenbisiLeyenda(valenbisiLeyendaRoot, estaciones, fresh);
    } catch (err) {
      valenbisiLeyendaRoot.textContent = 'Valenbisi no disponible';
      console.error('Fallo al cargar Valenbisi:', err);
    }
  }

  panel.valenbisiToggle.addEventListener('change', () => {
    valenbisiVisible = panel.valenbisiToggle.checked;
    valenbisiLeyendaRoot.hidden = !valenbisiVisible;
    if (valenbisiVisible && !valenbisiPollingIniciado) {
      valenbisiPollingIniciado = true;
      startPolling(refreshValenbisi, 2 * 60 * 1000); // igual TTL que la caché del endpoint, spec 005 §4
    } else {
      renderLayers();
    }
  });

  const aparcamientoLeyendaRoot = buildInfoPanel('aparcamiento-leyenda', { colapsable: true });
  aparcamientoLeyendaRoot.hidden = true;
  let aparcamientoPollingIniciado = false;
  async function refreshAparcamiento(): Promise<void> {
    try {
      const { aparcamientos: datos, fresh } = await fetchAparcamientosActual();
      aparcamientos = datos;
      actualizarAparcamientos(datos);
      renderLayers();
      renderAparcamientoLeyenda(aparcamientoLeyendaRoot, datos, fresh);
    } catch (err) {
      aparcamientoLeyendaRoot.textContent = 'Aparcamiento no disponible';
      console.error('Fallo al cargar aparcamiento:', err);
    }
  }

  panel.aparcamientoToggle.addEventListener('change', () => {
    aparcamientoVisible = panel.aparcamientoToggle.checked;
    aparcamientoLeyendaRoot.hidden = !aparcamientoVisible;
    if (aparcamientoVisible && !aparcamientoPollingIniciado) {
      aparcamientoPollingIniciado = true;
      startPolling(refreshAparcamiento, 2 * 60 * 1000); // igual TTL que la caché del endpoint, spec 006 §4
    } else {
      renderLayers();
    }
  });

  const pulsoLeyendaRoot = buildInfoPanel('pulso-leyenda', { colapsable: true });
  pulsoLeyendaRoot.hidden = true;
  let pulsoPollingIniciado = false;
  async function refreshPulso(): Promise<void> {
    try {
      const { distritos: datos, fresh } = await fetchPulsoDistritoActual();
      pulsoDistritos = datos;
      renderLayers();
      renderPulsoLeyenda(pulsoLeyendaRoot, datos, fresh);
    } catch (err) {
      pulsoLeyendaRoot.textContent = 'Pulso de Distrito no disponible';
      console.error('Fallo al cargar Pulso de Distrito:', err);
    }
  }

  panel.pulsoToggle.addEventListener('change', () => {
    pulsoVisible = panel.pulsoToggle.checked;
    pulsoLeyendaRoot.hidden = !pulsoVisible;
    if (pulsoVisible && !pulsoPollingIniciado) {
      pulsoPollingIniciado = true;
      startPolling(refreshPulso, 3 * 60 * 1000); // misma cadencia que el componente más volátil (tráfico), spec 010 §4
    } else {
      renderLayers();
    }
  });

  const fallasLeyendaRoot = buildInfoPanel('fallas-leyenda', { colapsable: true });
  fallasLeyendaRoot.hidden = true;
  let fallasPollingIniciado = false;
  async function refreshFallas(): Promise<void> {
    try {
      const { fresh, ...datos } = await fetchDatosFallasActual();
      datosFallas = datos;
      renderLayers();
      renderFallasLeyenda(fallasLeyendaRoot, datos, fresh);
    } catch (err) {
      fallasLeyendaRoot.textContent = 'Fallas no disponible';
      console.error('Fallo al cargar Fallas:', err);
    }
  }

  panel.fallasToggle.addEventListener('change', () => {
    fallasVisible = panel.fallasToggle.checked;
    fallasLeyendaRoot.hidden = !fallasVisible;
    if (fallasVisible && !fallasPollingIniciado) {
      fallasPollingIniciado = true;
      startPolling(refreshFallas, 6 * 60 * 60 * 1000); // igual TTL que la caché del endpoint, spec 008 §4
    } else {
      renderLayers();
    }
  });

  const riesgoEscorrentiaLeyendaRoot = buildInfoPanel('riesgo-escorrentia-leyenda', { colapsable: true });
  riesgoEscorrentiaLeyendaRoot.hidden = true;
  let riesgoEscorrentiaPollingIniciado = false;
  async function refreshRiesgoEscorrentia(): Promise<void> {
    try {
      const { distritos: datos, fresh } = await fetchRiesgoEscorrentiaActual();
      riesgoEscorrentia = datos;
      renderLayers();
      renderEscorrentiaLeyenda(riesgoEscorrentiaLeyendaRoot, datos, fresh);
    } catch (err) {
      riesgoEscorrentiaLeyendaRoot.textContent = 'Riesgo de acumulación de agua no disponible';
      console.error('Fallo al cargar riesgo de escorrentía:', err);
    }
  }

  panel.riesgoEscorrentiaToggle.addEventListener('change', () => {
    riesgoEscorrentiaVisible = panel.riesgoEscorrentiaToggle.checked;
    riesgoEscorrentiaLeyendaRoot.hidden = !riesgoEscorrentiaVisible;
    if (riesgoEscorrentiaVisible && !riesgoEscorrentiaPollingIniciado) {
      riesgoEscorrentiaPollingIniciado = true;
      startPolling(refreshRiesgoEscorrentia, 15 * 60 * 1000); // igual TTL que la caché del endpoint (hereda el de meteo-zona), spec 046 §4
    } else {
      renderLayers();
    }
  });

  // specs 050/051 — un solo fetch/poll de AVAMET sirve a las dos capas
  // (temperatura y precipitación), activado por cualquiera de los dos toggles.
  const temperaturaZonaLeyendaRoot = buildInfoPanel('temperatura-zona-leyenda', { colapsable: true });
  temperaturaZonaLeyendaRoot.hidden = true;
  const precipitacionZonaLeyendaRoot = buildInfoPanel('precipitacion-zona-leyenda', { colapsable: true });
  precipitacionZonaLeyendaRoot.hidden = true;
  let avametPollingIniciado = false;
  async function refreshAvamet(): Promise<void> {
    try {
      const { estaciones, fresh } = await fetchEstacionesAvametActual();
      estacionesAvamet = estaciones;
      renderLayers();
      renderTemperaturaZonaLeyenda(temperaturaZonaLeyendaRoot, estaciones, fresh);
      renderPrecipitacionZonaLeyenda(precipitacionZonaLeyendaRoot, estaciones, fresh);
    } catch (err) {
      temperaturaZonaLeyendaRoot.textContent = 'Temperatura por zona no disponible';
      precipitacionZonaLeyendaRoot.textContent = 'Precipitación no disponible';
      console.error('Fallo al cargar estaciones AVAMET:', err);
    }
  }
  function iniciarPollingAvametSiHaceFalta(): void {
    if (!avametPollingIniciado) {
      avametPollingIniciado = true;
      startPolling(refreshAvamet, 15 * 60 * 1000); // igual TTL que la caché del endpoint, spec 044 §4
    } else {
      renderLayers();
    }
  }

  panel.temperaturaZonaToggle.addEventListener('change', () => {
    temperaturaZonaVisible = panel.temperaturaZonaToggle.checked;
    temperaturaZonaLeyendaRoot.hidden = !temperaturaZonaVisible;
    if (temperaturaZonaVisible) {
      iniciarPollingAvametSiHaceFalta();
    } else {
      renderLayers();
    }
  });

  panel.precipitacionZonaToggle.addEventListener('change', () => {
    precipitacionZonaVisible = panel.precipitacionZonaToggle.checked;
    precipitacionZonaLeyendaRoot.hidden = !precipitacionZonaVisible;
    if (precipitacionZonaVisible) {
      iniciarPollingAvametSiHaceFalta();
    } else {
      renderLayers();
    }
  });

  // Spec 052 — dato estático (spec 044): un único fetch la primera vez que
  // se activa el checkbox, sin polling — la altimetría no cambia, a
  // diferencia de las capas de arriba.
  const altimetriaLeyendaRoot = buildInfoPanel('altimetria-leyenda', { colapsable: true });
  altimetriaLeyendaRoot.hidden = true;
  async function cargarAltimetriaSiHaceFalta(): Promise<void> {
    if (altimetriaCargada) {
      renderLayers();
      return;
    }
    altimetriaCargada = true;
    try {
      const { distritos, puntos } = await fetchAltimetriaActual();
      altimetriaDistritos = distritos;
      altimetriaPuntos = puntos;
      renderLayers();
      renderAltimetriaLeyenda(altimetriaLeyendaRoot, distritos, puntos);
    } catch (err) {
      altimetriaLeyendaRoot.textContent = 'Altimetría no disponible';
      console.error('Fallo al cargar altimetría:', err);
    }
  }
  panel.altimetriaToggle.addEventListener('change', () => {
    altimetriaVisible = panel.altimetriaToggle.checked;
    altimetriaLeyendaRoot.hidden = !altimetriaVisible;
    if (altimetriaVisible) {
      void cargarAltimetriaSiHaceFalta();
    } else {
      renderLayers();
    }
  });

  const viaPublicaLeyendaRoot = buildInfoPanel('via-publica-leyenda', { colapsable: true });
  viaPublicaLeyendaRoot.hidden = true;
  let viaPublicaPollingIniciado = false;
  async function refreshViaPublica(): Promise<void> {
    try {
      const { incidencias, fresh } = await fetchIncidenciasViaPublicaActual();
      incidenciasViaPublica = incidencias;
      renderLayers();
      renderViaPublicaLeyenda(viaPublicaLeyendaRoot, incidencias, fresh);
    } catch (err) {
      viaPublicaLeyendaRoot.textContent = 'Incidencias de vía pública no disponibles';
      console.error('Fallo al cargar incidencias de vía pública:', err);
    }
  }

  panel.viaPublicaToggle.addEventListener('change', () => {
    viaPublicaVisible = panel.viaPublicaToggle.checked;
    viaPublicaLeyendaRoot.hidden = !viaPublicaVisible;
    if (!viaPublicaVisible) viaPublicaTooltip.hidden = true;
    if (viaPublicaVisible && !viaPublicaPollingIniciado) {
      viaPublicaPollingIniciado = true;
      startPolling(refreshViaPublica, 60 * 60 * 1000); // igual TTL que la caché del endpoint, spec 026 §4
    } else {
      renderLayers();
    }
  });

  // La capa solo aparece a partir de ZOOM_MINIMO_VIA_PUBLICA (spec 026 §5) —
  // sin este listener, acercar/alejar el mapa sin tocar ningún toggle no
  // recalcularía qué capas mostrar. 'zoomend' (no 'zoom' continuo) para no
  // reconstruir todas las capas en cada frame de un gesto de zoom.
  map.on('zoomend', () => {
    if (viaPublicaVisible || flechasSentidoActivas()) renderLayers();
  });

  const mediaPanel = buildMediaPanel();
  let mediaPollingIniciado = false;
  let ultimoMediatico: { items: ItemMediatico[]; fresh: boolean; fuentesFallidas: string[] } | null =
    null;
  async function refreshMediatico(): Promise<void> {
    try {
      const datos = await fetchItemsMediaticosActual();
      ultimoMediatico = datos;
      renderMediaticoPanel(mediaPanel, datos.items, datos.fresh, datos.fuentesFallidas);
    } catch (err) {
      mediaPanel.list.textContent = 'Contexto mediático no disponible';
      console.error('Fallo al cargar contexto mediático:', err);
    }
  }

  panel.mediaToggle.addEventListener('change', () => {
    mediaPanel.root.hidden = !panel.mediaToggle.checked;
    if (panel.mediaToggle.checked && !mediaPollingIniciado) {
      mediaPollingIniciado = true;
      startPolling(refreshMediatico, 15 * 60 * 1000); // igual TTL que la caché del endpoint, spec 009 §4
    }
  });

  // spec 036 — foco de distrito: clic en un distrito del mapa → los paneles con
  // dato por distrito (prensa, Pulso) se filtran/resaltan a ese distrito. El
  // chip "Foco: <distrito> ✕" lo limpia (y deselecciona el distrito en el mapa).
  montarChipFoco(() => {
    selectedDistrito = null;
    setFocoDistrito(null);
    renderLayers();
    persistViewState();
  });
  onCambioFoco(() => {
    if (ultimoMediatico) {
      renderMediaticoPanel(mediaPanel, ultimoMediatico.items, ultimoMediatico.fresh, ultimoMediatico.fuentesFallidas);
    }
    if (pulsoDistritos.length > 0) renderPulsoLeyenda(pulsoLeyendaRoot, pulsoDistritos, true);
  });

  const tendenciaPanel = buildTendenciaPanel();
  let tendenciaPollingIniciado = false;
  let ventanaTendenciaActual: 'hora' | 'dia' = 'hora';
  async function refreshTendencia(): Promise<void> {
    try {
      const { panel: ventana, fresh } = await fetchTendenciaActual(ventanaTendenciaActual);
      renderTendenciaPanel(tendenciaPanel, ventana, fresh);
    } catch (err) {
      tendenciaPanel.list.textContent = 'Términos en tendencia no disponibles';
      console.error('Fallo al cargar términos en tendencia:', err);
    }
  }

  tendenciaPanel.ventanaSelect.addEventListener('change', () => {
    ventanaTendenciaActual = tendenciaPanel.ventanaSelect.value === 'dia' ? 'dia' : 'hora';
    void refreshTendencia();
  });

  panel.tendenciaToggle.addEventListener('change', () => {
    tendenciaPanel.root.hidden = !panel.tendenciaToggle.checked;
    if (panel.tendenciaToggle.checked && !tendenciaPollingIniciado) {
      tendenciaPollingIniciado = true;
      startPolling(refreshTendencia, 15 * 60 * 1000); // igual TTL que la caché del endpoint, spec 025 §4
    }
  });

  const agendaPanel = buildAgendaPanel();
  let agendaPollingIniciado = false;
  async function refreshAgenda(): Promise<void> {
    try {
      const snapshot = await fetchAgendaEventosActual();
      renderAgendaPanel(agendaPanel, snapshot);
    } catch (err) {
      agendaPanel.list.textContent = 'Agenda de eventos no disponible';
      console.error('Fallo al cargar la agenda de eventos:', err);
    }
  }

  panel.agendaToggle.addEventListener('change', () => {
    agendaPanel.root.hidden = !panel.agendaToggle.checked;
    if (panel.agendaToggle.checked && !agendaPollingIniciado) {
      agendaPollingIniciado = true;
      startPolling(refreshAgenda, 6 * 60 * 60 * 1000); // igual TTL que la caché del endpoint, spec 027 §4
    }
  });

  const movilidadPanel = buildMovilidadPanel();
  let movilidadPollingIniciado = false;
  async function refreshMovilidad(): Promise<void> {
    try {
      const { snapshot, fresh } = await fetchAvisosMovilidadActual();
      renderMovilidadPanel(movilidadPanel, snapshot, fresh);
    } catch (err) {
      movilidadPanel.list.textContent = 'Avisos de movilidad no disponibles';
      console.error('Fallo al cargar los avisos de movilidad:', err);
    }
  }

  panel.movilidadToggle.addEventListener('change', () => {
    movilidadPanel.root.hidden = !panel.movilidadToggle.checked;
    if (panel.movilidadToggle.checked && !movilidadPollingIniciado) {
      movilidadPollingIniciado = true;
      startPolling(refreshMovilidad, 6 * 60 * 60 * 1000); // igual TTL que la caché del endpoint, spec 048 §4
    }
  });

  // Spec 049 — el panel de ruido de Russafa es contenido fijo de lectura
  // (como agenda/movilidad), no una capa de mapa: sin coordenadas verificadas
  // para sus 16 sonómetros (ver spec §7), se muestran siempre como lista en
  // /inteligencia. El mismo fetch alimenta también `zonasZas` (los polígonos
  // ya declarados), que sí es una capa de mapa — su checkbox propio
  // (`zonasZasToggle`) solo decide si se pintan, sin volver a pedir el dato.
  const zasRuidoPanelRoot = document.createElement('div');
  zasRuidoPanelRoot.id = 'zas-ruido-panel';
  zasRuidoPanelRoot.hidden = true;
  document.body.appendChild(zasRuidoPanelRoot);
  const zonasZasLeyendaRoot = buildInfoPanel('zonas-zas-leyenda', { colapsable: true });
  zonasZasLeyendaRoot.hidden = true;
  async function refreshPanelZas(): Promise<void> {
    try {
      const { zonas, sonometrosRuzafa: sonometros, fresh } = await fetchPanelZasActual();
      zonasZas = zonas;
      renderLayers();
      renderSonometrosRuzafaPanel(zasRuidoPanelRoot, sonometros, fresh);
      renderZonasZasLeyenda(zonasZasLeyendaRoot, zonas, fresh);
    } catch (err) {
      zasRuidoPanelRoot.textContent = 'Ruido en Russafa no disponible';
      console.error('Fallo al cargar zonas ZAS:', err);
    }
  }
  let zasPollingIniciado = false;
  panel.zasRuidoToggle.addEventListener('change', () => {
    zasRuidoPanelRoot.hidden = !panel.zasRuidoToggle.checked;
    if (panel.zasRuidoToggle.checked && !zasPollingIniciado) {
      zasPollingIniciado = true;
      startPolling(refreshPanelZas, 60 * 60 * 1000); // igual TTL que la caché del endpoint, spec 049 §4
    }
  });

  panel.zonasZasToggle.addEventListener('change', () => {
    zonasZasVisible = panel.zonasZasToggle.checked;
    zonasZasLeyendaRoot.hidden = !zonasZasVisible;
    renderLayers();
  });

  montarCamarasPanel(panel.camarasToggle);

  // spec 040 — "Actualidad institucional" (039) se muda del sidebar a un panel
  // propio de /inteligencia; `buildActualidadRedesContent()` es exactamente el
  // mismo contenido que ya usaba el sidebar (sin reescribir su lógica interna).
  const actualidadRedesPanel = document.createElement('div');
  actualidadRedesPanel.id = 'actualidad-redes-panel';
  actualidadRedesPanel.innerHTML = '<div class="media-panel__header">Actualidad institucional</div>';
  actualidadRedesPanel.appendChild(buildActualidadRedesContent());
  document.body.appendChild(actualidadRedesPanel);

  // spec 041 — panel de apoyo a decisión, dentro de /inteligencia. "Ver en el
  // mapa" pide centrar la única instancia de MapLibre (no crea una segunda) y
  // cambia a /mapa — nunca dispara ninguna acción por sí mismo (§0).
  montarApoyoDecisionPanel();
  montarCamarasDgtPanel();
  montarAltimetriaPanel();
  montarMeteoZonaPanel();
  montarSenalesPanel();
  montarRecomendacionesPanel();
  onPeticionCentrarMapa(({ coordenadas, zoom }) => {
    map.flyTo({ center: coordenadas, zoom: zoom ?? map.getZoom() });
  });

  // spec 042 — contenido estático, sin red. ⚠️ Borrador pendiente de revisión
  // explícita del usuario (ver src/config/protocolos-actuacion.ts).
  document.body.appendChild(buildProtocolosContent());

  // Dispara una vez el 'change' de cada toggle "siempre activo" (ver
  // `toggleSiempreActivo`) para que cada panel cargue sus datos/polling desde
  // el arranque — su visibilidad real la decide solo la vista actual (ver
  // `initRouter` al final de esta función), no este checkbox.
  for (const t of [
    panel.mediaToggle,
    panel.tendenciaToggle,
    panel.agendaToggle,
    panel.movilidadToggle,
    panel.zasRuidoToggle,
    panel.camarasToggle,
  ]) {
    t.dispatchEvent(new Event('change'));
  }

  map.on('load', () => {
    mapaListo = true;
    renderLayers();
    if (initialState.distrito) {
      const centroide = getDistrictCentroid(initialState.distrito);
      if (centroide) map.setCenter(centroide);
    }
  });

  map.on('moveend', persistViewState);
  // Solo con ?debug=grafo hace falta re-renderizar al desplazar (recorte por
  // viewport de las flechas). En los modos las flechas van sobre geometría
  // fija, no cambian al hacer pan.
  if (DEBUG_GRAFO) map.on('moveend', () => renderLayers());

  montarMeteoActualPanel();
  montarPrediccionPanel();

  const airePanelRoot = buildInfoPanel('aire-panel');
  async function refreshAirePanel(): Promise<void> {
    try {
      const { calidad, fresh } = await fetchCalidadAireActual();
      renderAirePanel(airePanelRoot, calidad, fresh);
      registrarFrescura('aire', { ok: true, fresh, fetchedAt: calidad.fetchedAt });
    } catch (err) {
      airePanelRoot.textContent = 'Calidad del aire no disponible';
      registrarFrescura('aire', { ok: false, fresh: false });
      console.error('Fallo al cargar calidad del aire:', err);
    }
  }
  startPolling(refreshAirePanel, 5 * 60 * 1000);

  const insightsPanelRoot = buildInfoPanel('insights-panel');
  // Delegado (no un listener por tarjeta): el HTML se reconstruye en cada
  // refresco, así que un listener directo por botón se perdería.
  insightsPanelRoot.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-insight-index]');
    if (!boton || !ultimoPanelInsights) return;
    const insight = ultimoPanelInsights.insights[Number(boton.dataset.insightIndex)];
    if (!insight) return;
    const texto = `Asunto: ${insight.protocoloSugerido.asunto}\n\n${insight.protocoloSugerido.cuerpo}`;
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        boton.textContent = 'Copiado ✓';
        setTimeout(() => {
          boton.textContent = 'Copiar borrador';
        }, 2000);
      })
      .catch((err: unknown) => console.error('No se pudo copiar el borrador:', err));
  });
  async function refreshInsightsPanel(): Promise<void> {
    try {
      const { panel, fresh } = await fetchInsightsActual();
      renderInsightsPanel(insightsPanelRoot, panel, fresh);
      registrarFrescura('insights', { ok: true, fresh, fetchedAt: panel.fetchedAt });
    } catch (err) {
      insightsPanelRoot.textContent = 'Insights no disponibles';
      registrarFrescura('insights', { ok: false, fresh: false });
      console.error('Fallo al cargar insights:', err);
    }
  }
  startPolling(refreshInsightsPanel, 5 * 60 * 1000);

  const traficoHistoricoPanelRoot = buildInfoPanel('trafico-historico-panel');
  async function refreshTraficoHistoricoPanel(): Promise<void> {
    try {
      const { historico, fresh } = await fetchTraficoHistoricoCiudad();
      renderTraficoHistoricoPanel(traficoHistoricoPanelRoot, historico, fresh);
      registrarFrescura('trafico-historico', { ok: true, fresh, fetchedAt: historico.fetchedAt });
    } catch (err) {
      traficoHistoricoPanelRoot.textContent = 'Histórico de tráfico no disponible';
      registrarFrescura('trafico-historico', { ok: false, fresh: false });
      console.error('Fallo al cargar histórico de tráfico:', err);
    }
  }
  // Cadencia holgada: el histórico se actualiza una vez por hora en origen
  // (cron), no hace falta sondear más a menudo que eso.
  startPolling(refreshTraficoHistoricoPanel, 15 * 60 * 1000);

  // Los 5 paneles fijos de arriba ya existen en el DOM — aplicar ahora la
  // preferencia de visibilidad guardada en Configuración (spec 019 v3).
  applyPanelVisibility();

  // Spec 029 — con los paneles ya montados, activa el layout móvil (bottom
  // sheet + reparentado) si el dispositivo lo pide.
  initLayoutMovil();

  // spec 040 — dos vistas por hash. `/inteligencia` esconde todo lo de "mapa
  // operativo" (mapa, selector de capas, KPIs, leyendas, los 5 paneles fijos)
  // y muestra los paneles de lectura (cámaras/prensa/redes/tendencia/agenda).
  // Al volver a "mapa" nunca se fuerza `hidden = false` a ciegas en lo que
  // tiene preferencia propia (los 5 paneles fijos, las leyendas de capa) —
  // se reaplica su estado real (`applyPanelVisibility()`, `toggle.checked`)
  // para no pisar lo que el usuario tenía elegido antes de cambiar de vista.
  const leyendasPorToggle: [string, HTMLInputElement][] = [
    ['trafico-leyenda', panel.traficoToggle],
    ['valenbisi-leyenda', panel.valenbisiToggle],
    ['aparcamiento-leyenda', panel.aparcamientoToggle],
    ['pulso-leyenda', panel.pulsoToggle],
    ['fallas-leyenda', panel.fallasToggle],
    ['via-publica-leyenda', panel.viaPublicaToggle],
    // `riesgo-escorrentia-leyenda` (spec 046) se había quedado fuera de esta
    // lista — bug real: en móvil, al salir de /mapa, la leyenda no se ocultaba
    // (en escritorio no se notaba porque #info-panels se oculta entero). Se
    // corrige de paso al añadir las dos capas nuevas de specs 050/051.
    ['riesgo-escorrentia-leyenda', panel.riesgoEscorrentiaToggle],
    ['temperatura-zona-leyenda', panel.temperaturaZonaToggle],
    ['precipitacion-zona-leyenda', panel.precipitacionZonaToggle],
    ['zonas-zas-leyenda', panel.zonasZasToggle],
    ['altimetria-leyenda', panel.altimetriaToggle],
  ];
  const idsPaneleFijos = PANEL_PREFERENCES_REGISTRY.map((d) => d.key);
  const idsInteligencia = [
    'media-panel',
    'tendencia-panel',
    'camaras-panel',
    'camaras-dgt-panel',
    'agenda-panel',
    'movilidad-avisos-panel',
    'zas-ruido-panel',
    'actualidad-redes-panel',
    'apoyo-decision-panel',
    'altimetria-panel',
    'meteo-zona-panel',
    'senales-ia-panel',
    'recomendaciones-ia-panel',
    'protocolos-panel',
  ];

  initRouter((vista) => {
    const enMapa = vista === 'mapa';
    const movil = document.documentElement.dataset.layout === 'movil';

    // En móvil el mapa se deja igual que hoy con cualquier panel abierto (de
    // fondo, detrás de la hoja) — no hace falta ocultarlo ni tiene coste; en
    // escritorio, en cambio, /inteligencia es una página propia sin mapa.
    if (!movil) document.getElementById('map')!.hidden = !enMapa;
    document.getElementById('controls')!.hidden = !enMapa;
    document.getElementById('dashboard-kpis')!.hidden = !enMapa;
    panel.banner.hidden = !(enMapa && panel.mockToggle.checked);

    // `#info-panels` es un contenedor compartido en móvil (spec 029, bottom
    // sheet, también aloja los paneles de /inteligencia) — solo tiene sentido
    // ocultarlo entero en escritorio; en móvil se ocultan sus hijos "de mapa"
    // uno a uno más abajo, sin tocar el contenedor.
    if (!movil) document.getElementById('info-panels')!.hidden = !enMapa;

    if (enMapa) {
      applyPanelVisibility();
      for (const [id, toggle] of leyendasPorToggle) {
        const el = document.getElementById(id);
        if (el) el.hidden = !toggle.checked;
      }
      map.resize();
    } else {
      for (const id of [...idsPaneleFijos, ...leyendasPorToggle.map(([id]) => id)]) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      }
    }

    for (const id of idsInteligencia) {
      const el = document.getElementById(id);
      if (el) el.hidden = enMapa;
    }
  });
}

main().catch((err: unknown) => {
  console.error('Fallo al iniciar Mirall:', err);
});
