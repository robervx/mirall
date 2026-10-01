# Presentación en LinkedIn

Material listo para publicar. El repo público es la pieza de portfolio; el post de
LinkedIn es el anzuelo que lleva a él.

- **Repo:** https://github.com/robervx/mirall
- **Demo en vivo:** https://vlc-monitor.vercel.app
- **Capturas:** `docs/capturas/` (hero para el post, las otras 3 para el carrusel o el primer comentario)

---

## Post principal (español)

> **Mirall — un mapa vivo de València con datos 100 % abiertos, operando a coste 0 €**
>
> Llevaba tiempo con una idea: ¿se puede montar un panel serio de "cómo está la ciudad ahora mismo" usando solo datos públicos y gratuitos, con estándar profesional de ingeniería? Este es el resultado.
>
> En un único mapa interactivo:
> • Movilidad — tráfico en tiempo real, Valenbisi, aparcamiento
> • Ambiente — meteorología, predicción a 4 h, calidad del aire, avisos AEMET
> • Un **Índice de Pulso de Distrito** que sintetiza tráfico + aire + meteo por zona
> • Ciudad — Fallas, obras y cortes de calle oficiales
> • Contexto — prensa local agregada y geolocalizada por distrito
> • Herramientas de gestión municipal — grafo viario de la ciudad, propuesta de cordón por incidente y un simulador de "¿qué pasa si cortamos estas calles?" con propagación dirigida por sentido de circulación
>
> Lo que más cuidé, y que se ve en el repo:
> • **Spec-driven** — ninguna capa se escribe sin su contrato de datos congelado y verificado contra la fuente real
> • Cada capa **cita su fuente y su frescura**, y avisa si el dato no está en vivo
> • **Límite ético duro** — cero datos de localización individual, "avisa, no actúa", todo lo simulado marcado
> • **Coste de operación: 0 €** — el navegador nunca llama a una fuente externa; todo pasa por una caché propia con *stale-on-error*, el patrón que hace viable operar sobre *free tiers*
>
> Stack: TypeScript · Vite · MapLibre GL + deck.gl (2D) · funciones edge en Vercel · GitHub Actions para los *seeds*.
>
> Es un proyecto abierto (MIT): se puede desplegar tal cual o partir de él para otra ciudad.
>
> 🔗 Demo: https://vlc-monitor.vercel.app
> 🔗 Código y documentación: https://github.com/robervx/mirall
>
> Feedback bienvenido, sobre todo de quien trabaje con datos abiertos municipales o movilidad urbana.
>
> #OpenData #DatosAbiertos #SmartCity #Valencia #TypeScript #DataVisualization #MapLibre #CivicTech

---

## Versión corta (español)

> He publicado **Mirall**: un mapa en tiempo real de València que reúne movilidad, meteorología, calidad del aire, eventos e incidencias en un solo panel, a partir de datos abiertos y gratuitos.
>
> Desarrollo *spec-driven*, cada capa cita fuente y frescura, límite ético estricto (ningún dato de localización individual) y coste de operación 0 € gracias a un patrón de caché propio.
>
> Incluye herramientas de gestión municipal: grafo viario de la ciudad, propuesta de cordón por incidente y un simulador de cortes de calle.
>
> Proyecto abierto (MIT).
> Demo: https://vlc-monitor.vercel.app
> Código: https://github.com/robervx/mirall
>
> #OpenData #SmartCity #Valencia #TypeScript #CivicTech

---

## Post (English)

> **Mirall — a live open-data map of Valencia, running at ~0 €/month**
>
> Can you build a serious "how is the city doing right now?" dashboard using only free, public data, at a professional engineering standard? This is my take.
>
> One interactive map: real-time traffic, bike share and parking; weather, 4-hour forecast and air quality; a composite **District Pulse** index; official roadworks and street closures; local press context geolocated by district; and municipal-management tools — a city road graph with an incident-cordon proposer and a "what if we close these streets?" simulator with directed, one-way-aware propagation.
>
> What I focused on:
> • **Spec-driven** — no layer ships without a frozen data contract verified against the real source
> • Every layer **cites its source and freshness**, and flags stale data
> • **Hard ethical line** — no individual-location data, alerts a human but never acts, all simulated data flagged
> • **~0 € to operate** — the browser never calls an external source; everything goes through an internal cache with stale-on-error
>
> Stack: TypeScript · Vite · MapLibre GL + deck.gl (2D) · Vercel edge functions · GitHub Actions.
> Open project (MIT) — deploy as-is or fork it for another city.
>
> 🔗 Demo: https://vlc-monitor.vercel.app
> 🔗 Code: https://github.com/robervx/mirall
>
> #OpenData #SmartCity #TypeScript #DataVisualization #CivicTech #MapLibre

---

## Checklist antes de publicar

- [ ] Repo en público en GitHub, con *About* y *topics* (`open-data`, `smart-city`, `valencia`, `typescript`, `maplibre`, `civic-tech`) y el enlace a la demo en el campo *Website*.
- [ ] Demo cargando bien en https://vlc-monitor.vercel.app (probar en móvil también).
- [ ] Subir la captura `hero-escritorio.jpg` como imagen del post (o las 4 como carrusel).
- [ ] Poner los enlaces también en el **primer comentario** (LinkedIn penaliza menos así) además de en el cuerpo.
- [ ] Revisar que el nombre del repo/proyecto es coherente en todos lados.
- [ ] Opcional: fijar el post en el perfil y añadir el proyecto en la sección *Proyectos* / *Destacado*.
