// Config de ESLint (flat config, que es la única que soporta ESLint 9).
//
// El script `lint` existía en package.json desde la Fase 2 pero NUNCA corrió:
// no había ningún eslint.config.*, así que fallaba con "couldn't find a config
// file". Esto lo hace andar por primera vez.
//
// Qué NO se lintea y por qué:
//  - `index.html`: el legacy es HTML, ESLint no lo mira. Sus ~12.5k líneas de JS
//    quedan sin cubrir hasta que cada sección se migre. Es lo esperado, no un
//    agujero que tapar: linteralo hoy daría cientos de errores sobre código que
//    está por morir.
//  - `public/legacy/`: es una copia generada de index.html (la hace `prebuild`).
//
// 🔴 `api/`, `scripts/` y `lib/**/*.js` SÍ se lintean, aunque sin las reglas de
// React ni de TS. `api/` y `scripts/` estuvieron ignorados hasta el 9-ago-2026, y
// esa combinación —fuera de ESLint y fuera de tsconfig— dejaba la capa entera de
// handlers **sin un solo chequeo estático**. Costó un 500 en producción: un
// refactor borró la variable `pag` y dejó un `pag.data.name` tres líneas abajo;
// typecheck, lint, las 2.469 pruebas y el build pasaron los cuatro en verde sobre
// una `ReferenceError` segura. `no-undef` sola lo habría cazado, y no hace falta
// nada más para eso.
//
// 🔴 **`lib/**/*.js` entró recién el 13-ago-2026, y era el mismo agujero mudado de
// lugar.** Ese `files:` de abajo listaba `api/` y `scripts/` nada más, así que los
// 34 `lib/**/*.core.js` quedaban afuera de las dos redes a la vez: ESLint los
// miraba con el parser de typescript-eslint, que **apaga `no-undef`** asumiendo que
// lo chequea `tsc`; y `tsc` no los chequea, porque `tsconfig.json` tiene `allowJs`
// pero no `checkJs` y su `include` sólo lista `.ts`/`.tsx`. Se verifica así:
//
//     npx eslint --print-config lib/permisos.core.js   →  no-undef: None   (antes)
//     npx eslint --print-config api/_canjes.js         →  no-undef: error
//
// Ahí adentro están `lib/meta-ads/correr-escalon.core.js`, `correr-poda.core.js` y
// `leer-snapshot.core.js`: las 402 líneas que escriben en Meta Ads con plata real
// desde un cron horario, sin que nadie apriete un botón. Era exactamente el
// escenario del 500 de agosto, en la única ruta que mueve presupuesto sola.

import next from 'eslint-config-next'
import nextTs from 'eslint-config-next/typescript'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/legacy/**',
      'tests/fixtures/**',
      // Reporte HTML de `vitest run --coverage`: JS generado por la herramienta. Está en
      // `.gitignore`, pero ESLint mira el disco, no el índice de git: sin esta línea el
      // `--max-warnings 0` se pone rojo apenas alguien pide cobertura una vez.
      'coverage/**',
      'next-env.d.ts',
    ],
  },
  ...(Array.isArray(next) ? next : [next]),
  ...(Array.isArray(nextTs) ? nextTs : [nextTs]),
  {
    // `no-unused-vars` venía sin opciones, o sea con los defaults de la versión de
    // typescript-eslint que esté instalada — y esos defaults cambian entre majors.
    // Se fijan acá para que el día que se actualice el paquete no aparezcan
    // veintipico de warnings nuevos sobre código que nadie tocó.
    //
    // `ignoreRestSiblings` es el que más rinde: `({ sku, barcode, ...rest }) => rest`
    // es el idioma con el que los syncs sacan campos de una fila antes de guardarla
    // (`scripts/sync-diario.js:242`), y nombrar lo que se quiere descartar es
    // justamente el punto. Los `^_` son la convención para lo demás: `_ts` y `_e`
    // dicen «esto existe porque la forma lo pide, no porque se use».
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        ignoreRestSiblings: true,
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  {
    // Node suelto: módulos ES, sin JSX y sin tipos. Lo único que se le pide es que
    // no use nombres que no existen.
    //
    // `lib/**/*.js` son los `.core.js`, que son **isomórficos**: los importa el
    // navegador (por el re-export tipado en `.ts`) y los importa Node (desde
    // `api/*.js`). Por eso comparten esta lista de globals de Node y NO tienen los
    // del browser: si un `.core.js` toca `window`, `document` o `localStorage`, el
    // `no-undef` lo marca — y eso no es un falso positivo, es el aviso de que ese
    // módulo se rompe del lado del servidor.
    files: ['api/**/*.js', 'scripts/**/*.{js,mjs}', 'lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Escritos a mano y no con el paquete `globals`, que acá sólo existe como
      // dependencia transitiva de eslint-config-next: importarlo funcionaría hoy y se
      // rompería el día que esa cadena cambie, sin que nadie lo haya tocado.
      globals: {
        process: 'readonly', Buffer: 'readonly', console: 'readonly', URL: 'readonly',
        URLSearchParams: 'readonly', fetch: 'readonly', TextEncoder: 'readonly',
        TextDecoder: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', __dirname: 'readonly', crypto: 'readonly',
        structuredClone: 'readonly', Blob: 'readonly', FormData: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
]

export default config
