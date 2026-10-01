# Spec 052 — Altimetría como capa de mapa (tinta hipsométrica sobre rejilla real)

```yaml
id: 052
titulo: "Altimetría de Valencia como capa activable en /mapa (tinta hipsométrica sobre rejilla real del IGN)"
estado: Implemented
tipo: capa
depende_de: [000, 044]
propietario: ""
version: 2
```

> Origen v1: petición explícita del usuario (2026-09-25) — "un mapa de calor por altimetría de
> la ciudad como layer superpuesta", igual criterio que temperatura/ZAS/precipitación (specs
> 049/050/051).
> Origen v2: petición explícita del usuario (2026-09-30) — pide una capa con "diseño
> cartográfico de verdad" (tinta hipsométrica, la convención real de mapas topográficos) en vez
> del choropleth de 19 distritos con lerp de 2 colores de v1, re-examinando con criterio de
> ingeniero topográfico tanto la paleta como si merece la pena subir de resolución espacial
> ahora que hay motivo concreto para no conformarse con "19 zonas planas".

## 1. Problema / motivación

La altimetría de Valencia (spec 044) ya se calcula y se muestra como ranking de texto
("más alto → más bajo" por distrito) en `#altimetria-panel` de `/inteligencia`. v1 de esta spec
la llevó a `/mapa` como choropleth de 19 distritos con un lerp lineal de 2 colores
(verde→marrón). Funcional, pero con dos problemas de diseño cartográfico reales:

1. **Paleta poco cuidada**: un lerp de 2 puntos no es una tinta hipsométrica — la convención
   real (ver investigación §1a) usa varias paradas de color (verde → amarillo/ocre → siena), no
   un degradado lineal entre dos extremos.
2. **Resolución de 19 zonas planas** cuando el propio script de seed (`scripts/seed-altimetria.ts`)
   ya consulta ~200 puntos reales de una rejilla de ~600 m al WMS del IGN para calcular esas
   medias — y los descartaba tras agregar. v1 documentó esa decisión (§5 de aquella versión)
   como "por ahora, no justificado"; v2 la reabre con los datos reales delante, tal y como
   pedía el usuario.

## 1a. Investigación — la convención real de tinta hipsométrica

Búsqueda web dirigida (no una paleta inventada a ojo):

- La tinta hipsométrica ("hypsometric tinting"/"tintas hipsométricas") es una convención
  cartográfica centenaria: colores graduados por banda de elevación, no un degradado de 2
  puntos. El IGN español, en su propia cartografía de pequeña escala, agrupa el color en series
  — verdes para tierras bajas, ocres para zonas medias, rojizos/siena para zonas altas — y
  reserva los violetas/rojos para las cumbres. La referencia internacional más citada son las
  "cross-blended hypsometric tints" de Natural Earth / Patterson & Jenny, con la misma
  progresión: verde oscuro (bajo) → verde claro → amarillo → ocre/naranja → siena/marrón
  (alto), reservando blanco/gris para picos nevados — irrelevante aquí, Valencia no tiene esa
  banda.
- **El problema de aplicar esa escala tal cual**: está pensada para rangos de sierra (0-4000 m).
  Valencia es una ciudad casi plana — el rango real medido por la rejilla del IGN
  (`data/altimetria-puntos.json`, 198 puntos válidos, ver §1b) es **0.26-50.7 m**, con el 90% de
  los puntos por debajo de 20 m. Aplicar la escala de sierra directamente dejaría toda la ciudad
  pintada del mismo verde apagado del primer 1% del degradado — "plana e inútil", exactamente
  el riesgo que señaló el encargo.
- **Decisión de diseño**: se conserva la progresión de color de la convención (verde → amarillo/
  ocre → siena) pero **re-escalada al rango real de Valencia** (0-45 m, con margen sobre el
  máximo real de 50.7 m para no saturar de golpe un posible outlier) y con **más paradas de
  color en la franja baja** (0-20 m, donde cae el grueso del dato real) que en la alta
  (20-45 m, casi sin muestras). Ver rampa completa en §5.

## 1b. Investigación — ¿merece la pena subir de 19 distritos a una rejilla real?

Se ejecutó `npm run seed:altimetria` en esta sesión (modificado para persistir también los
puntos individuales, no solo el resumen — ver §2) contra el WMS real del IGN:

```
Rejilla candidata: 399 puntos. Filtrando a los que caen dentro de un distrito real...
202 puntos dentro del término municipal. Consultando el IGN (WMS)...
19 distritos, 198 muestras válidas (de 202 consultadas) escritos en
data/altimetria-valencia.json y data/altimetria-puntos.json.
```

Histograma real de las 198 muestras (bandas de 5 m):

| Banda (m) | Puntos |
|---|---|
| 0-5 | 60 |
| 5-10 | 33 |
| 10-15 | 36 |
| 15-20 | 26 |
| 20-25 | 22 |
| 25-30 | 13 |
| 30-50 | 8 |

**Conclusión, con los datos delante**: sí merece la pena. La rejilla (~600 m de paso, ~198
celdas con dato real) da un orden de magnitud más de resolución que 19 distritos, y varios
distritos tienen un rango interno amplio que el choropleth de v1 ocultaba por completo —
p. ej. Poblats del Sud (0.26-27 m en un único color de distrito), Quatre Carreres (1-12.4 m),
Campanar (14.3-31.2 m). Esa variación interna es justo la que importa para el caso de uso real
de la spec (cruzar con riesgo de acumulación de agua, spec 046): un distrito "medio-bajo" en la
media puede tener una franja litoral mucho más baja que el resto, y el choropleth de distrito
entero la enmascaraba. No se sube a un `HeatmapLayer` de interpolación continua (opción
descartada también en v2, ver §5) porque la rejilla real ya es discreta (una muestra cada
~600 m) — interpolar entre esas celdas inventaría precisión que el dato no tiene; una celda
cuadrada por muestra real es la representación más honesta.

## 2. Fuente(s) de datos

Ninguna fuente nueva. Sigue reutilizando el endpoint de spec 044, ampliado en v2 para también
servir los puntos de rejilla (antes descartados):

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| IGN — Modelo Digital del Terreno (spec 044) | `GET /api/emergencia/v1/altimetria` (interno; fuente original `servicios.idee.es/wms-inspire/mdt`, capa `EL.ElevationGridCoverage`) | Datos geográficos oficiales de libre reutilización (verificado en spec 044) | No | v1: reutilizada 2026-09-25. v2: reejecutado `npm run seed:altimetria` en vivo el 2026-09-30 contra el WMS real — 198/202 puntos con dato válido, resumen por distrito consistente con v1 (rango de medias 2.49-40.9 m) |

`scripts/seed-altimetria.ts` ahora persiste también los puntos individuales (antes los
calculaba y los descartaba tras agregar la media) en `data/altimetria-puntos.json` — mismo
patrón "dato estático, seed manual único" que ya tenía `data/altimetria-valencia.json`, sin
cron ni refresco periódico.

## 3. Contrato de datos (normalizado)

`ResumenAltimetriaDistrito` (spec 044) sin cambios — sigue siendo lo que usa la leyenda
(distrito más alto/bajo).

**Nuevo en v2** — `MuestraElevacion` (ya existía como tipo interno del seed, spec 044; v2 lo
expone también por el endpoint y lo usa el cliente):

```typescript
interface MuestraElevacion {
  lat: number;
  lon: number;
  elevacionM: number;
  distritoCodigo: string;
}
```

`GET /api/emergencia/v1/altimetria` devuelve ahora `{ distritos: ResumenAltimetriaDistrito[],
puntos: MuestraElevacion[] }` — campo añadido (`puntos`), no rotura de compatibilidad del campo
`distritos` ya existente.

Dos funciones nuevas, puras y sin I/O (mismo criterio que `resumenAltimetriaPorDistrito` y que
`generarHotspotsDensidadMock`, spec 003 §2), en `src/services/altimetria.ts`:

- `celdaCuadrada(lat, lon): GeoJSON.Polygon` — celda cuadrada del tamaño real de la rejilla
  (`PASO_LAT_REJILLA`/`PASO_LON_REJILLA`, ~600 m, única fuente de verdad compartida entre el
  seed y el cliente — antes el seed tenía sus propias constantes locales).
- `featureCollectionAltimetriaPuntos(puntos): GeoJSON.FeatureCollection` — convierte la rejilla
  de puntos en un `FeatureCollection` de celdas listo para `GeoJsonLayer`.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna — dato estático, seedeado una única vez (`npm run seed:altimetria`) |
| TTL en caché | Sin cambios — `cache-control: public, max-age=86400, stale-while-revalidate=604800` |
| Comportamiento si la fuente falla | Sin cambios — sirve los JSON versionados (`data/altimetria-valencia.json` + `data/altimetria-puntos.json`), sin llamada de red en cada petición |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/altimetria` (mismo endpoint, contrato de respuesta ampliado con `puntos`, ver §3) |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'altimetria',
  specId: '052',
  grupo: 'primaria',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'rejilla',   // v2 — antes 'choropleth-distrito'; valor nuevo en el enum de
                           // LayerDefinition (src/config/map-layer-definitions.ts) porque
                           // ninguno de los existentes describe "celdas sobre puntos reales"
}
```

### v2 — de choropleth de 19 distritos a rejilla real de ~198 celdas

`GeoJsonLayer` sobre `featureCollectionAltimetriaPuntos(puntos)` (celdas cuadradas de ~600 m,
una por muestra real del IGN) en vez de sobre el geojson de 19 distritos. Sigue siendo
`GeoJsonLayer` filled, no un `HeatmapLayer` de `@deck.gl/aggregation-layers` — no se instala esa
dependencia (descartada también en v2, mismo razonamiento que v1 §5: interpolar entre celdas de
~600 m inventaría una suavidad continua que el dato no respalda; una celda por muestra real es
honesta con la resolución real de la fuente). Color por `elevacionM` de cada celda, no por la
media del distrito — ver §1b para el razonamiento completo.

### Paleta — tinta hipsométrica re-escalada (v2, reemplaza el lerp de 2 colores de v1)

Rampa de 7 paradas (`RAMPA_HIPSOMETRICA` en `src/main.ts`), interpolación lineal por tramos, no
un lerp de 2 puntos — ver razonamiento completo en §1a:

| Elevación | Color | Rol |
|---|---|---|
| 0 m | `rgb(27,94,32)` — verde oscuro | litoral/huerta, cota ~0 |
| 5 m | `rgb(76,140,64)` | |
| 10 m | `rgb(142,172,79)` | verde-oliva |
| 15 m | `rgb(190,183,93)` | amarillo-verdoso |
| 20 m | `rgb(223,179,95)` | amarillo-ocre |
| 30 m | `rgb(200,138,82)` | naranja tostado |
| 45 m | `rgb(141,94,72)` — siena | interior, cota alta |

Nótese la densidad de paradas: 4 tramos en los primeros 20 m (donde cae el 90% del dato real),
solo 2 en los 25 m restantes — resolución de color proporcional a dónde está el dato, no
repartida a partes iguales como si hubiera relieve de sierra. Fuera de [0, 45] se satura al
extremo más cercano (mismo patrón que `colorTemperaturaZona`, spec 050). Alpha 190 — igual que
v1, para no tapar el mapa base ni competir visualmente con `riesgo-escorrentia` si ambas capas
están activas a la vez.

La leyenda (`renderAltimetriaLeyenda`) pinta una barra de degradado CSS generada por
`cssGradienteHipsometrico()` a partir de la misma rampa que usa `colorHipsometrico()` en el
mapa — una única fuente de verdad, no puede desincronizarse leyenda vs. mapa.

## 6. Criterios de aceptación (Definition of Done)

- [x] Entrada en `LAYER_REGISTRY` (`altimetria`, `grupo: 'primaria'`, `agregacion: 'rejilla'`).
- [x] Checkbox propio en el selector de Prioritarias (sin cambios de v1).
- [x] `GeoJsonLayer` sobre la rejilla real de puntos (no sobre los 19 distritos), color por
      tinta hipsométrica de 7 paradas re-escalada a 0-45 m.
- [x] Leyenda con barra de degradado (misma rampa que el mapa) + distrito más alto/bajo reales
      (media) + recuento de puntos reales usados.
- [x] Atribución "IGN" visible en la leyenda, sin `metaFrescura`/timestamp — dato estático,
      igual criterio que v1 y que el panel de `/inteligencia` (spec 044).
- [x] `META_CAPAS` del glosario actualizado (ya no dice "19 distritos, rejilla descartada").
- [x] `scripts/seed-altimetria.ts` persiste también `data/altimetria-puntos.json` (198 puntos
      reales), reejecutado en vivo el 2026-09-30 contra el WMS del IGN.
- [x] `GET /api/emergencia/v1/altimetria` sirve `{ distritos, puntos }` — verificado con
      `read_network_requests` en el Browser pane que el payload real incluye los 198 puntos.
- [x] Tests nuevos para las funciones puras de geometría (`celdaCuadrada`,
      `featureCollectionAltimetriaPuntos`) en `src/services/altimetria.test.ts`.
- [x] `typecheck`/`test` (479 tests, 67 ficheros)/`build` verdes.
- [ ] **Pendiente real, no de esta spec — mismo bloqueo ya documentado en v1**: confirmación
      visual pixel a pixel de la rejilla pintada sobre el mapa. Esta sesión hizo un intento
      exhaustivo (recarga limpia repetida, zoom, más de 20 capturas, inspección de consola/red)
      y confirmó que el dato llega bien al cliente (payload real con 198 puntos verificado por
      `read_network_requests`) pero el `GeoJsonLayer` interleaved de deck.gl no llegó a pintar
      en ninguna de las capturas — **el mismo síntoma se reprodujo igual de forma idéntica
      probando otras capas ya `Implemented` en producción** (`riesgo-escorrentia`,
      `pulso-distrito`, `temperaturaZona`), lo que confirma que es el bug de renderizado
      intermitente de MapLibre GL v6 + deck.gl interleaved en `npm run dev` ya documentado (spec
      050 §6, memoria de proyecto "Bug de MapLibre GL v6"), no una regresión de esta spec. El
      código sigue el patrón exacto de `GeoJsonLayer` ya verificado visualmente en producción
      para esas otras capas.

## 7. Riesgos y fuera de alcance

- **Resolución de ~198 celdas de ~600 m, no una interpolación continua** — sigue siendo
  discreta, ahora más fina que v1 pero no un relieve suavizado; ver razonamiento en §1b.
  Documentado en el glosario para no leerse como más preciso de lo que es.
- **Puntos de borde/outlier sin validar contra terreno real**: los 2 valores por encima de 40 m
  en Poblats de l'Oest (máx. 50.7 m) no se han contrastado sobre el terreno — podrían ser una
  estructura elevada puntual (paso elevado, terraplén) más que relieve natural. No se filtran ni
  se "limpian": es el dato real que devuelve el WMS del IGN, y la rampa ya los trata como
  extremo saturado sin distorsionar el resto de la escala (ver §1a).
- **Redundancia aparente con el panel de `/inteligencia`** (`#altimetria-panel`, spec 044) — se
  mantiene igual que en v1: ese panel sigue mostrando el ranking de texto por distrito, esta
  capa es la versión espacial de alta resolución, no lo sustituye.
- Sin cambios de pipeline/cron — sigue siendo un seed manual único, ahora con un fichero de
  salida más (`data/altimetria-puntos.json`).
- Sigue sin instalarse `@deck.gl/aggregation-layers` — ver razonamiento en §5.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-25 | Creación e implementación (spec ligera, reutiliza sin cambios la fuente y el endpoint ya `Implemented` en spec 044) — `GeoJsonLayer` choropleth de 19 distritos, lerp lineal de 2 colores (verde→marrón), leyenda, `META_CAPAS`. `typecheck`/`test`/`build` verdes. Verificación visual pixel a pixel pendiente por el bug de render de MapLibre documentado en spec 050 §6. |
| 2 | 2026-09-30 | Rediseño cartográfico completo a petición del usuario ("ingeniero topográfico senior", tinta hipsométrica de verdad). Investigada la convención real (IGN, Natural Earth cross-blended hypsometric tints, §1a) y re-escalada a 0-45 m con más resolución de color en la franja baja. Reexaminada la resolución espacial con los datos reales delante (§1b): se sube de 19 distritos a ~198 celdas de la rejilla real del IGN (~600 m) — `scripts/seed-altimetria.ts` ahora persiste los puntos (antes los descartaba), endpoint ampliado con `puntos`, dos funciones nuevas puras en `src/services/altimetria.ts` (`celdaCuadrada`, `featureCollectionAltimetriaPuntos`) con tests. Leyenda con barra de degradado generada de la misma rampa que pinta el mapa. Sin `HeatmapLayer` ni dependencia nueva — sigue siendo `GeoJsonLayer`. `typecheck`/`test` (479 tests)/`build` verdes. Verificación visual pixel a pixel sigue pendiente por el mismo bug de MapLibre GL v6 de v1 — reconfirmado en esta sesión que afecta por igual a otras capas ya `Implemented` en producción, no es específico de esta spec. |
