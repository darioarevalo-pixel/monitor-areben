/**
 * ERP › Precios: la ficha de precio y costo de un producto (`armarPrecioDeProducto`), pura.
 */
import { describe, it, expect } from 'vitest'
import { armarPrecioDeProducto, NOMBRE_FUENTE } from '../lib/erp/precio.core.js'

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
