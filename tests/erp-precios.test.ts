/**
 * ERP › Precios: la ficha de precio y costo de un producto (`armarPrecioDeProducto`), pura.
 */
import { describe, it, expect } from 'vitest'
import { armarPrecioDeProducto, leerCarga, leerSoltar, lineaDelProducto, NOMBRE_FUENTE } from '../lib/erp/precio.core.js'

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
  it('avisa lo que hay que mirar al cortar Gestión Nube: local ≠ Tienda Nube, sin costo, costo de Tienda Nube ≠ el del ERP', () => {
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(27000)] }).avisos)
      .toEqual(['El precio del local ($25500) no es el que cobra Tienda Nube ($27000).'])
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: null, tn: [tnV(25500, null)] }).avisos).toEqual(['Sin costo en el ERP.'])
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(25500, 13000)] }).avisos)
      .toEqual(['El costo de Tienda Nube ($13000) no es el del ERP ($12000).'])
    // Un peso de diferencia es redondeo, ⛔ aviso.
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(25500.5, 12000.9)] }).avisos).toEqual([])
  })
  it('sin Tienda Nube lo dice; Tienda Nube con variantes distintas toma el que más se repite y avisa', () => {
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [], costo: COSTO, tn: [] }).avisos).toEqual(['No está en Tienda Nube (ningún código del producto cruza).'])
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
  it('lo de Gestión Nube al lado (el espejo) y los nombres de las fuentes', () => {
    expect(armarPrecioDeProducto({ listas: LISTAS, vigentes: [], costo: null, gn: { retailer_price: '25500', wholesaler_price: '0', unit_cost: '12000' } }).gn).toEqual({ precio: 25500, mayorista: 0, costo: 12000 })
    expect(Object.keys(NOMBRE_FUENTE).sort()).toEqual(['carga', 'gn', 'oc', 'suelta', 'tn'])
  })
})

describe('precio que sigue a lo que cobra Tienda Nube (motor sql/018)', () => {
  const L18 = [{ id: 'local', nombre: 'Local', sigue: 'oferta' }, { id: 'online', nombre: 'Online', sigue: null }, { id: 'oferta', nombre: 'Tienda Nube con oferta', sigue: null }, { id: 'mayorista', nombre: 'Mayorista', sigue: null }]
  const ef = (lista: string, precio: number, fuente: string, de_lista: string) => ({ lista, precio: String(precio), fuente, de_lista })
  it('🔑 REMERA ESSENTIAL: Tienda Nube $45.990 con oferta $31.490 ⇒ el local se compara con lo que COBRA ($31.490), y lo cargado se puede soltar', () => {
    const r = armarPrecioDeProducto({
      listas: L18, vigentes: [vig('local', 36990, 'carga'), vig('online', 45990, 'tn'), vig('oferta', 31490, 'tn')],
      efectivos: [ef('local', 36990, 'carga', 'local'), ef('online', 45990, 'tn', 'online'), ef('oferta', 31490, 'tn', 'oferta')],
      costo: COSTO, tn: [tnV(45990, 12000, 31490)],
    })
    expect(r.listas.map((l) => [l.lista, l.precio, l.puedeSoltar])).toEqual([['local', 36990, true], ['online', 45990, false], ['oferta', 31490, false], ['mayorista', null, false]])
    expect(r.tn).toMatchObject({ precio: 45990, promocional: 31490, cobra: 31490 })
    expect(r.avisos).toEqual(['El precio del local ($36990) no es el que cobra Tienda Nube ($31490).'])
  })
  it('suelto: el local sigue a la oferta, sin aviso ni botón; una promo MAYOR que la de lista ⛔ es oferta', () => {
    const r = armarPrecioDeProducto({
      listas: L18, vigentes: [{ ...vig('local', 0, 'suelta'), precio: null }, vig('oferta', 31490, 'tn')],
      efectivos: [ef('local', 31490, 'tn', 'oferta'), ef('oferta', 31490, 'tn', 'oferta')], costo: COSTO, tn: [tnV(45990, 12000, 31490)],
    })
    expect(r.listas[0]).toMatchObject({ lista: 'local', precio: 31490, deLista: 'oferta', puedeSoltar: false })
    expect(r.avisos).toEqual([])
    expect(armarPrecioDeProducto({ listas: L18, vigentes: [], costo: COSTO, tn: [tnV(25000, 12000, 26000)] }).tn?.cobra).toBe(25000)
  })
  it('una lista cargada que ⛔ sigue a nadie ⛔ se suelta desde la pantalla', () => {
    const r = armarPrecioDeProducto({ listas: L18, vigentes: [vig('online', 40000, 'carga')], efectivos: [ef('online', 40000, 'carga', 'online')], costo: COSTO, tn: [] })
    expect(r.listas.find((l) => l.lista === 'online')?.puedeSoltar).toBe(false)
  })
  it('leerSoltar: producto y lista; el motivo se recorta', () => {
    expect(leerSoltar({ producto: '237777', lista: 'local', motivo: '  vuelve a Tienda Nube ' })).toEqual({ producto: '237777', lista: 'local', motivo: 'vuelve a Tienda Nube' })
    expect(leerSoltar({ producto: 'x', lista: 'local' })).toEqual({ error: 'Producto inválido' })
    expect(leerSoltar({ producto: '1', lista: '' })).toEqual({ error: 'Elegí la lista.' })
  })
})

describe('producto en oferta de Liquidación: el local la cobra al precio de su campaña', () => {
  const L18 = [{ id: 'local', nombre: 'Local', sigue: 'oferta' }, { id: 'oferta', nombre: 'Tienda Nube con oferta', sigue: null }]
  const ef = (lista: string, precio: number) => ({ lista, precio: String(precio), fuente: 'tn', de_lista: 'oferta' })
  it('🔑 Tienda Nube tiene la «Feria Online» (campaña ÷ 0,9) y el local la sigue: la ficha dice además el precio de la campaña', () => {
    const base = { listas: L18, vigentes: [vig('oferta', 20000, 'tn')], efectivos: [ef('local', 20000), ef('oferta', 20000)], costo: COSTO }
    const r = armarPrecioDeProducto({ ...base, tn: [tnV(30000, 12000, 20000)], feria: 18000 })
    expect(r.feria).toBe(18000)
    expect(r.listas[0]).toMatchObject({ lista: 'local', precio: 20000 })
    expect(r.avisos).toEqual([])
    expect(armarPrecioDeProducto({ ...base, tn: [tnV(30000, 12000, 20000)] }).feria).toBeNull()
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
    expect(leerCarga({ que: 'costo', producto: '1', monto: 1500, lista: 'local', proveedor: ' Textil Sur ', desde: '2026-10-20' }, { hoy: '2026-10-15' }))
      .toMatchObject({ que: 'costo', lista: null, proveedor: 'Textil Sur', desde: '2026-10-20T00:00:00-03:00' })
  })
  it('🔴 «desde» HOY = ahora (a las 00:00 perdería contra la copia de Gestión Nube de la mañana); hacia atrás ⛔', () => {
    expect(leerCarga({ que: 'costo', producto: '1', monto: 1500, desde: '2026-10-15' }, { hoy: '2026-10-15' })).toMatchObject({ desde: null })
    expect(leerCarga({ que: 'costo', producto: '1', monto: 1500, desde: '2026-10-14' }, { hoy: '2026-10-15' }).error).toMatch(/desde hoy/)
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

describe('lo que encontró la review (15-oct)', () => {
  it('la línea del producto mira TODAS las variantes, como la copia de Gestión Nube', () => {
    expect(lineaDelProducto('zattia', [null as unknown as string, 'ZA-1', 'STU-9'])).toBe('stunned')
    expect(lineaDelProducto('zattia', ['ZA-1'])).toBe('zattia')
    expect(lineaDelProducto('bdi', ['STU-1'])).toBe('bdi')
  })
  it('con precio_lista (011), el local que SIGUE al online muestra el de online y de qué lista salió', () => {
    const r = armarPrecioDeProducto({
      listas: LISTAS, vigentes: [vig('online', 27000, 'tn'), vig('mayorista', 15000)], costo: COSTO, tn: [tnV(27000)],
      efectivos: [{ lista: 'local', precio: '27000', fuente: 'tn', de_lista: 'online' }, { lista: 'online', precio: '27000', fuente: 'tn', de_lista: 'online' }, { lista: 'mayorista', precio: '15000', fuente: 'gn', de_lista: 'mayorista' }],
    })
    expect(r.listas.map((l) => [l.lista, l.precio, l.deLista])).toEqual([['local', 27000, 'online'], ['online', 27000, null], ['mayorista', 15000, null]])
    expect(r.avisos).toEqual([])
  })
  it('un 0 en Tienda Nube es que falta: ⛔ cuenta ni dispara avisos', () => {
    const r = armarPrecioDeProducto({ listas: LISTAS, vigentes: [vig('local', 25500)], costo: COSTO, tn: [tnV(0, 0), tnV(0, 0), tnV(25500)] })
    expect(r.tn).toMatchObject({ precio: 25500, costo: 12000, distintos: false })
    expect(r.avisos).toEqual([])
  })
})
