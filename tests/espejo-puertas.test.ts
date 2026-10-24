import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🔴 Las PUERTAS que hoy leen el espejo de Gestión Nube quedan CONGELADAS en esta lista (sesión B, Bases, 26-oct-2026).
 * El día del corte el espejo pasa a ser vistas sobre el motor; después, sin apuro, cada puerta pasa a leer el motor, y
 * cuando no queda ninguna se borran las vistas. Para que ese día llegue, la lista sólo puede ENCOGERSE: una pantalla o un
 * endpoint NUEVO que lea `inventario`, `ventas`, `productos`… del espejo hace fallar esto, y la salida es leerlo del motor
 * (`areben-motor`), ⛔ sumarlo acá. Cuando una puerta pasa al motor, se SACA de la lista (el segundo test lo exige).
 * Los feeders del espejo (`scripts/sync-*`) ⛔ cuentan: están congelados por `gn-aislado.test.ts` y mueren el día del corte.
 * Plan: ~/Documents/erp-monitor/gn-en-el-monitor.md.
 */
const PUERTAS = {
  // Servidor: leen con la clave de servicio (supabase-js o REST).
  'servidor': [
    'api/_caja.js',
    'api/_costos.js',
    'api/_crm.js',
    'api/_erp-clientes.js',
    'api/_erp-ventas.js',
    'api/_erp.js',
    'api/_espejo.js',
    'api/_inventario-vivo.js',
    'api/_meta-parte.js',
    'api/_prm.js',
    'api/_ubicaciones-local.js',
    'lib/recepciones/espejo.core.js'
  ],
  // Navegador: pasan por `api/_espejo.js` (`sbFetch` / `fetchAll`).
  'navegador': [
    'components/caducados/datosCaducados.ts',
    'components/canjes/SelectorModelo.tsx',
    'components/integraciones/Integraciones.tsx',
    'components/ui/BuscarArticuloGN.tsx',
    'lib/canjes/venta-gn.ts',
    'lib/datos.ts',
    'lib/exhib/correo.ts',
    'lib/exhib/datos.ts',
    'lib/reclamos/cliente.ts',
    'lib/reposicion/cliente.ts',
    'lib/ubicaciones/cliente.ts'
  ]
}

// Las tablas del espejo = `CATALOGO` de api/_espejo.js, más `clientes` (que entra por la puerta del CRM); ⛔ `sync_state`: es el reloj de los syncs y lo usan también tablas propias del monitor.
const T = '(?:inventario|ventas|venta_detalles|productos|clientes|ventas_por_mes|ventas_por_categoria_mes|fundas_por_modelo_mes|variante_color_manual)'
const LEE = [
  new RegExp(`\\.from\\(\\s*['"\`]${T}['"\`]\\s*\\)`),
  new RegExp(`/rest/v1/(?:${T}\\b|\\$\\{tabla\\})`),
  new RegExp(`(?:sbFetch|fetchAll)\\w*[\\s\\S]{0,250}?,\\s*['"\`]${T}['"\`]`)
]
const CARPETAS = ['api', 'lib', 'components', 'app']
const recorrer = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  if (n === 'node_modules' || n === '.next') return []
  return statSync(p).isDirectory() ? recorrer(p) : [p]
})

describe('Puertas que leen el espejo de GN, congeladas', () => {
  const permitidas = new Set(Object.values(PUERTAS).flat())
  const hablan = CARPETAS.flatMap(recorrer)
    .filter((f) => /\.(js|mjs|ts|tsx)$/.test(f) && !/\.test\./.test(f))
    .filter((f) => LEE.some((re) => re.test(readFileSync(f, 'utf8'))))

  it('ninguna puerta NUEVA lee el espejo: lo nuevo lee del motor', () => {
    expect(hablan.filter((f) => !permitidas.has(f))).toEqual([])
  })

  it('la lista ⛔ guarda muertos: la puerta que ya pasó al motor sale de acá (una cosa menos)', () => {
    expect([...permitidas].filter((f) => !hablan.includes(f))).toEqual([])
  })
})
