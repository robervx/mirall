// Pantalla móvil "Barrios" — spec 056 Fase 5, §8.7. El documento pide un
// ranking de los 19 distritos por una "puntuación de bienestar" 0-100 con
// desglose Aire/Ruido/Tráfico por barrio — **adaptación honesta, decidida
// explícitamente con el usuario (2026-10-14)**: no existe ese dato real.
// El aire es una única lectura de ciudad (spec 002, no por distrito); el
// ruido solo cubre los 16 sonómetros de Russafa (spec 049, 1 de 19 zonas);
// Pulso de Distrito (spec 010) es un indicador de escenarios/alertas, no una
// puntuación continua de bienestar. En vez de fabricar un número, esta
// pantalla lista los 19 distritos reales (`getLoadedDistricts()`) con las 3
// señales que sí son por distrito hoy: Pulso (nivel de escenario activo),
// Altimetría (spec 052) y Riesgo de acumulación de agua (spec 046) — título
// honesto: "ordenados por situación", no "por bienestar". Pestaña "Cerca de
// mí" reutiliza el mismo patrón de geolocalización explícita y no persistida
// de `buildProximidadContent` (spec 012, chasis.ts).
import { getLoadedDistricts, getDistrictCentroid, type Distrito } from '../services/district-geometry';
import type { PulsoDistrito, NivelPulso } from '../services/pulso-escenarios';
import type { RiesgoEscorrentiaDistrito } from '../services/riesgo-escorrentia';
import type { ResumenAltimetriaDistrito } from '../services/altimetria';
import { distanciaMetros, formatoDistancia, type Coordenada } from '../services/proximidad';
import { setFocoDistrito } from './foco-distrito';
import { irAVista } from './router';
import { escapeHtml } from './panel-utils';

interface DatosBarrios {
  pulso: PulsoDistrito[];
  riesgo: RiesgoEscorrentiaDistrito[];
  altimetria: ResumenAltimetriaDistrito[];
}

const ultimosDatos: DatosBarrios = { pulso: [], riesgo: [], altimetria: [] };
let root: HTMLElement | null = null;
let pestañaActual: 'ranking' | 'cerca' = 'ranking';
let posicionUsuario: Coordenada | null = null;

const ORDEN_NIVEL: Record<NivelPulso, number> = { prioritario: 0, seguimiento: 1, 'sin-senal': 2 };
const ETIQUETA_NIVEL: Record<NivelPulso, string> = { prioritario: 'Prioritario', seguimiento: 'Seguimiento', 'sin-senal': 'Sin señal' };
const CLASE_NIVEL: Record<NivelPulso, string> = { prioritario: 'alert', seguimiento: 'watch', 'sin-senal': 'ok' };

function nivelDe(codigo: string): NivelPulso {
  return ultimosDatos.pulso.find((p) => p.distritoCodigo === codigo)?.nivel ?? 'sin-senal';
}

function filaBarrio(d: Distrito, metaDerecha: string): string {
  const nivel = nivelDe(d.codigo);
  const riesgo = ultimosDatos.riesgo.find((r) => r.distritoCodigo === d.codigo);
  const altimetria = ultimosDatos.altimetria.find((a) => a.distritoCodigo === d.codigo);
  const riesgoTexto = riesgo?.activo ? `${riesgo.indiceRelativo}` : '—';
  const altimetriaTexto = altimetria ? `${altimetria.elevacionMediaM.toFixed(1)} m` : '—';
  return `
    <button type="button" class="barrio-fila" data-codigo="${escapeHtml(d.codigo)}">
      <span class="barrio-fila__estado barrio-fila__estado--${CLASE_NIVEL[nivel]}" title="${ETIQUETA_NIVEL[nivel]}"></span>
      <span class="barrio-fila__nombre">${escapeHtml(d.nombre)}</span>
      <span class="barrio-fila__meta">
        <span title="Altimetría media">${altimetriaTexto}</span>
        <span title="Riesgo de acumulación de agua">${riesgoTexto}</span>
      </span>
      <span class="barrio-fila__derecha">${escapeHtml(metaDerecha)}</span>
    </button>
  `;
}

function renderRanking(lista: HTMLElement): void {
  const distritos = [...getLoadedDistricts()].sort((a, b) => {
    const porNivel = ORDEN_NIVEL[nivelDe(a.codigo)] - ORDEN_NIVEL[nivelDe(b.codigo)];
    return porNivel !== 0 ? porNivel : a.nombre.localeCompare(b.nombre);
  });
  if (distritos.length === 0) {
    lista.innerHTML = '<div class="barrios-screen__vacio">Cargando distritos…</div>';
    return;
  }
  lista.innerHTML = distritos.map((d, i) => filaBarrio(d, `${String(i + 1).padStart(2, '0')}`)).join('');
  wireFilas(lista);
}

function renderCercaDeMi(lista: HTMLElement): void {
  if (!posicionUsuario) {
    lista.innerHTML = `
      <div class="barrios-screen__vacio">
        <button type="button" class="proximidad-boton" id="barrios-cerca-boton">📍 Buscar cerca de mí</button>
        <p class="barrios-screen__cerca-nota" id="barrios-cerca-estado"></p>
      </div>
    `;
    const boton = lista.querySelector<HTMLButtonElement>('#barrios-cerca-boton')!;
    const estadoMsg = lista.querySelector<HTMLElement>('#barrios-cerca-estado')!;
    boton.addEventListener('click', () => {
      if (!('geolocation' in navigator)) {
        estadoMsg.textContent = 'Este navegador no soporta geolocalización.';
        return;
      }
      boton.disabled = true;
      estadoMsg.textContent = 'Buscando tu posición…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          posicionUsuario = [pos.coords.longitude, pos.coords.latitude];
          renderLista();
        },
        (err) => {
          boton.disabled = false;
          estadoMsg.textContent =
            err.code === err.PERMISSION_DENIED
              ? 'Permiso de ubicación denegado — actívalo en el navegador para usar esta función.'
              : 'No se pudo obtener tu posición.';
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
    return;
  }
  const conDistancia = getLoadedDistricts()
    .map((d) => {
      const centroide = getDistrictCentroid(d.codigo);
      return centroide ? { d, distancia: distanciaMetros(posicionUsuario!, centroide) } : null;
    })
    .filter((x): x is { d: Distrito; distancia: number } => x !== null)
    .sort((a, b) => a.distancia - b.distancia);
  lista.innerHTML = conDistancia.map(({ d, distancia }) => filaBarrio(d, formatoDistancia(distancia))).join('');
  wireFilas(lista);
}

function wireFilas(lista: HTMLElement): void {
  lista.querySelectorAll<HTMLButtonElement>('.barrio-fila').forEach((fila) => {
    fila.addEventListener('click', () => {
      const codigo = fila.dataset.codigo!;
      const distrito = getLoadedDistricts().find((d) => d.codigo === codigo);
      if (!distrito) return;
      setFocoDistrito({ codigo: distrito.codigo, nombre: distrito.nombre });
      irAVista('mapa');
    });
  });
}

function renderLista(): void {
  if (!root) return;
  const lista = root.querySelector<HTMLElement>('#barrios-screen__lista')!;
  const subtitulo = root.querySelector<HTMLElement>('#barrios-screen__subtitulo')!;
  const total = getLoadedDistricts().length;
  subtitulo.textContent =
    pestañaActual === 'ranking'
      ? `${total} distritos · ordenados por situación (Pulso, altimetría, riesgo de agua)`
      : 'Ordenados por distancia a tu posición actual';
  if (pestañaActual === 'ranking') renderRanking(lista);
  else renderCercaDeMi(lista);
}

function montar(): void {
  if (root) return;
  const el = document.createElement('section');
  el.id = 'barrios-screen';
  el.hidden = true;
  el.innerHTML = `
    <header class="barrios-screen__header">
      <p class="mv2-label-mono">BARRIOS</p>
      <h1 class="mv2-title-l">Barrios</h1>
      <p class="mv2-body-s" id="barrios-screen__subtitulo"></p>
    </header>
    <div class="mv2-segmented mv2-segmented--inset barrios-screen__tabs" role="tablist">
      <button type="button" class="mv2-segmented__tab is-active" role="tab" aria-selected="true" data-tab="ranking">Ranking</button>
      <button type="button" class="mv2-segmented__tab" role="tab" aria-selected="false" data-tab="cerca">Cerca de mí</button>
    </div>
    <div class="barrios-screen__lista" id="barrios-screen__lista"></div>
    <p class="mv2-card__fuente barrios-screen__nota">● sin señal · ● seguimiento · ● prioritario (Pulso de Distrito, spec 010) — altimetría en metros, riesgo de agua en índice relativo (— si no hay lluvia activa en ese distrito)</p>
  `;
  document.body.appendChild(el);
  root = el;

  const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('.barrios-screen__tabs .mv2-segmented__tab'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      pestañaActual = tab.dataset.tab === 'cerca' ? 'cerca' : 'ranking';
      renderLista();
    });
  });
}

/** Llamar desde el router cada vez que cambia la vista — construye la pantalla la primera vez. */
export function mostrarPantallaBarrios(visible: boolean): void {
  montar();
  root!.hidden = !visible;
  if (visible) renderLista();
}

/** main.ts llama aquí cuando llegan datos frescos de Pulso/Riesgo/Altimetría — nunca pide red por su cuenta. */
export function actualizarDatosBarrios(datos: Partial<DatosBarrios>): void {
  Object.assign(ultimosDatos, datos);
  if (root && !root.hidden) renderLista();
}
