import { describe, it, expect, vi } from 'vitest'
import { leerEstado, guardarEstado } from '../scripts/lib/sync-state.mjs'

/**
 * El helper que reemplaza los .last-sync en disco. Lo que se prueba es lo que el
 * bug rompía: que el estado PERSISTA entre corridas, y que degrade sin la tabla
 * en vez de romper.
 */

/* Los mocks implementan solo el sub-set de la interfaz de Supabase que el helper
   usa (from → select/eq/maybeSingle/upsert). El helper está tipado como .mjs sin
   tipos, así que `any` acá es fiel: no hay contrato de TS que romper. */

/** Mock del client de Supabase con una tabla sync_state en memoria. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockConTabla(): any {
  const store: Record<string, { ventas_date: string | null; productos_date: string | null }> = {}
  return {
    store,
    from() {
      let clave = ''
      return {
        select() { return this },
        eq(_col: string, val: string) { clave = val; return this },
        async maybeSingle() { return { data: store[clave] || null, error: null } },
        async upsert(row: { clave: string; ventas_date: string | null; productos_date: string | null }) {
          store[row.clave] = { ventas_date: row.ventas_date, productos_date: row.productos_date }
          return { error: null }
        },
      }
    },
  }
}

/** Mock que simula que la tabla NO existe todavía (PostgREST 205). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSinTabla(): any {
  return {
    from() {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() { return { data: null, error: { code: 'PGRST205', message: 'no table' } } },
        async upsert() { return { error: { code: 'PGRST205', message: 'no table' } } },
      }
    },
  }
}

describe('sync-state con la tabla presente', () => {
  it('el estado persiste entre corridas (esto es lo que el bug rompía)', async () => {
    const sb = mockConTabla()
    expect(await leerEstado(sb, 'diario')).toEqual({ ventasDate: null, productosDate: null })

    await guardarEstado(sb, 'diario', { ventasDate: '2026-07-17', productosDate: '2026-07-10' })
    expect(await leerEstado(sb, 'diario')).toEqual({ ventasDate: '2026-07-17', productosDate: '2026-07-10' })
  })

  it('BDI y Zattia no se pisan aunque compartan la clave (son bases distintas)', async () => {
    const bdi = mockConTabla()
    const zattia = mockConTabla()
    await guardarEstado(bdi, 'diario', { ventasDate: '2026-07-17', productosDate: '2026-07-17' })
    await guardarEstado(zattia, 'diario', { ventasDate: '2026-01-01', productosDate: null })
    expect((await leerEstado(bdi, 'diario')).ventasDate).toBe('2026-07-17')
    expect((await leerEstado(zattia, 'diario')).ventasDate).toBe('2026-01-01')
  })

  it('el sync semanal de productos deja de correr todos los días', async () => {
    // Réplica de la decisión de sync-diario.js:413.
    const sb = mockConTabla()
    await guardarEstado(sb, 'diario', { ventasDate: '2026-07-10', productosDate: '2026-07-10' })
    const st = await leerEstado(sb, 'diario')
    const daysBetween = (a: string, b: string) => Math.abs(+new Date(a) - +new Date(b)) / 86400000
    const pendienteAlDiaSiguiente = !st.productosDate || daysBetween(st.productosDate, '2026-07-11') >= 7
    const pendienteA8Dias = !st.productosDate || daysBetween(st.productosDate, '2026-07-18') >= 7
    expect(pendienteAlDiaSiguiente).toBe(false) // antes era SIEMPRE true → corría cada día
    expect(pendienteA8Dias).toBe(true) // a los 7+ días sí, que es lo que se quería
  })
})

describe('sync-state sin la tabla (degradación)', () => {
  it('leer cae al default en vez de romper', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await leerEstado(mockSinTabla(), 'diario')).toEqual({ ventasDate: null, productosDate: null })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('guardar no tira (el sync ya trajo los datos; la próxima corrida barre de más)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(guardarEstado(mockSinTabla(), 'diario', { ventasDate: '2026-07-17', productosDate: null })).resolves.toBeUndefined()
    warn.mockRestore()
  })
})
