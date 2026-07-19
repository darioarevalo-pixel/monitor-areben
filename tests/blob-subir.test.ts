import { describe, it, expect, vi, afterEach } from 'vitest'
import { subirBlob } from '@/lib/imagenes'

/**
 * `subirBlob` es la única parte de la migración base64→Blob que se puede probar en
 * el env `node` (imgAThumb/cargarImg necesitan FileReader/canvas del browser). Lo
 * que importa: que traduzca bien la respuesta del endpoint a "devuelvo la URL" vs
 * "lanzo", para que el llamador (imgAThumbYSubir) sepa cuándo caer al base64.
 */

const resp = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})
const noJson = (status: number) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => { throw new Error('no es JSON') },
})

const DATA_URL = 'data:image/jpeg;base64,AAAA'
type Opts = { method?: string; body?: string }
const mockFetch = (impl: (url: string, opts: Opts) => Promise<unknown>) => {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('subirBlob', () => {
  it('devuelve la URL cuando el server confirma ok con url', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(resp(200, { ok: true, url: 'https://blob.example/fundas/foto-x.jpg' })))
    await expect(subirBlob(DATA_URL, 'fundas')).resolves.toBe('https://blob.example/fundas/foto-x.jpg')
    // POST al endpoint con el dataUrl y el prefix en el body.
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe('/api/blob-upload')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body!)).toEqual({ dataUrl: DATA_URL, prefix: 'fundas' })
  })

  it('manda el prefix ingresos cuando corresponde', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(resp(200, { ok: true, url: 'https://blob.example/ingresos/foto.jpg' })))
    await subirBlob(DATA_URL, 'ingresos')
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body!).prefix).toBe('ingresos')
  })

  it('lanza si el Blob no está configurado (500)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(resp(500, { error: 'Blob no configurado' }))))
    await expect(subirBlob(DATA_URL, 'fundas')).rejects.toThrow(/Blob no configurado/)
  })

  it('lanza si el server responde ok pero sin url', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(resp(200, { ok: true }))))
    await expect(subirBlob(DATA_URL, 'fundas')).rejects.toThrow()
  })

  it('lanza ante respuesta no-JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(noJson(502))))
    await expect(subirBlob(DATA_URL, 'fundas')).rejects.toThrow(/no-JSON/)
  })

  it('propaga el error de red', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))))
    await expect(subirBlob(DATA_URL, 'fundas')).rejects.toThrow(/network/)
  })
})
