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
//  - `public/legacy/`: es una copia generada de index.html (la hace `prebuild`).
//
// 🔴 `api/` y `scripts/` SÍ se lintean, aunque sin las reglas de React ni de TS.
// Estuvieron ignorados hasta el 9-ago-2026, y esa combinación —fuera de ESLint y
// fuera de tsconfig— dejaba la capa entera de handlers **sin un solo chequeo
// estático**. Costó un 500 en producción: un refactor borró la variable `pag` y
// dejó un `pag.data.name` tres líneas abajo; typecheck, lint, las 2.469 pruebas y
// el build pasaron los cuatro en verde sobre una `ReferenceError` segura.
// `no-undef` sola lo habría cazado, y no hace falta nada más para eso.

import next from 'eslint-config-next'
import nextTs from 'eslint-config-next/typescript'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/legacy/**',
      'tests/fixtures/**',
      'next-env.d.ts',
    ],
  },
  ...(Array.isArray(next) ? next : [next]),
  ...(Array.isArray(nextTs) ? nextTs : [nextTs]),
  {
    // Node suelto: módulos ES, sin JSX y sin tipos. Lo único que se le pide es que
    // no use nombres que no existen.
    files: ['api/**/*.js', 'scripts/**/*.{js,mjs}'],
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
