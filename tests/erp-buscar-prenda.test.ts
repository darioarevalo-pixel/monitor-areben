// ERP · buscar una prenda (`lib/erp/buscar-prenda.core.js`). El caso real: «TEMPLADO 9D PREMIUM» (679953, BDI) ⛔ salía (Bruno 16-nov).
import { describe, expect, it } from 'vitest'
import { pedidoDeBusqueda, prendasEncontradas } from '../lib/erp/buscar-prenda.core.js'

const fila = (pid: number, nombre: string, sid: number, talle: string, extra: Record<string, unknown> = {}) =>
  ({ product_id: pid, product_name: nombre, size_id: sid, size_name: talle, sku: `SKU-${pid}-${sid}`, barcode: null, store_name: 'Local', available_quantity: 1, ...extra })

// Como en BDI: muchos templados con un talle por modelo de teléfono, ordenados por nombre (lo que devuelve la base).
const MODELOS = ['iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 16', 'iPhone 17', 'iPhone 17 Pro', 'iPhone 17 Pro Max', 'iPhone Air']
const espejo = [
  ...['TEMPLADO 9D', 'TEMPLADO ANTIESPIA', 'TEMPLADO CAMARA', 'TEMPLADO COMUN', 'TEMPLADO MATE', 'TEMPLADO PRIVACY'].flatMap((n, i) => MODELOS.map((m, j) => fila(100 + i, n, 1000 * (i + 1) + j, m))),
  ...MODELOS.map((m, j) => fila(679953, 'TEMPLADO 9D PREMIUM', 195400 + j, m)),
  fila(900, 'FUNDA PREMIUM', 1, 'iPhone 17'),
].sort((a, b) => a.product_name.localeCompare(b.product_name) || a.size_name.localeCompare(b.size_name))

const buscar = (q: string) => prendasEncontradas(espejo, pedidoDeBusqueda(q), 'bdi')
const productos = (r: ReturnType<typeof buscar>) => [...new Set(r.variantes.map((v) => v.producto))]

describe('buscar una prenda en el ERP', () => {
  it('cada palabra, en cualquier orden: «templado premium» y «premium templado» lo encuentran', () => {
    expect(productos(buscar('templado premium'))).toEqual(['679953'])
    expect(productos(buscar('premium templado'))).toEqual(['679953'])
  })

  it('el producto vuelve con TODOS sus talles aunque la búsqueda traiga muchos (era: tope de 60 talles)', () => {
    const r = buscar('templado')
    expect(r.variantes.filter((v) => v.producto === '679953')).toHaveLength(MODELOS.length)
    expect(r.cortado).toBe(false)
  })

  it('el modelo del teléfono cuenta como talle: «templado premium 17 pro max» da ese talle solo', () => {
    const r = buscar('templado premium 17 pro max')
    expect(r.variantes.map((v) => v.talleNombre)).toEqual(['iPhone 17 Pro Max'])
  })

  it('una palabra ⛔ se encuentra en el medio de otra («mium» no es «premium»)', () => {
    expect(buscar('mium').variantes).toHaveLength(0)
  })

  it('por SKU y por código de barras, como antes', () => {
    expect(productos(buscar('SKU-679953'))).toEqual(['679953'])
    const conCodigo = [...espejo, fila(5, 'OTRO', 9, 'U', { barcode: '7791234567890' })]
    expect(prendasEncontradas(conCodigo, pedidoDeBusqueda('7791234567890'), 'bdi').variantes.map((v) => v.producto)).toEqual(['5'])
  })

  it('el tope es de PRODUCTOS y lo dice', () => {
    const r = prendasEncontradas(espejo, pedidoDeBusqueda('templado'), 'bdi', 3)
    expect(productos(r)).toHaveLength(3)
    expect(r.cortado).toBe(true)
  })

  it('menos de 3 letras ⛔ busca', () => {
    expect(pedidoDeBusqueda('te')).toBeNull()
  })
})
