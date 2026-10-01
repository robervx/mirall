# 041 — Panel de apoyo a decisión operativa

```yaml
id: 041
titulo: "Página que cruza señales ya existentes (tráfico, lluvia, incidencias) y sugiere zona y acciones a valorar"
estado: Implemented
tipo: indice-compuesto
depende_de: [001, 010, 013, 016, 026, 040]
propietario: ""
version: 2
```

> **Estado:** `Implemented` (2026-09-16, v2 2026-10-01). Implementada como traducción a
> texto de los escenarios ya calculados por `pulso-escenarios.ts` (spec 010) — no un
> agregador nuevo desde cero, ver §2. Spec `021` (cordón) queda fuera del cruce automático:
> su "incidente activo" es estado interactivo de sesión del cliente (`modo-cordon.ts`), no
> una señal persistida en caché que un endpoint pueda consultar — ver §7. **v2:** cada
> sugerencia se enriquece con el aviso oficial de Emergencias GVA (rojo/naranja) más
> severo vigente, si lo hay — petición explícita del usuario tras un análisis del asesor de
> ciencia de datos del proyecto sobre qué cruces nuevos aportarían valor real (2026-10-01,
> ver memoria de proyecto). No es la única señal nueva propuesta en ese análisis — es la
> de menor alcance de contrato, elegida para empezar; el cruce de mayor valor (corte/
> congestión cerca de un equipamiento crítico de sanidad/bomberos) queda pendiente de una
> revisión más profunda de spec `010` (nuevo escenario).

## 0. Límite aplicable — mismo que spec 021 y `CLAUDE.md` §4

Esta página **avisa, no actúa**: cruza señales que ya existen en el producto (nunca datos
nuevos ni un modelo estadístico nuevo, mismo principio que spec `024`) y redacta una
sugerencia de texto para que la valore una persona. No envía nada, no despacha ninguna
unidad, no ejecuta ninguna acción. "Valorar enviar una patrulla" es una frase que lee un
humano y decide, exactamente igual que el borrador de spec `013` o la propuesta de cordón
de spec `021` — nunca una llamada a ningún sistema de despacho real.

## 1. Problema / motivación

Hoy cada señal (tráfico denso, lluvia inminente, incidencia de vía pública, escenario de
Pulso de Distrito) vive en su propio panel. Cuando dos o tres coinciden en la misma zona,
a nadie le salta automáticamente "mira aquí, es donde más falta hace decidir algo" — hay
que ir comparando paneles a mano. Esta página junta las señales ya calculadas por specs
`010`/`016`/`026` (a través del evaluador consolidado de `010`) en una sola vista por
zona/calle, con una sugerencia de qué mirar y qué se podría valorar, sin inventar ninguna
señal nueva. Spec `021` (cordón) queda fuera del cruce automático — ver §7.

## 2. Fuente(s) de datos

No hay fuente externa nueva. Reutiliza exclusivamente los datos ya cacheados/calculados
por specs `010` (escenarios de Pulso), `013`/`024` (insights), `016` (nowcasting lluvia),
`021` (motor de cordón, cuando hay un incidente activo) y `026` (incidencias de vía
pública) — todos `Implemented` u objeto de esta misma tanda de trabajo. **v2:** añade
`001` (avisos oficiales de Emergencias GVA, `fetchAvisosVigentes` de
`src/services/avisos-meteo.ts`) — mismo endpoint/caché que ya usan
`GET /api/meteo/v1/avisos` y `GET /api/insights/v1/actual` (`meteo:valencia-avisos:v1`,
TTL 15 min), sin llamada ni caché propia nueva.

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Endpoints internos ya existentes de 010/016/026 (vía el evaluador consolidado de 010) | `/api/...` (varios, ver sus specs) | Ya cubierta por cada spec origen | No | **Verificada 2026-09-16** — `GET /api/decision/v1/sugerencias` responde 200 con `{ sugerencias: [], fresh: true }` contra datos reales (sin conjunción activa en el momento de verificar); cruce con datos real comprobado por 7 tests unitarios con fixtures realistas |

## 3. Contrato de datos (normalizado)

```typescript
interface SugerenciaOperativa {
  id: string;
  distrito?: string;
  calle?: string;                  // si el cruce se puede localizar a nivel calle
  señalesCombinadas: string[];     // ids/tipos de las señales que coinciden (p.ej. 'trafico-denso', 'lluvia-inminente', 'incidencia-via-publica'; v2: 'aviso-oficial-rojo'/'aviso-oficial-naranja')
  resumen: string;                 // frase corta, lenguaje llano: "qué está pasando aquí"
  sugerenciaTexto: string;         // frase de apoyo, nunca una orden: "valorar enviar una patrulla a revisar doble fila"
  severidad: 'seguimiento' | 'prioritario';  // mismo vocabulario que spec 010 v4
  generadaEn: string;               // ISO 8601
  fuenteSpec: string[];             // qué specs origen aportaron cada señal, trazabilidad
  centroide: [number, number];      // [lon, lat] real del escenario de origen — elaboración sobre el mínimo de esta sección, ver historial v1
}
```

**Cómo se calcula (implementación):** `src/services/apoyo-decision.ts` no vuelve a agregar
tráfico/incidencias/lluvia por su cuenta — toma directamente `PulsoDistrito[]` (ya
calculado por `calcularPulsoEscenarios`, spec 010 v4) y traduce cada `EscenarioActivo` con
`modo: 'vivo'` y `confirmado: true` a una `SugerenciaOperativa`. `resumen` reutiliza el
`motivo` factual que ya construye el escenario; `sugerenciaTexto` es el único texto
genuinamente nuevo de esta spec, siempre en condicional. `calle` sale de
`tramosAfectados[0].nombre` si existe — nunca inventada, `undefined` si el escenario no
ancla en ningún tramo concreto (queda solo el distrito).

**v2 — enriquecimiento con aviso oficial:** `calcularSugerencias(distritos, generadaEn,
avisosOficiales?)` acepta un tercer parámetro opcional (`[]` por defecto, no rompe
llamadas existentes). Si hay algún `AvisoMeteo` vigente con `nivel` `rojo` o `naranja`
(amarillo se descarta a propósito — mismo corte que `SEVERIDAD_POR_NIVEL_AVISO` en
`insights.ts`), se toma el más severo (rojo > naranja) y se añade a **cada** sugerencia
generada en esa misma pasada:
- `señalesCombinadas` gana `'aviso-oficial-rojo'` o `'aviso-oficial-naranja'`.
- `fuenteSpec` gana `'001'`.
- `sugerenciaTexto` gana una frase final: "Además, hay un aviso oficial {nivel} de
  Emergencias (GVA) vigente en la Comunitat Valenciana."

**Lo que NO hace, a propósito**: nunca cambia `severidad` — el aviso oficial es de ámbito
autonómico, no por distrito (`AvisoMeteo` no tiene geometría), así que no puede decidir por
sí solo que una conjunción local sea más o menos prioritaria; eso lo sigue decidiendo solo
`pulso-escenarios.ts` (spec 010). Tratarlo de otro modo habría sido acercarse a un score
ponderado entre señales, en contra del principio declarativo de spec 013 §0/§8.

## 4. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco (cron) | Ninguna propia — se recalcula en cliente/endpoint ligero a partir de las cachés ya existentes de 010/013/016/021/026, mismo principio que spec `024` (correlación declarativa, sin modelo estadístico nuevo) |
| TTL en caché | No aplica (deriva de las cachés origen, cada una con su propio TTL) |
| Comportamiento si una señal falla | Se muestra la sugerencia con las señales disponibles, marcando cuál falta — nunca se oculta la página entera por un fallo parcial |
| Endpoint interno | `GET /api/decision/v1/sugerencias` (agrega, no re-consulta fuentes externas) |

## 5. Contrato de capa de mapa

No hay capa `deck.gl` propia — el mapa está oculto en `/inteligencia` (spec 040), así que
no hay superficie donde pintar puntos mientras se ve esta página. "Reutiliza la misma
instancia de mapa" (no una segunda) se resuelve con un store mínimo,
`src/ui/centrar-mapa.ts` (mismo patrón pub/sub que `foco-distrito.ts`): cada sugerencia
tiene un botón "Ver en el mapa" que pide centrar en su `centroide` real y cambia a
`/mapa` (`irAVista('mapa')`); `main()`, dueño único de la instancia de MapLibre, escucha
la petición y hace `map.flyTo(...)`. Vive dentro de la vista `/inteligencia` de spec `040`,
como panel propio igual que cámaras/contexto mediático/tendencia/agenda/actualidad
institucional — no una sección del sidebar.

## 6. Criterios de aceptación (Definition of Done)

- [x] Reglas de cruce documentadas explícitamente: las 3 conjunciones ya definidas por spec
      010 v4 (`incidencia-sobre-trafico-denso`, `fallas-y-trafico`,
      `lluvia-inminente-sobre-trafico-denso`), cada una con su texto de sugerencia fijo en
      `sugerenciaTextoPara()` (`src/services/apoyo-decision.ts`) — sin modelo estadístico
      nuevo, mismo criterio que spec `024`.
- [x] Ninguna sugerencia es una acción ejecutable desde la UI: el único botón es "Ver en el
      mapa" (navega y centra, no despacha nada); verificado por test que el texto nunca
      contiene "enviar"/"cortar"/"despachar"/"ejecutar" y siempre empieza por "Podría
      convenir valorar".
- [x] Localización lo más concreta posible — `calle` sale de un tramo real
      (`tramosAfectados[0].nombre`) o queda `undefined` (nunca inventada), cayendo al
      distrito; test explícito de que sin tramo no se inventa calle.
- [x] Verificado contra el dev server real: `GET /api/decision/v1/sugerencias` responde
      `{ sugerencias: [], fresh: true }` (sin conjunción activa en el momento de verificar,
      ciudad en calma) — **caso con datos verificado con fixture controlado**, documentado
      como tal (mismo criterio que spec `021` §6): 7 tests unitarios con escenarios
      realistas (incidencia+tráfico, Fallas+tráfico, lluvia+tráfico, orden por severidad,
      sin calle inventada) + verificación visual en navegador de las tarjetas con
      contenido inyectado. El flujo completo de clic en "Ver en el mapa" con datos reales
      de extremo a extremo no se pudo ejercitar en vivo por no coincidir conjunción real
      durante la sesión de verificación — la lógica de centrado (`centrar-mapa.ts`) reusa
      el mismo patrón pub/sub ya probado en producción por `foco-distrito.ts`.
- [x] `npm run typecheck` / `npm run test` (364/364) / `npm run build` sin regresiones.
- [x] **v2**: el enriquecimiento con aviso oficial nunca cambia `severidad` (test explícito)
      y respeta el mismo condicional/sin verbos imperativos que el resto del texto (test
      explícito). Solo rojo/naranja enriquecen, amarillo no (test explícito). Con varios
      avisos vigentes a la vez, se usa el más severo (test explícito). Llamadas sin el
      tercer parámetro siguen funcionando igual que v1 (test de compatibilidad). 6 tests
      nuevos. `npm run typecheck`/`test` (508/508)/`build` verdes.

## 7. Riesgos y fuera de alcance

- **Riesgo principal, explícito**: que el texto de sugerencia se lea como una orden en vez
  de una sugerencia. Mitigación: lenguaje siempre en condicional ("valorar", "podría
  convenir"), nunca imperativo ("enviar", "cortar") — verificado por test.
- **Spec `021` (cordón) fuera del cruce automático**: su "incidente activo" vive como
  estado de sesión en el cliente (`modo-cordon.ts`, activado a mano por quien usa la
  herramienta), no como una señal persistida en ninguna caché de servidor que este
  endpoint pueda consultar — no hay "incidente de cordón" que agregar sin inventar un
  mecanismo de persistencia nuevo, fuera del alcance declarativo de esta spec. Alguien ya
  usando el cordón está, por definición, ya decidiendo sobre esa zona — no necesita
  además una sugerencia. Puede añadirse en una spec futura si el cordón pasa a persistir
  su estado en servidor por otro motivo.
- **Fuera de alcance**: cualquier integración con sistemas de despacho reales (112, policía
  local, protección civil) — eso es fuera de esta aplicación por diseño (`CLAUDE.md` §4).
  Ningún modelo predictivo/estadístico nuevo — solo combinación declarativa de señales que
  ya existen.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-16 | Creación (Draft) y cierre el mismo día, como parte del DoD de V1 (`docs/02_DEFINITION_OF_DONE_V1.md`). Implementada como traducción a texto de los escenarios ya calculados por `pulso-escenarios.ts` (spec 010 v4) — `src/services/apoyo-decision.ts` (7 tests), endpoint `GET /api/decision/v1/sugerencias`, panel `src/ui/apoyo-decision-panel.ts` dentro de `/inteligencia`. "Ver en el mapa" centra la única instancia de MapLibre vía un store nuevo (`src/ui/centrar-mapa.ts`, mismo patrón que `foco-distrito.ts`) y cambia a `/mapa`. Spec `021` queda fuera del cruce automático — su estado de "incidente activo" es de sesión de cliente, no una caché de servidor (§7). Verificado en navegador (escritorio y móvil) contra el dev server real; sin conjunción de señales activa durante la verificación, caso con datos cubierto por fixtures controladas (documentado como tal, §6). `npm run typecheck`/`test` (364/364)/`build` verdes. Spec pasa a `Implemented`. |
| 2 | 2026-10-01 | Petición directa del usuario: "analizar la información y contexto que nutre a apoyo a decisión operativa porque de ahí tiene que ofrecer insights de valor". El asesor de ciencia de datos del proyecto propuso 3 cruces nuevos priorizados (ver memoria de proyecto); esta versión implementa el #2 (de menor alcance de contrato): cada sugerencia se enriquece con el aviso oficial de Emergencias GVA (rojo/naranja) más severo vigente — `calcularSugerencias` gana un tercer parámetro opcional `avisosOficiales` (spec 001), el endpoint reutiliza la misma caché `meteo:valencia-avisos:v1` ya usada por `/api/meteo/v1/avisos` y `/api/insights/v1/actual`, sin fuente ni caché propia nueva. Nunca cambia `severidad` (eso lo sigue decidiendo solo spec 010, para no acercarse a un score ponderado). El cruce #1 (corte/congestión cerca de un equipamiento crítico de sanidad/bomberos, el de mayor valor según el asesor) queda pendiente de una revisión más profunda de spec `010` (nuevo escenario) — no implementado en esta versión. 6 tests nuevos (508/508 en total), `typecheck`/`build` verdes. |
