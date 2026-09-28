import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import handler from './auth-login';
import { pbkdf2, verificarSesion, leerCookie, COOKIE_NOMBRE, _resetRateLimit } from './_shared/auth';

const SECRET = 'secreto-de-prueba-suficientemente-largo-para-hmac-0123456789';
const SALT = 'ffeeddccbbaa99887766554433221100';
let APP_USERS = '';

beforeAll(async () => {
  APP_USERS = JSON.stringify([{ u: 'rcerdan', h: await pbkdf2('123456', SALT), s: SALT }]);
});

beforeEach(() => {
  _resetRateLimit();
  process.env.AUTH_SECRET = SECRET;
  process.env.APP_USERS = APP_USERS;
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.APP_USERS;
});

function login(body: unknown, ip = '10.0.0.1'): Promise<Response> {
  return handler(
    new Request('http://localhost/api/auth/v1/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/auth/v1/login', () => {
  it('405 si el método no es POST', async () => {
    const res = await handler(new Request('http://localhost/api/auth/v1/login'));
    expect(res.status).toBe(405);
  });

  it('503 si falta AUTH_SECRET o APP_USERS', async () => {
    delete process.env.AUTH_SECRET;
    expect((await login({ usuario: 'rcerdan', pin: '123456' })).status).toBe(503);
  });

  it('200 + cookie de sesión firmada con credencial correcta', async () => {
    const res = await login({ usuario: 'rcerdan', pin: '123456', recordar: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Max-Age=');
    const token = leerCookie(setCookie.split(';')[0], COOKIE_NOMBRE);
    const payload = await verificarSesion(token, SECRET);
    expect(payload?.u).toBe('rcerdan');
  });

  it('sin "recordar" la cookie no lleva Max-Age', async () => {
    const res = await login({ usuario: 'rcerdan', pin: '123456', recordar: false });
    expect(res.headers.get('set-cookie')).not.toContain('Max-Age');
  });

  it('401 con cuerpo genérico para PIN incorrecto y para usuario inexistente', async () => {
    const malPin = await login({ usuario: 'rcerdan', pin: '999999' });
    const malUser = await login({ usuario: 'nadie', pin: '123456' });
    expect(malPin.status).toBe(401);
    expect(malUser.status).toBe(401);
    expect(await malPin.json()).toEqual({ ok: false });
    expect(await malUser.json()).toEqual({ ok: false });
  });

  it('429 con Retry-After tras 5 intentos fallidos desde la misma IP', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await login({ usuario: 'rcerdan', pin: 'malo' }, '10.0.0.9');
      expect(r.status).toBe(401);
    }
    const bloqueado = await login({ usuario: 'rcerdan', pin: '123456' }, '10.0.0.9');
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers.get('retry-after')).toBeTruthy();
    expect((await bloqueado.json()).retryAfterS).toBeGreaterThan(0);
  });

  it('el rate-limit por IP no se puede saltar falsificando el primer valor de X-Forwarded-For', async () => {
    // El primer valor de x-forwarded-for lo declara el cliente (falsificable);
    // el de confianza es el ÚLTIMO que añade la red de Vercel. Un atacante que
    // varía el valor que él mismo declara en cada intento no debe librarse del
    // límite si el último salto (la IP real) no cambia.
    for (let i = 0; i < 5; i++) {
      const r = await handler(
        new Request('http://localhost/api/auth/v1/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `1.2.3.${i}, 10.0.0.9` },
          body: JSON.stringify({ usuario: 'rcerdan', pin: 'malo' }),
        }),
      );
      expect(r.status).toBe(401);
    }
    const bloqueado = await handler(
      new Request('http://localhost/api/auth/v1/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9, 10.0.0.9' },
        body: JSON.stringify({ usuario: 'rcerdan', pin: '123456' }),
      }),
    );
    expect(bloqueado.status).toBe(429);
  });

  it('400 si el cuerpo no es JSON válido', async () => {
    const res = await handler(
      new Request('http://localhost/api/auth/v1/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.2' },
        body: '{roto',
      }),
    );
    expect(res.status).toBe(400);
  });
});
