import { describe, it, expect } from 'vitest'
import { anuladasAMarcar, TOPE_ANULADAS } from '@/lib/caja/cierre.core.js'
import { anotarAnuladasDeCaja, anotarAnuladasDelCierre } from '@/lib/caja/anuladas.js'

/**
 * La venta de la Caja que GN ya ⛔ tiene queda anotada en `caja_venta.anulada_en_gn` (libro de stock,
 * 12-oct-2026): la marcan el cierre del turno y el sync diario, con el modelo de
 * `scripts/lib/registro-anuladas.mjs` (margen de 15 min, tope de 20).
 */

const corte = new Date('2026-10-13T09:40:00Z')
const venta = (id: string, gn: number, creada_en = '2026-10-12T15:00:00Z', extra: Record<string, unknown> = {}) =>
  ({ id, estado: 'en_gn', gn_sale_id: gn, gn_number: gn + 1000, creada_en, en_gn_en: null, anulada_en_gn: null, ...extra })

describe('anuladasAMarcar', () => {
  it('anota las anteriores al margen de 15 min', () => {
    const r = anuladasAMarcar([venta('a', 1), venta('b', 2, '2026-10-13T09:30:00Z')], corte)
    expect(r).toEqual({ ids: ['a'] })
  })

  it('cuenta desde que LLEGÓ a GN: la transferencia que esperó y llegó recién ⛔ se anota', () => {
    const r = anuladasAMarcar([venta('a', 1, '2026-10-12T15:00:00Z', { en_gn_en: '2026-10-13T09:35:00Z' })], corte)
    expect(r.ids).toEqual([])
  })

  it('⛔ pisa una ya anotada ni anota una que ⛔ está en_gn', () => {
    const r = anuladasAMarcar([
      venta('a', 1, undefined, { anulada_en_gn: { por: 'cierre', en: '2026-10-12T22:00:00Z' } }),
      venta('b', 2, undefined, { estado: 'descartada' }),
    ], corte)
    expect(r.ids).toEqual([])
  })

  it(`más de ${TOPE_ANULADAS} de golpe es una respuesta rara de GN: ⛔ anota ninguna`, () => {
    const muchas = Array.from({ length: TOPE_ANULADAS + 1 }, (_, i) => venta(`v${i}`, i + 1))
    const r = anuladasAMarcar(muchas, corte)
    expect(r.ids).toEqual([])
    expect(r.frenado).toMatch(/tope 20/)
    expect(anuladasAMarcar(muchas.slice(1), corte).ids).toHaveLength(TOPE_ANULADAS)
  })
})

/** Un Supabase de mentira: guarda los filtros de la lectura y lo que se actualizó. */
function sbFalso(filas: ReturnType<typeof venta>[], error: { message: string } | null = null) {
  const hecho = { lectura: [] as string[], update: null as Record<string, unknown> | null, ids: [] as string[], guarda: '' }
  const cadena: Record<string, (...a: never[]) => unknown> = {
    select() { return cadena },
    eq(c: string, v: string) { hecho.lectura.push(`eq:${c}:${v}`); return cadena },
    not(c: string, op: string) { hecho.lectura.push(`not:${c}:${op}`); return cadena },
    is(c: string) { hecho.lectura.push(`is:${c}`); return cadena },
    gte(c: string, v: string) { hecho.lectura.push(`gte:${c}:${v}`); return cadena },
    lt(c: string, v: string) { hecho.lectura.push(`lt:${c}:${v}`); return cadena },
    in(c: string, ids: string[]) { hecho.lectura.push(`in:${c}:${ids.length}`); return Promise.resolve({ data: filas, error }) },
    limit() { return Promise.resolve({ data: filas, error }) },
  }
  const sb = {
    from() {
      return {
        ...cadena,
        update(u: Record<string, unknown>) {
          hecho.update = u
          return { in(_c: string, ids: string[]) { hecho.ids = ids; return { is: (c: string) => { hecho.guarda = c; return Promise.resolve({ error: null }) } } } }
        },
      }
    },
  }
  return { sb, hecho }
}

describe('anotarAnuladasDeCaja (el sync diario)', () => {
  const ahora = new Date('2026-10-13T09:50:00Z')

  it('anota con `por: sync` las en_gn que GN ⛔ devolvió, y sólo si siguen sin anotar', async () => {
    const { sb, hecho } = sbFalso([venta('a', 1), venta('b', 2)])
    const r = await anotarAnuladasDeCaja(sb, new Set([2]), '2026-07-15', corte, { ahora })
    expect(r).toEqual({ anotadas: 1, numeros: [1001] })
    expect(hecho.update).toEqual({ anulada_en_gn: { por: 'sync', en: '2026-10-13T09:50:00.000Z' } })
    expect(hecho.ids).toEqual(['a'])
    expect(hecho.guarda).toBe('anulada_en_gn')
    expect(hecho.lectura).toEqual([
      'eq:estado:en_gn', 'not:gn_sale_id:is', 'is:anulada_en_gn',
      'gte:creada_en:2026-07-15T03:00:00.000Z', `lt:creada_en:${corte.toISOString()}`,
    ])
  })

  it('base sin la migración: ⛔ es un error, lo dice', async () => {
    const { sb, hecho } = sbFalso([], { message: 'column caja_venta.anulada_en_gn does not exist' })
    expect(await anotarAnuladasDeCaja(sb, new Set(), '2026-07-15', corte)).toEqual({ anotadas: 0, sinColumna: true })
    expect(hecho.update).toBeNull()
  })

  it('otro error de la base sí tira', async () => {
    const { sb } = sbFalso([], { message: 'timeout' })
    await expect(anotarAnuladasDeCaja(sb, new Set(), '2026-07-15', corte)).rejects.toThrow('timeout')
  })
})

describe('anotarAnuladasDelCierre', () => {
  it('anota con `por: cierre` las que el resumen dio por anuladas', async () => {
    const { sb, hecho } = sbFalso([venta('a', 1)])
    const r = await anotarAnuladasDelCierre(sb, ['a'], corte, { ahora: corte })
    expect(r.anotadas).toBe(1)
    expect(hecho.update).toEqual({ anulada_en_gn: { por: 'cierre', en: corte.toISOString() } })
  })

  it('sin anuladas ⛔ lee la base', async () => {
    const { sb, hecho } = sbFalso([venta('a', 1)])
    expect(await anotarAnuladasDelCierre(sb, [], corte)).toEqual({ anotadas: 0 })
    expect(hecho.lectura).toEqual([])
  })
})
