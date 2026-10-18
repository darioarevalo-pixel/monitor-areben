// ERP › Conciliación: el día de la conciliación armado para mirarlo (lib/erp/conciliacion.core.js).
import { describe, it, expect } from 'vitest'
import { CLASE, MOTIVO, TIENDAS, armarConciliacion } from '../lib/erp/conciliacion.core.js'

const nombres = new Map([['1/10', { nombre: 'Remera Lisa', talle: 'M' }]])
const resumen = {
  stock_tn: { variantes: 12, sin_limite: 0, repetidas: 1, comparadas: 10, cierran: 7, clases: { stock_tn: { libro_aparte: 2, tn_atrasado: 1, sin_variante: 1 } } },
  pedidos: { pedidos: 20, pagados: 18, ventas_erp: 18, clases: { pedido_gn: { cancelada_con_venta: 1, en_vuelo: 1 } } },
}
const filas = [
  { tipo: 'stock_tn', clave: '1:10', clase: 'libro_aparte', product_id: 1, size_id: 10, sku: 'R-1', tn: 5, libro: 3, reservado: 1, gn: 5, dias: 1, detalle: {} },
  { tipo: 'stock_tn', clave: '2:20', clase: 'libro_aparte', product_id: 2, size_id: 20, sku: 'R-2', tn: 2, libro: 1, reservado: 0, gn: 2, dias: 3, detalle: {} },
  { tipo: 'stock_tn', clave: '3:30', clase: 'tn_atrasado', product_id: 3, size_id: 30, sku: 'R-3', tn: 1, libro: 2, reservado: 0, gn: 2, dias: 1, detalle: {} },
  { tipo: 'stock_tn', clave: 'tn:77', clase: 'sin_variante', product_id: null, size_id: null, sku: 'XX', tn: 4, libro: null, reservado: null, gn: null, dias: 1, detalle: { nombre: 'Top Tienda' } },
  { tipo: 'pedido_gn', clave: '#7331', clase: 'cancelada_con_venta', numero: '7331', dias: 2, detalle: { tn_id: 99, status: 'cancelled', payment_status: 'voided', gateway: 'mercadopago', total: 1500 } },
  { tipo: 'pedido_gn', clave: '#7340', clase: 'en_vuelo', numero: '7340', dias: 1, detalle: { tn_id: 100 } },
  { tipo: 'pedido_erp', clave: '#7335', clase: 'no_entra', numero: '7335', dias: 1, detalle: { tn_id: 98, motivo: 'cuenta_desconocida' } },
  { tipo: 'pedido_erp', clave: '#7336', clase: 'rara', numero: '7336', dias: 1, detalle: {} },
]

describe('armarConciliacion', () => {
  it('agrupa por tipo y clase en el orden de mirar; lo que viene de días anteriores va primero', () => {
    const d = armarConciliacion({ tienda: 'zattia', filas, resumen, nombres })
    expect(d.grupos.map((g: { tipo: string; clase: string; filas: unknown[] }) => [g.tipo, g.clase, g.filas.length])).toEqual([
      ['stock_tn', 'libro_aparte', 2], ['stock_tn', 'tn_atrasado', 1], ['stock_tn', 'sin_variante', 1], ['pedido_erp', 'no_entra', 1], ['pedido_gn', 'cancelada_con_venta', 1],
    ])
    expect(d.grupos[0].filas.map((f: { clave: string }) => f.clave)).toEqual(['2:20', '1:10'])
    expect(d.grupos[0].deAntes).toBe(1)
    expect(d.grupos[0].filas[1]).toMatchObject({ nombre: 'Remera Lisa', talleNombre: 'M', tn: 5, erp: 3, gn: 5, reservado: 1, producto: '1', talle: '10' })
    expect(d.grupos[2].filas[0]).toMatchObject({ nombre: 'Top Tienda', producto: null, sku: 'XX' })
  })
  it('el pedido: link al admin de SU tienda, el motivo en palabras y el estado de TN', () => {
    const d = armarConciliacion({ tienda: 'zattia', filas, resumen, nombres })
    const gn = d.grupos.find((g: { clase: string }) => g.clase === 'cancelada_con_venta')!.filas[0]
    expect(gn).toMatchObject({ numero: '7331', estado: 'cancelled/voided', medio: 'mercadopago', total: 1500, link: 'https://zattiaco.mitiendanube.com/admin/orders/99', dias: 2 })
    const erp = d.grupos.find((g: { clase: string }) => g.clase === 'no_entra')!.filas[0]
    expect(erp.motivo).toBe(MOTIVO.cuenta_desconocida)
  })
  it('en vuelo y desconocidas se cuentan aparte (⛔ se esconden callado); las tarjetas salen del resumen', () => {
    const d = armarConciliacion({ tienda: 'stunned', filas, resumen, nombres, diaGN: { resumen: { porLinea: { zattia: { inexplicadas: 9 }, stunned: { inexplicadas: 2 } } } } })
    expect(d.enVuelo).toBe(1)
    expect(d.desconocidas).toBe(1)
    expect(d.noCierran).toBe(7)   // 4 de stock + 2 del ERP (una desconocida) + 1 de GN
    expect(d.tarjetas[0]).toMatchObject({ tipo: 'stock_tn', calculado: true, cierran: 7, total: 10, aparte: 1 })
    expect(d.tarjetas[1]).toMatchObject({ tipo: 'pedido_erp', total: 20, noCierran: 2 })
    expect(d.tarjetas[2]).toMatchObject({ tipo: 'pedido_gn', total: 20, noCierran: 1 })
    expect(d.gn).toEqual({ calculado: true, sinExplicar: 2 })
  })
  it('sin día calculado ni diff de GN: dice que ⛔ se calculó, ⛔ cero', () => {
    const d = armarConciliacion({ tienda: 'bdi', filas: [], resumen: null, nombres })
    expect(d.tarjetas.every((t: { calculado: boolean }) => !t.calculado)).toBe(true)
    expect(d.gn).toEqual({ calculado: false, sinExplicar: null })
    const sinLinea = armarConciliacion({ tienda: 'bdi', filas: [], resumen: null, nombres, diaGN: { resumen: { porLinea: { zattia: { inexplicadas: 3 } } } } })
    expect(sinLinea.gn).toEqual({ calculado: true, sinExplicar: 0 })
  })
  it('cada clase que escribe el motor tiene su texto (las de lib/conciliacion.mjs, menos en_vuelo)', () => {
    const DEL_MOTOR = {
      stock_tn: ['libro_aparte', 'tn_atrasado', 'gn_aparte', 'los_tres', 'sin_variante'],
      pedido_erp: ['falta_venta', 'no_entra', 'venta_anulada', 'venta_de_cancelada', 'total_distinto'],
      pedido_gn: ['sin_venta', 'prendas_distintas', 'cancelada_con_venta', 'varias_ventas', 'venta_sin_orden'],
    }
    for (const [tipo, clases] of Object.entries(DEL_MOTOR)) for (const c of clases) expect(CLASE[tipo as keyof typeof CLASE][c as never]).toBeTruthy()
    expect(TIENDAS).toEqual(['bdi', 'zattia', 'stunned'])
  })
})
