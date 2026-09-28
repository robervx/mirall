/**
 * Carga y caché en memoria del grafo viario en el cliente — compartida entre
 * spec 021 (modo cordón) y spec 022 (simulador de cortes) para no duplicar
 * el `fetch` ni el índice `rbush`. Antes vivía duplicada dentro de
 * `ui/modo-cordon.ts`.
 */
import { construirIndiceEspacial, type IndiceRedViaria } from './red-viaria-indice';
import type { RedViaria, Tramo, Nodo } from './red-viaria';
import {
  calcularSccPrincipal,
  calcularBasePropagacion,
  type BasePropagacion,
} from './propagacion-corte';

export interface GrafoViarioCliente {
  nodos: Nodo[];
  tramos: Tramo[];
  tramosPorId: Map<string, Tramo>;
  indice: IndiceRedViaria;
}

export interface BasePropagacionCliente {
  sccPrincipal: Set<string>;
  base: BasePropagacion;
}

let cache: GrafoViarioCliente | null = null;
let promesaEnCurso: Promise<GrafoViarioCliente> | null = null;

export async function cargarGrafoViario(): Promise<GrafoViarioCliente> {
  if (cache) return cache;
  if (promesaEnCurso) return promesaEnCurso;

  promesaEnCurso = (async () => {
    // Asset estático versionado (spec 020): ~9 MB, servido por el CDN (gzip
    // ~1.1 MB), no por una función — supera el límite de tamaño/respuesta de
    // las funciones de Vercel. Sigue siendo mismo-origen y propio.
    const res = await fetch('/data/red-viaria-rodada.json');
    if (!res.ok) throw new Error(`GET /data/red-viaria-rodada.json -> HTTP ${res.status}`);
    const red = (await res.json()) as RedViaria;
    const resultado: GrafoViarioCliente = {
      nodos: red.nodos,
      tramos: red.tramos,
      tramosPorId: new Map(red.tramos.map((t) => [t.idTramo, t])),
      indice: construirIndiceEspacial(red.tramos),
    };
    cache = resultado;
    promesaEnCurso = null;
    return resultado;
  })().catch((err: unknown) => {
    promesaEnCurso = null;
    throw err;
  });

  return promesaEnCurso;
}

// Precálculo de propagación dirigida (spec 031): SCC principal + línea base de
// alcanzabilidad. Caro-ish (una SCC + 2 BFS sobre ~13k tramos) pero
// independiente de los cortes — se calcula una sola vez, de forma perezosa (la
// primera vez que un modo lo pide) y se comparte entre spec 021 y spec 022.
let basePropagacionCache: BasePropagacionCliente | null = null;

export function obtenerBasePropagacion(grafo: GrafoViarioCliente): BasePropagacionCliente {
  if (!basePropagacionCache) {
    const sccPrincipal = calcularSccPrincipal(grafo.tramos);
    basePropagacionCache = { sccPrincipal, base: calcularBasePropagacion(grafo.tramos, sccPrincipal) };
  }
  return basePropagacionCache;
}
