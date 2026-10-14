// Métricas reales de la sección "Métricas" de la landing — spec 056 Fase 2.
// El conteo de capas se deriva de LAYER_REGISTRY (misma fuente de verdad que
// usa el selector de capas y el glosario, spec 037) para que nunca quede
// desincronizado de lo que el mapa realmente ofrece. Anima los contadores al
// entrar en viewport (600 ms, ease-out), salvo `prefers-reduced-motion`.
import { LAYER_REGISTRY } from '../config/map-layer-definitions';

// Excluye `distritos` (capa base de geometría, no una señal de datos — ver el
// comentario de `LayerDefinition.grupo` en map-layer-definitions.ts: "capa
// base, no está en el selector") y cualquier capa `esMock` (sintética, spec
// 003). El campo `grupo` NO sirve para este filtro — solo clasifica en qué
// sección del selector cae una capa (ver `main.ts`, `togglesContexto`); capas
// reales y antiguas como `meteo`/`calidadAire` (specs 001/002) no lo tienen.
function contarCapasReales(): number {
  return Object.values(LAYER_REGISTRY).filter((capa) => capa.key !== 'distritos' && !capa.esMock).length;
}

function animarContador(el: HTMLElement, destino: number, sufijo = ''): void {
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducirMovimiento) {
    el.textContent = `${destino}${sufijo}`;
    return;
  }

  const duracionMs = 600;
  const inicio = performance.now();
  function paso(ahora: number): void {
    const progreso = Math.min((ahora - inicio) / duracionMs, 1);
    const facilitado = 1 - (1 - progreso) ** 3; // ease-out cúbico
    const valor = Math.round(destino * facilitado);
    el.textContent = `${valor}${sufijo}`;
    if (progreso < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

export function iniciarMetricasLanding(): void {
  const capasEl = document.getElementById('metrica-capas');
  if (capasEl) capasEl.dataset.contador = String(contarCapasReales());

  const elementos = Array.from(document.querySelectorAll<HTMLElement>('[data-contador]'));
  if (elementos.length === 0) return;

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        const el = entrada.target as HTMLElement;
        const destino = Number(el.dataset.contador ?? '0');
        animarContador(el, destino, el.dataset.sufijo ?? '');
        observador.unobserve(el);
      }
    },
    { threshold: 0.4 },
  );
  elementos.forEach((el) => observador.observe(el));
}
