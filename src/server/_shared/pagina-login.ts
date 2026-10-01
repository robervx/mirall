// Pantalla de acceso — ver specs/018-acceso-protegido-dominio.md §5.
//
// La sirve `middleware.ts` (y el plugin de dev) con status 200 en la misma URL
// que pidió el usuario, sin redirect: así no se ensucia el historial del
// navegador y, tras entrar, un `location.reload()` deja ver la página pedida.
//
// HTML autocontenido: sin bundle de la app, sin dependencias de frontend.
// Marca (spec 030): logo neutro + nombre + fondo navy. Mobile-first.
import { MARCA } from '../../config/marca';

export function paginaLogin(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#0b1f33" />
<title>Acceso — ${MARCA.nombre}</title>
<style>
  :root { --navy: #0b1f33; --navy-light: #14304f; --acento: #33d6c0; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--navy);
    color: #eef3f8;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));
  }
  .card {
    width: 100%;
    max-width: 340px;
    background: var(--navy-light);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 28px 24px 24px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .brand img { width: 44px; height: 44px; object-fit: contain; }
  .brand__name { font-size: 15px; font-weight: 600; line-height: 1.25; }
  .brand__tag { font-size: 12px; color: #9fb3c8; }
  label { display: block; font-size: 13px; margin: 14px 0 6px; color: #c7d4e1; }
  input[type="text"], input[type="password"] {
    width: 100%;
    padding: 12px 12px;
    font-size: 16px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.22);
    color: #fff;
  }
  input:focus { outline: 2px solid var(--acento); outline-offset: 1px; }
  .remember { display: flex; align-items: center; gap: 8px; margin: 16px 0 4px; font-size: 13px; color: #c7d4e1; }
  .remember input { width: 18px; height: 18px; }
  button {
    width: 100%;
    margin-top: 18px;
    padding: 13px;
    font-size: 15px;
    font-weight: 600;
    border: 0;
    border-radius: 9px;
    background: var(--acento);
    color: #062017;
    cursor: pointer;
    min-height: 44px;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .error { margin-top: 14px; font-size: 13px; color: #fca5a5; min-height: 1.2em; }
  .foot { margin-top: 20px; font-size: 11px; color: #7c8ea0; text-align: center; }
</style>
</head>
<body>
  <form class="card" id="f" autocomplete="on">
    <div class="brand">
      <img src="/assets/logo.png" alt="" onerror="this.style.display='none'" />
      <div>
        <div class="brand__name">${MARCA.nombre}</div>
        <div class="brand__tag">${MARCA.descriptor}</div>
      </div>
    </div>
    <label for="usuario">Usuario</label>
    <input id="usuario" name="username" type="text" autocapitalize="none" autocorrect="off" autocomplete="username" required />
    <label for="pin">PIN</label>
    <input id="pin" name="password" type="password" inputmode="numeric" autocomplete="current-password" required />
    <label class="remember"><input id="recordar" type="checkbox" checked /> Recordar este dispositivo</label>
    <button type="submit" id="btn">Entrar</button>
    <div class="error" id="err" role="alert"></div>
    <div class="foot">Acceso restringido a este despliegue</div>
  </form>
<script>
  var f = document.getElementById('f');
  var btn = document.getElementById('btn');
  var err = document.getElementById('err');
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    fetch('/api/auth/v1/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        usuario: document.getElementById('usuario').value,
        pin: document.getElementById('pin').value,
        recordar: document.getElementById('recordar').checked,
      }),
    })
      .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        if (res.status === 200 && res.body.ok) {
          window.location.reload();
          return;
        }
        btn.disabled = false;
        if (res.status === 429) {
          err.textContent = 'Demasiados intentos. Espera ' + (res.body.retryAfterS || 60) + ' s e inténtalo de nuevo.';
        } else {
          err.textContent = 'Usuario o PIN incorrectos.';
        }
      })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'No se pudo contactar con el servidor. Reinténtalo.';
      });
  });
</script>
</body>
</html>`;
}
