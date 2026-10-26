import { describe, expect, it } from 'vitest'
import { avisosAlTildar } from '../lib/agenda/aviso-terminado.core.js'

const hoy = '2026-10-20'
const tarea = (id: string, extra: Record<string, unknown> = {}) => ({
  id, clase: 'pendiente', titulo: `Tarea ${id}`, activo: true, marcas: [], autor: 'Lorena Reyes',
  regla: { tipo: 'unica', fecha: hoy }, destino: { tipo: 'personas', personas: ['camilaquintana'] }, datos: {}, ...extra,
})
const hecho = (id: string) => ({ item_id: id, fecha: hoy, usuario: 'camilaquintana', hecho_at: `${hoy}T15:00:00Z` })
const base = { yo: 'camilaquintana', fecha: hoy, hoy, para: ['Dario Arevalo'] }

describe('avisosAlTildar', () => {
  it('avisa cuando termina la última del día, y no antes', () => {
    const items = [tarea('a'), tarea('b')]
    expect(avisosAlTildar({ ...base, item: items[0], items, hechos: [hecho('a')] })).toEqual([])
    const r = avisosAlTildar({ ...base, item: items[1], items, hechos: [hecho('a'), hecho('b')] })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ para: ['Dario Arevalo'], titulo: '✅ Camila: tareas listas', cuerpo: '2 de 2 hechas.' })
  })

  it('la importante avisa al momento, a Darío y a quien la cargó', () => {
    const items = [tarea('a', { datos: { importante: true } }), tarea('b')]
    const r = avisosAlTildar({ ...base, item: items[0], items, hechos: [hecho('a')] })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ para: ['Dario Arevalo', 'Lorena Reyes'], cuerpo: 'Tarea a' })
  })

  it('una atrasada de ayer no cierra el día', () => {
    const items = [tarea('a')]
    expect(avisosAlTildar({ ...base, fecha: '2026-10-19', item: items[0], items, hechos: [] })).toEqual([])
  })

  it('a quien tildó no se le avisa lo suyo', () => {
    const items = [tarea('a', { datos: { importante: true }, autor: 'Dario Arevalo' })]
    expect(avisosAlTildar({ ...base, yo: 'Dario Arevalo', item: items[0], items, hechos: [] })).toEqual([])
  })
})
