// Tarjeta "Señales" — spec 047, rediseñada a DataCard (spec 056 Fase 4,
// fila 1, §8.5). Hechos correlacionados y trazables (tipo, calle, distrito,
// severidad, fuente), calculados en servidor SIN intervención de IA
// (`correlacion-senales.ts`) — a diferencia de la caja hermana de
// recomendaciones, esta nunca depende de la disponibilidad del modelo.
import type { SenalCorrelacionada, TipoSenal, Severidad } from '../services/correlacion-senales';
import { escapeHtml, metaFrescuraCorta, startPolling } from './panel-utils';
import { iconoSvg } from './iconos';

interface RespuestaSintesisV2 {
  senales: SenalCorrelacionada[];
  generadaEn: string;
  fresh: boolean;
}

async function fetchSintesisV2(): Promise<RespuestaSintesisV2> {
  const res = await fetch('/api/sintesis/v2/actual');
  if (!res.ok) throw new Error(`GET /api/sintesis/v2/actual -> HTTP ${res.status}`);
  return (await res.json()) as RespuestaSintesisV2;
}

const ETIQUETA_TIPO: Record<TipoSenal, string> = {
  trafico: 'Tráfico',
  incidencia: 'Incidencia',
  clima: 'Clima',
  evento: 'Evento',
  camara: 'Cámara',
};

const ORDEN_SEVERIDAD: Record<Severidad, number> = { urgente: 0, aviso: 1, informativo: 2 };

const COLOR_SEVERIDAD: Record<Severidad, string> = {
  urgente: 'var(--danger)',
  aviso: 'var(--warning)',
  informativo: 'var(--accent)',
};

function renderSenales(senales: SenalCorrelacionada[]): string {
  if (senales.length === 0) {
    return '<div class="mv2-card__estado">Sin señales activas ahora mismo.</div>';
  }
  return senales
    .slice()
    .sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad])
    .map((s) => {
      const color = COLOR_SEVERIDAD[s.severidad];
      return `
        <div class="mv2-row">
          <span class="mv2-row__punto" style="background:${color}"></span>
          <span class="mv2-row__contenido">
            <span class="mv2-row__cabecera">
              <span class="mv2-row__tipo" style="color:${color}">${escapeHtml(ETIQUETA_TIPO[s.tipo])}</span>
            </span>
            <span class="mv2-row__cuerpo">${escapeHtml(s.descripcion)}</span>
            <span class="senales-ia__fuentes">${s.fuenteSpec.map((f) => `<span class="mv2-pill mv2-pill--neutral">${escapeHtml(f)}</span>`).join('')}</span>
          </span>
        </div>
      `;
    })
    .join('');
}

export function montarSenalesPanel(): void {
  const root = document.createElement('section');
  root.id = 'senales-ia-panel';
  root.className = 'mv2-card';
  root.dataset.vistaInteligenciaCard = '';
  root.setAttribute('aria-labelledby', 'senales-ia-panel__titulo');
  root.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg('radio-tower', 16)}</span>
      <h3 id="senales-ia-panel__titulo" class="mv2-card__title">Señales</h3>
      <span class="mv2-card__live"><span class="mv2-card__live-dot"></span>EN VIVO</span>
      <span class="mv2-card__meta" id="senales-ia-meta"></span>
    </header>
    <div class="mv2-card__body" id="senales-ia-body"></div>
  `;
  document.body.appendChild(root);
  const body = root.querySelector<HTMLDivElement>('#senales-ia-body')!;

  async function refresh(): Promise<void> {
    try {
      const datos = await fetchSintesisV2();
      body.innerHTML = renderSenales(datos.senales);
      const meta = root.querySelector('#senales-ia-meta')!;
      meta.textContent = metaFrescuraCorta('Correlación interna', datos.generadaEn);
      meta.classList.toggle('mv2-card__meta--stale', !datos.fresh);
    } catch (err) {
      body.textContent = 'Señales no disponibles ahora mismo.';
      console.error('Fallo al cargar señales correlacionadas:', err);
    }
  }

  startPolling(refresh, 90 * 60 * 1000); // mismo TTL que el endpoint
}
