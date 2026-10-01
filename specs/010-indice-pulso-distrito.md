# 010 — Pulso de Distrito (señal de proactividad por escenarios)

```yaml
id: 010
titulo: "Pulso de Distrito — señal de proactividad por cruce de condiciones (tráfico + incidencias + lluvia inminente + acceso a equipamientos críticos)"
estado: Implemented
tipo: indice-compuesto
depende_de: [001, 002, 004, 008, 016, 026, 054]
propietario: ""
version: 5
```

> **Estado:** v1-v5 `Implemented` y en producción. **v4 (2026-09-16)**: el índice
> ponderado 0-100 se sustituye por el catálogo de escenarios de conjunción — ver §10 y
> el historial. **v5 (2026-10-01):** 4º escenario — corte de tráfico cerca de un
> equipamiento crítico de sanidad/bomberos (spec 054), recomendación priorizada #1 de un
> análisis del asesor de ciencia de datos del proyecto sobre qué cruces nuevos aportarían
> valor real a la toma de decisiones (petición explícita del usuario, ver memoria de
> proyecto) — ver §3 y el historial.

---

## 1. Problema / motivación

De un vistazo, ¿en qué zona de la ciudad hay **ahora mismo, o en la próxima hora**, un
cruce de condiciones que pide adelantarse — antes de que se convierta en un problema?

El objetivo no es un termómetro por distrito ("cómo de tenso está"), es un **disparador
de proactividad**: cuando se cruzan señales que por separado son rutinarias pero juntas
merecen una acción preventiva humana (reforzar regulación, avisar a unidades, revisar
sobre el terreno), el sistema lo saca a primer plano **nombrando el motivo, la zona
concreta y las calles afectadas**, y deja la decisión a una persona (`CLAUDE.md` §4,
"avisa, no actúa").

Casos que v4 cubre:

- **Tráfico ya denso en un distrito y lluvia entrante** (nowcast, spec `016`) → margen de
  ~30-120 min para anticiparse.
- **Incidencia oficial de vía pública activa** (obra que corta calzada, festejo — spec
  `026`) **coincidiendo con tráfico denso en las mismas calles**.
- **Zona de movilidad reducida de Fallas activa** (spec `008`) con tráfico denso en el
  mismo distrito.

Por qué no un índice ponderado: ver §10.1. En resumen — sumar señales heterogéneas
para *alertar* enmascara los cruces reales (un corte se diluje entre decenas de tramos
fluidos), el número no orienta ninguna decisión, y el propio proyecto ya cerró ese
anti-patrón para el motor de insights (spec `013` §0, spec `024` §0).

## 2. Fuente(s) de datos

**No es una fuente nueva** — cálculo derivado de specs ya `Implemented`, sin llamada
externa propia. Reutiliza sus cachés.

| Fuente | Endpoint interno | Rol en v4 | Resolución |
|---|---|---|---|
| Tráfico en tiempo real (spec `004`) | `GET /api/trafico/v1/estado` | Lado "tráfico denso" de todos los escenarios. Cada `TramoTrafico` lleva `nombre` (calle), `geometry` y `distrito`. | **por tramo / distrito** |
| Incidencias de vía pública (spec `026`) | `GET /api/via-publica/v1/incidencias` | Escenario `incidencia-sobre-trafico-denso`. `distritoCodigo` + `lat`/`lon` exactos. | **por punto / distrito** |
| Zonas de movilidad reducida de Fallas (spec `008`) | `GET /api/fallas/v1/actual` | Escenario `fallas-y-trafico` (reusa `trafico-en-zona-fallas` de spec `024`). `distrito` por centroide. | **por distrito** |
| Predicción a corto plazo / nowcast (spec `016`) | `GET /api/meteo/v1/prediccion-corto-plazo` | Lado "lluvia inminente". `probabilidadPrecipitacion` y `precipitacion` por hora, ventana 4 h. | **ciudad (punto único ≈ Ciutat Vella)** |
| Meteorología actual (spec `001`) | `GET /api/meteo/v1/actual` | Solo `observedAt` para el sello de frescura. | ciudad |
| Calidad del aire (spec `002`) | `GET /api/aire/v1/actual` | **Ya no es componente.** Solo se usa como **nota** en la tarjeta si el distrito ya está encendido por otra causa y `categoria ∈ {Mala, Muy mala}`. Best-effort: si la caché no está caliente, se omite la nota. | ciudad |
| Equipamientos públicos críticos (spec `054`) | asset estático (`data/equipamientos-criticos.json`, sin caché — igual que `geo-distritos.ts`) | **v5.** Lado "equipamiento crítico" del escenario `corte-cerca-equipamiento-critico`: solo categorías `sanidad`/`bomberos` (ver §3, exclusión deliberada de `policia`). | **por punto** (lat/lon reales) |

**Aire fuera como disparador (decisión del usuario, 2026-09-10):** es un valor de ciudad
idéntico en los 19 distritos — no discrimina zona ni orienta ninguna decisión operativa
a escala de distrito. La alerta de aire de ciudad sigue viva sin cambios en el motor de
insights (`aire-mala-calidad`, spec `013`).

**Restricción dura de diseño:** solo tráfico (`004`) e incidencias (`026`) tienen
resolución real por debajo de ciudad; Fallas (`008`) tiene geometría de zona. Todo lo
meteorológico (`001`/`002`/`016`) es un punto único. → **cada escenario de ámbito
distrito debe llevar su discriminación espacial en `004` y/o `026`**; la lluvia solo
puede ser un *gate de ciudad* que se localiza por dónde el tráfico ya está mal. Ningún
texto de la UI puede implicar lluvia/aire "por distrito".

## 3. Escenarios (catálogo v4)

Cada escenario es una **conjunción lógica (AND) de condiciones con umbral**. No hay
score compuesto: dos señales débiles nunca se suman para simular una fuerte
(`CLAUDE.md` §4, spec `013` §0, spec `024` §0). Los umbrales **reutilizan las constantes
ya exportadas** por el motor de insights — no se crea un cuarto juego de números mágicos.

| id | Conjunción | Nivel | Modo v4 | Anticipación |
|---|---|---|---|---|
| `incidencia-sobre-trafico-denso` | Incidencia de `026` en el distrito con `tipo ∈ {incidencias, festejos}` **o** `tipo = obras` con afectación de calzada, **y** `vigenciaDesde` ≤ 7 días (ver §7 — `vigenciaHasta` es vigencia de permiso, no duración real) — **Y** ≥ `UMBRAL_TRAFICO_CONCENTRADO_AVISO` (=3) tramos `congestionado`/`cortado` en el mismo distrito **y** ≥ 25 % de los tramos monitorizados del distrito | `prioritario` | **vivo** | inmediato |
| `fallas-y-trafico` | = regla `trafico-en-zona-fallas` de spec `024` (`ZonaMovilidadReducida` activa cuyo `distrito` coincide con un tramo `congestionado`/`cortado`). Se **añade su render en la capa** además de la tarjeta que ya emite. | `prioritario` | **vivo** | inmediato |
| `lluvia-inminente-sobre-trafico-denso` | nowcast (`016`) con `probabilidadPrecipitacion` ≥ `UMBRAL_LLUVIA_PROB_PCT` (=60) **o** `precipitacion` ≥ 2 mm en algún tramo de la ventana ≤ 2 h — **Y** ≥ `UMBRAL_TRAFICO_CONCENTRADO_URGENTE` (=6) tramos `congestionado`/`cortado` en el distrito **o** el distrito tiene un `trafico-empeora` activo (spec `013` v4b) | `seguimiento` | **sombra** (ver §10.3) | ~30-120 min |
| `corte-cerca-equipamiento-critico` (**v5**) | Un tramo de `004` en estado **`cortado`** (no `congestionado` — ver justificación abajo) a ≤ `RADIO_EQUIPAMIENTO_CRITICO_M` (=250 m, distancia punto-línea real) de un `EquipamientoCritico` (`054`) de categoría `sanidad` **o** `bomberos` | `prioritario` | **vivo** | inmediato |

**Umbral de tráfico dual** (`≥3 Y ≥25 %`, o `≥6` para el escenario de lluvia): un umbral
absoluto no es comparable entre distritos — los distritos 14/15/17 tienen 7-13 tramos
monitorizados y 16-19 tienen 2-3 (spec `024` §8). El `≥ %` normaliza; el `≥ N` evita que
"1 de 2 tramos" dispare en un distrito casi sin cobertura.

**`lluvia-inminente-sobre-trafico-denso` a nivel `seguimiento`, no `prioritario`:** el
nowcast es de un punto único (≈ Ciutat Vella) y la lluvia convectiva de otoño en València
es muy heterogénea espacialmente — el escenario se enciende para cualquier distrito con
tráfico denso ante una señal de lluvia de *ciudad*. Sube a `prioritario` solo si en el
futuro hay precipitación resuelta por distrito (ver §7, spec futura de nowcast por
centroide).

**`corte-cerca-equipamiento-critico` (v5) — decisiones de diseño explícitas:**

- **Solo `cortado`, nunca `congestionado`.** A diferencia de los otros escenarios (que
  usan `congestionado`/`cortado` indistintamente como "tráfico denso"), este exige corte
  real. La congestión cerca de un hospital grande en una ciudad es habitual — incluirla
  habría disparado el escenario casi permanentemente, defeating su propósito ("avisa
  cuando de verdad falta hacer algo", no ruido de fondo). `cortado` es un estado
  inequívoco y de baja frecuencia (spec `004`, clasificación oficial determinista) — por
  eso va directo a **vivo**, igual criterio que `incidencia-sobre-trafico-denso` y
  `fallas-y-trafico` en v4 (§10.3: "deterministas, bajo riesgo de ruido"), sin pasar por
  modo sombra como sí le tocó a la lluvia (señal probabilística, no un estado oficial).
- **`RADIO_EQUIPAMIENTO_CRITICO_M = 250 m`**: heurística de partida, no calibrada contra
  ningún backtest (no hay ground truth, mismo riesgo de fondo que el resto del catálogo —
  ver §7). El asesor de ciencia de datos propuso un rango de 150-300 m; 250 m es el punto
  intermedio. Si en producción dispara con demasiada frecuencia (p. ej. en distritos con
  varios equipamientos muy próximos entre sí), se recalibra en una versión futura con
  datos reales de disparo, mismo proceso que siguió la lluvia en v4 (§10.3).
- **Excluye `policia` a propósito.** Sanidad y bomberos son logística de acceso de
  emergencia, encuadre inequívoco. El mismo cruce para comisarías empieza a sonar a
  orientar postura/vigilancia policial en vez de informar sobre infraestructura — más
  cerca del límite de `CLAUDE.md` §4 que de "avisa, no actúa" neutral. Recomendación
  explícita del asesor de ciencia de datos (2026-10-01), adoptada tal cual.
- **Dedup por distrito** (una tarjeta, no una por tramo cortado), igual criterio que
  `incidencia-sobre-trafico-denso` — si hay varios cortes cerca de varios equipamientos a
  la vez en el mismo distrito, se muestra el más cercano (`distanciaM` mínima).
- **No sube `severidad` de otros escenarios ni se combina con ellos** — es una conjunción
  independiente más, nunca una suma (mismo principio de todo el catálogo, §10.1).

**Fuera del catálogo v4, deliberadamente:**

- `calor-que-persiste` y cualquier escenario meteo de ámbito ciudad → son reglas del
  motor de insights (spec `013`), no del Pulso. Pintar los 19 distritos a la vez
  reintroduce el problema de "constante de ciudad" que v4 elimina. `calor-extremo` (013,
  con banda `aviso` a 35 °C) ya cubre el calor.
- `trafico-denso-persistente` (≥3 tramos en 2 lecturas): la caché de estado previo es de
  un solo ciclo (~3-15 min) y se cae en frío; aporta poco sobre la multiplicidad `≥3`
  que ya usa `trafico-concentrado-distrito`. Se reevalúa cuando spec `017` v4 tenga
  histórico de conteo por tramo suficiente.
- Escenario "corte de calzada + congestión en calles **adyacentes**": necesita el grafo
  viario (specs `020`/`032`, `032` en `Draft`). La co-ocurrencia por distrito es el v1
  honesto; "adyacente" queda para cuando `032` esté `Implemented`.

## 4. Contrato de datos (normalizado)

```typescript
type NivelPulso = 'sin-senal' | 'seguimiento' | 'prioritario';
type ModoEscenario = 'vivo' | 'sombra';   // 'sombra' = evaluado y registrado, no se pinta ni alerta

interface EscenarioActivo {
  id: 'incidencia-sobre-trafico-denso' | 'fallas-y-trafico' | 'lluvia-inminente-sobre-trafico-denso' | 'corte-cerca-equipamiento-critico';
  nivel: 'seguimiento' | 'prioritario';
  modo: ModoEscenario;
  confirmado: boolean;              // true tras verse en 2 evaluaciones consecutivas (histéresis, §6)
  anticipacionMin: number | null;   // horizonte en minutos; null = "inmediato"
  motivo: string;                    // frase con las variables cruzadas, sin implicar meteo por distrito
  zonas: string[];                   // barrios afectados si hay geometría de barrio; [] si no (ver §7)
  centroideAfectado: [number, number];   // centro del cluster de elementos que cruzaron — para el marcador del mapa
  tramosAfectados: Array<{ id: string; nombre: string; estado: string; puntoMedio: [number, number] }>;
  incidencia?: { id: string; descripcion: string; tipo: string; lat: number; lon: number };
  zonaFallas?: { nombre: string; centroide: [number, number] };
  /** v5 — solo en 'corte-cerca-equipamiento-critico'. `distanciaM` siempre al tramo cortado más cercano. */
  equipamientoCritico?: { id: string; nombre: string; categoria: 'sanidad' | 'bomberos'; distanciaM: number };
}

interface PulsoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  nivel: NivelPulso;                 // máximo de los escenarios con modo 'vivo' y confirmado === true; 'sin-senal' si ninguno
  monitorizacion: 'suficiente' | 'insuficiente';   // 'insuficiente' si tramosMonitorizados < 3
  tramosMonitorizados: number;
  escenariosActivos: EscenarioActivo[];   // incluye los 'sombra' y los no confirmados para trazabilidad; la UI solo pinta vivo+confirmado
  notaAire: string | null;           // texto de nota si nivel != 'sin-senal' y aire Mala/Muy mala; null en otro caso
  observedAt: string;                // el más antiguo de los observedAt de entrada
  fetchedAt: string;
  source: 'vlc-monitor-pulso';
}

// Respuesta del endpoint:
interface RespuestaPulso {
  distritos: PulsoDistrito[];
  fresh: boolean;                    // AND de la frescura de meteo/tráfico/nowcast
}
```

**Se elimina de v3:** `indice` (0-100), `categoria` (`Tranquilo/Moderado/Tenso/Crítico`),
`componentes`, y las constantes `PESOS_PULSO`, `AMPLIFICACION_TRAFICO_PULSO`,
`UMBRALES_CATEGORIA_PULSO`, `componenteAire`, `componenteMeteo`. **Se conserva**
`componenteTrafico` (lo reutiliza spec `017` sin amplificar — no se toca).

## 5. Contrato de capa de mapa

```typescript
{
  key: 'pulsoDistrito',
  specId: '010',
  renderers: ['deck'],
  zoomMinimo: 0,
  agregacion: 'mixta',   // v4: marcador + tramos resaltados como primario, choropleth de distrito como contexto
  icono: '',
}
```

Render v4 (de primario a contexto):

1. **Marcador por escenario `vivo` + `confirmado`**, en `centroideAfectado`, con color por
   `nivel` (`seguimiento` ámbar / `prioritario` rojo) y etiqueta corta ("Tráfico + lluvia
   ~90 min"). Es el "punto concreto" — clic → abre la tarjeta del panel.
2. **Tramos afectados resaltados** (`tramosAfectados[].puntoMedio` / geometría de `004`) —
   las calles donde está el cruce.
3. **Polígono del distrito teñido** por `nivel` máximo, como capa de contexto para la
   asignación por distrito. Tres estados visuales distintos:
   - `sin-senal` + `monitorizacion: suficiente` → **gris** ("evaluado, nada requiere acción").
   - `sin-senal` + `monitorizacion: insuficiente` → **gris tramado** ("no hay tramos
     suficientes aquí para evaluar" — distritos 16-19). **No** es "tranquilo".
   - `seguimiento` / `prioritario` → ámbar / rojo.

Leyenda: conteo por nivel + los escenarios activos + "N distritos con monitorización
insuficiente". El chip "Pulso" del dashboard (spec `034`) muestra el resumen siempre
visible ("Pulso: 1 distrito prioritario · 2 en seguimiento").

**Pregunta abierta (no bloquea el DoD, ver §7):** si los "distritos" operativos de
asignación policial coinciden con los 19 distritos administrativos. La localización por
**calle** (`tramosAfectados`, `centroideAfectado`) es independiente de esa cuestión y
funciona igual.

## 6. Pipeline (seed → caché → endpoint)

| Parámetro | Valor |
|---|---|
| Frecuencia de refresco | Sin cron propio — se recalcula en cada petición desde las cachés de `004` (TTL 3 min), `016` (TTL 15 min), `008`, `026` (TTL 60 min), `001`/`002`. |
| Estado para histéresis | Clave nueva `pulso:escenarios-previos:v1` — mapa `"${distrito}:${escenarioId}" → { primeraDeteccion, ultimaDeteccion }`, TTL 30 min, `cachePeek`/`cachePoke` (mismo patrón que `insights:trafico:estado-previo`, spec `013` v4b). |
| Histéresis (anti-parpadeo del choropleth) | Un escenario detectado pasa a `confirmado: true` solo si estaba en la evaluación anterior (2 consecutivas). Una vez confirmado, **permanece pintado 20 min** tras dejar de detectarse (`ultimaDeteccion + 20 min`). **Cold start** (sin estado previo) → los escenarios se detectan pero `confirmado: false`, no pintan y no lanzan toast. Degrada, no rompe. |
| Dedup / rollup | **Una tarjeta y un toast por distrito**, no uno por escenario. El panel de insights recibe **un `Insight` agrupado por distrito** (`tipo: 'pulso-distrito'`) que lista los escenarios contribuyentes + un chip por `fuenteSpec`. (Spec `013` §8 dejaba el dedup "fuera de alcance" — v4 lo mete en alcance para el Pulso.) |
| Comportamiento si la fuente falla | Si falla `004` → 502 (sin tráfico no hay ningún escenario). Si falla `016` → el escenario de lluvia no se evalúa, el resto sí (degrada). Si falla `026` u `008` → sus escenarios no se evalúan. Si falla `002` → se omite `notaAire`. `054` es un asset estático bundleado (no hay fetch que falle) — si por lo que sea llega vacío, `corte-cerca-equipamiento-critico` simplemente no detecta nada, igual que el resto degrada. Nunca se emite un escenario con datos parciales de una de sus dos señales. |
| Clave de caché propia de resultado | Ninguna (además de la de histéresis). |
| Endpoint interno | `GET /api/pulso/v1/distrito` — misma URL, contrato de respuesta nuevo (§4). |

**Evaluador consolidado:** la lógica de escenarios vive en un módulo puro compartido
(`src/services/pulso-escenarios.ts`), consumido por `api/pulso/v1/distrito.ts` (para la
capa) y por `api/insights/v1/actual.ts` (para plegar los `Insight` agrupados por distrito
en el panel). **No** un evaluador paralelo dentro de `pulso-distrito.ts`. La regla
`distrito-critico` de spec `013` se retira (la sustituyen estos escenarios).

## 7. Riesgos y fuera de alcance

- **Calibración sin ground truth (riesgo de fondo).** No existe registro histórico de
  "incidentes donde la ciudad tuvo que actuar". Ningún backtest da precisión/recall —
  solo tasa de disparo. Mitigación: **modo sombra** para el escenario de lluvia (§10.3) +
  umbrales anclados donde hay referencia externa (constantes del motor de insights;
  parte meteo → umbrales de aviso AEMET si se confirman). Disclaimer visible "heurística
  documentada, no validada contra ground truth", igual que v3 §7 / spec `013` §8.
- **`vigenciaHasta` de spec `026` es vigencia del permiso administrativo, no duración
  real** de la afectación (spec `026` §2/§7, la UI ya lo avisa). Un permiso puede durar
  semanas. Por eso `incidencia-sobre-trafico-denso` exige además `vigenciaDesde` reciente
  (≤ 7 días) o afectación de calzada — si no, se encendería siempre en distritos
  céntricos con obras largas.
- **Nowcast de ciudad × tráfico de distrito.** La localización la pone entera el tráfico;
  la lluvia es un gate de ciudad. Honesto pero limitado (lluvia convectiva heterogénea).
  El `motivo` debe decir "riesgo de lluvia en la ciudad × congestión que este distrito ya
  tiene", **nunca** "va a llover en <distrito>". Nivel `seguimiento`, no `prioritario`.
- **Sesgo de cobertura de tráfico** (spec `024` §8): un distrito sin tramos monitorizados
  nunca enciende — de ahí `monitorizacion: 'insuficiente'` y el gris tramado, para no
  aparentar "tranquilo".
- **El choropleth mayormente gris** es el estado honesto ("ahora nada te necesita" es
  información que el índice v3 nunca daba). El resumen siempre visible del dashboard
  (spec `034`) evita que se perciba como capa muerta.
- **Se pierde la lectura sintética "de un vistazo" de v3** (viabilidad §2.2). Decisión
  del usuario (2026-09-10): la herramienta se optimiza para aportar información accionable
  de calidad; una capa descriptiva "carga de distrito" (media de congestión, sin alertar)
  se **descarta** por ser una versión suavizada de lo que la capa de tráfico (spec `004`)
  ya muestra con más precisión, y por no resolver el hueco de los distritos sin cobertura.
- **Zonas de barrio (`zonas`).** El dato de barrios del repo (spec `023`, en
  `data/distritos-valencia.json`) es **solo nombres + alias para matching de texto, sin
  geometría de polígono** — no permite point-in-polygon a barrio. v4 localiza por **calle**
  (`tramosAfectados`, `centroideAfectado`), que es más preciso que un nombre de barrio
  para asignar recursos. El rollup "Zona: <barrio>" queda como **fast-follow**: requiere
  (a) sourcing y verificación de un asset de polígonos de barrio del Geoportal, (b)
  confirmar si la unidad operativa relevante es el barrio o el distrito policial. `zonas`
  se emite `[]` hasta entonces.
- **Distritos administrativos vs. distritos policiales.** Sin verificar si coinciden. No
  bloquea: el tinte de distrito es contexto; la señal accionable es el marcador + calles.
- **`corte-cerca-equipamiento-critico` (v5) — riesgo propio, explícito:** radio de 250 m
  sin calibrar contra ningún backtest (mismo riesgo de fondo que el resto del catálogo,
  arriba). Si en producción dispara con más frecuencia de la esperada en distritos con
  varios equipamientos próximos, hace falta recalibrar — no se congela como definitivo.
  La exclusión de `policia` es una decisión de diseño deliberada (ver §3), no un hueco de
  dato: no hay intención de añadirla sin que cambie el encuadre a algo que no sea logística
  de acceso de emergencia.
- **Fuera de alcance de v4/v5:** ponderación configurable por el usuario, histórico/tendencia
  del Pulso, cualquier acción automática o lista de destinatarios (`CLAUDE.md` §4), nowcast
  por distrito, escenarios que necesiten el grafo viario (`032`), un tercer nivel ordinal,
  el escenario #2 propuesto por el asesor de ciencia de datos (aviso oficial GVA + Pulso —
  implementado en su lugar como enriquecimiento de texto en spec `041` v2, no como
  escenario de Pulso, por ser contexto de ciudad sin geolocalización propia) y el #3
  (sonometría ZAS + agenda — bloqueado por falta de `distritoCodigo` en `ZonaZas`, spec
  `049`).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación. Índice ponderado (001, 002, 004), fórmula y pesos documentados, sin fuente externa propia. |
| 2 | 2026-08-18 | DoD completo: función pura `calcularPulsoDistrito` + tests, endpoint que combina las tres cachés, choropleth + toggle + leyenda. Verificado (typecheck/test/navegador). `Implemented`. |
| 3 | 2026-09-09 | Recalibración del índice ponderado (§9): tráfico ×2.5, 4º componente de incidencias (spec `026`, peso 0.15), meteo desde 28 °C + sensación térmica, pesos `0.45/0.15/0.25/0.15`, umbrales `18/38/62`. `PESOS_PULSO`/`UMBRALES_CATEGORIA_PULSO` exportados. 20 tests. |
| 4 | 2026-09-10 | **Rediseño (§10):** el índice ponderado se sustituye por un catálogo de 3 escenarios de conjunción (`incidencia-sobre-trafico-denso`, `fallas-y-trafico`, `lluvia-inminente-sobre-trafico-denso`) con localización por calle + marcador en el mapa, nivel ordinal `seguimiento`/`prioritario`, histéresis anti-parpadeo, dedup por distrito, evaluador consolidado con specs `013`/`024`. Aire fuera como disparador. Prerrequisito: spec `017` v4. Consumidores a re-secuenciar: `013` (`distrito-critico`), `034`, `036`, `037`. `Draft` — el índice v3 sigue en producción hasta implementar v4. |
| 4 (implementación) | 2026-09-16 | **DoD completo, pasa a `Implemented`** (ver §10.5). Nuevo `src/services/pulso-escenarios.ts` (evaluador consolidado, ~350 líneas): `agregarPorDistrito` (monitorizados = todos los tramos del distrito, mismo criterio que spec 024), heurística de "afectación de calzada" por texto (`afectaCalzada`, spec 026 no tiene campo booleano — documentado como aproximación), `incidenciaElegible` (tipo + `vigenciaDesde` ≤ 7 días, aplicado a los tres tipos), umbral dual (`≥3 ∧ ≥25 %` vs `≥6` absoluto para lluvia), histéresis con `confirmado` + `ultimoEscenario` cacheados (elaboración deliberada sobre el `{primeraDeteccion, ultimaDeteccion}` mínimo de §6 — sin contenido cacheado no hay qué redibujar durante la permanencia). `src/services/pulso-distrito.ts` se reduce a `componenteTrafico` (lo sigue usando spec 017); `PulsoDistrito`/`NivelPulso`/`EscenarioActivo` viven ahora en `pulso-escenarios.ts`. `api/pulso/v1/distrito.ts` y `api/insights/v1/actual.ts` comparten el mismo evaluador y la misma clave de histéresis (`pulso:escenarios-previos:v1`, `cachePeek`/`cachePoke`). `insights.ts`: `insightsDistritoCritico` retirada, nueva `insightsPulsoDistrito` (agrupada por distrito, vivo+confirmado). Capa en `main.ts`: choropleth de 3 estados (gris / gris tenue "insuficiente" — simplificación del tramado, deck.gl no tiene patrones de relleno sin shaders — / ámbar-rojo) + `ScatterplotLayer` de tramos afectados + `ScatterplotLayer` de marcadores + `TextLayer` de etiquetas por escenario vivo+confirmado. `scripts/snapshot-pulso-sombra.ts` nuevo, enganchado a `.github/workflows/trafico-historico-cron.yml` (paso con `continue-on-error`), simplificado respecto al evaluador en vivo (sin histéresis entre ejecuciones horarias, sin gate de `trafico-empeora` — ambos necesitan estado de minutos que un cron horario no puede leer entre ejecuciones, documentado en el propio script). Ejecutado una vez contra datos reales (`data/pulso-sombra.json`, 0 distritos activos). Consumidores actualizados: spec `013` v6, `034` v4, `036` v2, `037` v3. Bug real encontrado y corregido durante la verificación: `lluviaInminente()` usaba `Date.now()` en vez de la hora inyectable de la entrada, rompiendo los tests deterministas del escenario de lluvia — corregido pasando `ahoraMs` explícitamente. 26 tests nuevos (`pulso-escenarios.test.ts` + ajustes en `insights.test.ts`/`pulso-distrito.test.ts`/`glosario.test.ts`), 346/346 en total. `npm run typecheck`/`build` verdes, verificado en navegador contra datos reales (endpoint 200 con 19 distritos, capa activable sin errores, "sin escenarios activos" — comportamiento correcto, no hay ningún cruce real ahora mismo en la ciudad). |
| 5 | 2026-10-01 | **4º escenario (§11):** `corte-cerca-equipamiento-critico` — tramo `cortado` a ≤250 m de un equipamiento crítico de sanidad/bomberos (spec `054`), `prioritario`, `vivo` desde el principio (determinista, mismo criterio que v4 §10.3). Excluye `policia` a propósito (límite ético, `CLAUDE.md` §4 — recomendación del asesor de ciencia de datos). Cero cambios en la capa de mapa/leyenda (ya eran genéricas). Recomendación #1 (de mayor valor) de un análisis del asesor sobre qué cruces nuevos aportarían valor real a apoyo a decisión operativa; las #2 y #3 van por otra vía (spec `041` v2 y pendiente, respectivamente — ver §7). Consumidores actualizados: `insights.ts` (`FuenteInsight` gana `'054'`, `FUENTES_POR_ESCENARIO`), `apoyo-decision.ts` (spec `041`, nuevo caso de texto), `glosario.ts`. |

## 9. v3 — recalibración del índice ponderado (2026-09-09) — SUPERSEDED por v4

_Se conserva por trazabilidad. En producción hasta que v4 pase a `Approved` e
`Implemented`._

Fórmula v3: `indice = round(100·(0.45·trafico↑2.5 + 0.15·incidencias + 0.25·aire + 0.15·meteo))`,
categorías `<18 / <38 / <62 / resto`. El problema que v3 no resolvió: una suma ponderada
sigue enmascarando los cruces (de ahí el parche ×2.5), el número no orienta decisiones,
y aire/meteo de ciudad no discriminan distrito. Diagnóstico completo en §10.1.

## 10. v4 — de índice ponderado a señal de proactividad por escenarios (2026-09-10)

### 10.1 Por qué se abandona el índice ponderado

1. **Es una suma ponderada de señales heterogéneas para *alertar*** — el anti-patrón que
   el proyecto ya cerró para el motor de insights (spec `013` §0, spec `024` §0: "dos
   señales débiles nunca se suman para simular una alerta fuerte"). La suma **compensa /
   enmascara**: un corte real se diluye entre decenas de tramos fluidos. El ×2.5 de v3
   fue un parche sobre ese síntoma, sin base.
2. **Aire y meteo son constantes de ciudad** aplicadas por igual a los 19 distritos → solo
   suben el nivel base de todos a la vez, cero poder discriminante. El usuario:
   _"la calidad del aire de momento no influye en nada porque no afecta"_.
3. **El número no dice qué hacer.** "Patraix 41/100, Tenso" no orienta ninguna decisión.
4. **Pesos y umbrales sin anclaje**, imposibles de validar (¿qué sería "acertar" con una
   suma ponderada?).
5. **No anticipaba** — usaba meteo actual, no el nowcast de spec `016`.

### 10.2 El modelo v4

Un conjunto pequeño de **escenarios explícitos** (§3), cada uno una conjunción AND con
al menos una condición con discriminación espacial real (tráfico/incidencias). Nivel
ordinal de 2 escalones — `seguimiento` (mirar) / `prioritario` (adelantarse ya); el
horizonte temporal va aparte, en `anticipacionMin`, no mezclado en el nivel. El
choropleth se mantiene como **contexto**; el primario pasa a ser el **marcador en el
punto concreto + las calles afectadas resaltadas**.

Consolidación con el motor de insights: un único evaluador puro
(`src/services/pulso-escenarios.ts`); los escenarios de distrito producen a la vez la
tarjeta+toast del panel (spec `013` v4a, ya existe) y el color/marcador de la capa.
Se retira `distrito-critico` de spec `013`.

### 10.3 Calibración — opción C (híbrido)

Decisión del usuario (2026-09-10), tras revisión de ciencia de datos:

- **`incidencia-sobre-trafico-denso` y `fallas-y-trafico` van a vivo** desde v4: usan
  solo señales de distrito, deterministas (registro oficial + estado de tramos) — bajo
  riesgo de ruido.
- **`lluvia-inminente-sobre-trafico-denso` va en modo sombra** 3-4 semanas: se evalúa y
  se registra en `data/pulso-sombra.json` (append por el cron horario de spec `017`,
  script nuevo `scripts/snapshot-pulso-sombra.ts`, mismo patrón de fichero versionado),
  **sin pintar el mapa ni lanzar toast** (`modo: 'sombra'` en el contrato). El otoño es
  la temporada de lluvia de València — el periodo de sombra debe cubrir al menos un
  episodio real de lluvia convectiva.
- Pasado el periodo: se revisan los disparos registrados (tasa por semana, duración de
  episodio, distribución por distrito, co-disparo) + etiquetado humano ("¿esto era
  real?"), se ajustan los umbrales, y una **v5** (o un checkbox del DoD) lo pasa a vivo.
- Métrica objetivo: `prioritario` ≤ ~1-3 episodios/semana en toda la ciudad; un escenario
  que dispara >1 vez/día es fallo de diseño.
- Umbrales de partida: reutilizan constantes del motor de insights; la parte meteo se
  ancla a umbrales de aviso AEMET si se confirman como fuente (spec `013` §8 ya lo prevé).

### 10.4 Prerrequisito — cumplido

**Spec `017` v4** (`SnapshotDistrito.porEstado?`) — `Implemented` 2026-09-10. El histórico
horario ya acumula el conteo de tramos por estado que necesita el análisis de sombra; el
reloj de las 3-4 semanas de datos empieza a correr desde ese merge.

### 10.5 Definition of Done (v4)

- [x] Spec `017` v4 `Implemented` (prerrequisito) — 2026-09-10.
- [x] Módulo puro `src/services/pulso-escenarios.ts` con los 3 escenarios como funciones
      independientes + el rollup por distrito, probado con fixtures (sin red): condición
      activa/inactiva y umbral exacto de cada escenario, umbral dual de tráfico
      (`≥3 ∧ ≥25 %`), histéresis (cold start no confirma, 2ª evaluación confirma,
      permanencia 20 min), degradación por fuente caída, `notaAire`. 20 tests
      (`pulso-escenarios.test.ts`).
- [x] `GET /api/pulso/v1/distrito` responde con `RespuestaPulso` (§4) para los 19
      distritos, con histéresis vía `pulso:escenarios-previos:v1` (`cachePeek`/`cachePoke`),
      reutilizando las cachés de `004`/`016`/`026`/`008`/`001`/`002` sin llamada de red
      propia. `incidencia-sobre-trafico-denso` y `fallas-y-trafico` en `modo: 'vivo'`,
      `lluvia-inminente-sobre-trafico-denso` en `modo: 'sombra'`. Verificado en navegador
      contra datos reales (200, 19 distritos, `nivel` válido).
- [x] `api/insights/v1/actual.ts` pliega un `Insight` agrupado por distrito
      (`tipo: 'pulso-distrito'`, escenarios contribuyentes + chips de `fuenteSpec`), una
      tarjeta y un toast por distrito. Regla `distrito-critico` retirada de `insights.ts`.
- [x] Capa: marcador (`ScatterplotLayer`) + etiqueta (`TextLayer`) por escenario
      vivo+confirmado en `centroideAfectado` (color por nivel), tramos afectados
      resaltados (`ScatterplotLayer` sobre `puntoMedio`), polígono de distrito con los
      **tres** estados visuales (gris / gris más tenue "monitorización insuficiente" —
      simplificación deliberada del "tramado" real, deck.gl no soporta patrones de
      relleno sin shaders propios / ámbar-rojo). Leyenda con conteo por nivel + nº de
      distritos con monitorización insuficiente. Verificado en navegador (choropleth gris
      con 19 distritos "sin escenarios activos" contra datos reales — no hay ningún
      escenario activo ahora mismo en la ciudad, comportamiento esperado).
- [x] `scripts/snapshot-pulso-sombra.ts` + append a `data/pulso-sombra.json`, enganchado
      al workflow horario de spec `017` (`.github/workflows/trafico-historico-cron.yml`,
      `continue-on-error: true` para no bloquear el commit del snapshot de tráfico si
      falla). Ejecución real verificada una vez (`npm run snapshot:pulso-sombra` contra
      datos reales: `data/pulso-sombra.json` creado, 0 distritos activos).
- [x] Consumidores actualizados: spec `034` v4 (chip "Pulso" lee `nivel` + conteo), spec
      `036` v2 (Foco de distrito: "antepone el Pulso" → antepone `nivel` + escenarios, no
      `indice`), spec `037` v3 (glosario: `cuerpoPulso()` reescrito, deja de leer
      `PESOS_PULSO`, describe los 3 escenarios). Specs `013`, `034`, `036`, `037` con su
      fila de historial y su estado en `specs/INDEX.md` actualizados.
- [x] `PESOS_PULSO`, `AMPLIFICACION_TRAFICO_PULSO`, `UMBRALES_CATEGORIA_PULSO`,
      `componenteAire`, `componenteMeteo` eliminados. `componenteTrafico` intacto
      (lo usa spec `017`).
- [x] `npm run typecheck` / `test` (346/346) / `build` en verde. Disclaimer "heurística no
      validada" visible en la leyenda del Pulso. Sin badge MOCK (nada es sintético).

## 11. v5 — escenario de corte cerca de un equipamiento crítico (2026-10-01)

Petición directa del usuario: "analizar la información y contexto que nutre a apoyo a
decisión operativa porque de ahí tiene que ofrecer insights de valor". El asesor de
ciencia de datos del proyecto propuso 3 cruces nuevos priorizados (ver memoria de
proyecto); este es el **#1**, el de mayor valor operativo según su análisis —
"¿puede un corte bloquear el acceso de una ambulancia o un camión de bomberos?" — y el
único que necesitaba tocar el evaluador consolidado (los otros dos, de menor alcance,
fueron a spec `041` v2 y quedan pendientes respectivamente).

Diseño completo en §3 (decisiones explícitas: solo `cortado`, radio 250 m sin calibrar,
exclusión de `policia`, modo `vivo` desde el principio por ser determinista — mismo
criterio que justificó ir a `vivo` a los dos primeros escenarios en v4 §10.3).

### 11.1 Definition of Done (v5)

- [x] `EquipamientoCritico` (spec `054`, `Implemented`) disponible como prerrequisito de
      datos — 2026-10-01.
- [x] `src/services/pulso-escenarios.ts`: nuevo `IdEscenario` (`corte-cerca-equipamiento-critico`),
      nuevo campo opcional `equipamientoCritico` en `EscenarioActivo`, nuevo campo
      `equipamientosCriticos: EquipamientoCritico[]` en `EntradaPulso`, función
      `detectarCorteCercaEquipamientoCritico` (distancia punto-línea real vía
      `distanciaPuntoALinea` de `proximidad.ts`, mismo patrón que usa `cordon-incidente.ts`),
      registrada en `IDS_ESCENARIO`/`MODO_POR_ESCENARIO` (`'vivo'`). Tests con fixtures:
      dispara con corte real dentro del radio, no dispara con solo congestión, no dispara
      fuera del radio, no dispara con `policia`, dedup por distrito (el más cercano).
- [x] `GET /api/pulso/v1/distrito`, `GET /api/insights/v1/actual` y
      `GET /api/decision/v1/sugerencias` pasan `equipamientosCriticos` (lectura estática de
      `data/equipamientos-criticos.json`, sin fetch/caché propia) a `calcularPulsoEscenarios`.
- [x] `insights.ts`: `'054'` añadido a `FuenteInsight`; `FUENTES_POR_ESCENARIO` incluye el
      escenario nuevo — llega gratis a `insightsPulsoDistrito` (agrupación genérica por
      distrito, sin cambios en esa función).
- [x] `apoyo-decision.ts`: `SEÑALES_POR_ESCENARIO`/`FUENTES_POR_ESCENARIO`/
      `sugerenciaTextoPara` incluyen el escenario nuevo, con el nombre real del
      equipamiento en el texto de sugerencia.
- [x] Capa de mapa y leyenda del Pulso: **sin cambios de código** — confirmado que
      `main.ts` ya lee `escenario.motivo`/`centroideAfectado`/`tramosAfectados`/`nivel` de
      forma genérica, sin switch por `id` de escenario (verificado leyendo el código antes
      de implementar, no asumido).
- [x] `src/ui/glosario.ts` (`cuerpoPulso`): 4º `<li>` describiendo el escenario nuevo.
- [x] `npm run typecheck`/`test`/`build` verdes, verificado en navegador.
