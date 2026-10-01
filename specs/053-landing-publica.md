# 053 — Landing pública + página de proceso de construcción

```yaml
id: 053
titulo: "Landing de presentación en '/', mapa operativo movido a '/mapa', página de proceso en '/proceso'"
estado: Implemented
tipo: fundacional
depende_de: [030]
propietario: ""
version: 2
```

> **v2 (2026-09-30):** petición directa del usuario tras ver la v1 — fondo animado en el
> hero (ciudad procedural en Three.js, técnica inspirada en un experimento público del
> motor, reescrita en TypeScript sin librería de tweening, recoloreada a la paleta de
> marca) + acento de marca (`--mirall-acento: #33d6c0`) extendido a los botones/enlaces
> "neutros" (no semánticos) de `/mapa` — toast de PWA, checkboxes de capas, pantalla de
> login. **Explícitamente fuera de esta versión:** los colores de alerta/urgencia y el
> badge `MOCK` de `/mapa`, que siguen en rojo — es información de severidad real
> (`CLAUDE.md` §4), no decoración, y el usuario decidió no tocarlos.

## 1. Problema / motivación

Hasta ahora `/` carga directo la herramienta operativa (el mapa, `index.html` →
`src/main.ts`). No hay ninguna pieza pensada para quien llega al dominio sin conocer el
proyecto: qué es, quién lo mantiene, cómo colaborar. El usuario va a comprar un dominio
propio para el proyecto y quiere que lo primero que vea cualquier visitante sea una
landing de presentación — título **Mirall** en grande, subtítulo **urban intelligence**,
manifiesto, contacto para colaboraciones (`mirall.urbanintelligence@gmail.com`), stack
tecnológico — y una segunda página que cuente el proceso de construcción (metodología
spec-driven, fases del roadmap).

El mapa operativo lo usa el propio usuario en modo kiosco/tiempo real y no debe quedar
detrás de la landing para quien ya sabe a dónde va — se mueve a su propia ruta `/mapa`,
accesible en un enlace directo (bookmark del kiosco) sin pasar por la landing.

Esto **no es una capa de datos** — no aplica el flujo seed→caché→endpoint de `CLAUDE.md`
§2/§3.3. Es contenido estático de presentación, de ahí `tipo: fundacional` (mismo
precedente que la spec `030`, que también reescribió README/copy sin tocar datos).

## 2. Alcance

- Landing (`/`, `index.html` nuevo en la raíz): hero con el nombre, manifiesto (la
  declaración de misión de `CLAUDE.md` §1), sección de stack tecnológico, sección de
  contacto/colaboración, enlaces a `/mapa` (abrir la herramienta) y `/proceso` (cómo se
  ha construido).
- Página de proceso (`/proceso`): narrativa de cómo se ha ido construyendo el proyecto
  — boceto inicial, inspiración en World Monitor, proceso spec-driven (`CLAUDE.md` §2),
  fases reales del `ROADMAP.md`, límite ético/legal (`CLAUDE.md` §4) como parte del
  proceso, no como nota al pie.
- El mapa operativo se muda de `index.html` (raíz) a `mapa/index.html` — mismo
  contenido, mismas rutas absolutas (`/src/main.ts`, `/src/estilos.css`), sin cambios de
  comportamiento interno (el router de vistas `#/` / `#/inteligencia`, spec `040`, es
  por hash y no depende de la ruta base).
- Ajustes de infraestructura que dependen de la mudanza: `vite.config.ts` (build
  multi-página, ruta del gate de dev, `start_url`/`scope` del manifest PWA a `/mapa/`),
  `middleware.ts` (la landing y `/proceso` quedan siempre públicas, aunque el
  despliegue tenga `AUTH_SECRET` activo — el gate solo protege la herramienta).

## 3. Fuente(s) de datos

No aplica — no consume ninguna fuente externa, es contenido estático.

## 4. Contrato de datos (normalizado)

No aplica.

## 5. Pipeline (seed → caché → endpoint)

No aplica.

## 6. Contrato de capa de mapa

No aplica — no es una capa de mapa.

## 7. Criterios de aceptación (Definition of Done)

- [ ] `/` sirve la landing (hero + manifiesto + stack + contacto + enlaces), sin
      pasar por el gate de acceso aunque `AUTH_SECRET` esté activo.
- [ ] `/mapa` sirve la herramienta operativa igual que antes (mismo comportamiento,
      mismas vistas `#/` / `#/inteligencia`), respetando el gate de acceso si
      `AUTH_SECRET` está activo.
- [ ] `/proceso` sirve la página de proceso de construcción, también siempre pública.
- [ ] `npm run build` genera las tres páginas en `dist/` (multi-page Vite).
- [ ] `npm run typecheck` y `npm run test` en verde.
- [ ] Verificado visualmente en el navegador: landing, proceso y mapa, en escritorio y
      móvil.
- [ ] El manifest de PWA instala directo en `/mapa/` (no en la landing).
- [ ] README actualizado si el enlace de "demo en vivo" apuntaba a la raíz.

## 8. Riesgos y fuera de alcance

- No incluye compra ni configuración del dominio, ni DNS — eso lo hace el usuario
  fuera de esta sesión.
- No incluye analítica/tracking en la landing (fuera de alcance por defecto salvo que
  se pida explícitamente, y en ese caso con el mismo criterio de privacidad que el
  resto del proyecto).
- No cambia nada del modelo de datos, capas de mapa ni endpoints — puramente
  presentación y enrutado estático.
- Los iconos del stack tecnológico son glifos genéricos propios, no logos de marca de
  terceros (evita cuestiones de uso de marca en una página pública indexable).

## 9. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-30 | Creación e implementación: landing en `/`, mapa movido a `/mapa`, página de proceso en `/proceso` |
| 2 | 2026-09-30 | Fondo 3D (Three.js, `src/paginas/hero-ciudad-3d.ts`) en el hero + acento de marca extendido a botones/enlaces no semánticos de `/mapa` (toast PWA, checkboxes, login), sin tocar colores de alerta/MOCK |
