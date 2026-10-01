# Spec 051 — Precipitación como capa de mapa

```yaml
id: 051
titulo: "Precipitación por zona (AVAMET) como capa activable en /mapa"
estado: Implemented
tipo: capa
depende_de: [000, 044]
propietario: ""
version: 4
```

> Origen: petición explícita del usuario (2026-09-24) — quiere la precipitación como capa
> propia en Prioritarias, después de temperatura por zona y zonas ZAS.

## 1. Problema / motivación

Igual que la temperatura (spec 050), la lluvia real por zona ya se calcula (AVAMET, spec 044
v4, y también `044` §lluvia/viento por distrito vía Open-Meteo) pero no existe como capa
visual propia en `/mapa`. Esta spec expone en el mapa un dato que el proyecto ya tiene, sin
fuente nueva.

## 2. Fuente(s) de datos

Ninguna fuente nueva. Misma fuente que spec 050, mismo endpoint ya `Implemented`:

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| AVAMET — 15 estaciones reales dentro de Valencia ciudad | `mxo-mxo.php?territori=c15` (AVAMET), normalizado por `src/services/avamet-estaciones.ts` | Ya en uso desde spec 039/044 | No | Reutilizada — verificado en esta sesión (2026-09-24) que `GET /api/emergencia/v1/avamet` ya devuelve `precipitacionDiaMm`/`precipitacionMesMm`/`precipitacionAnyMm` por estación en vivo (ej. Carpesa: 0 mm hoy, 90,2 mm este mes) |

## 3. Contrato de datos

Ninguno nuevo — reutiliza `EstacionAvamet` (spec 044) tal cual, en concreto `id`, `nombre`,
`lat`, `lon`, `precipitacionDiaMm`, `observadoEn`. Esta spec no toca ese contrato.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna nueva — reutiliza el polling ya activo de `emergencia/v1/avamet` |
| TTL en caché | El mismo que ya tiene ese endpoint — sin cambios |
| Comportamiento si la fuente falla | El mismo que ya tiene ese endpoint — sin cambios |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/avamet` (ya existe, sin cambios) |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'precipitacionZona',
  specId: '051',
  grupo: 'primaria',        // pedido explícito del usuario, 4º lugar (tras agua/temperatura/ZAS)
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',       // 13-15 estaciones — insignia + valor, igual patrón que temperatura (spec 050)
}
```

**v3 (2026-09-25, petición del usuario)** — mismo cambio de diseño que spec 050 v3, mismo
razonamiento (calcado del mapa embebido de AVAMET, pestaña "Prec dia mm", verificado en vivo):
insignia de color fijo (azul, `COLOR_PRECIPITACION_ZONA`) + el mm exacto como texto encima, en
vez de codificar la cantidad solo con el tamaño del punto (v2). Implementación: dos capas —

- `ScatterplotLayer` de fondo (`id: 'precipitacion-zona'`), `radiusUnits: 'pixels'`,
  `getRadius: RADIO_INSIGNIA_ZONA_PX` (14px fijos, misma constante compartida con spec 050 —
  ambas insignias miden igual en pantalla) + borde blanco.
- `TextLayer` encima (`id: 'precipitacion-zona-valor'`), texto blanco con contorno oscuro; mm
  redondeado a entero a partir de 10mm, con un decimal por debajo (`4.5`, `12`) para no perder
  precisión en lluvias suaves sin desbordar la insignia con lluvias fuertes.

El radio deja de ser la variable visual principal (v2) porque el número la sustituye — 0 mm no
se oculta, sigue siendo información (la insignia se pinta igual, con "0" dentro).

**v4 (2026-10-01, petición explícita del usuario)** — misma petición y mismo razonamiento que
spec 050 v4 ("una superficie de color que permita ver en qué zonas hay más... precipitación,
[como] la altimetría"): añade una superficie de color continua **debajo** de la insignia (que
no se toca). Comparte método, constantes de rejilla/cobertura y la función de interpolación con
spec 050 v4 (`src/services/interpolacion-meteo.ts`, agnóstica de la magnitud que interpola) —
solo cambia la rampa de color, por ser una magnitud distinta con convención cartográfica
distinta:

- **Rampa secuencial de un solo tono (NO la insignia, que sigue con el azul fijo de v3)** —
  convención real de precipitación acumulada (AEMET, servicios WMO): un único matiz de azul,
  claro = poco/nada, oscuro = mucho, nunca arcoíris (que sugeriría categorías cualitativas sin
  orden, cuando precipitación es una cantidad con orden natural). Equivalente a la paleta
  secuencial "Blues" de ColorBrewer, 5 paradas de 0 a 30 mm (`RAMPA_PRECIPITACION` en
  `src/main.ts`, saturada a partir de 30 mm — un chubasco real en Valencia la supera con
  facilidad en un día, no es el máximo histórico, solo el punto en que el tono deja de
  oscurecerse más).
- **Mismo corte de cobertura (2.5 km) y mismo alpha decreciente con la distancia** que spec
  050 v4 — mismas estaciones, mismo espaciado real, mismo razonamiento de honestidad.

Implementación: `GeoJsonLayer` nuevo (`id: 'precipitacion-zona-superficie'`), pintado antes que
la insignia en el array de capas. Dinámico: se recalcula en cada refresco de AVAMET (15 min),
compartiendo el mismo fetch/polling que spec 050 (ya documentado en §1). Leyenda ampliada con
la barra de degradado (`cssGradientePrecipitacion`) y la misma nota de honestidad sobre la
interpolación, en las dos ramas (con y sin lluvia activa).

## 6. Criterios de aceptación (Definition of Done)

- [x] Entrada nueva en `LAYER_REGISTRY` (`precipitacionZona`, `grupo: 'primaria'`).
- [x] Checkbox propio en el selector de Prioritarias — orden final: agua, temperatura,
      precipitación (ZAS, spec 049, se insertará entre temperatura y precipitación cuando
      se implemente).
- [x] Insignia (color fijo azul, 14px) + valor en mm encima, con mini-leyenda. v3 — antes
      (v2) el radio codificaba los mm, sin texto.
- [x] Frescura (fecha+hora) y atribución "AVAMET" visibles en la leyenda.
- [x] Verificado con datos reales end-to-end: sin lluvia activa en el momento de la
      verificación (2026-09-24), la leyenda muestra correctamente "Sin lluvia registrada hoy
      en ninguna estación" (rama de `renderPrecipitacionZonaLeyenda` para 0 estaciones con
      lluvia, no una capa vacía/rota) — confirmado en navegador. `typecheck`, 464/464 tests
      y `build` verdes.
- [x] Verificado en navegador (2026-09-25) que activar el checkbox pinta el mapa con tiles y
      la capa deck.gl activa, sin excepciones con la insignia+texto nueva.
- [ ] **Pendiente real, no de esta spec**: verificar con lluvia real activa (rama con
      `conLluvia.length > 0`, cubierta por lectura del código pero no observada en vivo) y
      confirmación visual pixel a pixel de la insignia — mismo bug de renderizado
      intermitente de MapLibre GL v6 ajeno a esta capa, documentado en spec 050 §6.
- [x] **v4** — Superficie de color continua (IDW, rampa secuencial de azules) por debajo de la
      insignia, mismo corte de cobertura (2.5 km) y mismo alpha decreciente con la distancia
      que spec 050 v4 — comparte `src/services/interpolacion-meteo.ts` (11 tests ya cubren
      ambas magnitudes, la función es agnóstica del valor que interpola). Leyenda ampliada con
      barra de degradado + nota de honestidad, en las dos ramas (con/sin lluvia activa).
      `agregacion` pasa de `'punto'` a `'mixta'` en `LAYER_REGISTRY`. `typecheck`, 490/490
      tests y `build` verdes. Verificado con datos reales (13 estaciones en vivo → 1856 celdas
      tras el corte de cobertura, igual que spec 050) e introspección directa del `Deck`
      interno: `overlay._deck.layerManager.getLayers()` muestra `precipitacion-zona-superficie`
      y su sub-capa `-polygons-fill` con geometría GPU real, antes que
      `precipitacion-zona`/`precipitacion-zona-valor` en `overlay._props.layers` (superficie
      debajo de la insignia, como se pidió). Confirmación visual por captura de pantalla
      bloqueada por el mismo bug de MapLibre GL v6 — ver detalle completo en spec 050 v4 §6
      (Browser pane reportándose como no visible, `document.hidden` persistente, no
      intermitente). La rama de lluvia real activa (`conLluvia.length > 0`) sigue sin
      observarse en vivo — no llovía en Valencia en el momento de esta verificación
      (2026-10-01) — mismo pendiente real ya anotado arriba, ajeno a esta spec.

## 7. Riesgos y fuera de alcance

- **Cobertura real de solo 13-15 puntos dispersos** — v4 añade una superficie interpolada
  (IDW) para dar una lectura visual de zona, pero sigue sin ser una medición continua: el
  degradado es una estimación matemática entre estaciones reales, con corte explícito a 2.5 km
  de la estación más cercana para no fingir cobertura donde no la hay (ver §5 v4). El mm exacto
  de cada insignia, no la superficie, sigue siendo el dato con el que decidir algo concreto.
- **Redundancia aparente con `riesgo-escorrentia` (spec 046)**, que ya usa lluvia por
  distrito (vía Open-Meteo, no AVAMET) para calcular su índice — esta capa es un dato crudo
  (mm reales por estación), no el índice compuesto de 046. Se documenta la diferencia en el
  glosario para que no parezcan la misma capa duplicada.
- **Dos fuentes de lluvia coexistiendo en el proyecto** (Open-Meteo interpolado por distrito
  en 044/046, AVAMET real por estación aquí) — es una discrepancia conocida y aceptada, no un
  bug: son fuentes distintas para preguntas distintas (interpolación de modelo por distrito
  vs. estación real puntual). No se intenta reconciliar ambas en esta spec.
- Sin cambios de pipeline/backend — mismo caso que spec 050, todo el riesgo es de UI.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-24 | Creación — spec ligera, reutiliza sin cambios la fuente y el endpoint ya `Implemented` en spec 044 v4. Contrato de capa propuesto, sin congelar. |
| 2 | 2026-09-24 | Implementada — entrada en `LAYER_REGISTRY`, checkbox en Prioritarias, `ScatterplotLayer` con radio por mm de lluvia, leyenda, `META_CAPAS` (glosario). Fetch/polling compartido con spec 050 (misma fuente). `typecheck`/464 tests/`build` verdes. Verificación con lluvia real activa y confirmación visual pixel a pixel pendientes (ver §6). |
| 3 | 2026-09-25 | Rediseño visual (petición del usuario): insignia (círculo 14px, color fijo) + `TextLayer` con el mm encima, calcado del mapa embebido de AVAMET (verificado en vivo). El radio deja de codificar la cantidad de lluvia. Sin cambios de contrato de datos ni de endpoint. `typecheck`/`build` verdes. |
| 4 | 2026-10-01 | Petición explícita del usuario (misma que spec 050 v4): superficie de color continua por debajo de la insignia, rampa secuencial de azules (convención AEMET/WMO, no arcoíris). Comparte método/código con spec 050 v4 (`src/services/interpolacion-meteo.ts`, IDW + corte de cobertura 2.5 km + alpha por distancia). `agregacion` pasa de `'punto'` a `'mixta'`. Leyenda con degradado + nota de honestidad en ambas ramas. `typecheck`/490 tests/`build` verdes. Verificado con datos reales e introspección directa del `Deck` interno (igual evidencia que spec 050 v4); confirmación visual por captura bloqueada por el mismo bug de MapLibre GL v6. Lluvia real activa sigue sin observarse en vivo (no llovía el día de la verificación) — pendiente heredado de v2/v3, ajeno a esta spec. |
