import { describe, expect, it } from 'vitest'
import { claveVenta, ventasParaFacturar } from '../motor/arca/mes.core.js'
import { techoDelMes } from '../motor/arca/techo.core.js'
import { SQL_PAGOS_A_CUENTA_ERP, cobrosDeVentasErp } from '../lib/erp/facturacion-erp.core.js'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const P = '33333333-3333-3333-3333-333333333333'
const propio = (venta_id: string, cuenta: string, monto: number) => ({ venta_id, fecha: '2026-11-20', cuenta, monto })
const ficha = (id: string, extra: Record<string, unknown> = {}) => ({ id, linea: 'bdi', tipo: 'venta', estado: 'confirmada', numero: 7, cliente: 'Ana', facturada: false, ...extra })
const vacio = { propios: [], fichas: [], pagos: [], sinPlata: [] }
const TIPOS = new Map([['Mercado Pago', 'areben'], ['Transferencia AREBEN', 'areben'], ['Efectivo', 'efectivo'], ['Transferencia', 'propia']])
const lista = (r: ReturnType<typeof cobrosDeVentasErp>, marca = 'bdi') =>
  ventasParaFacturar(r.cobros, TIPOS, '2026-11', new Set([...r.facturadas].map((id) => claveVenta(marca, id)))).filter((v) => !r.soloTope.has(v.ventaId))

describe('Facturación del mes: las ventas del ERP (auditoría del corte, 3-nov)', () => {
  it('lo cobrado en cuentas de Areben entra al tope y a la lista, con la forma de `ventas_cobros`', () => {
    const r = cobrosDeVentasErp('bdi', { ...vacio, propios: [propio(A, 'Mercado Pago', 1000.5)], fichas: [ficha(A)] })
    expect(techoDelMes(r.cobros, TIPOS, '2026-11').total).toBe(1000.5)
    expect(lista(r)).toMatchObject([{ marca: 'bdi', ventaId: A, monto: 1000.5, cuentas: ['Mercado Pago'] }])
  })

  it('la venta con dos pagos factura sólo lo que entró a Areben; efectivo y cuenta propia ⛔ suman', () => {
    const r = cobrosDeVentasErp('bdi', { ...vacio, propios: [propio(A, 'Mercado Pago', 600), propio(A, 'Efectivo', 400), propio(B, 'Transferencia', 900)], fichas: [ficha(A), ficha(B)] })
    expect(techoDelMes(r.cobros, TIPOS, '2026-11').total).toBe(600)
    expect(lista(r)).toMatchObject([{ ventaId: A, monto: 600 }])
  })

  it('una cuenta del ERP sin clasificar ⛔ suma y se avisa (el `Débito` con tilde contra el `Debito` de la tabla)', () => {
    const r = cobrosDeVentasErp('zattia', { ...vacio, propios: [propio(A, 'Débito', 500)], fichas: [ficha(A)] })
    const t = techoDelMes(r.cobros, TIPOS, '2026-11')
    expect(t.total).toBe(0)
    expect(t.sinClasificar).toEqual([{ cuenta: 'Débito', monto: 500, n: 1 }])
  })

  it('lo que queda en cuenta corriente ⛔ es plata: ni suma ni aparece como «sin clasificar»', () => {
    const r = cobrosDeVentasErp('bdi', { ...vacio, propios: [propio(A, 'Cuenta corriente', 17000000)], fichas: [ficha(A)], sinPlata: ['Cuenta corriente'] })
    const t = techoDelMes(r.cobros, TIPOS, '2026-11')
    expect(t.total).toBe(0)
    expect(t.sinClasificar).toEqual([])
  })

  it('el pago a cuenta del mayorista en una cuenta de Areben suma al tope y ⛔ se ofrece en la lista', () => {
    const r = cobrosDeVentasErp('bdi', { ...vacio, pagos: [{ id: P, linea: 'bdi', monto: '250000', cuenta: 'Transferencia AREBEN', cliente: 'Mayorista SA', fecha: '2026-11-20' }] })
    expect(techoDelMes(r.cobros, TIPOS, '2026-11').total).toBe(250000)
    expect(lista(r)).toEqual([])
  })

  it('el pago a cuenta dado vuelta ⛔ cuenta y sale de los reales, con su signo', () => {
    for (const parte of [':anulacion', 'not m.prueba', "m.tipo = 'pago'", '-m.monto']) expect(SQL_PAGOS_A_CUENTA_ERP).toContain(parte)
  })

  it('la ya facturada en el ERP ⛔ se ofrece de nuevo', () => {
    const r = cobrosDeVentasErp('bdi', { ...vacio, propios: [propio(A, 'Mercado Pago', 100), propio(B, 'Mercado Pago', 200)], fichas: [ficha(A, { facturada: true }), ficha(B)] })
    expect(lista(r).map((v) => v.ventaId)).toEqual([B])
  })

  it('el cambio y la anulada con devolución suman al tope y ⛔ salen en la lista', () => {
    const r = cobrosDeVentasErp('zattia', { ...vacio, propios: [propio(A, 'Mercado Pago', 100), propio(B, 'Mercado Pago', 300)], fichas: [ficha(A, { tipo: 'cambio', linea: 'stunned' }), ficha(B, { estado: 'anulada' })] })
    expect(techoDelMes(r.cobros, TIPOS, '2026-11').total).toBe(400)
    expect(lista(r, 'zattia')).toEqual([])
  })

  it('la marca de la clave es la de la BASE y la línea sale de la ficha (Stunned factura en el lote de su línea, con su PV)', () => {
    const r = cobrosDeVentasErp('zattia', { ...vacio, propios: [propio(A, 'Mercado Pago', 100)], fichas: [ficha(A, { linea: 'stunned', numero: null, cliente: null })] })
    expect(r.cobros[0].marca).toBe('zattia')
    expect(r.lineas.get(A)).toBe('stunned')
    expect(r.datos.get(A)).toEqual({ numero: null, cliente: null })
  })
})
