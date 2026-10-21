import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🔴 El código que habla con GESTIÓN NUBE queda CONGELADO en esta lista (sesión B, Bases, 21-oct-2026): el día del corte
 * se borra entero, y para eso tiene que estar a la vista y ⛔ crecer por debajo. Un archivo nuevo que nombre la API de GN
 * hace fallar esto: o se suma acá con su grupo (y se sabe que hay uno más que apagar), o va por el motor.
 * Los grupos: `espejo` (GN → Supabase, lo reemplaza el motor) · `escribe` (la Caja vende en GN) · `lee` (en vivo) ·
 * `herramienta` (a mano). Inventario y plan: ~/Documents/erp-monitor/gn-en-el-monitor.md.
 */
const GN = {
  'espejo': [
    '.github/workflows/auditar-ventas.yml',
    '.github/workflows/caja-reintentar.yml',
    '.github/workflows/purga-historica.yml',
    '.github/workflows/sync-clientes.yml',
    '.github/workflows/sync-crm-inicial.yml',
    '.github/workflows/sync-diario-zattia.yml',
    '.github/workflows/sync-diario.yml',
    '.github/workflows/sync-inventario.yml',
    '.github/workflows/sync-productos-zattia.yml',
    '.github/workflows/sync-ventas-hoy.yml',
    'scripts/lib/costos-espejo.mjs',
    'scripts/lib/gn-fetch.mjs',
    'scripts/lib/gn-rate-limit.mjs',
    'scripts/purga-historica.js',
    'scripts/sync-clientes.js',
    'scripts/sync-diario-zattia.js',
    'scripts/sync-diario.js',
    'scripts/sync-inicial-zattia.js',
    'scripts/sync-inicial.js',
    'scripts/sync-inventario-solo.js',
    'scripts/sync-productos-zattia.js',
    'scripts/sync-ventas-crm.js',
    'scripts/sync-ventas-hoy.js'
  ],
  'escribe': [
    'api/_caja.js',
    'api/crear-venta.js',
    'lib/caja/enviar.core.js',
    'lib/caja/marcas.core.js',
    'scripts/caja-referencias.mjs',
    'scripts/caja-reintentar.mjs',
    'scripts/gn-formas-pago.mjs'
  ],
  'lee': [
    'api/_georef.js',
    'api/_gn.js',
    'api/_inventario-vivo.js',
    'api/_liquidacion.js',
    'api/_observaciones.js',
    'api/_repo-armado.js',
    'api/_ventas-hoy.js',
    'lib/supabase/paginar.core.js'
  ],
  'herramienta': [
    'scripts/auditar-ventas.js',
    'scripts/gn-venta-inspect.mjs'
  ]
}

const PATRON = /gestionnube|GN_API|GN_TOKEN|GESTION_NUBE|apiGn|gnFetch|api\.gestion/
const CARPETAS = ['api', 'lib', 'scripts', 'components', 'app', 'motor', '.github']
const recorrer = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  if (n === 'node_modules') return []
  return statSync(p).isDirectory() ? recorrer(p) : [p]
})

describe('Gestión Nube, aislado', () => {
  const permitidos = new Set(Object.values(GN).flat())
  const hablan = CARPETAS.flatMap(recorrer)
    .filter((f) => /\.(js|mjs|ts|tsx|yml)$/.test(f) && !/\.test\./.test(f))
    .filter((f) => PATRON.test(readFileSync(f, 'utf8')))

  it('ningún archivo NUEVO habla con GN fuera de la lista', () => {
    expect(hablan.filter((f) => !permitidos.has(f))).toEqual([])
  })

  it('la lista ⛔ guarda muertos: lo que ya ⛔ habla con GN sale de acá (una cosa menos que apagar)', () => {
    expect([...permitidos].filter((f) => !hablan.includes(f))).toEqual([])
  })
})
