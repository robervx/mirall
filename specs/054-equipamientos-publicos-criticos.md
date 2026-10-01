# Spec 054 — Equipamientos públicos críticos (sanidad, policía, bomberos)

```yaml
id: 054
titulo: "Equipamientos públicos críticos (hospitales, policía, bomberos) en el mapa"
estado: Implemented
tipo: capa
depende_de: [000]
propietario: ""
version: 1
```

> Origen: petición explícita del usuario (2026-10-01) — quiere identificar rápido en el mapa
> dónde están los equipamientos críticos de la ciudad (ejemplos citados: hospitales, bomberos,
> protección civil), "que se pongan de color, como las zonas ZAS". Alcance acotado tras
> confirmación explícita del usuario (2026-10-01): **equipamientos públicos abiertos**
> (sanidad/bomberos/policía), no infraestructura sensible — ver CLAUDE.md §4 y §2 "Fuera de
> alcance" de esta spec.

## 1. Problema / motivación

¿Dónde está el hospital, la comisaría o el parque de bomberos más cercano a una zona de la
ciudad, para orientarse rápido en una emergencia o al razonar sobre cobertura de servicios? Es
una capa de **referencia geográfica**, no de estado en vivo (los equipamientos no cambian de un
día para otro) — mismo rol que la capa de distritos (spec 000): contexto fijo sobre el que leer
el resto de señales.

## 2. Fuente(s) de datos — due-diligence 2026-10-01

Verificado con llamadas `curl` reales contra el geoportal, mismo patrón ArcGIS ya usado en
specs 026/038/046/049.

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el |
|---|---|---|---|---|
| **Equipamientos municipales** (geoportal, capa única con todo tipo de equipamiento público) | `https://geoportal.valencia.es/server/rest/services/OPENDATA/SociedadBienestar/MapServer/1/query?where=<filtro>&outFields=equipamien,clase,idclase,telefono&outSR=4326&f=geojson` | Geoportal del Ayuntamiento (mismo marco que el resto de capas `OPENDATA/*` ya `Implemented`) | No | 2026-10-01 — **2919 puntos totales** en la capa completa; filtrados a los 3 tipos de esta spec: **75** `idclase='8'` ("Instalaciones sanitarias" — hospitales + centros de salud + consultorios, ej. Hospital Clínico Universitario, Hospital La Fe (coordinación trasplantes), Hospital Quirónsalud, decenas de centros de salud), **25** `idclase='12'` ("Policía" — comisarías + unidades), **6** parques de bomberos (buscados por nombre, `equipamien LIKE 'PARQUE%BOMBEROS%'` — ver hallazgo de calidad de dato abajo). `outSR=4326` devuelve lat/lon directo en el GeoJSON, sin reproyectar a mano (el CRS nativo de la capa es EPSG:25830/ETRS89 UTM 30N) |

**Hallazgo de calidad del dato, no un error de búsqueda:** el campo `idclase`/`clase` de esta
capa es inconsistente para bomberos — los 6 parques reales están repartidos entre `idclase='11'`
("Oficinas municipales", 1 caso) y `idclase='22'` ("invisible", 5 casos), ninguno bajo una clase
"Bomberos" propia. Se identifican por **nombre** (`equipamien LIKE 'PARQUE%BOMBEROS%'`), no por
`idclase` — documentado aquí para que el seed no dependa de una categoría que no existe de
verdad en la fuente.

**Lo que se buscó y NO está en esta fuente (ni en ninguna fuente pública encontrada):**
"Protección Civil" como equipamiento propio — sin resultados buscando por nombre (`PROTECCION`,
`EMERGENC`, `SAMU`, `112`) en toda la capa. No se inventa esta categoría; si el usuario tiene una
fuente concreta en mente, se añade en una versión futura de esta spec.

## 3. Contrato de datos (normalizado)

```typescript
type CategoriaEquipamientoCritico = 'sanidad' | 'policia' | 'bomberos';

interface EquipamientoCritico {
  id: string;           // `identifica` de la fuente (código interno del geoportal)
  nombre: string;        // `equipamien`, tal cual (mayúsculas de origen, no se reescribe)
  categoria: CategoriaEquipamientoCritico;
  lat: number;
  lon: number;
  telefono: string | null; // `telefono`, formateado solo si existe
  fetchedAt: string;     // ISO 8601 — momento en que se sirvió (dato estático, ver §4)
  source: 'geoportal-valencia-equipamientos';
}
```

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna — dato estático (equipamientos municipales no cambian de un día para otro; mismo criterio que distritos, spec 000, o la rejilla de altimetría, spec 052). Seed manual, re-ejecutable a mano si el usuario pide refrescar |
| TTL en caché | N/A — fichero versionado en `data/`, igual que `data/distritos-valencia.json` |
| Comportamiento si la fuente falla | El seed falla alto y visible (no genera un fichero vacío) — es un script manual, no un cron en producción |
| Clave de caché | N/A (fichero estático servido por el endpoint) |
| Endpoint interno que sirve el dato | `GET /api/emergencia/v1/equipamientos-criticos` |

## 5. Contrato de capa de mapa

```typescript
{
  key: 'equipamientosCriticos',
  specId: '054',
  grupo: 'contexto',       // referencia geográfica fija, no señal "ahora mismo" — igual
                            // criterio que distritos/valenbisi, no compite con las
                            // prioritarias que si cambian en vivo
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'punto',
}
```

Implementado como `ScatterplotLayer` (`src/main.ts`) con color fijo por categoría — rojo
sanidad `[220,38,38]`, azul oscuro policía `[30,64,175]` (distinto del azul de precipitación),
naranja-rojo bomberos `[234,88,12]`, revisados contra el resto de la paleta ya en uso para no
colisionar. `pickable: true`; al clic resalta y centra la leyenda (mismo patrón real que
`pulso-marcadores`, no un tooltip flotante — la spec original decía "tooltip" pero el patrón
que de verdad ya existe en el código es este, se sigue ese para consistencia). Sin icono por
tipo en v1 (lista para iterar si se pide) — el color ya resuelve "identificarlos rápido"
(petición literal del usuario).

## 6. Criterios de aceptación (Definition of Done)

- [x] Fuente probada con al menos una llamada real (no solo documentación) — ver §2.
- [x] Seed genera `data/equipamientos-criticos.json` con los 106 puntos reales (75+25+6),
      coordenadas válidas dentro del término municipal de Valencia — verificado
      (`npm run seed:equipamientos-criticos`, 2026-10-01).
- [x] Endpoint responde con el contrato de datos de la §3 — `GET /api/emergencia/v1/equipamientos-criticos`, verificado con `curl` real (106 elementos).
- [x] Capa visible en `/mapa`, checkbox propio en el selector (grupo "Contexto e
      informativas"), colores distintos por categoría — verificado en navegador con captura
      real: puntos rojos/azules/naranjas distribuidos por la ciudad, leyenda con los 3
      recuentos exactos (75/25/6) coincidiendo con el seed.
- [x] Leyenda explica las 3 categorías + fuente + que es un dato estático (no "en vivo").
- [x] Entrada en `META_CAPAS` (`src/ui/glosario.ts`) — test `capasSinMetadato` en verde.
- [x] `typecheck`/`test` (496/496, 6 nuevos)/`build` limpios.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance explícito (CLAUDE.md §4):** ninguna infraestructura sensible/de seguridad
  operativa (subestaciones eléctricas, nodos de telecomunicaciones, detalle táctico de
  comisarías) — solo equipamientos públicos ya señalizados y conocidos por cualquiera que pase
  por delante (hospitales, comisarías, parques de bomberos), mismo criterio que ya aplican
  capas `Implemented` como incidencias de vía pública o cámaras urbanas.
- **"Protección Civil" queda fuera de v1** por no haber encontrado una fuente pública real —
  ver hallazgo en §2. No se simula ni se aproxima con otro dato.
- La calidad de categorización de la fuente (`idclase`/`clase`) es inconsistente para bomberos
  (ver §2) — si el geoportal cambia esos valores en el futuro, el filtro por nombre podría dejar
  de capturar algún parque nuevo; aceptado como riesgo menor de una fuente de terceros, mismo
  patrón que otras specs de este proyecto.
- No hay polling/cron: si el Ayuntamiento abre o cierra un equipamiento, esta capa no se entera
  hasta que alguien re-ejecute el seed a mano.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-10-01 | Creación — due-diligence con llamadas reales, contrato de datos/capa congelado, pendiente de implementación |
| 1 | 2026-10-01 | Implementada de punta a punta en la misma sesión: seed, endpoint, capa, leyenda, glosario. Verificada en navegador con captura real. `Implemented` |
