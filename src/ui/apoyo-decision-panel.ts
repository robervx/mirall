// Apoyo a decisión operativa — spec 041. Cruza señales ya calculadas por
// otras specs (§2) y muestra una sugerencia de texto en condicional — nunca
// una acción ejecutable (§0, CLAUDE.md §4): no hay botón "enviar" ni
// "despachar", solo "Ver en el mapa" (navega a /mapa y centra en el punto,
// no dispara nada por sí mismo).
//
// Spec 056 Fase 4: ya no monta su propia tarjeta en /inteligencia — el
// documento de diseño la funde como pestaña dentro de "Recomendaciones de
// actuación" (§8.5, nota de tarjetas sin diseño propio). `iniciarApoyoDecision`
// expone solo el refresco de datos para que `recomendaciones-actuacion-panel.ts`
// monte el marcado dentro de su propia tarjeta.
import type { SugerenciaOperativa } from '../services/apoyo-decision';
import { escapeHtml, metaFrescuraCorta, startPolling } from './panel-utils';
import { pedirCentrarMapa } from './centrar-mapa';
import { irAVista } from './router';

async function fetchSugerenciasActuales(): Promise<{ sugerencias: SugerenciaOperativa[]; fresh: boolean }> {
  const res = await fetch('/api/decision/v1/sugerencias');
  if (!res.ok) throw new Error(`GET /api/decision/v1/sugerencias -> HTTP ${res.status}`);
  return (await res.json()) as { sugerencias: SugerenciaOperativa[]; fresh: boolean };
}

function renderSugerencia(s: SugerenciaOperativa, i: number): string {
  const chips = s.señalesCombinadas.map((señal) => `<span class="mv2-pill mv2-pill--neutral">${escapeHtml(señal)}</span>`).join('');
  const fuentes = s.fuenteSpec.map((spec) => `<span class="mv2-pill mv2-pill--neutral">${escapeHtml(spec)}</span>`).join('');
  const donde = s.calle ? `${escapeHtml(s.calle)} · ${escapeHtml(s.distrito ?? '')}` : escapeHtml(s.distrito ?? 'Valencia');
  return `
    <div class="sugerencia-operativa sugerencia-operativa--${s.severidad}">
      <div class="sugerencia-operativa__cabecera">
        <span class="sugerencia-operativa__lugar">${donde}</span>
        <span class="sugerencia-operativa__severidad">${s.severidad}</span>
      </div>
      <div class="sugerencia-operativa__chips">${chips}</div>
      <div class="sugerencia-operativa__resumen">${escapeHtml(s.resumen)}</div>
      <div class="sugerencia-operativa__texto">${escapeHtml(s.sugerenciaTexto)}</div>
      <div class="sugerencia-operativa__pie">
        <button type="button" class="mv2-btn mv2-btn--pill-small sugerencia-operativa__ver-mapa" data-sugerencia-index="${i}">Ver en el mapa ↗</button>
        <span class="sugerencia-operativa__fuentes">${fuentes}</span>
      </div>
    </div>
  `;
}

/** Conecta el refresco de datos a un `list`/`meta` ya existentes en el DOM
 * (la tarjeta la monta el llamante — ver `recomendaciones-actuacion-panel.ts`). */
export function iniciarApoyoDecision(list: HTMLDivElement, meta: HTMLElement): void {
  let ultimasSugerencias: SugerenciaOperativa[] = [];

  list.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-sugerencia-index]');
    if (!boton) return;
    const sugerencia = ultimasSugerencias[Number(boton.dataset.sugerenciaIndex)];
    if (!sugerencia) return;
    pedirCentrarMapa({ coordenadas: sugerencia.centroide, zoom: 16 });
    irAVista('mapa');
  });

  async function refresh(): Promise<void> {
    try {
      const { sugerencias, fresh } = await fetchSugerenciasActuales();
      ultimasSugerencias = sugerencias;
      if (sugerencias.length === 0) {
        list.innerHTML = '<div class="mv2-card__estado">Sin conjunción de señales activa ahora mismo.</div>';
      } else {
        list.innerHTML = sugerencias.map(renderSugerencia).join('');
      }
      meta.textContent = metaFrescuraCorta('Mirall (apoyo a decisión)', new Date().toISOString());
      meta.classList.toggle('mv2-card__meta--stale', !fresh);
    } catch (err) {
      list.textContent = 'Apoyo a decisión no disponible';
      console.error('Fallo al cargar sugerencias de apoyo a decisión:', err);
    }
  }

  startPolling(refresh, 3 * 60 * 1000); // igual TTL que la caché de tráfico, la señal más rápida de las que combina (spec 041 §4)
}
