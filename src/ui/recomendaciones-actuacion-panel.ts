// Tarjeta "Recomendaciones de actuación" — spec 047, rediseñada a DataCard
// (spec 056 Fase 4, fila 1 — máxima prioridad de /inteligencia, §8.5).
// Generadas por IA a partir de las señales ya correlacionadas de la caja
// hermana (senales-ia-panel.ts). Guardrails de CLAUDE.md §4: siempre
// condicional, nunca ejecutable — el aviso es fijo y siempre visible.
//
// Fusiona "Apoyo a decisión operativa" (spec 041) como segunda pestaña —
// el documento de diseño la señala explícitamente como tarjeta sin diseño
// propio a fusionar aquí (§8.5, nota final). Es la única de las dos con
// coordenadas reales (`centroide`), así que solo su pestaña lleva "Ver en
// el mapa" — las recomendaciones de la IA no tienen lat/lon que centrar.
import type { RecomendacionActuacion, RecomendacionActuacionModelo } from '../services/sintesis-ia-v2';
import { escapeHtml, metaFrescuraCorta, startPolling } from './panel-utils';
import { iniciarApoyoDecision } from './apoyo-decision-panel';
import { iconoSvg } from './iconos';

interface RespuestaSintesisV2 {
  recomendaciones: RecomendacionActuacion[];
  generadaEn: string;
  modelo: string;
  fresh: boolean;
}

async function fetchSintesisV2(): Promise<RespuestaSintesisV2> {
  const res = await fetch('/api/sintesis/v2/actual');
  if (!res.ok) throw new Error(`GET /api/sintesis/v2/actual -> HTTP ${res.status}`);
  return (await res.json()) as RespuestaSintesisV2;
}

// `tipoActuacionSugerida` es un eje de 4 valores (tipo de actuación), no una
// escala de severidad de 3 niveles como la del diseño (ALTA/MEDIA/SIN
// RIESGO) — no existe ese campo en el dato real. Mapeo editorial, no un dato
// del modelo: "informativa" es claramente SIN RIESGO; de las otras tres,
// "refuerzo-preventivo" implica anticiparse a un problema concreto (ALTA),
// "coordinacion-protocolo"/"revision-tecnica" implican que alguien lo
// revise sin ser urgente (MEDIA). Si en el futuro hace falta más precisión,
// debe venir de un campo nuevo del modelo, no de ajustar este mapeo a ojo.
const PRIORIDAD_POR_TIPO: Record<
  RecomendacionActuacionModelo['tipoActuacionSugerida'],
  { etiqueta: string; severidad: 'ok' | 'watch' | 'alert' }
> = {
  'refuerzo-preventivo': { etiqueta: 'PRIORIDAD ALTA', severidad: 'alert' },
  'coordinacion-protocolo': { etiqueta: 'PRIORIDAD MEDIA', severidad: 'watch' },
  'revision-tecnica': { etiqueta: 'PRIORIDAD MEDIA', severidad: 'watch' },
  informativa: { etiqueta: 'SIN RIESGO', severidad: 'ok' },
};

function renderRecomendaciones(recomendaciones: RecomendacionActuacion[]): string {
  if (recomendaciones.length === 0) {
    return '<div class="mv2-card__estado">Sin recomendaciones activas ahora mismo.</div>';
  }
  return recomendaciones
    .map((r) => {
      const prioridad = PRIORIDAD_POR_TIPO[r.tipoActuacionSugerida];
      const fuentes = r.fuenteSpec.map((f) => `<span class="mv2-pill mv2-pill--neutral">${escapeHtml(f)}</span>`).join('');
      return `
        <div class="recomendaciones-ia__item recomendaciones-ia__item--${prioridad.severidad}">
          <span class="recomendaciones-ia__prioridad recomendaciones-ia__prioridad--${prioridad.severidad}">${prioridad.etiqueta}</span>
          <span class="mv2-title-xs recomendaciones-ia__zona">${escapeHtml(r.zona)}</span>
          <span class="recomendaciones-ia__texto">${escapeHtml(r.texto)}</span>
          <span class="recomendaciones-ia__fuentes">${fuentes}</span>
        </div>
      `;
    })
    .join('');
}

export function montarRecomendacionesPanel(): void {
  const root = document.createElement('section');
  root.id = 'recomendaciones-ia-panel';
  root.className = 'mv2-card mv2-card--highlighted';
  root.dataset.vistaInteligenciaCard = '';
  root.setAttribute('aria-labelledby', 'recomendaciones-ia-panel__titulo');
  root.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg('sparkles', 16)}</span>
      <h3 id="recomendaciones-ia-panel__titulo" class="mv2-card__title">Recomendaciones de actuación</h3>
      <span class="mv2-card__meta" id="recomendaciones-ia-meta"></span>
    </header>
    <div class="mv2-segmented mv2-segmented--inset recomendaciones-ia__tabs" role="tablist">
      <button type="button" class="mv2-segmented__tab is-active" role="tab" aria-selected="true" data-tab="ia">Recomendaciones IA</button>
      <button type="button" class="mv2-segmented__tab" role="tab" aria-selected="false" data-tab="apoyo">Apoyo a decisión</button>
    </div>
    <div class="mv2-card__body">
      <div id="recomendaciones-ia-body" data-tabpanel="ia"></div>
      <div id="apoyo-decision-body" data-tabpanel="apoyo" hidden></div>
      <div class="mv2-card__estado--error sintesis-ia__advertencia">
        ${iconoSvg('triangle-alert', 14)}
        <span>Generado por IA a partir de señales del producto — no sustituye al criterio profesional ni autoriza ninguna actuación por sí sola.</span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.recomendaciones-ia__tabs .mv2-segmented__tab'));
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

  const body = root.querySelector<HTMLDivElement>('#recomendaciones-ia-body')!;
  const meta = root.querySelector<HTMLElement>('#recomendaciones-ia-meta')!;

  async function refresh(): Promise<void> {
    try {
      const datos = await fetchSintesisV2();
      body.innerHTML = renderRecomendaciones(datos.recomendaciones);
      meta.textContent = metaFrescuraCorta(`Mirall IA · ${datos.modelo}`, datos.generadaEn);
      meta.classList.toggle('mv2-card__meta--stale', !datos.fresh);
    } catch (err) {
      body.textContent = 'Recomendaciones no disponibles ahora mismo.';
      console.error('Fallo al cargar recomendaciones de actuación:', err);
    }
  }
  startPolling(refresh, 90 * 60 * 1000); // mismo TTL que el endpoint

  const apoyoBody = root.querySelector<HTMLDivElement>('#apoyo-decision-body')!;
  apoyoBody.innerHTML = `
    <p class="mv2-body-s" style="color:var(--text-secondary)">Cruce de señales ya existentes (Pulso de Distrito, tráfico, incidencias, lluvia) — nunca una acción ejecutable, solo un texto para que lo valore una persona.</p>
    <div id="apoyo-decision-list"></div>
    <span class="mv2-card__meta" id="apoyo-decision-meta" style="display:block;margin-top:8px"></span>
  `;
  iniciarApoyoDecision(
    apoyoBody.querySelector<HTMLDivElement>('#apoyo-decision-list')!,
    apoyoBody.querySelector<HTMLElement>('#apoyo-decision-meta')!,
  );
}
