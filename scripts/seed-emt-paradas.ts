#!/usr/bin/env -S npx tsx
// Seed de la spec 055 (specs/055-emt-buses-en-vivo.md §2/§4) — paradas de la
// EMT desde el geoportal (ArcGIS Server, `OPENDATA/Trafico/MapServer/226`),
// verificado en vivo el 2026-10-02: 1155 paradas no suprimidas en una sola
// petición (el `maxRecordCount` del servicio es 2000, no hace falta paginar).
//
// Dato de infraestructura física (las paradas no cambian de un día para
// otro) — se ejecuta manualmente, igual que seed-equipamientos-criticos.ts.
// Uso: npm run seed:emt-paradas
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizarParadasEmt, type ArcGisParadaFeature, type ParadaEmt } from '../src/services/emt-paradas';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'emt-paradas.json');

const URL =
  'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/226/query?where=suprimida=0&outFields=id_parada,denominacion,lineas,suprimida&outSR=4326&f=json';

const MINIMO_ESPERADO = 1000;

async function main(): Promise<void> {
  console.log('Descargando paradas de EMT del geoportal...');
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Geoportal (paradas EMT) respondió HTTP ${res.status}`);
  const body = (await res.json()) as { features?: ArcGisParadaFeature[]; error?: { message: string } };
  if (body.error) throw new Error(`Geoportal (paradas EMT) devolvió un error de ArcGIS: ${body.error.message}`);
  if (!body.features || body.features.length < MINIMO_ESPERADO) {
    throw new Error(
      `Geoportal (paradas EMT) devolvió ${body.features?.length ?? 0} features, menos de las ${MINIMO_ESPERADO} esperadas — ` +
        'posible cambio en el servicio, no se escribe el fichero.',
    );
  }

  const fetchedAt = new Date().toISOString();
  const paradas: ParadaEmt[] = normalizarParadasEmt(body.features, fetchedAt);

  await writeFile(OUTPUT_PATH, `${JSON.stringify(paradas, null, 2)}\n`);
  console.log(`${paradas.length} paradas de EMT escritas en ${path.relative(ROOT, OUTPUT_PATH)}.`);
}

main().catch((err: unknown) => {
  console.error('Fallo al seedear paradas de EMT:', err);
  process.exitCode = 1;
});
