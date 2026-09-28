/**
 * Registro de cámaras urbanas en directo — spec 038 v4. Sin backend: son embeds
 * de terceros que el navegador reproduce directamente desde el proveedor (nunca
 * se graba ni se rehostea nada). Mismo patrón que `map-layer-definitions.ts`
 * (registro único, un objeto por entrada), sin pipeline seed→caché→endpoint
 * porque no hay dato que normalizar.
 *
 * Categorías (`ADR-003`, `docs/decisiones/ADR-003-capas-publicas-vs-personales.md`):
 *  - 'publica'  → activa siempre, mecanismo de embebido explícitamente autorizado
 *                 por la propia plataforma.
 *  - 'personal' → técnicamente accesible pero sin permiso escrito de reuso; solo
 *                 se activa si quien despliega define su propio `envFlag`
 *                 (`VITE_<NOMBRE>`, prefijo obligatorio de Vite para llegar al
 *                 bundle de cliente). Nunca encendida por defecto en el repo público.
 *
 * v4 — a petición del usuario tras ver v3 en vivo:
 *  - Se retira la cámara de YouTube (canal "Wolkam IT"): el canal no estaba
 *    emitiendo ("no disponible") y no hay garantía de que lo esté nunca — de
 *    momento **no hay ninguna cámara "pública" activa por defecto**, las dos
 *    que quedan son "personales" (Turisme CV). Ver spec 038 §7.
 *  - Se corrige el nombre de la cámara de la playa: se llamaba "Les Arenes /
 *    Ciutat de les Arts" porque su manifest aparecía también en la página de
 *    Turisme CV de "Ciutat de les Arts i les Ciències" — pero esa cámara NO
 *    muestra el complejo, muestra la Platja de Les Arenes / El Cabanyal (junto
 *    al Hostal Miramar). La propia nota de prensa de Turisme CV la describe
 *    así ("la animada zona portuaria desde la playa de Las Arenas en
 *    València"). El nombre anterior prometía algo que la cámara no enseña —
 *    corregido para que la etiqueta coincida con lo que de verdad se ve.
 *
 * v5 — a petición del usuario ("centralizar cámaras... otras que puedan haber
 * similares"), dos candidatas nuevas investigadas:
 *  - `meteo365.es` (Puerto de Valencia): **descartada**, no añadida — su imagen
 *    en directo tiene protección de hotlinking activa (403 salvo `Referer`
 *    exacto `meteo365.es`, comprobado con `curl`) y su aviso legal prohíbe
 *    expresamente "reproducción, distribución o modificación sin autorización
 *    expresa". Es un bloqueo técnico activo, no una zona gris como Turisme CV.
 *  - Misma red Turisme CV: se encontraron **2 cámaras más** de Valencia-ciudad
 *    que no estaban en el registro (`sitemap.xml`, filtro por municipio
 *    "València" no daba resultado por la UI — se confirmó por sitemap):
 *    Jardín del Turia y El Saler. Mismo mecanismo (DASH, CORS abierto) y misma
 *    categoría "personal" ya resuelta — no cambia la clasificación de
 *    `ADR-003`, solo añade puntos a la misma fuente ya aprobada.
 */

export type ProveedorCamara = 'youtube-canal' | 'turisme-cv-dash';

export interface CamaraUrbana {
  id: string;
  nombre: string;
  proveedor: ProveedorCamara;
  categoria: 'publica' | 'personal';
  /** Solo si categoria === 'personal'. Nombre de la variable VITE_* que la activa. */
  envFlag?: string;
  /** Solo proveedor 'youtube-canal' — id de canal, no de vídeo. */
  youtubeChannelId?: string;
  /** Solo proveedor 'turisme-cv-dash'. */
  manifestUrl?: string;
  atribucion: string;
  fuenteUrl: string;
}

export const CAMARAS_URBANAS: CamaraUrbana[] = [
  {
    id: 'turisme-cv-plaza-ayuntamiento',
    nombre: 'Plaça de l’Ajuntament',
    proveedor: 'turisme-cv-dash',
    categoria: 'personal',
    envFlag: 'VITE_PERSONAL_CAMARA_TURISME_CV',
    manifestUrl: 'https://streaming.comunitatvalenciana.com/webcam/ValenciaPlazaAyuntamiento/manifest.mpd',
    atribucion: 'Xarxa de Webcams — Turisme Comunitat Valenciana',
    fuenteUrl: 'https://www.comunitatvalenciana.com/es/valencia/valencia/webcams/valencia-plaza-ayuntamiento',
  },
  {
    id: 'turisme-cv-las-arenas',
    nombre: 'Platja de Les Arenes / El Cabanyal',
    proveedor: 'turisme-cv-dash',
    categoria: 'personal',
    envFlag: 'VITE_PERSONAL_CAMARA_TURISME_CV',
    // Página dedicada real de esta cámara (no la de "Ciutat de les Arts", que
    // solo la reutilizaba) — "Valencia, Las Arenas Beach (Hostal Miramar)".
    manifestUrl: 'https://streaming.comunitatvalenciana.com/webcam/ValenciaLasArenas/manifest.mpd',
    atribucion: 'Xarxa de Webcams — Turisme Comunitat Valenciana',
    fuenteUrl: 'https://www.comunitatvalenciana.com/en/valencia/valencia/webcams/valencia-las-arenas',
  },
  {
    id: 'turisme-cv-jardin-del-turia',
    nombre: 'Jardín del Turia',
    proveedor: 'turisme-cv-dash',
    categoria: 'personal',
    envFlag: 'VITE_PERSONAL_CAMARA_TURISME_CV',
    manifestUrl: 'https://streaming.comunitatvalenciana.com/webcam/ValenciaJardinDelTuria/manifest.mpd',
    atribucion: 'Xarxa de Webcams — Turisme Comunitat Valenciana',
    fuenteUrl: 'https://www.comunitatvalenciana.com/es/valencia/valencia/webcams/valencia-jardin-del-turia',
  },
  {
    id: 'turisme-cv-el-saler',
    nombre: 'El Saler',
    proveedor: 'turisme-cv-dash',
    categoria: 'personal',
    envFlag: 'VITE_PERSONAL_CAMARA_TURISME_CV',
    manifestUrl: 'https://streaming.comunitatvalenciana.com/webcam/ElSaler/manifest.mpd',
    atribucion: 'Xarxa de Webcams — Turisme Comunitat Valenciana',
    fuenteUrl: 'https://www.comunitatvalenciana.com/es/valencia/valencia/webcams/valencia-el-saler',
  },
];

function flagPersonalActiva(envFlag: string): boolean {
  const env = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  const valor = env[envFlag];
  return valor !== undefined && valor !== '' && valor !== 'false' && valor !== false;
}

/** Cámaras que corresponde mostrar en esta build: públicas siempre, personales solo con su `envFlag`. */
export function camarasVisibles(): CamaraUrbana[] {
  return CAMARAS_URBANAS.filter((c) => {
    if (c.categoria === 'publica') return true;
    return c.envFlag !== undefined && flagPersonalActiva(c.envFlag);
  });
}
