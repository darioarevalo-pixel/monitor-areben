import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-fetch', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '@/lib/api-fetch'
import { adelantarPedidos, pedidosDelCliente } from '@/lib/crm/logistica'

const mockFetch = vi.mocked(apiFetch)

/** Responde según la acción; anota en qué orden salieron las preguntas. */
function servidor(porCliente: unknown[], porTel: unknown[]) {
  const salidas: string[] = []
  mockFetch.mockImplementation(async (_url, init) => {
    if (!init?.body) return new Response('{}', { status: 200 })
    const b = JSON.parse(String(init.body))
    salidas.push(b.action === 'cliente' ? `cliente:${b.clienteId}` : `telefono:${b.tel}`)
    const orders = b.action === 'cliente' ? porCliente : porTel
    return new Response(JSON.stringify({ orders }), { status: 200 })
  })
  return salidas
}

beforeEach(() => mockFetch.mockReset())

describe('pedidosDelCliente', () => {
  it('pregunta por cliente y por teléfono A LA VEZ, sin esperar a la primera', async () => {
    const salidas = servidor([], [{ id: 7 }])
    const p = pedidosDelCliente(10, '5493411234567')
    // Las dos salieron antes de que conteste ninguna.
    expect(salidas).toEqual(['telefono:5493411234567', 'cliente:10'])
    expect(await p).toEqual({ t: 'ok', datos: [{ id: 7 }] })
  })

  it('si el cliente tiene pedidos, gana su número (no el teléfono)', async () => {
    servidor([{ id: 1 }], [{ id: 2 }])
    expect(await pedidosDelCliente(10, '5493411234567')).toEqual({ t: 'ok', datos: [{ id: 1 }] })
  })

  it('sin teléfono, sólo por cliente; sin nada, vacío', async () => {
    const salidas = servidor([], [])
    expect(await pedidosDelCliente(10, null)).toEqual({ t: 'ok', datos: [] })
    expect(salidas).toEqual(['cliente:10'])
    expect(await pedidosDelCliente(null, null)).toEqual({ t: 'ok', datos: [] })
  })

  it('usa lo adelantado UNA vez: la siguiente vuelve a preguntar', async () => {
    const salidas = servidor([], [])
    adelantarPedidos(10, '341 123-4567')
    expect(salidas).toHaveLength(2)
    await pedidosDelCliente(10, '341 123-4567')
    expect(salidas).toHaveLength(2)
    await pedidosDelCliente(10, '341 123-4567')
    expect(salidas).toHaveLength(4)
  })

  it('un error de Logística se muestra, no se toma como «sin pedidos»', async () => {
    mockFetch.mockImplementation(async () => new Response(JSON.stringify({ error: 'caído' }), { status: 502 }))
    expect(await pedidosDelCliente(10, '5493411234567')).toEqual({ t: 'error', motivo: 'caído' })
  })
})
