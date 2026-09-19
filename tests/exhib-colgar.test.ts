import { describe, expect, it } from 'vitest'
import { agruparColgarPorProducto, colgarEnLugar, filasColgar, HEADER_COLGAR, paraColgar, resumenColgar } from '../lib/exhib/colgar'
import { aEscaneo } from '../lib/exhib/libre'
import type { ExhibItem } from '../lib/exhib/tipos'

const v = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '', sku: '', productId: 'p', name: 'TOP UNIT', size: 'Único', qty: 1, img: null,
  cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES'], tnId: null, precio: null, promo: null, ...over,
})

// TOP UNIT: tres colores. El caso que lo trajo: se cuelgan dos y el tercero queda en el guardado.
const UNIT_NG = v({ productId: '1', name: 'TOP UNIT', size: 'NEGRO', barcode: '111', qty: 2 })
const UNIT_BL = v({ productId: '1', name: 'TOP UNIT', size: 'BLANCO', barcode: '112', qty: 2 })
const UNIT_CT = v({ productId: '1', name: 'TOP UNIT', size: 'CHOCOLATE', barcode: '113', qty: 5 })
// Otra prenda, de un mueble que nadie caminó.
const BERNA = v({ productId: '9', name: 'CORSET BERNA', size: 'M', barcode: '911', qty: 7 })

const LOCAL = [UNIT_NG, UNIT_BL, UNIT_CT, BERNA]
const t = (min: number) => Date.parse('2026-09-19T13:00:00Z') + min * 60_000

describe('paraColgar', () => {
  it('los colores que quedaron sin colgar de una prenda que SÍ se tocó', () => {
    const esc = [aEscaneo(UNIT_NG, '111', 'perchero tops', t(0))]
    const l = paraColgar(esc, LOCAL)
    expect(l.map((c) => c.it.size)).toEqual(['CHOCOLATE', 'BLANCO']) // 5u antes que 2u
    expect(l.every((c) => c.lugar === 'perchero tops')).toBe(true)
    expect(resumenColgar(l)).toEqual({ variantes: 2, unidades: 7, productos: 1 })
  })

  /**
   * 🔴 La regla que hace que la lista ⛔ no mienta. Sin esto, el reporte pedía colgar 20 corsets
   * que nadie había ido a mirar, y la primera vez que el local va a buscar algo que estaba colgado
   * deja de creerle a la lista entera.
   */
  it('un producto que el recorrido ⛔ NO tocó no genera una sola línea', () => {
    const l = paraColgar([aEscaneo(UNIT_NG, '111', 'perchero tops', t(0))], LOCAL)
    expect(l.some((c) => c.it.productId === '9')).toBe(false)
  })

  it('⛔ no pide colgar lo que ya está colgado en OTRO mueble', () => {
    const esc = [
      aEscaneo(UNIT_NG, '111', 'perchero tops', t(0)),
      aEscaneo(UNIT_CT, '113', 'vidriera', t(5)),
    ]
    expect(paraColgar(esc, LOCAL).map((c) => c.it.size)).toEqual(['BLANCO'])
  })

  it('la línea apunta al mueble del PRIMER hermano, que es a dónde hay que ir', () => {
    const esc = [
      aEscaneo(UNIT_NG, '111', 'perchero tops', t(0)),
      aEscaneo(UNIT_CT, '113', 'vidriera', t(5)),
    ]
    // BLANCO falta; sus hermanas están en dos muebles y el primero fue «perchero tops».
    expect(paraColgar(esc, LOCAL)[0].lugar).toBe('perchero tops')
  })

  it('el orden de caminata manda, y lo decide el reloj del escaneo y ⛔ no el orden de la cola', () => {
    // La cola sin señal puede llegar al revés: vidriera primero aunque se caminó después.
    const esc = [
      aEscaneo(v({ productId: '9', name: 'CORSET BERNA', size: 'S', barcode: '912', qty: 1 }), '912', 'vidriera', t(9)),
      aEscaneo(UNIT_NG, '111', 'perchero tops', t(1)),
    ]
    const l = paraColgar(esc, [...LOCAL, v({ productId: '9', name: 'CORSET BERNA', size: 'S', barcode: '912', qty: 1 })])
    expect(l[0].it.productId).toBe('1')
    expect(l.at(-1)!.lugar).toBe('vidriera')
  })

  /** Una variante en cero ⛔ no se puede colgar: no hay nada en el guardado que traer. */
  it('la variante EN CERO ⛔ no entra, aunque su hermana se haya escaneado', () => {
    const local = [UNIT_NG, v({ ...UNIT_BL, qty: 0 })]
    expect(paraColgar([aEscaneo(UNIT_NG, '111', 'perchero tops', t(0))], local)).toEqual([])
  })

  /** El escaneo en cero SÍ toca el producto: la prenda estaba colgada aunque el sistema diga 0. */
  it('un escaneo EN CERO toca el producto igual', () => {
    const cero = v({ ...UNIT_NG, qty: 0 })
    const l = paraColgar([aEscaneo(cero, '111', 'perchero tops', t(0))], LOCAL)
    expect(l.map((c) => c.it.size)).toEqual(['CHOCOLATE', 'BLANCO'])
  })

  /**
   * 🔴 El recorrido por categoría marca variantes que **⛔ no pasaron por el lector**: «no se
   * encuentra» quiere decir que alguien la buscó y ⛔ no estaba. Esa prenda ⛔ no se vio, así que sus
   * hermanas ⛔ no se pueden pedir — y ella misma es **BUSCAR**, ⛔ no colgar.
   */
  it('una marca de triage ⛔ NO toca el producto', () => {
    const triage = { ...aEscaneo(UNIT_NG, '111', 'TOPS Y BODIES', t(0)), estado: 'no-encuentra' as const }
    expect(paraColgar([triage], LOCAL)).toEqual([])
  })

  it('pero sí cuenta como «ya revisada»: ⛔ no se pide colgar lo que alguien ya fue a buscar', () => {
    const esc = [
      { ...aEscaneo(UNIT_NG, '111', 'TOPS Y BODIES', t(0)), estado: 'exhibido' as const },
      { ...aEscaneo(UNIT_BL, '112', 'TOPS Y BODIES', t(1)), estado: 'no-encuentra' as const },
    ]
    // Queda CHOCOLATE: BLANCO ya se buscó y ⛔ no apareció.
    expect(paraColgar(esc, LOCAL).map((c) => c.it.size)).toEqual(['CHOCOLATE'])
  })

  it('un código que ⛔ no cruzó ⛔ no toca nada', () => {
    expect(paraColgar([aEscaneo(null, 'ZZZ999', 'perchero tops', t(0))], LOCAL)).toEqual([])
  })

  it('marca —sin esconder— la variante que comparte SKU con otra', () => {
    const mia_bl = v({ productId: '5', name: 'TOP MIA', size: 'BLANCO', sku: '4008', barcode: 'RTO0391BL', qty: 3 })
    const mia_ct = v({ productId: '5', name: 'TOP MIA', size: 'CHOCOLATE', sku: '4008', barcode: 'RTO0391CT', qty: 3 })
    const l = paraColgar([aEscaneo(mia_bl, 'RTO0391BL', 'perchero tops', t(0))], [mia_bl, mia_ct])
    expect(l).toHaveLength(1)
    expect(l[0].it.size).toBe('CHOCOLATE')
    expect(l[0].skuAmbiguo).toBe(true)
  })
})

describe('agrupar, filtrar y exportar', () => {
  const esc = [
    aEscaneo(UNIT_NG, '111', 'perchero tops', t(0)),
    aEscaneo(BERNA, '911', 'vidriera', t(5)),
  ]
  const local = [...LOCAL, v({ productId: '9', name: 'CORSET BERNA', size: 'L', barcode: '913', qty: 4 })]
  const lista = paraColgar(esc, local)

  it('colgarEnLugar contesta por mueble, que es lo que se mira al terminarlo', () => {
    expect(resumenColgar(colgarEnLugar(lista, 'perchero tops'))).toEqual({ variantes: 2, unidades: 7, productos: 1 })
    expect(resumenColgar(colgarEnLugar(lista, ' vidriera '))).toEqual({ variantes: 1, unidades: 4, productos: 1 })
  })

  it('se agrupa por prenda, porque se manda a colgar por prenda', () => {
    const g = agruparColgarPorProducto(lista)
    expect(g.map((x) => [x.name, x.unidades, x.variantes.length])).toEqual([
      ['TOP UNIT', 7, 2],
      ['CORSET BERNA', 4, 1],
    ])
  })

  it('la planilla lleva el mueble, la prenda, el color y las unidades', () => {
    const filas = filasColgar(lista)
    expect(filas[0]).toEqual([...HEADER_COLGAR])
    expect(filas[1]).toEqual(['perchero tops', 'TOP UNIT', 'CHOCOLATE', '', '113', 5, ''])
    expect(filas).toHaveLength(4)
  })
})
