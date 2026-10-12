import { describe, it, expect } from 'vitest'
import { anuladasEnGN, anotarAnuladasDelRegistro } from '@/scripts/lib/registro-anuladas.mjs'

/**
 * El sync diario anota como anuladas las ventas del registro del monitor que GN ya no devuelve
 * (`scripts/lib/registro-anuladas.mjs`, libro de stock 13-oct-2026).
 */

const corte = new Date('2026-10-14T09:40:00Z')
const fila = (id: number, creada_en = '2026-10-13T15:00:00Z') => ({ gn_venta_id: id, gn_number: String(id + 1000), creada_en })

/** Un Supabase de mentira: guarda los filtros de la lectura y lo que se actualizó. */
function sbFalso(filas: ReturnType<typeof fila>[], error: { message: string } | null = null) {
  const hecho = { lectura: [] as string[], update: null as Record<string, unknown> | null, ids: [] as number[] }
  const cadena = {
    select() { return cadena }, is(c: string) { hecho.lectura.push(`is:${c}`); return cadena },
    gte(c: string, v: string) { hecho.lectura.push(`gte:${c}:${v}`); return cadena },
    lt(c: string, v: string) { hecho.lectura.push(`lt:${c}:${v}`); return cadena },
    limit() { return Promise.resolve({ data: filas, error }) },
  }
  const sb = {
    from() {
      return {
        ...cadena,
        update(u: Record<string, unknown>) {
          hecho.update = u
          return { in(_c: string, ids: number[]) { hecho.ids = ids; return { is: () => Promise.resolve({ error: null }) } } }
        },
      }
    },
  }
  return { sb, hecho }
}

describe('anuladasEnGN', () => {
  it('lo que GN no devolvió, salvo lo creado en los 15 minutos antes de la bajada', () => {
    const r = anuladasEnGN([fila(1), fila(2), fila(3, '2026-10-14T09:30:00Z')], new Set([2]), corte)
    expect(r.map((f) => f.gn_venta_id)).toEqual([1])
  })
})

describe('anotarAnuladasDelRegistro', () => {
  it('anota las que faltan, sólo del tramo de repaso y anteriores a la bajada', async () => {
    const { sb, hecho } = sbFalso([fila(1), fila(2)])
    const r = await anotarAnuladasDelRegistro(sb, new Set([2]), '2026-07-16', corte, { ahora: new Date('2026-10-14T09:50:00Z') })
    expect(r).toEqual({ anotadas: 1 })
    expect(hecho.ids).toEqual([1])
    expect(hecho.update).toMatchObject({ anulada_por: 'sync', anulada_en: '2026-10-14T09:50:00.000Z' })
    expect(hecho.lectura).toEqual(['is:anulada_en', 'gte:creada_en:2026-07-16T03:00:00.000Z', 'lt:creada_en:2026-10-14T09:40:00.000Z'])
  })

  it('🔴 más de `tope` de golpe es una bajada incompleta: ⛔ se anota ninguna', async () => {
    const { sb, hecho } = sbFalso([fila(1), fila(2), fila(3)])
    const r = await anotarAnuladasDelRegistro(sb, new Set(), '2026-07-16', corte, { tope: 2 })
    expect(r.anotadas).toBe(0)
    expect(r.frenado).toMatch(/3 ventas/)
    expect(hecho.update).toBeNull()
  })

  it('una base sin la migración no es un error', async () => {
    const { sb } = sbFalso([], { message: 'relation "public.gn_venta_monitor" does not exist' })
    expect(await anotarAnuladasDelRegistro(sb, new Set(), '2026-07-16', corte)).toEqual({ anotadas: 0 })
  })

  it('otro error de la base sí sube', async () => {
    const { sb } = sbFalso([], { message: 'timeout' })
    await expect(anotarAnuladasDelRegistro(sb, new Set(), '2026-07-16', corte)).rejects.toThrow('timeout')
  })
})
