import { describe, expect, it, vi } from 'vitest'
import { ponerRedondeoErp, redondeoDeMarca } from '@/api/_erp-redondeo.js'

/** Un `pg` falso que contesta por el texto de la consulta: lo que importa es qué se le PIDE al motor y qué se contesta. */
function pgFalso({ hay = true, ya = false } = {}) {
  const consultas: Array<{ sql: string; p?: unknown[] }> = []
  const pg = {
    query: vi.fn(async (sql: string, p?: unknown[]) => {
      consultas.push({ sql, p })
      if (sql.includes('to_regclass')) return { rows: [{ hay }] }
      if (sql.includes('from redondeo where marca = $1 order by canal')) return { rows: [{ id: '1', marca: p?.[0], canal: 'mayorista', paso: 100, modo: 'cercano', desde: '2026-10-01T00:00:00Z', puesto_por: 'x', puesto_en: '2026-10-01T00:00:00Z' }] }
      if (sql.includes('from redondeo where marca = any')) return { rows: [{ id: '1', marca: 'zattia', canal: 'mayorista', paso: 100, modo: 'cercano', desde: '2026-10-01T00:00:00Z', puesto_por: 'x', puesto_en: '2026-10-01T00:00:00Z' }] }
      if (sql.includes('from marca')) return { rows: [{ empresa_id: 'e' }] }
      if (sql.includes('from canal')) return { rows: [{ id: p?.[0] }] }
      if (sql.includes('insert into redondeo')) return { rows: ya ? [] : [{ id: '9' }] }
      return { rows: [] }
    }),
  }
  return { pg, consultas, deps: { conMotor: async (_m: string, _q: string, f: (pg: unknown) => unknown) => f(pg) } }
}

describe('redondeoDeMarca', () => {
  it('marca inválida ⇒ 400, sin tocar la base', async () => {
    const { deps, pg } = pgFalso()
    expect(await redondeoDeMarca({ marca: 'otra' }, deps)).toMatchObject({ status: 400 })
    expect(pg.query).not.toHaveBeenCalled()
  })
  it('sin la tabla (falta la 029) ⇒ 409 con el motivo', async () => {
    const { deps } = pgFalso({ hay: false })
    expect(await redondeoDeMarca({ marca: 'zattia' }, deps)).toMatchObject({ status: 409 })
  })
  it('Zattia trae también la línea de Stunned, con un renglón por canal', async () => {
    const { deps } = pgFalso()
    const r = await redondeoDeMarca({ marca: 'zattia' }, deps) as { lineas: Array<{ linea: string; filas: unknown[] }>; historial: unknown[] }
    expect(r.lineas.map((l) => l.linea)).toEqual(['zattia', 'stunned'])
    expect(r.lineas[0].filas).toHaveLength(4)
    expect(r.historial).toHaveLength(1)
  })
})

describe('ponerRedondeoErp', () => {
  const body = { canal: 'mayorista', paso: 100, modo: 'cercano' }
  it('pone el redondeo con el usuario que lo pidió', async () => {
    const { deps, consultas } = pgFalso()
    expect(await ponerRedondeoErp({ marca: 'bdi', body, usuario: 'Bruno' }, deps)).toEqual({ ok: true, id: '9' })
    const ins = consultas.find((c) => c.sql.includes('insert into redondeo'))
    expect(ins?.p).toEqual(['e', 'bdi', 'mayorista', 100, 'cercano', expect.any(Date), 'Bruno'])
  })
  it('el cuerpo mal formado se frena ANTES de la base', async () => {
    const { deps, pg } = pgFalso()
    expect(await ponerRedondeoErp({ marca: 'bdi', body: { ...body, paso: 7 }, usuario: 'x' }, deps)).toMatchObject({ status: 400, campo: 'paso' })
    expect(pg.query).not.toHaveBeenCalled()
  })
  it('un redondeo ya puesto para ese momento ⇒ 409, el pasado ⇒ 400 con el campo', async () => {
    expect(await ponerRedondeoErp({ marca: 'bdi', body, usuario: 'x' }, pgFalso({ ya: true }).deps)).toMatchObject({ status: 409, campo: 'desde' })
    expect(await ponerRedondeoErp({ marca: 'bdi', body: { ...body, desde: '2020-01-01T00:00:00Z' }, usuario: 'x' }, pgFalso().deps)).toMatchObject({ status: 400, campo: 'desde' })
  })
})
