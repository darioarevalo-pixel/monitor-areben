import { describe, expect, it } from 'vitest'
import { lineasFpDePrenda, mismaFormaDePago } from '../lib/etiquetas/core'
import { lineasFpDeCaja } from '../lib/etiquetas/fpCaja'

// La de BF de Zattia (cargada 26-nov) y la de Liquidar, como quedaron en las campañas.
const L = (t: string) => ({ texto: t, tam: 'normal' as const, bold: false })
const fp = (ef: number, tr: number) => [{ texto: 'FORMAS DE PAGO', tam: 'titulo' as const, bold: true }, L('3 cuotas sin interés'), L(`${tr}% OFF Transferencia`), L(`${ef}% OFF Efectivo`)]
const et = (lineas: ReturnType<typeof fp>) => ({ fpDescuentos: lineas, fpPorParte: {}, pctEfectivo: 10, cuotas: 3 })

describe('Etiquetas · formas de pago sólo si cambia (BF 26-nov)', () => {
  it('BF 15/10 sobre una prenda que hoy paga 15/10 (la de la tienda) ⇒ no se imprime', () => {
    expect(mismaFormaDePago(lineasFpDePrenda(et(fp(15, 10)), { precio: 1 }), lineasFpDeCaja({ efectivo: 15, transferencia: 10 }))).toBe(true)
  })
  it('BF 15/10 sobre una prenda que hoy paga 10/10 (ofertas) ⇒ se imprime', () => {
    expect(mismaFormaDePago(lineasFpDePrenda(et(fp(15, 10)), { precio: 1 }), lineasFpDeCaja({ efectivo: 10, transferencia: 10 }))).toBe(false)
  })
  it('Liquidar 10/10 sobre una que hoy paga 15/10 ⇒ se imprime', () => {
    expect(mismaFormaDePago(lineasFpDePrenda(et(fp(10, 10)), { precio: 1 }), lineasFpDeCaja({ efectivo: 15, transferencia: 10 }))).toBe(false)
  })
  it('sin la de hoy (Caja sin leer) ⇒ se imprime', () => {
    expect(mismaFormaDePago(fp(15, 10), null)).toBe(false)
  })
})
