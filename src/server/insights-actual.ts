// GET /api/insights/v1/actual — endpoint definido en
// specs/013-motor-insights-alertas.md §4 y su v2 de correlación
// (specs/024-motor-insights-v2-correlacion.md §4). Sin fuente externa propia:
// combina las cachés ya existentes de 001 (meteo), 002 (aire), 004 (tráfico),
// 008 (Fallas), 010 (Pulso de Distrito, evaluador de escenarios de spec 010
// v4), 016 (predicción a corto plazo) y 026 (incidencias de vía pública).
// Mismo patrón que api/pulso/v1/distrito.ts — mismo evaluador consolidado
// (`pulso-escenarios.ts`), no dos paralelos (spec 010 §6).
import { getOrFetch, cachePeek, cachePoke } from './_shared/cache';
import type { TramoTrafico } from '../services/trafico';
import { calcularInsights } from '../services/insights';
import { fetchEstadoMeteo } from '../services/estado-meteo';
import { fetchCalidadAire } from '../services/calidad-aire';
import { fetchEstadoTrafico } from '../services/trafico';
import { fetchDatosFallas } from '../services/fallas';
import { fetchPrediccionCortoPlazo } from '../services/prediccion-corto-plazo';
import { fetchIncidenciasViaPublica } from '../services/via-publica';
import { fetchAvisosVigentes } from '../services/avisos-meteo';
import { calcularPulsoEscenarios, type EstadoHisteresisPulso } from '../services/pulso-escenarios';
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
const resolverDistrito = (lat: number, lon: number): string | null => getDistrictAtCoordinates(lat, lon)?.codigo ?? null;

const CLAVE_TRAFICO_PREVIO = 'insights:trafico:estado-previo';
const CLAVE_HISTERESIS_PULSO = 'pulso:escenarios-previos:v1';

export default async function handler(): Promise<Response> {
  try {
    const [meteoResult, aireResult] = await Promise.all([
      getOrFetch('meteo:valencia-actual:v1', 15 * 60 * 1000, fetchEstadoMeteo),
      getOrFetch('aire:valencia-actual:v1', 60 * 60 * 1000, fetchCalidadAire),
    ]);

    // Fuentes "opcionales": si fallan, se degrada sirviendo los insights que
    // sí se pudieron calcular en vez de romper todo el panel (spec 013 §4,
    // extendido por spec 024 §4 a tráfico/Fallas, y por spec 010 v4 a
    // incidencias de vía pública).
    const [prediccionResult, traficoResult, fallasResult, incidenciasResult, avisosResult] = await Promise.allSettled([
      getOrFetch('meteo:valencia-prediccion-4h:v1', 15 * 60 * 1000, fetchPrediccionCortoPlazo),
      getOrFetch('trafico:valencia-estado:v1', 3 * 60 * 1000, () => fetchEstadoTrafico(resolverDistrito)),
      getOrFetch('fallas:valencia-actual:v1', 6 * 60 * 60 * 1000, () => fetchDatosFallas(resolverDistrito)),
      getOrFetch('via-publica:incidencias-valencia:v1', 60 * 60 * 1000, () => fetchIncidenciasViaPublica(resolverDistrito)),
      getOrFetch('meteo:valencia-avisos:v1', 15 * 60 * 1000, fetchAvisosVigentes),
    ]);

    const prediccion = prediccionResult.status === 'fulfilled' ? prediccionResult.value.value : null;
    const tramosTrafico = traficoResult.status === 'fulfilled' ? traficoResult.value.value : null;
    const datosFallas = fallasResult.status === 'fulfilled' ? fallasResult.value.value : null;
    const incidencias =
      incidenciasResult.status === 'fulfilled'
        ? incidenciasResult.value.value.filter((i) => new Date(i.vigenciaHasta).getTime() >= Date.now())
        : [];
    const avisosOficiales = avisosResult.status === 'fulfilled' ? avisosResult.value.value.avisos : null;

    // spec 013 v4b §9.1 — `trafico-empeora` compara el estado de tráfico con el
    // de la evaluación anterior. En un arranque en frío no hay previo y no
    // dispara nada (correcto). Se actualiza el previo tras cada evaluación.
    const tramosTraficoPrevios = cachePeek<TramoTrafico[]>(CLAVE_TRAFICO_PREVIO) ?? null;

    // spec 010 v4 §6 — histéresis del Pulso: mismo patrón que el previo de
    // tráfico, clave propia. `cachePeek` ignora el TTL a propósito (se quiere
    // el último estado conocido, no `undefined` por caducidad — ver
    // `_shared/cache.ts`).
    const estadoHisteresisPrevio = cachePeek<EstadoHisteresisPulso>(CLAVE_HISTERESIS_PULSO) ?? {};
    const { distritos, estadoHisteresis } = calcularPulsoEscenarios(
      {
        distritos: distritosBasicos,
        tramos: tramosTrafico ?? [],
        incidencias,
        zonasFallas: datosFallas?.zonasMovilidadReducida ?? [],
        prediccion,
        aire: aireResult.value,
        tramosPrevios: tramosTraficoPrevios,
        equipamientosCriticos: equipamientosCriticos as EquipamientoCritico[],
      },
      estadoHisteresisPrevio,
    );

    const panel = calcularInsights(
      meteoResult.value,
      aireResult.value,
      distritos,
      prediccion,
      tramosTrafico,
      datosFallas,
      tramosTraficoPrevios,
      avisosOficiales,
    );

    if (tramosTrafico) cachePoke(CLAVE_TRAFICO_PREVIO, tramosTrafico, 15 * 60 * 1000);
    cachePoke(CLAVE_HISTERESIS_PULSO, estadoHisteresis, 30 * 60 * 1000);
    const fresh = meteoResult.fresh && aireResult.fresh;

    return new Response(JSON.stringify({ panel, fresh }), {
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
