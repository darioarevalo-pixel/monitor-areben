import { describe, expect, it } from 'vitest'
import { armarFilasProductos } from '@/lib/erp/productos-lista.core.js'
import {
  contarVistasPrecio, filtrarPrecio, normalizarPrefsPrecio, ofertaDe, ordenarPrecio, resumenPrecio,
} from '@/lib/erp/precios-lista.core.js'

/**
 * **ERP › Productos y precios › Precios, el núcleo**: las filas de Productos con el último cambio del historial
 * (`producto_precio`), los cambios DE VERDAD del mes (la copia inicial ⛔ cuenta) y la liquidación en curso del monitor;
 * la oferta de TN cuenta sólo si es MÁS BAJA que Online.
 */
const filas = armarFilasProductos({
  productos: [
    { id: 1, nombre: 'TOP SAHARA', marca: 'zattia', categoria: 'TOPS', proveedor: null },
    { id: 2, nombre: 'BIKINI SOL', marca: 'stunned', categoria: null, proveedor: null },
    { id: 3, nombre: 'CINTO CALYPSO', marca: 'zattia', categoria: null, proveedor: null },
    { id: 4, nombre: 'AROS LUNA', marca: 'zattia', categoria: null, proveedor: null },
  ],
  stock: [],
  precios: [
    { product_id: 1, marca: 'zattia', lista: 'online', precio: 20000 }, { product_id: 1, marca: 'zattia', lista: 'oferta', precio: 15000 },
    { product_id: 1, marca: 'zattia', lista: 'mayorista', precio: 9000 },
    { product_id: 2, marca: 'stunned', lista: 'online', precio: 10000 }, { product_id: 2, marca: 'stunned', lista: 'oferta', precio: 10000 },
    { product_id: 3, marca: 'zattia', lista: 'online', precio: 30000 }, { product_id: 3, marca: 'zattia', lista: 'oferta', precio: 12000 },
  ],
  costos: [],
  tn: [],
  cambios: [
    { marca: 'zattia', product_id: 1, lista: 'local', precio: '21990', vigente_desde: '2026-10-15T01:00:00Z', usuario: 'gn-copia', fuente: 'gn', cambios_mes: '0' },
    { marca: 'stunned', product_id: 2, lista: 'local', precio: 9990, vigente_desde: '2026-10-16T12:00:00Z', usuario: 'Bruno Arevalo', fuente: 'suelta', cambios_mes: 1 },
    // Otra línea con el mismo id ⛔ se le pega al producto de stunned.
    { marca: 'zattia', product_id: 2, lista: 'local', precio: 1, vigente_desde: '2026-10-19T12:00:00Z', usuario: 'tn-copia', fuente: 'tn', cambios_mes: 5 },
  ],
  liquidaciones: [{ product_id: '3', store: 'zattia', nombre: 'Feria Online', hasta: '2026-10-18', precio: '5590' }],
})
const de = (id: string) => filas.find((f) => f.producto === id)!

describe('armarFilasProductos › lo de Precios', () => {
  it('el último cambio dice quién en palabras y si fue la copia', () => {
    expect(de('1').ultimoCambio).toEqual({ lista: 'local', precio: 21990, cuando: '2026-10-15T01:00:00.000Z', quien: 'Copia de Gestión Nube', copia: true })
    expect(de('2').ultimoCambio).toMatchObject({ quien: 'Bruno Arevalo', copia: false, precio: 9990 })
    expect(de('4').ultimoCambio).toBeNull()
  })
  it('cambios del mes y liquidación por (LÍNEA, producto) / producto', () => {
    expect(de('2').cambiosMes).toBe(1)
    expect(de('1').cambiosMes).toBe(0)
    expect(de('3').liquidacion).toEqual({ nombre: 'Feria Online', hasta: '2026-10-18', precio: 5590 })
    expect(de('1').liquidacion).toBeNull()
  })
})

describe('ofertaDe', () => {
  it('la liquidación manda; la oferta de TN sólo si es más baja que Online', () => {
    expect(ofertaDe(de('3'))).toEqual({ tipo: 'liquidacion', nombre: 'Feria Online', precio: 5590, hasta: '2026-10-18' })
    expect(ofertaDe(de('1'))).toEqual({ tipo: 'oferta', precio: 15000, pct: 25 })
    expect(ofertaDe(de('2'))).toBeNull()
    expect(ofertaDe(de('4'))).toBeNull()
  })
})

describe('vistas, resumen y orden', () => {
  it('cuenta cada vista con su regla', () => {
    expect(contarVistasPrecio(filas)).toEqual({ todos: 4, oferta: 2, cambiados: 1, sinmay: 3 })
    expect(filtrarPrecio(filas, 'cambiados').map((f) => f.producto)).toEqual(['2'])
    expect(resumenPrecio(filas)).toEqual({ productos: 4, liquidacion: 1, oferta: 1, cambiados: 1, sinMayorista: 3 })
  })
  it('ordena por precio con lo que falta al final, y por último cambio', () => {
    expect(ordenarPrecio(filas, { col: 'online', dir: 'desc' }).map((f) => f.producto)).toEqual(['3', '1', '2', '4'])
    // sin historial empatan (−∞) y van por nombre: AROS LUNA, CINTO CALYPSO
    expect(ordenarPrecio(filas, { col: 'ult', dir: 'desc' }).map((f) => f.producto)).toEqual(['2', '1', '4', '3'])
    expect(ordenarPrecio(filas, null).map((f) => f.nombre)).toEqual(['AROS LUNA', 'BIKINI SOL', 'CINTO CALYPSO', 'TOP SAHARA'])
  })
  it('las columnas de siempre y prefs rotas vuelven a las de siempre', () => {
    expect(normalizarPrefsPrecio(null).visibles).toEqual(['p', 'local', 'online', 'mayorista', 'oferta', 'ult'])
    expect(normalizarPrefsPrecio({ orden: ['zz'], visibles: ['zz'] }).visibles).toContain('p')
  })
})
