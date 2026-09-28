// Empaqueta api/_router-src.ts en un único api/router.js autocontenido.
//
// Por qué: Vercel Hobby limita a 12 funciones/deploy, así que toda la API va
// en una sola función (el router). Su runtime Node en ESM estricto necesita
// extensiones en los imports relativos y `with { type: 'json' }` — cosas que
// el tsc del proyecto (moduleResolution: bundler) no emite. esbuild resuelve
// todo eso inlineando: un fichero, sin imports relativos, sin JSON externo.
//
// api/router.js SÍ va commiteado (aunque sea un artefacto generado): la
// detección de funciones de Vercel para el preset "Other" escanea el árbol
// del repo, no lo que produzca este build command — un fichero que solo
// exista en disco tras `npm run build` nunca se registra como función y la
// API entera devuelve 404 en producción (verificado en vivo el 2026-09-28
// con `vercel build` local: sin trackear, `.vercel/output/functions/` no
// incluye el router). Hay que regenerarlo y volver a commitearlo en cada
// cambio de `api/_router-src.ts` o de los handlers de `src/server/`.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(raiz, 'api/_router-src.ts')],
  outfile: join(raiz, 'api/router.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.json': 'json' },
  logLevel: 'info',
  // Node built-ins quedan externos (correcto). Todo lo demás —incluidas las
  // dependencias npm (@turf/circle, rbush)— se inlinea.
  //
  // Bug real de producción (2026-09-23): una dependencia transitiva de
  // @ai-sdk/gateway (@vercel/oidc, usada por sintesis-ia.ts/sintesis-ia-v2.ts)
  // hace un `require(...)` dinámico (no estático) que esbuild no puede
  // inlinear. En `format: 'esm'` no existe un `require` global, así que el
  // shim que genera esbuild lo detecta como `undefined` y lanza "Dynamic
  // require of ... is not supported" — en tiempo de CARGA del módulo, lo que
  // tira TODA la función (todas las rutas, no solo las de IA). Se soluciona
  // definiendo un `require` real vía `createRequire`, igual que recomienda la
  // documentación de esbuild para este caso exacto.
  banner: {
    js: "import { createRequire as __vlcCreateRequire } from 'node:module';\nconst require = __vlcCreateRequire(import.meta.url);",
  },
});

console.log('api/router.js generado.');
