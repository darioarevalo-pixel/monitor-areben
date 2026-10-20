import { describe, expect, it } from 'vitest'
import { SECCIONES_ERP, hrefErp, resolverRutaErp } from '@/components/erp/Erp'

// `/erp` con su menú (Bruno, 19-oct): las 6 secciones del diseño + la Caja, y las pestañas de antes repartidas adentro
// (Pedidos sin pagar, 19-oct: pasó a ser la vista «Sin pagar» de Ventas).
describe('ERP › menú y direcciones', () => {
  it('las pestañas de antes siguen, una sola vez cada una', () => {
    const todas = SECCIONES_ERP.flatMap((s) => s.pestanias.map((p) => p.key))
    expect(new Set(todas).size).toBe(todas.length)
    expect(todas.sort()).toEqual(['ajustes', 'cambio', 'clientes', 'conciliacion', 'cuentas', 'diferencias', 'factura', 'facturacion', 'movimientos', 'por-producto', 'productos', 'proveedores', 'recepciones', 'reglas', 'stock', 'transferencias', 'ventas'])
  })

  it('las secciones del diseño, en su orden', () => {
    expect(SECCIONES_ERP.map((s) => s.titulo)).toEqual(['Inicio', 'Ventas', 'Caja (POS)', 'Stock', 'Productos y precios', 'Clientes y proveedores', 'Configuración'])
  })

  it('cada dirección abre lo suyo; sin pestaña, la primera', () => {
    expect(resolverRutaErp([])).toMatchObject({ pestania: null, valida: true })
    expect(resolverRutaErp(['stock', 'ajustes'])).toMatchObject({ pestania: 'ajustes', valida: true })
    expect(resolverRutaErp(['ventas'])).toMatchObject({ pestania: 'ventas', valida: true })
  })

  it('una dirección vieja o mal escrita se corrige (⛔ pantalla en blanco)', () => {
    const r = resolverRutaErp(['stock', 'nada'])
    expect(r).toMatchObject({ pestania: 'stock', valida: false })
    expect(hrefErp(r.seccion.key, r.pestania)).toBe('/erp/stock/stock')
    // La pestaña «Pedidos sin pagar» ya ⛔ existe: su dirección vieja cae en Ventas.
    const v = resolverRutaErp(['ventas', 'pedidos-tn'])
    expect(v).toMatchObject({ pestania: 'ventas', valida: false })
    expect(hrefErp(v.seccion.key, v.pestania)).toBe('/erp/ventas/ventas')
    const s = resolverRutaErp(['facturacion'])
    expect(s.valida).toBe(false)
    expect(hrefErp(s.seccion.key, s.pestania)).toBe('/erp')
  })
})
