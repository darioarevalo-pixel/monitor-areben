// Las etiquetas de una prenda «para exhibir» en el armado con el lector (tanda 4, Darío 12-oct-2026):
// qué etiqueta sale según el estado de la variante, y la búsqueda de la impresión rápida.
import { describe, it, expect } from 'vitest'
import { buscarParaImprimir, etiquetaDeExhibir, rotuloEtiqueta } from '@/lib/reposicion/etiquetasExhibir'
import type { VarianteEti } from '@/lib/etiquetas/tipos'

describe('qué etiqueta le toca a una prenda para exhibir', () => {
  const campania = { '700': { precio: 11990, firme: true }, '701': { precio: 8990, firme: false } }

  it('en la campaña elegida: SÓLO la de la campaña, con su precio (aunque Tienda Nube diga otro)', () => {
    // El CORSET FRANK del 12-oct: Feria Septiembre 2026 a $11.990.
    expect(etiquetaDeExhibir('700', campania, 25990, null)).toEqual({ tipo: 'campania', precio: 11990 })
  })

  it('con precio regular: precio + formas de pago', () => {
    expect(etiquetaDeExhibir('1', campania, 25990, null)).toEqual({ tipo: 'precio', precio: 25990 })
    expect(rotuloEtiqueta({ tipo: 'precio', precio: 25990 })).toBe('Precio $25.990 + formas de pago')
  })

  it('sin campaña elegida, la prenda de la campaña sale como regular', () => {
    expect(etiquetaDeExhibir('700', null, 25990, null).tipo).toBe('precio')
  })

  it('en oferta en Tienda Nube y fuera de la campaña: precio rebajado', () => {
    expect(etiquetaDeExhibir('2', campania, 19990, { normal: 29990, promo: 19990 })).toEqual({ tipo: 'rebajado', antes: 29990, ahora: 19990 })
  })

  it('🔴 precio de campaña sin confirmar o sin precio: no sale (nada de etiquetas para despegar después)', () => {
    expect(etiquetaDeExhibir('701', campania, 25990, null).tipo).toBe('campania-provisoria')
    expect(etiquetaDeExhibir('3', campania, 0, null).tipo).toBe('sin-precio')
  })
})

describe('impresión rápida', () => {
  const v = (x: Partial<VarianteEti>): VarianteEti => ({ id: '1', pid: '1', name: 'TOP ZOE', size: 'S', sku: 'RTO-0001-S', barcode: '779001', stock: 1, ...x })
  const vars = [
    v({ id: '1', size: 'S' }),
    v({ id: '2', size: 'M', sku: 'RTO-0001-M', barcode: '779002' }),
    v({ id: '3', name: 'BODY LIA', size: 'M', sku: 'RBO-0003-M', barcode: '779003' }),
    v({ id: '4', name: 'TOP SIN CODIGO', barcode: '' }),
  ]

  it('busca por nombre y talle, con varias palabras', () => {
    expect(buscarParaImprimir(vars, 'top zoe m').map((x) => x.id)).toEqual(['2'])
    expect(buscarParaImprimir(vars, 'zoe').map((x) => x.id).sort()).toEqual(['1', '2'])
  })

  it('una o dos letras sueltas son el talle (palabra entera), no cualquier letra del nombre', () => {
    const blush = [v({ id: 'a', name: 'MINI BLUSH', size: 'S', sku: 'RMI-0009-S' }), v({ id: 'b', name: 'MINI BLUSH', size: 'M', sku: 'RMI-0009-M' })]
    expect(buscarParaImprimir(blush, 'mini blush m').map((x) => x.id)).toEqual(['b'])
  })

  it('por SKU, y nunca una prenda sin código de barras (no hay nada que imprimir)', () => {
    expect(buscarParaImprimir(vars, 'rbo-0003').map((x) => x.id)).toEqual(['3'])
    expect(buscarParaImprimir(vars, 'sin codigo')).toEqual([])
  })

  it('con menos de 2 letras no busca', () => {
    expect(buscarParaImprimir(vars, 't')).toEqual([])
  })
})
