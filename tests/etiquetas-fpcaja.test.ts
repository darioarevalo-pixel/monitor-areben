import { describe, expect, it } from 'vitest'
import { fpDeCaja, lineasFpDeCaja, pctDeEtiqueta } from '@/lib/etiquetas/fpCaja'

/**
 * La etiqueta de formas de pago de «Para reetiquetar» sale de la CAJA (Bruno, 10-nov-2026): los %
 * con los que cobra hoy, con las MISMAS funciones de `lib/caja/core.core.js`.
 */

/** Las reglas de Zattia como estaban el 10-nov (cuentas reales, medidas desde el API de la Caja). */
const ZATTIA = {
  redondeo: 100,
  medios: {
    debito: { normal: 20196 },
    credito: { promo: 25172, normal: 25188, seisCuotas: 25173, minSeisCuotas: 250000 },
    efectivo: { feria: 25867, normal: 12921 },
    tarjetaOferta: 25869,
    transferencia: { feria: 25868, opciones: [13015, 20595] },
  },
  cuentas: {
    12921: { nombre: 'Efectivo', efectivo: true, descuento: 15 },
    13015: { nombre: 'Transferencia', descuento: 10, esperaPago: true },
    20196: { nombre: 'Débito', descuento: 10 },
    20595: { nombre: 'Transferencia CG', descuento: 10 },
    25172: { nombre: 'Crédito 10% OFF', descuento: 10 },
    25173: { nombre: '6 cuotas sin interés', descuento: 0 },
    25188: { nombre: 'Credito - Nro 1 o 13', descuento: 0 },
    25867: { nombre: 'Feria - Efectivo', efectivo: true, descuento: 0 },
    25868: { nombre: 'Feria - Transferencia', descuento: 0 },
  },
  transferenciaA: 20595,
  comerciales: null,
  pctDePrendas: { 711918: { nombre: 'Cyber Monday', efectivo: 10, transferencia: 10, debito: 0 } },
}

describe('fpDeCaja', () => {
  it('a lista: el % de la cuenta normal de efectivo y de transferencia', () => {
    const fp = fpDeCaja(ZATTIA)
    expect(fp.tienda).toEqual({ efectivo: 15, transferencia: 10 })
    expect(pctDeEtiqueta(fp, '999')).toEqual({ efectivo: 15, transferencia: 10 })
  })

  it('la prenda de una oferta con % propio lleva el de la oferta, como la cobra la Caja', () => {
    expect(pctDeEtiqueta(fpDeCaja(ZATTIA), 711918)).toEqual({ efectivo: 10, transferencia: 10 })
  })

  it('el % de la cuenta manda: cambiarlo en la Caja cambia la etiqueta', () => {
    const r = { ...ZATTIA, cuentas: { ...ZATTIA.cuentas, 12921: { nombre: 'Efectivo', efectivo: true, descuento: 20 } } }
    expect(fpDeCaja(r).tienda.efectivo).toBe(20)
  })

  it('la transferencia es la de la cuenta en uso; sin cuenta de MP, la primera', () => {
    const r = { ...ZATTIA, cuentas: { ...ZATTIA.cuentas, 13015: { nombre: 'Transferencia', descuento: 5 } } }
    expect(fpDeCaja(r).tienda.transferencia).toBe(10) // en uso: 20595
    expect(fpDeCaja({ ...r, transferenciaA: null }).tienda.transferencia).toBe(5)
  })

  it('la feria va sin %: su precio ya es el final, y manda sobre el de la oferta', () => {
    const fp = fpDeCaja({ ...ZATTIA, feriaIdsCampania: [711918, 555] })
    expect(pctDeEtiqueta(fp, 711918)).toEqual({ efectivo: 0, transferencia: 0 })
    expect(pctDeEtiqueta(fp, 555)).toEqual({ efectivo: 0, transferencia: 0 })
  })

  it('con reglas comerciales ⛔ anticipa el % por prenda, y lo avisa', () => {
    const fp = fpDeCaja({ ...ZATTIA, comerciales: { marca: 'zattia', lista: [], campaniasDe: {} } })
    expect(fp.conReglasComerciales).toBe(true)
    expect(fp.porPrenda['711918']).toBeUndefined()
  })

  it('sin formas de pago cargadas, lanza: ⛔ una etiqueta con un % inventado', () => {
    expect(() => fpDeCaja({})).toThrow()
    expect(() => fpDeCaja(null)).toThrow()
  })
})

describe('lineasFpDeCaja', () => {
  it('el mismo dibujo que la de la campaña: título, transferencia y efectivo', () => {
    expect(lineasFpDeCaja({ efectivo: 15, transferencia: 10 })).toEqual([
      { texto: 'FORMAS DE PAGO', tam: 'titulo', bold: true },
      { texto: '10% OFF Transferencia', tam: 'normal', bold: false },
      { texto: '15% OFF Efectivo', tam: 'normal', bold: false },
    ])
  })

  it('un 0 o un null ⛔ se escriben', () => {
    expect(lineasFpDeCaja({ efectivo: 0, transferencia: null }).map((l) => l.texto)).toEqual(['FORMAS DE PAGO'])
  })
})
