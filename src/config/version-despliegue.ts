/**
 * Distingue el despliegue público (Vercel, rama `publico`) de la línea interna
 * (`master`) — ver `ADR-008-ocultar-funciones-en-version-publica.md` y
 * `ADR-007-ramas-publico-vs-interno.md`. Mismo patrón de lectura de variable
 * que `camaras-urbanas.ts` (`VITE_PERSONAL_*`), pero con el sentido invertido:
 * por defecto (sin la variable, como en `master`/dev local) se ve todo —
 * la experiencia interna completa es la que no necesita ninguna variable.
 * Solo el proyecto de Vercel que trackea `publico` define
 * `VITE_VERSION_PUBLICA=1` para ocultar las piezas que todavía no están listas
 * para una audiencia pública o que son más propias del uso operativo interno.
 */
export function esVersionPublica(): boolean {
  const env = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  const valor = env.VITE_VERSION_PUBLICA;
  return valor !== undefined && valor !== '' && valor !== 'false' && valor !== false;
}
