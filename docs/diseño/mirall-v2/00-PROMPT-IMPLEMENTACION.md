# Mirall — Urban Intelligence Platform
## Especificación de diseño y prompt de implementación

> **Versión:** 1.0 · 8 de octubre de 2026
> **Ámbito:** landing pública (desktop, tablet, móvil) + aplicación (Mapa, Inteligencia, Configuración; desktop y móvil)
> **Fuente de verdad visual:** `05-fuente-pen/Mirall-Urban-Intelligence-Platform.pen` (abrir con pen.dev) y las capturas de `02-pantallas-png/`.
> **Idioma de la interfaz:** español (topónimos en valenciano: *València, Ciutat Vella, Russafa, Plaça de l'Ajuntament…*).

---

## 0. Cómo usar este documento

Este archivo está escrito para dárselo **tal cual** a un equipo de desarrollo o a un agente de código (Claude Code, Cursor, etc.). La sección 1 es el *prompt* propiamente dicho; el resto es la especificación detallada a la que el prompt hace referencia. Las capturas PNG numeradas son la referencia visual obligatoria: ante cualquier duda entre texto y captura, **manda la captura**.

---

## 1. Prompt

```text
Actúa como un equipo senior de producto (front-end lead + diseñador de sistemas + ingeniero de datos
geoespaciales). Vas a implementar la interfaz de "Mirall — Urban Intelligence Platform", una plataforma
cívica que convierte datos públicos dispersos de València (tráfico, meteorología, calidad del aire,
ruido, eventos, comunicados institucionales) en una representación coherente de la ciudad en tiempo real.

Objetivo: reproducir con fidelidad píxel a píxel las pantallas descritas en
"00-PROMPT-IMPLEMENTACION.md" y en las capturas de "02-pantallas-png/", usando los tokens de diseño de la
sección 5 sin inventar colores, tamaños ni tipografías nuevas.

Requisitos no negociables:
1. Tema oscuro único: fondo #0A0C0B, acento lima #C8F03C reservado a acciones primarias, estado "en vivo"
   y valores positivos destacados. Nunca usar el acento como decoración.
2. Tipografías: Inter Tight (titulares y cifras), Inter (texto), JetBrains Mono (etiquetas, metadatos,
   unidades, horas). Cifras siempre con números tabulares.
3. Responsive real con tres puntos de corte (móvil < 768, tablet 768–1279, desktop >= 1280). En móvil y
   tablet los menús se pliegan: hamburguesa en la landing, barra de pestañas + menú lateral (drawer) en la app.
4. El fondo del hero de la landing es una escena 3D en Three.js (sección 8.2) con fallback a imagen
   estática, respeto a prefers-reduced-motion y pausa fuera de pantalla.
5. Cada tarjeta de datos muestra su fuente y su antigüedad ("AVAMET · hace 3 min") y tiene estados de
   carga, vacío, error y dato desactualizado (sección 10).
6. Todo contenido generado por IA lleva el aviso: "Generado por IA a partir de señales públicas. No
   sustituye el criterio profesional ni autoriza ninguna actuación por sí sola."
7. Accesibilidad WCAG 2.2 AA (sección 13): navegación por teclado completa, foco visible lima,
   contraste mínimo 4.5:1 en texto de cuerpo, información nunca codificada solo por color.
8. Componentes reutilizables (sección 7) antes que pantallas. Ninguna pantalla debe duplicar estilos.

Stack recomendado (sección 4): React + TypeScript + Vite (o Next.js), Tailwind CSS v4 con los tokens como
variables CSS, MapLibre GL para el mapa, Three.js para el hero, lucide-react para iconografía.

Entrega por fases: (1) tokens + componentes base con Storybook, (2) landing responsive con hero 3D,
(3) app Mapa, (4) app Inteligencia, (5) Configuración y estados. Al terminar cada fase, compara tu
implementación con la captura correspondiente y corrige diferencias de espaciado, tamaño y color.
```

---

## 2. Producto

| | |
|---|---|
| **Nombre** | Mirall |
| **Descriptor** | Urban Intelligence Platform |
| **Significado** | *Mirall* = «espejo» en valenciano. La ciudad se mira a sí misma. |
| **Ciudad piloto** | València (19 distritos, foco inicial en Ciutat Vella, Russafa, Quatre Carreres) |
| **Propuesta** | «La ciudad no necesita otro Goliat. Necesita un espejo.» Datos abiertos y verificables frente a plataformas cerradas. |
| **Usuarios** | Vecinos (landing + mapa), técnicos municipales y operadores (capa de Inteligencia). |
| **Web actual** | https://vlc-monitor.vercel.app/ · Código: github.com/robervx/mirall |
| **Contacto** | mirall.urbanintelligence@gmail.com |

### 2.1 Lockup de marca
- **Símbolo:** cuadrado lima `#C8F03C` con radio 8 px (28×28 en landing, 26×26 / radio 7 en la barra de la app, 36×36 / radio 10 en el menú lateral) y el icono `scan-eye` (lucide) centrado en `#0A0C0B` a ~57 % del lado.
- **Logotipo:** «Mirall» en Inter Tight 700, 18 px (16 px en la app), tracking −0,3 px, interlineado 1,1.
- **Descriptor:** «URBAN INTELLIGENCE PLATFORM» en JetBrains Mono 9 px, tracking 1,1 px, color `--text-secondary`, debajo del logotipo con 1 px de separación.
- Separación símbolo–texto: 10 px. El descriptor no se elimina en móvil.

---

## 3. Inventario de pantallas

| # | Pantalla | Tamaño de diseño | Captura |
|---|---|---|---|
| 1 | Landing · Desktop | 1440 × 1781 | `02-pantallas-png/01-landing-desktop.png` |
| 2 | Landing · Tablet | 768 × 2077 | `02-landing-tablet.png` |
| 3 | Landing · Móvil | 390 × 2633 | `03-landing-movil.png` |
| 4 | Landing · Móvil · Menú abierto | 390 × 844 | `04-landing-movil-menu-abierto.png` |
| 5 | App · Mapa · Desktop | 1440 × 960 | `05-app-mapa-desktop.png` |
| 6 | App · Inteligencia · Desktop | 1440 × 2355 | `06-app-inteligencia-desktop.png` |
| 7 | App · Configuración de ciudad · Desktop | 1440 × 234 (módulo) | `07-app-configuracion-ciudad-desktop.png` |
| 8 | App · Mapa · Móvil | 390 × 844 | `08-app-mapa-movil.png` |
| 9 | App · Inteligencia · Móvil | 390 × 844 | `09-app-inteligencia-movil.png` |
| 10 | App · Barrios · Móvil | 390 × 844 | `10-app-barrios-movil.png` |
| 11 | App · Capas · Móvil | 390 × 844 | `11-app-capas-movil.png` |
| 12 | App · Menú lateral · Móvil | 390 × 844 | `12-app-menu-lateral-movil.png` |
| C1 | Componente · Status Bar (solo maqueta iOS, **no implementar en web**) | 390 × 48 | `03-componentes-png/status-bar.png` |
| C2 | Componente · Tab Bar | 390 × 85 | `tab-bar.png` |
| C3 | Componente · Side Menu | 300 × 796 | `side-menu.png` |

**Pendiente de diseño (definir con reglas de la sección 9):** App · Mapa e Inteligencia en tablet.

---

## 4. Stack técnico recomendado

| Capa | Recomendación | Motivo |
|---|---|---|
| Framework | React 19 + TypeScript, Vite (SPA) o Next.js (si se quiere SSR para la landing) | La web actual ya es Vite. |
| Estilos | Tailwind CSS v4 con `@theme` alimentado por los tokens de la sección 5 | Un solo origen de verdad. |
| Mapa | MapLibre GL JS con estilo vectorial oscuro propio (ver 8.4) | Libre, sin licencias (coherente con «0 € en licencias»). |
| 3D | Three.js r16x (escena del hero, sección 8.2) | Ya usado en la web actual. |
| Iconos | `lucide-react` (trazo 1,75–2 px) | Todos los iconos del diseño son Lucide. |
| Gráficas | Barras con HTML/CSS (flex) o `visx`; no hace falta una librería pesada | Todas las gráficas son barras horizontales/verticales simples. |
| Datos | TanStack Query con `refetchInterval` por fuente | Cada fuente tiene cadencia propia. |
| Fechas | `Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid' })` | Formato «Miércoles, 07 de octubre de 2026». |
| Números | `Intl.NumberFormat('es-ES')` → `9.147`, `84,0`, `28,4°` | Separadores españoles en toda la UI. |

---

## 5. Design tokens

### 5.1 Color

```css
:root {
  /* Superficies */
  --bg:             #0A0C0B; /* fondo de página */
  --surface:        #121513; /* tarjetas, paneles, barra de pestañas */
  --surface-2:      #1A1E1B; /* elementos dentro de tarjetas, pista de barras, ítem activo */
  --border:         #262B28; /* todos los bordes y divisores (1 px) */

  /* Texto */
  --text-primary:   #F2F4EE;
  --text-secondary: #8C948E;
  --text-muted:     #5C635E; /* solo etiquetas mono >= 10 px y metadatos no esenciales */

  /* Marca */
  --accent:         #C8F03C; /* lima Mirall */
  --accent-ink:     #0A0C0B; /* texto/icono sobre lima */

  /* Semánticos */
  --danger:         #FF5A4E; /* prioridad alta, > umbral, tráfico denso */
  --warning:        #FFA63D; /* prioridad media, zona de vigilancia */
  --info:           #3DC5FF; /* movilidad (Valenbisi), emergencias informativas */
}
```

**Transparencias usadas (sufijo alfa hex):**

| Uso | Valor |
|---|---|
| Borde de tarjeta destacada (IA, modelo Mirall, «Tu barrio») | `#C8F03C40` – `#C8F03C55` |
| Fondo «Riesgo bajo» | `#C8F03C10` + borde `#C8F03C33` |
| Fondo de etiqueta «Tu barrio» | `#C8F03C22` |
| Pill «Impacto en vía pública» | fondo `#FF5A4E1F`, texto `--danger` |
| Pill de distrito | fondo `#3DC5FF1A`, texto `--info` |
| Aviso IA | fondo `#FFA63D14`, texto/icono `--warning` |
| Halo de marcador | color del marcador al 20 % (`…33`) |
| Barra de cifras sobre el mapa | `#121513E6` + `backdrop-filter: blur(16px)` |
| Nav de la landing sobre el hero | `#0A0C0B66` + `blur(12px)` |

**Reglas de color**
- El lima identifica **acción primaria**, **en vivo** y **dato positivo destacado** (p. ej. 9.147 vecinos, 0 €, bienestar 87). No se usa en bordes decorativos salvo en la tarjeta destacada de cada pantalla.
- Escala semántica de umbrales: `accent` (correcto) → `warning` (vigilar) → `danger` (superado). Siempre acompañada de texto o icono (no solo color).
- Gris de texto: primario para contenido, secundario para descripciones, muted solo para metadatos.

### 5.2 Tipografía

Google Fonts: `Inter Tight` 600/700, `Inter` 400/500/600, `JetBrains Mono` 400/500. Activar `font-variant-numeric: tabular-nums` en cifras, horas y tablas.

| Token | Familia | Tamaño / peso | Tracking | Interlineado | Uso |
|---|---|---|---|---|---|
| `display-xl` | Inter Tight | 76 / 700 | −2,5 px | 1,05 | H1 landing desktop |
| `display-l` | Inter Tight | 60 / 700 | −2 px | 1,05 | H1 landing tablet |
| `display-m` | Inter Tight | 44 / 700 | −1,2 a −1,4 px | 1,05 | H1 landing móvil, cifras de métricas |
| `title-xl` | Inter Tight | 32 / 700 | −0,8 px | auto | Título de página (Inteligencia) |
| `title-l` | Inter Tight | 28 / 700 | −0,6 px | auto | Título de pantalla móvil |
| `title-m` | Inter Tight | 24 / 700 | −0,5 px | auto | Título de Configuración |
| `title-s` | Inter Tight | 20 / 600 | 0 | auto | Título de tarjeta de la landing |
| `title-xs` | Inter Tight | 17–18 / 600 | 0 | 1,25 | Título de recomendación |
| `kpi-l` | Inter Tight | 36 / 700 | −1 px | 1 | KPI de la barra lateral |
| `kpi-m` | Inter Tight | 28–30 / 700 | −0,8 px | 1 | Cifras del mapa, Configuración, Barrios |
| `body-l` | Inter | 19 / 400 | 0 | 1,55 | Subtítulo del hero (17 tablet, 16 móvil) |
| `body` | Inter | 14–15 / 400–500 | 0 | 1,5 | Texto general, ítems de lista |
| `body-s` | Inter | 12–13 / 400 | 0 | 1,45 | Descripciones, metadatos en texto |
| `label-mono` | JetBrains Mono | 10–12 / 400 | 1–1,5 px, MAYÚSCULAS | auto | Eyebrows, cabeceras de sección, tipos de señal |
| `meta-mono` | JetBrains Mono | 11 / 400 | 0 | auto | Fuente + antigüedad, unidades, horas |

### 5.3 Espaciado, radios y elevación

- **Escala de espaciado (px):** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72, 96, 128, 150.
- **Márgenes de página:** desktop 64 (landing) / 32 (app); tablet 40; móvil 20–24 (landing) / 16–20 (app).
- **Radios:** 2 (barras), 5–7 (pestañas internas, chips cuadrados), 8 (inputs, botones de icono, ítems de lista), 10 (miniaturas, cajas de icono), 12 (KPI, celdas), 14 (tarjetas de la app), 16 (tarjetas de la landing), 20 (bottom sheet), `9999` (botones, pills, interruptores).
- **Bordes:** 1 px `--border` en todo. Divisores internos de lista: borde inferior de 1 px.
- **Sombras (mínimas):** tooltip del mapa `0 8px 24px #00000080`; drawer móvil `12px 0 40px #00000099`. No hay más sombras.

### 5.4 Breakpoints

| Nombre | Rango | Landing | App |
|---|---|---|---|
| `mobile` | < 768 px | Menú hamburguesa → pantalla completa; botones apilados | Barra de pestañas inferior + drawer |
| `tablet` | 768 – 1279 px | Hamburguesa + CTA visible; tarjetas apiladas | Rail + paneles plegables (ver 9) |
| `desktop` | ≥ 1280 px | Navegación completa | Rail + 3 columnas (Mapa) / rejilla (Inteligencia) |

Contenedor máximo: 1440 px centrado; por encima, el fondo continúa a sangre.

---

## 6. Iconografía

Lucide, tamaños 14/15/16/17/18/19/20 px según contexto, color heredado del texto. Correspondencias principales:

| Concepto | Icono | Concepto | Icono |
|---|---|---|---|
| Marca | `scan-eye` | Inteligencia | `brain-circuit` |
| Mapa | `map` | Cerca de mí | `locate` / `map-pin` |
| Cordón de incidente | `flame` | Gemelo digital | `box` |
| Glosario | `book-open` | Configuración | `settings` |
| Menú | `menu` | Cerrar | `x` |
| Plegar menú | `panel-left-close` | Selector de ciudad | `chevrons-up-down` |
| Calidad del aire | `wind` | Ruido | `volume-2` / `audio-lines` |
| Tráfico | `car` | Valenbisi | `bike` |
| Obras | `construction` | Zonas verdes | `trees` |
| Incidencias vecinales | `message-circle` | Presupuesto participativo | `landmark` |
| Recomendaciones IA | `sparkles` | Señales | `radio-tower` |
| Meteorología | `thermometer` | Altimetría | `mountain` |
| Agua | `droplets` | Cámaras | `cctv` |
| Eventos | `calendar-days` | Prensa | `newspaper` |
| Tendencias | `trending-up` | Protocolos | `shield-check` |
| Aviso | `triangle-alert` | Enlace externo | `arrow-up-right` |

---

## 7. Componentes

> Implementar cada uno con sus variantes y estados (`default`, `hover`, `focus-visible`, `active`, `disabled`). **Hover:** subir un paso de superficie (`surface` → `surface-2`) o, en botones lima, aclarar el lima un 6 %. **Foco:** anillo de 2 px `--accent` con 2 px de separación.

### 7.1 Botones
| Variante | Estilo |
|---|---|
| `primary` | Fondo `--accent`, texto `--accent-ink` Inter 600. Pill. Landing: padding 16×26, 16 px, icono `arrow-right` 18 px a la derecha, gap 10. Nav: padding 10×18, 14 px. |
| `secondary` | Transparente, borde 1 px `--border`, texto primario 500. Icono opcional a la izquierda (`file-text`). |
| `icon` | 36–40 px, radio 8 (app) o círculo (landing/móvil), borde `--border`, icono 16–18 px `--text-secondary`. |
| `pill-small` | Padding 8×12, 13 px, borde; con `arrow-up-right` 14 px (acciones de recomendación). |

### 7.2 Chip de filtro
Pill, padding 8×14 (7×13 en móvil), 13 px 500. **Activo:** fondo `--text-primary`, texto `--bg`. **Inactivo:** borde `--border`, texto secundario. En móvil la fila hace scroll horizontal con el margen izquierdo de la página y sangra por la derecha.

### 7.3 Control segmentado / pestañas
Contenedor `--surface` (o `--surface-2` dentro de tarjetas), padding 3–4, radio 7–10. Pestaña: padding 5–8 × 10–16, radio 5–7. Activa: fondo `--surface-2` (o `--bg` dentro de tarjetas) y texto primario; el **interruptor Mapa / Inteligencia** muestra además el icono activo en lima.

### 7.4 Interruptor (toggle)
32×18 (app desktop) o 40×22 (móvil), pill, padding 2. **On:** fondo `--accent`, tirador `--accent-ink` alineado a la derecha. **Off:** fondo `--surface-2`, borde `--border`, tirador `--text-muted` a la izquierda. `role="switch"` + `aria-checked`.

### 7.5 Tarjeta de datos (`DataCard`): el componente más importante de la app
```
┌──────────────────────────────────────────────────────────┐
│ [icono 16]  Título 15/600 ......... [EN VIVO] meta-mono  │  ← cabecera: padding 16×18, borde inferior
├──────────────────────────────────────────────────────────┤
│  cuerpo: padding 18, gap 10–14                            │
│  … contenido …                                             │
│  Nota de fuente 12 px muted (opcional, al final)           │
└──────────────────────────────────────────────────────────┘
```
- Fondo `--surface`, borde `--border`, radio 14, `overflow: hidden`.
- Props: `title`, `icon`, `meta` (fuente · antigüedad), `live?` (punto lima 6 px + «EN VIVO» mono 10), `highlighted?` (borde `#C8F03C40`, icono lima), `height?`, `state` (`ready | loading | empty | error | stale`).
- Las tarjetas de una misma fila comparten altura (desktop); el contenido sobrante hace scroll interno con scrollbar fina (4 px, `--border`).

### 7.6 KPI / cifra
Etiqueta 12 px secundaria → cifra Inter Tight 700 (36/30/28) + unidad JetBrains Mono 11–12 muted alineada a la base → estado (punto 6 px + texto 12 px 500 del color semántico).

### 7.7 Barras
- **Pista:** `--surface-2`, alto 3–8 px, radio = alto/2.
- **Relleno:** color semántico; en altimetría, opacidad proporcional al valor (0,35 → 1); en tendencias, lima con opacidad proporcional.
- **Umbral:** línea vertical 1 px `--text-muted` que atraviesa la pista (p. ej. 65 dBA).
- **Valor:** JetBrains Mono 11–12, alineado a la derecha en columna fija (36–52 px).
- **Histograma vertical (ruido por hora):** 24 barras, gap 3, alto 120, radio superior 2; `< 65` lima, `65–80` naranja, `≥ 80` rojo; eje 00/06/12/18/24 mono 10 y leyenda con muestras 8×8.

### 7.8 Fila de lista / señal
Punto de color 7–8 px alineado con la primera línea (padding-top 4–5) · tipo en mono 10 MAYÚSCULAS del color semántico · hora mono 10–11 muted a la derecha · cuerpo 13 px primario. Divisor inferior 1 px salvo en el último elemento.

### 7.9 Pills / etiquetas
Padding 3×8, radio pill, 11 px 500. Variantes: `danger` (con `triangle-alert` 11 px), `info`, `neutral` (fondo `--surface-2`, mono 11 secundario), `live` (sobre imagen: fondo `#0A0C0BB3`, punto rojo 6 px «LIVE»).

### 7.10 Barra superior de la app (`TopBar`), 60 px
Izquierda: lockup · divisor 1×20 · **interruptor Mapa / Inteligencia** · selector de ciudad (`map-pin` + «València · Ciutat Vella» + `chevron-down`). Centro: búsqueda 420×36, radio 8, placeholder «Buscar calle, barrio o sensor…». Derecha: pill lima «● En vivo» (padding 7×14, 13/600) · botones `bell`, `settings` · avatar 32 px con iniciales.

### 7.11 Rail lateral (`NavRail`), 72 px (menú plegado desktop)
Botones 44×44 radio 10, icono 19 px secundario, gap 6, padding vertical 20: `menu` (despliega el `SideMenu`), Cerca de mí, Cordón de incidente, Gemelo digital, Glosario, Configuración. Tooltip a la derecha con el nombre en hover/foco. Borde derecho 1 px.

### 7.12 Menú lateral (`SideMenu`), 300 px (menú desplegado)
Cabecera (padding 20/16/20/20, borde inferior): símbolo 36 · «Mirall» + «URBAN INTELLIGENCE PLATFORM» · botón `panel-left-close` 32 px. Cuerpo (padding 16×12, gap 20): selector de ciudad (fondo `--surface-2`, radio 10) · grupo **VISTAS** (Mapa en directo; Inteligencia con contador rojo «3» = recomendaciones activas) · grupo **HERRAMIENTAS** (Cerca de mí, Cordón de incidente, Gemelo digital, Glosario, Configuración) · espaciador · pie con «● EN VIVO · 4 fuentes» y reloj «Miércoles, 07 oct 2026 · 15:39:23». Ítem: padding 10×12, radio 9, icono 17 + texto 14/500; activo con fondo `--surface-2`, icono lima y texto primario.
- **Desktop:** se abre sobre el contenido desde el rail (`menu`) y se cierra con `panel-left-close`, Esc o clic fuera.
- **Móvil:** drawer de 316 px desde la izquierda sobre un velo `#0A0C0BCC`, sombra `12px 0 40px #00000099`; se abre desde la pestaña «Más».

### 7.13 Barra de pestañas móvil (`TabBar`)
Fondo `--surface`, borde superior, padding 10/8/26/8 (incluye `safe-area-inset-bottom`). Cinco pestañas iguales: **Mapa** (`map`), **Inteligencia** (`brain-circuit`), **Barrios** (`layout-grid`), **Capas** (`layers`), **Más** (`menu`, abre el SideMenu). Icono 20 + etiqueta 11/500; inactiva `--text-muted`, activa icono lima y etiqueta primaria.

### 7.14 Elementos del mapa
- **Marcador:** círculo 12 px del color de la capa con borde 2 px `--bg`; halo 28 px al 20 % (44 px si está seleccionado).
- **Área de foco:** círculo de radio de influencia, relleno `#C8F03C0F`, borde 1 px `#C8F03C66`.
- **Tooltip:** tarjeta `--surface`, borde, radio 10, padding 10×12; título 13/600 + punto + meta 12.
- **Controles de zoom:** columna de 3 botones 36×36 (`plus`, `minus`, `locate-fixed`) en una tarjeta radio 8, a 20 px de la esquina superior derecha.
- **Barra de cifras flotante:** a 20 px de los bordes inferior/laterales, radio 14, fondo translúcido con desenfoque, 4 columnas separadas por divisores.

---

## 8. Pantallas

### 8.1 Landing · Desktop (1440)

**Estructura vertical:** `HeroWrap (880)` → `Comparación` → `Métricas` → `Footer`.

**Nav** (dentro del hero, sobre el fondo 3D): padding 20×64, `justify-between`, borde inferior, fondo `#0A0C0B66` + blur 12.
- Izquierda: lockup.
- Centro: grupo de enlaces en una cápsula `--surface` con borde (padding 4): **Manifiesto · Tecnología · Cómo se ha construido · Contacto** (14/500 secundario, padding 8×16; hover → fondo `--surface-2` y texto primario). Ninguno aparece activo por defecto; se marca el de la sección visible al hacer scroll.
- Derecha: botón primario pequeño **«Abrir el mapa»** → `/mapa`.

**Hero** (columna centrada, padding 150/64/72, gap 28):
1. Badge: pill `--surface` + borde, padding 6×14, punto lima 8 px + «València · datos abiertos en tiempo real» (JetBrains Mono 13, secundario).
2. H1 en dos líneas centradas, `display-xl`: «La ciudad no necesita otro Goliat.» / «Necesita un **espejo.**» (la palabra *espejo.* en `--accent`, separada 20 px). Marcado: `<h1>` único con `<span class="text-accent">`.
3. Subtítulo `body-l`, ancho máx. 680, centrado, secundario: «Mirall reúne los datos que tu ciudad ya produce —ruido, aire, tráfico, obras, presupuesto— y te los devuelve en un mapa vivo que pertenece a los vecinos, no a una plataforma.»
4. Botones (gap 12, 8 px extra arriba): **primario** «Ver el mapa en directo →» → `/mapa`; **secundario** «Leer el manifiesto» con `file-text` → `#manifiesto`.

**Fondo del hero:** ver 8.2. Encima, capa de legibilidad con dos degradados: (a) radial centrado en (50 %, 47 %), tamaño 115 % × 100 %: `#0A0C0BF2` 0 % → `#0A0C0BB3` 50 % → transparente 100 %; (b) lineal vertical: `#0A0C0BB3` 0 % → transparente 18 % → transparente 70 % → `#0A0C0B` 100 % (funde con la sección siguiente).

**Comparación «Dos modelos de ciudad»** (padding 24/160/72, gap 28):
- Etiqueta centrada mono 12 tracking 1,5 muted entre dos reglas de 40×1: «DOS MODELOS DE CIUDAD».
- Dos tarjetas iguales (gap 20, padding 32, radio 16, `--surface`):
  - **El modelo Goliat** (`building-2` en caja `--surface-2`, icono secundario): «Una gran plataforma decide qué se mide y quién lo ve.» Lista con `x` muted: Datos cerrados tras contratos privados · Paneles para el ayuntamiento, no para ti · Licencias que se pagan cada año · Tus datos, convertidos en producto.
  - **El modelo Mirall** (destacada: borde `#C8F03C55`, caja de icono lima con `scan-eye` oscuro): «La ciudad se mira a sí misma, con herramientas de todos.» Lista con `check` lima y texto primario: Datos abiertos y verificables, en tiempo real · Cada barrio ve y comenta su propio pulso · Código libre, sin coste de licencias · Nada se vende: la información es común.
  - Cabecera: caja de icono 40 radio 10 + título `title-s` + subtítulo 14. Lista: filas padding 14×0, borde superior en la lista y borde inferior en cada fila, icono 16 + texto 15.

**Métricas** (padding 40/64/56, borde superior): 5 columnas iguales con divisor derecho (excepto la última), cifra `display-m` 44 + etiqueta 14 secundaria centrada:
`9.147` vecinos conectados (lima) · `16` barrios con sensor propio · `8` capas de datos abiertos · `0 €` en licencias (lima) · `0` datos vendidos. Animar el contador al entrar en viewport (600 ms, `ease-out`), salvo con `prefers-reduced-motion`.

**Footer** (`--surface`, borde superior, padding 56/64/32, gap 40):
- Fila superior: lockup + texto «Urban intelligence para València. Información pública dispersa, convertida en una representación coherente de la ciudad.» (14, secundario, máx. 340) | columnas (gap 48) **PRODUCTO** (Mapa en directo, Inteligencia, Cómo se ha construido) · **PROYECTO** (Manifiesto, Tecnología, Código en GitHub) · **CONTACTO** (mirall.urbanintelligence@gmail.com, Licencia abierta). Títulos mono 11 tracking 1,2 muted; enlaces 14 primario.
- Fila inferior (borde superior, padding-top 20): «© 2026 Mirall · Hecho con datos abiertos de València» (12, muted) | iconos `github`, `mail`, `rss` 16 px.

### 8.2 Fondo 3D del hero («ciudad espejo»)

Recreación mejorada de la escena actual de `vlc-monitor.vercel.app` (`#hero-ciudad-3d`), adaptada a la paleta Mirall. Referencia estática: `06-assets/hero-ciudad-3d-fallback.png`.

| Parámetro | Valor |
|---|---|
| Renderer | `WebGLRenderer({ antialias: true, alpha: true })`, `pixelRatio = min(devicePixelRatio, 2)` |
| Cámara | `PerspectiveCamera(22°)`, posición `(0, 3.4, 18)`, `lookAt(0,0,0)`; en relación de aspecto < 1 alejar `z × min(1/aspect, 2.2)` |
| Fondo y niebla | `scene.background = #0A0C0B`; `Fog(#0A0C0B, near 9, far 17)` (escalar con la cámara) |
| Edificios | 90 cajas (45 en < 700 px) en una rejilla entera aleatoria ±8; escala XZ 0,9–1,0; altura `0.15 + |rand·3.2|`; material `MeshStandardMaterial` `#1A1E1B` (rugosidad 0,85, metalicidad 0,1); **1 de cada 8 en lima `#C8F03C` con `emissive` lima a intensidad 0,35**; aristas `EdgesGeometry` blancas al 6 % de opacidad |
| Suelo | Plano 60×60 color `#0A0C0B`; `GridHelper(60, 60, #C8F03C, #1A1E1B)` al 25 % de opacidad |
| Partículas | 140 octaedros de radio 0,012, lima al 50 %, flotando a 0,5–4,5 de altura; el grupo rota `y += 0.0015` por frame |
| Estelas de tráfico | 26 barras blancas `1 × 0.02 × 0.03` que recorren las calles en X o Z de −9 a +9 en 3–6 s, con desfase aleatorio |
| Luces | `AmbientLight(#fff, 2.2)`; `PointLight(#fff, 16, 12)` en (4,5,4) con sombras (desactivadas en < 700 px); `PointLight(#C8F03C, 6, 14)` en (−4,3,−2) |
| Parallax | Al mover el puntero: `rotation.y → x·0.3`, `rotation.x → −y·0.08`, con suavizado 0,02 por frame |
| Rendimiento | Pausar con `IntersectionObserver` fuera de pantalla; `prefers-reduced-motion` → renderizar un único frame; no bloquear el LCP (cargar Three.js con `import()` tras el primer pintado y mostrar mientras tanto la imagen de fallback con `object-fit: cover`) |
| Accesibilidad | `<canvas aria-hidden="true">`; el texto nunca depende del canvas |

### 8.3 Landing · Tablet (768) y Móvil (390)

| Elemento | Tablet 768 | Móvil 390 |
|---|---|---|
| Alto del hero | 760 | ~781 (se ajusta al contenido) |
| Nav | padding 16×32; enlaces **ocultos**; CTA «Abrir el mapa» + botón hamburguesa 40 px circular | padding 14×20; **solo lockup + hamburguesa** (el CTA se mueve al hero) |
| Padding del hero | 128/40/64, gap 24 | 88/24/56, gap 22 |
| Badge | igual | «València · tiempo real», 12 px |
| H1 | 60 px, salto manual: «La ciudad no necesita / otro Goliat.» + «Necesita un espejo.» | 44 px: «La ciudad / no necesita / otro Goliat.» + «Necesita un» / «espejo.» (5 líneas, centrado) |
| Subtítulo | 17 px, ancho completo | 16 px |
| Botones | en fila | apilados a ancho completo (gap 10), contenido centrado |
| Capa de legibilidad | igual que desktop | lineal: `#0A0C0BA6` 0 % → `DE` 30 % → `D1` 72 % → sólido 100 % |
| Comparación | padding 16/40/56; tarjetas **apiladas** (gap 16) | padding 8/20/48; tarjetas apiladas, padding 22 |
| Métricas | 5 columnas, cifra 34 px, etiqueta en 2 líneas | **lista**: filas con cifra 30 px a la izquierda y etiqueta a la derecha, divisor inferior, padding 18×0 |
| Footer | padding 48/40/28; marca arriba y columnas debajo en fila | padding 40/20/28; todo apilado (gap 28); fila inferior apilada |

**Menú abierto (móvil y tablet):** panel a pantalla completa (`--bg`), bloqueo del scroll del body, foco atrapado.
- Nav: lockup + botón cerrar 40 px (`x`, fondo `--surface-2`).
- Enlaces (padding 16/20/0/20): filas con padding 20×0 y divisor inferior; índice mono 11 muted «01–04» · etiqueta Inter Tight 26/600 −0,5 · `arrow-up-right` 18. Orden: Manifiesto, Tecnología, Cómo se ha construido, Contacto.
- Pie (padding 0/20/32): «● EN VIVO · 14 fuentes · hace 0 min» (mono 11) · botón primario a ancho completo «Abrir el mapa →» · email + icono GitHub.
- Fondo: la imagen de la ciudad 3D en los 400 px inferiores, fundida hacia arriba (`#0A0C0B` → `CC` → `99`).
- Animación: fundido + desplazamiento de 8 px de los enlaces en cascada (40 ms entre ellos); cierre con Esc, con el botón o al elegir un enlace.

### 8.4 App · Mapa · Desktop (1440 × 960, a pantalla completa)

`TopBar (60)` + cuerpo en fila: `NavRail (72)` | `Panel de capas (300)` | `Mapa (flex)` | `Panel de análisis (340)`.

**Panel de capas** (padding 20, gap 20, borde derecho):
1. Eyebrow «PULSO DEL BARRIO».
2. Dos KPI (gap 10): **Calidad del aire** 42 ICA · ● Buena (lima) / **Ruido medio** 77 dB · ● Alto (naranja).
3. «CAPAS DE DATOS» + «5 de 8 activas».
4. Lista de capas (fila padding 10, radio 8, activa con fondo `--surface`): caja de icono 28 + nombre 14 + interruptor. Capas y color: Calidad del aire (lima, on), Ruido (naranja, on), Tráfico (rojo, on), Valenbisi (azul, on), Obras (off), Zonas verdes (off), Incidencias vecinales (lima, on), Presupuesto participativo (off).
5. Espaciador + nota de fuente con borde: `database` lima + «Datos abiertos verificados» / «1.284 sensores públicos · actualizado hace 2 min».

**Mapa** (MapLibre): estilo vectorial oscuro propio. Tierra `#0D100E`, calles `#3A403C`→`#8C948E` por jerarquía, agua `#0A0C0B` con borde sutil, parques `#13201A`, sin etiquetas POI y etiquetas de barrio en JetBrains Mono 10 muted. Referencia de atmósfera: `06-assets/mapa-base-referencia.png` (imagen generada, **no es un mapa real**). Encima: marcadores por capa, área de foco, tooltip del marcador seleccionado (ej. «Av. del Port, 32 · Tráfico denso · 12 min»), controles de zoom y la **barra de cifras**: Bienestar del barrio **87**/100 (lima) · Carril bici 84,0 km · Incidencias resueltas 1.079 este mes · Árboles plantados 312 en 2026.

**Panel de análisis** (padding 20, gap 20, borde izquierdo):
- Tarjeta **Ruido por hora**: «Plaça de l'Ajuntament · últimas 24 h», pestañas 24h/7d, histograma de 24 barras, eje y leyenda (< 65 dB · 65–80 · > 80).
- «AVISOS DEL BARRIO» + «Ver todos» (lima) y lista: ● Tráfico denso en Av. del Port (retenciones de 12 min · hace 4 min) · ● Ruido nocturno en Russafa (81 dB de media · 3 vecinos lo confirman) · ● Estación Valenbisi vacía (Pl. de l'Ajuntament · 0 de 24 bicis) · ● Incidencia resuelta (farola reparada en C/ Cádiz · hace 1 h).

**Interacciones:** encender o apagar una capa añade o quita sus marcadores con un fundido de 150 ms; al hacer clic en un marcador se abre el tooltip y se centra el mapa; al hacer clic en un aviso se vuela a su ubicación; «En vivo» parpadea suavemente (opacidad 1 → 0,5, 2 s) mientras haya datos con menos de 5 min.

### 8.5 App · Inteligencia · Desktop (1440 × ~2355, con scroll)

`TopBar` (pestaña **Inteligencia** activa) + `NavRail` + `Main` (padding 28/32/40, gap 20, borde izquierdo).

**Cabecera de página** (`justify-between`, alineada abajo):
- Eyebrow mono 11 lima tracking 1,4: «CAPA DE INTELIGENCIA · VALÈNCIA»
- Título `title-xl`: «Qué está pasando en la ciudad»
- Subtítulo 14: «Miércoles, 07 de octubre de 2026 · 15:39 · 14 fuentes abiertas, 4 en vivo»
- Derecha: chips de filtro **Todo** (activo) · Movilidad · Clima · Ruido · Eventos · Institucional. Filtran las tarjetas visibles (ver tabla).

**Rejilla por jerarquía** (gap 16 entre tarjetas y 20 entre filas). En desktop cada fila tiene altura fija y las tarjetas hacen scroll interno.

| Fila | Altura | Tarjetas (ancho) | Filtro |
|---|---|---|---|
| 1 · Prioridad | 520 | **Recomendaciones de actuación** (flex, destacada) · **Señales** (440) | Todo |
| 2 · Clima y terreno | 560 | **Meteorología por zona** (flex) · **Altimetría por distrito** (flex) · **Riesgo de acumulación de agua** (360) | Clima |
| 3 · Movilidad y actividad | 540 | **Cámaras en vías de acceso** (flex) · **Ruido en Russafa (ZAS)** (flex) · **Agenda de eventos** (400) | Movilidad / Ruido / Eventos |
| 4 · Contexto | 440 | **Actualidad institucional** · **Contexto mediático** · **Términos en tendencia** · **Protocolos de actuación** (4 iguales) | Institucional |

**Detalle de cada tarjeta**

1. **Recomendaciones de actuación** (`sparkles`, meta «Mirall IA · hace instantes», borde destacado). Tres recomendaciones separadas por divisores (padding 18×0). Cada una: bloque de texto con **borde izquierdo de 3 px del color de prioridad** y 16 px de padding → prioridad (mono 10, tracking 1,2: PRIORIDAD ALTA rojo / PRIORIDAD MEDIA naranja / SIN RIESGO lima) → título `title-xs` 18 → razonamiento 14 secundario (interlineado 1,5) → chips de fuentes (mono 11 sobre `--surface-2`) · a la derecha, botón pill «Ver en mapa ↗» / «Ver sonómetros ↗» / «Ver protocolo ↗». Al final, el **aviso IA** (fondo `#FFA63D14`, `triangle-alert`, 12 px naranja). Contenido de ejemplo:
   - ALTA: «Prever congestión en Quatre Carreres 19:30–21:00»: corte en la vía de servicio de Pérez Galdós + Valencia Basket vs Hapoel IBI Tel Aviv en el Roig Arena (20:45, ~15.000 asistentes). Fuentes: DGT · CV-500, Agenda, Tráfico.
   - MEDIA: «Ruido sostenido en la ZAS de Russafa»: 3 de 16 sonómetros superan 65 dBA LAeq; C/ Doctor Serrano 21 marca 67,2 dBA. Fuentes: ZAS Russafa, Sonómetros.
   - SIN RIESGO: «Imbornales y acumulación de agua estables»: 0,0 mm en 24 h (AVAMET, SAIH). Fuentes: AVAMET, SAIH, Open-Meteo.
   - **Estado vacío:** «Sin recomendaciones activas ahora mismo.» + el aviso IA.
2. **Señales** (`radio-tower`, «● EN VIVO», «4 fuentes»): feed cronológico inverso (fila 7.8). Tipos: TRÁFICO (rojo), EMERGENCIAS 112 (azul), EVENTO (naranja), AYUNTAMIENTO (lima), EMT (gris). Los nuevos elementos entran por arriba con un fundido y un resaltado `--surface-2` de 2 s.
3. **Meteorología por zona** (`thermometer`, «AVAMET · hace 3 min»): pestañas **Estaciones reales** | **Distritos (modelo)** (Open-Meteo; mostrar el aviso «Por distrito es un modelo, no una estación real»). Tabla: ESTACIÓN (flex) · TEMP. (120: pista de 56 px + valor «28,8°»; ≥ 28,5° naranja) · VIENTO (86, «9 OSO») · LLUVIA (60, derecha, «0,0»). Cabeceras mono 10 muted tracking 1.
4. **Altimetría por distrito** (`mountain`, «IGN · estático»): nota «De más alto a más bajo. Anticipa dónde se acumula el agua por gravedad.» + 14 filas: nombre (120) · barra (lima con opacidad proporcional; < 8 m en azul) · valor «40,9 m». Orden: Poblats de l'Oest 40,9 · Benicalap 26,8 · l'Olivereta 24,0 · Campanar 23,7 · Patraix 19,7 · Poblats del Nord 17,1 · Extramurs 15,8 · La Saïdia 15,4 · Ciutat Vella 14,8 · Jesús 14,0 · Rascanya 13,2 · l'Eixample 11,7 · Quatre Carreres 5,9 · Poblats Marítims 2,5.
5. **Riesgo de acumulación de agua** (`droplets`, «spec 046»): bloque de nivel (fondo lima 6 %, borde lima 20 %, radio 10): «NIVEL ACTUAL» · **Bajo** (36 px lima) · explicación. Lista «ZONAS MÁS EXPUESTAS SI LLUEVE» (Poblats Marítims y Quatre Carreres con alta exposición en naranja; Rascanya y l'Eixample con exposición media). Nota final: «Estimación relativa (densidad de sumideros × lluvia). No sustituye los avisos oficiales de Protección Civil.» Niveles: Bajo (lima) / Medio (naranja) / Alto (rojo).
6. **Cámaras en vías de acceso** (`cctv`, «DGT · cada ~2 min»): rejilla 2×2 de miniaturas (alto 150, radio 10) con pill «● LIVE» y hora; debajo, vía (13/600) + nº de cámaras (mono 11). Chips de otras vías: AP-7 (1), CV-30 (2), CV-33 (3), CV-36 (6), +4. Al hacer clic se abre un visor modal con la secuencia. Nota: «Imágenes en directo de la DGT (DATEX2 v3.7, CC BY).» *(Las miniaturas del diseño son de banco de imágenes o generadas: sustituir por el feed real.)*
7. **Ruido en Russafa (ZAS)** (`audio-lines`, «16 sonómetros»): nota sobre el LAeq del día anterior y el umbral de 65 dBA; filas ordenadas por valor: dirección (150) · barra (escala 50–70 dBA) con **línea de umbral** · valor (rojo si > 65). Leyenda < 62 · 62–65 · > 65 ZAS.
8. **Agenda de eventos** (`calendar-days`, «92 eventos»): título 14/500 · meta mono 11 («VBC · 8 oct · 20:45») · pills «⚠ Impacto en vía pública» (rojo) + distrito (azul). Nota de fuente: «Scraping de fuentes públicas (valencia.es, Valencia CF, Levante UD, Roig Arena, FDM) · hace 56 min».
9. **Actualidad institucional** (`landmark`, «11 cuentas»): avatar con iniciales 32 px · cuenta 13/600 · hora · extracto 12. Los iframes de Facebook/X **solo se cargan bajo demanda** (al pulsar), con aviso de cookies de terceros.
10. **Contexto mediático** (`newspaper`): medio (mono 10 lima MAYÚSCULAS) · hora · titular 14 (enlace externo).
11. **Términos en tendencia** (`trending-up`, selector «Última hora / Hoy / 7 días»): rango · término 13/500 · barra lima de 3 px · variación (+62 % lima / −12 % muted).
12. **Protocolos de actuación** (`shield-check`): nombre 14/500 + contexto 12 · pill de estado: **Activo** / **Vigilancia** (naranja con borde `#FFA63D55`) o **En reposo** (gris).

**Tarjetas existentes en la app actual sin diseño visual propio:** «Apoyo a decisión operativa» y «Cámaras en vivo · Valencia ciudad». Implementarlas con el `DataCard` estándar: la primera en la fila 1 como pestaña de Recomendaciones; la segunda fusionada con «Cámaras en vías de acceso» mediante pestañas «Accesos (DGT) | Ciudad».

### 8.6 App · Configuración de ciudad (módulo, 1440)

Padding 28/32/32, gap 24. Cabecera: «Configuración de ciudad» (`title-m`) + «València · Ciutat Vella — define qué mide tu espejo y cada cuánto se actualiza» | botones **Descartar** (secundario) y **Guardar cambios** (primario, deshabilitado sin cambios). Cinco celdas iguales (padding 18, radio 12): icono + etiqueta 13 secundaria + interruptor · valor 30 px (lima si está activo) + submeta mono 11:
`radio` Sensores conectados **1.284** (+36 esta semana) · `map` Barrios cubiertos **16** (de 19 distritos) · `layers` Capas activas **5** (de 8 disponibles) · `timer` Frecuencia **2 min** (tiempo real) · `shield-check` Anonimización **Activa** (sin datos personales). Guardar → toast «Cambios guardados» (lima, 3 s); descartar con cambios → confirmación.

### 8.7 App · Móvil (390 × 844)

Todas las pantallas: `safe-area` superior (en el diseño, la barra de estado iOS solo es maqueta) + contenido + `TabBar`. Cabecera tipo: eyebrow opcional + título `title-l` 28 + subtítulo 13 + botón circular de 40 px a la derecha.

- **Mapa** (pestaña Mapa): mapa a sangre; buscador flotante (358×44, radio 12, «Buscar en València» + pill lima «● En vivo»); marcadores; **bottom sheet** (radio 20 arriba, `--surface`) con asa 36×4, «Pulso del barrio» 18/700 + «Ciutat Vella · hace 2 min» y la puntuación **87**/100 lima; tres mini-KPI (Aire 42 ICA · Ruido 77 dB · Tráfico Denso, con punto semántico). El sheet tiene 3 posiciones: plegado (solo cabecera), medio (como en el diseño) y expandido (contenido del panel de análisis).
- **Inteligencia**: eyebrow «VALÈNCIA · 15:39» + «Inteligencia» + campana; chips con scroll horizontal; **Recomendación prioritaria** (tarjeta destacada con «1 de 3», borde izquierdo de prioridad, botones «Ver en mapa» (primario) y «Ver las 3»); tres mini-KPI (Temp. media 28,4°, Riesgo agua Bajo, Russafa 67,2 dBA máx.); tarjeta **Señales** con «● EN VIVO» y 3 elementos. Debajo, con scroll, el resto de tarjetas de 8.5 apiladas a ancho completo en el orden de las filas (las tablas pasan a 2 columnas: nombre + valor principal).
- **Barrios**: «Barrios» + «16 barrios · ordenados por bienestar» + botón de filtros; segmentado **Ranking | Cerca de mí | Favoritos**; tarjetas (padding 16, radio 14): rango mono «01» · nombre 16/600 (+ etiqueta «Tu barrio» lima en el del usuario, con borde destacado) · meta «Aire 38 · Ruido 62 dB» · puntuación 28 px (≥ 75 lima, 65–74 blanco, < 65 naranja) · barra de progreso de 4 px.
- **Capas**: «Capas» + «Elige qué refleja tu mapa» + botón restablecer (`rotate-ccw`); grupos **ENTORNO** (Calidad del aire, Ruido, Zonas verdes) · **MOVILIDAD** (Tráfico, Valenbisi) · **COMUNIDAD** (Incidencias vecinales, Presupuesto participativo). Cada grupo es una tarjeta radio 14 con filas: caja de icono 34 · nombre 15/500 + descripción 12 · interruptor 40×22.
- **Menú lateral** (pestaña Más): `SideMenu` como drawer sobre el mapa velado (ver 7.12).

---

## 9. Reglas responsive de la app (incluida la tablet, pendiente de diseño)

| Zona | Desktop ≥ 1280 | Tablet 768–1279 | Móvil < 768 |
|---|---|---|---|
| Navegación principal | TopBar + NavRail 72 | TopBar compacta (sin búsqueda, que pasa a un icono) + NavRail 72 | TabBar inferior + SideMenu (drawer) desde «Más» |
| Mapa / Inteligencia | Interruptor en la TopBar | Interruptor en la TopBar | Pestañas de la TabBar |
| Panel de capas | Columna fija de 300 | Drawer izquierdo de 300 abierto desde un botón `layers` sobre el mapa | Pantalla «Capas» |
| Panel de análisis | Columna fija de 340 | Bottom sheet de 2 posiciones | Bottom sheet del mapa |
| Rejilla de Inteligencia | Filas de 2–4 tarjetas, altura fija | 2 columnas, altura según contenido; la fila 1 a ancho completo | 1 columna |
| Barra de cifras del mapa | 4 columnas flotantes | 2×2 | Dentro del bottom sheet |

---

## 10. Estados y calidad del dato

Cada `DataCard` y cada fuente debe contemplar:

| Estado | Presentación |
|---|---|
| **Cargando** | *Skeleton* con la forma del contenido (barras `--surface-2` con brillo animado de 1,2 s); la cabecera se mantiene visible. |
| **Vacío** | Texto 13 secundario con una explicación concreta (p. ej. «Sin lluvia registrada ahora mismo: el indicador solo refleja la densidad de imbornales.»). Nunca dejar la tarjeta en blanco. |
| **Error** | Icono `triangle-alert` rojo + «No se ha podido cargar *{fuente}*» + botón «Reintentar»; se conserva el último dato válido atenuado. |
| **Desactualizado** | Si la antigüedad supera 3× la cadencia esperada, la meta pasa a naranja («hace 56 min») y se oculta el «EN VIVO». |
| **Sin permiso / no disponible en esta build** | Texto neutro (p. ej. «No hay cámaras disponibles en esta build.») con un enlace a «Cómo se ha construido». |
| **Dato modelado vs. medido** | Etiquetar siempre: «modelo (Open-Meteo)» frente a «estación real (AVAMET)». |
| **Contenido de IA** | Aviso fijo (punto 6 del prompt) + identificación del modelo y la hora en la meta. |

---

## 11. Movimiento

- Duraciones: 150 ms (hover, interruptores), 200–250 ms (pestañas, chips, tooltips), 300 ms (drawers, sheets, menú móvil). Curva `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Punto «en vivo»: pulso de opacidad de 2 s infinito.
- Contadores de la landing: 600 ms al entrar en viewport.
- Respetar `prefers-reduced-motion`: sin parallax, sin contadores, sin cascadas; transiciones a 0 ms (salvo cambios de opacidad).

---

## 12. Contratos de datos (TypeScript)

```ts
type Severity = 'ok' | 'watch' | 'alert';          // → accent | warning | danger
type SourceMeta = { source: string; updatedAt: string; cadenceSec: number; modeled?: boolean };

interface Recommendation { id: string; priority: 'high' | 'medium' | 'none'; title: string; reasoning: string;
  sources: string[]; action: { label: string; href: string }; generatedBy: string; generatedAt: string }
interface Signal { id: string; kind: 'TRAFICO' | 'EMERGENCIAS_112' | 'EVENTO' | 'AYUNTAMIENTO' | 'EMT';
  text: string; at: string; geo?: [number, number] }
interface WeatherStation { name: string; tempC: number; windKmh: number; windDir: string; gustKmh?: number; rainMm: number }
interface DistrictAltitude { district: string; meanAltM: number }
interface WaterRisk { level: 'bajo' | 'medio' | 'alto'; rain24hMm: number; exposed: { district: string; exposure: 'alta' | 'media' }[] }
interface TrafficCamera { id: string; road: string; imageUrl: string; capturedAt: string }
interface NoiseSensor { address: string; laeqDba: number; zone: 'ZAS_RUSSAFA' }
interface CityEvent { title: string; category: string; start: string; end?: string; venue: string; district: string; roadImpact: boolean }
interface InstitutionalPost { account: string; initials: string; excerpt: string; at: string; url: string }
interface NewsItem { outlet: string; title: string; at: string; url: string }
interface TrendTerm { term: string; mentions: number; deltaPct: number }
interface Protocol { name: string; status: 'activo' | 'vigilancia' | 'reposo'; context: string }
interface MapLayer { id: string; name: string; icon: string; color: string; enabled: boolean }
interface Kpi { label: string; value: number | string; unit?: string; severity?: Severity; statusText?: string }
```

**Fuentes previstas:** DGT DATEX2 (cámaras, incidencias) · AVAMET (estaciones) · Open-Meteo (modelo por distrito) · SAIH Júcar (pluviómetros) · IGN (altimetría) · Ayuntamiento de València, datos abiertos (ruido de la ZAS, Valenbisi, obras, presupuestos) · Emergències 112 CV · agenda de eventos por scraping (valencia.es, Valencia CF, Levante UD, Roig Arena, FDM) · prensa local (RSS).

---

## 13. Accesibilidad

- Contraste: `--text-primary` sobre `--bg` ≈ 17:1; `--text-secondary` ≈ 6,3:1 (válido para cuerpo); `--text-muted` ≈ 3,2:1 → **solo** para texto ≥ 10 px no esencial o acompañado; lima sobre `--bg` ≈ 14:1; `--accent-ink` sobre lima ≈ 14:1.
- Texto sobre el hero 3D: siempre con la capa de legibilidad; validar el contraste sobre el fotograma más claro.
- Semántica: un único `<h1>` por página; las tarjetas son `<section aria-labelledby>`; las listas de señales son `<ol>` con `aria-live="polite"` (sin anunciar más de 1 elemento cada 10 s).
- Gráficas: cada barra lleva su valor en texto visible; añadir `aria-label` resumen («Ruido por hora: máximo 92 dB a las 17:00»).
- Interruptores: `role="switch"`; chips de filtro: `aria-pressed`; pestañas: patrón WAI-ARIA *tabs*.
- Menús y drawers: foco atrapado, Esc para cerrar, devolución del foco al disparador.
- Objetivos táctiles ≥ 44×44 px en móvil.
- El mapa debe tener una alternativa en lista (avisos y capas) navegable por teclado.

---

## 14. Criterios de aceptación

- [ ] Los tokens de la sección 5 son la única fuente de color, tipografía y radios (sin valores sueltos en los componentes).
- [ ] Las 12 pantallas coinciden con las capturas (tolerancia de ±2 px en espaciados, de 0 en colores).
- [ ] La landing funciona a 390, 768, 1024, 1280 y 1440 sin scroll horizontal; el menú se pliega por debajo de 1280 y el menú abierto cumple 8.3.
- [ ] El hero 3D consigue ≥ 50 fps en un portátil medio, se pausa fuera de pantalla, respeta `reduced-motion` y tiene fallback de imagen; LCP < 2,5 s en 4G.
- [ ] La app cambia entre Mapa e Inteligencia sin recargar y conserva los filtros.
- [ ] Cada tarjeta muestra fuente + antigüedad e implementa los 5 estados de la sección 10.
- [ ] Todo el contenido de IA lleva el aviso.
- [ ] Números, fechas y horas en formato `es-ES` y zona `Europe/Madrid`.
- [ ] Auditoría axe sin errores críticos; navegación completa por teclado.
- [ ] Los componentes `TopBar`, `NavRail`, `SideMenu`, `TabBar`, `DataCard`, `Toggle`, `Chip`, `Button`, `Kpi` y `Bar` están documentados en Storybook.

---

## 15. Contenido del paquete de traspaso

```
Mirall-Urban-Intelligence-Platform/
├── 00-PROMPT-IMPLEMENTACION.md        ← este documento
├── 01-presentacion-pdf/               ← todas las pantallas en un PDF (una por página)
├── 02-pantallas-png/                  ← 12 pantallas a 2× (referencia visual obligatoria)
├── 03-componentes-png/                ← Tab Bar, Side Menu, Status Bar a 2×
├── 04-html-referencia/                ← exportación HTML + Tailwind de 4 pantallas (solo referencia de
│                                        medidas y estructura: NO es código de producción)
├── 05-fuente-pen/                     ← archivo editable de pen.dev + imágenes
└── 06-assets/                         ← fallback del hero 3D, referencia del mapa base, placeholder de cámara
```

> **Nota sobre las imágenes:** el fondo 3D, el mapa base y una miniatura de cámara son **imágenes generadas por IA** solo como referencia de atmósfera. En producción, el hero es la escena Three.js (8.2), el mapa es MapLibre con datos reales y las cámaras son el feed de la DGT. Las demás miniaturas de cámara proceden de Unsplash y también deben sustituirse.
