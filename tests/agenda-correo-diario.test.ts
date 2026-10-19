// El correo diario de la Agenda (`lib/agenda/correo-diario.core.js`, Darío 18-oct-2026): quién del
// equipo operativo usó la Agenda hoy. Lo que importa: que «no marcó nada» y «no tenía nada cargado»
// se digan distinto, que la hora sea la de Argentina, y que la puerta sin secreto esté cerrada.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { armarCorreoDiario, hoyAR, resumirDia } from '@/lib/agenda/correo-diario.core.js'
import handler from '../api/_agenda.js'

const HOY = '2026-10-16' // viernes
const EQ = [
  { name: 'camilaquintana', nombre: 'Camila Quintana', lugar: 'Local Zattia · mañana', funcion: ['local'], cuenta: 'zattia' },
  { name: 'karenf', nombre: 'Karen Francischina', lugar: 'Local BDI · mañana', funcion: ['local'], cuenta: 'bdi' },
  { name: 'agustinapiriz', nombre: 'Agustina Piriz', lugar: 'Depósito', funcion: ['deposito'], cuenta: null },
]
const it_ = (id: string, x: Record<string, unknown> = {}) => ({
  id, clase: 'pendiente', titulo: `Tarea ${id}`, activo: true, marcas: [], datos: {},
  regla: { tipo: 'diaria' }, destino: { tipo: 'personas', personas: ['camilaquintana'] }, created_at: '2026-10-01T12:00:00Z', ...x,
})

describe('correo diario de la Agenda', () => {
  it('al día, a medias, nada y sin tareas son cuatro cosas distintas', () => {
    const items = [
      it_('a'),
      it_('b'),
      it_('c', { destino: { tipo: 'personas', personas: ['karenf'] } }),
    ]
    const hechos = [{ item_id: 'a', fecha: HOY, usuario: 'camilaquintana', hecho_at: '2026-10-16T12:15:00Z' }]
    const r = resumirDia({ hoy: HOY, items, hechos, equipo: EQ })
    expect(r.map((x) => x.estado)).toEqual(['a-medias', 'nada', 'sin-tareas'])
    expect(r[0].faltan).toEqual(['Tarea b'])
  })

  it('🔑 la hora es la de Argentina, y la «primera» sale del primer tilde', () => {
    const items = [it_('a')]
    const hechos = [{ item_id: 'a', fecha: HOY, usuario: 'camilaquintana', hecho_at: '2026-10-16T12:15:00Z' }]
    const c = armarCorreoDiario({ hoy: HOY, items, hechos, equipo: EQ.slice(0, 1) })
    expect(c.texto).toContain('1 de 1 hechas · empezó a marcar 09:15')
    expect(c.asunto).toBe('Agenda viernes 16-oct: 1 de 1 al día')
  })

  it('🔴 la marca del ítem filtra: una rutina de Zattia no le cae a BDI', () => {
    const items = [it_('z', { marcas: ['zattia'], destino: { tipo: 'roles', roles: ['local'] } })]
    const r = resumirDia({ hoy: HOY, items, hechos: [], equipo: EQ })
    expect(r.map((x) => x.tareas.length)).toEqual([1, 0, 0])
  })

  it('los moldes, lo apagado y lo que no corre hoy no cuentan', () => {
    const items = [
      it_('m', { datos: { plantilla: 'ingreso' } }),
      it_('o', { activo: false }),
      it_('s', { regla: { tipo: 'semanal', dias: [1] } }), // lunes; HOY es viernes
    ]
    expect(resumirDia({ hoy: HOY, items, hechos: [], equipo: EQ })[0].estado).toBe('sin-tareas')
  })

  it('lo que tildó hoy de un día anterior cuenta como uso', () => {
    const items = [it_('v', { regla: { tipo: 'unica', fecha: '2026-10-14' } })]
    const hechos = [{ item_id: 'v', fecha: '2026-10-14', usuario: 'camilaquintana', hecho_at: '2026-10-16T13:00:00Z' }]
    const r = resumirDia({ hoy: HOY, items, hechos, equipo: EQ })[0]
    expect(r.estado).toBe('a-medias')
    expect(r.deAntes).toEqual(['Tarea v'])
  })

  it('el día cambia a las 00:00 de Argentina, no de UTC', () => {
    expect(hoyAR(Date.parse('2026-10-17T02:30:00Z'))).toBe('2026-10-16')
    expect(hoyAR(Date.parse('2026-10-17T03:30:00Z'))).toBe('2026-10-17')
  })
})

describe('la puerta del reloj', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  const res = () => {
    const r = { code: 0, body: null as unknown, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r }, setHeader() {} }
    return r
  }
  const req = (auth?: string) => ({ method: 'GET', query: { recurso: 'agenda', tarea: 'correo-diario' }, headers: auth ? { authorization: auth } : {} })

  it('🔴 sin CRON_SECRET está CERRADA (503), ⛔ no abierta', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const r = res()
    await handler(req('Bearer cualquiera'), r)
    expect(r.code).toBe(503)
  })

  it('con otro secreto, 401', async () => {
    vi.stubEnv('CRON_SECRET', 'el-bueno')
    const r = res()
    await handler(req('Bearer otro'), r)
    expect(r.code).toBe(401)
  })
})
