/**
 * ERP › Precios: la ficha de precio y costo de un producto (`armarPrecioDeProducto`), pura.
 */
import { describe, it, expect } from 'vitest'
import { armarPrecioDeProducto, leerCarga, NOMBRE_FUENTE } from '../lib/erp/precio.core.js'

const LISTAS = [{ id: 'mayorista', nombre: 'Mayorista' }, { id: 'local', nombre: 'Local' }, { id: 'online', nombre: 'Online' }]
const vig = (lista: string, precio: number, fuente = 'gn') => ({ lista, precio: String(precio), fuente, vigente_desde: '2026-10-14T23:00:00Z', usuario: 'copia-gn', motivo: null })
const COSTO = { costo: '12000.00', proveedor: 'Textil Sur', fuente: 'gn', vigente_desde: '2026-10-14T23:00:00Z', usuario: 'copia-gn', motivo: null }
const tnV = (precio: number, costo: number | null = 12000, promo: number | null = null) => ({ tienda: 'zattia', precio: String(precio), precio_promocional: promo, costo })

describe('armarPrecioDeProducto', () => {
  it('las listas en orden local · online · mayorista, con lo vigente y de dónde salió (la que no tiene fila, vacía)', () => {
    const r = armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('mayorista', 15000), vig('local', 25500)], costo: COSTO, tn: [tnV(25500)] })
    expect(r.listas.map((l) => [l.lista, l.precio, l.fuente])).toEqual([['local', 25500, 'gn'], ['online', null, null], ['mayorista', 15000, 'gn']])
    expect(r.costo).toMatchObject({ costo: 12000, proveedor: 'Textil Sur', fuente: 'gn' })
    expect(r.avisos).toEqual([])
  })
  it('avisa lo que hay que mirar al cortar GN: local ≠ TN, sin costo, costo de TN ≠ el del ERP', () => {
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(27000)] }).avisos)
      .toEqual(['El precio del local ($25500) no es el de Tienda Nube ($27000).'])
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: null, tn: [tnV(25500, null)] }).avisos).toEqual(['Sin costo en el ERP.'])
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(25500, 13000)] }).avisos)
      .toEqual(['El costo de Tienda Nube ($13000) no es el del ERP ($12000).'])
    // Un peso de diferencia es redondeo, ⛔ aviso.
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(25500.5, 12000.9)] }).avisos).toEqual([])
  })
  it('sin TN lo dice; TN con variantes distintas toma el que más se repite y avisa', () => {
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [], costo: COSTO, tn: [] }).avisos).toEqual(['No está en Tienda Nube (ningún SKU del producto cruza).'])
    const r = armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(25500), tnV(25500), tnV(26000)] })
    expect(r.tn).toMatchObject({ precio: 25500, variantes: 3, distintos: true })
    expect(r.avisos).toEqual(['En Tienda Nube las variantes tienen precios o costos distintos: se muestra el que más se repite.'])
  })
  it('el historial junta precios y costos, del más nuevo al más viejo', () => {
    const r = armarPrecioDeProducto({
      listas: LISTAS, vigentes: [], costo: null,
      historialPrecio: [{ lista: 'local', precio: '25500', fuente: 'gn', vigente_desde: '2026-10-14T10:00:00Z', usuario: 'copia-gn' }],
      historialCosto: [{ costo: '12000', proveedor: null, fuente: 'carga', vigente_desde: '2026-10-15T10:00:00Z', usuario: 'Bruno', motivo: 'aumento' }],
    })
    expect(r.historial.map((h) => [h.que, h.valor, h.fuente])).toEqual([['costo', 12000, 'carga'], ['precio', 25500, 'gn']])
  })
  it('lo de GN al lado (el espejo) y los nombres de las fuentes', () => {
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [], costo: null, gn: { retailer_price: '25500', wholesaler_price: '0', unit_cost: '12000' } }).gn).toEqual({ precio: 25500, mayorista: 0, costo: 12000 })
    expect(Object.keys(NOMBRE_FUENTE).sort()).toEqual(['carga', 'gn', 'oc', 'tn'])
  })
})

describe('leerCarga', () => {
  it('precio con lista; monto en pesos con coma o con puntos de miles', () => {
    expect(leerCarga({ que: 'precio', producto: '237777', lista: 'local', monto: '10.990,50' })).toMatchObject({ que: 'precio', producto: '237777', lista: 'local', monto: 10990.5, desde: null })
    expect(leerCarga({ que: 'precio', producto: '1', lista: 'local', monto: 0 })).toMatchObject({ monto: 0 })
    // 🔴 el punto decimal que escribe `String(n)` ⛔ se lee como miles (el bug de los compromisos: cien veces el monto).
    expect(leerCarga({ que: 'precio', producto: '1', lista: 'local', monto: String(1500.5) })).toMatchObject({ monto: 1500.5 })
    expect(leerCarga({ que: 'precio', producto: '1', lista: 'local', monto: '$ 1.500' })).toMatchObject({ monto: 1500 })
  })
  it('costo sin lista, con proveedor; desde = 00:00 de Argentina', () => {
    expect(leerCarga({ que: 'costo', producto: '1', monto: 1500, lista: 'local', proveedor: ' Textil Sur ', desde: '2026-10-20' }))
      .toMatchObject({ que: 'costo', lista: null, proveedor: 'Textil Sur', desde: '2026-10-20T00:00:00-03:00' })
  })
  it('frena lo que el motor rechazaría con un error menos claro', () => {
    expect(leerCarga({ producto: '1', monto: 1 }).error).toBeTruthy()
    expect(leerCarga({ que: 'precio', producto: 'x', lista: 'local', monto: 1 }).error).toBeTruthy()
    expect(leerCarga({ que: 'precio', producto: '1', monto: 1 }).error).toMatch(/lista/)
    expect(leerCarga({ que: 'costo', producto: '1', monto: '' }).error).toBeTruthy()
    expect(leerCarga({ que: 'costo', producto: '1', monto: -5 }).error).toBeTruthy()
    expect(leerCarga({ que: 'costo', producto: '1', monto: 5, desde: '20/10' }).error).toMatch(/AAAA/)
  })
})
