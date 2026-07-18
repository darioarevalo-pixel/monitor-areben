import { describe, it, expect, vi } from 'vitest'
import {
  construirPedidosVenta,
  crearVentas,
  idsParaCerrar,
  origenesVendibles,
  ventaAnulada,
  type PedidoVenta,
} from '@/lib/sesionfotos/ventas'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import { cargarCrearVentasBodies } from './legacy-sesionfotos'

function item(over: Partial<Solicitud['items'][number]> = {}): Solicitud['items'][number] {
  return { vid: 'v1', pid: '1', sid: '10', nombre: 'Remera', variante: 'M', sku: 'REM-M', qty: 1, origen: 'deposito', ...over }
}
function sol(over: Partial<Solicitud> = {}): Solicitud {
  return { id: 's1', fecha: '2026-07-10', creado: 1, creadoPor: 'ana', descripcion: 'Sesión otoño', estado: 'pendiente', items: [item()], ...over }
}

/** Solicitud con ítems en ambos orígenes + un nuevo + un manual (que NO deben ir a la venta). */
const S = sol({
  id: 's_abc',
  descripcion: 'Sesión primavera',
  items: [
    item({ vid: 'a', pid: '10', sid: '100', qty: 2, origen: 'deposito' }),
    item({ vid: 'b', pid: '11', sid: '101', qty: 1, origen: 'deposito' }),
    item({ vid: 'c', pid: '12', sid: '102', qty: 3, origen: 'local' }),
    item({ vid: 'bc_9', pid: null, sid: null, qty: 5, origen: 'deposito', nuevo: true, pendiente: true }),
    item({ vid: 'man_1', pid: null, sid: null, qty: 4, origen: 'local', nuevo: true, manual: true }),
  ],
})

describe('paridad de payload con sfCrearVentas (OFFLINE, cero POST)', () => {
  it('el body es byte-idéntico al del legacy', async () => {
    const ctx = { store: 'bdi', user: 'ana', pass: 'secreta' }
    const legacyBodies = await cargarCrearVentasBodies(S, ctx.store, ctx.user, ctx.pass)
    const portBodies: PedidoVenta[] = construirPedidosVenta(S, ctx)
    expect(portBodies).toEqual(legacyBodies)
  })

  it('excluye los ítems nuevo/manual y arma un pedido por origen con ítems vendibles', () => {
    const pedidos = construirPedidosVenta(S, { store: 'bdi', user: 'ana', pass: 'x' })
    expect(pedidos.map((p) => p.origen)).toEqual(['deposito', 'local'])
    expect(pedidos[0].items).toEqual([
      { product_id: '10', size_id: '100', quantity: 2 },
      { product_id: '11', size_id: '101', quantity: 1 },
    ])
    expect(pedidos[1].items).toEqual([{ product_id: '12', size_id: '102', quantity: 3 }])
    // el comments y solicitudId
    expect(pedidos[0].comments).toBe('Sesión de fotos — Sesión primavera — solicitud s_abc (Monitor)')
    expect(pedidos[0].solicitudId).toBe('s_abc')
  })

  it('origenesVendibles ignora un origen que solo tiene ítems nuevos', () => {
    const s = sol({ items: [item({ origen: 'deposito' }), item({ vid: 'n', origen: 'local', nuevo: true })] })
    expect(origenesVendibles(s)).toEqual(['deposito'])
  })
})

describe('crearVentas · orquestación secuencial', () => {
  it('envía un pedido por origen EN ORDEN y junta las ventas', async () => {
    const orden: string[] = []
    const enviar = vi.fn(async (p: PedidoVenta) => {
      orden.push(p.origen)
      return { ok: true, venta: { id: p.origen === 'deposito' ? 500 : 600, number: p.origen === 'deposito' ? 1 : 2 } }
    })
    const { ventas, errores } = await crearVentas(S, { store: 'bdi', user: 'ana', pass: 'x' }, enviar)
    expect(orden).toEqual(['deposito', 'local']) // secuencial, en orden
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

describe('anulaciones · ventaAnulada e idsParaCerrar', () => {
  it('ventaAnulada: ante duda NO cierra; cierra si no existe / inactiva / archivada', () => {
    expect(ventaAnulada(null)).toBe(false)
    expect(ventaAnulada({ ok: false })).toBe(false)
    expect(ventaAnulada({ ok: true, existe: true, active: true })).toBe(false)
    expect(ventaAnulada({ ok: true, existe: false })).toBe(true)
    expect(ventaAnulada({ ok: true, active: false })).toBe(true)
    expect(ventaAnulada({ ok: true, archived: true })).toBe(true)
  })

  it('cierra solo si TODAS las ventas están anuladas Y la devolución está completa', async () => {
    const conVentaYDevuelta = sol({
      id: 'cerrable', estado: 'cargada', ventas: { deposito: { id: 1 } },
      items: [item({ vid: 'a', qty: 1 })], devuelto: { a: 1 }, // devolución completa
    })
    const anuladaPeroSinDevolver = sol({
      id: 'no', estado: 'cargada', ventas: { deposito: { id: 2 } },
      items: [item({ vid: 'a', qty: 2 })], devuelto: { a: 1 }, // falta devolver
    })
    const consultar = vi.fn(async () => ({ ok: true, existe: false })) // todas anuladas
    const cerrar = await idsParaCerrar([conVentaYDevuelta, anuladaPeroSinDevolver], 'bdi', consultar)
    expect(cerrar).toEqual(['cerrable'])
  })

  it('no toca solicitudes sin ventas ni ya cerradas', async () => {
    const consultar = vi.fn(async () => ({ ok: true, existe: false }))
    const cerrar = await idsParaCerrar([sol({ id: 'x' }), sol({ id: 'y', estado: 'cerrada', ventas: { deposito: { id: 1 } } })], 'bdi', consultar)
    expect(cerrar).toEqual([])
    expect(consultar).not.toHaveBeenCalled()
  })
})
