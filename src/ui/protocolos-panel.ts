// Panel de protocolos de actuación — spec 042, dentro de /inteligencia (spec
// 040). Contenido estático (sin red ni caché) — la única "carga" es
// construir el DOM desde `PROTOCOLOS_ACTUACION`. Fecha de última revisión
// siempre visible (§6): es la mitigación principal de la spec contra
// contenido desactualizado sin que se note.
//
// DataCard rediseñada en spec 056 Fase 4, fila 4, §8.5.12 — el documento pide
// una pill de estado por protocolo ("Activo"/"Vigilancia"/"En reposo"), pero
// `ProtocoloActuacion` no modela ningún estado: es contenido de referencia
// estático, no un protocolo con seguimiento en vivo (nadie activa/desactiva
// un protocolo desde esta app). Inventar una pill de estado fingiría una
// monitorización que no existe — se omite, y la fecha de última revisión
// (ya presente) sigue siendo la señal real de vigencia del contenido.
import { PROTOCOLOS_ACTUACION, type ProtocoloActuacion } from '../config/protocolos-actuacion';
import { escapeHtml } from './panel-utils';
import { iconoSvg } from './iconos';

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

function renderProtocolo(p: ProtocoloActuacion): string {
  const lista = (items: string[]) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
  const fuente = p.fuente
    ? `<a class="protocolo__fuente" href="${escapeHtml(p.fuente)}" target="_blank" rel="noopener noreferrer">Fuente ↗</a>`
    : '<span class="protocolo__fuente protocolo__fuente--sin-citar">Sin fuente oficial citada</span>';
  return `
    <details class="protocolo">
      <summary class="protocolo__titulo">${escapeHtml(p.titulo)}</summary>
      <div class="protocolo__cuerpo">
        <div class="protocolo__bloque">
          <div class="protocolo__bloque-titulo">Antes</div>
          <ul>${lista(p.antes)}</ul>
        </div>
        <div class="protocolo__bloque">
          <div class="protocolo__bloque-titulo">Durante</div>
          <ul>${lista(p.durante)}</ul>
        </div>
        <div class="protocolo__pie">
          <span class="protocolo__revision">Última revisión: ${formatoFecha(p.ultimaRevision)}</span>
          ${fuente}
        </div>
      </div>
    </details>
  `;
}

export function buildProtocolosContent(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'protocolos-panel';
  root.className = 'mv2-card';
  root.dataset.vistaInteligenciaCard = '';
  root.dataset.categoria = 'institucional';
  root.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg('shield-check', 16)}</span>
      <h3 class="mv2-card__title">Protocolos de actuación</h3>
    </header>
    <div class="mv2-card__body">
      <p class="mv2-body-s" style="color:var(--text-muted);margin:0">Contenido de referencia, punto de vista policía local. No sustituye el protocolo oficial de cada cuerpo ni la coordinación real con 112/bomberos.</p>
      <div class="protocolos-lista">${PROTOCOLOS_ACTUACION.map(renderProtocolo).join('')}</div>
    </div>
  `;
  return root;
}
