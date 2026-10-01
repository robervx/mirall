#!/usr/bin/env -S npx tsx
// Seed de la spec 043 (specs/043-camaras-urbanas-externas.md) — cámaras urbanas
// externas (red viaria que rodea Valencia). Fuente: DGT, dataset "Cámaras DGT
// DATEX2 v3.7" (nap.dgt.es/dataset/camaras-dgt-datex2-v3-7), licencia Creative
// Commons Attribution, gratuito — verificado en vivo el 2026-09-17. Se consume
// el JSON simplificado que la propia dgt.es sirve para su página pública de
// cámaras (mismo dato oficial, sin necesidad de parsear el XML DATEX2 formal).
//
// Se ejecuta manualmente (la lista de cámaras de la DGT cambia con muy poca
// frecuencia, a diferencia de las imágenes en sí, que se piden en directo
// desde el navegador de quien mira — ver src/services/camaras-dgt.ts).
// Uso: npm run seed:camaras-dgt
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizarCamarasDgt, type CamaraCrudaDgt } from '../src/services/camaras-dgt';

const URL = 'https://www.dgt.es/.content/.assets/json/camaras.json';
const USER_AGENT = 'vlc-monitor-camaras-bot/1.0 (+https://github.com/robervx/mirall)';
const OUTPUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'camaras-dgt-valencia.json');

async function main(): Promise<void> {
  const res = await fetch(URL, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${URL} -> HTTP ${res.status}`);
  const datos = (await res.json()) as { camaras: CamaraCrudaDgt[] };
  const camaras = normalizarCamarasDgt(datos.camaras);
  if (camaras.length === 0) {
    throw new Error('0 cámaras tras normalizar — probable cambio de estructura en el feed de la DGT, no se escribe el fichero.');
  }
  await writeFile(OUTPUT_PATH, `${JSON.stringify(camaras, null, 2)}\n`);
  console.log(`${camaras.length} cámaras (de ${datos.camaras.length} en el feed nacional) escritas en ${path.relative(process.cwd(), OUTPUT_PATH)}.`);
}

main().catch((err: unknown) => {
  console.error('Fallo al seedear las cámaras de la DGT:', err);
  process.exitCode = 1;
});
