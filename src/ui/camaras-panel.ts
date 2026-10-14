// Tarjeta "Cámaras en vías de acceso" — spec 038 (Valencia ciudad, personal)
// + spec 043 (red viaria externa, DGT, pública), fusionadas como pestañas
// "Accesos (DGT)" | "Ciudad" dentro de una única `DataCard` (spec 056 Fase 4,
// fila 3 "Movilidad y actividad", §8.5 — nota explícita del documento:
// "fusionada con 'Cámaras en vías de acceso' mediante pestañas").
//
// Sin backend ni polling propio para el vídeo: son embeds/imágenes de
// terceros mostrados directo en el navegador de quien mira, nunca grabados
// ni rehosteados por nosotros (spec 038 §1). Diseño "clic para reproducir"
// en la pestaña Ciudad: nada de vídeo se carga hasta que se pulsa su
// tarjeta. La pestaña DGT es imagen JPEG que se refresca sola cada ~2 min.
import { camarasVisibles, type CamaraUrbana } from '../config/camaras-urbanas';
import { agruparPorCarretera, type CamaraExternaDgt } from '../services/camaras-dgt';
import camarasDgtValencia from '../../data/camaras-dgt-valencia.json' with { type: 'json' };
import { escapeHtml } from './panel-utils';
import { iconoSvg } from './iconos';

const REFRESCO_CAMARAS_DGT_MS = 120_000;

// ---------------------------------------------------------------------------
// Pestaña "Accesos (DGT)" — spec 043
// ---------------------------------------------------------------------------

function renderCamarasExternasDgt(root: HTMLElement, camaras: CamaraExternaDgt[]): void {
  if (camaras.length === 0) {
    root.innerHTML = '<div class="mv2-card__estado">Sin cámaras disponibles.</div>';
    return;
  }
  const grupos = agruparPorCarretera(camaras);
  root.innerHTML = `
    <p class="mv2-body-s" style="color:var(--text-muted);margin:0 0 12px">Imágenes en directo de la Dirección General de Tráfico (dataset "Cámaras DGT DATEX2 v3.7", licencia Creative Commons Attribution) — se actualizan cada ~2 min.</p>
    ${grupos
      .map(
        (g, i) => `
          <details class="camaras-dgt-carretera" ${i === 0 ? 'open' : ''}>
            <summary>${escapeHtml(g.carretera)} <span class="mv2-meta-mono">(${g.camaras.length})</span></summary>
            <div class="camaras-dgt-grid" data-carretera="${escapeHtml(g.carretera)}"></div>
          </details>
        `,
      )
      .join('')}
  `;
  root.querySelectorAll<HTMLDivElement>('.camaras-dgt-grid').forEach((contenedor) => {
    const carretera = contenedor.dataset.carretera;
    const grupo = grupos.find((g) => g.carretera === carretera);
    if (!grupo) return;
    contenedor.innerHTML = grupo.camaras
      .map(
        (c) => `
          <figure class="camara-dgt-tile">
            <span class="mv2-pill mv2-pill--live camara-dgt-tile__live"><span class="mv2-pill__dot"></span>LIVE</span>
            <img class="camara-dgt-tile__img" loading="lazy" data-src="${escapeHtml(c.imagenUrl)}" alt="Cámara ${escapeHtml(c.carretera)} PK ${escapeHtml(c.pk)}" />
            <figcaption>PK ${escapeHtml(c.pk)} · sentido ${escapeHtml(c.sentido)}</figcaption>
          </figure>
        `,
      )
      .join('');
  });

  function refrescarImagenes(): void {
    root.querySelectorAll<HTMLImageElement>('.camara-dgt-tile__img').forEach((img) => {
      const base = img.dataset.src;
      if (base) img.src = `${base}?t=${Date.now()}`;
    });
  }
  refrescarImagenes();
  setInterval(refrescarImagenes, REFRESCO_CAMARAS_DGT_MS);
}

// ---------------------------------------------------------------------------
// Pestaña "Ciudad" — spec 038
// ---------------------------------------------------------------------------

function iframeYoutubeCanal(channelId: string, nombre: string): HTMLIFrameElement {
  const src =
    `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channelId)}` +
    '&autoplay=1&mute=1&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1';
  const iframe = document.createElement('iframe');
  iframe.className = 'camara-tile__player';
  iframe.src = src;
  iframe.title = nombre;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  return iframe;
}

/** Reproductor DASH (spec 038 §7, cámara "personal" — solo llega aquí si su envFlag está activo). */
async function reproducirDash(stage: HTMLElement, manifestUrl: string): Promise<void> {
  const video = document.createElement('video');
  video.className = 'camara-tile__player camara-tile__player--video';
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;
  stage.appendChild(video);
  try {
    const { MediaPlayer } = await import('dashjs');
    const player = MediaPlayer().create();
    // El "live catchup" (acelerar/recortar buffer para pegarse al directo) de
    // dashjs entraba en un bucle play/pause en este stream — se desactiva y se
    // deja un colchón de buffer algo mayor antes del borde en directo.
    player.updateSettings({
      streaming: { liveCatchup: { enabled: false }, delay: { liveDelayFragmentCount: 4 } },
    });
    // spec 038 v5 — dash.js puede fallar de forma asíncrona tras initialize()
    // (p.ej. El Saler: manifiesto con códec mal formado, "No streams to
    // play"), sin lanzar una excepción que el try/catch de abajo pueda
    // atrapar. Sin este listener, la tarjeta se queda con un <video> vacío e
    // indefinido en vez de avisar.
    player.on(MediaPlayer.events.ERROR, () => {
      player.destroy();
      stage.innerHTML = '<div class="camara-tile__error">No disponible ahora mismo</div>';
    });
    player.initialize(video, manifestUrl, true);
    // Chrome pausa por ahorro de energía el vídeo-solo-sin-audio que queda en
    // una pestaña en segundo plano ("video-only background media was paused
    // to save power") — se reintenta al volver a primer plano. Con controles
    // nativos visibles (arriba), la persona siempre puede darle a play a mano.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && video.paused && video.isConnected) {
        void video.play().catch(() => {});
      }
    });
  } catch (err) {
    console.error('Fallo al iniciar el reproductor DASH:', err);
    stage.innerHTML = '<div class="camara-tile__error">No disponible ahora mismo</div>';
  }
}

function reproducirCamara(stage: HTMLElement, camara: CamaraUrbana): void {
  stage.innerHTML = '';
  if (camara.proveedor === 'youtube-canal' && camara.youtubeChannelId) {
    stage.appendChild(iframeYoutubeCanal(camara.youtubeChannelId, camara.nombre));
  } else if (camara.proveedor === 'turisme-cv-dash' && camara.manifestUrl) {
    void reproducirDash(stage, camara.manifestUrl);
  } else {
    stage.innerHTML = '<div class="camara-tile__error">No disponible</div>';
  }
}

function renderCamarasCiudad(root: HTMLElement, camaras: CamaraUrbana[]): void {
  if (camaras.length === 0) {
    root.innerHTML = '<div class="mv2-card__estado">No hay cámaras disponibles en esta build.</div>';
    return;
  }
  root.innerHTML = `<div class="camaras-grid">${camaras
    .map(
      () => `
        <div class="camara-tile">
          <div class="camara-tile__nombre"></div>
          <div class="camara-tile__stage">
            <button type="button" class="camara-tile__play">${iconoSvg('arrow-right', 16)}</button>
          </div>
          <a class="camara-tile__atribucion" target="_blank" rel="noopener noreferrer"></a>
        </div>
      `,
    )
    .join('')}</div>`;

  root.querySelectorAll<HTMLDivElement>('.camara-tile').forEach((tile, i) => {
    const camara = camaras[i];
    if (!camara) return;
    const stage = tile.querySelector<HTMLDivElement>('.camara-tile__stage')!;
    tile.querySelector('.camara-tile__nombre')!.textContent = camara.nombre;
    const atribucion = tile.querySelector<HTMLAnchorElement>('.camara-tile__atribucion')!;
    atribucion.href = camara.fuenteUrl;
    atribucion.textContent = `${camara.atribucion} ↗`;
    stage.querySelector('.camara-tile__play')!.addEventListener('click', () => reproducirCamara(stage, camara), { once: true });
  });
}

// ---------------------------------------------------------------------------
// Tarjeta combinada
// ---------------------------------------------------------------------------

export function montarCamarasAccesoPanel(): void {
  const root = document.createElement('section');
  root.id = 'camaras-acceso-panel';
  root.className = 'mv2-card';
  root.dataset.vistaInteligenciaCard = '';
  root.dataset.categoria = 'movilidad';
  root.innerHTML = `
    <header class="mv2-card__header">
      <span class="mv2-card__header-icon">${iconoSvg('cctv', 16)}</span>
      <h3 class="mv2-card__title">Cámaras en vías de acceso</h3>
      <span class="mv2-card__meta">DGT · cada ~2 min</span>
    </header>
    <div class="mv2-segmented mv2-segmented--inset camaras-acceso__tabs" role="tablist" style="margin:12px 18px 0">
      <button type="button" class="mv2-segmented__tab is-active" role="tab" aria-selected="true" data-tab="dgt">Accesos (DGT)</button>
      <button type="button" class="mv2-segmented__tab" role="tab" aria-selected="false" data-tab="ciudad">Ciudad</button>
    </div>
    <div class="mv2-card__body">
      <div data-tabpanel="dgt" id="camaras-acceso-dgt-body"></div>
      <div data-tabpanel="ciudad" id="camaras-acceso-ciudad-body" hidden></div>
    </div>
  `;
  document.body.appendChild(root);

  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.camaras-acceso__tabs .mv2-segmented__tab'));
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

  renderCamarasExternasDgt(root.querySelector('#camaras-acceso-dgt-body')!, camarasDgtValencia as CamaraExternaDgt[]);
  renderCamarasCiudad(root.querySelector('#camaras-acceso-ciudad-body')!, camarasVisibles());
}
