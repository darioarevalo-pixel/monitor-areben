// ERP › Pedidos sin pagar: los pedidos de TN abiertos que retienen stock (lib/erp/pedidos-tn.core.js).
import { describe, it, expect } from 'vitest'
import { armarPedidosSinPagar } from '../lib/erp/pedidos-tn.core.js'

describe('armarPedidosSinPagar', () => {
  const ahora = Date.parse('2026-10-14T21:00:00Z')
  const o = (tn_id: number, extra = {}) => ({ tienda: 'zattia', tn_id, numero: tn_id + 1000, creada_en: '2026-10-10T12:00:00Z', status: 'open', payment_status: 'pending', medio: 'transfer', gateway: 'offline', total: '1000.50', ...extra })
  it('sólo abiertos y pendientes/autorizados, del más viejo al más nuevo, con prendas y link al admin', () => {
    const r = armarPedidosSinPagar({
      ordenes: [o(1, { creada_en: '2026-10-13T12:00:00Z' }), o(2), o(3, { payment_status: 'paid' }), o(4, { status: 'cancelled' }), o(5, { payment_status: 'partially_refunded' }), o(6, { tienda: 'stunned', payment_status: 'authorized' })],
      lineas: [{ tienda: 'zattia', tn_id: 2, nombre: 'Remera', sku: 'Z1', cantidad: 2 }, { tienda: 'zattia', tn_id: 1, nombre: null, sku: 'Z2', cantidad: 1 }],
      ahora,
    })
    expect(r.pedidos.map((p) => [p.tnId, p.dias, p.unidades])).toEqual([['2', 4, 2], ['6', 4, 0], ['1', 1, 1]])
    expect(r.pedidos[0]).toMatchObject({ numero: 1002, total: 1000.5, link: 'https://zattiaco.mitiendanube.com/admin/orders/2', prendas: [{ nombre: 'Remera', sku: 'Z1', cantidad: 2 }] })
    expect(r.pedidos[1].link).toBe('https://stunned3.mitiendanube.com/admin/orders/6')
    expect(r.porTienda).toEqual({ zattia: { pedidos: 2, unidades: 3, total: 2001 }, stunned: { pedidos: 1, unidades: 0, total: 1000.5 } })
  })
})
