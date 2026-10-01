// Utilidades compartidas por los paneles de datos (info-panel): escapado
// defensivo, formato de frescura y el contenedor `#info-panels` + polling
// adaptativo. Antes vivían sueltas en `main.ts`, usadas por todos los
// paneles (meteo, aire, tráfico, Valenbisi, aparcamiento...); primer paso al
// extraer el panel de meteorología (ver spec 038 v6 para el primer panel
// movido, cámaras) — cada panel que se vaya extrayendo importa desde aquí en
// vez de duplicar estas funciones o depender de otro módulo de panel.

// Escapado defensivo — títulos/URLs de fuentes externas (RSS, etc.) nunca se
// insertan en el DOM sin pasar por aquí (riesgo de XSS si una fuente llega
// corrupta o comprometida).
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatoFrescura(fetchedAt: string): string {
  const minutos = Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000);
  if (minutos < 1) return 'hace instantes';
  if (minutos === 1) return 'hace 1 min';
  return `hace ${minutos} min`;
}

// Fecha/hora absoluta — pedido explícito del usuario (2026-09-24): el "hace
// N min" relativo no basta para saber DESDE CUÁNDO es un dato, hace falta el
// momento exacto en todo sitio que muestre información. "hoy"/"ayer" cuando
// aplica, si no día/mes cortos — siempre HH:MM en 24h.
export function formatoFechaHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const ahora = new Date();
  const horaMin = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const esMismoDia = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (esMismoDia(fecha, ahora)) return `hoy ${horaMin}`;
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (esMismoDia(fecha, ayer)) return `ayer ${horaMin}`;
  const diaMes = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  return `${diaMes} ${horaMin}`;
}

// Fecha SIN hora — para fuentes que de verdad solo dan un día (p.ej. las
// notas de prensa de avisos oficiales de Emergencias GVA, que solo publican
// DD/MM/YYYY). Bug real corregido (2026-10-01): usar `formatoFechaHora` ahí
// fabricaba un "00:00" falso — parecía que el aviso se había detectado a
// medianoche en punto, cuando en realidad solo se sabe el día, no la hora.
// Mostrar una hora inventada es peor que no mostrarla, no mejor.
export function formatoFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const ahora = new Date();
  const esMismoDia = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (esMismoDia(fecha, ahora)) return 'hoy';
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (esMismoDia(fecha, ayer)) return 'ayer';
  return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function metaFrescura(fuente: string, fetchedAt: string, fresh: boolean): string {
  const aviso = fresh
    ? ''
    : '<span class="info-panel__stale" title="No se pudo refrescar, mostrando el último dato bueno">⚠ no actualizado</span>';
  return `${fuente} · actualizado ${formatoFrescura(fetchedAt)} (${formatoFechaHora(fetchedAt)}) ${aviso}`;
}

export function buildInfoPanel(id: string, opciones?: { colapsable?: boolean }): HTMLDivElement {
  let container = document.getElementById('info-panels') as HTMLDivElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = 'info-panels';
    document.body.appendChild(container);
  }
  const root = document.createElement('div');
  root.id = id;
  root.className = 'info-panel';
  // spec 035 §5.2 (v2) arrancaba las leyendas colapsadas a su título, con
  // clic/tap para expandir. Petición explícita del usuario (2026-09-30):
  // que se vean siempre abiertas al activar la capa, sin tener que pulsar
  // — arrancan ya expandidas (`is-expandida` desde el principio); el clic
  // sigue ahí solo para quien quiera plegarla a mano y reducir el ruido.
  if (opciones?.colapsable) {
    root.classList.add('info-panel--colapsable', 'is-expandida');
    root.tabIndex = 0;
    root.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('button, a')) return;
      root.classList.toggle('is-expandida');
    });
  }
  root.textContent = 'Cargando…';
  container.appendChild(root);
  return root;
}

export function startPolling(refresh: () => Promise<void>, intervalMs: number): void {
  refresh().catch((err: unknown) => console.error('Fallo al refrescar panel:', err));
  setInterval(() => {
    refresh().catch((err: unknown) => console.error('Fallo al refrescar panel:', err));
  }, intervalMs);
}
