// Cabecera institucional + sidebar plegable — spec 019.
// Chasis de aplicación: no contiene lógica de datos, solo monta el marco
// sobre el que se apoyan el mapa y los paneles ya existentes (que siguen
// apareciendo vía document.body.appendChild sin cambios).
import { PANEL_PREFERENCES_REGISTRY, isPanelVisible, setPanelVisible } from './panel-preferences';
import { limpiarCacheDatos } from '../pwa';
import { onCambioFrescura } from './estado-frescura';
import { MARCA } from '../config/marca';
import { esMovil, getLayoutForzado, setLayoutForzado, onCambioLayout } from './deteccion-dispositivo';
import { irAVista, vistaActual, type Vista } from './router';
import { calcularCercania, formatoDistancia, type ResultadoCercania } from '../services/proximidad';
import { getCapasActivas } from '../services/capas-activas-store';
import {
  onCambioModoCordon,
  activarSeleccionUbicacion,
  actualizarFormulario,
  confirmarPropuesta,
  volverASeleccionUbicacion,
  salirModoCordon,
  toggleCorteManual,
  getTramoPorId as getTramoPorIdCordon,
  type EstadoModoCordon,
  type FormularioIncidente,
} from './modo-cordon';
import { FUENTES_REGLAS } from '../config/reglas-perimetro-incendio';
import type { SubtipoIncidente, IntensidadIncidente } from '../services/cordon-incidente';
import {
  onCambioModoSimulacion,
  activarSimulacionCortes,
  toggleTramoCortado,
  salirSimulacionCortes,
  getTramoPorIdSimulacion,
  type EstadoModoSimulacion,
} from './modo-simulacion-cortes';
import { buildGlosarioContent } from './glosario';
import { escapeHtml } from './panel-utils';

export interface SidebarSectionDefinition {
  key: string;
  label: string;
  icono: string;
  specId?: string;
  /** Contenido desplegable bajo la fila. */
  render: () => HTMLElement;
}

function filaResultado<T extends { nombre: string }>(r: ResultadoCercania<T>): string {
  return `<div class="proximidad-item"><span class="proximidad-item__nombre">${r.item.nombre}</span><span class="proximidad-item__dist">${formatoDistancia(r.distanciaMetros)}</span></div>`;
}

function seccionResultados(titulo: string, filas: string): string {
  return `<div class="proximidad-seccion"><div class="proximidad-seccion__titulo">${titulo}</div>${
    filas || '<div class="proximidad-vacio">Sin datos — activa esta capa en el panel de capas</div>'
  }</div>`;
}

// Spec 012 — la posición del usuario nunca se envía a ningún endpoint ni se
// persiste (ni localStorage ni caché): solo vive en memoria mientras dura
// esta consulta puntual, y solo se pide tras pulsar el botón explícitamente.
function buildProximidadContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'proximidad-boton';
  boton.textContent = '📍 Buscar cerca de mí';

  const estadoMsg = document.createElement('div');
  estadoMsg.className = 'proximidad-estado';

  const resultados = document.createElement('div');
  resultados.className = 'proximidad-resultados';

  boton.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      estadoMsg.textContent = 'Este navegador no soporta geolocalización.';
      return;
    }
    boton.disabled = true;
    estadoMsg.textContent = 'Buscando tu posición…';
    resultados.innerHTML = '';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        boton.disabled = false;
        const posicion: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const resultado = calcularCercania(posicion, getCapasActivas());
        estadoMsg.textContent = `Posición obtenida (±${Math.round(pos.coords.accuracy)} m de precisión)`;
        resultados.innerHTML = [
          seccionResultados('Tráfico', resultado.trafico.map(filaResultado).join('')),
          seccionResultados('Valenbisi', resultado.valenbisi.map(filaResultado).join('')),
          seccionResultados('Aparcamiento', resultado.aparcamiento.map(filaResultado).join('')),
        ].join('');
      },
      (err) => {
        boton.disabled = false;
        estadoMsg.textContent =
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado — actívalo en el navegador para usar esta función.'
            : 'No se pudo obtener tu posición.';
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });

  wrap.append(boton, estadoMsg, resultados);
  return wrap;
}

const ETIQUETA_SUBTIPO: Record<SubtipoIncidente, string> = {
  vivienda: 'Vivienda',
  edificio: 'Edificio',
  bajoLocal: 'Bajo local',
  garajeAparcamiento: 'Garaje / aparcamiento',
  vehiculoCombustion: 'Vehículo (combustión)',
  vehiculoElectricoHibrido: 'Vehículo eléctrico / híbrido',
};

const ETIQUETA_INTENSIDAD: Record<IntensidadIncidente, string> = {
  conato: 'Conato',
  incendioControlado: 'Incendio controlado',
  incendioGeneralizado: 'Incendio generalizado',
};

const ETIQUETA_CONFIANZA: Record<string, { texto: string; color: string }> = {
  oficialVerificada: { texto: 'Fuente oficial verificada', color: '#16a34a' },
  referenciaInternacional: { texto: 'Referencia internacional (no normativa española)', color: '#f59e0b' },
  estimacionPendienteValidar: { texto: 'Estimación — pendiente de validar con el servicio de bomberos', color: '#dc2626' },
};

// Comprobación best-effort de datos identificativos en texto libre — no es
// (ni pretende ser) detección de PII completa, solo bloquea los patrones
// más obvios (DNI/NIE, teléfono, email) antes de permitir "Confirmar".
// Documentado como limitación explícita en spec 021 §6.
function contieneDatoIdentificativoProbable(texto: string): boolean {
  const patrones = [
    /\b\d{8}[A-Za-z]\b/, // DNI
    /\b[XYZxyz]\d{7}[A-Za-z]\b/, // NIE
    /\b\d{9}\b/, // teléfono (9 dígitos seguidos)
    /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/, // email
  ];
  return patrones.some((p) => p.test(texto));
}

function renderBadgeConfianza(confianza: string, fuenteId: string): string {
  const info = ETIQUETA_CONFIANZA[confianza] ?? { texto: confianza, color: '#666' };
  const fuente = FUENTES_REGLAS[fuenteId];
  return `
    <div class="cordon-badge" style="border-color:${info.color}">
      <span class="cordon-badge__punto" style="background:${info.color}"></span>
      <div>
        <div class="cordon-badge__texto">${info.texto}</div>
        <div class="cordon-badge__fuente">${fuente?.descripcion ?? fuenteId}</div>
      </div>
    </div>
    <div class="cordon-disclaimer">
      ⚠️ Punto de partida orientativo, no una cifra normativa cerrada — revisa y ajusta antes de actuar sobre el terreno.
    </div>`;
}

function buildCordonIncidenteContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const cuerpo = document.createElement('div');
  wrap.appendChild(cuerpo);

  function render(e: EstadoModoCordon): void {
    if (e.fase === 'inactivo') {
      cuerpo.innerHTML = `
        <p class="cordon-intro">Propone un perímetro y calles a cortar para un incendio — nunca decide ni notifica por sí solo. Cifras de partida, siempre editables.</p>
        <button type="button" class="proximidad-boton" id="cordon-iniciar">🔥 Marcar incidente en el mapa</button>
      `;
      cuerpo.querySelector('#cordon-iniciar')?.addEventListener('click', () => {
        void activarSeleccionUbicacion();
      });
      return;
    }

    if (e.fase === 'esperandoClicMapa') {
      cuerpo.innerHTML = `
        <p class="cordon-intro">Haz clic en el punto del mapa donde está el incidente.</p>
        ${e.cargandoGrafo ? '<p class="proximidad-estado">Cargando grafo viario…</p>' : ''}
        ${e.errorGrafo ? `<p class="proximidad-estado" style="color:#f87171">${escapeHtml(e.errorGrafo)}</p>` : ''}
        <button type="button" class="proximidad-boton" id="cordon-cancelar">Cancelar</button>
      `;
      cuerpo.querySelector('#cordon-cancelar')?.addEventListener('click', () => salirModoCordon());
      return;
    }

    // fase === 'formulario'
    const f = e.formulario;
    const pii = contieneDatoIdentificativoProbable(f.observaciones ?? '');
    const resultado = e.resultado;

    cuerpo.innerHTML = `
      <div class="cordon-form">
        <label>Subtipo
          <select id="cordon-subtipo">
            ${Object.entries(ETIQUETA_SUBTIPO)
              .map(([v, l]) => `<option value="${v}" ${f.subtipo === v ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>
        </label>
        <label>Intensidad
          <select id="cordon-intensidad">
            ${Object.entries(ETIQUETA_INTENSIDAD)
              .map(([v, l]) => `<option value="${v}" ${f.intensidad === v ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>
        </label>
        <label>Plantas afectadas
          <input type="number" min="0" id="cordon-plantas" value="${f.plantasAfectadas ?? ''}" />
        </label>
        <label>Viviendas afectadas
          <input type="number" min="0" id="cordon-viviendas" value="${f.viviendasAfectadas ?? ''}" />
        </label>
        <label class="cordon-checkbox-label">
          <input type="checkbox" id="cordon-desalojo" ${f.necesidadDesalojo ? 'checked' : ''} />
          Necesidad de desalojo
        </label>
        <label>Observaciones (sin nombres ni datos identificativos)
          <textarea id="cordon-observaciones" rows="2">${escapeHtml(f.observaciones ?? '')}</textarea>
        </label>
        ${pii ? '<div class="cordon-pii-error">⚠️ Este texto parece incluir un dato identificativo (DNI, teléfono, email…). Quítalo para poder confirmar.</div>' : ''}
        <button type="button" class="proximidad-boton" id="cordon-cambiar-ubicacion">Cambiar ubicación</button>
      </div>
      <div id="cordon-resultado"></div>
      <p class="cordon-intro" style="margin-top:10px">Haz clic en calles del mapa para cortarlas a mano (además del perímetro). Clic de nuevo para quitar el corte.</p>
      <div id="cordon-cortes-manuales"></div>
      <div id="cordon-propagacion"></div>
      <button type="button" class="proximidad-boton" id="cordon-salir" style="margin-top:8px">Salir del modo cordón</button>
    `;

    const resultadoRoot = cuerpo.querySelector('#cordon-resultado')!;
    if (!resultado) {
      resultadoRoot.innerHTML = '<p class="proximidad-estado">Calculando propuesta…</p>';
    } else if (!resultado.ok) {
      resultadoRoot.innerHTML = `<p class="proximidad-estado" style="color:#f87171">${escapeHtml(resultado.error)}</p>`;
    } else {
      const p = resultado.propuesta;
      resultadoRoot.innerHTML = `
        ${renderBadgeConfianza(p.regla.confianza, p.regla.fuenteId)}
        <div class="cordon-resumen">
          <div>🔴 ${p.tramosCerrados.length} tramos cerrados (Área de Intervención, ${p.regla.radioAreaIntervencionM}m)</div>
          <div>🟠 ${p.tramosCorte.length} puntos de control (borde Área de Socorro, ${p.regla.radioAreaSocorroM}m)</div>
          <div>🔵 ${p.tramosDesvioSugerido.length} tramos de desvío sugerido</div>
        </div>
        <button type="button" class="proximidad-boton" id="cordon-confirmar" ${pii ? 'disabled' : ''}>
          ${e.confirmada ? '✓ Propuesta confirmada' : 'Confirmar propuesta (no envía nada)'}
        </button>
      `;
      cuerpo.querySelector('#cordon-confirmar')?.addEventListener('click', () => confirmarPropuesta());
    }

    cuerpo.querySelector('#cordon-subtipo')?.addEventListener('change', (ev) => {
      actualizarFormulario({ subtipo: (ev.target as HTMLSelectElement).value as FormularioIncidente['subtipo'] });
    });
    cuerpo.querySelector('#cordon-intensidad')?.addEventListener('change', (ev) => {
      actualizarFormulario({ intensidad: (ev.target as HTMLSelectElement).value as FormularioIncidente['intensidad'] });
    });
    cuerpo.querySelector('#cordon-plantas')?.addEventListener('change', (ev) => {
      const v = (ev.target as HTMLInputElement).value;
      actualizarFormulario({ plantasAfectadas: v === '' ? undefined : Number(v) });
    });
    cuerpo.querySelector('#cordon-viviendas')?.addEventListener('change', (ev) => {
      const v = (ev.target as HTMLInputElement).value;
      actualizarFormulario({ viviendasAfectadas: v === '' ? undefined : Number(v) });
    });
    cuerpo.querySelector('#cordon-desalojo')?.addEventListener('change', (ev) => {
      actualizarFormulario({ necesidadDesalojo: (ev.target as HTMLInputElement).checked });
    });
    cuerpo.querySelector('#cordon-observaciones')?.addEventListener('input', (ev) => {
      actualizarFormulario({ observaciones: (ev.target as HTMLTextAreaElement).value });
    });
    cuerpo.querySelector('#cordon-cambiar-ubicacion')?.addEventListener('click', () => volverASeleccionUbicacion());
    cuerpo.querySelector('#cordon-salir')?.addEventListener('click', () => salirModoCordon());

    // Cortes manuales (spec 021 v3).
    const cortesRoot = cuerpo.querySelector('#cordon-cortes-manuales')!;
    if (e.cortesManuales.length > 0) {
      cortesRoot.innerHTML = `
        <div class="proximidad-seccion__titulo">Cortes manuales (${e.cortesManuales.length})</div>
        ${e.cortesManuales
          .map((id) => {
            const t = getTramoPorIdCordon(id);
            return `<div class="sim-corte-item">
              <span>${escapeHtml(t?.nombreCalle ?? '(sin nombre)')} <span class="sim-corte-sentido">— ${escapeHtml(ETIQUETA_SENTIDO[t?.sentido ?? ''] ?? '')}</span></span>
              <button type="button" class="sim-corte-quitar" data-corte="${id}" title="Quitar corte">✕</button>
            </div>`;
          })
          .join('')}
      `;
      cortesRoot.querySelectorAll<HTMLButtonElement>('.sim-corte-quitar').forEach((boton) => {
        boton.addEventListener('click', () => toggleCorteManual(boton.dataset.corte!));
      });
    }

    // Efecto en cadena que se escapa del perímetro de socorro (spec 031 §5).
    const propRoot = cuerpo.querySelector('#cordon-propagacion')!;
    const fuera = e.propagacionFuera;
    const totalFuera = fuera ? fuera.sinEntrada.length + fuera.sinSalida.length + fuera.desvio.length : 0;
    if (fuera && totalFuera > 0) {
      const bloque = (clase: string, titulo: string, tramos: { nombreCalle: string | null }[]): string =>
        tramos.length === 0
          ? ''
          : `<div class="${clase}">${titulo}<ul>${nombresUnicos(tramos)
              .map((n) => `<li>${escapeHtml(n)}</li>`)
              .join('')}</ul></div>`;
      propRoot.innerHTML =
        `<div class="proximidad-seccion__titulo">⚠️ Efecto en cadena fuera del cordón</div>` +
        bloque('sim-aviso-sin-entrada', 'Sin entrada de tráfico — aguas abajo del corte:', fuera.sinEntrada) +
        bloque('sim-aviso-aislados', 'Sin salida — zona que quedaría atrapada:', fuera.sinSalida) +
        bloque('sim-aviso-desvio', 'Desvío forzado — vías abiertas que desembocan en el corte:', fuera.desvio);
    } else if (e.cortesManuales.length > 0 || (e.resultado?.ok && e.resultado.propuesta.tramosCerrados.length > 0)) {
      propRoot.innerHTML = '<div class="sim-aviso-ok">✓ El corte no arrastra ninguna calle fuera del perímetro.</div>';
    }
  }

  onCambioModoCordon(render);

  return wrap;
}

const ETIQUETA_SENTIDO: Record<string, string> = {
  unidireccional: 'sentido único',
  bidireccional: 'doble sentido',
};

/**
 * Descarga un resumen de texto plano de la simulación actual — Blob +
 * enlace temporal, patrón estándar de descarga en el navegador, sin backend
 * ni almacenamiento: el fichero se genera enteramente en el cliente a
 * partir del estado ya visible en pantalla.
 */
function nombresUnicos(tramos: { nombreCalle: string | null }[]): string[] {
  return [...new Set(tramos.map((t) => t.nombreCalle ?? '(sin nombre)'))];
}

function descargarResumenSimulacion(e: EstadoModoSimulacion): void {
  const fecha = new Date().toLocaleString('es-ES');
  const r = e.resultado;
  const lineas = [
    `Simulación de cortes de calle — ${MARCA.nombre}`,
    `Generado: ${fecha}`,
    '',
    `CALLES CORTADAS (${e.tramosCortados.length}):`,
    ...e.tramosCortados.map((id) => {
      const t = getTramoPorIdSimulacion(id);
      return `- ${t?.nombreCalle ?? '(sin nombre)'} (${ETIQUETA_SENTIDO[t?.sentido ?? ''] ?? 'sentido desconocido'})`;
    }),
    '',
  ];

  const sinEntrada = [...(r?.tramosSinEntrada ?? []), ...(r?.tramosAislados ?? [])];
  const sinSalida = [...(r?.tramosSinSalida ?? []), ...(r?.tramosAislados ?? [])];
  const desvio = r?.tramosDesvioForzado ?? [];

  if (sinEntrada.length + sinSalida.length + desvio.length === 0) {
    lineas.push('✓ Sin efecto en cadena: ningún tramo se queda sin entrada ni sin salida.');
  } else {
    if (sinEntrada.length > 0) {
      lineas.push(`⚠️ SIN ENTRADA DE TRÁFICO — aguas abajo del corte (${r?.nodosSinEntradaCount ?? 0} puntos de red):`);
      lineas.push(...nombresUnicos(sinEntrada).map((n) => `- ${n}`));
    }
    if (sinSalida.length > 0) {
      lineas.push(`⚠️ SIN SALIDA — zona que quedaría atrapada (${r?.nodosSinSalidaCount ?? 0} puntos de red):`);
      lineas.push(...nombresUnicos(sinSalida).map((n) => `- ${n}`));
    }
    if (desvio.length > 0) {
      lineas.push('↪️ DESVÍO FORZADO — vías abiertas que desembocan en el corte:');
      lineas.push(...nombresUnicos(desvio).map((n) => `- ${n}`));
    }
  }
  if (r?.tramosCortados.length) {
    lineas.push('');
    lineas.push(
      e.rutasAlternativas.length > 0
        ? `↩️ RUTA(S) ALTERNATIVA(S) DEL TRÁFICO: ${e.rutasAlternativas.length} (${Math.round(
            e.rutasAlternativas.reduce((s, x) => s + x.longitudM, 0) / e.rutasAlternativas.length,
          )} m de media).`
        : '↩️ Sin ruta alternativa cercana para el tráfico cortado.',
    );
  }
  lineas.push('', 'Alcanzabilidad sobre datos de OpenStreetMap — punto de partida orientativo, revisar sobre el terreno antes de aplicar.');

  const blob = new Blob([lineas.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `simulacion-cortes-${Date.now()}.txt`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function buildGemeloDigitalContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const cuerpo = document.createElement('div');
  wrap.appendChild(cuerpo);

  function render(e: EstadoModoSimulacion): void {
    if (e.fase === 'inactivo') {
      cuerpo.innerHTML = `
        <p class="cordon-intro">Simula cortes de calle (ej. para una carrera o un evento) y comprueba el efecto en cadena siguiendo el sentido real de circulación: qué tramos se quedan sin entrada de tráfico, cuáles sin salida, qué vías obligan a desviarse y por dónde daría la vuelta el tráfico (animado). No es simulación de tráfico con intensidades, solo alcanzabilidad.</p>
        <button type="button" class="proximidad-boton" id="sim-iniciar">🗺️ Activar simulador de cortes</button>
      `;
      cuerpo.querySelector('#sim-iniciar')?.addEventListener('click', () => {
        void activarSimulacionCortes();
      });
      return;
    }

    // fase === 'seleccionando'
    const nombresCortados = e.tramosCortados.map((id) => ({
      id,
      tramo: getTramoPorIdSimulacion(id),
    }));

    cuerpo.innerHTML = `
      <p class="cordon-intro">Haz clic en las calles del mapa para cortarlas. Clic de nuevo sobre una ya cortada para quitarla.</p>
      ${e.cargandoGrafo ? '<p class="proximidad-estado">Cargando grafo viario…</p>' : ''}
      ${e.errorGrafo ? `<p class="proximidad-estado" style="color:#f87171">${e.errorGrafo}</p>` : ''}
      <div class="proximidad-seccion__titulo">Calles cortadas (${nombresCortados.length})</div>
      <div id="sim-lista-cortes">
        ${
          nombresCortados.length === 0
            ? '<div class="proximidad-vacio">Ninguna todavía</div>'
            : nombresCortados
                .map(
                  ({ id, tramo }) => `
              <div class="sim-corte-item">
                <span>${escapeHtml(tramo?.nombreCalle ?? '(sin nombre)')} <span class="sim-corte-sentido">— ${escapeHtml(ETIQUETA_SENTIDO[tramo?.sentido ?? ''] ?? '')}</span></span>
                <button type="button" class="sim-corte-quitar" data-id="${id}" title="Quitar corte">✕</button>
              </div>`,
                )
                .join('')
        }
      </div>
      <div id="sim-resultado"></div>
      ${
        e.tramosCortados.length > 0
          ? '<button type="button" class="proximidad-boton" id="sim-descargar" style="margin-top:8px">⬇️ Descargar resumen</button>'
          : ''
      }
      <button type="button" class="proximidad-boton" id="sim-salir" style="margin-top:8px">Salir del simulador</button>
    `;

    cuerpo.querySelector('#sim-descargar')?.addEventListener('click', () => descargarResumenSimulacion(e));

    const resultadoRoot = cuerpo.querySelector('#sim-resultado')!;
    const r = e.resultado;
    const sinEntrada = [...(r?.tramosSinEntrada ?? []), ...(r?.tramosAislados ?? [])];
    const sinSalida = [...(r?.tramosSinSalida ?? []), ...(r?.tramosAislados ?? [])];
    const desvio = r?.tramosDesvioForzado ?? [];
    const bloque = (clase: string, titulo: string, tramos: { nombreCalle: string | null }[]): string =>
      tramos.length === 0
        ? ''
        : `<div class="${clase}">${titulo}<ul>${nombresUnicos(tramos)
            .map((n) => `<li>${n}</li>`)
            .join('')}</ul></div>`;

    const rutasInfo =
      e.rutasAlternativas.length > 0
        ? `<div class="sim-aviso-reruta">↩️ Desvío del tráfico (animado en verde): ${e.rutasAlternativas.length} ruta(s) alternativa(s), ${Math.round(
            e.rutasAlternativas.reduce((s, x) => s + x.longitudM, 0) / e.rutasAlternativas.length,
          )} m de media.</div>`
        : e.tramosCortados.length > 0
          ? '<div class="sim-aviso-reruta">↩️ Sin ruta alternativa cercana para el tráfico cortado.</div>'
          : '';

    if (sinEntrada.length + sinSalida.length + desvio.length > 0) {
      resultadoRoot.innerHTML =
        bloque('sim-aviso-sin-entrada', `⚠️ Sin entrada de tráfico (${r?.nodosSinEntradaCount ?? 0} puntos de red) — aguas abajo del corte:`, sinEntrada) +
        bloque('sim-aviso-aislados', `⚠️ Sin salida (${r?.nodosSinSalidaCount ?? 0} puntos de red) — zona que quedaría atrapada:`, sinSalida) +
        bloque('sim-aviso-desvio', '↪️ Desvío forzado — vías abiertas que desembocan en el corte:', desvio) +
        rutasInfo;
    } else if (e.tramosCortados.length > 0) {
      resultadoRoot.innerHTML = '<div class="sim-aviso-ok">✓ Sin efecto en cadena con estos cortes.</div>' + rutasInfo;
    }

    cuerpo.querySelectorAll<HTMLButtonElement>('.sim-corte-quitar').forEach((boton) => {
      boton.addEventListener('click', () => toggleTramoCortado(boton.dataset.id!));
    });
    cuerpo.querySelector('#sim-salir')?.addEventListener('click', () => salirSimulacionCortes());
  }

  onCambioModoSimulacion(render);

  return wrap;
}

function buildConfiguracionContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const title = document.createElement('div');
  title.className = 'sidebar-panel-content__title';
  title.textContent = 'Paneles visibles en pantalla';
  wrap.appendChild(title);

  PANEL_PREFERENCES_REGISTRY.forEach((def) => {
    const row = document.createElement('label');
    row.className = 'sidebar-panel-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isPanelVisible(def.key);
    checkbox.addEventListener('change', () => setPanelVisible(def.key, checkbox.checked));

    const text = document.createElement('span');
    text.textContent = def.label;

    row.append(checkbox, text);
    wrap.appendChild(row);
  });

  return wrap;
}

// Registro único — añadir una funcionalidad nueva al sidebar es una entrada
// aquí, mismo patrón que LAYER_REGISTRY (ver map-layer-definitions.ts).
// Ninguna entrada 'disponible' sin que exista ya la spec que la respalda.
export const SIDEBAR_REGISTRY: SidebarSectionDefinition[] = [
  {
    key: 'cerca-de-mi',
    label: 'Cerca de mí',
    icono: '📍',
    specId: '012',
    render: buildProximidadContent,
  },
  {
    key: 'cordon-incidente',
    label: 'Cordón de incidente',
    icono: '🔥',
    specId: '021',
    render: buildCordonIncidenteContent,
  },
  {
    key: 'gemelo-digital',
    label: 'Gemelo digital',
    icono: '🗺️',
    specId: '022',
    render: buildGemeloDigitalContent,
  },
  {
    key: 'glosario',
    label: 'Glosario',
    icono: '📖',
    specId: '037',
    render: buildGlosarioContent,
  },
  {
    key: 'configuracion',
    label: 'Configuración',
    icono: '⚙️',
    specId: '019',
    render: buildConfiguracionContent,
  },
];

const SIDEBAR_EXPANDED_KEY = 'mirall:sidebar-expanded';

function buildHeader(): HTMLElement {
  const header = document.createElement('header');
  header.id = 'app-header';

  const logo = document.createElement('img');
  logo.id = 'app-header__logo';
  logo.src = '/assets/logo.png';
  logo.alt = '';
  logo.onerror = () => {
    logo.style.visibility = 'hidden';
  };

  const brand = document.createElement('div');
  brand.id = 'app-header__brand';

  const name = document.createElement('span');
  name.id = 'app-header__name';
  name.textContent = MARCA.nombre;

  const tagline = document.createElement('span');
  tagline.id = 'app-header__tagline';
  tagline.textContent = MARCA.descriptor;

  brand.append(name, tagline);

  // spec 040 — nav de dos vistas (mapa operativo / hub de inteligencia),
  // routing por hash. `data-vista` en <html> (aplicado por initRouter) pinta
  // el enlace activo por CSS — este nav solo dispara la navegación.
  const nav = document.createElement('nav');
  nav.id = 'app-header__nav';
  const enlaceVista = (vista: Vista, label: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-header__nav-link';
    btn.dataset.vista = vista;
    btn.textContent = label;
    btn.setAttribute('aria-current', vistaActual() === vista ? 'page' : 'false');
    btn.addEventListener('click', () => irAVista(vista));
    return btn;
  };
  const linkMapa = enlaceVista('mapa', 'Mapa');
  const linkInteligencia = enlaceVista('inteligencia', 'Inteligencia');
  nav.append(linkMapa, linkInteligencia);
  window.addEventListener('hashchange', () => {
    const actual = vistaActual();
    linkMapa.setAttribute('aria-current', actual === 'mapa' ? 'page' : 'false');
    linkInteligencia.setAttribute('aria-current', actual === 'inteligencia' ? 'page' : 'false');
  });

  const status = document.createElement('div');
  status.id = 'app-header__status';

  const live = document.createElement('span');
  live.id = 'app-header__live';
  const dot = document.createElement('span');
  dot.id = 'app-header__status-dot';
  const liveLabel = document.createElement('span');
  liveLabel.id = 'app-header__live-label';
  liveLabel.textContent = 'EN VIVO';
  const frescura = document.createElement('span');
  frescura.id = 'app-header__frescura';
  live.append(dot, liveLabel, frescura);

  // spec 034b — rollup de frescura: la cabecera resume el estado de todas las
  // fuentes en un vistazo (verde/ámbar) sin tener que leer panel por panel.
  onCambioFrescura((r) => {
    live.dataset.frescura = r.estado;
    if (r.estado === 'cargando') {
      frescura.textContent = '';
      live.title = 'Cargando datos…';
      return;
    }
    const edadMin =
      r.masReciente != null ? Math.max(0, Math.round((Date.now() - Date.parse(r.masReciente)) / 60000)) : null;
    frescura.textContent =
      r.conRetraso === 0
        ? edadMin != null
          ? `· ${r.total} fuentes · hace ${edadMin} min`
          : `· ${r.total} fuentes`
        : `· ${r.conRetraso}/${r.total} con retraso`;
    live.title =
      r.conRetraso === 0
        ? `${r.total} fuentes al día`
        : `${r.alDia} al día · ${r.conRetraso} sirviendo datos no en vivo`;
  });

  const divider = document.createElement('span');
  divider.id = 'app-header__divider';

  const datetime = document.createElement('div');
  datetime.id = 'app-header__datetime';
  const clock = document.createElement('span');
  clock.id = 'app-header__clock';
  const date = document.createElement('span');
  date.id = 'app-header__date';
  datetime.append(clock, date);

  status.append(live, divider, datetime);
  header.append(logo, brand, nav, status);

  const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const updateClock = () => {
    const now = new Date();
    // En móvil el reloj se compacta a HH:MM (spec 029 §3); la fecha completa
    // se oculta por CSS.
    clock.textContent = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      ...(esMovil() ? {} : { second: '2-digit' }),
      timeZone: 'Europe/Madrid',
    });
    date.textContent = capitalizar(
      now.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Madrid',
      }),
    );
  };
  updateClock();
  setInterval(updateClock, 1000);

  return header;
}

function buildSidebarSection(def: SidebarSectionDefinition): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-section-wrap';

  const el = document.createElement('div');
  el.className = 'sidebar-section sidebar-section--interactive';
  el.dataset.sectionKey = def.key;

  const icon = document.createElement('span');
  icon.className = 'sidebar-section__icon';
  icon.textContent = def.icono;

  const label = document.createElement('span');
  label.className = 'sidebar-section__label';
  label.textContent = def.label;

  el.append(icon, label);
  wrap.appendChild(el);

  const content = def.render();
  content.hidden = true;
  el.addEventListener('click', () => {
    content.hidden = !content.hidden;
    el.classList.toggle('is-open', !content.hidden);
  });
  wrap.appendChild(content);

  return wrap;
}

function buildSidebar(): void {
  const sidebar = document.createElement('aside');
  sidebar.id = 'app-sidebar';

  // En móvil la hoja siempre arranca cerrada (si no, taparía el mapa al abrir
  // la app); en escritorio se respeta lo que el usuario dejó (spec 019).
  const expandedInicial = !esMovil() && localStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1';
  if (expandedInicial) sidebar.classList.add('is-expanded');

  const toggle = document.createElement('button');
  toggle.id = 'app-sidebar__toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Mostrar/ocultar barra lateral');
  toggle.textContent = expandedInicial ? '⟨' : '☰';

  // Backdrop — solo se ve en móvil (CSS), cierra la hoja al tocar fuera.
  const backdrop = document.createElement('div');
  backdrop.id = 'app-sidebar__backdrop';
  backdrop.hidden = true;

  // Botón de cierre grande — solo visible en móvil (CSS).
  const cerrar = document.createElement('button');
  cerrar.id = 'app-sidebar__cerrar';
  cerrar.type = 'button';
  cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.textContent = '✕';

  // Botón flotante para abrir la hoja en móvil (vive fuera del sidebar para
  // que el `transform` del panel no lo arrastre). Solo visible en móvil (CSS).
  const fab = document.createElement('button');
  fab.id = 'app-sidebar__fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Abrir menú');
  fab.textContent = '☰';

  let focoPrevio: HTMLElement | null = null;

  function setExpandido(expanded: boolean): void {
    sidebar.classList.toggle('is-expanded', expanded);
    toggle.textContent = expanded ? '⟨' : '☰';
    toggle.setAttribute('aria-expanded', String(expanded));
    backdrop.hidden = !(expanded && esMovil());
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, expanded ? '1' : '0');

    if (expanded && esMovil()) {
      focoPrevio = document.activeElement as HTMLElement | null;
      cerrar.focus();
      document.addEventListener('keydown', onKeydown);
    } else {
      document.removeEventListener('keydown', onKeydown);
      if (focoPrevio && !esMovil()) focoPrevio = null;
      else if (focoPrevio) {
        focoPrevio.focus?.();
        focoPrevio = null;
      }
    }

    // Escritorio (spec 019 v5): al expandir, un clic fuera del sidebar y de la
    // cabecera lo colapsa — expandido tapa el selector de capas (`#controls`) y
    // solo se podía cerrar con el botón `⟨`. En móvil ya lo cierran backdrop/Esc/swipe.
    if (expanded && !esMovil()) {
      document.addEventListener('pointerdown', onClicFueraEscritorio, true);
    } else {
      document.removeEventListener('pointerdown', onClicFueraEscritorio, true);
    }
  }

  function onClicFueraEscritorio(ev: PointerEvent): void {
    if (esMovil() || !sidebar.classList.contains('is-expanded')) return;
    const t = ev.target as Node | null;
    if (t && (sidebar.contains(t) || document.getElementById('app-header')?.contains(t))) return;
    setExpandido(false);
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      setExpandido(false);
      return;
    }
    // Trampa de foco básica mientras la hoja está abierta en móvil.
    if (ev.key === 'Tab') {
      const focusables = sidebar.querySelectorAll<HTMLElement>(
        'button, a[href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const primero = focusables[0]!;
      const ultimo = focusables[focusables.length - 1]!;
      if (ev.shiftKey && document.activeElement === primero) {
        ev.preventDefault();
        ultimo.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimo) {
        ev.preventDefault();
        primero.focus();
      }
    }
  }

  toggle.addEventListener('click', () => setExpandido(!sidebar.classList.contains('is-expanded')));
  fab.addEventListener('click', () => setExpandido(true));
  cerrar.addEventListener('click', () => setExpandido(false));
  backdrop.addEventListener('click', () => setExpandido(false));

  // Swipe a la izquierda para cerrar la hoja (solo móvil).
  let xTouch = 0;
  sidebar.addEventListener(
    'touchstart',
    (ev) => {
      xTouch = ev.touches[0]?.clientX ?? 0;
    },
    { passive: true },
  );
  sidebar.addEventListener(
    'touchend',
    (ev) => {
      if (!esMovil() || !sidebar.classList.contains('is-expanded')) return;
      const dx = (ev.changedTouches[0]?.clientX ?? 0) - xTouch;
      if (dx < -60) setExpandido(false);
    },
    { passive: true },
  );

  // Al cambiar de layout con la hoja abierta, normaliza el estado. Bug real
  // (spec 019 v6): esta función reconciliaba el listener de `pointerdown`
  // (clic fuera en escritorio) pero no el de `keydown` (Esc + trampa de foco,
  // pensado solo para la hoja móvil) — si la hoja se abría en escritorio y
  // luego el layout pasaba a móvil sin volver a llamar a `setExpandido`, Esc
  // dejaba de cerrarla porque el listener nunca se había añadido.
  const expandidaAhora = (): boolean => sidebar.classList.contains('is-expanded');
  onCambioLayout((layout) => {
    if (layout === 'escritorio') {
      backdrop.hidden = true;
      document.removeEventListener('keydown', onKeydown);
      if (expandidaAhora()) {
        document.addEventListener('pointerdown', onClicFueraEscritorio, true);
      }
    } else {
      document.removeEventListener('pointerdown', onClicFueraEscritorio, true);
      if (expandidaAhora()) {
        backdrop.hidden = false;
        document.addEventListener('keydown', onKeydown);
      } else {
        document.removeEventListener('keydown', onKeydown);
      }
    }
  });

  const sections = document.createElement('div');
  sections.id = 'app-sidebar__sections';
  SIDEBAR_REGISTRY.forEach((def) => sections.appendChild(buildSidebarSection(def)));

  const footer = document.createElement('div');
  footer.id = 'app-footer-attrib';

  // Sesión (spec 018) — solo se muestra si el gate de acceso está activo.
  // Si /api/auth/v1/estado no responde o no hay sesión (p.ej. `npm run dev`
  // sin AUTH_SECRET), este bloque queda oculto y no estorba.
  const sesionBox = document.createElement('div');
  sesionBox.id = 'app-sidebar__sesion';
  sesionBox.hidden = true;
  const sesionUsuario = document.createElement('span');
  sesionUsuario.id = 'app-sidebar__sesion-usuario';
  const cerrarSesion = document.createElement('button');
  cerrarSesion.type = 'button';
  cerrarSesion.id = 'app-sidebar__logout';
  cerrarSesion.textContent = 'Cerrar sesión';
  cerrarSesion.addEventListener('click', () => {
    cerrarSesion.disabled = true;
    void fetch('/api/auth/v1/logout', { method: 'POST' })
      .catch(() => undefined)
      .then(() => limpiarCacheDatos())
      .catch(() => undefined)
      .finally(() => window.location.reload());
  });
  sesionBox.append(sesionUsuario, cerrarSesion);

  void fetch('/api/auth/v1/estado')
    .then((r) => (r.ok ? (r.json() as Promise<{ autenticado: boolean; usuario?: string }>) : null))
    .then((estado) => {
      if (estado?.autenticado) {
        sesionUsuario.textContent = `Sesión: ${estado.usuario ?? ''}`;
        sesionBox.hidden = false;
      }
    })
    .catch(() => undefined);

  // Cambiar entre versión de escritorio y móvil (spec 029 §3).
  const layoutBox = document.createElement('div');
  layoutBox.id = 'app-sidebar__layout';
  const layoutLink = document.createElement('button');
  layoutLink.type = 'button';
  layoutLink.id = 'app-sidebar__layout-link';
  const pintarLayoutLink = (): void => {
    const forzado = getLayoutForzado();
    if (forzado === 'movil') layoutLink.textContent = 'Ver versión de escritorio';
    else if (forzado === 'escritorio') layoutLink.textContent = 'Ver versión móvil';
    else layoutLink.textContent = esMovil() ? 'Ver versión de escritorio' : 'Ver versión móvil';
  };
  layoutLink.addEventListener('click', () => {
    setLayoutForzado(esMovil() ? 'escritorio' : 'movil');
    pintarLayoutLink();
  });
  onCambioLayout(pintarLayoutLink);
  layoutBox.appendChild(layoutLink);

  const attrib = document.createElement('div');
  attrib.id = 'app-footer-attrib__text';
  attrib.textContent = MARCA.pie;
  footer.append(sesionBox, layoutBox, attrib);

  sidebar.append(cerrar, toggle, sections, footer);
  // Orden en el DOM: backdrop, sidebar, fab (el selector `~` del CSS que oculta
  // el fab con la hoja abierta necesita que el fab vaya después del sidebar).
  document.body.append(backdrop, sidebar, fab);
}

/** Monta cabecera + sidebar. Llamar una vez, al inicio de main(). */
export function mountChasis(): void {
  document.body.appendChild(buildHeader());
  buildSidebar();
}
