import { describe, expect, it } from 'vitest'
import { aplicarFormasDePago, formasDePagoDe } from '@/lib/caja/formas-pago.core.js'
import { REGLAS_INICIALES, cuentaDeMedio, cuentaDeOferta, nombreParaTicket, ofertaDe, reglaDeCuenta, tarjetaOfertaDe } from '@/lib/caja/core.core.js'
import { REGLAS_INICIALES_BDI } from '@/lib/caja/marcas.core.js'

/**
 * V4 (Bruno, 12-oct): las formas de pago son DATO DE CADA TIENDA. Oráculo: ida y vuelta formulario ⇄
 * reglas sin cambiar nada, y las cuentas de GN de BDI leídas de su `GET /ventas/referencias` (12-oct).
 */
const GN_BDI = [
  { id: 14685, nombre: 'Efectivo' }, { id: 25189, nombre: 'Credito - Nro 1 o 13' }, { id: 25176, nombre: 'Credito 10% OFF (Mier-Vie-Sab) - Nro 1 o 3' },
  { id: 21667, nombre: 'Debito' }, { id: 14701, nombre: 'Transferencia AREBEN' }, { id: 20597, nombre: 'Transferencia CG' },
  { id: 22501, nombre: 'Caja Administracion' },
]

describe('formasDePagoDe ⇄ aplicarFormasDePago', () => {
  it('🔑 ida y vuelta: Zattia queda IGUAL (cuentas, medios y titulares)', () => {
    const f = formasDePagoDe(REGLAS_INICIALES)
    expect(f).toMatchObject({ efectivo: { cuenta: 12921, descuento: 15 }, transferenciaAreben: 13015, transferenciaCG: 20595, transferenciaDescuento: 10, seisCuotas: 25173, tarjetaOferta: 25869, verificarTransferencia: true })
    const r = aplicarFormasDePago(REGLAS_INICIALES, f, null)
    expect(r.medios).toEqual(JSON.parse(JSON.stringify(REGLAS_INICIALES.medios)))
    expect(r.titulares).toEqual(REGLAS_INICIALES.titulares)
    for (const [id, regla] of Object.entries(REGLAS_INICIALES.cuentas)) expect(r.cuentas[Number(id)].descuento).toBe(regla.descuento)
  })

  it('ida y vuelta: BDI, sin oferta ni 6 cuotas y sin verificar', () => {
    const f = formasDePagoDe(REGLAS_INICIALES_BDI)
    expect(f).toMatchObject({ efectivoOferta: null, seisCuotas: null, tarjetaOferta: null, verificarTransferencia: false, transferenciaFija: 20597 })
    const r = aplicarFormasDePago(REGLAS_INICIALES_BDI, f, GN_BDI)
    expect(r.medios).toEqual(JSON.parse(JSON.stringify(REGLAS_INICIALES_BDI.medios)))
    expect(r.verificarTransferencia).toBe(false)
    expect(r.transferenciaFija).toBe(20597)
  })

  it('cambiar el % del débito de BDI a 0 (lo que mide su POS de GN) ⇒ la cuenta lleva 0', () => {
    const f = formasDePagoDe(REGLAS_INICIALES_BDI)
    const r = aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, debito: { cuenta: 21667, descuento: 0 } }, GN_BDI)
    expect(reglaDeCuenta(21667, r).descuento).toBe(0)
  })

  it('el nombre de la cuenta sale de GN', () => {
    const f = formasDePagoDe(REGLAS_INICIALES_BDI)
    const r = aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, credito: { cuenta: 22501, descuento: 0 } }, GN_BDI)
    expect(r.cuentas[22501].nombre).toBe('Caja Administracion')
    expect(r.medios.credito.normal).toBe(22501)
  })

  it('🔴 rechaza: cuenta que ⛔ existe en GN, repetida, % fuera de rango, sin efectivo', () => {
    const f = formasDePagoDe(REGLAS_INICIALES_BDI)
    expect(() => aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, debito: { cuenta: 12921, descuento: 10 } }, GN_BDI)).toThrow(/no existe en Gestión Nube/)
    expect(() => aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, debito: { cuenta: 14685, descuento: 10 } }, GN_BDI)).toThrow(/ya es de otra forma de pago/)
    expect(() => aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, efectivo: { cuenta: 14685, descuento: 150 } }, GN_BDI)).toThrow(/0 a 100/)
    expect(() => aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, efectivo: { cuenta: null, descuento: 15 } }, GN_BDI)).toThrow(/falta la cuenta/)
    expect(() => aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, transferenciaAreben: null, transferenciaCG: null }, GN_BDI)).toThrow(/al menos una/)
  })

  it('sin verificar en Mercado Pago, la cuenta fija tiene que ser una de transferencia', () => {
    const f = formasDePagoDe(REGLAS_INICIALES_BDI)
    expect(() => aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, transferenciaFija: 14685 }, GN_BDI)).toThrow(/a qué cuenta van/)
    expect(aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, transferenciaFija: 14701 }, GN_BDI).transferenciaFija).toBe(14701)
    // Volver a verificar: la fija se descarta.
    expect(aplicarFormasDePago(REGLAS_INICIALES_BDI, { ...f, verificarTransferencia: true }, GN_BDI).transferenciaFija).toBeNull()
  })

  it('🔴 sacarle a Zattia la cuenta de oferta pasa esa oferta a «con el %»: la Caja ⛔ queda sin cobrar', () => {
    const conOferta = { ...REGLAS_INICIALES, oferta: { efectivo: 'final', transferencia: 'final', debito: 'recargo', credito: 'no', recargo: 10 } }
    const r = aplicarFormasDePago(conOferta, { ...formasDePagoDe(conOferta), efectivoOferta: null, tarjetaOferta: null }, null)
    expect(ofertaDe(r)).toMatchObject({ efectivo: 'descuento', transferencia: 'final', debito: 'descuento', credito: 'no' })
  })

  it('la transferencia a otra cuenta ⛔ puede mandar a una cuenta que dejó de ser de transferencia', () => {
    const conMp = { ...REGLAS_INICIALES, transferenciaPorMp: { 1: 13015, 2: 20595 } }
    const r = aplicarFormasDePago(conMp, { ...formasDePagoDe(conMp), transferenciaCG: null }, null)
    expect(r.transferenciaPorMp).toEqual({ 1: 13015 })
    expect(r.titulares).toEqual({ areben: 13015 })
  })
})

describe('el núcleo con cuentas que la tienda ⛔ tiene (V4)', () => {
  const bdi = { ...REGLAS_INICIALES_BDI, transferenciaA: 20597 }
  it('«Feria TC» es dato: Zattia 25869, BDI ninguna', () => {
    expect(tarjetaOfertaDe(REGLAS_INICIALES)).toBe(25869)
    expect(tarjetaOfertaDe(bdi)).toBeNull()
    expect(nombreParaTicket(25869, REGLAS_INICIALES)).toBe('Tarjeta')
    expect(nombreParaTicket(25869, bdi)).toBe('Cuenta 25869')
  })
  it('pedir la cuenta de oferta que ⛔ existe ⇒ tira con el porqué', () => {
    expect(() => cuentaDeOferta('efectivo', bdi)).toThrow(/no tiene cuenta de oferta/)
    expect(() => cuentaDeOferta('credito', bdi)).toThrow(/no tiene cuenta de oferta/)
    expect(cuentaDeOferta('efectivo', REGLAS_INICIALES)).toBe(25867)
  })
  it('sin 6 cuotas, el crédito va a la cuenta normal aunque pase el mínimo', () => {
    expect(cuentaDeMedio('credito', { reglas: bdi, total: 1e6, promoCreditoHoy: false, esDelBanco: false, seisCuotas: true })).toBe(25189)
  })
})
