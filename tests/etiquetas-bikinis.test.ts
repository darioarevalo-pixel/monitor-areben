import { describe, expect, it } from 'vitest'
import { bikinisParaEtiquetas, conPreciosDeBikini, variantesComoBikini } from '../lib/etiquetas/bikinis.core.js'

// Forma real de `conjuntosDeCaja` (producción, 26-nov): una fila por VARIANTE de TN (talle corpiño × talle bombacha).
const pz = (n: number, pid: number, sid: number, producto: string, talle: string) => ({ n, product_id: pid, size_id: sid, cantidad: 1, precio: 9999, producto, talle })
const conjuntos = [
  { variant_id: 1, nombre: 'Bikini MADDIE · Sky', precio: 49990, lista: null, piezas: [pz(1, 74, 75, 'CORPIÑO MADDIE SKY', 'S'), pz(2, 70, 71, 'BOMBACHA MADDIE SKY', 'S')] },
  { variant_id: 2, nombre: 'Bikini MADDIE · Sky', precio: 49990, lista: null, piezas: [pz(1, 74, 75, 'CORPIÑO MADDIE SKY', 'S'), pz(2, 70, 72, 'BOMBACHA MADDIE SKY', 'M')] },
  { variant_id: 3, nombre: 'Bikini JULIET · Noir', precio: 46742, lista: 54990, piezas: [pz(1, 80, 81, 'CORPIÑO JULIET NOIR', 'M'), pz(2, 82, 83, 'BOMBACHA JULIET NOIR', 'L')] },
]

describe('Etiquetas · bikini 2027', () => {
  const bikinis = bikinisParaEtiquetas(conjuntos)

  it('una por producto bikini, con cada parte una vez y ⛔ el reparto del precio', () => {
    expect(bikinis.map((b) => b.nombre)).toEqual(['Bikini MADDIE · Sky', 'Bikini JULIET · Noir'])
    expect(bikinis[0].piezas.map((p) => `${p.product_id}_${p.size_id}`)).toEqual(['74_75', '70_71', '70_72'])
    expect(JSON.stringify(bikinis)).not.toContain('9999')
  })

  it('escanear CUALQUIER parte da la etiqueta de su bikini, con el código de la parte', () => {
    const vars = [
      { id: '70_72', pid: '70', name: 'BOMBACHA MADDIE SKY', size: 'M', barcode: '111', sku: 'B-M' },
      { id: '74_75', pid: '74', name: 'CORPIÑO MADDIE SKY', size: 'S', barcode: '222', sku: 'C-S' },
      { id: '9_9', pid: '9', name: 'TOP LISO', size: 'U', barcode: '333', sku: 'T' },
    ]
    const r = variantesComoBikini(vars, bikinis)
    expect(r[0]).toMatchObject({ name: 'Bikini MADDIE · Sky', size: 'Bombacha · M', barcode: '111' })
    expect(r[1]).toMatchObject({ name: 'Bikini MADDIE · Sky', size: 'Corpiño · S', barcode: '222' })
    expect(r[2]).toBe(vars[2])
  })

  it('el precio es el de la bikini (gana sobre el de la parte), tachado si hay promo', () => {
    const base = { precios: { '70': 28072, '74': 21917, '9': 1000 }, promos: {} as Record<string, { normal: number; promo: number }>, fueraDeTn: new Set(['70']) }
    const r = conPreciosDeBikini(base, bikinis)
    expect(r.precios['70']).toBe(49990)
    expect(r.precios['74']).toBe(49990)
    expect(r.precios['9']).toBe(1000)
    expect(r.fueraDeTn.has('70')).toBe(false)
    expect(r.promos['80']).toEqual({ normal: 54990, promo: 46742 })
    expect(r.promos['70']).toBeUndefined()
  })

  it('sin bikinis no toca nada', () => {
    const vars = [{ id: '1_1', pid: '1', name: 'X', size: 'S' }]
    expect(variantesComoBikini(vars, null)).toBe(vars)
    expect(conPreciosDeBikini({ precios: { '1': 5 }, promos: {}, fueraDeTn: new Set<string>() }, []).precios['1']).toBe(5)
  })
})
