/**
 * Agenda general de eventos culturales — spec 027 (specs/027-agenda-eventos-scraping.md).
 * Funciones puras de normalización, sin red ni DOM: el scraping real (Playwright,
 * navegador headless) vive en `scripts/scrape-agenda-eventos.ts` — este módulo
 * solo transforma lo que el script ya extrajo del HTML.
 *
 * Fuente: `valencia.es/cas/agenda-de-la-ciudad`, HTML servido solo a clientes
 * con JavaScript (verificado en navegador, no en `fetch` simple). `robots.txt`
 * autoriza explícitamente `/-/content/` (las fichas de evento) — spec 027 §2.
 */
import { findDistrictMentions, type DistritoMencion } from './geolocalizacion-texto';

export interface EventoAgenda {
  id: string; // slug de la URL de ficha
  titulo: string;
  categoria: string;
  fechaInicio: string; // ISO 8601
  fechaFin: string; // ISO 8601
  resumen: string | null;
  url: string;
  distritosMencionados: DistritoMencion[];
  fetchedAt: string;
  source:
    | 'ajuntament-valencia-scraping'
    | 'valencia-cf-scraping'
    | 'levante-ud-scraping'
    | 'roig-arena-scraping'
    | 'fdm-valencia-carreras-scraping';
  /**
   * true si el evento genera afluencia/tráfico/cortes reales en vía pública
   * (fútbol en Mestalla/Ciutat de València, conciertos del Roig Arena,
   * carreras populares) — spec 027 v4 §9. Ausente/false para la agenda
   * general de valencia.es (v1-v3), que no se filtra por impacto.
   */
  impactoViaPublica?: boolean;
}

export interface SnapshotAgenda {
  eventos: EventoAgenda[];
  fetchedAt: string;
  /** true si el scraping devolvió 0 eventos cuando el snapshot anterior tenía >0 — probable cambio de estructura del sitio, revisar el scraper (spec 027 §4). */
  estructuraSospechosa: boolean;
}

const MESES_ES: Record<string, string> = {
  ene: '01',
  feb: '02',
  mar: '03',
  abr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dic: '12',
};

/** "DD/MM/YYYY - DD/MM/YYYY" (formato del listado) → dos fechas ISO 8601 (00:00 UTC). */
export function parsearRangoFechaListado(texto: string): { inicio: string; fin: string } | null {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, d1, mo1, y1, d2, mo2, y2] = m;
  const inicio = new Date(`${y1}-${mo1}-${d1}T00:00:00.000Z`);
  const fin = new Date(`${y2}-${mo2}-${d2}T00:00:00.000Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

/** "FECHA: DD mmm YYYY - DD mmm YYYY" (formato de la ficha, mes abreviado en español) → dos fechas ISO 8601. */
export function parsearRangoFechaFicha(texto: string): { inicio: string; fin: string } | null {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  const m = limpio.match(/(\d{1,2})\s+([a-zé]{3})\s+(\d{4})\s*-\s*(\d{1,2})\s+([a-zé]{3})\s+(\d{4})/i);
  if (!m) return null;
  const [, d1, mo1raw, y1, d2, mo2raw, y2] = m;
  const mo1 = MESES_ES[mo1raw!.toLowerCase()];
  const mo2 = MESES_ES[mo2raw!.toLowerCase()];
  if (!mo1 || !mo2) return null;
  const inicio = new Date(`${y1}-${mo1}-${d1!.padStart(2, '0')}T00:00:00.000Z`);
  const fin = new Date(`${y2}-${mo2}-${d2!.padStart(2, '0')}T00:00:00.000Z`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null;
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

const LONGITUD_RESUMEN = 300;

/** Une los párrafos de la ficha (ya sin el de fecha) en un resumen recortado — nunca el texto íntegro, ni siquiera de contenido institucional propio (spec 027 §3). */
export function construirResumen(parrafos: string[]): string | null {
  const texto = parrafos
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(' ');
  if (texto.length === 0) return null;
  if (texto.length <= LONGITUD_RESUMEN) return texto;
  return `${texto.slice(0, LONGITUD_RESUMEN).trimEnd()}…`;
}

/** spec 027 §4 — 0 eventos extraídos cuando el snapshot anterior tenía >0 es señal de que ha cambiado la estructura del sitio, no de que no haya agenda. */
export function detectarEstructuraSospechosa(eventosNuevos: EventoAgenda[], eventosPrevios: EventoAgenda[]): boolean {
  return eventosNuevos.length === 0 && eventosPrevios.length > 0;
}

export interface DatoCrudoListado {
  id: string;
  titulo: string;
  categoria: string;
  rangoFechaTexto: string;
  url: string;
}

export interface DatoCrudoFicha {
  parrafos: string[];
}

/** Ensambla el contrato final (§3) a partir de lo que el scraper ya extrajo del listado + la ficha. */
export function construirEventoAgenda(
  crudo: DatoCrudoListado,
  ficha: DatoCrudoFicha | null,
  fetchedAt: string,
): EventoAgenda | null {
  const rango = parsearRangoFechaListado(crudo.rangoFechaTexto);
  if (!rango) return null;
  const resumen = ficha ? construirResumen(ficha.parrafos) : null;
  const textoParaDistrito = `${crudo.titulo} ${resumen ?? ''}`;
  return {
    id: crudo.id,
    titulo: crudo.titulo,
    categoria: crudo.categoria,
    fechaInicio: rango.inicio,
    fechaFin: rango.fin,
    resumen,
    url: crudo.url,
    distritosMencionados: findDistrictMentions(textoParaDistrito),
    fetchedAt,
    source: 'ajuntament-valencia-scraping',
  };
}

/**
 * Bug real reportado por el usuario (2026-10-01): el panel de agenda en
 * /inteligencia mostraba TODOS los eventos scrapeados, incluidos los ya
 * pasados — no había ningún filtro por fecha. `fechaFin` es siempre
 * medianoche UTC del último día del evento (`parsearRangoFecha*`); el
 * evento sigue vigente hasta que termina ESE día — se descarta en cuanto
 * pasan las 00:00 del día siguiente, no antes (un evento de un solo día
 * sigue siendo relevante todo ese día, aunque ya haya "pasado" la hora).
 */
export function eventoVigente(evento: Pick<EventoAgenda, 'fechaFin'>, ahoraMs: number): boolean {
  const finDelDiaMs = new Date(evento.fechaFin).getTime() + 24 * 60 * 60 * 1000;
  return ahoraMs < finDelDiaMs;
}

export function eventosVigentes<T extends Pick<EventoAgenda, 'fechaFin'>>(eventos: T[], ahoraMs: number): T[] {
  return eventos.filter((e) => eventoVigente(e, ahoraMs));
}
