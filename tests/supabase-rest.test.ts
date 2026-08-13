import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAll } from '@/lib/supabase/rest'
import type { Cuenta } from '@/lib/cuentas'

/**
 * `fetchAll` es por donde entra **todo** lo que el Monitor muestra: las seis tablas del ETL pasan
 * por acá (`lib/datos.ts:147-196`). No tenía test.
 *
 * Se le cambió el motor el 13-ago-2026 —de "todas las páginas de una" a tandas de 6— y lo que hay
 * que fijar es que el cambio no se note en el resultado: **mismas filas, en el mismo orden**. Una
 * regresión de orden acá no rompe ninguna pantalla, corre los números.
 */

/** Una base falsa de `n` filas que responde `limit`/`offset` como lo hace PostgREST. */
function supabaseCon(n: number) {
  const llamadas: number[] = []
  let enVueloAhora = 0
  let picoEnVuelo = 0

  const fetchFalso = vi.fn(async (url: string) => {
    const limit = Number(new URL(url).searchParams.get('limit'))
    const offset = Number(new URL(url).searchParams.get('offset'))
    llamadas.push(offset)
    enVueloAhora++
    picoEnVuelo = Math.max(picoEnVuelo, enVueloAhora)
    // Un tick real: sin esto todas las promesas se resolverían antes de que la siguiente arranque
    // y el pico medido sería siempre 1, o sea que el test no probaría nada.
    await new Promise((r) => setTimeout(r, 1))
    enVueloAhora--
    const filas = Array.from({ length: Math.max(0, Math.min(limit, n - offset)) }, (_, i) => ({ id: offset + i }))
    return {
      ok: true,
      headers: { get: (h: string) => (h === 'Content-Range' ? `${offset}-${offset + filas.length - 1}/${n}` : null) },
      json: async () => filas,
      text: async () => '',
    }
  })

  vi.stubGlobal('fetch', fetchFalso)
  return { llamadas, pico: () => picoEnVuelo, fetchFalso }
}

const CUENTA: Cuenta = { nombre: 'test', url: 'https://x.supabase.co', key: 'k', syncWorkflow: 'w.yml' }
const traer = (params = 'select=id') => fetchAll<{ id: number }>(CUENTA, 'ventas', params)

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('fetchAll: trae la tabla entera, en orden', () => {
  it('con menos de una página no pide una segunda', async () => {
    const { llamadas } = supabaseCon(300)
    expect(await traer()).toHaveLength(300)
    expect(llamadas).toEqual([0])
  })

  it('con exactamente una página tampoco', async () => {
    // El borde que se rompe solo: 1000 filas justas. `first.length >= total` corta bien.
    const { llamadas } = supabaseCon(1000)
    expect(await traer()).toHaveLength(1000)
    expect(llamadas).toEqual([0])
  })

  it('con una página y monedas sueltas trae las dos', async () => {
    const { llamadas } = supabaseCon(1001)
    expect(await traer()).toHaveLength(1001)
    expect(llamadas).toEqual([0, 1000])
  })
})

describe('fetchAll: el orden no depende de quién conteste primero', () => {
  it('7 páginas salen en orden de offset, no de llegada', async () => {
    supabaseCon(6500)
    const filas = await traer()
    expect(filas).toHaveLength(6500)
    // El único chequeo que importa: la fila i tiene el id i, de punta a punta.
    expect(filas[0]!.id).toBe(0)
    expect(filas[999]!.id).toBe(999)
    expect(filas[1000]!.id).toBe(1000)
    expect(filas[6499]!.id).toBe(6499)
    expect(filas.every((f, i) => f.id === i)).toBe(true)
  })
})

describe('fetchAll: el techo de páginas en vuelo', () => {
  it('nunca hay más de 6 pedidos abiertos a la vez', async () => {
    // La regresión que este test existe para atajar. Antes esto disparaba las 100 páginas de una
    // y las 100 respuestas quedaban vivas en memoria hasta el concat final: un pico de ~2x el
    // payload. Con 14,7 MB ya molesta; al triple, Safari en iOS mata la pestaña.
    const { pico } = supabaseCon(100_000)
    const filas = await traer()
    expect(filas).toHaveLength(100_000)
    expect(pico()).toBeLessThanOrEqual(6)
  })

  it('igual las pide todas: el techo limita el paralelo, no la cobertura', async () => {
    const { llamadas } = supabaseCon(100_000)
    await traer()
    expect(llamadas).toHaveLength(100)
    expect(new Set(llamadas).size).toBe(100) // ninguna página pedida dos veces
    expect(Math.max(...llamadas)).toBe(99_000)
  })
})

describe('fetchAll: los params del llamador viajan intactos', () => {
  it('el filtro y el order se repiten en cada página', async () => {
    const { fetchFalso } = supabaseCon(2500)
    await fetchAll(CUENTA, 'ventas', 'select=id&date_sale=gte.2025-01-01&order=id')
    for (const [url] of fetchFalso.mock.calls) {
      expect(String(url)).toContain('date_sale=gte.2025-01-01')
      expect(String(url)).toContain('order=id')
    }
  })
})
