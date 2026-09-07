/**
 * **Lo que se le manda a `crear-venta`** cuando una unidad sale del stock por post-venta.
 *
 * 🔴 Existe por la lección del 26-ago-2026: el defecto de `destinoDe` —que contestaba `'falla'`
 * para todos los casos en que el producto no vuelve— vivía en la LLAMADA, no en el núcleo, y por
 * eso se pudo cambiar sin poner un solo test en rojo. Acá se mira el cuerpo del pedido: a qué
 * cliente de Gestión Nube va la plata y qué dice la nota, que es lo que después alguien lee en GN.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { descontarRegaladas, descontarReemplazo } from '@/lib/reclamos/cliente'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/** Todo lo que se mandó, en orden, para poder mirar el pedido a crear-venta y no el resto. */
const pedidos: Record<string, unknown>[] = []

function stubGN() {
  pedidos.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    pedidos.push({ url, ...body })
    return { ok: true, status: 200, json: async () => ({ ok: true, venta: { id: '99', number: '1358100' } }) }
  }))
}

const ventaA = (proposito: string) => pedidos.find((p) => p.proposito === proposito) as Record<string, string>

/** Un reclamo por falla donde el cliente se queda con una unidad SANA (la de más que le mandamos). */
const REGALADA: ReclamoRow = {
  id: 12, store: 'bdi', numero: 'R-0012', orden_tn: '1187', cliente: 'Lautaro Mora',
  motivo: 'excedente', estado: 'en_revision', destino_prenda: 'regalada',
  items: [{ producto: 'Campera', sku: 'CAM-01', product_id: '77', size_id: '3', cantidad: 1, precio: 10000 }],
  stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
} as ReclamoRow

afterEach(() => vi.unstubAllGlobals())

describe('la venta técnica que saca la unidad del stock', () => {
  it('la unidad SANA va al cliente RECLAMO de GN, ⛔ no al de Fallas', async () => {
    stubGN()
    await descontarRegaladas('bdi', REGALADA, { usuario: 'bruno', cred: { user: 'bruno', pass: 'x' } })
    expect(ventaA('reclamo')).toBeTruthy()
    expect(pedidos.some((p) => p.proposito === 'falla')).toBe(false)
  })

  it('y su nota lo dice: producto SANO, con el reclamo, la orden y el cliente de verdad', async () => {
    stubGN()
    await descontarRegaladas('bdi', REGALADA, { usuario: 'bruno', cred: { user: 'bruno', pass: 'x' } })
    const nota = ventaA('reclamo').comments
    expect(nota).toContain('Reclamo R-0012')
    expect(nota).toContain('producto sano')
    expect(nota).toContain('Orden TN: 1187')
    expect(nota).toContain('Lautaro Mora')
    expect(nota).toContain('Decidió: bruno')
  })

  it('el reemplazo que se le manda dice que es un reemplazo, no que se lo queda', async () => {
    stubGN()
    await descontarReemplazo('bdi', { ...REGALADA, motivo: 'falla' }, { usuario: 'bruno', cred: { user: 'bruno', pass: 'x' } })
    const nota = ventaA('falla').comments
    expect(nota).toContain('reemplazo que se le manda')
    expect(nota).not.toContain('producto sano')
  })

  it('la nota entra en el campo de GN aunque el reclamo venga con todo cargado', async () => {
    stubGN()
    await descontarRegaladas('bdi', { ...REGALADA, cliente: 'M'.repeat(300) }, { usuario: 'bruno', cred: { user: 'bruno', pass: 'x' } })
    expect(String(ventaA('reclamo').comments).length).toBeLessThan(500)
  })

  /**
   * 🔴 **El 403 del 7-sep-2026**: «No se pudo crear la venta del cambio en GN — Necesitás estar
   * logueado en el Monitor». Quien entró con Google ⛔ no tiene contraseña que mandar, y estas
   * escrituras armaban el cuerpo con `{user, pass}` fijo ⇒ salía con los dos vacíos y
   * `crear-venta` contestaba 403 con la sesión perfectamente viva.
   *
   * 🔑 El oráculo es **el cuerpo del pedido**, ⛔ no que la función no tire: sin el token adentro
   * el 403 lo pone el servidor, que acá está mockeado y siempre dice que sí.
   */
  it('la sesión de Google manda el TOKEN en el pedido, y ⛔ no un usuario y contraseña vacíos', async () => {
    stubGN()
    await descontarRegaladas('bdi', REGALADA, { usuario: 'Lorena', cred: { token: 'jwt-de-google' } })
    const pedido = ventaA('reclamo') as unknown as Record<string, unknown>
    expect(pedido.token).toBe('jwt-de-google')
    expect('pass' in pedido).toBe(false)
    // El nombre del padrón sigue firmando la nota: la credencial y la firma son dos cosas.
    expect(String(pedido.comments)).toContain('Decidió: Lorena')
  })
})
