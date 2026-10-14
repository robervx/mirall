// Navegación pública (landing `/` y `/proceso`) — spec 056 Fase 2.
//
// Dos piezas: (1) resalta en la cápsula de escritorio el enlace de la sección
// visible al hacer scroll (§8.1: "ninguno aparece activo por defecto"); (2)
// construye el menú a pantalla completa de tablet/móvil (§8.3), clonando el
// lockup de la cabecera en vez de duplicar el SVG a mano.
//
// Sustituye el dropdown simple de spec 053 (bug real corregido entonces: el
// CTA "Abrir el mapa" quedaba inalcanzable en móvil) por el panel completo
// del nuevo diseño — numerado, con estado "en vivo" y CTA a ancho completo.

import { escapeHtml } from '../ui/panel-utils';

const ICONO_X = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>`;
const ICONO_MENU = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h16" /></svg>`;
const ICONO_ARROW_UP_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>`;
const ICONO_ARROW_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>`;
const ICONO_GITHUB = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.86 10.9.57.1.78-.25.78-.55v-2.17c-3.2.7-3.88-1.35-3.88-1.35-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.07.78 2.16v3.2c0 .3.2.65.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/></svg>`;

function construirMenuMovil(enlacesOrigen: HTMLAnchorElement[], lockupHtml: string): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'menu-movil';
  panel.id = 'menu-movil';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Menú de navegación');
  panel.hidden = true;

  const enlacesHtml = enlacesOrigen
    .map((a, i) => {
      const indice = String(i + 1).padStart(2, '0');
      const etiqueta = escapeHtml(a.textContent?.trim() ?? '');
      const href = escapeHtml(a.getAttribute('href') ?? '#');
      return `<a class="menu-movil__enlace" href="${href}">
        <span class="menu-movil__indice">${indice}</span>
        <span class="menu-movil__etiqueta">${etiqueta}</span>
        ${ICONO_ARROW_UP_RIGHT}
      </a>`;
    })
    .join('');

  panel.innerHTML = `
    <div class="menu-movil__cabecera">
      ${lockupHtml}
      <button type="button" class="menu-movil__cerrar" aria-label="Cerrar menú">${ICONO_X}</button>
    </div>
    <nav class="menu-movil__enlaces">${enlacesHtml}</nav>
    <div class="menu-movil__pie">
      <p class="menu-movil__estado"><span class="menu-movil__estado-dot"></span>Datos abiertos en tiempo real</p>
      <a class="mv2-btn mv2-btn--primary menu-movil__cta" href="/mapa">Abrir el mapa ${ICONO_ARROW_RIGHT}</a>
      <div class="menu-movil__contacto">
        <a href="mailto:mirall.urbanintelligence@gmail.com">mirall.urbanintelligence@gmail.com</a>
        <a href="https://github.com/robervx/mirall" target="_blank" rel="noopener" aria-label="Código en GitHub">${ICONO_GITHUB}</a>
      </div>
    </div>
  `;
  return panel;
}

export function iniciarNavPublica(): void {
  const nav = document.querySelector<HTMLElement>('.nav-publica');
  const marca = document.querySelector<HTMLElement>('.nav-publica .marca');
  const enlaces = document.querySelector<HTMLElement>('.nav-publica__enlaces');
  if (!nav || !marca || !enlaces) return;

  const enlacesOrigen = Array.from(enlaces.querySelectorAll<HTMLAnchorElement>('a'));

  // ---- Resalte del enlace activo al hacer scroll (§8.1) ----
  const seccionesObservadas: Array<{ enlace: HTMLAnchorElement; seccion: Element }> = [];
  for (const enlace of enlacesOrigen) {
    const href = enlace.getAttribute('href') ?? '';
    if (!href.startsWith('#')) continue;
    const seccion = document.querySelector(href);
    if (seccion) seccionesObservadas.push({ enlace, seccion });
  }
  if (seccionesObservadas.length > 0) {
    const observadorScroll = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const par = seccionesObservadas.find((p) => p.seccion === entrada.target);
          if (par) par.enlace.classList.toggle('is-activo', entrada.isIntersecting);
        }
      },
      { rootMargin: '-40% 0px -50% 0px' },
    );
    seccionesObservadas.forEach(({ seccion }) => observadorScroll.observe(seccion));
  }

  // ---- Botón hamburguesa (tablet + móvil) ----
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'nav-publica__hamburguesa';
  boton.setAttribute('aria-label', 'Abrir menú');
  boton.setAttribute('aria-expanded', 'false');
  boton.innerHTML = ICONO_MENU;
  nav.appendChild(boton);

  const panel = construirMenuMovil(enlacesOrigen, marca.outerHTML);
  document.body.appendChild(panel);
  const botonCerrar = panel.querySelector<HTMLButtonElement>('.menu-movil__cerrar')!;

  function abrir(): void {
    panel.hidden = false;
    document.body.style.overflow = 'hidden';
    boton.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('is-abierto'));
    botonCerrar.focus();
    document.addEventListener('keydown', alPulsarTecla);
  }

  function cerrar(): void {
    panel.classList.remove('is-abierto');
    document.body.style.overflow = '';
    boton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', alPulsarTecla);
    window.setTimeout(() => {
      panel.hidden = true;
    }, 300); // coincide con --mv2-dur-slow
    boton.focus();
  }

  function alPulsarTecla(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') cerrar();
  }

  boton.addEventListener('click', abrir);
  botonCerrar.addEventListener('click', cerrar);
  panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', cerrar));
}

iniciarNavPublica();
