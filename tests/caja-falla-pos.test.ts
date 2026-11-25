import { describe, expect, it, vi } from 'vitest'
import { fallaDeRenglon, registrarFallaPOS, ubicacionFallaPOS, type IOFalla, type RenglonFalla } from '@/lib/caja/falla-pos'

/**
 * La Falla del POS (Bruno, 25-nov): cada renglón es una falla del local por el MISMO camino que «+Cargar falla».
 * 🔴 De dónde se descuenta lo decide el STOCK (`ubicacionDeFalla`), ⛔ `'local'` fijo; y el reintento ⛔ carga otra igual.
 */

const FUNDA: RenglonFalla = {
  variante: { product_id: 11, size_id: 4, product_name: 'Funda glitter', size_name: 'iPhone 14', sku: 'FG-14', barcode: '779' },
  stock: { local: 2, deposito: 0, fuente: 'vivo' },
  cantidad: 1,
  precio: 15000,
  precioLista: 18000,
}
const ctx = { usuario: 'Sofi', cred: { token: 't' } } as Parameters<typeof registrarFallaPOS>[2]

describe('de dónde se descuenta', () => {
  it('sólo en el local ⇒ local', () => {
    expect(ubicacionFallaPOS(FUNDA)).toBe('local')
  })
  it('🔴 sólo en el depósito ⇒ depósito (manda el stock, ⛔ la sección)', () => {
    expect(ubicacionFallaPOS({ ...FUNDA, stock: { local: 0, deposito: 3, fuente: 'vivo' } })).toBe('deposito')
  })
  it('en ninguno ⇒ local (la prenda está en la mano del local)', () => {
    expect(ubicacionFallaPOS({ ...FUNDA, stock: { local: 0, deposito: 0, fuente: 'espejo' } })).toBe('local')
  })
  it('en los dos ⇒ local', () => {
    expect(ubicacionFallaPOS({ ...FUNDA, stock: { local: 1, deposito: 1, fuente: 'vivo' } })).toBe('local')
  })
})

describe('la fila de la falla', () => {
  it('a precio de LISTA, con el artículo y el motivo del POS', () => {
    const f = fallaDeRenglon(FUNDA)
    expect(f).toMatchObject({ producto: 'Funda glitter', sku: 'FG-14', variante: 'iPhone 14', cantidad: 1, precio_lista: 18000, product_id: '11', size_id: '4', ubicacion: 'local', motivo: 'Cargada en el POS' })
  })
})

function io(over: Partial<IOFalla> = {}): IOFalla & { crear: ReturnType<typeof vi.fn>; descontar: ReturnType<typeof vi.fn> } {
  const crear = vi.fn(async () => ({ id: 501, barcode: 'F-501' }))
  const descontar = vi.fn(async () => ({ erpAjuste: 77 }))
  return { crearFalla: (over.crearFalla ?? crear) as IOFalla['crearFalla'], registrarVentaGN: (over.registrarVentaGN ?? descontar) as IOFalla['registrarVentaGN'], crear, descontar }
}

describe('registrar', () => {
  it('carga y descuenta: devuelve la falla y el ajuste del ERP', async () => {
    const x = io()
    const r = await registrarFallaPOS('zattia', FUNDA, ctx, x)
    expect(r).toEqual({ ok: true, fallaId: 501, barcode: 'F-501', erpAjuste: 77 })
    expect(x.crear).toHaveBeenCalledTimes(1)
    expect(x.descontar.mock.calls[0][1]).toMatchObject({ id: 501, product_id: '11', size_id: '4', cantidad: 1, ubicacion: 'local', precio_lista: 18000 })
  })

  it('🔴 cargó y ⛔ descontó ⇒ vuelve el fallaId; el reintento sólo descuenta (⛔ carga otra igual)', async () => {
    const x = io({ registrarVentaGN: vi.fn(async () => { throw new Error('sin stock en el ERP') }) as unknown as IOFalla['registrarVentaGN'] })
    const r = await registrarFallaPOS('zattia', FUNDA, ctx, x)
    expect(r).toEqual({ ok: false, fallaId: 501, barcode: 'F-501', error: 'sin stock en el ERP' })

    const y = io()
    const r2 = await registrarFallaPOS('zattia', { ...FUNDA, fallaId: 501, fallaBarcode: 'F-501' }, ctx, y)
    expect(r2.ok).toBe(true)
    expect(y.crear).not.toHaveBeenCalled()
    expect(y.descontar.mock.calls[0][1]).toMatchObject({ id: 501 })
  })

  it('⛔ cargó ⇒ sin fallaId (el reintento carga)', async () => {
    const x = io({ crearFalla: vi.fn(async () => { throw new Error('403') }) as unknown as IOFalla['crearFalla'] })
    const r = await registrarFallaPOS('zattia', FUNDA, ctx, x)
    expect(r).toEqual({ ok: false, fallaId: null, barcode: null, error: '403' })
    expect(x.descontar).not.toHaveBeenCalled()
  })
})
