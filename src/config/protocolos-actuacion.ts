/**
 * Registro de protocolos de actuación — spec 042. Contenido estático
 * versionado en el repo (mismo patrón de registro único que el resto de
 * config estática, CLAUDE.md §5), sin fuente externa ni caché.
 *
 * El contenido de "Lluvias intensas" es una propuesta redactada a partir de
 * recomendaciones generales de protección civil ampliamente publicadas (no
 * un procedimiento interno real de ningún cuerpo concreto) — confirmada por
 * el usuario el 2026-09-17 (spec 042 §2, historial v2). No tiene `fuente`
 * citada porque no se ha verificado contra un documento oficial específico;
 * cualquier corrección o fuente que se aporte más adelante entra como nueva
 * versión de esta spec, mismo cauce de revisión.
 */

export interface ProtocoloActuacion {
  id: string;
  titulo: string;
  antes: string[];
  durante: string[];
  fuente?: string;
  ultimaRevision: string; // ISO 8601 — fecha de la última revisión de contenido CON el usuario
}

export const PROTOCOLOS_ACTUACION: ProtocoloActuacion[] = [
  {
    id: 'lluvias-intensas',
    titulo: 'Lluvias intensas',
    antes: [
      'Identificar de antemano los puntos de la zona con histórico de acumulación de agua (pasos inferiores, calles en pendiente, zonas bajas) para priorizar su vigilancia si se decreta aviso.',
      'Revisar la previsión de aforo/tráfico en las vías con más riesgo de corte (spec de tráfico e incidencias de este mismo panel) antes de que empeore.',
      'Tener localizados los medios de balizamiento y desvío disponibles para un corte rápido de vía si un punto se inunda.',
    ],
    durante: [
      'Priorizar la vigilancia de los pasos inferiores y zonas bajas identificadas — cortar el paso preventivamente si el nivel de agua compromete la circulación segura, antes de que quede un vehículo atrapado.',
      'Coordinar con los servicios de emergencia (112, bomberos) cualquier corte de vía, siguiendo el cauce habitual — esta aplicación no sustituye esa coordinación ni la ejecuta.',
      'Evitar el uso del vehículo policial en pasos inundados salvo necesidad de rescate — el riesgo de quedar atrapado también aplica a los propios efectivos.',
      'Mantener informada a la sala de coordinación de la evolución de los puntos críticos, no solo del primer aviso.',
    ],
    ultimaRevision: '2026-09-16T00:00:00.000Z',
  },
];
