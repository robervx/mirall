#!/usr/bin/env -S npx tsx
// Snapshot horario del escenario en modo sombra de la spec 010 v4 §10.3
// (specs/010-indice-pulso-distrito.md). Registra, cada hora, qué distritos
// habrían encendido `lluvia-inminente-sobre-trafico-denso` — sin pintar el
// mapa ni lanzar ninguna alerta (eso es justamente lo que significa "modo
// sombra"). Tras 3-4 semanas, este histórico se revisa a mano (tasa por
// semana, duración de episodio, distribución por distrito) para decidir si
// el escenario pasa a vivo.
//
// Simplificación deliberada frente al evaluador en vivo: no hay histéresis
// entre ejecuciones (cada hora se evalúa "en frío", sin `estadoPrevio` — la
// cadencia horaria no encaja con umbrales de minutos) ni gate de
// "tráfico-empeora" (necesitaría el estado de hace 3-15 min, que es memoria
// de proceso efímera del endpoint, no algo que este script pueda leer entre
// ejecuciones). Se registra la detección cruda del umbral absoluto de
// tráfico + lluvia — suficiente para el análisis estadístico que busca §10.3,
// documentado aquí para que quien revise los datos sepa qué está midiendo.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchEstadoTrafico } from '../src/services/trafico';
import { fetchPrediccionCortoPlazo } from '../src/services/prediccion-corto-plazo';
import { calcularPulsoEscenarios } from '../src/services/pulso-escenarios';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../src/services/district-geometry';
import distritosGeoJSON from '../data/distritos-valencia.json' with { type: 'json' };

const DATA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'pulso-sombra.json',
);

export interface SnapshotPulsoSombra {
  timestamp: string;
  distritosActivos: Array<{ codigo: string; nombre: string; anticipacionMin: number | null }>;
}

async function leerJsonOVacio<T>(rutaFichero: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(rutaFichero, 'utf-8')) as T[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** Mismo patrón de reintentos que snapshot-trafico-historico.ts — blips ocasionales del Geoportal. */
async function conReintentos<T>(fn: () => Promise<T>, intentos = 3, esperaMs = 5000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= intentos) throw err;
      console.warn(
        `Intento ${i}/${intentos} de leer la fuente falló (${(err as Error).message}). Reintento en ${esperaMs / 1000}s…`,
      );
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
      esperaMs *= 2;
    }
  }
}

async function main(): Promise<void> {
  const distritos = distritosFromGeoJSON(distritosGeoJSON);
  const distritosBasicos = distritos.map((d) => ({ codigo: d.codigo, nombre: d.nombre }));
  setLoadedDistricts(distritos);
  const resolverDistrito = (lat: number, lon: number) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null;

  const [tramos, prediccion] = await Promise.all([
    conReintentos(() => fetchEstadoTrafico(resolverDistrito)),
    conReintentos(() => fetchPrediccionCortoPlazo()),
  ]);

  const { distritos: resultado } = calcularPulsoEscenarios(
    {
      distritos: distritosBasicos,
      tramos,
      incidencias: [],
      zonasFallas: [],
      prediccion,
      aire: null,
      tramosPrevios: null,
      // Este script solo analiza el escenario de lluvia en sombra (§10.3) —
      // no necesita equipamientos críticos (spec 010 v5, escenario distinto).
      equipamientosCriticos: [],
    },
    {},
  );

  const distritosActivos = resultado
    .flatMap((d) =>
      d.escenariosActivos
        .filter((e) => e.id === 'lluvia-inminente-sobre-trafico-denso')
        .map((e) => ({ codigo: d.distritoCodigo, nombre: d.distritoNombre, anticipacionMin: e.anticipacionMin })),
    );

  const nuevoSnapshot: SnapshotPulsoSombra = { timestamp: new Date().toISOString(), distritosActivos };
  const existentes = await leerJsonOVacio<SnapshotPulsoSombra>(DATA_PATH);
  const actualizados = [...existentes, nuevoSnapshot];

  await writeFile(DATA_PATH, `${JSON.stringify(actualizados, null, 2)}\n`);

  console.log(
    `Snapshot sombra ${nuevoSnapshot.timestamp}: ${distritosActivos.length} distrito(s) con lluvia-inminente-sobre-trafico-denso. ` +
      `Histórico: ${actualizados.length} snapshots horarios.`,
  );
}

main().catch((err: unknown) => {
  console.error('Fallo al generar el snapshot del Pulso en sombra:', err);
  process.exitCode = 1;
});
