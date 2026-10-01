# ADR-007 — `publico` como rama de publicación frente a `master` como línea interna

**Fecha:** 2026-10-01
**Estado:** Aceptado — decisión del product owner, fuera de una sesión de código (`CLAUDE.md` §3 y §8).

---

## Contexto

Hasta ahora el repo tenía una única rama (`master`) y un único despliegue de Vercel
(`vlc-monitor`), con `ADR-003` resolviendo la diferencia entre fuentes "públicas" y
"personales" dentro de ese mismo despliegue mediante flags de entorno
(`VITE_PERSONAL_<NOMBRE>`).

Eso deja de bastar cuando aparecen dos objetivos de producto distintos para el mismo
código:

1. **Versión pública** (Vercel, `vlc-monitor.vercel.app` y dominio propio futuro):
   un proyecto de presentación, terminado y pulido, pensado para "gente de a pie" con
   información de contexto de la ciudad. Una vez cerrada una ronda de retoques, se
   queda publicada tal cual — no es un objetivo en evolución continua.
2. **Versión interna**: una herramienta de apoyo a la función policial, con cámaras
   urbanas (`038`, categoría "personal" de `ADR-003`) y futuras fuentes/paneles
   internos, en desarrollo continuo. No se despliega en Vercel — el usuario la
   trabaja en local y prevé llevarla a un entorno corporativo propio (contenedor
   Docker en infraestructura .NET de la organización), accesible solo desde dentro,
   cuando esté lista. Ese despliegue queda fuera de este repo (`CLAUDE.md` §1: "Cualquier
   despliegue que quiera una orientación operativa específica la añade por su cuenta,
   fuera de este repo, con su propia autorización y cumplimiento").

Dos ramas de git independientes y divergentes habrían resuelto esto a corto plazo, pero
con el coste de tener que mergear o cherry-pickear cada spec nueva a mano a los dos
sitios para siempre, con riesgo de divergencia silenciosa.

## Decisión

- **`master`** es la línea de trabajo real: todo commit nuevo (specs, capas, datos
  internos) entra aquí primero, igual que siempre.
- **`publico`** es una rama de publicación, no de desarrollo: no recibe commits
  propios, solo se actualiza mergeando `master` → `publico` cuando el usuario decide
  que una ronda de cambios está lista para el sitio público. Creada el 2026-10-01 desde
  el `master` de ese momento (ya incluía la landing de `053`).
- El proyecto de Vercel **`vlc-monitor`** trackea `publico` como Production Branch
  (antes `master`) — es el único despliegue de Vercel de este proyecto. No hay, de
  momento, un segundo proyecto de Vercel para la versión interna: esa versión no vive
  en Vercel, vive en local y eventualmente en infraestructura corporativa propia, fuera
  del alcance de este repo.
- Las fuentes "personales" (`ADR-003`) se activan en local/en el futuro despliegue
  interno vía las mismas variables `VITE_PERSONAL_<NOMBRE>` de siempre — este ADR no
  cambia ese mecanismo, solo añade el nivel de "qué rama ve cada despliegue" por
  encima.
- No hace falta "quitar la landing" para el uso interno: `/mapa` (spec `053`) ya es una
  ruta independiente de `/`. El uso interno simplemente navega directo a `/mapa`; la
  landing en `/` no estorba por existir si no se visita.

## Qué NO cambia

- `ADR-003` sigue vigente íntegro — sigue siendo el mecanismo para decidir si una
  fuente va activa por defecto o gateada.
- El límite ético/legal de `CLAUDE.md` §4 aplica igual en ambas ramas — son el mismo
  código, con las mismas reglas.
- El flujo spec-driven de `CLAUDE.md` §2 no cambia: una spec nueva se implementa una
  vez en `master`, no por duplicado.

## Consecuencia práctica

- Al terminar una ronda de mejoras destinada al público: `git checkout publico && git
  merge master && git push`. Vercel redespliega solo con eso.
- Si en el futuro la versión interna necesita su propio despliegue de Vercel (en vez
  de, o además de, el entorno corporativo), sería un proyecto nuevo trackeando
  `master`, con sus propias variables (`VITE_PERSONAL_*`, `AUTH_SECRET`/`APP_USERS` de
  `018`) — no está montado todavía, se añade cuando haga falta.
