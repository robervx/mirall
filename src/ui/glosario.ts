// Glosario / "cómo funciona" — spec 037.
//
// Sección de solo lectura dentro del sidebar (spec 019) que explica los
// conceptos que la app da por sabidos: qué combina el Pulso y con qué pesos,
// qué mide cada capa, el principio "avisa, no actúa", el badge MOCK, etc.
//
// Regla de la spec (§2): los números del Pulso y de las alertas NO se escriben
// a mano aquí — se leen de las constantes reales del código, de modo que si
// alguien recalibra un peso el glosario lo refleja sin tocar este fichero.

import { LAYER_REGISTRY } from '../config/map-layer-definitions';
import {
  UMBRAL_CALOR_TEMPERATURA,
  UMBRAL_CALOR_SENSACION,
  UMBRAL_CALOR_AVISO_TEMPERATURA,
  UMBRAL_VIENTO_AVISO_KMH,
  UMBRAL_VIENTO_URGENTE_KMH,
  UMBRAL_TRAFICO_CONCENTRADO_AVISO,
  UMBRAL_TRAFICO_CONCENTRADO_URGENTE,
} from '../services/insights';

const REPO_URL = 'https://github.com/robervx/vlc-monitor';
const RUTA_FUENTES = 'docs/FUENTES_Y_LICENCIAS.md';

export interface EntradaGlosario {
  termino: string;
  /** HTML simple (párrafos, listas), contenido estático de confianza — sin scripts ni datos de usuario. */
  cuerpo: string;
}

/**
 * Metadatos legibles de cada capa. La *lista* de capas se deriva de
 * `LAYER_REGISTRY` (así una capa nueva sin su línea aquí salta en los tests y
 * en dev), pero el "qué mide / cada cuánto / de qué fuente" es texto curado:
 * el registro no lo guarda y los TTL viven repartidos por endpoint (spec 037 §7).
 */
interface MetaCapa {
  nombre: string;
  mide: string;
  frecuencia: string;
  fuente: string;
}

const META_CAPAS: Record<string, MetaCapa> = {
  distritos: {
    nombre: 'Distritos',
    mide: 'Límites de los 19 distritos (capa base del mapa)',
    frecuencia: 'Geometría fija',
    fuente: 'Cartografía del Ajuntament de València',
  },
  movimientoPersonasMock: {
    nombre: 'Densidad de personas',
    mide: 'Concentración de personas por distrito — 100 % sintética, no representa nada real',
    frecuencia: 'Generada por el propio proyecto (algoritmo determinista por hora)',
    fuente: 'MOCK — sin fuente (ver "MOCK" más abajo)',
  },
  meteo: {
    nombre: 'Meteorología',
    mide: 'Temperatura, sensación térmica, viento, lluvia y estado del cielo',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'Open-Meteo (+ avisos AEMET cuando hay API key)',
  },
  calidadAire: {
    nombre: 'Calidad del aire',
    mide: 'Índice europeo de calidad del aire (EAQI) y PM2.5',
    frecuencia: 'Caché refrescada cada ~60 min',
    fuente: 'Open-Meteo Air Quality',
  },
  trafico: {
    nombre: 'Tráfico',
    mide: 'Estado de circulación por tramo: fluido, denso, congestionado o cortado',
    frecuencia: 'Caché refrescada cada ~3 min',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS)',
  },
  valenbisi: {
    nombre: 'Valenbisi',
    mide: 'Bicis y anclajes libres por estación',
    frecuencia: 'Caché refrescada cada ~2 min',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS)',
  },
  aparcamiento: {
    nombre: 'Aparcamiento',
    mide: 'Plazas libres en aparcamientos públicos (13 sin sensor)',
    frecuencia: 'Caché refrescada cada ~2 min',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS)',
  },
  pulsoDistrito: {
    nombre: 'Pulso de Distrito',
    mide: 'Escenarios de conjunción activos por distrito (ver "Pulso de Distrito" arriba)',
    frecuencia: 'Se recalcula a partir de sus fuentes (tráfico, incidencias, Fallas, lluvia)',
    fuente: 'Compuesto — Mirall, sin fuente externa propia',
  },
  fallas: {
    nombre: 'Fallas',
    mide: 'Monumentos, carpas y zonas de movilidad reducida durante la campaña fallera',
    frecuencia: 'Caché refrescada cada ~6 h',
    fuente: 'Geoportal del Ajuntament de València',
  },
  contextoMediatico: {
    nombre: 'Contexto mediático (prensa)',
    mide: 'Titulares de medios locales filtrados a València-ciudad; no es una capa del mapa, es un panel',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'RSS de medios locales + Google News por medio',
  },
  tendenciaTerminos: {
    nombre: 'Tendencia de términos',
    mide: 'Términos más repetidos en la prensa local por hora y por día',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'Recuento determinista sobre el contexto mediático (sin IA)',
  },
  incidenciasViaPublica: {
    nombre: 'Incidencias de vía pública',
    mide: 'Obras, cortes puntuales y festejos con permiso municipal (visible solo a zoom de calle)',
    frecuencia: 'Caché refrescada cada ~60 min',
    fuente: 'Geoportal del Ajuntament de València',
  },
  camaras: {
    nombre: 'Cámaras en vivo',
    mide: 'Vídeo/imagen en directo de cámaras urbanas (Valencia ciudad) y de la red viaria que rodea la ciudad (rondas, autovías de acceso) — embeds/imágenes de terceros, sin captura ni almacenamiento propio',
    frecuencia: 'Directo (vídeo) / ~2 min (imágenes DGT)',
    fuente: 'Xarxa de Webcams de Turisme CV (fuente "personal", no activa por defecto — ver ADR-003) + DGT, dataset "Cámaras DGT DATEX2 v3.7" (licencia Creative Commons Attribution, pública por defecto — spec 043)',
  },
  agendaEventos: {
    nombre: 'Agenda de eventos',
    mide: 'Agenda general de eventos culturales (conciertos, exposiciones, rutas guiadas, festivales) más una sección destacada de eventos con impacto real en vía pública: fútbol de Valencia CF/Levante UD como local, conciertos/eventos del Roig Arena, carreras populares',
    frecuencia: 'Caché refrescada cada ~6 h',
    fuente: 'Scraping de valencia.es, valenciacf.com, levanteud.com, roigarena.com y fdmvalencia.es (ninguna es una API/dataset oficial, se avisa en el propio panel)',
  },
  avisosMovilidad: {
    nombre: 'Incidencias y previsiones de movilidad',
    mide: 'Obras destacadas y eventos con corte de tráfico anunciados por el propio área de Movilidad, con la calle/franja horaria oficial y enlace al plano cuando lo hay',
    frecuencia: 'Caché refrescada cada ~6 h',
    fuente: 'Scraping de valencia.es/cas/movilidad/incidencias-y-previsiones (no es una API/dataset oficial, se avisa en el propio panel)',
  },
  riesgoEscorrentia: {
    nombre: 'Riesgo de acumulación de agua',
    mide: 'Índice relativo (0-100) entre distritos, combinando densidad de imbornales y lluvia registrada ahora mismo — en 0 sin lluvia activa, no es una probabilidad de inundación ni sustituye avisos oficiales de Protección Civil',
    frecuencia: 'Densidad de imbornales: dato fijo (seed único). Lluvia: caché refrescada cada ~15 min',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS, capa de imbornales) + Open-Meteo (lluvia por distrito, spec 044)',
  },
  temperaturaZona: {
    nombre: 'Temperatura por zona',
    mide: 'Temperatura real en 15 estaciones meteorológicas dentro de Valencia ciudad — no es una interpolación de toda la superficie de la ciudad, solo esas ubicaciones',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'AVAMET (Associació Valenciana de Meteorologia), spec 044',
  },
  precipitacionZona: {
    nombre: 'Precipitación',
    mide: 'Lluvia acumulada hoy (mm) en las mismas 15 estaciones de AVAMET — dato crudo por estación, distinto del índice de riesgo de acumulación de agua (que usa lluvia por distrito de Open-Meteo)',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'AVAMET (Associació Valenciana de Meteorologia), spec 044',
  },
  zonasZas: {
    nombre: 'Zonas Acústicamente Saturadas (ZAS)',
    mide: 'Polígonos de las ZAS ya declaradas (Carmen, Xúquer, Woody, Juan Llorens) — Russafa, la ZAS más reciente, todavía no está publicada en esta capa del geoportal; su ruido en directo (16 sonómetros) se muestra como lista en /inteligencia, sin coordenadas verificadas para pintarlos en el mapa',
    frecuencia: 'Polígonos: dato fijo (seed único). Sonómetros de Russafa: caché refrescada cada ~60 min (dato diario, no instantáneo)',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS) + datos abiertos VLCi (sonómetros de Russafa)',
  },
  altimetria: {
    nombre: 'Altimetría',
    mide: 'Tinta hipsométrica sobre la rejilla real de ~198 puntos del IGN (~600 m de paso) — no un promedio por distrito: cada celda de la "alfombra" es una muestra real, re-escalada al rango real de Valencia (0-45 m) en vez de a una escala pensada para sierra, ver spec 052 v2',
    frecuencia: 'Dato fijo (seed único) — la altimetría no cambia',
    fuente: 'IGN (Instituto Geográfico Nacional), Modelo Digital del Terreno',
  },
};

/** Claves de `LAYER_REGISTRY` sin entrada en `META_CAPAS` — debe ser [] siempre. */
export function capasSinMetadato(): string[] {
  return Object.keys(LAYER_REGISTRY).filter((k) => !(k in META_CAPAS));
}

function listaCapasHtml(): string {
  const filas = Object.keys(LAYER_REGISTRY)
    .map((key) => {
      const m = META_CAPAS[key];
      if (!m) return '';
      return `<li><strong>${m.nombre}.</strong> ${m.mide}. <span class="glosario-meta">Actualización: ${m.frecuencia}. Fuente: ${m.fuente}.</span></li>`;
    })
    .join('');
  return `<ul class="glosario-lista">${filas}</ul>`;
}

function cuerpoPulso(): string {
  return `
    <p>El <strong>Pulso de Distrito</strong> ya no es un número de 0 a 100 (v4,
    2026-09-16) — es un catálogo de <strong>escenarios de conjunción</strong>: cuando
    dos señales que por separado son rutinarias coinciden en el mismo distrito, la app
    lo saca a primer plano nombrando el motivo, la zona y las calles afectadas.</p>
    <ul class="glosario-lista">
      <li><strong>Incidencia + tráfico denso.</strong> Una incidencia oficial de vía
      pública (obra, corte, festejo reciente) coincide con al menos
      ${UMBRAL_TRAFICO_CONCENTRADO_AVISO} tramos congestionados/cortados (≥25 % de los
      monitorizados) en el mismo distrito.</li>
      <li><strong>Fallas + tráfico denso.</strong> Una zona de movilidad reducida de
      Fallas activa coincide con tráfico ya denso en el mismo distrito.</li>
      <li><strong>Lluvia inminente + tráfico denso</strong> (en pruebas, no se pinta
      todavía). Riesgo de lluvia en la ciudad en las próximas 2 h coincidiendo con
      ${UMBRAL_TRAFICO_CONCENTRADO_URGENTE} o más tramos densos, o con tráfico que
      acaba de empeorar, en el mismo distrito.</li>
    </ul>
    <p>Cada distrito tiene un nivel — <strong>seguimiento</strong> (mirar) o
    <strong>prioritario</strong> (adelantarse ya) — el más alto entre sus escenarios
    confirmados. Un escenario solo cuenta tras verse en dos evaluaciones seguidas
    (evita parpadeos) y sigue pintado 20 min tras dejar de detectarse.</p>
    <p class="glosario-nota">Sin tramos de tráfico suficientes en un distrito, el mapa
    lo pinta gris muy claro ("monitorización insuficiente") en vez de "tranquilo" — no
    es lo mismo no tener dato que no tener problema. Heurística documentada, no
    validada contra ningún registro histórico de incidentes reales (ver "Fuentes y
    licencias").</p>
  `;
}

function cuerpoAlertas(): string {
  return `
    <p>El motor de <strong>insights</strong> se recalcula cada pocos minutos a partir
    de las capas ya cacheadas y levanta una alerta cuando algo cruza un umbral. Tipos
    actuales:</p>
    <ul class="glosario-lista">
      <li><strong>Calor</strong> — aviso a partir de ${UMBRAL_CALOR_AVISO_TEMPERATURA} °C;
      calor extremo a ${UMBRAL_CALOR_TEMPERATURA} °C o ${UMBRAL_CALOR_SENSACION} °C de sensación.</li>
      <li><strong>Frío extremo</strong>, <strong>lluvia intensa prevista</strong> y
      <strong>lluvia probable</strong> (señal blanda).</li>
      <li><strong>Viento fuerte</strong> — aviso con rachas ≥ ${UMBRAL_VIENTO_AVISO_KMH} km/h,
      urgente ≥ ${UMBRAL_VIENTO_URGENTE_KMH} km/h.</li>
      <li><strong>Calidad del aire mala</strong> (categoría "Mala" o "Muy mala").</li>
      <li><strong>Tráfico</strong> — concentración de tramos afectados en un distrito,
      tráfico en zona de Fallas, empeoramiento respecto al ciclo anterior y lluvia + tráfico denso.</li>
      <li><strong>Pulso de Distrito</strong> — un escenario de conjunción confirmado
      (ver "Pulso de Distrito" arriba) genera una tarjeta agrupada por distrito.</li>
    </ul>
    <p>Al aparecer una alerta nueva se abre un aviso que hay que cerrar de forma
    explícita antes de seguir (nunca en la primera carga). El panel ofrece un borrador
    de texto para copiar.</p>
    <p class="glosario-nota"><strong>Avisa, no actúa.</strong> La app genera una alerta
    visible para que la revise una persona: nunca decide ni ejecuta una acción sobre
    nadie, ni envía nada automáticamente. Cualquier intervención real sigue el cauce
    legal normal, fuera de esta aplicación (CLAUDE.md §4).</p>
  `;
}

/**
 * Contenido del glosario. Función pura y sin DOM para poder verificar en los
 * tests que los valores salen de las constantes (spec 037 §6).
 */
export function construirEntradasGlosario(): EntradaGlosario[] {
  return [
    { termino: 'Pulso de Distrito', cuerpo: cuerpoPulso() },
    {
      termino: 'Capas del mapa',
      cuerpo: `<p>Qué mide cada capa, cada cuánto se refresca su caché y de dónde
        sale el dato:</p>${listaCapasHtml()}
        <p class="glosario-nota">Las frecuencias son el intervalo de refresco de la
        caché del servidor, orientativas. Meteo y calidad del aire no están en el
        selector de capas: se ven siempre en sus paneles.</p>`,
    },
    {
      termino: 'Prioritarias vs. Contexto',
      cuerpo: `<p>El selector de capas separa en dos grupos:</p>
        <ul class="glosario-lista">
          <li><strong>Prioritarias</strong> — situación de la ciudad ahora mismo
          (tráfico, Pulso, incidencias de vía pública). Siempre visibles, con un
          borde de acento. El botón "Vista operativa" enciende estas y pliega el resto.</li>
          <li><strong>Contexto e informativas</strong> — apoyo (Valenbisi, aparcamiento,
          Fallas, prensa, tendencia de términos, densidad MOCK). Grupo plegable.</li>
        </ul>
        <p class="glosario-nota">La separación es por rol del dato, no por tipo de
        usuario.</p>`,
    },
    {
      termino: '"En vivo" y "no actualizado"',
      cuerpo: `<p>La marca <strong>EN VIVO</strong> de la cabecera resume la frescura
        de todas las fuentes a la vez:</p>
        <ul class="glosario-lista">
          <li><span class="glosario-punto" style="background:#22c55e"></span>
          <strong>Verde</strong> — todas las fuentes al día.</li>
          <li><span class="glosario-punto" style="background:#fbbf24"></span>
          <strong>Ámbar</strong> — alguna fuente sirve datos cacheados antiguos
          ("N/N con retraso").</li>
          <li><span class="glosario-punto" style="background:#94a3b8"></span>
          <strong>Gris</strong> — aún cargando.</li>
        </ul>
        <p>Además, cada panel avisa por su cuenta cuando su dato no está en vivo: quiere
        decir que la última llamada a la fuente falló y se muestra la última respuesta
        buena guardada (patrón "stale-on-error"), no que el dato sea de ahora.</p>`,
    },
    { termino: 'Alertas e insights', cuerpo: cuerpoAlertas() },
    {
      termino: 'MOCK',
      cuerpo: `<p>La capa <strong>"Densidad de personas"</strong> es 100 % sintética:
        se genera con un algoritmo, no mide a nadie y no representa ningún dato real.
        Existe solo para validar la interfaz de choropleth antes de tener (si algún
        día se tiene) una fuente real agregada y anonimizada en origen.</p>
        <p>Por eso lleva el distintivo <strong>MOCK</strong> siempre visible mientras
        está activa. No la uses para nada operativo.</p>`,
    },
    {
      termino: 'Foco de distrito',
      cuerpo: `<p>Al hacer clic en un distrito del mapa aparece el chip
        <strong>"Foco: &lt;distrito&gt;"</strong>. Con el foco puesto:</p>
        <ul class="glosario-lista">
          <li>El contexto mediático se filtra a las noticias de ese distrito (más los
          buckets de ciudad).</li>
          <li>El Pulso antepone el nivel y los escenarios de ese distrito.</li>
        </ul>
        <p>Para quitar el foco: clic de nuevo en el mismo distrito, o el <strong>✕</strong>
        del chip. No se guarda entre sesiones.</p>`,
    },
    {
      termino: 'Fuentes y licencias',
      cuerpo: `<p>Todos los datos de esta app son públicos y gratuitos, sin contratos
        ni claves de pago (la única clave, AEMET, es gratuita y opcional):</p>
        <ul class="glosario-lista">
          <li>Geoportal y Portal de Datos Abiertos del Ajuntament de València —
          <strong>CC BY 4.0</strong>.</li>
          <li>Open-Meteo y Open-Meteo Air Quality — CC BY 4.0.</li>
          <li>AEMET OpenData (avisos) — reutilización con atribución a © AEMET.</li>
          <li>OpenStreetMap vía Overpass (grafo viario) y el mapa base
          (OpenFreeMap / OpenMapTiles) — <strong>ODbL</strong>, © OpenStreetMap contributors.</li>
          <li>Prensa: RSS de medios locales y Google News RSS (para medios sin RSS propio).</li>
        </ul>
        <p>Inventario completo (fuente, licencia y atribución por capa) en
        <a href="${REPO_URL}/blob/master/${RUTA_FUENTES}" target="_blank" rel="noopener">
        ${RUTA_FUENTES}</a>. El código es MIT; no se usa ninguna fuente de localización
        individual (CLAUDE.md §4).</p>`,
    },
  ];
}

export function buildGlosarioContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content glosario';

  const intro = document.createElement('p');
  intro.className = 'cordon-intro';
  intro.textContent =
    'Qué significa cada concepto de la app y cómo se calcula. Los números del Pulso y de las alertas se leen del propio código.';
  wrap.appendChild(intro);

  const entradas = construirEntradasGlosario();
  const detalles: HTMLDetailsElement[] = [];

  for (const entrada of entradas) {
    const det = document.createElement('details');
    det.className = 'glosario-entrada';

    const sum = document.createElement('summary');
    sum.className = 'glosario-entrada__titulo';
    sum.textContent = entrada.termino;
    det.appendChild(sum);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'glosario-entrada__cuerpo';
    cuerpo.innerHTML = entrada.cuerpo;
    det.appendChild(cuerpo);

    // Acordeón: abrir una cierra las demás (spec 037 §5).
    det.addEventListener('toggle', () => {
      if (!det.open) return;
      for (const otro of detalles) if (otro !== det) otro.open = false;
    });

    detalles.push(det);
    wrap.appendChild(det);
  }

  return wrap;
}
