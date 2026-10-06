# ADR-008 — `VITE_VERSION_PUBLICA`: ocultar funciones en el despliegue público

**Fecha:** 2026-10-06
**Estado:** Aceptado — decisión del product owner, fuera de una sesión de código (`CLAUDE.md` §3 y §8).

---

## Contexto

`ADR-007` ya separa el despliegue público (Vercel, rama `publico`) de la línea
interna (`master`, desarrollo continuo). Al preparar el cierre de la ronda
actual de la versión pública, el usuario pidió que varias piezas dejaran de
verse **solo ahí**, sin tocar `master`:

- "Gemelo digital" (simulador de cortes, spec `022`): todavía no está
  terminado y puede confundir a una audiencia pública.
- Seis tarjetas de `/inteligencia`: cámaras en vías de acceso (DGT, spec
  `043`), cámaras en vivo (spec `038`), apoyo a la decisión operativa (spec
  `041`), señales correlacionadas y recomendaciones de actuación (spec `047`
  v2), y términos en tendencia (spec `025`). Todas son piezas ya
  `Implemented` y útiles para el uso operativo interno, pero no encajan en
  una presentación pensada para "gente de a pie" (`ADR-007`).

`ADR-003` ya resolvía un problema parecido para fuentes "personales"
(`VITE_PERSONAL_<NOMBRE>`), pero con el sentido contrario: ahí el defecto es
**apagado** y hay que encender explícitamente. Aquí el defecto tiene que
seguir siendo la experiencia interna completa (nadie quiere tener que definir
variables nuevas en su `.env.local` para seguir viendo lo de siempre).

## Decisión

- Variable de entorno de cliente **`VITE_VERSION_PUBLICA`**, leída con el
  mismo patrón que `flagPersonalActiva` de `camaras-urbanas.ts`
  (`src/config/version-despliegue.ts`, función `esVersionPublica()`).
- **Por defecto (sin la variable) se ve todo** — `master`, dev local y
  cualquier despliegue que no la defina muestran la experiencia interna
  completa, igual que antes de este ADR.
- Solo el proyecto de Vercel que trackea `publico` define
  `VITE_VERSION_PUBLICA=1` en sus variables de entorno. Con ella activa:
  - `SIDEBAR_REGISTRY` (`src/ui/chasis.ts`) se filtra para excluir la
    sección `gemelo-digital`.
  - `main.ts` no monta `tendencia-panel`, `camaras-panel`,
    `camaras-dgt-panel`, `apoyo-decision-panel`, `senales-ia-panel` ni
    `recomendaciones-ia-panel` — no se crean ni se insertan en el DOM (no es
    solo un `hidden`), así que no dejan hueco visual y no hace falta tocar
    `idsInteligencia`/`layout-movil.ts` (ya toleran ids que no existen).
- Mismo mecanismo exacto que `ADR-003`, solo que invertido en el sentido del
  defecto — no se introduce un segundo patrón de gating.

## Qué NO cambia

- Las seis piezas siguen `Implemented` en `specs/INDEX.md` tal cual — esto
  no es una reversión de ninguna spec, solo una cuestión de qué build las
  muestra.
- `ADR-003` sigue vigente íntegro para las fuentes "personales" — son
  mecanismos independientes que pueden coexistir (p. ej. las cámaras de
  Turisme CV siguen gateadas también por su `VITE_PERSONAL_*` propio).
- `ADR-007` no cambia: sigue siendo `publico` la única rama que se despliega
  en Vercel.

## Consecuencia práctica

- Quien gestione el proyecto de Vercel `vlc-monitor` (el que trackea
  `publico`) tiene que añadir `VITE_VERSION_PUBLICA=1` en sus variables de
  entorno una vez — no es un cambio de código adicional.
- Reabrir cualquiera de estas seis piezas (o el simulador) para el público
  es una decisión de producto explícita, no un efecto secundario de otra
  tarea — quitar la entrada de la lista de arriba y de este ADR.
