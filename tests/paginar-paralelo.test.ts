import { describe, it, expect } from 'vitest'
import { leerTodoEnParalelo } from '@/lib/supabase/paginar.core.js'

/**
 * **`leerTodoEnParalelo`: las páginas de mil, todas juntas.**
 *
 * 🔴 Lo que sostiene este archivo ⛔ no es la velocidad: es que **el conteo sea el guard**. El
 * `leerTodo` de siempre se entera de que terminó porque una página vuelve corta —y ese mismo gesto
 * es el que, cuando PostgREST corta en mil sin avisar, devuelve **un número más bajo con cara de
 * dato**. Acá el largo se pide de entrada y, si al final no están todas, esto **tira**.
 */

/** Una tabla falsa de `n` filas que registra qué rangos le pidieron y cuándo. */
function tabla(n: number, opciones: { desapareceEnElMedio?: number } = {}) {
  const pedidos: { desde: number; hasta: number; conteo: boolean; t: number }[] = []
  const T0 = Date.now()
  let vivas = n
  const sb = {
    from: () => {
      let conteo = false
      const api: Record<string, unknown> = {
        select: (_cols: string, opts?: { count?: string }) => {
          conteo = opts?.count === 'exact'
          return api
        },
        in: () => api,
        gte: () => api,
        order: () => api,
        range: async (desde: number, hasta: number) => {
          pedidos.push({ desde, hasta, conteo, t: Date.now() - T0 })
          await new Promise((r) => setTimeout(r, 40))
          if (opciones.desapareceEnElMedio && pedidos.length === opciones.desapareceEnElMedio) vivas = n - 1
          const data = []
          for (let i = desde; i <= Math.min(hasta, vivas - 1); i++) data.push({ id: i })
          return { data, count: conteo ? n : null, error: null }
        },
      }
      return api
    },
  }
  return { sb, pedidos }
}

const armar = (q: Record<string, (...a: unknown[]) => unknown>, opts: unknown) =>
  q.select('id', opts) as never

describe('leerTodoEnParalelo', () => {
  it('una sola página: ⛔ no pide nada más', async () => {
    const { sb, pedidos } = tabla(300)
    const filas = await leerTodoEnParalelo(sb, 't', armar)
    expect(filas).toHaveLength(300)
    expect(pedidos).toHaveLength(1)
  })

  it('🔴 5.311 filas: 6 páginas, y las 5 que faltan salen JUNTAS', async () => {
    const { sb, pedidos } = tabla(5311)
    const filas = await leerTodoEnParalelo(sb, 't', armar)

    expect(filas).toHaveLength(5311)
    expect(pedidos).toHaveLength(6)
    // 🔑 El oráculo es CUÁNDO se pidieron, ⛔ no cuántas: de a una también darían 6.
    const [primera, ...resto] = pedidos
    expect(primera.conteo).toBe(true)
    expect(resto.every((p) => !p.conteo)).toBe(true)
    expect(Math.max(...resto.map((p) => p.t)) - Math.min(...resto.map((p) => p.t))).toBeLessThan(20)
    // Y ninguna fila repetida ni salteada.
    expect(new Set(filas.map((f: { id: number }) => f.id)).size).toBe(5311)
  })

  it('🔴 si al final faltan filas, TIRA — ⛔ no devuelve un número más bajo', async () => {
    // Una purga en el medio de la lectura: el conteo dijo 3.000 y llegan 2.999.
    const { sb } = tabla(3000, { desapareceEnElMedio: 1 })
    await expect(leerTodoEnParalelo(sb, 't', armar)).rejects.toThrow(/se esperaban 3000 .* 2999/)
  })
})
