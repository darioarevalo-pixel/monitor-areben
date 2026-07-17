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
//  - `api/` y `scripts/`: JS suelto de Node, sin las reglas de React. Se podrían
//    sumar con su propia config; hoy quedan afuera igual que en tsconfig.

import next from 'eslint-config-next'
import nextTs from 'eslint-config-next/typescript'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/legacy/**',
      'tests/fixtures/**',
      'api/**',
      'scripts/**',
      'next-env.d.ts',
    ],
  },
  ...(Array.isArray(next) ? next : [next]),
  ...(Array.isArray(nextTs) ? nextTs : [nextTs]),
]

export default config
