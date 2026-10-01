// GET /api/decision/v1/sugerencias — endpoint definido en
// specs/041-panel-apoyo-decision.md §4. Sin fuente externa propia: agrega
// (no re-consulta) las cachés ya existentes de 010 (evaluador consolidado
// de escenarios, compartido con api/pulso/v1/distrito.ts y
// api/insights/v1/actual.ts — "un único evaluador, no dos paralelos", spec
// 010 §6), a su vez alimentado por 004 (tráfico), 008 (Fallas), 016
// (predicción a corto plazo) y 026 (incidencias de vía pública).
import { getOrFetch, cachePeek, cachePoke } from './_shared/cache';
import { calcularPulsoEscenarios, type EstadoHisteresisPulso } from '../services/pulso-escenarios';
import { calcularSugerencias } from '../services/apoyo-decision';
import { fetchEstadoMeteo } from '../services/estado-meteo';
import { fetchCalidadAire } from '../services/calidad-aire';
import { fetchEstadoTrafico, type TramoTrafico } from '../services/trafico';
import { fetchIncidenciasViaPublica } from '../services/via-publica';
import { fetchDatosFallas } from '../services/fallas';
import { fetchPrediccionCortoPlazo } from '../services/prediccion-corto-plazo';
import { fetchAvisosVigentes } from '../services/avisos-meteo';
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

// Mismas claves que api/pulso/v1/distrito.ts y api/insights/v1/actual.ts —
// comparten el mismo estado de histéresis, no uno propio (spec 010 §6).
const CLAVE_HISTERESIS_PULSO = 'pulso:escenarios-previos:v1';
const CLAVE_TRAFICO_PREVIO = 'insights:trafico:estado-previo';

export default async function handler(): Promise<Response> {
  try {
    const resolverDistrito = (lat: number, lon: number) => getDistrictAtCoordinates(lat, lon)?.codigo ?? null;
    const [meteoResult, aireResult, traficoResult] = await Promise.all([
      getOrFetch('meteo:valencia-actual:v1', 15 * 60 * 1000, fetchEstadoMeteo),
      getOrFetch('aire:valencia-actual:v1', 60 * 60 * 1000, fetchCalidadAire),
      getOrFetch('trafico:valencia-estado:v1', 3 * 60 * 1000, () => fetchEstadoTrafico(resolverDistrito)),
    ]);

    // spec 041 §4 — si una señal falla, se muestran las sugerencias que sí se
    // pudieron calcular con el resto; nunca se oculta la página entera.
    const [incidenciasResult, fallasResult, prediccionResult, avisosResult] = await Promise.allSettled([
      getOrFetch('via-publica:incidencias-valencia:v1', 60 * 60 * 1000, () =>
        fetchIncidenciasViaPublica(resolverDistrito),
      ),
      getOrFetch('fallas:valencia-actual:v1', 6 * 60 * 60 * 1000, () => fetchDatosFallas(resolverDistrito)),
      getOrFetch('meteo:valencia-prediccion-4h:v1', 15 * 60 * 1000, fetchPrediccionCortoPlazo),
      // v2 (spec 041) — mismo endpoint/caché que ya usa api/meteo/v1/avisos.ts
      // y api/insights/v1/actual.ts, no una llamada propia nueva.
      getOrFetch('meteo:valencia-avisos:v1', 15 * 60 * 1000, fetchAvisosVigentes),
    ]);

    const incidencias =
      incidenciasResult.status === 'fulfilled'
        ? incidenciasResult.value.value.filter((i) => new Date(i.vigenciaHasta).getTime() >= Date.now())
        : [];
    const zonasFallas = fallasResult.status === 'fulfilled' ? fallasResult.value.value.zonasMovilidadReducida : [];
    const prediccion = prediccionResult.status === 'fulfilled' ? prediccionResult.value.value : null;
    const avisosOficiales = avisosResult.status === 'fulfilled' ? avisosResult.value.value.avisos : [];

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
        equipamientosCriticos: equipamientosCriticos as EquipamientoCritico[],
      },
      estadoHisteresisPrevio,
    );

    cachePoke(CLAVE_HISTERESIS_PULSO, estadoHisteresis, 30 * 60 * 1000);
    cachePoke(CLAVE_TRAFICO_PREVIO, traficoResult.value, 15 * 60 * 1000);

    const generadaEn = new Date().toISOString();
    const sugerencias = calcularSugerencias(distritos, generadaEn, avisosOficiales);
    const fresh = meteoResult.fresh && aireResult.fresh && traficoResult.fresh;

    return new Response(JSON.stringify({ sugerencias, fresh }), {
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
