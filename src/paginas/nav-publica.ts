// Menú móvil de la navegación pública (landing `/` y `/proceso`) — hamburguesa
// que despliega los enlaces + el CTA "Abrir el mapa" en un panel, sin
// dependencias. En escritorio no hace nada visible (el botón va oculto por
// CSS y los enlaces ya se ven en línea). Bug real corregido (2026-10-06):
// antes el CTA quedaba oculto del todo en móvil (`display:none`) sin ninguna
// alternativa para llegar a `/mapa` desde la cabecera.
export function iniciarNavPublica(): void {
  const nav = document.querySelector<HTMLElement>('.nav-publica');
  const enlaces = document.querySelector<HTMLElement>('.nav-publica__enlaces');
  if (!nav || !enlaces) return;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'nav-publica__hamburguesa';
  boton.setAttribute('aria-label', 'Abrir menú');
  boton.setAttribute('aria-expanded', 'false');
  boton.textContent = '☰';
  nav.insertBefore(boton, enlaces);

  function cerrar(): void {
    enlaces!.classList.remove('is-abierto');
    boton.setAttribute('aria-expanded', 'false');
    boton.textContent = '☰';
  }

  boton.addEventListener('click', () => {
    const abierto = enlaces.classList.toggle('is-abierto');
    boton.setAttribute('aria-expanded', String(abierto));
    boton.textContent = abierto ? '✕' : '☰';
  });

  enlaces.querySelectorAll('a').forEach((a) => a.addEventListener('click', cerrar));
}

iniciarNavPublica();
