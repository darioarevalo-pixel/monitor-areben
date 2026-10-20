import { describe, expect, it } from 'vitest'
import { entradaManual } from '../api/_erp-cargar.js'

const ok = {
  linea: 'zattia', origen_ref: '0f8fad5b-d9cb-469f-a165-70867728950e', canal: 'local', deposito: 'local',
  lineas: [{ producto: '101', talle: '7', cantidad: 2, precio: 1500.5, sku: 'ZA1' }],
  pagos: [{ cuenta: 'a1b2', monto: 1000 }, { cuenta: 'c3d4', monto: 2001 }],
}

describe('ERP › Cargar venta: la entrada del motor (§19)', () => {
  it('arma origen manual, SIEMPRE de prueba, con importe y total que cierran', () => {
    const r = entradaManual(ok, 'zattia', 'Bruno')
    if ('error' in r) throw new Error(r.error)
    expect(r.entrada).toMatchObject({ origen: 'manual', marca: 'zattia', prueba: true, usuario: 'Bruno', subtotal: 3001, total: 3001 })
    expect(r.entrada.lineas[0]).toMatchObject({ product_id: 101, size_id: 7, cantidad: 2, importe: 3001, descuento: 0, sku: 'ZA1' })
    expect(r.entrada.pagos.map((p: { cuenta: string }) => p.cuenta)).toEqual(['a1b2', 'c3d4'])
    expect(r.entrada.cliente).toBeUndefined()
  })

  it('frena antes de llegar al motor', () => {
    const e = (b: object, marca = 'zattia') => { const r = entradaManual({ ...ok, ...b }, marca, null); return 'error' in r ? r.error : null }
    expect(e({ linea: 'stunned' }, 'bdi')).toMatch(/Línea/)
    expect(e({ origen_ref: '' })).toMatch(/clave/)
    expect(e({ deposito: 'deposito_mayorista' })).toMatch(/sale/)
    expect(e({ lineas: [] })).toMatch(/prenda/)
    expect(e({ lineas: [{ ...ok.lineas[0], cantidad: 1.5 }] })).toMatch(/cantidad/)
    expect(e({ pagos: [{ cuenta: 'x', monto: 10 }] })).toMatch(/no suma/)
    expect(e({ ocurrida_en: '2099-01-01T00:00:00Z' })).toMatch(/futura/)
  })

  it('el cliente va sólo con documento y nombre (solo dígitos)', () => {
    const r = entradaManual({ ...ok, cliente: { doc: '20-12345678-9', nombre: ' Ana ' } }, 'zattia', null)
    if ('error' in r) throw new Error(r.error)
    expect(r.entrada.cliente).toEqual({ doc: '20123456789', nombre: 'Ana' })
  })
})
