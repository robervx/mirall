// Cabecera de la vista /inteligencia — spec 056 Fase 4, §8.5. Eyebrow +
// título + subtítulo (fecha real + rollup de frescura real) + chips de
// filtro. Los chips filtran las tarjetas por `data-categoria`; las que no
// declaran categoría (p. ej. la fila 1, de prioridad) se consideran
// siempre visibles — no tiene sentido que una alerta desaparezca al filtrar
// por "Clima".
import { onCambioFrescura } from './estado-frescura';

const CATEGORIAS = [
  { valor: 'todo', etiqueta: 'Todo' },
  { valor: 'movilidad', etiqueta: 'Movilidad' },
  { valor: 'clima', etiqueta: 'Clima' },
  { valor: 'ruido', etiqueta: 'Ruido' },
  { valor: 'eventos', etiqueta: 'Eventos' },
  { valor: 'institucional', etiqueta: 'Institucional' },
] as const;

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function aplicarFiltro(categoria: string): void {
  document.querySelectorAll<HTMLElement>('[data-vista-inteligencia-card]').forEach((card) => {
    const propias = card.dataset.categoria?.split(' ') ?? [];
    const visible = categoria === 'todo' || propias.length === 0 || propias.includes(categoria);
    card.classList.toggle('inteligencia-card--filtrada', !visible);
  });
}

export function montarInteligenciaCabecera(): void {
  const header = document.createElement('header');
  header.id = 'inteligencia-cabecera';
  header.innerHTML = `
    <div class="inteligencia-cabecera__texto">
      <p class="mv2-label-mono inteligencia-cabecera__eyebrow">CAPA DE INTELIGENCIA · VALÈNCIA</p>
      <h1 class="mv2-title-xl inteligencia-cabecera__titulo">Qué está pasando en la ciudad</h1>
      <p class="mv2-body-s inteligencia-cabecera__subtitulo" id="inteligencia-cabecera__subtitulo"></p>
    </div>
    <div class="mv2-chip-row" id="inteligencia-cabecera__chips" role="tablist" aria-label="Filtrar por categoría">
      ${CATEGORIAS.map(
        (c, i) =>
          `<button type="button" class="mv2-chip${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" data-categoria="${c.valor}">${c.etiqueta}</button>`,
      ).join('')}
    </div>
  `;
  document.body.appendChild(header);

  const chips = Array.from(header.querySelectorAll<HTMLButtonElement>('#inteligencia-cabecera__chips .mv2-chip'));
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => {
        c.classList.toggle('is-active', c === chip);
        c.setAttribute('aria-selected', String(c === chip));
      });
      aplicarFiltro(chip.dataset.categoria!);
    });
  });

  const subtitulo = header.querySelector<HTMLElement>('#inteligencia-cabecera__subtitulo')!;
  function pintarSubtitulo(): void {
    const ahora = new Date();
    const fecha = capitalizar(
      ahora.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }),
    );
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    const fuentesTexto = subtitulo.dataset.fuentes ?? '';
    subtitulo.textContent = `${fecha} · ${hora}${fuentesTexto ? ` · ${fuentesTexto}` : ''}`;
  }
  pintarSubtitulo();
  setInterval(pintarSubtitulo, 30_000);

  onCambioFrescura((r) => {
    if (r.estado === 'cargando') return;
    const enVivo = r.total - r.conRetraso;
    subtitulo.dataset.fuentes = `${r.total} fuentes abiertas, ${enVivo} en vivo`;
    pintarSubtitulo();
  });
}
