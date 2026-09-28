import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseAppUsers,
  pbkdf2,
  verificarCredencial,
  firmarSesion,
  verificarSesion,
  leerCookie,
  construirSetCookie,
  timingSafeEqual,
  comprobarRateLimit,
  registrarFallo,
  limpiarFallos,
  _resetRateLimit,
  RATE_LIMIT_MAX,
  RATE_LIMIT_VENTANA_MS,
  DURACION_RECORDAR_MS,
  type AppUser,
} from './auth';

const SECRET = 'secreto-de-prueba-con-longitud-mas-que-suficiente-1234567890';

async function usuarioConPin(u: string, pin: string): Promise<AppUser> {
  const s = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  return { u, h: await pbkdf2(pin, s), s };
}

describe('parseAppUsers', () => {
  it('devuelve [] si la variable está vacía o ausente', () => {
    expect(parseAppUsers(undefined)).toEqual([]);
    expect(parseAppUsers('')).toEqual([]);
  });

  it('parsea una lista válida', () => {
    const raw = '[{"u":"a","h":"deadbeef","s":"00"}]';
    expect(parseAppUsers(raw)).toEqual([{ u: 'a', h: 'deadbeef', s: '00' }]);
  });

  it('lanza si no es JSON', () => {
    expect(() => parseAppUsers('{no-json')).toThrow(/JSON/);
  });

  it('lanza si no es un array', () => {
    expect(() => parseAppUsers('{"u":"a"}')).toThrow(/array/);
  });

  it('lanza si una entrada no tiene la forma {u,h,s}', () => {
    expect(() => parseAppUsers('[{"u":"a","h":"x"}]')).toThrow(/\[0\]/);
  });
});

describe('timingSafeEqual', () => {
  it('true solo con cadenas idénticas de igual longitud', () => {
    expect(timingSafeEqual('abcdef', 'abcdef')).toBe(true);
    expect(timingSafeEqual('abcdef', 'abcdeg')).toBe(false);
    expect(timingSafeEqual('abc', 'abcdef')).toBe(false);
  });
});

describe('verificarCredencial', () => {
  it('acepta usuario + PIN correctos', async () => {
    const users = [await usuarioConPin('rcerdan', '123456')];
    expect(await verificarCredencial('rcerdan', '123456', users)).toBe(true);
  });

  it('rechaza PIN incorrecto', async () => {
    const users = [await usuarioConPin('rcerdan', '123456')];
    expect(await verificarCredencial('rcerdan', '000000', users)).toBe(false);
  });

  it('rechaza usuario inexistente (y no lanza)', async () => {
    const users = [await usuarioConPin('rcerdan', '123456')];
    expect(await verificarCredencial('otro', '123456', users)).toBe(false);
  });
});

describe('cookie de sesión', () => {
  it('firma y verifica un payload válido', async () => {
    const exp = Date.now() + 60_000;
    const token = await firmarSesion({ u: 'rcerdan', iat: Date.now(), exp }, SECRET);
    const payload = await verificarSesion(token, SECRET);
    expect(payload?.u).toBe('rcerdan');
  });

  it('rechaza una firma hecha con otro secreto', async () => {
    const token = await firmarSesion({ u: 'rcerdan', iat: Date.now(), exp: Date.now() + 60_000 }, SECRET);
    expect(await verificarSesion(token, 'otro-secreto-distinto-pero-largo-igualmente-xxxxx')).toBeNull();
  });

  it('rechaza un payload manipulado (misma firma, body cambiado)', async () => {
    const token = await firmarSesion({ u: 'rcerdan', iat: Date.now(), exp: Date.now() + 60_000 }, SECRET);
    const [, sig] = token.split('.');
    const bodyFalso = Buffer.from(JSON.stringify({ u: 'admin', iat: Date.now(), exp: Date.now() + 60_000 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await verificarSesion(`${bodyFalso}.${sig}`, SECRET)).toBeNull();
  });

  it('rechaza una sesión caducada', async () => {
    const token = await firmarSesion({ u: 'rcerdan', iat: Date.now() - 120_000, exp: Date.now() - 60_000 }, SECRET);
    expect(await verificarSesion(token, SECRET)).toBeNull();
  });

  it('rechaza tokens vacíos o malformados', async () => {
    expect(await verificarSesion(undefined, SECRET)).toBeNull();
    expect(await verificarSesion('', SECRET)).toBeNull();
    expect(await verificarSesion('sinpunto', SECRET)).toBeNull();
    expect(await verificarSesion('.solofirma', SECRET)).toBeNull();
  });
});

describe('leerCookie / construirSetCookie', () => {
  it('extrae la cookie pedida de una cabecera con varias', () => {
    expect(leerCookie('foo=1; imc_session=abc.def; bar=2', 'imc_session')).toBe('abc.def');
    expect(leerCookie('foo=1', 'imc_session')).toBeUndefined();
    expect(leerCookie(null, 'imc_session')).toBeUndefined();
  });

  it('no lanza con un valor %-encoded mal formado (trata la cookie como ausente)', () => {
    expect(leerCookie('imc_session=%', 'imc_session')).toBeUndefined();
    expect(leerCookie('imc_session=%zz', 'imc_session')).toBeUndefined();
  });

  it('con "recordar" añade Max-Age de 30 días; sin él, no', () => {
    expect(construirSetCookie('t', true)).toContain(`Max-Age=${Math.floor(DURACION_RECORDAR_MS / 1000)}`);
    expect(construirSetCookie('t', false)).not.toContain('Max-Age');
    expect(construirSetCookie('t', true)).toContain('HttpOnly');
    expect(construirSetCookie('t', true)).toContain('Secure');
    expect(construirSetCookie('t', true)).toContain('SameSite=Lax');
  });
});

describe('rate-limit', () => {
  beforeEach(() => _resetRateLimit());

  it('permite hasta RATE_LIMIT_MAX fallos y bloquea el siguiente', () => {
    const clave = 'ip:1.2.3.4';
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(comprobarRateLimit(clave).permitido).toBe(true);
      registrarFallo(clave);
    }
    const bloqueado = comprobarRateLimit(clave);
    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.retryAfterS).toBeGreaterThan(0);
  });

  it('la ventana caduca pasado RATE_LIMIT_VENTANA_MS', () => {
    const clave = 'ip:5.6.7.8';
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) registrarFallo(clave, t0);
    expect(comprobarRateLimit(clave, t0).permitido).toBe(false);
    expect(comprobarRateLimit(clave, t0 + RATE_LIMIT_VENTANA_MS + 1).permitido).toBe(true);
  });

  it('limpiarFallos resetea el contador (login correcto)', () => {
    const clave = 'ip:9.9.9.9';
    for (let i = 0; i < RATE_LIMIT_MAX; i++) registrarFallo(clave);
    limpiarFallos(clave);
    expect(comprobarRateLimit(clave).permitido).toBe(true);
  });
});
