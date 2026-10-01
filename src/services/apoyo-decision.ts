/**
 * Panel de apoyo a decisión operativa — spec 041 (specs/041-panel-apoyo-decision.md).
 * Función pura, sin red: traduce los escenarios de conjunción ya calculados
 * por `pulso-escenarios.ts` (spec 010, compartido con el motor de insights
 * de spec 013) en sugerencias de texto, siempre en condicional ("valorar",
 * "podría convenir") — nunca una orden ni una acción ejecutable (§0,
 * CLAUDE.md §4). Ningún dato ni modelo estadístico nuevo — mismo principio
 * que spec 024.
 */
import type { PulsoDistrito, EscenarioActivo, IdEscenario } from './pulso-escenarios';
import type { AvisoMeteo } from './avisos-meteo';

export interface SugerenciaOperativa {
  id: string;
  distrito?: string;
  calle?: string;
  señalesCombinadas: string[];
  resumen: string;
  sugerenciaTexto: string;
  severidad: 'seguimiento' | 'prioritario';
  generadaEn: string;
  fuenteSpec: string[];
  /**
   * Elaboración deliberada sobre el contrato mínimo de spec 041 §3 (mismo
   * espíritu que `EstadoEscenario` en pulso-escenarios.ts): sin un punto real
   * no hay forma de que "Ver en el mapa" (§5, "reutiliza la misma instancia
   * de mapa para marcar la zona señalada") centre en algo que no sea el
   * centro de la ciudad. Viene directo de `centroideAfectado` del escenario
   * de origen — nunca un punto inventado.
   */
  centroide: [number, number];
}

const SEÑALES_POR_ESCENARIO: Record<IdEscenario, string[]> = {
  'incidencia-sobre-trafico-denso': ['incidencia-via-publica', 'trafico-denso'],
  'fallas-y-trafico': ['zona-fallas', 'trafico-denso'],
  'lluvia-inminente-sobre-trafico-denso': ['lluvia-inminente', 'trafico-denso'],
  'corte-cerca-equipamiento-critico': ['corte-via', 'equipamiento-critico-cercano'],
};

// Mismo mapeo que FUENTES_POR_ESCENARIO de insights.ts (spec 013) — '010'
// siempre presente porque el evaluador consolidado es su fuente directa.
const FUENTES_POR_ESCENARIO: Record<IdEscenario, string[]> = {
  'incidencia-sobre-trafico-denso': ['010', '004', '026'],
  'fallas-y-trafico': ['010', '004', '008'],
  'lluvia-inminente-sobre-trafico-denso': ['010', '004', '016'],
  'corte-cerca-equipamiento-critico': ['010', '004', '054'],
};

function calleDe(escenario: EscenarioActivo): string | undefined {
  return escenario.tramosAfectados[0]?.nombre || undefined;
}

/** Siempre en condicional (§7) — nunca "enviar"/"cortar", solo "valorar"/"podría convenir". */
function sugerenciaTextoPara(escenario: EscenarioActivo, distritoNombre: string): string {
  const calle = calleDe(escenario);
  const dondeCalle = calle ? `${calle} (${distritoNombre})` : distritoNombre;
  switch (escenario.id) {
    case 'incidencia-sobre-trafico-denso':
      return `Podría convenir valorar reforzar la regulación de tráfico en ${dondeCalle}, donde hay una incidencia coincidiendo con tráfico ya denso.`;
    case 'fallas-y-trafico':
      return `Podría convenir valorar reforzar la zona de Fallas en ${distritoNombre}, donde la zona de movilidad reducida coincide con tráfico ya denso.`;
    case 'lluvia-inminente-sobre-trafico-denso':
      return `Podría convenir valorar preposicionar unidades cerca de ${dondeCalle} ante la lluvia prevista, que coincide con tráfico ya denso en la zona.`;
    case 'corte-cerca-equipamiento-critico': {
      const eq = escenario.equipamientoCritico;
      const nombreEq = eq ? eq.nombre : 'un equipamiento crítico cercano';
      return `Podría convenir valorar una vía alternativa de acceso cerca de ${dondeCalle}, donde el corte podría afectar al acceso de emergencias a ${nombreEq}.`;
    }
  }
}

/**
 * v2 (spec 041) — el aviso oficial de Emergencias GVA más severo entre
 * rojo/naranja, si hay alguno vigente (`avisosOficiales` ya viene filtrado a
 * vigentes por `fetchAvisosVigentes`, spec 001 — no se re-comprueba aquí).
 * Amarillo se queda fuera a propósito: mismo corte que ya usa
 * `SEVERIDAD_POR_NIVEL_AVISO` en insights.ts (rojo/naranja → urgente,
 * amarillo → aviso) — recomendación del asesor de ciencia de datos
 * (2026-10-01), prioridad #2 de las propuestas para esta spec.
 */
function avisoOficialMasSevero(avisos: AvisoMeteo[]): AvisoMeteo | null {
  const relevantes = avisos.filter((a) => a.nivel === 'rojo' || a.nivel === 'naranja');
  if (relevantes.length === 0) return null;
  return relevantes.find((a) => a.nivel === 'rojo') ?? relevantes[0]!;
}

/**
 * Enriquece el texto con el aviso oficial vigente — NUNCA cambia `severidad`
 * ni `señalesCombinadas` más allá de añadir una entrada trazable: la
 * severidad la sigue decidiendo solo la conjunción de tráfico/incidencias ya
 * calculada por spec 010 (mismo criterio que recomendó el asesor de datos —
 * esto es contexto que matiza el texto, no una señal que suba el nivel por
 * sí sola, para no acercarse a un score ponderado entre señales, CLAUDE.md
 * y spec 013 §0/§8).
 */
function enriquecerConAvisoOficial(sugerencia: SugerenciaOperativa, aviso: AvisoMeteo | null): SugerenciaOperativa {
  if (!aviso) return sugerencia;
  return {
    ...sugerencia,
    señalesCombinadas: [...sugerencia.señalesCombinadas, `aviso-oficial-${aviso.nivel}`],
    fuenteSpec: [...sugerencia.fuenteSpec, '001'],
    sugerenciaTexto: `${sugerencia.sugerenciaTexto} Además, hay un aviso oficial ${aviso.nivel} de Emergencias (GVA) vigente en la Comunitat Valenciana.`,
  };
}

function sugerenciaDeEscenario(
  distrito: PulsoDistrito,
  escenario: EscenarioActivo,
  generadaEn: string,
): SugerenciaOperativa {
  return {
    id: `${distrito.distritoCodigo}:${escenario.id}`,
    distrito: distrito.distritoNombre,
    calle: calleDe(escenario),
    señalesCombinadas: SEÑALES_POR_ESCENARIO[escenario.id],
    resumen: escenario.motivo,
    sugerenciaTexto: sugerenciaTextoPara(escenario, distrito.distritoNombre),
    severidad: escenario.nivel,
    generadaEn,
    fuenteSpec: FUENTES_POR_ESCENARIO[escenario.id],
    centroide: escenario.centroideAfectado,
  };
}

/**
 * Solo escenarios `modo: 'vivo'` y `confirmado` (mismo gate que usan spec 010
 * v4 para el choropleth e `insightsPulsoDistrito` de spec 013 — un escenario
 * en modo sombra o sin confirmar no genera sugerencia, spec 010 §10.3).
 *
 * `avisosOficiales` (v2, spec 041) — opcional, por defecto `[]` para no
 * romper ninguna llamada existente. Mismo patrón que `avisosOficiales` en
 * `calcularInsights` (insights.ts, spec 013 v4).
 */
export function calcularSugerencias(
  distritos: PulsoDistrito[],
  generadaEn: string,
  avisosOficiales: AvisoMeteo[] = [],
): SugerenciaOperativa[] {
  const avisoMasSevero = avisoOficialMasSevero(avisosOficiales);
  const sugerencias: SugerenciaOperativa[] = [];
  for (const distrito of distritos) {
    for (const escenario of distrito.escenariosActivos) {
      if (escenario.modo !== 'vivo' || !escenario.confirmado) continue;
      sugerencias.push(enriquecerConAvisoOficial(sugerenciaDeEscenario(distrito, escenario, generadaEn), avisoMasSevero));
    }
  }
  // Prioritario primero — es lo que más falta hace decidir (spec 041 §1).
  return sugerencias.sort((a, b) => (a.severidad === b.severidad ? 0 : a.severidad === 'prioritario' ? -1 : 1));
}
