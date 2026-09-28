# Plan post-V1 — próxima tanda de trabajo

**Fecha:** 2026-09-17. El [Definition of Done de V1](02_DEFINITION_OF_DONE_V1.md) quedó
completo (12/12 pasos) el mismo día. Este documento recoge la siguiente tanda de trabajo,
definida con el usuario para continuar en otra sesión. **Actualización (2026-09-17, misma
tanda): las 4 piezas (`027` v4, `043`, `044`, `045`) quedaron `Implemented`** — incluida
`045`, cuyo proveedor de IA cambió dos veces tras la aprobación inicial (ver historial más
abajo) hasta confirmarse en vivo con una cuenta 100% gratuita. `044` recibió además una v4
con temperatura por zona real (AVAMET), a partir de una petición explícita del usuario ya
en esta misma tanda.

**Actualización (2026-09-25): toda esta tanda, incluida la investigación de escorrentía
abierta más abajo, terminó `Implemented`** (`046` a `052`, ver `specs/INDEX.md` para el
detalle real de cada versión) y ya está reflejada como fase **F11** en `ROADMAP.md`. El
resto de este documento se conserva tal cual por su valor histórico (cómo se llegó a cada
decisión), no como estado vigente — `specs/INDEX.md` y `ROADMAP.md` mandan sobre lo que
diga el resto de este fichero.

## Orden de prioridad (decidido explícitamente por el usuario)

1. ~~**[`027` v4](../specs/027-agenda-eventos-scraping.md)**~~ — **Implementado
   (2026-09-17).** Agenda de eventos con impacto en vía pública (fútbol de Valencia
   CF/Levante UD como local, Roig Arena, carreras FDM) — las 4 fuentes nuevas no
   necesitaron Playwright, HTML/JSON plano vía `fetch()`.
2. ~~**[`043`](../specs/043-camaras-urbanas-externas.md)**~~ — **Implementado
   (2026-09-17).** Bloque de cámaras urbanas *externas* (red viaria que rodea Valencia).
   `livetrafik.com` descartado por protecciones anti-bot; fuente real = DGT (JSON +
   imágenes JPEG oficiales, licencia Creative Commons Attribution) — **pública por
   defecto**, mejor resultado que la hipótesis "personal" de partida. 84 cámaras.
3. ~~**[`044`](../specs/044-panel-emergencia-meteorologica.md)**~~ — **Implementado
   (2026-09-17, v4).** Panel de emergencia meteorológica: altimetría por distrito (IGN, seed
   único), lluvia/viento por distrito (Open-Meteo multi-coordenada), pluviómetros reales
   (SAIH Júcar) — no hizo falta dividir en specs separadas. "Capacidad de absorción"
   descartada, sin fuente oficial. **v4 (misma tanda):** a partir de unas capturas que
   compartió el usuario de AVAMET, se añadió temperatura/humedad/viento/lluvia real por
   estación dentro de la ciudad (`mxo-mxo.php?territori=c15` embebe un array JSON con
   lat/lon por estación — resuelve el bloqueante de geocodificación que quedó abierto en
   v2). Esa misma conversación abrió una investigación más amplia sobre escorrentía urbana
   e hidrología, ver el punto "Qué sigue" más abajo.
4. ~~**[`045`](../specs/045-panel-sintesis-ia.md)**~~ — **Implementado (2026-09-17, v5).**
   Panel de síntesis con IA. El usuario aprobó primero Vercel AI Gateway + Claude Haiku
   (`docs/decisiones/ADR-005-panel-sintesis-ia.md`), luego reconsideró por un proveedor
   **gratuito de verdad** atado a su cuenta personal (Google Gemini, API directa) y
   finalmente compartió su propia clave de AI Studio para verificar en vivo. Esa
   verificación encontró y corrigió 2 bugs reales (modelo poco fiable, truncado por
   razonamiento interno) y confirmó que la cuota gratuita de `gemini-3.6-flash` es muy
   ajustada (~20 peticiones/día) — al pedir explorar alternativas, `gemini-3-flash-preview`
   resultó tener cuota separada y bastante más generosa, y con él se confirmó el camino
   feliz completo (HTTP 200 con datos reales de la ciudad). Guardrails por esquema (`zod`)
   sin cambios: `fuenteSpec` no vacío forzado, aviso "generado por IA" siempre visible. Sin
   huecos pendientes — ver "Revisión v4" en el ADR.

## Cómo retomar cada una

Todas están en `Draft` con una sección de due-diligence ligera (solo alcanzabilidad de
dominios/`robots.txt`, no estructura de datos ni condiciones de uso reales) — el primer
paso real de cada una es la misma investigación en profundidad que ya se ha hecho para
cada spec `Implemented` de este repo (`CLAUDE.md` §8.2), no asumir que lo apuntado aquí ya
vale como verificación.

- Las 4 piezas de esta tanda (**`027` v4**, **`043`**, **`044` v4**, **`045` v5**) están
  `Implemented` (2026-09-17), con el camino feliz de `045` ya confirmado en vivo. No queda
  trabajo pendiente de esta tanda.

## Qué sigue — investigación abierta sin implementar (2026-09-17)

A raíz de la integración de AVAMET en `044` v4, el usuario compartió una investigación
extensa sobre escorrentía urbana e hidrología en Valencia (SIRA, coeficientes de
escorrentía, pluviómetros municipales adicionales, LiDAR, PATRICOVA/SNCZI, método HAND).
Queda documentada en
[`docs/investigacion/ESCORRENTIA_HIDROLOGIA_URBANA_VLC.md`](investigacion/ESCORRENTIA_HIDROLOGIA_URBANA_VLC.md)
y reservada como spec **[`046`](../specs/INDEX.md)** en estado `Planned` — es
sustancialmente más grande que cualquier spec de esta tanda (cruza topografía, red de
saneamiento y normativa), por lo que sigue el flujo normal de `CLAUDE.md` §2: due-diligence
de spec propia antes de escribir código, no una extensión de `044`.

También quedan explícitamente aparcados por el usuario, sin fecha ("iremos viendo"):
revisar "actualidad institucional" (sobre todo el bloque de Twitter/X) y cómo sacarle más
valor a la agenda de eventos (`027`).

## Qué NO es esta tanda

No sustituye ni reabre nada del DoD de V1 ya cerrado (`docs/02_DEFINITION_OF_DONE_V1.md`).
No es una fase nueva confirmada en `ROADMAP.md` en el sentido de "aprobada para
implementar sin más" — cuando cada spec pase de `Draft` a `Approved` (contrato de datos
verificado), es el momento de reflejarlo también en `ROADMAP.md` como fase F11, no antes.
