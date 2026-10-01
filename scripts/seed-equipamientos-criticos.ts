#!/usr/bin/env -S npx tsx
// Seed de la spec 054 (specs/054-equipamientos-publicos-criticos.md §2/§4) —
// sanidad/policía/bomberos desde la capa "Equipamientos municipales" del
// geoportal (ArcGIS Server, `OPENDATA/SociedadBienestar/MapServer/1`),
// verificado en vivo el 2026-10-01: 2919 puntos en total en la capa, de los
// que 75 son `idclase='8'` (sanidad), 25 `idclase='12'` (policía) y 6 son
// parques de bomberos — estos últimos NO tienen una `idclase` propia en la
// fuente (repartidos entre "Oficinas municipales" e "invisible", ver spec
// §2), así que se filtran por nombre (`PARQUE...BOMBEROS...`), no por clase.
//
// `outSR=4326&f=geojson` reproyecta a WGS84 en el propio geoportal — no hace
// falta convertir desde el EPSG:25830 nativo de la capa.
//
// Dato de equipamiento municipal (no cambia de un día para otro) — se
// ejecuta manualmente, igual que seed-zonas-zas.ts/seed-altimetria.ts.
// Uso: npm run seed:equipamientos-criticos
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizarEquipamientosCriticos, type CategoriaEquipamientoCritico, type EquipamientoCritico } from '../src/services/equipamientos-criticos';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'data', 'equipamientos-criticos.json');

const BASE_URL = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/SociedadBienestar/MapServer/1/query';
const OUT_FIELDS = 'identifica,objectid,equipamien,telefono';

const CONSULTAS: ReadonlyArray<{ categoria: CategoriaEquipamientoCritico; where: string; minimoEsperado: number }> = [
  { categoria: 'sanidad', where: "idclase='8'", minimoEsperado: 50 },
  { categoria: 'policia', where: "idclase='12'", minimoEsperado: 15 },
  // Sin idclase propia en la fuente — ver cabecera. LIKE cubre tanto "PARQUE DE BOMBEROS X"
  // como "PARQUE CENTRAL DE BOMBEROS".
  { categoria: 'bomberos', where: "UPPER(equipamien) LIKE 'PARQUE%BOMBEROS%'", minimoEsperado: 4 },
];

async function fetchCategoria(categoria: CategoriaEquipamientoCritico, where: string, minimoEsperado: number, fetchedAt: string): Promise<EquipamientoCritico[]> {
  const url = `${BASE_URL}?where=${encodeURIComponent(where)}&outFields=${OUT_FIELDS}&outSR=4326&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoportal (equipamientos, ${categoria}) respondió HTTP ${res.status}`);
  const body = (await res.json()) as { features?: Parameters<typeof normalizarEquipamientosCriticos>[0]; error?: { message: string } };
  if (body.error) throw new Error(`Geoportal (equipamientos, ${categoria}) devolvió un error de ArcGIS: ${body.error.message}`);
  if (!body.features || body.features.length < minimoEsperado) {
    throw new Error(
      `Geoportal (equipamientos, ${categoria}) devolvió ${body.features?.length ?? 0} features, menos de las ${minimoEsperado} esperadas — ` +
        'posible cambio en el servicio, no se escribe el fichero.',
    );
  }
  return normalizarEquipamientosCriticos(body.features, categoria, fetchedAt);
}

async function main(): Promise<void> {
  console.log('Descargando equipamientos críticos del geoportal...');
  const fetchedAt = new Date().toISOString();
  const resultados = await Promise.all(CONSULTAS.map(({ categoria, where, minimoEsperado }) => fetchCategoria(categoria, where, minimoEsperado, fetchedAt)));
  const equipamientos = resultados.flat();

  await writeFile(OUTPUT_PATH, `${JSON.stringify(equipamientos, null, 2)}\n`);

  const porCategoria = CONSULTAS.map(({ categoria }) => `${categoria}: ${equipamientos.filter((e) => e.categoria === categoria).length}`).join(', ');
  console.log(`${equipamientos.length} equipamientos críticos (${porCategoria}) escritos en ${path.relative(ROOT, OUTPUT_PATH)}.`);
}

main().catch((err: unknown) => {
  console.error('Fallo al seedear equipamientos críticos:', err);
  process.exitCode = 1;
});
