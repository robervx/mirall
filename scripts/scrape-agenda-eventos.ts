#!/usr/bin/env -S npx tsx
// Scraping de la agenda de eventos — spec 027 (specs/027-agenda-eventos-scraping.md
// §2, §2.1, §4). Pensado para ejecutarse por GitHub Actions cada 6h (ver
// .github/workflows/agenda-eventos-cron.yml) — necesita un navegador con
// JavaScript de verdad (la web bloquea `fetch` simple con su WAF, §2.1), así
// que corre con Playwright, no como función edge de Vercel (mismo patrón que
// spec 017 usa GitHub Actions en vez de Vercel para su cron).
//
// robots.txt de valencia.es (verificado en navegador el 2026-09-16):
//   Disallow: /-/          Allow: /-/content/
// El listado (`/cas/agenda-de-la-ciudad`) no empieza por `/-/`, sin restricción.
// Las fichas (`/-/content/<slug>`) están explícitamente permitidas.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  construirEventoAgenda,
  detectarEstructuraSospechosa,
  type EventoAgenda,
  type SnapshotAgenda,
  type DatoCrudoListado,
} from '../src/services/agenda-eventos';
import {
  construirEventosValenciaCF,
  construirEventosLevante,
  extraerEventosCrudosRoigArena,
  construirEventosRoigArena,
  construirEventosCarrerasFDM,
  type DatoCrudoPartidoVCF,
  type DatoCrudoPartidoLevante,
  type DatoCrudoCarreraFDM,
} from '../src/services/agenda-impacto-vial';
import { setLoadedDistricts, type Distrito } from '../src/services/district-geometry';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'agenda-eventos.json');
const BASE_URL = 'https://www.valencia.es';
const LISTADO_URL = `${BASE_URL}/cas/agenda-de-la-ciudad`;
const USER_AGENT = 'vlc-monitor-agenda-bot/1.0 (+https://github.com/robervx/mirall)';

interface DistritoFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Omit<Distrito, 'geometry'>;
}

function cargarDistritos(): void {
  const distritos: Distrito[] = (distritosGeoJSON.features as unknown as DistritoFeature[]).map((feature) => ({
    ...feature.properties,
    geometry: feature.geometry,
  }));
  setLoadedDistricts(distritos);
}

async function leerSnapshotPrevio(): Promise<SnapshotAgenda | null> {
  try {
    return JSON.parse(await readFile(SNAPSHOT_PATH, 'utf-8')) as SnapshotAgenda;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Rechaza cookies no esenciales si aparece el banner — el contenido carga igual sin aceptarlas (verificado en navegador). */
async function rechazarCookiesNoEsenciales(page: Page): Promise<void> {
  const configurar = page.getByRole('button', { name: 'Configurar' });
  if (await configurar.isVisible({ timeout: 5000 }).catch(() => false)) {
    await configurar.click();
    const guardar = page.getByRole('button', { name: 'Guardar mis preferencias' });
    await guardar.click({ timeout: 5000 }).catch(() => undefined);
  }
}

/** Extrae los ítems visibles del listado en la página actual — selectores verificados en navegador el 2026-09-16 (spec 027 §2.1). */
async function extraerListadoPagina(page: Page, baseUrl: string): Promise<DatoCrudoListado[]> {
  return page.$$eval(
    'a.a-actualidad',
    (elementos, base) =>
      elementos
        .map((el) => {
          const href = el.getAttribute('href');
          if (!href) return null;
          const titulo = el.querySelector('p.label-title-agenda')?.textContent?.trim() ?? '';
          const rangoFechaTexto = el.querySelector('p.label-fecha-actualidad')?.textContent?.trim() ?? '';
          const categoria = el.querySelector('p.label-categoria-actualidad span')?.textContent?.trim() ?? '';
          const id = href.split('/').filter(Boolean).pop() ?? '';
          return { id, titulo, categoria, rangoFechaTexto, url: `${base}${href}` };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.id.length > 0 && x.titulo.length > 0),
    baseUrl,
  );
}

/**
 * Paginación: `paginationjs` (verificado en navegador el 2026-09-16, sustituye
 * al portlet Liferay/insuit documentado en la primera verificación de spec 027
 * §2.1 — el sitio cambió de librería de paginación entre medias, misma
 * mecánica de fondo: números de página sin `href` real, cableados por JS). Se
 * hace clic en cada número y se espera a que cambie el primer `href` del
 * listado antes de extraer.
 */
async function numerosDePagina(page: Page): Promise<number> {
  const textos = await page.$$eval('li.paginationjs-page', (els) => els.map((el) => el.textContent?.trim() ?? ''));
  const numeros = textos.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return numeros.length > 0 ? Math.max(...numeros) : 1;
}

async function irAPagina(page: Page, numero: number): Promise<void> {
  const primerHrefAntes = await page.$eval('a.a-actualidad', (el) => el.getAttribute('href')).catch(() => null);
  const enlacePagina = page.locator('li.paginationjs-page', { hasText: new RegExp(`^${numero}$`) }).locator('a');
  await enlacePagina.click();
  await page.waitForFunction(
    (anterior) => document.querySelector('a.a-actualidad')?.getAttribute('href') !== anterior,
    primerHrefAntes,
    { timeout: 10_000 },
  );
}

/** Ficha de evento (`/-/content/<slug>`) — selectores verificados en navegador el 2026-09-16 (spec 027 §2.1). */
async function extraerFicha(page: Page, url: string): Promise<string[] | null> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const contenedor = await page.$('div.container-agenda-ciudad');
  if (!contenedor) return null;
  return page.$$eval('p.bloque_texto:not(.fecha)', (els) => els.map((el) => el.textContent?.trim() ?? ''));
}

// ---------------------------------------------------------------------------
// Eventos con impacto en vía pública — spec 027 v4 §9. Cuatro fuentes nuevas,
// verificadas en vivo el 2026-09-17: ninguna necesita Playwright, HTML/JSON
// plano vía `fetch()` (a diferencia de valencia.es, que exige navegador —
// §2.1). Cada fuente se resuelve de forma aislada: si una falla o cambia de
// estructura, no bloquea a las demás ni al resto del job.
// ---------------------------------------------------------------------------

async function fetchTexto(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

/** `card-game__date__date` / `__location` / `__teams__name--left/right` / `__teams__time` — verificado 2026-09-17. */
function extraerPartidosVCF(html: string): DatoCrudoPartidoVCF[] {
  const re =
    /card-game__date__date">([^<]*)<\/div>\s*<div class="card-game__date__location">([^<]*)<\/div>[\s\S]*?card-game__teams__name card-game__teams__name--left">([^<]*)<\/div>[\s\S]*?card-game__teams__time">([\s\S]*?)<\/div>[\s\S]*?card-game__teams__name card-game__teams__name--right">([^<]*)<\/div>/g;
  const vistos = new Set<string>();
  const resultado: DatoCrudoPartidoVCF[] = [];
  for (const m of html.matchAll(re)) {
    const fechaTexto = m[1]!.trim();
    if (vistos.has(fechaTexto)) continue; // el bloque "featured" duplica el próximo partido
    vistos.add(fechaTexto);
    resultado.push({
      fechaTexto,
      ubicacion: m[2]!.trim(),
      equipoIzquierda: m[3]!.trim(),
      hora: m[4]!.replace(/<[^>]+>/g, '').trim(),
      equipoDerecha: m[5]!.trim(),
    });
  }
  return resultado;
}

/** `__NEXT_DATA__` embebido — recorre el árbol buscando objetos con forma de partido (homeTeam/awayTeam). */
function extraerPartidosLevante(html: string): DatoCrudoPartidoLevante[] {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data: unknown;
  try {
    data = JSON.parse(m[1]!);
  } catch {
    return [];
  }
  const vistos = new Set<string>();
  const resultado: DatoCrudoPartidoLevante[] = [];
  function recorrer(obj: unknown): void {
    if (Array.isArray(obj)) {
      for (const v of obj) recorrer(v);
      return;
    }
    if (typeof obj !== 'object' || obj === null) return;
    const o = obj as Record<string, unknown>;
    const home = o.homeTeam as Record<string, unknown> | undefined;
    const away = o.awayTeam as Record<string, unknown> | undefined;
    if (home && away && typeof o.id === 'string' && typeof home.shortName === 'string' && typeof away.shortName === 'string') {
      if (!vistos.has(o.id)) {
        vistos.add(o.id);
        const venue = o.venue as Record<string, unknown> | undefined;
        const gameweek = o.gameweek as Record<string, unknown> | undefined;
        resultado.push({
          id: o.id,
          homeTeamName: home.shortName,
          awayTeamName: away.shortName,
          venueName: typeof venue?.name === 'string' ? venue.name : null,
          gameweekName: typeof gameweek?.name === 'string' ? gameweek.name : null,
          time: typeof o.time === 'string' ? o.time : null,
        });
      }
    }
    for (const v of Object.values(o)) recorrer(v);
  }
  recorrer(data);
  return resultado;
}

/** `__NUXT_DATA__` embebido (payload "devalue") — ver src/services/agenda-impacto-vial.ts. */
function extraerCrudosRoigArena(html: string): ReturnType<typeof extraerEventosCrudosRoigArena> {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(m[1]!);
  } catch {
    return [];
  }
  if (!Array.isArray(payload)) return [];
  return extraerEventosCrudosRoigArena(payload);
}

/** `.event-title a` + dos `.event-time` (fecha, hora) — plugin Events Manager de WordPress, verificado 2026-09-17. */
function extraerCarrerasFDMPagina(html: string): DatoCrudoCarreraFDM[] {
  const re =
    /class="event-title"><a href="([^"]+)"[^>]*>([^<]*)<\/a><\/div>\s*<span class="event-time">([^<]*)<\/span>\s*<span class="event-time">([^<]*)<\/span>/g;
  const resultado: DatoCrudoCarreraFDM[] = [];
  for (const m of html.matchAll(re)) {
    const titulo = m[2]!.trim();
    if (!titulo) continue;
    resultado.push({
      titulo,
      url: m[1]!.trim(),
      fechaTexto: m[3]!.replace(/\|/g, '').trim(),
      horaTexto: m[4]!.replace(/\|/g, '').trim() || null,
    });
  }
  return resultado;
}

const FDM_PAGINAS_A_LEER = 6; // ~60 carreras — suficiente margen para las próximas semanas (listado no cronológico, spec 027 v4 §9)

async function extraerCarrerasFDM(): Promise<DatoCrudoCarreraFDM[]> {
  const base = 'https://www.fdmvalencia.es/es/tipos-eventos/carrera-populares';
  const resultado: DatoCrudoCarreraFDM[] = [];
  for (let pagina = 1; pagina <= FDM_PAGINAS_A_LEER; pagina++) {
    const url = pagina === 1 ? `${base}/` : `${base}/page/${pagina}/`;
    const html = await fetchTexto(url);
    resultado.push(...extraerCarrerasFDMPagina(html));
  }
  return resultado;
}

interface ResultadoFuenteImpacto {
  source: EventoAgenda['source'];
  eventos: EventoAgenda[];
}

/** Cada fuente se resuelve de forma aislada — un fallo no bloquea a las demás (spec 027 v4 §9). */
async function recolectarEventosImpacto(fetchedAt: string): Promise<ResultadoFuenteImpacto[]> {
  const fuentes: Array<{ source: EventoAgenda['source']; tarea: () => Promise<EventoAgenda[]> }> = [
    {
      source: 'valencia-cf-scraping',
      tarea: async () => construirEventosValenciaCF(extraerPartidosVCF(await fetchTexto('https://www.valenciacf.com/resultados?range=next')), fetchedAt),
    },
    {
      source: 'levante-ud-scraping',
      tarea: async () => construirEventosLevante(extraerPartidosLevante(await fetchTexto('https://www.levanteud.com/partidos')), fetchedAt),
    },
    {
      source: 'roig-arena-scraping',
      tarea: async () => construirEventosRoigArena(extraerCrudosRoigArena(await fetchTexto('https://www.roigarena.com/es/eventos/')), fetchedAt),
    },
    {
      source: 'fdm-valencia-carreras-scraping',
      tarea: async () => construirEventosCarrerasFDM(await extraerCarrerasFDM(), fetchedAt),
    },
  ];

  const resultados: ResultadoFuenteImpacto[] = [];
  for (const { source, tarea } of fuentes) {
    try {
      resultados.push({ source, eventos: await tarea() });
    } catch (err) {
      console.warn(`Fuente de impacto en vía pública "${source}" falló, se conservará el snapshot anterior de esa fuente: ${(err as Error).message}`);
      resultados.push({ source, eventos: [] });
    }
  }
  return resultados;
}

async function main(): Promise<void> {
  cargarDistritos();
  const snapshotPrevio = await leerSnapshotPrevio();
  const eventosPrevios = snapshotPrevio?.eventos ?? [];
  const eventosPreviosValenciaEs = eventosPrevios.filter((e) => e.source === 'ajuntament-valencia-scraping');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(LISTADO_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await rechazarCookiesNoEsenciales(page);
    await page.waitForSelector('a.a-actualidad', { timeout: 15_000 });

    const totalPaginas = await numerosDePagina(page);
    const crudos: DatoCrudoListado[] = [];
    for (let pagina = 1; pagina <= totalPaginas; pagina++) {
      if (pagina > 1) await irAPagina(page, pagina);
      crudos.push(...(await extraerListadoPagina(page, BASE_URL)));
    }
    console.log(`Listado: ${totalPaginas} página(s), ${crudos.length} eventos brutos.`);

    const fetchedAt = new Date().toISOString();
    const eventos: EventoAgenda[] = [];
    for (const crudo of crudos) {
      const parrafos = await extraerFicha(page, crudo.url).catch((err: unknown) => {
        console.warn(`Ficha "${crudo.id}" no se pudo leer: ${(err as Error).message}`);
        return null;
      });
      const evento = construirEventoAgenda(crudo, parrafos ? { parrafos } : null, fetchedAt);
      if (evento) eventos.push(evento);
    }

    const estructuraSospechosa = detectarEstructuraSospechosa(eventos, eventosPreviosValenciaEs);

    if (estructuraSospechosa) {
      // No se sobrescribe el snapshot bueno con uno vacío (spec 027 §4) — se
      // conserva el anterior por completo (incl. impacto en vía pública) y
      // solo se marca como sospechoso, para que la UI lo refleje sin fingir
      // que sigue actualizado.
      const conservado: SnapshotAgenda = { ...snapshotPrevio!, estructuraSospechosa: true, fetchedAt };
      await writeFile(SNAPSHOT_PATH, `${JSON.stringify(conservado, null, 2)}\n`);
      console.error(
        '⚠ estructuraSospechosa: 0 eventos extraídos pero el snapshot anterior tenía eventos — probable cambio de estructura del sitio. Se conserva el snapshot anterior, revisar el scraper.',
      );
      process.exitCode = 1;
      return;
    }

    // Eventos con impacto en vía pública (spec 027 v4 §9) — fuentes nuevas,
    // independientes de valencia.es. Cada una se resuelve por separado: si
    // una devuelve 0 pero antes tenía eventos, se conserva su último dato
    // bueno (stale-on-error por fuente, no bloquea al resto del job).
    const resultadosImpacto = await recolectarEventosImpacto(fetchedAt);
    const eventosImpacto: EventoAgenda[] = [];
    for (const { source, eventos: nuevos } of resultadosImpacto) {
      const previosDeFuente = eventosPrevios.filter((e) => e.source === source);
      if (nuevos.length === 0 && previosDeFuente.length > 0) {
        console.warn(`Fuente "${source}": 0 eventos nuevos, se conserva el último snapshot bueno (${previosDeFuente.length} eventos).`);
        eventosImpacto.push(...previosDeFuente);
      } else {
        eventosImpacto.push(...nuevos);
      }
      console.log(`Fuente "${source}": ${nuevos.length} eventos nuevos.`);
    }

    const eventosFinal = [...eventos, ...eventosImpacto];
    const snapshotNuevo: SnapshotAgenda = { eventos: eventosFinal, fetchedAt, estructuraSospechosa: false };

    await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshotNuevo, null, 2)}\n`);
    console.log(`Snapshot ${fetchedAt}: ${eventosFinal.length} eventos escritos en ${path.relative(ROOT, SNAPSHOT_PATH)} (${eventos.length} agenda general + ${eventosImpacto.length} impacto en vía pública).`);
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error('Fallo al escrapear la agenda de eventos:', err);
  process.exitCode = 1;
});
