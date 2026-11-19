import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-fetch', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '@/lib/api-fetch'
import { avisarALogistica, ESPERAS_AVISO_MS } from '@/lib/crm/logistica'

/**
 * El aviso a Logística después de guardar un pedido ya mandado a preparar (Ger 19-nov): `POST …/refresh` vía la puerta del
 * monitor (`traer`). Reintenta a los 1, 2 y 4 s si Logística no contesta o todavía no lo ve; un error de token o de límite corta.
 */
const mockFetch = vi.mocked(apiFetch)
const responder = (...respuestas: Array<[number, unknown]>) => {
  const salidas: unknown[] = []
  mockFetch.mockImplementation(async (u, init) => {
    if (!init?.body) throw new Error('apiFetch sin cuerpo')
    salidas.push(JSON.parse(String(init.body)))
    const [status, cuerpo] = respuestas[Math.min(salidas.length - 1, respuestas.length - 1)]
    return new Response(JSON.stringify(cuerpo), { status })
  })
  return salidas
}
beforeEach(() => { mockFetch.mockReset() })

describe('avisarALogistica', () => {
  it('llega al primer intento ⇒ una sola llamada, con el número del ERP', async () => {
    const salidas = responder([200, { result: 'updated', pedido: { id: 9, status: { code: 'pendiente' } } }])
    const esperas: number[] = []
    expect((await avisarALogistica(120, async (ms) => { esperas.push(ms) })).t).toBe('llego')
    expect(salidas).toEqual([{ action: 'traer', numero: 120 }])
    expect(esperas).toEqual([])
  })
  it('Logística caída ⇒ reintenta a los 1, 2 y 4 s y lo deja', async () => {
    const salidas = responder([502, { error: 'upstream' }])
    const esperas: number[] = []
    expect((await avisarALogistica(120, async (ms) => { esperas.push(ms) })).t).toBe('todavia')
    expect(ESPERAS_AVISO_MS).toEqual([1000, 2000, 4000])
    expect(esperas).toEqual([1000, 2000, 4000])
    expect(salidas).toHaveLength(4)
  })
  it('sale bien al segundo ⇒ ⛔ sigue', async () => {
    const salidas = responder([502, {}], [200, { result: 'unchanged', pedido: { id: 9, status: { code: 'pendiente' } } }])
    expect((await avisarALogistica(120, async () => {})).t).toBe('llego')
    expect(salidas).toHaveLength(2)
  })
  it('token o límite (401/429) ⇒ corta sin reintentar', async () => {
    const salidas = responder([429, { error: 'límite' }])
    expect((await avisarALogistica(120, async () => {})).t).toBe('error')
    expect(salidas).toHaveLength(1)
  })
})
