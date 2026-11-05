import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El gasto del cupo de Tienda Nube, que es compartido: cuántas lecturas hace una apertura, que la segunda
 * ⛔ gaste nada, y que un 429 se reintente en vez de romper la pantalla. Oráculo: el `fetch` contado.
 */

const puede = vi.fn(() => true)
vi.mock('../api/_auth.js', () => ({ exigirUsuario: async () => ({ name: 'x' }) }))
vi.mock('../lib/permisos.core.js', () => ({ puedeVerAlguna: () => puede() }))

const pedido = (store = 'bdi') => ({ method: 'GET', query: { store }, headers: { 'x-monitor-auth': 'sobre' } })
const respuesta = () => {
  const res = { c: 0, b: null as unknown as { ok?: boolean; error?: string }, status(c: number) { this.c = c; return this }, json(b: never) { this.b = b; return this } }
  return res
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

async function cargar(alCatalogo: (url: string) => Response) {
  vi.resetModules()
  const llamadas: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    llamadas.push(String(url))
    return String(url).includes('correoargentino') ? new Response('') : alCatalogo(String(url))
  }))
  const { default: handler } = await import('../api/_seguimiento-envios.js')
  return { handler: handler as (a: unknown, b: unknown) => Promise<unknown>, llamadas }
}

const vacio = () => json({ ok: true, ordenes: [], truncado: false })

describe('api/_seguimiento-envios.js', () => {
  beforeEach(() => puede.mockReturnValue(true))

  it('🔴 una apertura de BDI son 9 consultas al catálogo, y la segunda ⛔ gasta nada', async () => {
    const { handler, llamadas } = await cargar(vacio)
    const a = respuesta()
    await handler(pedido(), a)
    expect(a.c).toBe(200)
    expect(llamadas).toHaveLength(9)
    const b = respuesta()
    await handler(pedido(), b)
    expect(b.c).toBe(200)
    expect(llamadas).toHaveLength(9)
  })

  it('Zattia incluye Stunned en una sola consulta', async () => {
    const { handler, llamadas } = await cargar(vacio)
    await handler(pedido('zattia'), respuesta())
    expect(llamadas.filter((u) => u.includes('store=zattia'))).toHaveLength(6)
    expect(llamadas.filter((u) => u.includes('store=stunned'))).toHaveLength(1)
  })

  it('🔴 un 429 se reintenta y la pantalla ⛔ se entera', async () => {
    let primera = true
    const { handler } = await cargar(() => {
      if (primera) { primera = false; return json({ error: 'TN 429 en la lista' }, 502) }
      return vacio()
    })
    const a = respuesta()
    await handler(pedido(), a)
    expect(a.c).toBe(200)
  })

  it('si el 429 sigue, lo dice en criollo y ⛔ recuerda el error', async () => {
    let falla = true
    const { handler } = await cargar(() => (falla ? json({ error: 'TN 429 en la lista' }, 502) : vacio()))
    const a = respuesta()
    await handler(pedido(), a)
    expect(a.c).toBe(502)
    expect(a.b.error).toContain('demasiados pedidos')
    falla = false
    const b = respuesta()
    await handler(pedido(), b)
    expect(b.c).toBe(200)
  })

  it('🔴 lo recordado ⛔ se entrega sin permiso', async () => {
    const { handler } = await cargar(vacio)
    await handler(pedido(), respuesta())
    puede.mockReturnValue(false)
    const a = respuesta()
    await handler(pedido(), a)
    expect(a.c).toBe(403)
  })
})
