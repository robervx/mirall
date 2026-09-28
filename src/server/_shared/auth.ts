// Helpers de autenticación compartidos — ver specs/018-acceso-protegido-dominio.md §2-§3.
//
// Los usa tanto `middleware.ts` (gate en el edge de Vercel) como
// `api/auth/v1/*` (endpoints de login/logout/estado) y el plugin de dev de
// `vite.config.ts` (réplica local del gate).
//
// Solo WebCrypto (`crypto.subtle`) + `btoa`/`atob`: disponibles en el runtime
// edge de Vercel, en Node ≥ 20 y en el entorno de test. Ninguna dependencia nueva.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const COOKIE_NOMBRE = 'imc_session';

/** "Recordar este dispositivo" marcado (por defecto). */
export const DURACION_RECORDAR_MS = 30 * 24 * 60 * 60 * 1000;
/** Sin "recordar": cookie de sesión del navegador, expira antes. */
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Codificación
// ---------------------------------------------------------------------------

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(s: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(Math.floor(s.length / 2)));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Comparación en tiempo constante sobre dos cadenas hex de igual longitud. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// APP_USERS + PIN (PBKDF2-SHA256)
// ---------------------------------------------------------------------------

export interface AppUser {
  /** usuario */
  u: string;
  /** hash PBKDF2-SHA256 del PIN, hex */
  h: string;
  /** sal, hex (16 bytes) */
  s: string;
}

export const PBKDF2_ITERACIONES = 100_000;
const PBKDF2_BYTES = 32;

/** Deriva el hash PBKDF2-SHA256 de un PIN con una sal hex dada. */
export async function pbkdf2(pin: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: PBKDF2_ITERACIONES, hash: 'SHA-256' },
    keyMaterial,
    PBKDF2_BYTES * 8,
  );
  return hex(bits);
}

/** Lee y valida `APP_USERS`. Lanza si el formato no es `[{u,h,s}, ...]`. */
export function parseAppUsers(raw: string | undefined): AppUser[] {
  if (!raw || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('APP_USERS no es JSON válido');
  }
  if (!Array.isArray(parsed)) throw new Error('APP_USERS debe ser un array JSON');
  return parsed.map((entry, i) => {
    const e = entry as Partial<AppUser>;
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof e.u !== 'string' ||
      typeof e.h !== 'string' ||
      typeof e.s !== 'string'
    ) {
      throw new Error(`APP_USERS[${i}] no tiene la forma {u,h,s}`);
    }
    return { u: e.u, h: e.h, s: e.s };
  });
}

/**
 * Verifica usuario + PIN contra la lista. Siempre ejecuta un PBKDF2 completo
 * (aunque el usuario no exista) para no filtrar la existencia del usuario por
 * el tiempo de respuesta, y compara en tiempo constante.
 */
export async function verificarCredencial(usuario: string, pin: string, users: AppUser[]): Promise<boolean> {
  const encontrado = users.find((x) => x.u === usuario);
  const objetivo: AppUser = encontrado ?? { u: usuario, h: '0'.repeat(PBKDF2_BYTES * 2), s: '0'.repeat(32) };
  const calculado = await pbkdf2(pin, objetivo.s);
  const coincide = timingSafeEqual(calculado, objetivo.h);
  return encontrado !== undefined && coincide;
}

// ---------------------------------------------------------------------------
// Cookie de sesión firmada (HMAC-SHA256)
// ---------------------------------------------------------------------------

export interface SessionPayload {
  /** usuario */
  u: string;
  /** epoch ms de emisión */
  iat: number;
  /** epoch ms de expiración */
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** `base64url(payload) "." base64url(HMAC(payload, secret))` */
export async function firmarSesion(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Devuelve el payload si la firma es válida y no ha expirado; si no, `null`. */
export async function verificarSesion(token: string | undefined, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const punto = token.indexOf('.');
  if (punto < 1 || punto === token.length - 1) return null;
  const body = token.slice(0, punto);
  const sig = token.slice(punto + 1);

  let valido: boolean;
  try {
    valido = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!valido) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(dec.decode(b64urlDecode(body))) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.u !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Date.now()) return null;
  return payload;
}

/** Lee una cookie concreta de la cabecera `Cookie`. */
export function leerCookie(header: string | null | undefined, nombre: string): string | undefined {
  if (!header) return undefined;
  for (const parte of header.split(';')) {
    const idx = parte.indexOf('=');
    if (idx < 0) continue;
    if (parte.slice(0, idx).trim() === nombre) {
      try {
        return decodeURIComponent(parte.slice(idx + 1).trim());
      } catch {
        // Valor con % mal formado — se trata como si la cookie no existiera
        // en vez de dejar que el URIError tumbe con 500 al llamador (el
        // gate de acceso se ejecuta en cada petición a una ruta protegida).
        return undefined;
      }
    }
  }
  return undefined;
}

export function construirSetCookie(token: string, recordar: boolean): string {
  const base = `${COOKIE_NOMBRE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return recordar ? `${base}; Max-Age=${Math.floor(DURACION_RECORDAR_MS / 1000)}` : base;
}

export const SET_COOKIE_BORRAR = `${COOKIE_NOMBRE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// ---------------------------------------------------------------------------
// Rate-limit de intentos de login
// ---------------------------------------------------------------------------
//
// `Map` en memoria de proceso — MISMA limitación documentada en
// `api/_shared/cache.ts`: en el edge multi-región de Vercel es best-effort
// (cada región tiene su propio proceso). Mitiga fuerza bruta casual, no un
// ataque distribuido — de ahí el mínimo de 6 dígitos de PIN (ver spec §7).
// Se sustituye por Upstash cuando existan `UPSTASH_REDIS_REST_*`, sin cambiar
// la firma de estas funciones.

interface VentanaIntentos {
  count: number;
  resetAt: number;
}

const intentos = new Map<string, VentanaIntentos>();

export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_VENTANA_MS = 15 * 60 * 1000;

export function comprobarRateLimit(clave: string, ahora: number = Date.now()): {
  permitido: boolean;
  retryAfterS: number;
} {
  const e = intentos.get(clave);
  if (!e || e.resetAt <= ahora) return { permitido: true, retryAfterS: 0 };
  if (e.count < RATE_LIMIT_MAX) return { permitido: true, retryAfterS: 0 };
  return { permitido: false, retryAfterS: Math.max(1, Math.ceil((e.resetAt - ahora) / 1000)) };
}

export function registrarFallo(clave: string, ahora: number = Date.now()): void {
  const e = intentos.get(clave);
  if (!e || e.resetAt <= ahora) {
    intentos.set(clave, { count: 1, resetAt: ahora + RATE_LIMIT_VENTANA_MS });
  } else {
    e.count += 1;
  }
}

export function limpiarFallos(clave: string): void {
  intentos.delete(clave);
}

/** Solo para tests — vacía el estado de rate-limit del proceso. */
export function _resetRateLimit(): void {
  intentos.clear();
}
