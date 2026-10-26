import { describe, expect, it } from 'vitest'
import { cuentaDeRecepcion, fijarCantidad, listaDeRecepcion, prendaExacta, renglonesParaMotor, sumarEscaneo, unidades } from '@/lib/erp/transferencia-escaneo.core.js'

const REM = { producto: '10', talle: '1', sku: 'STU-REM-0019-M', barcode: '779001', nombre: 'REMERA', talleNombre: 'M' }
const BUZ = { producto: '11', talle: '2', sku: 'STU-BUZ-0001-L', barcode: '779002', nombre: 'BUZO', talleNombre: 'L' }

describe('transferencia libre: la lista escaneada', () => {
  it('escanear dos veces la misma prenda suma en una fila; otra prenda, otra fila', () => {
    let l = sumarEscaneo([], REM)
    l = sumarEscaneo(l, REM)
    l = sumarEscaneo(l, BUZ)
    expect(l.map((r: { sku: string; cantidad: number }) => [r.sku, r.cantidad])).toEqual([['STU-REM-0019-M', 2], ['STU-BUZ-0001-L', 1]])
    expect(unidades(l)).toBe(3)
  })
  it('no muta la lista de entrada y una prenda sin ids no entra', () => {
    const base = sumarEscaneo([], REM)
    sumarEscaneo(base, REM)
    expect(base[0].cantidad).toBe(1)
    expect(sumarEscaneo(base, { sku: 'x' })).toBe(base)
  })
  it('fijar la cantidad en 0 saca la fila; al motor viajan ids y cantidad, ⛔ los nombres', () => {
    const l = sumarEscaneo(sumarEscaneo([], REM, 3), BUZ)
    expect(fijarCantidad(l, '11', '2', 0).map((r: { sku: string }) => r.sku)).toEqual(['STU-REM-0019-M'])
    expect(renglonesParaMotor(l)[0]).toEqual({ product_id: '10', size_id: '1', sku: 'STU-REM-0019-M', barcode: '779001', cantidad: 3 })
    expect('nombre' in renglonesParaMotor(l)[0]).toBe(false)
  })
  it('un escaneo exacto por código o SKU da la prenda; ambiguo o desconocido, null', () => {
    expect(prendaExacta([REM, BUZ], '779002')).toBe(BUZ)
    expect(prendaExacta([REM, BUZ], 'stu-rem-0019-m')).toBe(REM)
    expect(prendaExacta([REM, BUZ], 'remera')).toBeNull()
    expect(prendaExacta([REM, { ...REM, talle: '9' }], '779001')).toBeNull()
  })
})

describe('transferencia libre: recibir contra lo enviado', () => {
  const enviadas = [{ product_id: 10, size_id: 1, sku: 'STU-REM-0019-M', barcode: '779001', enviada: 3 }, { product_id: 11, size_id: 2, sku: 'STU-BUZ-0001-L', barcode: null, enviada: 0 }]
  it('arranca en 0 con sólo lo que salió; lo no escaneado cuenta como faltante', () => {
    const l = listaDeRecepcion(enviadas)
    expect(l).toHaveLength(1)
    expect(cuentaDeRecepcion(l)).toMatchObject({ faltan: -3, completa: false })
    const dos = sumarEscaneo(sumarEscaneo(l, { producto: '10', talle: '1' }), { producto: '10', talle: '1' })
    expect(cuentaDeRecepcion(dos)).toMatchObject({ faltan: -1, sobran: 0 })
    expect(cuentaDeRecepcion(sumarEscaneo(dos, { producto: '10', talle: '1' }))).toMatchObject({ faltan: 0, completa: true })
  })
  it('una prenda que no salió en esta cuenta como sobrante', () => {
    const l = sumarEscaneo(listaDeRecepcion(enviadas), BUZ)
    expect(cuentaDeRecepcion(l).sobran).toBe(1)
  })
})
