/**
 * Registro único de capas del mapa. Patrón calcado de World Monitor
 * (ver docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md §3.1):
 * una capa = una entrada aquí, nunca lógica repartida en N sitios.
 *
 * Añadir una capa SIN una spec aprobada en specs/ está prohibido — ver
 * CLAUDE.md §2.
 */

export type RendererKind = 'deck' | 'panel'; // solo mapa plano — sin globo 3D, ver CLAUDE.md §5. 'panel' añadido en spec 009: no geoespacial, se renderiza como lista en la UI

/**
 * Grupo del selector de capas (spec 033). `primaria` = situación de la ciudad
 * ahora mismo (siempre visible, con acento). `contexto` = información de apoyo
 * (grupo plegable). Fuente de verdad única de la asignación.
 */
export type GrupoCapa = 'primaria' | 'contexto';

export interface LayerDefinition {
  key: string;
  specId: string; // id de la spec en specs/ que define esta capa — trazabilidad obligatoria
  renderers: RendererKind[];
  zoomMinimo: number;
  agregacion: 'punto' | 'choropleth-distrito' | 'rejilla' | 'cluster' | 'linea' | 'lista' | 'mixta'; // 'linea' (spec 004), 'lista' (spec 009, panel no geoespacial), 'mixta' (spec 010 v4: marcador + tramos resaltados como primario, choropleth como contexto; también spec 050/051 v4: insignia por estación + superficie interpolada IDW), 'rejilla' (spec 052 v2: celdas cuadradas sobre puntos reales de una rejilla, no un choropleth por distrito)
  /** Grupo del selector — spec 033. `distritos` (capa base, no está en el selector) es el único sin grupo. */
  grupo?: GrupoCapa;
  /** Debe ser `true` mientras la fuente sea sintética — ver spec 003. */
  esMock?: boolean;
  /** Distintivo visual obligatorio en la UI mientras esMock sea true — ver spec 003 §5. */
  badge?: string;
}

export const LAYER_REGISTRY: Record<string, LayerDefinition> = {
  distritos: {
    key: 'distritos',
    specId: '000',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'choropleth-distrito',
  },
  movimientoPersonasMock: {
    key: 'movimientoPersonasMock',
    specId: '003',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'choropleth-distrito',
    esMock: true,
    badge: 'MOCK',
  },
  meteo: {
    key: 'meteo',
    specId: '001',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  calidadAire: {
    key: 'calidadAire',
    specId: '002',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  trafico: {
    key: 'trafico',
    specId: '004',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'linea',
  },
  valenbisi: {
    key: 'valenbisi',
    specId: '005',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  aparcamiento: {
    key: 'aparcamiento',
    specId: '006',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  pulsoDistrito: {
    key: 'pulsoDistrito',
    specId: '010',
    // v3 (DoD de V1, 2026-09-16): pasa de 'primaria' a 'contexto' — el
    // usuario pidió expresamente que sea la última capa del selector, tráfico
    // + contexto mediático + cámaras + incidencias pasan por delante.
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    // v4 (spec 010 §5, 2026-09-16): ya no es un choropleth plano — marcador +
    // tramos resaltados por escenario activo (primario), choropleth de
    // 3 estados por distrito (contexto).
    agregacion: 'mixta',
  },
  fallas: {
    key: 'fallas',
    specId: '008',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  contextoMediatico: {
    key: 'contextoMediatico',
    specId: '009',
    // v3 (DoD de V1, 2026-09-16): pasa de 'contexto' a 'primaria' — el
    // usuario la señaló como una de las capas que más información aportan.
    grupo: 'primaria',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  tendenciaTerminos: {
    key: 'tendenciaTerminos',
    specId: '025',
    grupo: 'contexto',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  incidenciasViaPublica: {
    key: 'incidenciasViaPublica',
    specId: '026',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 12, // solo a nivel calle — 499 puntos activos, satura el mapa a zoom de ciudad (spec 026 §5/§7)
    agregacion: 'punto',
  },
  camaras: {
    key: 'camaras',
    specId: '038',
    // Nueva en v3 (DoD de V1, 2026-09-16) — antes no tenía entrada en este
    // registro, se cableaba a mano en main.ts (`panel.camarasToggle`).
    // 'primaria' porque el usuario la señaló como una de las capas más
    // informativas, junto con tráfico y contexto mediático.
    grupo: 'primaria',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  agendaEventos: {
    key: 'agendaEventos',
    specId: '027',
    grupo: 'contexto',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  avisosMovilidad: {
    key: 'avisosMovilidad',
    specId: '048',
    grupo: 'contexto',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  riesgoEscorrentia: {
    key: 'riesgoEscorrentia',
    specId: '046',
    // v4 (2026-09-24, pedido explícito del usuario): pasa de 'contexto' a
    // 'primaria' — la quiere arriba del todo del selector, antes que tráfico.
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'choropleth-distrito',
  },
  temperaturaZona: {
    key: 'temperaturaZona',
    specId: '050',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 0,
    // v4: insignia por estación (punto) + superficie continua interpolada
    // (IDW) por debajo — ya no es solo 'punto'.
    agregacion: 'mixta',
  },
  zonasZas: {
    key: 'zonasZas',
    specId: '049',
    grupo: 'primaria',
    // 'mixta': polígonos ya declarados (deck, mapa) + lista de sonómetros de
    // Russafa sin geometría verificada (panel, /inteligencia) — spec 049 §5.
    renderers: ['deck', 'panel'],
    zoomMinimo: 0,
    agregacion: 'mixta',
  },
  precipitacionZona: {
    key: 'precipitacionZona',
    specId: '051',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 0,
    // v4: insignia por estación (punto) + superficie continua interpolada
    // (IDW) por debajo — ya no es solo 'punto'.
    agregacion: 'mixta',
  },
  altimetria: {
    key: 'altimetria',
    specId: '052',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'rejilla',
  },
  //
  // No añadas entradas aquí sin que exista antes la spec correspondiente
  // en specs/, con su contrato de capa ya congelado (sección 5 de la spec).
};
