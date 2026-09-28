// POST /api/auth/v1/login — ver specs/018-acceso-protegido-dominio.md §3.
//   req  { usuario: string; pin: string; recordar?: boolean }
//   200  { ok: true }                          + Set-Cookie: imc_session=...
//   401  { ok: false }                          (mensaje genérico)
//   429  { ok: false; retryAfterS: number }     + Retry-After
//   400/405/503 según corresponda
import {
  parseAppUsers,
  verificarCredencial,
  firmarSesion,
  construirSetCookie,
  comprobarRateLimit,
  registrarFallo,
  limpiarFallos,
  DURACION_RECORDAR_MS,
  DURACION_SESION_MS,
  type AppUser,
} from './_shared/auth';

export const config = { runtime: 'edge' };

function json(obj: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false }, 405);

  const secret = process.env.AUTH_SECRET;
  let users: AppUser[];
  try {
    users = parseAppUsers(process.env.APP_USERS);
  } catch {
    return json({ ok: false, error: 'servicio no configurado' }, 503);
  }
  if (!secret || users.length === 0) return json({ ok: false, error: 'servicio no configurado' }, 503);

  let body: { usuario?: unknown; pin?: unknown; recordar?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false }, 400);
  }
  const usuario = typeof body.usuario === 'string' ? body.usuario : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';
  const recordar = body.recordar !== false; // por defecto true

  // `x-real-ip` es la IP de cliente que añade la propia red de Vercel (de
  // confianza). El PRIMER valor de `x-forwarded-for` lo declara el cliente
  // (falsificable a voluntad); el de confianza es el ÚLTIMO que añade el
  // proxy de Vercel — nunca el primero, o cualquiera se salta el rate-limit
  // por IP mandando un valor distinto en cada intento.
  const xff = (req.headers.get('x-forwarded-for') ?? '').split(',');
  const ip = req.headers.get('x-real-ip')?.trim() || xff[xff.length - 1]?.trim() || 'desconocida';
  const claves = [`ip:${ip}`, `u:${usuario}`];

  for (const clave of claves) {
    const rl = comprobarRateLimit(clave);
    if (!rl.permitido) {
      return json({ ok: false, retryAfterS: rl.retryAfterS }, 429, { 'retry-after': String(rl.retryAfterS) });
    }
  }

  const ok = usuario !== '' && pin !== '' && (await verificarCredencial(usuario, pin, users));
  if (!ok) {
    for (const clave of claves) registrarFallo(clave);
    return json({ ok: false }, 401);
  }

  for (const clave of claves) limpiarFallos(clave);

  const ahora = Date.now();
  const token = await firmarSesion(
    { u: usuario, iat: ahora, exp: ahora + (recordar ? DURACION_RECORDAR_MS : DURACION_SESION_MS) },
    secret,
  );

  return json({ ok: true }, 200, { 'set-cookie': construirSetCookie(token, recordar) });
}
