# Mirall — Viabilidad, Visión de Producto y Proceso

**Fecha:** 2026-08-17
Documento de viabilidad económica, estrategia de producto y proceso de trabajo. Precede al Spec-Driven Development.

---

## Parte 1 — ¿Es viable hacerlo 100% gratis?

**Sí, es viable a coste efectivamente cero (o ~10-15 €/año si quieres dominio propio) para un proyecto de esta escala — con matices concretos que detallo abajo para que no haya sorpresas a los 3 meses.**

La razón de fondo: World Monitor no usa Vercel + Upstash + OpenFreeMap *porque sean gratis y ya está* — los usa porque su patrón de "cachear todo, servir stale antes que romper" (visto en el informe anterior) es precisamente lo que hace viable operar sobre free tiers sin que el volumen te expulse de ellos. Copiar el patrón de caché es tan importante como copiar la lista de proveedores gratuitos.

### 1.1 Infraestructura

| Componente | Opción gratuita | Límite real | Veredicto para Valencia (escala ciudad, no planeta) |
|---|---|---|---|
| Hosting frontend + funciones edge | Vercel Hobby | Uso "no comercial" razonable, límites de invocaciones/ancho de banda generosos para tráfico bajo-medio | Sobra para MVP y para uso personal/portfolio. Si esto se vuelve un servicio público con miles de visitas diarias, en algún momento tocará Pro (~20$/mes) — no antes. |
| Caché / base de estado | Upstash Redis Free | 256 MB almacenamiento, **500K comandos/mes** (~16K/día), 10 GB de transferencia | De sobra si seguimos el patrón WM: seeds cada 5-15 min escribiendo, no cada request leyendo la fuente. Un pipeline de 10-15 capas con refresco moderado se queda muy por debajo de 16K comandos/día. |
| Cron jobs (los "seeds") | GitHub Actions (2.000 min/mes gratis en repo público, o más si el repo es público sin límite en muchos casos) o Cloudflare Cron Triggers (gratis) | Generoso para jobs de segundos cada 5-15 min | Perfecto sustituto gratuito de "Railway" (que WM sí paga). |
| Mapa base (tiles) | OpenFreeMap o CARTO | Sin API key, gratis, sin límite publicado agresivo | Cero coste, cero fricción. No hace falta PMTiles autoalojado (eso sí tiene coste de almacenamiento en WM a escala planeta). |
| Dominio propio | — | — | Único coste real si lo quieres: ~10-15 €/año (`.es` o `.app`). Alternativa 100% gratis: subdominio `vercel.app`, `pages.dev` o `github.io`. |
| Certificado TLS | Incluido en Vercel/Cloudflare | — | Gratis siempre. |

**Conclusión de infraestructura:** el único euro que gastarías con seguridad es el dominio, y es opcional.

### 1.2 Fuentes de datos — lo que sí es gratis y lo que no

| Fuente | ¿Gratis? | Matiz |
|---|---|---|
| Tráfico tiempo real (Ajuntament, OpendataSoft) | Sí | Dato público por ley de reutilización de información del sector público. |
| Geometría de distritos/barrios | Sí | Igual — dato público. |
| **Meteorología — AEMET OpenData** | Sí | Requiere API key gratuita (solo email + captcha). Es la fuente oficial española, incluye avisos por fenómenos meteorológicos adversos (nivel amarillo/naranja/rojo) — muy valioso como capa de alerta. |
| **Meteorología — Open-Meteo** | Sí, sin key | Sin necesidad de registro, límites de uso no comerciales muy generosos, y **incluye API de calidad del aire gratuita también** (PM2.5, PM10, NO₂, O₃...) — puede cubrir dos capas (meteo + aire) con una sola integración, de propina. Recomiendo usarla como fuente primaria por la fricción cero, y AEMET como fuente oficial/complementaria para avisos — exactamente el patrón de "corroboración multi-fuente" de World Monitor. |
| Valenbisi (bicicleta compartida) | Sí | Valencia usa la red JCDecaux (`val.valenbisi.es`), que expone API de datos abiertos de disponibilidad de estaciones en tiempo real vía el portal de desarrolladores de JCDecaux (registro gratuito). |
| Calidad del aire (GVA / Ajuntament) | Sí | Alternativa/complemento a Open-Meteo Air Quality si se quiere el dato oficial autonómico. |
| DGT / NAP (accesos, incidencias viarias) | Sí | Open data nacional. |
| Sismología (IGN España) | Sí | Gratis, útil aunque Valencia tenga sismicidad baja — coherente con el patrón "mostrar lo que no se ve" de WM. |
| Incendios (NASA FIRMS) | Sí | Gratis, global — relevante para el entorno de la Devesa-Albufera o incendios forestales cercanos. |
| Noticias locales (RSS de medios: Levante-EMV, Las Provincias, Valencia Plaza...) | Sí, vía RSS público | Igual que WM: agregación de RSS, no scraping agresivo. |
| Eventos/agenda cultural del Ayuntamiento | Probablemente sí | A confirmar — muchos ayuntamientos publican agenda como dataset abierto. |
| **Redes sociales (X/Twitter) para detección de tendencias** | **No** | Twitter/X cerró su API gratuita hace tiempo; el nivel básico de pago ronda los 100 $/mes. **No lo incluyo en el alcance gratuito.** Alternativas gratuitas parciales: Reddit API (límites generosos en uso no comercial), Mastodon (abierto por diseño), o simplemente prescindir de "señal social" en el MVP y apoyarse en RSS + GDELT (que sí es gratis y ya indexa menciones de "Valencia" a nivel global). |
| Cámaras de tráfico en directo | Incierto | Algunas administraciones exponen snapshots públicos, otras no. Se marca como "explorar", no como asumido. |

**Conclusión de datos:** con meteorología, tráfico, calidad del aire, Valenbisi, sismología, incendios y noticias por RSS ya tienes un MVP serio, **100% gratuito y 100% legal** (todo es información de sector público o APIs con términos de uso no comercial). Lo único que conscientemente dejamos fuera del alcance gratuito es la señal de redes sociales tipo X — y no hace falta: WM la usa a escala geopolítica global, no es un requisito para un monitor de ciudad.

### 1.3 Riesgo real a vigilar

No es el dinero — es el **volumen de peticiones a APIs públicas con límites de uso razonable no siempre documentados con precisión** (AEMET, GVA). La mitigación es la misma que ya vimos en World Monitor: cachear agresivamente, refrescar cada 5-15 min (no cada segundo), y nunca dejar que el navegador del usuario llame directamente a la fuente externa.

**Veredicto final: operativamente factible a coste ≈ 0 €. Procedemos.**

---

## Parte 2 — Estrategia de producto (rol Product Manager)

### 2.1 Visión

> Un mapa vivo de Valencia que agrega, en un único panel y sin fricción, todo lo que se puede observar públicamente de la ciudad ahora mismo — movilidad, meteorología, calidad del aire, medio ambiente, incidencias — con la misma disciplina que reivindica el open data: fuente citada, frescura declarada, cero coste, cero muro de registro.

### 2.2 Por qué no es redundante con "València al Minut" (la plataforma oficial)

Es una pregunta obligada como PM: el Ayuntamiento ya tiene un agregador en tiempo real. La propuesta de valor no es "duplicar", es:

1. **Un único mapa interactivo cross-fuente**, no un panel de cuadros de mando separados por servicio municipal.
2. **Capa de índice compuesto propia** (Pulso de Distrito) — algo que la plataforma oficial no ofrece: una lectura sintética por zona, no solo el dato en bruto.
3. **Abierto y extensible** — cualquiera puede ver cómo se calcula cada cosa (a diferencia de un portal institucional cerrado).
4. **Corroboración multi-fuente** — cuando hay dos fuentes para el mismo fenómeno (p. ej. AEMET + Open-Meteo), lo mostramos así en vez de elegir una en silencio.
5. Como proyecto, también sirve como **pieza de portfolio técnico** con estándar profesional — eso es legítimo como objetivo y debe quedar dicho, porque cambia cómo priorizamos (cuidamos calidad de ingeniería y documentación tanto como el resultado visible).

### 2.3 Personas

| Persona | Necesidad |
|---|---|
| Ciudadano curioso | "¿Cómo está la ciudad ahora mismo? ¿Llueve, hay atascos, hay aire limpio en mi barrio?" |
| Analista/periodista local | Necesita datos citables, con fuente y fecha, para contexto de una noticia. |
| Equipo de desarrollo | Vitrina técnica: arquitectura limpia, spec-driven, sin coste, mantenible. |

### 2.4 Alcance por fases (roadmap)

| Fase | Contenido | Objetivo |
|---|---|---|
| **F0 — Cimientos** | Mapa base (MapLibre) + geometría de distritos/barrios + arquitectura de capas (registro único estilo `LayerDefinition`) + pipeline seed→caché→API | Que exista el "lienzo" antes que ninguna capa. |
| **F1 — MVP con 3 capas** | Meteorología (Open-Meteo + avisos AEMET), Calidad del aire, Tráfico en tiempo real | Primer producto usable y demostrable. |
| **F2 — Movilidad completa** | Valenbisi, aparcamientos (si se confirma fuente), EMT si hay API viable | Cierra el bloque de movilidad. |
| **F3 — Índice de Pulso de Distrito** | Índice compuesto (tráfico + calidad aire + meteo adversa + incidencias), inspirado en el CII de World Monitor pero a escala de barrio | Es la pieza diferencial del producto. |
| **F4 — Capa de contexto/noticias** | RSS de medios locales + GDELT filtrado por Valencia | Añade "por qué" al "qué". |
| **F5 — Pulido y compartición** | Estado en URL, PWA instalable, rendimiento, accesibilidad | Nivel de acabado profesional. |

**No entra en el alcance actual** (para evitar repetir el sobredimensionamiento de World Monitor): app de escritorio, multi-idioma más allá de ES/VA/EN si acaso, monetización, cuentas de usuario, globo 3D.

### 2.5 Métricas de éxito (adaptadas a un proyecto sin usuarios de pago)

- % de capas con dato fresco (< 15 min de antigüedad) en un momento dado.
- Nº de distritos con dato real (no relleno/placeholder) por capa.
- Coste mensual real (objetivo: mantenerlo en 0 €).
- Tiempo de carga inicial del mapa (objetivo: <2s en conexión normal, gracias a la hidratación en bloque tipo `bootstrap`).

---

## Parte 3 — Proceso (rol Project Manager): cómo trabajamos con Spec-Driven Development

### 3.1 Principio

**Ninguna capa, endpoint o componente se escribe antes de que exista su spec aprobada.** El spec es el contrato: qué problema resuelve, de qué fuente sale el dato, qué forma tiene, cada cuánto se refresca, y cómo se pinta.

### 3.2 Estructura de specs propuesta

```
specs/
  SPEC_TEMPLATE.md              # plantilla reutilizable (ver documento adjunto)
  000-mapa-base-distritos.md    # fundacional — de la que dependen todas las capas
  001-capa-meteorologia.md
  002-capa-calidad-aire.md
  003-capa-trafico-tiempo-real.md
  004-capa-valenbisi.md
  010-indice-pulso-distrito.md  # compuesto — depende de 001-003 como mínimo
  ...
```

Cada spec tiene un número correlativo (no se reordena, no se reutiliza), vive en Markdown versionado en git, y **no se borra cuando queda obsoleta** — se marca `Deprecated` y se referencia la que la sustituye (mismo principio que ya aplicabais con las versiones de KPI).

### 3.3 Flujo de una spec a producción

```
1. Redactar spec (plantilla) ─┐
                               ├─► 2. Congelar el "contrato de datos" (schema del dato normalizado)
                               │      y el "contrato de capa" (LayerDefinition: id, renderer, zoom mínimo)
                               ▼
3. Implementar el seed (fuente externa → normalización → caché)
                               ▼
4. Implementar el endpoint interno que sirve el dato cacheado (nunca la fuente en directo)
                               ▼
5. Implementar la capa de mapa (consume el endpoint, no la fuente)
                               ▼
6. Verificación contra los criterios de aceptación del spec (Definition of Done)
                               ▼
7. Merge — la spec pasa de estado "Draft" a "Implemented"
```

Este orden es deliberado y calca el patrón de World Monitor (seed → Redis → bootstrap → panel): un principio de capas estándar (`origen → normalización → agregados → serving → UI`) donde el "origen" es una API pública.

### 3.4 Cadencia

Sin ceremonias pesadas (no hace falta Scrum formal para este tamaño de equipo): **una spec es la unidad de trabajo**. Se completa una spec de principio a fin (spec → seed → endpoint → capa → verificación) antes de abrir la siguiente, salvo que una bloquee a otra explícitamente (p. ej. `000-mapa-base-distritos` bloquea a todas).

### 3.5 Definition of Done por spec (por defecto, salvo que la spec diga otra cosa)

- Fuente de datos verificada manualmente (no solo por búsqueda web) con al menos una llamada real de prueba.
- Dato cacheado con TTL definido y comportamiento "stale-on-error" documentado.
- Endpoint interno responde con el schema declarado en la spec.
- Capa visible en el mapa con al menos una prueba manual en los tres niveles de zoom (ciudad/distrito/calle si aplica).
- Fuente y frescura del dato visibles en la UI (no un dato "mudo" sin atribución).

---

## Siguiente paso

El Spec-Driven Development arranca con dos artefactos: la plantilla de spec reutilizable, y la primera spec real (`000-mapa-base-distritos`), que es la única sin la cual ninguna capa puede existir.
