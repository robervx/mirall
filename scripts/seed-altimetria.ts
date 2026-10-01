#!/usr/bin/env -S npx tsx
// Seed de la spec 044 (specs/044-panel-emergencia-meteorologica.md §2/§4) —
// altimetría de Valencia por distrito. Fuente: IGN, servicio WMS INSPIRE del
// Modelo Digital del Terreno (`servicios.idee.es/wms-inspire/mdt`, capa
// `EL.ElevationGridCoverage`), datos geográficos oficiales de libre
// reutilización — verificado en vivo el 2026-09-17 con `GetFeatureInfo` real.
//
// Dato estático (la altimetría no cambia) — se ejecuta manualmente, igual
// que el grafo viario de spec 020. Recorre una rejilla sobre el bbox de la
// ciudad (mismo bbox que usa spec 020), conserva solo los puntos que caen
// dentro de algún distrito real (spec 000) y descarta el NODATA que el WMS
// devuelve sobre mar/zonas sin cobertura.
// Uso: npm run seed:altimetria
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
  getLoadedDistricts,
} from '../src/services/district-geometry';
import {
  resumenAltimetriaPorDistrito,
  NODATA_IGN,
  PASO_LAT_REJILLA,
  PASO_LON_REJILLA,
  type MuestraElevacion,
} from '../src/services/altimetria';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'altimetria-valencia.json');
// Spec 052 v2 — antes se descartaban tras agregar a media por distrito; ahora
// se persisten también los puntos individuales (celda real de la capa de
// mapa, ver src/services/altimetria.ts `featureCollectionAltimetriaPuntos`).
const OUTPUT_PUNTOS_PATH = path.join(ROOT, 'data', 'altimetria-puntos.json');

// Mismo bbox que scripts/seed-red-viaria.ts (spec 020) — margen holgado
// alrededor del término municipal.
const LAT_MIN = 39.4;
const LAT_MAX = 39.51;
const LON_MIN = -0.43;
const LON_MAX = -0.3;
// Mismo paso que usa la capa de mapa para dibujar cada celda — ver
// src/services/altimetria.ts.
const PASO_LAT = PASO_LAT_REJILLA;
const PASO_LON = PASO_LON_REJILLA;
const CONCURRENCIA = 6;
const PAUSA_ENTRE_LOTES_MS = 200;

const WMS_URL = 'https://servicios.idee.es/wms-inspire/mdt';

function construirRejilla(): Array<{ lat: number; lon: number }> {
  const puntos: Array<{ lat: number; lon: number }> = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += PASO_LAT) {
    for (let lon = LON_MIN; lon <= LON_MAX; lon += PASO_LON) {
      puntos.push({ lat, lon });
    }
  }
  return puntos;
}

async function consultarElevacion(lat: number, lon: number): Promise<number | null> {
  const delta = 0.0001;
  const url =
    `${WMS_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=EL.ElevationGridCoverage` +
    `&QUERY_LAYERS=EL.ElevationGridCoverage&CRS=EPSG:4326&BBOX=${lat},${lon},${lat + delta},${lon + delta}` +
    '&WIDTH=2&HEIGHT=2&I=0&J=0&INFO_FORMAT=text/plain';
  const res = await fetch(url);
  if (!res.ok) return null;
  const texto = await res.text();
  const m = texto.match(/GRAY_INDEX\s*=\s*(-?[\d.]+)/);
  if (!m) return null;
  return Number(m[1]);
}

async function main(): Promise<void> {
  const distritos = distritosFromGeoJSON(distritosGeoJSON);
  setLoadedDistricts(distritos);
  const nombrePorCodigo = new Map(getLoadedDistricts().map((d) => [d.codigo, d.nombre]));

  const rejilla = construirRejilla();
  console.log(`Rejilla candidata: ${rejilla.length} puntos. Filtrando a los que caen dentro de un distrito real...`);

  const dentroDeDistrito = rejilla
    .map((p) => ({ ...p, distrito: getDistrictAtCoordinates(p.lat, p.lon) }))
    .filter((p): p is { lat: number; lon: number; distrito: NonNullable<ReturnType<typeof getDistrictAtCoordinates>> } => p.distrito !== null);

  console.log(`${dentroDeDistrito.length} puntos dentro del término municipal. Consultando el IGN (WMS)...`);

  const muestras: MuestraElevacion[] = [];
  let consultados = 0;
  for (let i = 0; i < dentroDeDistrito.length; i += CONCURRENCIA) {
    const lote = dentroDeDistrito.slice(i, i + CONCURRENCIA);
    const resultados = await Promise.all(
      lote.map(async (p) => {
        const elevacion = await consultarElevacion(p.lat, p.lon).catch(() => null);
        return elevacion === null ? null : { lat: p.lat, lon: p.lon, elevacionM: elevacion, distritoCodigo: p.distrito.codigo };
      }),
    );
    for (const r of resultados) if (r) muestras.push(r);
    consultados += lote.length;
    if (consultados % 60 === 0 || consultados >= dentroDeDistrito.length) {
      console.log(`  ${consultados}/${dentroDeDistrito.length} puntos consultados (${muestras.length} con dato válido)...`);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSA_ENTRE_LOTES_MS));
  }

  const conDatoReal = muestras.filter((m) => m.elevacionM !== NODATA_IGN);
  if (conDatoReal.length === 0) {
    throw new Error('0 muestras con dato de elevación válido — probable cambio en el servicio WMS del IGN, no se escribe el fichero.');
  }

  const resumen = resumenAltimetriaPorDistrito(muestras, nombrePorCodigo);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(resumen, null, 2)}\n`);
  await writeFile(OUTPUT_PUNTOS_PATH, `${JSON.stringify(conDatoReal, null, 2)}\n`);
  console.log(
    `${resumen.length} distritos, ${conDatoReal.length} muestras válidas (de ${muestras.length} consultadas) escritos en ${path.relative(ROOT, OUTPUT_PATH)} y ${path.relative(ROOT, OUTPUT_PUNTOS_PATH)}.`,
  );
}

main().catch((err: unknown) => {
  console.error('Fallo al seedear la altimetría:', err);
  process.exitCode = 1;
});
