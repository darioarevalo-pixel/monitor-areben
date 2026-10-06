import { describe, expect, it } from 'vitest'
import { REGLAS_INICIALES } from '@/lib/caja/core.core.js'
import type { Reglas } from '@/lib/caja/cliente'
import { coloresDelProducto, precioTotem, tallesDelLocal } from '@/lib/caja/totem'

/**
 * El tótem (rediseño, fase 4). Oráculo a mano con las reglas iniciales: efectivo 15 % y redondeo a $100.
 * $18.900 × 0,85 = $16.065 ⇒ redondeado $16.100, ahorro $2.800. Una prenda de feria: precio final,
 * $18.900, sin descuento.
 */
const R = REGLAS_INICIALES as unknown as Reglas

describe('precioTotem', () => {
  it('el precio en efectivo es el del cobro: 15 % y redondeo a $100', () => {
    // Transferencia es 10 % ($17.000) ⇒ ⛔ vale lo mismo: el rótulo dice sólo «En efectivo».
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: R })).toEqual({ feria: false, lista: 18900, efectivo: 16100, ahorro: 2800, conTransferencia: false })
  })

  it('«o transferencia» sólo si el cobro por transferencia da el MISMO total', () => {
    const t = 13015 // `transferenciaA` de las reglas iniciales
    const igual = { ...R, cuentas: { ...R.cuentas, [t]: { ...R.cuentas[t], descuento: 15 } } } as Reglas
    const p = precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: igual })
    expect(p && !p.feria && p.conTransferencia).toBe(true)
  })

  it('una prenda de feria: precio final, sin el % de la forma de pago', () => {
    const conFeria = { ...R, feriaProductos: [{ id: 5, nombre: 'Blazer' }] } as Reglas
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: conFeria })).toEqual({ feria: true, lista: 18900, final: 18900 })
  })

  it('sin precio o sin formas de pago ⛔ inventa un número', () => {
    expect(precioTotem({ product_id: 5, size_id: 1, precio: null, reglas: R })).toBeNull()
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: { ...R, medios: undefined } as Reglas })).toBeNull()
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: null })).toBeNull()
  })
})

describe('tallesDelLocal', () => {
  it('un talle por nombre, «hay» si alguna variante tiene stock en el local', () => {
    expect(
      tallesDelLocal([
        { size_name: 'S', local: 0 },
        { size_name: 'M', local: 2 },
        { size_name: 'M', local: 0 },
        { size_name: 'L' },
        { size_name: ' ' },
      ]),
    ).toEqual([
      { talle: 'S', hay: false },
      { talle: 'M', hay: true },
      { talle: 'L', hay: false },
    ])
  })
})

describe('coloresDelProducto', () => {
  it('los colores del producto del SKU escaneado, cada uno con su foto, y el del escaneado', () => {
    const audit = [
      { variantes: [{ sku: 'OTRO-1', color: 'ROJO', image_url: 'r.jpg' }] },
      {
        variantes: [
          { sku: 'RBT-0137-S', color: 'NEGRO', image_url: null },
          { sku: 'RBT-0137-M', color: 'NEGRO', image_url: 'n.jpg' },
          { sku: 'RBT-0137-L', color: 'CHOCOLATE', image_url: 'c.jpg' },
          { sku: 'RBT-0137-X', color: '' },
        ],
      },
    ]
    expect(coloresDelProducto(audit, 'rbt-0137-l')).toEqual({
      colores: [
        { nombre: 'NEGRO', foto: 'n.jpg' },
        { nombre: 'CHOCOLATE', foto: 'c.jpg' },
      ],
      actual: 'CHOCOLATE',
      foto: 'c.jpg',
    })
    expect(coloresDelProducto(audit, null).colores).toEqual([])
    expect(coloresDelProducto(audit, 'NO-ESTA').colores).toEqual([])
  })
})
