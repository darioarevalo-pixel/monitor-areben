import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
  },
})
