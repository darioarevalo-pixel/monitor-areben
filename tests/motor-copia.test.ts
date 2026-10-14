/**
 * `motor/` es una COPIA de `areben-motor` (`scripts/traer-motor.mjs`): ⛔ se edita acá. Cada archivo tiene
 * que ser exactamente el que se trajo (la huella de `motor/VERSION.json`), y no puede haber de más ni de menos.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIR = join(__dirname, '..', 'motor')
const version = JSON.parse(readFileSync(join(DIR, 'VERSION.json'), 'utf8')) as { version: string, commit: string, archivos: Record<string, string> }
const archivos = (d: string): string[] => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? archivos(join(d, n)) : [join(d, n)])
const enDisco = archivos(DIR).map((f) => relative(DIR, f)).filter((f) => f !== 'VERSION.json' && f !== 'LEEME.md').sort()

describe('motor/ es la copia que se trajo de areben-motor', () => {
  it('con versión y commit anotados', () => {
    expect(version.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(version.commit).toMatch(/^[0-9a-f]{40}$/)
  })
  it('los mismos archivos, ni uno de más', () => {
    expect(enDisco).toEqual(Object.keys(version.archivos).sort())
  })
  it.each(Object.entries(version.archivos))('%s no se editó a mano (se edita en areben-motor y se vuelve a traer)', (f, h) => {
    expect(createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex')).toBe(h)
  })
})

describe('el monitor importa el motor', () => {
  it('la venta y ARCA cargan y funcionan desde la copia', async () => {
    const { armarVenta } = await import('../motor/venta/armar.mjs')
    const { emisorDe } = await import('../motor/arca/emisor-db.js')
    const conf = { marcas: { zattia: { empresa_id: 'areben', depositos: ['local'] } }, cuentas: [{ id: 'c1', marca: 'zattia', gn_cuenta_id: 12921 }] }
    const r = armarVenta({ origen: 'caja', origen_ref: 'x', marca: 'zattia', canal: 'local', deposito: 'local', usuario: 'u', prueba: true,
      lineas: [{ product_id: 1, size_id: 2, cantidad: 1, precio: 100, importe: 100 }], subtotal: 100, total: 100, pagos: [{ cuenta: 12921, monto: 100 }] }, conf)
    expect(r.ok).toBe(true)
    expect(typeof emisorDe).toBe('function')
  })
})
