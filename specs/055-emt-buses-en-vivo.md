# Spec 055 — Autobuses EMT en vivo

```yaml
id: 055
titulo: "Posición en vivo de los autobuses EMT + paradas"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 1
```

> Origen: investigación de "infraestructura crítica" pedida por el usuario (2026-10-02) —
> de los 4 sectores analizados (transporte/energía/agua/telecom, ver hallazgos en
> `docs/investigacion/` pendiente de consolidar), transporte fue el único con una fuente
> realmente "en vivo" y sin ambigüedad de sensibilidad (nodos de transporte público, no
> infraestructura operativa secreta). El usuario eligió esta pieza como la primera a
> formalizar, por delante de nodos de transporte estáticos (metro/aeropuerto/puerto),
> embalses de abastecimiento y electromovilidad.

## 1. Problema / motivación

¿Dónde está cada autobús de la EMT circulando ahora mismo por Valencia, y dónde están sus
paradas? Es la primera capa de transporte público del producto — mismo rol que tráfico
(spec 004) o Valenbisi (spec 005): movilidad real, en vivo, no un proxy.

## 2. Fuente(s) de datos — due-diligence 2026-10-02

Mismo proveedor que el resto de capas del geoportal (patrón ya usado en specs 000/004/005/
026/038/046/049/054): ArcGIS Server del Ajuntament de València, licencia CC BY 4.0, sin
API key.

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| **Buses EMT en vivo** (capa agregada, todas las líneas) | `https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer/384/query?where=1=1&outFields=gid,linea,trayecto,fecha&outSR=4326&f=json` | Geoportal del Ayuntamiento (mismo marco que el resto de capas ya `Implemented`) | No | **2026-10-02** — `curl` real. Campos: `gid`, `linea` (p. ej. "C2", "30", "N3"), `trayecto` (descripción del sentido/recorrido), `fecha` (epoch ms, momento de la última posición GPS del bus). **Cadencia medida en vivo**: dos llamadas con 5 s de diferencia muestran `fecha` avanzando ~15-20 s por bus — es tracking GPS real, no un snapshot estático. Hora de verificación: 00:25 local (servicio nocturno, solo 15 buses activos en ese momento — esperable, no es un fallo: de día el número sube a varios cientos). El servicio tiene **~262 sub-capas** (una `Buses`/`Paradas`/`Ruta` por línea) pero la **384 "Buses EMT" es la agregada con todas las líneas a la vez** — no hace falta consultar las 262. |
| **Paradas EMT** | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/226/query?where=suprimida=0&outFields=id_parada,denominacion,lineas,suprimida&outSR=4326&f=json` | CC BY 4.0 | No | **2026-10-02** — `curl` real: **1155 paradas** no suprimidas, en una sola petición (`maxRecordCount` del servicio es 2000, no hace falta paginar). Campo `lineas` es un string separado por comas (p. ej. `"16,26,6"`). Campo `proximas_llegadas` es solo una **URL** a una página HTML (`emtvalencia.es/QR.php?...`), no un feed de datos — **no se usa** (ver §7). |

**Lo que se descartó explícitamente**: consultar las ~262 sub-capas por línea
(`Linea C1/Buses`, `Linea 4/Buses`, etc.) — la capa `384` ya las agrega todas en una sola
petición, mismo criterio de simplicidad que el resto del proyecto (una llamada, no N).

## 3. Contrato de datos (normalizado)

```typescript
interface BusEmt {
  id: string;          // gid
  linea: string;        // "C2", "30", "N3"...
  trayecto: string;      // descripción del sentido/recorrido, tal cual la fuente
  lat: number;
  lon: number;
  observedAt: string;    // ISO 8601 — `fecha` de origen (momento real del GPS)
  fetchedAt: string;     // ISO 8601 — momento en que se cacheó
  source: 'ajuntament-valencia-geoportal';
}

interface ParadaEmt {
  id: string;          // id_parada
  nombre: string;        // denominacion
  lineas: string[];       // `lineas` partido por comas
  lat: number;
  lon: number;
  fetchedAt: string;     // ISO 8601 — momento del seed
  source: 'geoportal-valencia-emt-paradas';
}
```

## 4. Pipeline (seed → caché → endpoint)

**Buses (en vivo)** — mismo patrón que tráfico/Valenbisi:

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | No aplica — la fuente se consulta al vuelo con caché corta. |
| TTL en caché | 20 s — medido en vivo (§2), cada bus actualiza su posición cada 15-20 s; pedirlo más a menudo no aporta dato nuevo. |
| Comportamiento si la fuente falla | Stale-on-error, reutiliza `getOrFetch()` de `src/server/_shared/cache.ts` sin cambios. |
| Clave de caché | `emt:valencia-buses:v1` |
| Endpoint interno que sirve el dato | `GET /api/transporte/v1/emt-buses` |

**Paradas (estático)** — mismo patrón que equipamientos críticos (spec 054):

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna — dato estático (seed manual, re-ejecutable a mano si cambia la red de líneas). |
| TTL en caché | N/A — fichero versionado en `data/emt-paradas.json`. |
| Comportamiento si la fuente falla | El seed falla alto y visible — script manual, no cron en producción. |
| Clave de caché | N/A |
| Endpoint interno que sirve el dato | `GET /api/transporte/v1/emt-paradas` |

## 5. Contrato de capa de mapa

```typescript
// Buses — señal "ahora mismo", mismo grupo que tráfico.
{
  key: 'emtBusesEnVivo',
  specId: '055',
  grupo: 'primaria',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',
}
// Paradas — referencia geográfica fija, mismo grupo que Valenbisi/equipamientos.
{
  key: 'emtParadas',
  specId: '055',
  grupo: 'contexto',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',
}
```

Buses: `ScatterplotLayer` con color único (no hay forma razonable de dar un color propio a
~60 líneas sin que la leyenda sea inútil) — se distingue por un tooltip al pasar el ratón
(línea + trayecto + frescura del dato), mismo patrón bespoke que la spec 026 (incidencias de
vía pública) usa para su propio tooltip, sin construir un sistema genérico. Paradas: mismo
patrón que equipamientos críticos (spec 054) — punto fijo, clic expande la leyenda.

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (no solo documentación) — ver §2.
- [x] Endpoint `GET /api/transporte/v1/emt-buses` responde con el contrato de la §3,
      caché de 20 s y stale-on-error verificados (`src/server/emt-buses-en-vivo.test.ts`)
      y contra el dev server real (HTTP 200, buses reales con posición GPS).
- [x] Seed genera `data/emt-paradas.json` con 1155 paradas reales (`npm run seed:emt-paradas`).
- [x] Endpoint `GET /api/transporte/v1/emt-paradas` responde con el contrato de la §3 —
      verificado contra el dev server real (HTTP 200, 1155 paradas).
- [x] Ambas capas visibles en `/mapa`, cada una con su checkbox en el grupo correcto del
      selector (buses en "Prioritarias", paradas en "Contexto e informativas") — verificado
      en navegador: leyenda de buses mostrando el recuento real en vivo (cambiando de 19 a
      20 entre dos refrescos durante la propia verificación) y leyenda de paradas con las
      1155 ubicaciones.
- [x] Leyenda de paradas con recuento total + fuente — verificado en navegador.
- [x] Entradas en `META_CAPAS` (`src/ui/glosario.ts`) — test `capasSinMetadato` en verde.
- [x] `typecheck`/`test` (525/525)/`build` limpios.
- [~] Tooltip de buses (línea + trayecto + frescura) al pasar el ratón: implementado con el
      mismo patrón ya probado de `buildViaPublicaTooltip` (spec 026), puntos visibles en el
      mapa con el color/borde esperado — **no se pudo confirmar visualmente el tooltip en
      sí** en esta sesión por la dificultad de apuntar con precisión de píxel a un bus en
      movimiento dentro del panel de verificación (limitación ya documentada del entorno en
      specs 050/051/052, no específica de esta capa). Revisar en un navegador real si al
      pasar el ratón sobre un bus no aparece el tooltip.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance explícito en v1**: "próximas llegadas" por parada — el campo
  `proximas_llegadas` de la fuente es solo una URL a una página HTML pensada para
  humanos (no un feed de datos), y una investigación previa confirmó que su variante AJAX
  no devuelve una lista fiable. Si en el futuro EMT/FGV publica un GTFS-RT real, es una
  spec nueva, no una ampliación forzada de esta.
- **Fuera de alcance**: Metrovalencia (FGV), aeropuerto, puerto — tienen su propia spec
  candidata (nodos de transporte, estático/mejor-esfuerzo), no se mezclan aquí.
- **Riesgo:** el número de buses activos varía mucho por hora (de ~15 de madrugada a varios
  cientos en hora punta) — es el comportamiento real del servicio, no un fallo; la leyenda
  debe mostrar el recuento actual, nunca un número fijo esperado.
- **Riesgo:** `trayecto` es texto libre de la fuente, no siempre indica el sentido con
  claridad (p. ej. abreviado) — se muestra tal cual, sin reinterpretar.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-10-02 | Creación — due-diligence con llamadas reales (incluye medición de cadencia de refresco en vivo), contrato de datos/capa congelado. Implementada de punta a punta en la misma sesión: servicios de normalización (`src/services/emt-buses.ts`, `src/services/emt-paradas.ts`, 6 tests), endpoint en vivo (`GET /api/transporte/v1/emt-buses`, TTL 20 s) y estático (`GET /api/transporte/v1/emt-paradas`), seed (`scripts/seed-emt-paradas.ts` → `data/emt-paradas.json`, 1155 paradas), dos capas nuevas en `/mapa` (`emtBusesEnVivo` en "Prioritarias", `emtParadas` en "Contexto e informativas") con tooltip de buses y leyenda de paradas. 525/525 tests, `typecheck`/`build` verdes, verificado contra el dev server real con datos en vivo. Pasa a `Implemented`. |
