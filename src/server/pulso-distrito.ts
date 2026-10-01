// GET /api/pulso/v1/distrito — endpoint definido en specs/010-indice-pulso-distrito.md §6.
// v4: ya no calcula un índice ponderado — evalúa el catálogo de escenarios
// de conjunción (`pulso-escenarios.ts`), el mismo evaluador que usa
// api/insights/v1/actual.ts (spec 010 §6, "un único evaluador consolidado").
// Sin fuente externa propia: combina las cachés ya existentes de 001 (meteo,
// solo para el sello de frescura), 002 (aire), 004 (tráfico), 008 (Fallas),
// 016 (predicción a corto plazo) y 026 (incidencias de vía pública).
import { getOrFetch, cachePeek, cachePoke } from './_shared/cache';
import { calcularPulsoEscenarios, type EstadoHisteresisPulso } from '../services/pulso-escenarios';
import { fetchEstadoMeteo } from '../services/estado-meteo';
import { fetchCalidadAire } from '../services/calidad-aire';
import { fetchEstadoTrafico, type TramoTrafico } from '../services/trafico';
import { fetchIncidenciasViaPublica } from '../services/via-publica';
import { fetchDatosFallas } from '../services/fallas';
import { fetchPrediccionCortoPlazo } from '../services/prediccion-corto-plazo';
import {
  distritosFromGeoJSON,
  setLoadedDistricts,
  getDistrictAtCoordinates,
} from '../services/district-geometry';
import distritosGeoJSON from '../../data/distritos-valencia.json' with { type: 'json' };
import equipamientosCriticos from '../../data/equipamientos-criticos.json' with { type: 'json' };
import type { EquipamientoCritico } from '../services/equipamientos-criticos';

export const config = { runtime: 'edge' };

setLoadedDistricts(distritosFromGeoJSON(distritosGeoJSON));
const distritosBasicos = distritosFromGeoJSON(distritosGeoJSON).map((d) => ({
  codigo: d.codigo,
  nombre: d.nombre,
}));

const CLAVE_HISTERESIS_PULSO = 'pulso:escenarios-previos:v1';
const CLAVE_TRAFICO_PREVIO = 'insights:trafico:estado-previo'; // misma clave que insights-actual.ts — un único previo de tráfico compartido

export default async function handler(): Promise<Response> {
  try {
    const resolverDistrito = (lat: number, lon: number) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null;
    const [meteoResult, aireResult, traficoResult] = await Promise.all([
      getOrFetch('meteo:valencia-actual:v1', 15 * 60 * 1000, fetchEstadoMeteo),
      getOrFetch('aire:valencia-actual:v1', 60 * 60 * 1000, fetchCalidadAire),
      getOrFetch('trafico:valencia-estado:v1', 3 * 60 * 1000, () => fetchEstadoTrafico(resolverDistrito)),
    ]);

    // Incidencias/Fallas/nowcast degradan de forma independiente: si fallan,
    // sus escenarios no se evalúan, pero el resto del Pulso sí (spec 010 §6).
    const [incidenciasResult, fallasResult, prediccionResult] = await Promise.allSettled([
      getOrFetch('via-publica:incidencias-valencia:v1', 60 * 60 * 1000, () =>
        fetchIncidenciasViaPublica(resolverDistrito),
      ),
      getOrFetch('fallas:valencia-actual:v1', 6 * 60 * 60 * 1000, () => fetchDatosFallas(resolverDistrito)),
      getOrFetch('meteo:valencia-prediccion-4h:v1', 15 * 60 * 1000, fetchPrediccionCortoPlazo),
    ]);

    const incidencias =
      incidenciasResult.status === 'fulfilled'
        ? incidenciasResult.value.value.filter((i) => new Date(i.vigenciaHasta).getTime() >= Date.now())
        : [];
    const zonasFallas = fallasResult.status === 'fulfilled' ? fallasResult.value.value.zonasMovilidadReducida : [];
    const prediccion = prediccionResult.status === 'fulfilled' ? prediccionResult.value.value : null;

    const tramosTraficoPrevios = cachePeek<TramoTrafico[]>(CLAVE_TRAFICO_PREVIO) ?? null;
    const estadoHisteresisPrevio = cachePeek<EstadoHisteresisPulso>(CLAVE_HISTERESIS_PULSO) ?? {};

    const { distritos, estadoHisteresis } = calcularPulsoEscenarios(
      {
        distritos: distritosBasicos,
        tramos: traficoResult.value,
        incidencias,
        zonasFallas,
        prediccion,
        aire: aireResult.value,
        tramosPrevios: tramosTraficoPrevios,
        // v5 (spec 010) — asset estático (spec 054), sin fetch/caché propia.
        equipamientosCriticos: equipamientosCriticos as EquipamientoCritico[],
      },
      estadoHisteresisPrevio,
    );

    cachePoke(CLAVE_HISTERESIS_PULSO, estadoHisteresis, 30 * 60 * 1000);
    cachePoke(CLAVE_TRAFICO_PREVIO, traficoResult.value, 15 * 60 * 1000);

    const fresh = meteoResult.fresh && aireResult.fresh && traficoResult.fresh;

    return new Response(JSON.stringify({ distritos, fresh }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, stale-while-revalidate=180',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
