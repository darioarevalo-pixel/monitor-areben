import { describe, it, expect, vi, beforeEach } from 'vitest'

const respuestas: Array<unknown> = []
const llamadas: Array<{ url: string; body?: unknown }> = []
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: async (url: string, opts?: { body?: string }) => {
    llamadas.push({ url, body: opts?.body ? JSON.parse(opts.body) : undefined })
    const r = respuestas.shift()
    if (r instanceof Error) throw r
    return { json: async () => r }
  },
}))

const mem: Record<string, string> = {}
beforeEach(() => {
  respuestas.length = 0
  llamadas.length = 0
  for (const k of Object.keys(mem)) delete mem[k]
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => (mem[k] = v),
  })
})

describe('No va recordado', () => {
  it('sin tabla, queda en el teléfono y se lee de ahí', async () => {
    const { leerNoVa, marcarNoVa } = await import('@/lib/conteo-estandar/no-va')
    respuestas.push({ ok: false, falta_tabla: true })
    expect(await marcarNoVa('zattia', { clave: 'i1' }, true)).toBe(false)
    respuestas.push({ ok: false, falta_tabla: true, claves: [] })
    const r = await leerNoVa('zattia')
    expect(r.enServidor).toBe(false)
    expect([...r.claves]).toEqual(['i1'])
  })
  it('con la tabla creada, sube lo del teléfono una vez y lo limpia', async () => {
    const { leerNoVa } = await import('@/lib/conteo-estandar/no-va')
    mem['monitor_colgar_nova_zattia'] = JSON.stringify(['i1'])
    respuestas.push({ ok: true, claves: ['i2'] }, { ok: true })
    const r = await leerNoVa('zattia')
    expect(r.enServidor).toBe(true)
    expect([...r.claves].sort()).toEqual(['i1', 'i2'])
    expect(llamadas[1].body).toMatchObject({ store: 'zattia', clave: 'i1' })
    expect(JSON.parse(mem['monitor_colgar_nova_zattia'])).toEqual([])
  })
  it('desmarcar manda quitar', async () => {
    const { marcarNoVa } = await import('@/lib/conteo-estandar/no-va')
    respuestas.push({ ok: true })
    expect(await marcarNoVa('zattia', { clave: 'i1' }, false)).toBe(true)
    expect(llamadas[0].body).toMatchObject({ clave: 'i1', action: 'quitar' })
  })
})
