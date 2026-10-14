# Identidad visual Mirall v2

```yaml
id: 056
titulo: "Identidad visual Mirall v2 — tema oscuro + acento lima"
estado: Implemented
tipo: fundacional
depende_de: [019, 040, 053]
propietario: usuario
version: 9
```

## 1. Problema / motivación

El usuario trajo un paquete de diseño completo (`00-PROMPT-IMPLEMENTACION.md` + capturas, en un pendrive externo
montado en `/Volumes/DATAWORK/Mirall-Urban-Intelligence-Platform/` — **no copiado al repo todavía, ver §9**) con
una nueva identidad visual para Mirall: tema oscuro único (`#0A0C0B`) con acento lima (`#C8F03C`), tipografías Inter
Tight/Inter/JetBrains Mono, iconografía Lucide, y 12 pantallas especificadas al pixel (landing + app
Mapa/Inteligencia/Configuración, en desktop/tablet/móvil).

Esta spec es **puramente visual**: no introduce ninguna fuente de datos, endpoint, servicio ni capa nueva — por
eso no usa las secciones 2-5 de `SPEC_TEMPLATE.md` (fuente de datos / contrato de datos / pipeline / contrato de
capa, todas pensadas para specs `tipo: capa`). Es `tipo: fundacional`, como `019` (identidad de marca) o `040`
(reestructuración de vistas).

**Decisión de arquitectura (confirmada explícitamente por el usuario tras análisis de pros/contras):** se
implementa en **TypeScript vanilla + CSS**, igual que el resto del proyecto — NO se migra a React/Tailwind,
aunque el documento de diseño lo recomiende como stack. Razón: 55 specs `Implemented` en TS vanilla, sin
necesidad funcional que justifique una reescritura arquitectónica, y el propio documento marca el stack como
"recomendado", no como contrato — lo vinculante son los tokens (§5 del documento) y las capturas, no la
tecnología. El patrón de componentización sin framework ya existe en el proyecto (`src/ui/panel-utils.ts`) y es
el que se reutiliza y extiende aquí (`src/ui/componentes-base.ts`, `src/ui/iconos.ts`).

## 2. Alcance y fases

El rediseño se implementa **de forma incremental**, pantalla por pantalla, no de una vez. Cada fase tiene su
propio DoD (sección 6) y, cuando toca una pantalla que ya pertenece a otra spec implementada, esa spec recibe
una línea de nueva versión en `specs/INDEX.md` (mismo patrón que "v4 consumidor de spec X" ya usado en el
proyecto) — no specs nuevas por cada pantalla repintada.

| Fase | Qué cubre | Specs existentes amendadas | Estado |
|---|---|---|---|
| **1** | Tokens de diseño + catálogo de componentes base (botones, chip, segmentado, toggle, DataCard, KPI, barras, fila de señal, pills) + iconografía Lucide. Aditivo: ninguna pantalla existente cambia de aspecto. | — (solo esta spec) | **Implemented** |
| **2** | Landing pública (nav, hero recolor lima/oscuro, comparación "Dos modelos de ciudad", métricas, footer, menú móvil) | `053` | **Implemented** |
| **3a** | Chasis de la app (`TopBar`/`NavRail`/`SideMenu`/`TabBar`) sustituyendo cabecera+sidebar actuales. El mapa en sí (estilo, capas, leyendas, controles de zoom) no se toca | `019`, `029` | **Implemented** |
| **3b** | Estilo oscuro del mapa (MapLibre, mismo proveedor OpenFreeMap — solo cambia el *style* de pintado); panel de capas, barra de cifras, tooltips y controles de zoom recoloreados | `000`, `026`, `033`, `034`, `036`, `055` | **Implemented** |
| **4** | Vista Inteligencia — rejilla de 12 tipos de tarjeta con el `DataCard` de la Fase 1 + estados (cargando/vacío/error/desactualizado). Se hace fila por fila (§8.5): **las 4 filas implementadas** — Prioridad, Clima y terreno, Movilidad y actividad, Contexto | `047` (fila 1), `044`/`046` (fila 2), `038`/`043`/`049`/`027` (fila 3), `009`/`025`/`039`/`042` (fila 4) | **Implemented** |
| **5** | Configuración de ciudad + pantallas móviles nuevas "Barrios"/"Capas" (funcionalidad nueva, no solo reskin) + pase de accesibilidad WCAG 2.2 AA transversal | `019` (Configuración, `TabBar`), `029` (reparentado móvil), `040` (router, vistas nuevas) | **Implemented** |

## 3. Tokens de diseño (contrato — Fase 1)

Viven en `src/estilos.css` (bloque `:root` nuevo, junto al legado `--mirall-acento`/`--mirall-navy` de spec
`053`, que se retira cuando el chasis/paneles que los usan pasen a su fase):

```css
--bg: #0a0c0b;            --surface: #121513;       --surface-2: #1a1e1b;     --border: #262b28;
--text-primary: #f2f4ee;  --text-secondary: #8c948e; --text-muted: #5c635e;
--accent: #c8f03c;        --accent-ink: #0a0c0b;
--danger: #ff5a4e;        --warning: #ffa63d;        --info: #3dc5ff;
```

Tipografía: Google Fonts `Inter Tight` 600/700, `Inter` 400/500/600, `JetBrains Mono` 400/500 — cargadas en las
4 páginas (`index.html`, `mapa/index.html`, `proceso/index.html`, `guia-estilos/index.html`) desde la Fase 1, sin
uso todavía fuera de la guía de estilos y de los componentes nuevos.

Espaciado/radios/movimiento: escala completa en `src/estilos.css` (`--mv2-space-*`, `--mv2-radius-*`,
`--mv2-dur-*`/`--mv2-ease`), según §5.3/§11 del documento de diseño.

## 4. Catálogo de componentes base (Fase 1)

Prefijo de clase `mv2-` (temporal durante el rollout — se "promociona" sin prefijo cuando cada componente legado
equivalente se retira en su propia fase). Implementados como clases CSS + helpers TS en
`src/ui/componentes-base.ts` (`crearBoton`, `crearChip`, `crearToggle`, `crearDataCard`/`pintarEstadoDataCard`,
`crearKpi`, `crearBarraFila`, `crearFilaSeñal`, `crearPill`) e iconos en `src/ui/iconos.ts` (`iconoSvg`,
`iconoElemento`, paquete `lucide-static`, SVG crudo sin runtime de framework).

`DataCard` (`crearDataCard`) implementa los 5 estados de la sección 10 del documento
(`ready|loading|empty|error|stale`) desde la Fase 1, para que cada panel que migre en la Fase 4 los reciba
gratis en vez de reimplementarlos.

## 5. Fuera de alcance de esta spec

- Ninguna fuente de datos, endpoint o contrato de capa (ver §1).
- El estilo oscuro del mapa (MapLibre) — es Fase 3, trabajo real de recolorear capas vectoriales, no solo tokens.
- Las pantallas móviles "Barrios" y "Capas" del documento son funcionalidad nueva (hoy no existen como
  pantallas propias) — se diseñan en la Fase 5, no son un simple reskin.
- `guia-estilos/index.html` es una herramienta interna de verificación (mismo espíritu que `?debug=grafo` de
  spec `020`), sin gate de acceso. Antes de que `master` se funda a `publico` (ADR-007) con esta spec dentro,
  decidir si se excluye del build público o se protege — no bloqueante para `master`.

## 6. Criterios de aceptación — Fase 1 (Definition of Done)

- [x] Tokens de color/tipografía/espaciado/radios en `src/estilos.css`, sin alterar el aspecto de ninguna
      pantalla ya implementada (verificado: `/`, `/mapa`, `/proceso` sin cambio visual).
- [x] Catálogo de componentes base (botones, chip, segmentado, toggle, DataCard con 5 estados, KPI, barras,
      histograma, fila de señal, pills) implementado en CSS + `src/ui/componentes-base.ts`.
- [x] Iconografía Lucide (`src/ui/iconos.ts`), subconjunto del catálogo de la sección 6 del documento.
- [x] Página de verificación `guia-estilos/index.html` con cada componente/variante/estado, registrada en el
      build multi-página de Vite.
- [x] `npm run typecheck` y `npm run build` verdes.
- [x] Confirmación visual en navegador: `guia-estilos/` muestra correctamente todos los tokens/componentes
      (captura completa con viewport redimensionado, el scroll normal del Browser pane de este entorno tropieza
      con el mismo bug de render intermitente ya documentado en `050`-`052`/`055` — mitigado así, no es un bug de
      esta spec); `/`, `/mapa`, `/proceso` verificados sin cambio de aspecto (build de producción, `vite
      preview`) y sin errores de consola.

## 6.1 Criterios de aceptación — Fase 2 (landing pública)

- [x] `src/mirall-v2.css` extraída de `estilos.css` como hoja compartida (app + páginas públicas) — refactor
      necesario al descubrir que `paginas-publicas.css` no podía ver los tokens/componentes de la Fase 1 por estar
      deliberadamente desacoplada de `estilos.css` (spec 053).
- [x] Nav, hero (badge + H1 con "espejo." en lima + subtítulo + CTAs), comparación "Dos modelos de ciudad" y pie
      reconstruidos según §8.1 del documento de diseño, en `index.html` + `src/paginas-publicas.css`.
- [x] Fondo 3D del hero (`src/paginas/hero-ciudad-3d.ts`) recoloreado a `#0A0C0B`/`#C8F03C` (antes navy/teal),
      con `emissive` en los edificios lima y partículas como octaedros, según §8.2.
- [x] Responsive en los 3 breakpoints (§8.3): cápsula de nav oculta bajo 1280, CTA+hamburguesa en tablet, solo
      hamburguesa en móvil (CTA vive en el hero); métricas pasan a lista en móvil.
- [x] Menú a pantalla completa (tablet+móvil) reescrito en `src/paginas/nav-publica.ts`: enlaces numerados
      01-04 con `arrow-up-right`, estado "en vivo", CTA a ancho completo, foco atrapado + Esc + clic fuera.
- [x] **Contenido corregido, no copiado literal de la captura** (decisión explícita del usuario, ver pregunta
      de esta sesión): "9.147 vecinos conectados" y "16 barrios con sensor propio" eran cifras de plantilla sin
      respaldo real (Mirall no trackea usuarios — fuera de alcance, `CLAUDE.md` §3). Sustituidas por: `19`
      distritos de València (hecho estable), capas de datos abiertas **calculadas en vivo** desde
      `LAYER_REGISTRY` (`src/paginas/metricas-landing.ts`, 21 en el momento de verificar — excluye solo la capa
      base `distritos` y las `esMock`), `100%` fuentes públicas sin datos de pago. Icono RSS del pie retirado
      (Mirall no expone feed propio — hubiera sido un enlace falso).
- [x] "Construido con" (stack tecnológico) movido de la landing a `/proceso#tecnologia` — no aparecía en la
      captura de la landing (solo Hero → Comparación → Métricas → Footer), nav/footer siguen enlazando a él.
- [x] `npm run typecheck`, `npm run build` (989 módulos, sin errores) y `npm run test` (525/525) verdes.
- [x] Verificado en navegador (`vite preview`, build de producción) en desktop (1440), tablet (768) y móvil
      (375): capturas comparadas contra `01`-`03-landing-*.png`, sin errores de consola.
- [x] Menú a pantalla completa (`04-landing-movil-menu-abierto.png`): verificado estructuralmente en esta sesión
      (DOM correcto, `hidden`/`aria-expanded` bien) y **confirmado visualmente por el usuario en `localhost`**
      tras el cierre de la sesión (funciona bien) — sin huecos pendientes.

## 6.2 Criterios de aceptación — Fase 3a (chasis de la app)

Esta fase reveló que el diseño del pendrive asume funciones que la app real no tiene (buscador, selector de
ciudad, notificaciones push, perfiles de usuario) — resueltas con el mismo criterio que la Fase 2: datos/
funcionalidad real por delante de la fidelidad pixel-perfecta.

- [x] `TopBar` (`buildTopBar`, antes `buildHeader`, `src/ui/chasis.ts`): lockup + divisor + interruptor
      Mapa/Inteligencia (segmentado Mirall v2) + etiqueta de ciudad/distrito **estática** (refleja
      `getFocoDistrito()` real, spec 036 — sin desplegable, Mirall es mono-ciudad) a la izquierda; alerta
      crítica persistente (recoloreada a `--danger`/`--warning`, función real de spec 013 v5 mantenida pese a
      no estar en el diseño) + pill "En vivo" + campana (navega a los insights activos, reutiliza
      `irAPanelInsights` vía `setCampanaOnClick`) + ajustes (abre el SideMenu en Configuración) a la derecha.
      Buscador del diseño **omitido** — no hay geocoder ni índice que buscar, construirlo es una spec de datos
      propia, no un reskin.
- [x] `NavRail` (72px, plegado) / `SideMenu` (300px, desplegado): mismo elemento `#app-sidebar` en sus dos
      estados (como ya hacía spec 019), con grupos VISTAS (Mapa/Inteligencia) y HERRAMIENTAS (Cerca de mí,
      Cordón de incidente, Gemelo digital, Glosario, Configuración — las 5 funciones de
      `buildProximidadContent`/`buildCordonIncidenteContent`/`buildGemeloDigitalContent`/`buildGlosarioContent`/
      `buildConfiguracionContent` se reutilizan sin tocar, solo cambia el contenedor). Pie con "EN VIVO · N
      fuentes" + reloj (mudados del TopBar legado — el diseño los pide exactamente ahí, §7.12) + sesión/logout
      (spec 018) + alternar versión móvil/escritorio (spec 029), ninguno de los dos en el diseño original pero
      mantenidos por ser funciones reales.
- [x] `TabBar` móvil (`buildTabBar`, nuevo): **3 pestañas funcionales** (Mapa, Inteligencia, Más — abre el
      SideMenu como drawer, sustituye al FAB flotante legado). "Barrios" y "Capas" del diseño **no incluidas**:
      son pantallas nuevas que no existen todavía (Fase 5) — no se ponen pestañas que no llevan a ningún sitio.
- [x] Bug real encontrado y corregido en esta misma sesión: el pie del `SideMenu` en el drawer móvil quedaba
      tapado por el `TabBar` fijo (`#app-sidebar` no reservaba su altura) — corregido con
      `bottom: var(--tabbar-h)`.
- [x] `--header-h` (56→60px) y `--sidebar-w-collapsed`/`--sidebar-w-expanded` (52/280→72/300px) actualizados en
      un único sitio (`:root` de `src/estilos.css`); las ~15 reglas que ya posicionaban tooltips/leyendas/paneles
      flotantes con `calc(var(--header-h) + Npx)` se recolocan solas, sin tocarlas una a una.
- [x] El mapa, sus capas, leyendas y controles de zoom **no cambian de aspecto** (alcance de la Fase 3b) —
      verificado explícitamente en navegador.
- [x] `npm run typecheck`, `npm run build` (989 módulos) y `npm run test` (525/525) verdes.
- [x] Verificado en navegador (`npm run dev`, `/mapa`) en escritorio (1440) y móvil (375): TopBar, NavRail
      colapsado, SideMenu expandido (escritorio y drawer móvil), TabBar, botones de ajustes/campana/plegar/abrir,
      sin errores de consola — capturas comparadas contra `05-app-mapa-desktop.png` (chasis),
      `08-app-mapa-movil.png` y `03-componentes-png/side-menu.png`/`tab-bar.png`.

## 6.3 Criterios de aceptación — Fase 3b (mapa oscuro)

- [x] `OPENFREEMAP_STYLE` apunta al estilo `dark` oficial de OpenFreeMap (`src/main.ts`) — mismo proveedor/fuente
      `openmaptiles` que `liberty` (CLAUDE.md §5 intacto), verificado con llamada real: fondo `rgb(12,12,12)`
      (≈ `--bg`), **sin capa de POI** (cumple "sin etiquetas POI" del diseño sin tocar nada), sin coste de
      licencia.
- [x] `aplicarPaletaMirall()` (nuevo, `src/main.ts`) afina agua/parques/fondo hacia los tokens de marca tras el
      `load` del mapa — no se reescriben las 47 capas del estilo, solo las que más se notaban a simple vista.
      Bug real encontrado y corregido en el camino: `landcover_wood` trae de serie un `fill-pattern` roto
      (sprite `wood-pattern` no carga, *quirk* propio del estilo `dark`, no de este código) que ganaba al
      `fill-color` — había que limpiarlo explícitamente para que el tinte se viera.
- [x] Controles de zoom nativos de MapLibre (`NavigationControl`) restilados vía CSS (tarjeta `--surface`,
      iconos invertidos a blanco) — compás retirado (`showCompass:false`, el mapa no rota, sobraba un botón).
      "Centrar en mi ubicación" (`locate-fixed` del diseño) **omitido**: añadir un segundo punto de entrada de
      geolocalización además de "Cerca de mí" (spec 012) es una decisión de UX que no corresponde improvisar en
      una fase visual.
- [x] Panel de capas (`#controls`, spec 033), barra de cifras (`.kpi-chip`, spec 034), chip de foco de distrito
      (spec 036) y los dos tooltips bespoke de marcador (incidencias de vía pública spec 026, buses EMT spec
      055) recoloreados sobre los tokens Mirall v2 — **solo color**, sin tocar su estructura/iconos (ver
      "Fuera de alcance" si se quiere ir más allá).
- [x] Acento global de controles neutros (`input[type=checkbox]`) pasa de `--mirall-acento` (teal, spec 053) a
      `--accent` (lima) — coherente con la landing y el chasis. El resto de usos de `--mirall-acento`/
      `--mirall-navy` (modal de alertas, toast de PWA, paneles de `/inteligencia`) se quedan fuera de esta
      fase a propósito, no son "chasis del mapa".
- [x] Barra de cifras: las métricas de la captura ("Carril bici 84,0 km", "Árboles plantados 312") no tienen
      fuente de datos real — se mantienen las 4 cifras reales que ya existían (spec 034: Aire/Tráfico/Pulso/
      Alertas) con el nuevo aspecto visual, mismo criterio que las métricas de la landing (Fase 2).
- [x] `npm run typecheck`, `npm run build` y `npm run test` (525/525) verdes.
- [x] Verificado en navegador (`npm run dev`, `/mapa`) en escritorio (1440): mapa oscuro con calles/agua/zonas
      verdes legibles, panel de capas, barra de KPI, controles de zoom, todo recoloreado, sin errores de
      consola. En móvil (375) la captura de pantalla salió en negro por el mismo problema ya documentado en
      `050`-`052`/`055` (`document.hidden` persistente en este entorno) — confirmado que **no** es un fallo
      real comprobando las dimensiones reales del canvas (750×1408, correctas).

## 6.4 Criterios de aceptación — Fase 4, fila 1 "Prioridad" (Recomendaciones + Señales)

La pantalla más grande del documento (§8.5, 12 tipos de tarjeta en 4 filas) se implementa fila por fila, no de
una vez — mismo criterio que partió la Fase 3. Esta sesión cierra la fila 1, la de mayor prioridad visual.

- [x] Cabecera de página nueva (`src/ui/inteligencia-cabecera.ts`): eyebrow "CAPA DE INTELIGENCIA · VALÈNCIA" +
      título "Qué está pasando en la ciudad" + subtítulo con fecha/hora reales y el rollup de frescura real
      (`onCambioFrescura`, "N fuentes abiertas, M en vivo") + chips de filtro (Todo/Movilidad/Clima/Ruido/
      Eventos/Institucional) — infraestructura para las filas 2-4, que etiquetarán sus tarjetas con
      `data-categoria`; las de la fila 1 no llevan categoría (siempre visibles, no tiene sentido que una
      recomendación de prioridad desaparezca al filtrar por "Clima").
- [x] "Recomendaciones de actuación" (`src/ui/recomendaciones-actuacion-panel.ts`) reescrita como `DataCard`
      destacado (borde lima) con pestañas "Recomendaciones IA" / "Apoyo a decisión" — fusiona spec `041`
      dentro, tal y como pide explícitamente el documento (§8.5, nota de tarjetas sin diseño propio). Prioridad
      visual (PRIORIDAD ALTA/MEDIA/SIN RIESGO + borde izquierdo de color) mapeada desde el campo real
      `tipoActuacionSugerida` — no existe un campo de prioridad de 3 niveles en el modelo; el mapeo es
      editorial y está documentado en el propio código, no es un dato que invente el modelo. Solo la pestaña
      de Apoyo a decisión lleva "Ver en el mapa" (tiene `centroide` real); las recomendaciones de la IA no.
- [x] "Señales" (`src/ui/senales-ia-panel.ts`) reescrita como `DataCard` con badge "EN VIVO" y filas de color
      por severidad (`--danger`/`--warning`/`--accent`), reutilizando `.mv2-row` del catálogo de la Fase 1.
- [x] **Bug real encontrado y corregido** en el componente base de la Fase 1 (`.mv2-card__meta`,
      `src/mirall-v2.css`): no podía encogerse (`flex-shrink:0`), así que una fuente con nombre largo
      ("Correlación interna (sin IA)") empujaba el título de la tarjeta a ~26px de ancho — ilegible. Corregido
      con `flex:0 1 auto` + ellipsis; beneficia a cualquier tarjeta futura con una fuente de nombre largo, no
      solo a esta. Nuevo helper compartido `metaFrescuraCorta()` (`panel-utils.ts`) para el meta compacto de
      cabecera de `DataCard` (el `metaFrescura()` existente, con fecha absoluta entre paréntesis, es demasiado
      largo para ese hueco — se queda para pies de panel que no se han convertido todavía).
- [x] `main.ts`/`layout-movil.ts`/`estilos.css`: `montarApoyoDecisionPanel()` retirado (ya no es panel propio),
      orden de `/inteligencia` reescrito para que la fila 1 vaya siempre primera (`order:1`/`order:2`, antes de
      cámaras DGT y las cajas de emergencia meteo), sin tocar las filas 2-4 todavía (conservan su tarjeta
      clara de serie hasta que les llegue su fase).
- [x] `npm run typecheck`, `npm run build` y `npm run test` (525/525) verdes.
- [x] Verificado en navegador (`npm run dev`, `/mapa#/inteligencia`) en escritorio y móvil: cabecera, las dos
      tarjetas de la fila 1 con datos reales, cambio de pestaña Recomendaciones↔Apoyo a decisión, sin errores
      de consola (confirmado por inspección directa del DOM tras un bug espurio de caché de consola del propio
      entorno de pruebas, no de la aplicación).

## 6.5 Criterios de aceptación — Fase 4, fila 2 "Clima y terreno"

- [x] "Meteorología por zona" (`src/ui/emergencia-meteo-panel.ts`, `montarMeteorologiaZonaPanel`) fusiona
      AVAMET (estaciones reales) + Open-Meteo por distrito (modelo) + pluviómetros SAIH (reales) en una tarjeta
      de 3 pestañas. El documento solo pide 2 ("Estaciones reales" | "Distritos modelo") — se añade una
      tercera en vez de meter los pluviómetros reales dentro de la pestaña "modelo", que sería inexacto.
      Pestaña AVAMET con tabla ESTACIÓN/TEMP. (barra + valor, naranja ≥28,5°C)/VIENTO/LLUVIA, igual que §8.5.3.
- [x] "Altimetría por distrito" ordenada de más alto a más bajo (antes no se ordenaba explícitamente), barras
      lima con tinte azul para distritos <8m, igual que §8.5.4.
- [x] "Riesgo de acumulación de agua" — **el documento pide un badge único "NIVEL ACTUAL: Bajo/Medio/Alto",
      pero el modelo real (spec 046 §3) rechaza deliberadamente las bandas fijas** ("con 19 distritos, cortes
      fijos son arbitrarios y se confunden con niveles oficiales de Protección Civil/AEMET" — decisión ya
      tomada con el asesor de ciencia de datos). Se adapta el bloque destacado al modelo real: "Sin lluvia
      activa" cuando ningún distrito está `activo`, o el índice ordinal máximo de los distritos con lluvia en
      curso — nunca una banda inventada que contradiga una decisión metodológica ya cerrada.
- [x] `montarLluviaVientoDistritoPanel`/`montarTemperaturaZonaPanel` retiradas (fusionadas), `main.ts`/
      `layout-movil.ts`/`estilos.css` actualizados (ids, orden de la fila, grupo "Clima e y terreno" con
      `flex`/anchos del documento: Meteorología + Altimetría a flex, Riesgo a 360px fijo).
- [x] `npm run typecheck`, `npm run build` y `npm run test` (525/525) verdes.
- [x] Verificado en navegador (`npm run dev`, `/mapa#/inteligencia`) en escritorio: las 3 tarjetas con datos
      reales, pestañas de Meteorología funcionando, Altimetría ordenada con el tinte azul correcto en los 2
      distritos más bajos, Riesgo mostrando "Sin lluvia activa" (estado real del día de la verificación).
      `read_console_messages` de esta sesión mostró errores obsoletos acumulados de ediciones anteriores
      (mismo timestamp repetido tras varias recargas reales) — confirmado que no son reales inspeccionando el
      DOM en vivo directamente; limitación ya conocida de herramienta, no de la aplicación.

## 6.6 Criterios de aceptación — Fase 4, fila 3 "Movilidad y actividad"

- [x] "Cámaras en vías de acceso" (`src/ui/camaras-panel.ts`, `montarCamarasAccesoPanel`) fusiona las cámaras
      externas de la DGT (spec `043`) y las cámaras de Valencia ciudad (spec `038`) en una única `DataCard` con
      pestañas "Accesos (DGT)" | "Ciudad" — el propio documento de diseño (§8.5, nota explícita) pide esta
      fusión. Nuevo id `#camaras-acceso-panel`; se conserva sin cambios la lógica de reproducción (`reproducirDash`,
      `iframeYoutubeCanal`, "clic para reproducir" en Ciudad; refresco automático cada ~2 min en DGT).
- [x] "Ruido en Russafa (ZAS)" (`renderSonometrosRuzafaPanel`, spec `049`) rediseñada como `DataCard`: barras
      horizontales por sonómetro (nivel medio diario LAeq, orden descendente) con línea de umbral visual a 65
      dBA — el documento no especifica el valor exacto del umbral acústico de ZAS, se usa el límite diurno
      genérico de zona saturada como referencia visual, sin pretender ser el límite legal exacto de cada tramo
      horario.
- [x] "Agenda de eventos" (`buildAgendaPanel`/`renderAgendaPanel`, spec `027`) rediseñada como `DataCard` con
      clases `.agenda-item*` propias (deliberadamente no comparte clases con `.media-panel__*`, que pertenece a
      tarjetas de la fila 4 todavía sin convertir) — agrupación por distrito y aviso destacado "⚠ Impacto en vía
      pública" intactos.
- [x] `main.ts`/`layout-movil.ts`/`estilos.css` actualizados: ids viejos (`#camaras-panel`, `#camaras-dgt-panel`)
      retirados de todas partes (orden de `/inteligencia`, reparenting móvil, CSS de la vista flotante de
      `/mapa` — bloque entero eliminado porque la tarjeta fusionada ya no flota, solo vive en `/inteligencia`);
      `idsInteligencia` en `main.ts` actualizado. Orden de fila 3 en escritorio: Cámaras (flex) / Ruido ZAS
      (flex) / Agenda (400px fijo), igual que fila 2 siguió el patrón flex/fijo del documento.
- [x] **Bug real encontrado y corregido, fuera de las 3 tarjetas de esta fila:** el orden de reparenting del
      bottom sheet móvil (`IDS_REPARENTABLES` en `layout-movil.ts`) nunca se había alineado con el orden de
      prioridad por filas que ya regía en escritorio desde la fila 1 — en móvil aparecía primero "Contexto
      mediático" (fila 4, sin convertir) en vez de "Recomendaciones de actuación" (fila 1). Corregido para
      todas las tarjetas ya convertidas (filas 1-3): el orden de inserción en el DOM ahora replica el `order`
      de escritorio. Verificado en navegador (viewport móvil 375×812): "Recomendaciones de actuación" aparece
      primera en el sheet tras el fix.
- [x] `npm run typecheck`, `npm run build` y `npm run test` (525/525) verdes.
- [x] Verificado en navegador (`npm run dev`, `/mapa`, pestaña "Inteligencia") en escritorio: las 3 tarjetas con
      datos reales — pestañas DGT/Ciudad de Cámaras funcionando (carreteras agrupadas, imágenes LIVE), barras de
      Ruido ZAS con los 16 sonómetros reales, Agenda con eventos agrupados por distrito y aviso de impacto vial
      — y en móvil (viewport 375×812): las 3 tarjetas se reparentan al bottom sheet en el orden correcto de
      prioridad junto con el resto de filas 1-2.

## 6.7 Criterios de aceptación — Fase 4, fila 4 "Contexto" (última fila)

- [x] "Actualidad institucional" (`src/ui/actualidad-redes.ts`, sin cambios internos) envuelta en `DataCard`
      (`#actualidad-redes-panel`, spec `039`) — meta "{N} cuentas" en la cabecera, contenido (fichas en
      acordeón, carga diferida de los SDK de Facebook/X) intacto.
- [x] "Contexto mediático" (`buildMediaPanel`/`renderMediaticoPanel`, spec `009`) rediseñada: meta corta
      (`metaFrescuraCorta`) en la cabecera, "próxima actualización"/fuentes fallidas movidas a un pie opcional
      (`.mv2-card__fuente`, solo se muestra si hay algo que decir) para no desbordar la cabecera.
- [x] "Términos en tendencia" (`buildTendenciaPanel`/`renderTendenciaPanel`, spec `025`) rediseñada — **el
      documento pide un selector de 3 rangos ("Última hora / Hoy / 7 días"), pero `VentanaTiempo` (spec 025)
      solo calcula 2 ventanas reales** (`hora`/`dia`); se mantiene el selector real de 2 opciones en vez de
      ofrecer una ventana de 7 días que el servicio no soporta, documentado en el propio código.
- [x] "Protocolos de actuación" (`src/ui/protocolos-panel.ts`, spec `042`) rediseñada — **el documento pide una
      pill de estado por protocolo (Activo/Vigilancia/En reposo), pero `ProtocoloActuacion` no modela ningún
      estado**: es contenido de referencia estático versionado en el repo, no un protocolo con seguimiento en
      vivo que alguien active/desactive desde la app. Inventar la pill fingiría una monitorización que no
      existe — se omite; la fecha de "última revisión" (ya presente desde spec 042) sigue siendo la señal real
      de vigencia del contenido.
- [x] Las 4 tarjetas comparten flex-basis igual (`flex: 1 1 320px`, `max-height: 70vh`) — "4 iguales" según el
      documento §8.5. Orden de fila 4 en escritorio y en el bottom sheet móvil: Actualidad institucional →
      Contexto mediático → Términos en tendencia → Protocolos de actuación, igual que el documento.
- [x] Bloques CSS muertos retirados: posicionamiento absoluto heredado de `#media-panel`/`#tendencia-panel`
      (cuando flotaban sobre `/mapa`, antes de spec 040) y el grupo de tarjeta clara de serie que compartían
      `#actualidad-redes-panel`/`#protocolos-panel`. `.media-panel__*` (item/chip/grupo-título) y
      `.red-entidad*`/`.protocolo*` restyleados a los tokens oscuros de Mirall v2 — se mantienen esas clases
      (no se duplican como `.agenda-item*` en la fila 3) porque `#movilidad-avisos-panel` (spec 048, fuera de
      la tabla 8.5 del documento, no asignada a ninguna fila) las sigue usando sin wrapper `.mv2-card`.
- [x] `npm run typecheck`, `npm run build` y `npm run test` (525/525) verdes.
- [x] Verificado en navegador (`npm run dev`, `/mapa`, pestaña "Inteligencia") en escritorio: las 4 tarjetas
      con datos/contenido reales — Actualidad institucional con las 13 fichas de entidad, Contexto mediático
      con titulares agrupados por distrito, Términos en tendencia con el selector hora/día funcionando,
      Protocolos con el acordeón "Lluvias intensas" — y en móvil (viewport 375×812): las 4 se reparentan al
      bottom sheet en el orden correcto, detrás de las filas 1-3.
- [x] Con esta fila, **Fase 4 completa** (las 4 filas de la rejilla de Inteligencia implementadas). Queda la
      Fase 5 (Configuración de ciudad + pantallas móviles nuevas "Barrios"/"Capas" + pase de accesibilidad
      WCAG 2.2 AA) para que la spec 056 pase a `Implemented` por completo.

## 6.8 Criterios de aceptación — Fase 5 (Configuración, Barrios, Capas, accesibilidad)

Última fase de la spec — con esta, el rediseño completo del documento (§8.1-§8.7) queda implementado.

- [x] **Configuración de ciudad** (sección "Configuración" del `SideMenu`, spec `019`) — 4 celdas de estadística real (no las 5 del documento): Fuentes de datos (`onCambioFrescura`, el mismo rollup del TopBar), Distritos con geometría, Capas activas N/M (en vivo, cuenta real de checkboxes de `#controls`), Anonimización. "Sensores conectados: 1.284" y "Frecuencia: 2 min" del documento no tienen respaldo real (no hay un contador de sensores ni una cadencia única — cada capa sondea a su propio intervalo) — se omiten en vez de inventarlos. Sin Guardar/Descartar: cada ajuste ya se aplica al instante, añadir un estado "borrador" sería fricción nueva sin beneficio real. Sigue viviendo como sección del `SideMenu`, no como módulo de página propia (consistencia con las otras 4 "herramientas" ya establecida en Fase 3a).
- [x] **Pantalla móvil "Capas"** (`TabBar`, 4ª pestaña) — reutiliza el mismo `#controls` real (sin reescribir su lógica), con tratamiento de pantalla completa solo por CSS (`:root[data-layout='movil'][data-vista='capas'] #info-panels > #controls`, `position:fixed` por encima del mapa/hoja, bajo el `TabBar`) mientras esa pestaña está activa — nunca se reparenta ni se duplica el nodo. Botón real "Restablecer" nuevo (`rotate-ccw`): apaga todas las capas encendidas disparando el `change` real de cada una. En escritorio/tablet, `#/capas` no tiene pantalla dedicada (el documento no la prevé fuera de móvil) — se trata como alias de `mapa`.
- [x] **Pantalla móvil "Barrios"** (`TabBar`, 3ª pestaña, `src/ui/barrios-panel.ts`) — **adaptación honesta decidida explícitamente con el usuario (2026-10-14)**: el documento pide un ranking por "puntuación de bienestar" 0-100 con desglose Aire/Ruido/Tráfico por barrio; no existe ese dato real — el aire es una única lectura de ciudad (spec `002`), el ruido solo cubre Russafa (16/19 zonas, spec `049`), y Pulso de Distrito (spec `010`) es un indicador de escenarios, no una puntuación continua. Se lista los 19 distritos reales con las 3 señales que sí son por distrito hoy — Pulso (nivel de escenario activo, color real), Altimetría (spec `052`) y Riesgo de acumulación de agua (spec `046`) — bajo el título honesto "ordenados por situación", no "por bienestar". Pestaña "Ranking" (por nivel de Pulso, luego alfabético) y "Cerca de mí" (geolocalización explícita y no persistida, mismo patrón que `buildProximidadContent`, spec `012`). Tocar un distrito fija el foco real (`setFocoDistrito`, spec `036`) y navega a `/mapa`. Pulso/Riesgo/Altimetría son, de serie, capas de mapa que solo se piden al marcar su casilla — la pantalla arranca su carga por el mismo cauce real (`startPolling`/flags "ya cargado") al entrar, sin marcar la casilla ni duplicar la petición si la capa ya estaba activa.
- [x] **Pase de accesibilidad WCAG 2.2 AA** (transversal, todo lo construido en Fases 1-5):
  - Auditoría de nombre accesible sobre every control interactivo visible, escritorio y móvil, en las 4 vistas + `SideMenu` + drawer móvil: 2 problemas reales encontrados y corregidos — el slider de hora de la capa mock (`#hora-slider`, sin `aria-label`) y los 4 botones "reproducir" de las cámaras de Valencia ciudad (icono solo, sin nombre por cámara). Verificado limpio tras el fix en las 4 vistas × escritorio/móvil.
  - **Hallazgo real y corregido fuera del alcance original de la auditoría**: `--text-muted` (#5c635e, token de Fase 1, valor literal del documento de diseño) no pasaba 4.5:1 en ningún fondo real de la app (2.73-3.18:1 sobre `--bg`/`--surface`/`--surface-2`) — usado en ~48 sitios (metadatos de tarjeta, iconos tenues, pies de página) desde la Fase 1. Aclarado a `#7f867f` (4.51-5.25:1 en los 3 fondos), decisión confirmada con el usuario en vez de dejarlo así o acercarlo tanto a `--text-secondary` que perdiera distinción visual entre ambos niveles. Cambio de un único token, se propaga solo (nadie más define `--text-muted` con un valor propio).
  - Resto de pares de color de la paleta (texto primario/secundario, acento, danger/warning/info sobre los 3 fondos) verificados por encima de 4.5:1 — sin más hallazgos.
  - Pendiente, fuera de esta pasada (no bloqueante para cerrar la spec, pero no auditado): navegación completa solo-teclado de cada componente nuevo (segmentados, acordeones), lector de pantalla real (NVDA/VoiceOver) sobre las pantallas nuevas, y zoom de texto al 200%.
- [x] `npm run typecheck`, `npm run build` y `npm run test` (525/525) verdes en cada paso.
- [x] Verificado en navegador: Configuración (escritorio, SideMenu) con las 4 cifras reales; Capas (móvil) a pantalla completa con Restablecer funcionando; Barrios (móvil) con 19 filas reales, pestaña Cerca de mí, navegación a `/mapa` con foco real al tocar una fila; `#/capas`/`#/barrios` en escritorio se comportan como `mapa`; contraste de `--text-muted` confirmado visualmente tras el cambio (sin aspecto "demasiado brillante" ni pérdida de jerarquía).

## 7. Riesgos

- Verificación visual en este entorno ya documentada como punto débil en otras specs (bug de render
  intermitente de MapLibre GL v6 + deck.gl, specs `050`/`051`/`052`/`055`) — no afecta a esta spec (sin mapa
  todavía), pero es la razón de ser especialmente explícito en la verificación manual de cada fase futura.
- El prefijo `mv2-` es deuda técnica deliberada y temporal: si una fase futura se abandona a medio camino, deja
  dos sistemas de componentes convivientes. Mitigación: no empezar una fase sin cerrar la anterior.

## 8. Fuente de verdad visual

Copiada al repo en `docs/diseño/mirall-v2/` (`00-PROMPT-IMPLEMENTACION.md` + `02-pantallas-png/` +
`03-componentes-png/`, ~17 MB) al empezar la Fase 3, tras el hallazgo real de la Fase 2: el pendrive externo
(`/Volumes/DATAWORK/Mirall-Urban-Intelligence-Platform/`) se desmontó solo a media sesión sin que nadie lo
expulsara a mano, lo que bloqueaba la copia hasta volver a montarlo. Ya no depende del pendrive para las fases
3-5.

## 9. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-10-08 | Creación — Fase 1 (tokens + componentes base) implementada |
| 2 | 2026-10-08 | Fase 2 (landing pública) implementada — ver §6.1. Refactor no planeado: tokens/componentes extraídos a `src/mirall-v2.css` compartida. El pendrive de diseño se desmontó solo a media sesión (§8) |
| 3 | 2026-10-08 | Fase 3a (chasis de la app) implementada — ver §6.2. Paquete de diseño copiado al repo (`docs/diseño/mirall-v2/`), ya no depende del pendrive. Fase 3 dividida en 3a (chasis, esta) / 3b (mapa oscuro + barra de cifras) por tamaño — mismo criterio que separó las Fases 1 y 2 |
| 4 | 2026-10-08 | Fase 3b (mapa oscuro) implementada — ver §6.3. Estilo `dark` oficial de OpenFreeMap (mismo proveedor), afinado con `aplicarPaletaMirall()`; bug real de `fill-pattern` roto en `landcover_wood` corregido en el camino. Fase 3 completa |
| 5 | 2026-10-09 | Fase 4, fila 1 "Prioridad" implementada — ver §6.4. Cabecera de página nueva + Recomendaciones de actuación (con Apoyo a decisión fusionado como pestaña) + Señales, como `DataCard`. Bug real corregido en el componente base de la Fase 1 (`.mv2-card__meta` no se encogía). Quedan las filas 2-4 (10 tarjetas más) |
| 6 | 2026-10-09 | Fase 4, fila 2 "Clima y terreno" implementada — ver §6.5. Meteorología por zona (AVAMET + Open-Meteo + SAIH fusionados, 3 pestañas) + Altimetría (ordenada, tinte azul <8m) + Riesgo de acumulación de agua, como `DataCard`. El badge de nivel único del documento se adapta al ranking ordinal real (spec 046 §3 ya había rechazado las bandas fijas). Quedan las filas 3-4 (7 tarjetas más) |
| 7 | 2026-10-09 | Fase 4, fila 3 "Movilidad y actividad" implementada — ver §6.6. Cámaras en vías de acceso (DGT+Ciudad fusionadas en pestañas, specs 038+043) + Ruido en Russafa ZAS (barras con umbral, spec 049) + Agenda de eventos (spec 027), como `DataCard`. Bug real corregido fuera de estas 3 tarjetas: el orden del bottom sheet móvil no seguía la prioridad por filas de escritorio — ahora sí, para las filas 1-3. Queda la fila 4 "Contexto" (4 tarjetas más) |
| 8 | 2026-10-14 | Fase 4, fila 4 "Contexto" implementada — ver §6.7. Actualidad institucional (spec 039) + Contexto mediático (spec 009) + Términos en tendencia (spec 025, selector real de 2 ventanas en vez de las 3 del documento) + Protocolos de actuación (spec 042, sin pill de estado inventada), como `DataCard`. **Fase 4 completa** (las 4 filas de Inteligencia). Queda la Fase 5 (Configuración de ciudad, pantallas móviles nuevas, accesibilidad) |
| 9 | 2026-10-14 | **Fase 5 implementada — ver §6.8. Rediseño completo del documento, cerrado.** Configuración de ciudad (4 cifras reales, no las 5 fabricadas del documento); `TabBar` a 5 pestañas con las pantallas móviles nuevas "Capas" (mismo `#controls` real, pantalla completa por CSS) y "Barrios" (ranking honesto de los 19 distritos por Pulso/Altimetría/Riesgo de agua real, sin la puntuación de bienestar inventada del documento — decisión explícita del usuario); pase de accesibilidad WCAG 2.2 AA (2 nombres accesibles corregidos + hallazgo real: el token `--text-muted` de Fase 1 no pasaba 4.5:1 en ningún fondo, aclarado de `#5c635e` a `#7f867f` en los ~48 sitios que lo usan). `estado` pasa a `Implemented` |
