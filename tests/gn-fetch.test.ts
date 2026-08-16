/**
 * El cliente de Gestión Nube compartido (`scripts/lib/gn-fetch.mjs`).
 *
 * 🔑 **Lo que defiende este archivo es el `try/catch` alrededor del `fetch`**, que faltaba en cinco
 * de las diez copias que había. Un error de red no es un `res.status`: `fetch` **tira**, así que un
 * reintento escrito sobre `res.status >= 500` no lo ve nunca y el job se muere entero. Es
 * exactamente el caso que no cubría ningún test cuando había diez copias.
 *
 * Los tres presupuestos se prueban por separado porque son distintos y se pisaban entre sí:
 * red / 5xx gastan `intentos`, y el corte por límite de solicitudes **no**.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { crearClienteGN } from '../scripts/lib/gn-fetch.mjs'

/** Respuesta de `fetch` mínima: sólo lo que usa `gnFetch` (`status`, `ok`, `text`, `headers`). */
function respuesta(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  }
}

const original = globalThis.fetch

afterEach(() => {
  globalThis.fetch = original
  vi.restoreAllMocks()
})

describe('crearClienteGN', () => {
  it('exige token: sin él no se puede construir', () => {
    expect(() => crearClienteGN({ token: '' })).toThrow(/token/i)
  })

  it('🔑 REINTENTA UN ERROR DE RED y devuelve el dato del segundo intento', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const llamadas: string[] = []
    globalThis.fetch = vi.fn(async (url: string) => {
      llamadas.push(url)
      if (llamadas.length === 1) throw new TypeError('fetch failed')
      return respuesta(200, { data: [{ id: 7 }] })
    }) as unknown as typeof fetch

    // `intentos` explícito para no esperar los 2 s del backoff real más de una vez.
    const { gnFetch } = crearClienteGN({ token: 'tok', retries: 2 })
    const data = await gnFetch('ventas')

    expect(llamadas).toHaveLength(2)
    expect(data).toEqual({ data: [{ id: 7 }] })
  })

  it('un error de red que agota los intentos SÍ se propaga (no se traga)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('ECONNRESET')
    }) as unknown as typeof fetch

    const { gnFetch } = crearClienteGN({ token: 'tok', retries: 1 })
    await expect(gnFetch('ventas')).rejects.toThrow(/ECONNRESET/)
  })

  it('manda el token en el header y arma la URL sobre la base', async () => {
    let visto: { url?: string; auth?: string } = {}
    globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
      visto = { url, auth: (init.headers as Record<string, string>).Authorization }
      return respuesta(200, { data: [] })
    }) as unknown as typeof fetch

    const { gnFetch } = crearClienteGN({ token: 'abc123', base: 'https://ejemplo/api' })
    await gnFetch('productos?x=1')

    expect(visto.url).toBe('https://ejemplo/api/productos?x=1')
    expect(visto.auth).toBe('Bearer abc123')
  })

  it('un 4xx que no es corte NO se reintenta y sale con el mensaje de GN', async () => {
    const fetchMock = vi.fn(async () => respuesta(404, { message: 'No encontrado' }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { gnFetch } = crearClienteGN({ token: 'tok', retries: 5 })
    await expect(gnFetch('ventas/9')).rejects.toThrow('No encontrado')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('🔑 el corte por límite de solicitudes NO gasta el presupuesto de reintentos', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let n = 0
    globalThis.fetch = vi.fn(async () => {
      n++
      // Dos cortes seguidos y recién después la respuesta buena. Con `retries: 2`, si el corte
      // gastara intentos esto tiraría en vez de devolver: ése es el bug que el `attempt--` evita.
      // `retry-after: 1` a propósito: `esperaRateLimit` sólo honra el header si es **> 0**, y con
      // `0` cae al minuto por intento — este test esperaría 3 minutos y moriría por timeout.
      if (n <= 2) return respuesta(429, { message: 'Demasiadas solicitudes' }, { 'retry-after': '1' })
      return respuesta(200, { data: [{ id: 1 }] })
    }) as unknown as typeof fetch

    const { gnFetch } = crearClienteGN({ token: 'tok', retries: 2 })
    const data = await gnFetch('ventas')

    expect(n).toBe(3)
    expect(data).toEqual({ data: [{ id: 1 }] })
  })

  it('fetchAllPages pagina hasta que has_more_pages deja de venir', async () => {
    const paginas = [
      { data: [{ id: 1 }, { id: 2 }], meta: { has_more_pages: true } },
      { data: [{ id: 3 }], meta: { has_more_pages: false } },
    ]
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (url: string) => {
      urls.push(url)
      return respuesta(200, paginas[urls.length - 1])
    }) as unknown as typeof fetch
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const { fetchAllPages } = crearClienteGN({ token: 'tok' })
    const filas = await fetchAllPages('ventas', 0)

    expect(filas).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(urls[0]).toContain('page=1')
    expect(urls[1]).toContain('page=2')
  })

  it('fetchAllPages corta con página vacía aunque GN diga que hay más', async () => {
    globalThis.fetch = vi.fn(async () =>
      respuesta(200, { data: [], meta: { has_more_pages: true } }),
    ) as unknown as typeof fetch
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const { fetchAllPages } = crearClienteGN({ token: 'tok' })
    await expect(fetchAllPages('ventas', 0)).resolves.toEqual([])
  })
})
