import { describe, it, expect } from 'vitest'
import { indexarStockGn, stockDeVariante, stockPorColor, unidadesSinFoto } from '@/lib/tncat/stock-variante'
import type { Variante } from '@/lib/etl/tipos'
import type { ProductoFchk, VarianteFchk } from '@/lib/tncat/tipos'

const gn = (sku: string, barcode: string, stock: number): Variante => ({ sku, barcode, stock }) as Variante
const tn = (over: Partial<VarianteFchk>): VarianteFchk => ({ color: 'AZUL', image_url: null, ...over })
const prod = (variantes: VarianteFchk[]): ProductoFchk => ({ id: '1', name: 'P', variantes })

/**
 * El stock decide qué se fotografía primero, así que un número mal traído manda a fotografiar lo
 * que no hace falta y deja parado lo que sí. El cruce es por código EXACTO —no por nombre, que es
 * lo que usa el resto de tncat a nivel producto— y lo que no cruza vale `undefined`, nunca 0.
 */
describe('stock por variante — el cruce con Gestión Nube', () => {
  const idx = indexarStockGn([gn('F-001', '779001', 12), gn('F-002', '779002', 5)])

  it('cruza por SKU', () => {
    expect(stockDeVariante(tn({ sku: 'F-001' }), idx)).toBe(12)
  })

  it('si no hay SKU, cae al código de barras', () => {
    expect(stockDeVariante(tn({ barcode: '779002' }), idx)).toBe(5)
  })

  it('el SKU manda sobre el código de barras', () => {
    // En BDI el barcode cubre más variantes, pero el SKU es el identificador propio: si los dos
    // están, gana el SKU. Acá apuntan a variantes distintas a propósito.
    expect(stockDeVariante(tn({ sku: 'F-001', barcode: '779002' }), idx)).toBe(12)
  })

  it('no ignora mayúsculas ni espacios', () => {
    expect(stockDeVariante(tn({ sku: '  f-001 ' }), idx)).toBe(12)
  })

  it('sin ningún código no cruza — y devuelve undefined, no cero', () => {
    // Un cero se lee como "no hay stock" y haría descartar un producto que sí hay que fotografiar.
    expect(stockDeVariante(tn({}), idx)).toBeUndefined()
    expect(stockDeVariante(tn({ sku: 'NO-EXISTE' }), idx)).toBeUndefined()
  })

  it('los códigos vacíos no matchean nada', () => {
    // En el ETL los códigos faltantes son '' y no null: sin filtrarlos, el vacío matchea todo.
    const conVacios = indexarStockGn([gn('', '', 99), gn('F-003', '', 7)])
    expect(stockDeVariante(tn({ sku: '' }), conVacios)).toBeUndefined()
    expect(stockDeVariante(tn({ barcode: '' }), conVacios)).toBeUndefined()
    expect(stockDeVariante(tn({ sku: 'F-003' }), conVacios)).toBe(7)
  })

  it('dos variantes de GN con el mismo código se suman, no se pisan', () => {
    // Pasa cuando se duplica un producto en GN; quedarse con la última escondería unidades.
    const dup = indexarStockGn([gn('F-009', 'B9', 4), gn('F-009', 'B9', 6)])
    expect(stockDeVariante(tn({ sku: 'F-009' }), dup)).toBe(10)
  })

  it('stock 0 en GN es un dato, no la ausencia de dato', () => {
    const cero = indexarStockGn([gn('F-010', 'B10', 0)])
    expect(stockDeVariante(tn({ sku: 'F-010' }), cero)).toBe(0)
  })
})

describe('stock por variante — agrupado por color', () => {
  const idx = indexarStockGn([gn('A1', 'BA1', 10), gn('A2', 'BA2', 4), gn('R1', 'BR1', 3)])

  it('suma las variantes del mismo color', () => {
    const p = prod([tn({ color: 'AZUL', sku: 'A1' }), tn({ color: 'AZUL', sku: 'A2' }), tn({ color: 'ROJO', sku: 'R1' })])
    const m = stockPorColor(p, idx)
    expect(m.get('AZUL')).toBe(14)
    expect(m.get('ROJO')).toBe(3)
  })

  it('un color donde NINGUNA variante cruza queda en undefined', () => {
    const m = stockPorColor(prod([tn({ color: 'VERDE', sku: 'NADA' })]), idx)
    expect(m.has('VERDE')).toBe(true)
    expect(m.get('VERDE')).toBeUndefined()
  })

  it('si cruza alguna, se devuelve lo que se pudo sumar', () => {
    // Mejor un piso que nada: el color igual aparece con unidades.
    const m = stockPorColor(prod([tn({ color: 'AZUL', sku: 'A1' }), tn({ color: 'AZUL', sku: 'NADA' })]), idx)
    expect(m.get('AZUL')).toBe(10)
  })

  it('las variantes sin color no participan', () => {
    expect(stockPorColor(prod([tn({ color: null, sku: 'A1' })]), idx).size).toBe(0)
  })
})

/**
 * `unidadesSinFoto` es el número del tablero: cuántas unidades están esperando que alguien les
 * saque la foto.
 */
describe('stock por variante — unidades esperando foto', () => {
  const idx = indexarStockGn([gn('A1', 'BA1', 10), gn('A2', 'BA2', 4), gn('R1', 'BR1', 3)])

  it('cuenta solo las variantes con color y sin foto', () => {
    const p = prod([
      tn({ color: 'AZUL', sku: 'A1', image_url: null }),
      tn({ color: 'AZUL', sku: 'A2', image_url: 'azul.jpg' }),
      tn({ color: 'ROJO', sku: 'R1', image_url: null }),
    ])
    expect(unidadesSinFoto(p, idx)).toBe(13) // 10 + 3; la que tiene foto no cuenta
  })

  it('una variante sin color no cuenta aunque no tenga foto', () => {
    // Usa la foto principal del producto, que para un producto de un solo color es la correcta.
    expect(unidadesSinFoto(prod([tn({ color: null, sku: 'A1' })]), idx)).toBeUndefined()
  })

  it('sin nada que cruzar devuelve undefined, no cero', () => {
    expect(unidadesSinFoto(prod([tn({ color: 'AZUL', sku: 'NADA' })]), idx)).toBeUndefined()
  })

  it('con todo fotografiado no hay unidades esperando', () => {
    expect(unidadesSinFoto(prod([tn({ color: 'AZUL', sku: 'A1', image_url: 'a.jpg' })]), idx)).toBeUndefined()
  })
})
