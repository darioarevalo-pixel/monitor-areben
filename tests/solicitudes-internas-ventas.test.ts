import { describe, it, expect, vi } from 'vitest'
import { construirPedidosVenta, crearVentas, idsParaCerrar, origenesVendibles, ventaAnulada } from '@/lib/solicitudes-internas/ventas'
import type { PedidoVenta } from '@/lib/sesionfotos/ventas'
import type { ItemSI, SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import { cargarCrearVentasBodies } from './legacy-solicitudes-internas'

function item(over: Partial<ItemSI> = {}): ItemSI {
  return { vid: 'v1', pid: '1', sid: '10', nombre: 'Remera', variante: 'M', sku: 'REM-M', qty: 1, origen: 'deposito', ...over }
}
function sol(over: Partial<SolicitudInterna> = {}): SolicitudInterna {
  return {
    id: 's1', fecha: '2026-07-10', creado: 1, creadoPor: 'ana', motivo: 'Moldería', tipo: 'retornable',
    descripcion: 'molde falda', estado: 'aprobada', items: [item()], ...over,
  }
}

const S = sol({
  id: 'si_abc', motivo: 'Video/contenido', tipo: 'consumo', estado: 'aprobada',
  items: [
    item({ vid: 'a', pid: '10', sid: '100', qty: 2, origen: 'deposito' }),
    item({ vid: 'b', pid: '11', sid: '101', qty: 1, origen: 'deposito' }),
    item({ vid: 'c', pid: '12', sid: '102', qty: 3, origen: 'local' }),
  ],
})

describe('paridad de payload con siCrearVentas (OFFLINE, cero POST)', () => {
  it('el body es byte-idéntico al del legacy', async () => {
    const ctx = { store: 'bdi', user: 'ana', pass: 'secreta' }
    const legacyBodies = await cargarCrearVentasBodies(S, ctx.store, ctx.user, ctx.pass)
    const portBodies: PedidoVenta[] = construirPedidosVenta(S, ctx)
    expect(portBodies).toEqual(legacyBodies)
  })

  it('un pedido por origen, comments de uso interno con motivo y tipo', () => {
    const pedidos = construirPedidosVenta(S, { store: 'bdi', user: 'ana', pass: 'x' })
    expect(pedidos.map((p) => p.origen)).toEqual(['deposito', 'local'])
    expect(pedidos[0].items).toEqual([
      { product_id: '10', size_id: '100', quantity: 2 },
      { product_id: '11', size_id: '101', quantity: 1 },
    ])
    expect(pedidos[1].items).toEqual([{ product_id: '12', size_id: '102', quantity: 3 }])
    expect(pedidos[0].comments).toBe('Uso interno — Video/contenido (consumo) — solicitud si_abc (Monitor)')
    expect(pedidos[0].solicitudId).toBe('si_abc')
  })

  it('origenesVendibles: todos los orígenes con ítems (no hay concepto de "nuevo")', () => {
    expect(origenesVendibles(sol({ items: [item({ origen: 'deposito' }), item({ vid: 'x', origen: 'local' })] }))).toEqual(['deposito', 'local'])
    expect(origenesVendibles(sol({ items: [item({ origen: 'local' })] }))).toEqual(['local'])
  })
})

describe('crearVentas · orquestación secuencial', () => {
  it('envía un pedido por origen EN ORDEN y junta las ventas', async () => {
    const orden: string[] = []
    const enviar = vi.fn(async (p: PedidoVenta) => {
      orden.push(p.origen)
      return { ok: true, venta: { id: p.origen === 'deposito' ? 500 : 600 } }
    })
    const { ventas, errores } = await crearVentas(S, { store: 'bdi', user: 'ana', pass: 'x' }, enviar)
    expect(orden).toEqual(['deposito', 'local'])
    expect(ventas.deposito).toMatchObject({ id: 500 })
    expect(ventas.local).toMatchObject({ id: 600 })
    expect(errores).toEqual([])
  })

  it('junta errores por origen sin abortar el resto', async () => {
    const enviar = vi.fn(async (p: PedidoVenta) => (p.origen === 'deposito' ? { ok: false, error: 'GN rechazó' } : { ok: true, venta: { id: 9 } }))
    const { ventas, errores } = await crearVentas(S, { store: 'bdi', user: 'ana', pass: 'x' }, enviar)
    expect(ventas.deposito).toBeUndefined()
    expect(ventas.local).toMatchObject({ id: 9 })
    expect(errores).toEqual(['deposito: GN rechazó'])
  })
})

describe('auto-cierre · idsParaCerrar (SIN gate de devolución, a diferencia de SF)', () => {
  it('ventaAnulada: ante duda NO cierra; cierra si no existe / inactiva / archivada', () => {
    expect(ventaAnulada(null)).toBe(false)
    expect(ventaAnulada({ ok: true, existe: true, active: true })).toBe(false)
    expect(ventaAnulada({ ok: true, existe: false })).toBe(true)
    expect(ventaAnulada({ ok: true, archived: true })).toBe(true)
  })

  it('cierra un retornable con venta anulada AUNQUE la devolución NO esté completa', async () => {
    const sinDevolver = sol({
      id: 'cerrable', tipo: 'retornable', estado: 'retirada', ventas: { deposito: { id: 1 } },
      items: [item({ vid: 'a', qty: 2 })], devuelto: { a: 0 }, // nada devuelto todavía
    })
    const consultar = vi.fn(async () => ({ ok: true, existe: false }))
    const cerrar = await idsParaCerrar([sinDevolver], 'bdi', consultar)
    expect(cerrar).toEqual(['cerrable']) // SF exigiría devolución completa; SI no
  })

  it('un consumo NO se auto-cierra por anulación (es baja definitiva)', async () => {
    const consumo = sol({ id: 'c', tipo: 'consumo', estado: 'retirada', ventas: { deposito: { id: 1 } } })
    const consultar = vi.fn(async () => ({ ok: true, existe: false }))
    expect(await idsParaCerrar([consumo], 'bdi', consultar)).toEqual([])
    expect(consultar).not.toHaveBeenCalled()
  })

  it('no toca solicitudes sin ventas ni ya cerradas', async () => {
    const consultar = vi.fn(async () => ({ ok: true, existe: false }))
    const cerrar = await idsParaCerrar(
      [sol({ id: 'x', tipo: 'retornable' }), sol({ id: 'y', tipo: 'retornable', estado: 'cerrada', ventas: { deposito: { id: 1 } } })],
      'bdi',
      consultar,
    )
    expect(cerrar).toEqual([])
  })
})
