# Spec 050 — Temperatura por zona como capa de mapa

```yaml
id: 050
titulo: "Temperatura por zona (AVAMET) como capa activable en /mapa"
estado: Implemented
tipo: capa
depende_de: [000, 044]
propietario: ""
version: 4
```

> Origen: petición explícita del usuario (2026-09-24) — quiere la temperatura por zonas de
> Valencia como capa propia en Prioritarias, justo después de riesgo de acumulación de agua.

## 1. Problema / motivación

La temperatura real por zona de la ciudad (no un único dato puntual del centro) ya se
calcula y se muestra como texto en `/inteligencia` desde la spec 044 v4 (bloque AVAMET de
`#meteo-zona-panel`), pero no existe como capa visual en `/mapa`. Esta spec no añade ninguna
fuente de datos nueva — solo expone en el mapa un dato que el proyecto ya tiene.

## 2. Fuente(s) de datos

Ninguna fuente nueva. Reutiliza tal cual la ya `Implemented` en spec 044 v4:

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| AVAMET — 15 estaciones reales dentro de Valencia ciudad | `mxo-mxo.php?territori=c15` (AVAMET), normalizado por `src/services/avamet-estaciones.ts` | Ya en uso desde spec 039/044 | No | Reutilizada — verificado en esta sesión (2026-09-24) que el endpoint interno ya existente `GET /api/emergencia/v1/avamet` devuelve `temperaturaC` real con `lat`/`lon` por estación (ej. Carpesa — Alqueries del Pelut: 27 °C, `observadoEn` en vivo) |

## 3. Contrato de datos

Ninguno nuevo — reutiliza `EstacionAvamet` (`src/services/avamet-estaciones.ts`, spec 044) tal
cual, en concreto los campos `id`, `nombre`, `lat`, `lon`, `temperaturaC`, `observadoEn`. Esta
spec no toca ese contrato.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna nueva — reutiliza el polling ya activo del endpoint `emergencia/v1/avamet` (spec 044) |
| TTL en caché | El mismo que ya tiene ese endpoint — sin cambios |
| Comportamiento si la fuente falla | El mismo que ya tiene ese endpoint — sin cambios |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/avamet` (ya existe, sin cambios) |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'temperaturaZona',
  specId: '050',
  grupo: 'primaria',        // pedido explícito del usuario, 2º lugar tras riesgo de agua
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',       // 13-15 estaciones — insignia + valor, igual patrón que precipitación (spec 051)
}
```

**v3 (2026-09-25, petición del usuario)** — cambio de diseño visual, sin tocar el contrato de
datos: pasa de un `ScatterplotLayer` plano (un punto de color, sin texto) a una **insignia con
el valor numérico legible encima**, calcada del mapa embebido de AVAMET
(`avamet.org/mxo-mxo.php?territori=c15`, pestaña "Temp actual °C" — verificado en vivo en esta
sesión: círculo de color fijo en pantalla con el número en blanco centrado dentro, mismo tamaño
a cualquier zoom). Implementación: dos capas por estación —

- `ScatterplotLayer` de fondo (`id: 'temperatura-zona'`), `radiusUnits: 'pixels'`,
  `getRadius: RADIO_INSIGNIA_ZONA_PX` (14px fijos — no crece/encoge con el zoom, igual que la
  insignia real de AVAMET), color por gradiente frío→cálido sobre `temperaturaC`
  (`colorTemperaturaZona`, sin cambios respecto a v2) + borde blanco para que se distinga del
  fondo del mapa.
- `TextLayer` encima (`id: 'temperatura-zona-valor'`), `getText: (e) => \`${Math.round(e.temperaturaC)}°\``,
  texto blanco centrado (`getTextAnchor:'middle'`, `getAlignmentBaseline:'center'`) con contorno
  oscuro (`outlineWidth`/`outlineColor`) para legibilidad sobre cualquier color de fondo del mapa.

El color por gradiente (v2) se mantiene como codificación redundante — la insignia sigue
comunicando "frío/cálido" de un vistazo aunque no se lea el número, no se ha perdido esa señal
al añadir el texto.

**v4 (2026-10-01, petición explícita del usuario)** — "una superficie de color que permita de
forma visual ver en qué zonas hay más calor... [como] la altimetría". Añade una superficie de
color continua **debajo** de la insignia (que no se toca: sigue siendo el dato exacto por
estación, siempre encima). Diferencia honesta con la petición original del usuario (que pedía
"como la altimetría"): la altimetría (spec 052 v2) interpola sobre ~198 muestras **reales** del
IGN en una rejilla regular — aquí solo hay 13-15 estaciones AVAMET reales y muy dispersas (650 m
entre vecinas en el casco urbano, hasta 4.8 km para Carpesa, aislada al norte — verificado en
vivo el 2026-10-01). No se puede fingir la resolución de 052: esto es una **estimación por
interpolación** (IDW — inverse distance weighting, Shepard 1968), no una rejilla de datos
medidos, y se presenta así en la leyenda sin ambigüedad.

Método elegido y por qué, con la densidad real del dato como justificación (ver
`src/services/interpolacion-meteo.ts`, nuevo, con tests):

- **IDW sobre una rejilla de ~250 m de paso** en vez de un choropleth por distrito (perdería
  toda la variación submunicipal que es justo lo que se pidió) o un diagrama de
  Voronoi/Delaunay puro (produce fronteras duras arbitrarias entre celdas vecinas que no
  reflejan ninguna frontera física real — con solo 13-15 puntos el borde de Voronoi es ruido,
  no señal). IDW con potencia 2 da un degradado continuo y es el método estándar para variables
  intensivas (temperatura, no densidad) cuando se interpola desde puntos dispersos.
- **Corte de cobertura a 2.5 km de la estación real más cercana** — cada celda de la rejilla
  que quede más lejos de cualquier estación real se descarta, no se pinta. Este radio se eligió
  a partir del espaciado real verificado entre estaciones (típico 650 m - 2 km dentro del
  casco urbano, máximo "razonable" 2.46 km entre las dos estaciones de l'Albufera) de forma que
  conecta el clúster urbano real sin tender un puente ficticio hacia estaciones genuinamente
  aisladas (Carpesa, a 4.8 km de la más cercana, queda como una isla propia de cobertura, no
  conectada al resto de la ciudad por un degradado inventado).
- **Alpha decreciente con la distancia a la estación más cercana** dentro de ese radio de 2.5
  km — casi opaco junto a una estación real, desvanecido hacia el borde de cobertura. Comunica
  visualmente que la certeza baja con la distancia al dato real, en vez de un borde duro que
  sugeriría el mismo nivel de confianza en toda la superficie.
- **Rampa de color reutilizada de la insignia** (`colorEscalaTemperatura`, factorizada de
  `colorTemperaturaZona` para aceptar un número en vez de una `EstacionAvamet` completa) —
  mismo gradiente azul→rojo (10-35°C), sin introducir una escala nueva que pudiera leerse en
  contradicción con la insignia.

Implementación: `rejillaInterpolada()` + `featureCollectionInterpolada()` (ambas puras, con
tests) generan un `GeoJSON.FeatureCollection` de celdas cuadradas de ~250 m, pintado con un
`GeoJsonLayer` nuevo (`id: 'temperatura-zona-superficie'`) **antes** en el array de capas que
la insignia (se pinta primero, queda debajo). Se recalcula en cada `renderLayers()` mientras la
capa está activa — dinámico de verdad: cada refresco de AVAMET (polling de 15 min, el mismo de
siempre) recalcula la rejilla con las `estacionesAvamet` actuales, no es un snapshot fijo.
Leyenda ampliada con la barra de degradado (`cssGradienteTemperatura`, misma rampa que pinta el
mapa) y una nota explícita de que la superficie es una estimación interpolada con corte de
cobertura, no una medición continua.

## 6. Criterios de aceptación (Definition of Done)

- [x] Entrada nueva en `LAYER_REGISTRY` (`temperaturaZona`, `grupo: 'primaria'`).
- [x] Checkbox propio en el selector de Prioritarias, justo después de "Riesgo de acumulación
      de agua" (orden pedido por el usuario).
- [x] Insignia (círculo de color fijo en pantalla, 14px) + valor numérico ("23°") encima,
      color por `temperaturaC` (gradiente azul→rojo, 10-35°C), con mini-leyenda (más
      cálida/más fría, calculadas de los datos reales). v3 — antes (v2) era un punto de color
      sin texto.
- [x] Frescura (fecha+hora) y atribución "AVAMET" visibles en la leyenda.
- [x] Verificado con datos reales end-to-end: `estacionesAvamet` se llena con las 13
      estaciones activas del endpoint (`GET /api/emergencia/v1/avamet`, ya `Implemented`),
      la leyenda calcula correctamente la más cálida/fría reales (verificado en navegador:
      "Colegio Diocesano San Juan Bosco (27.8°C)" / "el Saler — Platja de la Garrofera
      (24.9°C)"). `typecheck`, 464/464 tests y `build` verdes.
- [x] Verificado en navegador (2026-09-25) que activar el checkbox pinta el mapa con tiles y
      la capa deck.gl activa — confirma que `renderLayers()` no lanza excepción con la
      insignia+texto nueva. La confirmación pixel a pixel del círculo/número exactos sigue
      intermitentemente bloqueada por el mismo bug de renderizado de MapLibre GL v6 ya
      documentado (condición de carrera no determinista, solo en `npm run dev`, ajena a esta
      capa — afecta por igual al mapa base y a capas ya `Implemented` como Valenbisi). No se
      ha tocado ese bug (CLAUDE.md, aviso de la sesión).
- [x] **v4** — Superficie de color continua (IDW) por debajo de la insignia, con corte de
      cobertura a 2.5 km de la estación real más cercana y alpha decreciente con la distancia.
      Dos funciones puras nuevas con tests (`rejillaInterpolada`, `valorIdw`,
      `featureCollectionInterpolada` en `src/services/interpolacion-meteo.ts`, 11 tests).
      Leyenda ampliada con barra de degradado + nota de honestidad sobre la interpolación.
      `agregacion` de la capa pasa de `'punto'` a `'mixta'` en `LAYER_REGISTRY`.
      `typecheck`, 490/490 tests y `build` verdes. Verificado con datos reales: 13 estaciones
      en vivo (verificación directa contra `avamet.org`, 2026-10-01) producen 1856 celdas de
      rejilla tras el corte de cobertura (de un bbox candidato de ~4800 celdas — confirma que
      el filtro de distancia realmente descarta zonas sin cobertura real, no solo en teoría).
      Confirmación visual en navegador bloqueada por el mismo bug de MapLibre GL v6 de más
      arriba (en esta sesión además confirmado que el Browser pane del entorno de verificación
      se reporta a sí mismo como "currently hidden" — `document.hidden`/`visibilityState`
      quedan en `true`/`hidden` de forma persistente, lo que pausa a nivel de motor todo
      `requestAnimationFrame`, incluido el que dispara el evento `load` de MapLibre del que
      depende `mapaListo`). Verificado en su lugar por introspección directa del `Deck`
      interno (forzando `map.fire('load')` tras confirmar `isStyleLoaded()`/`areTilesLoaded()`
      ya en `true`, para destrabar el único gate de la app que sí depende de ese evento):
      `overlay._deck.layerManager.getLayers()` muestra `temperatura-zona-superficie` y su
      sub-capa `temperatura-zona-superficie-polygons-fill` con geometría GPU real
      (`polygonTesselator`, `models`, `topModel`) construida a partir de las 1856 celdas, en el
      orden correcto (antes que `temperatura-zona`/`temperatura-zona-valor` en
      `overlay._props.layers`, confirmando que la superficie queda debajo de la insignia).

## 7. Riesgos y fuera de alcance

- **Cobertura real de solo 13-15 puntos dispersos** — v4 añade una superficie interpolada
  (IDW) para dar una lectura visual de zona, pero sigue sin ser una medición continua: el
  degradado es una estimación matemática entre estaciones reales, con corte explícito a 2.5 km
  de la estación más cercana para no fingir cobertura donde no la hay (ver §5 v4). El número
  exacto de cada insignia, no la superficie, sigue siendo el dato con el que decidir algo
  concreto — coherente con `CLAUDE.md` §4 (no presentar una estimación como si fuera más
  precisa de lo que es).
- **Redundancia aparente con la capa `meteo` (spec 001)** — `meteo` es meteorología puntual
  genérica (icono de cielo/viento) en un punto central de referencia; esta capa es
  específicamente temperatura real multi-zona. Se diferencian claramente en nombre y leyenda
  para no confundir al usuario con dos capas de "tiempo".
- Sin cambios de pipeline/backend — todo el riesgo de esta spec es de UI, no de datos.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-24 | Creación — spec ligera, reutiliza sin cambios la fuente y el endpoint ya `Implemented` en spec 044 v4. Contrato de capa propuesto, sin congelar. |
| 2 | 2026-09-24 | Implementada — entrada en `LAYER_REGISTRY`, checkbox en Prioritarias, `ScatterplotLayer` con color por temperatura, leyenda, `META_CAPAS` (glosario). Fetch/polling compartido con spec 051 (misma fuente). `typecheck`/464 tests/`build` verdes. Verificación visual pixel a pixel pendiente por un bug de render de MapLibre ajeno a esta capa (ver §6). |
| 3 | 2026-09-25 | Rediseño visual (petición del usuario): insignia (círculo 14px, color fijo) + `TextLayer` con el valor en °C encima, calcado del mapa embebido de AVAMET (verificado en vivo). Sin cambios de contrato de datos ni de endpoint. `typecheck`/`build` verdes. |
| 4 | 2026-10-01 | Petición explícita del usuario: superficie de color continua por debajo de la insignia ("como la altimetría"), siendo honestos sobre la diferencia de densidad real del dato (13-15 puntos dispersos, no 198 en rejilla). Método: IDW con corte de cobertura a 2.5 km de la estación más cercana y alpha decreciente con la distancia — nuevo `src/services/interpolacion-meteo.ts` (funciones puras, 11 tests). `agregacion` pasa de `'punto'` a `'mixta'`. Leyenda con degradado + nota de honestidad. `typecheck`/490 tests/`build` verdes. Verificado con datos reales (13 estaciones en vivo → 1856 celdas tras el corte de cobertura) e introspección directa del `Deck` interno (geometría GPU real construida); confirmación visual por captura de pantalla bloqueada por el bug de MapLibre GL v6 ya documentado, agravado en esta sesión por el Browser pane reportándose a sí mismo como no visible (`document.hidden`/rAF pausados de forma persistente, no intermitente). |
