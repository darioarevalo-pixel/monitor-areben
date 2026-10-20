import { describe, it, expect } from 'vitest'
import { avanceDelEquipo, personaDelEquipo, type PersonaEquipo } from '@/lib/agenda/equipo'
import type { Hecho, ItemAgenda } from '@/lib/agenda'

const LORE: PersonaEquipo = { name: 'Lorena Reyes', nombre: 'Lorena Reyes', lugar: 'Administración', funcion: ['administracion'], cuenta: null }
const CAMI: PersonaEquipo = { name: 'camilaquintana', nombre: 'Camila Quintana', lugar: 'Local Zattia', funcion: ['local'], cuenta: 'zattia' }

const item = (o: Partial<ItemAgenda>): ItemAgenda => ({
  id: 'x', clase: 'pendiente', titulo: 'T', cuerpo: null, regla: { tipo: 'diaria' }, destino: { tipo: 'todos' },
  marcas: [], manualId: null, activo: true, arrastra: false, arrastraDias: null, plantilla: null, offsetDias: null,
  puertas: [], disparadores: [], autor: null, creado: null, paraMi: false, ...o,
} as ItemAgenda)

const hecho = (itemId: string, fecha: string, usuario: string): Hecho => ({ itemId, fecha, usuario, nota: null, hechoAt: `${fecha}T13:00:00.000Z` })

describe('avanceDelEquipo', () => {
  const HOY = '2026-10-20'

  it('a cada una le cae lo suyo, con el paraMi recalculado para ella y no para quien mira', () => {
    const items = [
      item({ id: 'a', titulo: 'De Lorena', destino: { tipo: 'personas', personas: ['Lorena Reyes'] } }),
      item({ id: 'b', titulo: 'Del local', destino: { tipo: 'roles', roles: ['local'] } }),
    ]
    const [l, c] = avanceDelEquipo(items, [], HOY, [LORE, CAMI])
    expect(l.pendientes.map((p) => p.item.titulo)).toEqual(['De Lorena'])
    expect(c.pendientes.map((p) => p.item.titulo)).toEqual(['Del local'])
    expect(l.estado).toBe('nada')
  })

  it('cuenta hechas, el estado y lo atrasado (una tarea de un día que arrastra)', () => {
    const items = [
      item({ id: 'a', titulo: 'Hoy', destino: { tipo: 'personas', personas: ['Lorena Reyes'] } }),
      item({ id: 'b', titulo: 'Del viernes', arrastra: true, regla: { tipo: 'unica', fecha: '2026-10-16' }, destino: { tipo: 'personas', personas: ['Lorena Reyes'] } }),
    ]
    const [l] = avanceDelEquipo(items, [hecho('a', HOY, 'Lorena Reyes')], HOY, [LORE])
    expect(l.total).toBe(2)
    expect(l.hechas).toBe(1)
    expect(l.atrasadas).toBe(1)
    expect(l.estado).toBe('a-medias')
    expect(l.ultima).toBe(`${HOY}T13:00:00.000Z`)
  })

  it('la marca: lo de BDI no le cae a quien es de Zattia', () => {
    const items = [item({ id: 'a', marcas: ['bdi'], destino: { tipo: 'roles', roles: ['local'] } })]
    expect(avanceDelEquipo(items, [], HOY, [CAMI])[0].estado).toBe('sin-tareas')
  })
})

describe('personaDelEquipo — a quién el Monitor le abre en «Hoy»', () => {
  it('reconoce a las del equipo por su usuario', () => {
    expect(personaDelEquipo('camilaquintana')?.nombre).toBe('Camila Quintana')
    expect(personaDelEquipo('Lorena Reyes')?.lugar).toBe('Administración')
  })
  it('al resto (y a nadie) lo deja entrar por Inicio', () => {
    expect(personaDelEquipo('Dario')).toBeNull()
    expect(personaDelEquipo(undefined)).toBeNull()
  })
})

describe('celular compartido del depósito', () => {
  it('Agustina comparte con Lorena; Lorena y el resto, con nadie', async () => {
    const { companerasDe } = await import('../lib/agenda/equipo')
    expect(companerasDe('agustinapiriz').map((p) => p.name)).toEqual(['Lorena Reyes'])
    expect(companerasDe('Lorena Reyes')).toEqual([])
    expect(companerasDe('camilaquintana')).toEqual([])
  })
  it('deLaPersona recalcula para quién es cada tarea', async () => {
    const { deLaPersona, EQUIPO_AGENDA } = await import('../lib/agenda/equipo')
    const lorena = EQUIPO_AGENDA.find((p) => p.name === 'Lorena Reyes')!
    const items = [
      { id: 'a', destino: { tipo: 'personas', personas: ['Lorena Reyes'] }, paraMi: false },
      { id: 'b', destino: { tipo: 'personas', personas: ['agustinapiriz'] }, paraMi: true },
    ] as unknown as Parameters<typeof deLaPersona>[0]
    expect(deLaPersona(items, lorena).map((i) => i.paraMi)).toEqual([true, false])
  })
})
