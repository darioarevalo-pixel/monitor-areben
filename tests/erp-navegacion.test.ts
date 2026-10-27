import { describe, expect, it } from 'vitest'
import { SECCIONES_ERP, hrefErp, resolverRutaErp } from '@/components/erp/Erp'

// `/erp` con su menú (Bruno, 19-oct): las 6 secciones del diseño + la Caja, y las pestañas de antes repartidas adentro
// (Pedidos sin pagar, 19-oct: pasó a ser la vista «Sin pagar» de Ventas).
describe('ERP › menú y direcciones', () => {
  it('las pestañas de antes siguen, una sola vez cada una', () => {
    // Stock 9 → 4 (diseño §9): las nueve de antes son VISTAS de cuatro pestañas.
    const todas = SECCIONES_ERP.flatMap((s) => s.pestanias.flatMap((p) => p.vistas?.map((v) => v.key) ?? [p.key]))
    expect(new Set(todas).size).toBe(todas.length)
    expect(todas.sort()).toEqual(['ajustes', 'cajas', 'cambio', 'clientes', 'cobros', 'comparacion', 'conciliacion', 'cuenta-corriente', 'cuentas', 'diferencias', 'estructura', 'factura', 'facturacion', 'gastos', 'ingresos', 'mover', 'movimientos', 'por-producto', 'precios', 'productos', 'proveedores', 'redondeo', 'reglas', 'rutas', 'stock', 'transferencias', 'ventas'])
    expect(SECCIONES_ERP.find((s) => s.key === 'stock')!.pestanias.map((p) => p.key)).toEqual(['stock', 'transferencias', 'ajustes', 'diferencias'])
  })

  it('Stock: la vista va en la dirección y las pestañas viejas caen en su lugar', () => {
    expect(resolverRutaErp(['stock', 'transferencias', 'mover'])).toMatchObject({ pestania: 'transferencias', vista: 'mover', valida: true })
    expect(hrefErp('stock', 'diferencias', 'conciliacion')).toBe('/erp/stock/diferencias/conciliacion')
    expect(hrefErp('stock', 'diferencias', 'comparacion')).toBe('/erp/stock/diferencias')
    for (const [vieja, nueva] of [['movimientos', '/erp/stock/stock/movimientos'], ['mover', '/erp/stock/transferencias/mover'], ['recepciones', '/erp/stock/ajustes/ingresos'], ['conciliacion', '/erp/stock/diferencias/conciliacion'], ['diferencias', '/erp/stock/diferencias/diferencias']]) {
      const r = resolverRutaErp(['stock', vieja])
      expect(r.valida).toBe(false)
      expect(hrefErp('stock', r.pestania, r.vista)).toBe(nueva)
      expect(hrefErp('stock', vieja)).toBe(nueva)
    }
    expect(resolverRutaErp(['ventas', 'ventas', 'x']).valida).toBe(false)
  })

  it('las secciones del diseño, en su orden', () => {
    expect(SECCIONES_ERP.map((s) => s.titulo)).toEqual(['Inicio', 'Ventas', 'Caja', 'Stock', 'Productos y precios', 'Clientes y proveedores', 'Configuración'])
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
