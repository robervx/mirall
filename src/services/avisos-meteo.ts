/**
 * Avisos oficiales de fenómenos adversos — spec 001 v4 (specs/001-capa-meteorologia.md §2).
 *
 * Sustituye el plan (nunca activado) de avisos AEMET vía API key. Fuente
 * verificada el 2026-09-16 con llamadas reales (`curl`, sin navegador):
 * `https://comunica.gva.es/es/emergencies-i-interior`, sala de prensa de la
 * Conselleria de Emergencias e Interior (Generalitat Valenciana). HTML
 * servido sin JavaScript (a diferencia de `valencia.es/agenda`, spec 027, o
 * de la propia página de avisos de AEMET — ver spec §2, ambas descartadas),
 * `robots.txt` permite explícitamente cualquier bot, IA incluida
 * (`User-agent: * / Allow: /`).
 *
 * La fuente es un listado de notas de prensa, no una tabla de "estado
 * actual" — no hay nota de "se desactiva el aviso". Se infiere vigencia con
 * una ventana fija desde la publicación (`VENTANA_VIGENCIA_HORAS`), igual de
 * espíritu que la caducidad por ítem de spec 009 v6. Documentado como
 * limitación conocida, no oculto.
 */

export type NivelAviso = 'amarillo' | 'naranja' | 'rojo';

export interface AvisoMeteo {
  id: string; // URL de la nota de prensa — estable entre scrapes
  nivel: NivelAviso;
  titulo: string;
  resumen: string | null;
  url: string;
  publicadoEn: string; // ISO 8601 — medianoche del día de publicación (la fuente solo da DD/MM/YYYY)
  fetchedAt: string;
  source: 'gva-emergencias-scraping';
}

export interface SnapshotAvisos {
  avisos: AvisoMeteo[];
  fetchedAt: string;
}

const HEADERS = { 'User-Agent': 'vlc-monitor/1.0 (+https://github.com/)' };
export const URL_FUENTE_AVISOS = 'https://comunica.gva.es/es/emergencies-i-interior';

/** Ventana de vigencia asumida desde la publicación — ver nota de cabecera. */
export const VENTANA_VIGENCIA_HORAS = 48;

const ENTIDADES_HTML: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  oacute: 'ó',
  Oacute: 'Ó',
  eacute: 'é',
  Eacute: 'É',
  aacute: 'á',
  Aacute: 'Á',
  iacute: 'í',
  Iacute: 'Í',
  uacute: 'ú',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
};

function decodeEntities(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, nombre: string) => ENTIDADES_HTML[nombre] ?? match);
}

function limpiarHtml(texto: string): string {
  return decodeEntities(texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

interface TarjetaCruda {
  titulo: string;
  url: string;
  fechaTexto: string; // DD/MM/YYYY
  resumen: string | null;
}

/** Divide el HTML del listado en fragmentos, uno por tarjeta de nota de prensa. */
function trocearTarjetas(html: string): string[] {
  return html.split('<div class="card">').slice(1);
}

function extraerFecha(bloque: string): string | null {
  const m = /metadata-publish-date">\s*([\s\S]*?)\s*<\/span>/i.exec(bloque);
  return m?.[1] ? m[1].trim() : null;
}

function extraerTituloYUrl(bloque: string): { titulo: string; url: string } | null {
  const m = /<a class="title" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(bloque);
  if (!m) return null;
  const url = decodeEntities(m[1]!.trim());
  const titulo = limpiarHtml(m[2]!);
  if (!url || !titulo) return null;
  return { titulo, url };
}

function extraerResumen(bloque: string): string | null {
  const m = /<ul>([\s\S]*?)<\/ul>/i.exec(bloque);
  if (!m) return null;
  const items = [...m[1]!.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((mm) => limpiarHtml(mm[1]!))
    .filter((s) => s.length > 0);
  return items.length > 0 ? items.join(' ') : null;
}

/** Parser por regex del listado de tarjetas — mismo estilo minimalista que `mediatico.ts`/`agenda-eventos.ts`. */
export function parsearTarjetas(html: string): TarjetaCruda[] {
  return trocearTarjetas(html)
    .map((bloque): TarjetaCruda | null => {
      const fechaTexto = extraerFecha(bloque);
      const tituloYUrl = extraerTituloYUrl(bloque);
      if (!fechaTexto || !tituloYUrl) return null;
      return { ...tituloYUrl, fechaTexto, resumen: extraerResumen(bloque) };
    })
    .filter((t): t is TarjetaCruda => t !== null);
}

function parsearFechaPublicacion(fechaTexto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fechaTexto);
  if (!m) return null;
  const fecha = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/**
 * Bug real encontrado en producción (2026-10-01, ver memoria de proyecto):
 * exigir el verbo "activa" en el TÍTULO (fraseo original, único observado en
 * la verificación de spec 001 v4) dejaba fuera notas de seguimiento/
 * escalada que usan otros verbos — "Emergencias insiste a la ciudadanía..."
 * con "Se establece alerta roja..." en el resumen fue exactamente el caso
 * que hizo desaparecer una alerta ROJA real y vigente sin ningún error
 * visible (el riesgo ya estaba documentado en spec 001 §7, pero sin
 * detección de "0 avisos inesperado"). Ya no se exige ningún verbo
 * concreto — el filtro de relevancia real lo dan `detectarNivel` (debe
 * mencionar un color) y `mencionaValencia`, mucho más fiables que adivinar
 * el verbo exacto que use la Generalitat ese día.
 */
function mencionaAlertaOAviso(texto: string): boolean {
  return /\b(alerta|aviso)s?\b/i.test(texto);
}

function detectarNivel(texto: string): NivelAviso | null {
  const t = texto.toLowerCase();
  if (/\brojo\b/.test(t) || /\broja\b/.test(t)) return 'rojo';
  if (/\bnaranja\b/.test(t)) return 'naranja';
  if (/\bamarill[oa]\b/.test(t)) return 'amarillo';
  return null;
}

/**
 * Relevancia para Valencia (ciudad+provincia): comprobación deliberadamente
 * amplia (substring "valencia", sin distinguir litoral/interior ni
 * ciudad/provincia) — un falso positivo solo hace que una persona revise una
 * alerta que no le afecta (el texto original se muestra igual, spec §7);
 * un falso negativo se traduce en no avisar de una alerta real, mucho peor.
 */
function mencionaValencia(texto: string): boolean {
  return /valencia/i.test(texto);
}

/** Ensambla el contrato final a partir de una tarjeta ya troceada. */
export function construirAviso(tarjeta: TarjetaCruda, fetchedAt: string): AvisoMeteo | null {
  const textoCompleto = `${tarjeta.titulo} ${tarjeta.resumen ?? ''}`;
  if (!mencionaAlertaOAviso(textoCompleto)) return null;
  if (!mencionaValencia(textoCompleto)) return null;
  const nivel = detectarNivel(textoCompleto);
  if (!nivel) return null;
  const publicadoEn = parsearFechaPublicacion(tarjeta.fechaTexto);
  if (!publicadoEn) return null;

  return {
    id: tarjeta.url,
    nivel,
    titulo: tarjeta.titulo,
    resumen: tarjeta.resumen,
    url: tarjeta.url,
    publicadoEn,
    fetchedAt,
    source: 'gva-emergencias-scraping',
  };
}

/** true si el aviso sigue dentro de la ventana de vigencia asumida (ver cabecera del módulo). */
export function esVigente(aviso: AvisoMeteo, ahoraMs: number): boolean {
  const publicadoMs = new Date(aviso.publicadoEn).getTime();
  const horas = (ahoraMs - publicadoMs) / (60 * 60 * 1000);
  return horas >= 0 && horas <= VENTANA_VIGENCIA_HORAS;
}

const ORDEN_NIVEL: Record<NivelAviso, number> = { rojo: 3, naranja: 2, amarillo: 1 };

export async function fetchAvisosVigentes(): Promise<SnapshotAvisos> {
  const res = await fetch(URL_FUENTE_AVISOS, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`comunica.gva.es respondió HTTP ${res.status}`);
  }
  const html = await res.text();
  const fetchedAt = new Date().toISOString();
  const ahoraMs = Date.now();

  const avisos = parsearTarjetas(html)
    .map((t) => construirAviso(t, fetchedAt))
    .filter((a): a is AvisoMeteo => a !== null)
    .filter((a) => esVigente(a, ahoraMs))
    .sort((a, b) => ORDEN_NIVEL[b.nivel] - ORDEN_NIVEL[a.nivel] || b.publicadoEn.localeCompare(a.publicadoEn));

  return { avisos, fetchedAt };
}
