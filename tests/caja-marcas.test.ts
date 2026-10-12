import { describe, expect, it } from 'vitest'
import { MARCAS_CAJA, MARCA_POR_DEFECTO, MODO_LOCAL_BDI, REGLAS_INICIALES_BDI, ladoDelEspejo, marcaDeCaja, tokenDe } from '@/lib/caja/marcas.core.js'
import { MODO_LOCAL_ZATTIA, REGLAS_INICIALES, cuentaDeMedio, medioDeCuenta, montoAEsperar, pagosDeMedio, reglaDeCuenta, renglones } from '@/lib/caja/core.core.js'

/**
 * Rediseño de la Caja, fase 5 (V4): la marca es CONFIGURACIÓN. Oráculo: los ids que la Caja tenía
 * fijos en `api/_caja.js` hasta el 5-oct (Local 11780, Depósito 18210, el modo Local de Zattia), y los de
 * BDI leídos de SU `GET /ventas/referencias` el 12-oct (`scripts/caja-referencias.mjs bdi`).
 */
describe('marcas de la Caja', () => {
  it('Zattia, con los mismos ids que estaban fijos', () => {
    expect(marcaDeCaja('zattia')).toMatchObject({ store: 'zattia', nombre: 'Zattia', local: 11780, deposito: 18210 })
    expect(marcaDeCaja('ZATTIA')?.modoLocal).toBe(MODO_LOCAL_ZATTIA)
    expect(marcaDeCaja('zattia')?.reglasIniciales).toBe(REGLAS_INICIALES)
    expect(MARCA_POR_DEFECTO).toBe('zattia')
  })

  it('🔑 V4: BDI, con SU modo Local (18393, canal 3, estado 6) y su consumidor final', () => {
    expect(marcaDeCaja('bdi')).toMatchObject({ store: 'bdi', nombre: 'BDI', local: 18393, deposito: 13307, tienda: 'bdiaccesorios.com.ar' })
    expect(MODO_LOCAL_BDI).toEqual({ client_id: 158744, channel_id: 3, sale_type_id: 1, sale_state_id: 6, currency_id: 1, store_id: 18393 })
    expect(Object.keys(MARCAS_CAJA)).toEqual(['zattia', 'bdi'])
  })

  it('un nombre raro ⛔ es marca', () => {
    expect(marcaDeCaja('toString')).toBeNull()
    expect(marcaDeCaja(null)).toBeNull()
    expect(marcaDeCaja('stunned')).toBeNull()
  })

  it('el token: el primero cargado de la lista', () => {
    const bdi = marcaDeCaja('bdi')!
    expect(tokenDe(bdi.tokenVentas, { GN_TOKEN: 'b' })).toBe('b')
    expect(tokenDe(bdi.tokenVentas, { GN_TOKEN: 'b', GN_TOKEN_VENTAS_BDI: 'v' })).toBe('v')
    expect(tokenDe(bdi.tokenVentas, { GN_TOKEN_ZATTIA: 'z' })).toBeUndefined()
  })

  it('🔴 el espejo: «Deposito Mayorista» de BDI ⛔ es el depósito; «Deposito » de Zattia sí', () => {
    const bdi = marcaDeCaja('bdi')!, zattia = marcaDeCaja('zattia')!
    expect(ladoDelEspejo(bdi, 'Deposito Mayorista')).toBeNull()
    expect(ladoDelEspejo(bdi, 'Deposito Minorista')).toBe('deposito')
    expect(ladoDelEspejo(bdi, 'Local')).toBe('local')
    expect(ladoDelEspejo(zattia, 'Deposito ')).toBe('deposito')
    expect(ladoDelEspejo(zattia, 'Local')).toBe('local')
  })
})

describe('las formas de pago con que nace BDI (Bruno: «idénticas a Zattia»)', () => {
  const r = REGLAS_INICIALES_BDI
  const filas = renglones([{ product_id: 1, size_id: 1, cantidad: 1, precio: 10000 }])
  const q = { reglas: { ...r, transferenciaA: r.transferenciaFija }, total: 10000, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false }

  it('los mismos % que Zattia por forma de pago, con SUS cuentas', () => {
    for (const medio of ['efectivo', 'transferencia', 'debito', 'credito'] as const) {
      const z = reglaDeCuenta(cuentaDeMedio(medio, { ...q, reglas: { ...REGLAS_INICIALES, transferenciaA: 13015 } }), REGLAS_INICIALES).descuento
      expect(reglaDeCuenta(cuentaDeMedio(medio, q), q.reglas).descuento).toBe(z)
    }
    expect(reglaDeCuenta(r.medios.credito.promo, r).descuento).toBe(reglaDeCuenta(REGLAS_INICIALES.medios.credito.promo, REGLAS_INICIALES).descuento)
  })

  it('cada cuenta de una forma de pago tiene su regla (⛔ un 0 callado)', () => {
    for (const c of [r.medios.efectivo.normal, ...r.medios.transferencia.opciones, r.medios.debito.normal, r.medios.credito.normal, r.medios.credito.promo]) {
      expect(() => reglaDeCuenta(c, r)).not.toThrow()
      expect(medioDeCuenta(c, r)).not.toBeNull()
    }
  })

  it('⛔ tiene 6 cuotas: con el pedido, igual va a la cuenta normal', () => {
    expect(cuentaDeMedio('credito', { ...q, total: 999999, seisCuotas: true })).toBe(25189)
  })

  it('🔑 la oferta lleva el % de la forma de pago (⛔ hay cuenta de oferta)', () => {
    const conOferta = { ...q.reglas, feriaProductos: [{ id: 1, nombre: 'X' }] }
    expect(pagosDeMedio('efectivo', { ...q, reglas: conOferta, filas })).toEqual([{ cuenta: 14685 }])
    expect(pagosDeMedio('debito', { ...q, reglas: conOferta, filas })).toEqual([{ cuenta: 21667 }])
  })

  it('🔑 la transferencia ⛔ espera: se confirma al cobrar', () => {
    expect(montoAEsperar([{ cuenta: 20597, base: 10000, rebaja: 0, porcentaje: 10, descuento: 1000, redondeo: 0, monto: 9000 }], r)).toBe(0)
    expect(montoAEsperar([{ cuenta: 13015, base: 10000, rebaja: 0, porcentaje: 10, descuento: 1000, redondeo: 0, monto: 9000 }], REGLAS_INICIALES)).toBe(9000)
  })
})
