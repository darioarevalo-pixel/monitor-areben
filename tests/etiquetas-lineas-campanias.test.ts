import { describe, expect, it } from 'vitest'
import { lineasDeCampanias } from '../api/_liquidacion-erp.js'
import { lineaDelProducto } from '../lib/erp/precio.core.js'

const conMotor = (skus: Record<string, string>) => async (_m: string, fn: (db: unknown) => unknown) =>
  fn({ query: async () => ({ rows: Object.entries(skus).map(([product_id, sku]) => ({ product_id, sku })) }) })
const leer = (filas: { liq_id: string; pid: string }[]) => async () => filas
const SKUS = { 1: 'STU-REM-1-M', 2: 'STU-BUZ-2-S', 3: 'ZAT-TOP-3-M' }

describe('lineasDeCampanias (selector de marca de Etiquetas)', () => {
  it('una campaña toda de Stunned es de Stunned, y una de Zattia es de Zattia', async () => {
    const r = await lineasDeCampanias('zattia', ['a', 'b'], {
      leerTodo: leer([{ liq_id: 'a', pid: '1' }, { liq_id: 'a', pid: '2' }, { liq_id: 'b', pid: '3' }]), lineaDelProducto,
    }, { conMotor: conMotor(SKUS) })
    expect(r.get('a')).toBe('stunned')
    expect(r.get('b')).toBe('zattia')
  })
  it('una campaña que mezcla marcas da null: se ve en las dos', async () => {
    const r = await lineasDeCampanias('zattia', ['a'], {
      leerTodo: leer([{ liq_id: 'a', pid: '1' }, { liq_id: 'a', pid: '3' }]), lineaDelProducto,
    }, { conMotor: conMotor(SKUS) })
    expect(r.get('a')).toBeNull()
  })
  it('si no se puede leer, ⛔ rompe la lista: sin línea, se ve en las dos', async () => {
    const r = await lineasDeCampanias('zattia', ['a'], { leerTodo: async () => { throw new Error('caído') }, lineaDelProducto }, { conMotor: conMotor(SKUS) })
    expect(r.size).toBe(0)
  })
  it('BDI ⛔ pregunta', async () => {
    const r = await lineasDeCampanias('bdi', ['a'], { leerTodo: async () => { throw new Error('no debería leer') }, lineaDelProducto }, { conMotor: conMotor(SKUS) })
    expect(r.size).toBe(0)
  })
})
