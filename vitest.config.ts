import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // `.tsx` desde el 18-ago-2026: `tests/norte-tabla-metas.test.tsx` es el primer test de
    // componentes del repo. Se renderiza con `renderToStaticMarkup`, que no necesita DOM, así que
    // el `environment: 'node'` de arriba alcanza y no hay que prender jsdom para toda la suite.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    /**
     * 30 s en vez de los 5 s por defecto.
     *
     * Es el arreglo de las "fallas fantasma" que la suite venía tirando desde hace meses: fallaban
     * archivos distintos en cada corrida y siempre los mismos sospechosos —etl-paridad, productos,
     * resumen, variantes, ventas-mensuales—, que son los que computan el ETL entero sobre el
     * fixture REAL de BDI (14,7 MB, 242 productos, 102k detalles). Eso tarda varios segundos y
     * contra un techo de 5 s entra o no entra según cómo esté la máquina: con `vercel dev` o
     * Chrome abiertos, no entra.
     *
     * Se creía que era falta de memoria. No lo era: el error decía `Test timed out in 5000ms`, y
     * con un techo holgado pasan los mismos tests, con los mismos números. Subir el timeout no
     * esconde nada —una falla real sigue fallando— y saca una fuente de ruido que hacía dudar de
     * cada corrida.
     */
    testTimeout: 30_000,
    /**
     * Y 30 s también para los hooks, por el mismo motivo — que al arreglar lo de arriba se pasó
     * por alto.
     *
     * `hookTimeout` es un techo aparte y arranca en 10 s, y justamente `etl-paridad` (el primer
     * sospechoso de la lista de acá arriba) hace todo su trabajo pesado en un `beforeAll`: computa
     * el ETL entero, legacy y port, sobre el fixture real. O sea que la corrección de
     * `testTimeout` no lo alcanzaba, y el archivo seguía cayéndose con
     * `Hook timed out in 10000ms` — con sus 25 tests pasando y los otros 25 saltados, que es
     * exactamente la forma que tenía la "falla fantasma".
     *
     * Mismo criterio: un techo holgado no esconde nada, una falla real sigue fallando.
     *
     * ⚠️ Va en 60 s y no en 30 s **porque con 30 s todavía se caía**, y el motivo es la
     * concurrencia: `etl-paridad` solo tarda ~21 s en el hook, pero corre en paralelo con los
     * otros cuatro archivos que computan el mismo ETL pesado sobre el fixture real, así que se
     * pelean la CPU y cada uno tarda un múltiplo de lo que tarda solo.
     *
     * El techo es el parche, no el arreglo. El arreglo de fondo sería que los cinco archivos
     * pesados compartan un ETL computado UNA vez en vez de recomputarlo cada uno — pero eso es
     * cirugía sobre los tests de paridad del legacy y merece su propia sesión.
     */
    hookTimeout: 60_000,
    /**
     * Cobertura: **no corre sola**, se pide con `npx vitest run --coverage`.
     *
     * No estaba, y la falta se notaba: la pregunta "¿qué parte de esto está probado?" sólo se
     * podía contestar cruzando imports a mano, archivo por archivo. Así se descubrió que de los
     * 39 handlers, 27 no los toca ningún test — y que **ningún test invoca un `handler(req, res)`**:
     * los 136 archivos de `tests/` prueban funciones puras exportadas al costado. O sea que el
     * parseo del body, la validación, los códigos de estado y **la autorización** no los mira
     * nadie.
     *
     * Va sin `thresholds` a propósito. Un umbral puesto hoy sobre una base sin tests de handler
     * sólo tendría dos salidas: ponerlo tan bajo que no diga nada, o dejar el CI en rojo desde el
     * primer día. Primero se escriben los tests que faltan, después se clava el piso.
     *
     * `api/` y `lib/` entran a propósito aunque sean `.js`: son la capa que menos red tiene.
     */
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'api/**', 'store/**', 'components/**'],
      exclude: ['**/*.d.ts', 'tests/**'],
      reporter: ['text-summary', 'html'],
    },
  },
})
