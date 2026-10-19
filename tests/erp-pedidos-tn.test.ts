// ERP › Pedidos sin pagar: los pedidos de TN abiertos que retienen stock (lib/erp/pedidos-tn.core.js).
import { describe, it, expect } from 'vitest'
import { armarPedidosSinPagar } from '../lib/erp/pedidos-tn.core.js'

describe('armarPedidosSinPagar', () => {
  const ahora = Date.parse('2026-10-14T21:00:00Z')
  const o = (tn_id: number, extra = {}) => ({ tienda: 'zattia', tn_id, numero: tn_id + 1000, creada_en: '2026-10-10T12:00:00Z', status: 'open', payment_status: 'pending', medio: 'transfer', gateway: 'offline', total: '1000.50', ...extra })
  it('sólo abiertos sin pagar (la regla del motor: authorized ⛔), del más viejo al más nuevo, con prendas y link al admin', () => {
    const r = armarPedidosSinPagar({
      ordenes: [o(1, { creada_en: '2026-10-13T12:00:00Z' }), o(2), o(3, { payment_status: 'paid' }), o(4, { status: 'cancelled' }), o(5, { payment_status: 'partially_refunded' }), o(6, { tienda: 'stunned', payment_status: 'pending' }), o(7, { payment_status: 'authorized' }), o(8, { payment_status: 'paid', pagada_en: null })],
      lineas: [{ tienda: 'zattia', tn_id: 2, nombre: 'Remera', sku: 'Z1', cantidad: 2 }, { tienda: 'zattia', tn_id: 1, nombre: null, sku: 'Z2', cantidad: 1 }],
      ahora,
    })
    expect(r.pedidos.map((p) => [p.tnId, p.dias, p.unidades])).toEqual([['2', 4, 2], ['6', 4, 0], ['1', 1, 1]])
    expect(r.pedidos[0]).toMatchObject({ numero: 1002, total: 1000.5, link: 'https://zattiaco.mitiendanube.com/admin/orders/2', prendas: [{ nombre: 'Remera', sku: 'Z1', cantidad: 2 }] })
    expect(r.pedidos[1].link).toBe('https://stunned3.mitiendanube.com/admin/orders/6')
    expect(r.porTienda).toEqual({ zattia: { pedidos: 2, unidades: 3, total: 2001 }, stunned: { pedidos: 1, unidades: 0, total: 1000.5 } })
  })
  it('entregado sin cobrar (Bruno, 19-oct): el CERRADO sin pago sigue, marcado, y ⛔ suma unidades retenidas', async () => {
    const { STATUS_POR_COBRAR } = await import('../lib/erp/pedidos-tn.core.js')
    const r = armarPedidosSinPagar({
      ordenes: [o(1), o(2, { status: 'closed' }), o(3, { status: 'closed', payment_status: 'paid' }), o(4, { status: 'closed', payment_status: 'refunded' })],
      lineas: [{ tienda: 'zattia', tn_id: 1, nombre: 'A', sku: 'Z1', cantidad: 1 }, { tienda: 'zattia', tn_id: 2, nombre: 'B', sku: 'Z2', cantidad: 3 }],
      ahora,
    })
    expect(r.pedidos.map((p) => [p.tnId, p.entregadoSinCobrar, p.unidades])).toEqual([['1', false, 1], ['2', true, 3]])
    expect(r.porTienda).toEqual({ zattia: { pedidos: 2, unidades: 1, total: 2001 } })
    expect(STATUS_POR_COBRAR).toEqual(['open', 'closed'])
  })
  it('entregado sin cobrar que GN YA cobró (Bruno, 19-oct): sale; sin cobro, o de otro pedido viejo con el mismo número, queda', async () => {
    const { cobradosEnGN } = await import('../lib/erp/pedidos-tn.core.js')
    const entregados = [o(1, { status: 'closed', total: '5431.50' }), o(2, { status: 'closed' }), o(3, { status: 'closed' }), o(4, { status: 'closed' }), o(6, { status: 'closed', creada_en: '2026-09-19T00:30:00Z', total: '12990' })]
    const ventasGN = [
      { id: 91, tn_order: '1001', date_sale: '2026-10-11' },   // #1001: cobró $5.400 de $5.431,50 (redondeo del efectivo) ⇒ cobrado
      { id: 92, tn_order: '1002', date_sale: '2026-10-10' },   // #1002: sin cobro ⇒ queda
      { id: 93, tn_order: '1003', date_sale: '2025-03-01' },   // #1003: una venta VIEJA con el mismo número (otra tienda) ⇒ ⛔ cuenta
      { id: 94, tn_order: '1004', date_sale: '2026-10-12' },   // #1004: cobro a medias ⇒ queda
      { id: 96, tn_order: '1006', date_sale: '2026-09-18' },   // #1006: pedido 18-sep 21:30 AR = 19-sep UTC (BDI #21462) ⇒ cobrado
    ]
    const cobros = [{ venta_id: 91, monto: '5400.00' }, { venta_id: 93, monto: '1000.50' }, { venta_id: 94, monto: '500' }, { venta_id: 96, monto: '12990' }]
    const set = cobradosEnGN({ entregados, ventasGN, cobros })
    expect([...set].sort()).toEqual(['zattia/1', 'zattia/6'])
    const r = armarPedidosSinPagar({ ordenes: [...entregados, o(5)], lineas: [], ahora, cobradosGN: set })
    expect(r.pedidos.map((p) => p.tnId).sort()).toEqual(['2', '3', '4', '5'])
    // un ABIERTO sin pagar ⛔ sale aunque el set lo nombre: la regla es sólo para el entregado
    expect(armarPedidosSinPagar({ ordenes: [o(5)], lineas: [], ahora, cobradosGN: new Set(['zattia/5']) }).pedidos).toHaveLength(1)
  })
  it('authorized es PAGADO (Bruno, 15-oct): ⛔ aparece, y el handler lo excluye al leer', async () => {
    const { NO_SIN_PAGAR } = await import('../lib/erp/pedidos-tn.core.js')
    expect(armarPedidosSinPagar({ ordenes: [o(1, { payment_status: 'authorized' })], lineas: [], ahora }).pedidos).toEqual([])
    expect(NO_SIN_PAGAR).toEqual(expect.arrayContaining(['authorized', 'paid', 'partially_paid', 'refunded', 'voided', 'partially_refunded']))
    expect(NO_SIN_PAGAR).not.toContain('pending')
  })
})
