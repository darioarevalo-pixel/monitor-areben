/**
 * La sesión de fotos como EVENTO — Fase 2 del octavo.
 *
 * Fija las reglas que dictó Bruno el 3-sep-2026 —el evento se crea primero, con modelo, fecha,
 * hora y duración, y las solicitudes se le cuelgan después y pueden ser **varias**— y sobre todo
 * 🔴 **las tres ausencias que ⛔ no se pueden rellenar**: sin hora, sin duración y sin las dos.
 */
import { describe, it, expect } from 'vitest'
import {
  bloqueoEliminarEvento,
  conDescripcionEvento,
  conDisparadorEvento,
  conDuracion,
  conEstadoEvento,
  conEvento,
  conFechaEvento,
  conHora,
  crearEvento,
  cuandoDe,
  duracionEnPalabras,
  duracionNormalizada,
  finEstimado,
  hijasDe,
  horaNormalizada,
  sinEvento,
  sueltas,
  type SesionEvento,
} from '../lib/sesionfotos/evento'
import { conModelo } from '../lib/sesionfotos/modelo'
import { procesarDraft, type Draft } from '../lib/sesionfotos/draft'
import type { Solicitud } from '../lib/sesionfotos/tipos'

const evento = (extra: Partial<SesionEvento> = {}): SesionEvento => ({
  id: 'e1',
  fecha: '2026-09-12',
  descripcion: 'Primavera',
  estado: 'planificado',
  creado: 1,
  creadoPor: 'test',
  ...extra,
})

const sol = (id: string, extra: Partial<Solicitud> = {}): Solicitud => ({
  id,
  fecha: '2026-09-12',
  creado: 1,
  creadoPor: 'test',
  descripcion: '',
  estado: 'pendiente',
  items: [],
  ...extra,
})

describe('crearEvento — nace planificado, y lo que no se sabe queda AUSENTE', () => {
  it('con lo mínimo: fecha y nada más', () => {
    const e = crearEvento({ id: 'e1', fecha: '2026-09-12', creado: 1, creadoPor: 'Sofi' })
    expect(e.estado).toBe('planificado')
    expect(e.descripcion).toBe('')
    // 🔴 las claves ⛔ no están, no están en null: una clave en null ensucia el diff del cajón
    expect('hora' in e).toBe(false)
    expect('duracionMin' in e).toBe(false)
    expect('disparador' in e).toBe(false)
  })

  it('con todo puesto', () => {
    const e = crearEvento({ id: 'e1', fecha: '2026-09-12', creado: 1, creadoPor: 'Sofi', hora: '9:5'.replace('5', '05'), duracionMin: 90, disparador: 'campania', descripcion: '  Primavera  ' })
    expect(e.hora).toBe('09:05')
    expect(e.duracionMin).toBe(90)
    expect(e.disparador).toBe('campania')
    expect(e.descripcion).toBe('Primavera')
  })

  it('una hora que no se puede leer ⛔ NO se guarda como 00:00', () => {
    const e = crearEvento({ id: 'e1', fecha: '2026-09-12', creado: 1, creadoPor: 'S', hora: 'a la tarde' })
    expect('hora' in e).toBe(false)
  })
})

describe('horaNormalizada — 🔴 null, ⛔ nunca 00:00 inventada', () => {
  it('acepta lo que una persona tipea', () => {
    expect(horaNormalizada('9:30')).toBe('09:30')
    expect(horaNormalizada('09:30')).toBe('09:30')
    expect(horaNormalizada(' 15.00 ')).toBe('15:00')
    expect(horaNormalizada('23:59')).toBe('23:59')
    expect(horaNormalizada('00:00')).toBe('00:00') // la medianoche REAL sí se puede escribir
  })

  it('lo que no es una hora vuelve null', () => {
    for (const v of ['', null, undefined, 'mañana', '25:00', '12:60', '9', '9:3', '-1:00'])
      expect(horaNormalizada(v)).toBeNull()
  })
})

describe('duracionNormalizada — 🔑 el cero ⛔ no es una duración: es «no lo sé»', () => {
  it('los minutos válidos', () => {
    expect(duracionNormalizada(90)).toBe(90)
    expect(duracionNormalizada('120')).toBe(120)
    expect(duracionNormalizada(45.4)).toBe(45)
  })

  it('el cero, lo negativo y lo absurdo vuelven null', () => {
    for (const v of [0, -30, '', null, undefined, 'dos horas', NaN, 24 * 60 + 1])
      expect(duracionNormalizada(v)).toBeNull()
    expect(duracionNormalizada(24 * 60)).toBe(1440) // un día entero todavía entra
  })
})

describe('conHora / conDuracion — soltar BORRA la clave', () => {
  it('poner y soltar la hora', () => {
    const e = conHora(evento(), '15:30')
    expect(e.hora).toBe('15:30')
    const suelta = conHora(e, '')
    expect('hora' in suelta).toBe(false)
  })

  it('poner y soltar la duración', () => {
    const e = conDuracion(evento(), 90)
    expect(e.duracionMin).toBe(90)
    expect('duracionMin' in conDuracion(e, 0)).toBe(false)
  })

  it('soltar lo que ya no estaba ⛔ no crea un objeto nuevo', () => {
    const e = evento()
    expect(conHora(e, 'nada')).toBe(e)
    expect(conDuracion(e, 0)).toBe(e)
  })

  it('⛔ no muta el evento original', () => {
    const e = evento()
    conHora(e, '10:00')
    expect('hora' in e).toBe(false)
  })
})

describe('finEstimado — 🔴 con una sola de las dos ⛔ NO se contesta', () => {
  it('con hora y duración', () => {
    expect(finEstimado(evento({ hora: '15:30', duracionMin: 90 }))).toBe('17:00')
    expect(finEstimado(evento({ hora: '09:00', duracionMin: 45 }))).toBe('09:45')
  })

  it('sin hora, o sin duración, o sin ninguna → null', () => {
    expect(finEstimado(evento({ duracionMin: 90 }))).toBeNull()
    expect(finEstimado(evento({ hora: '15:30' }))).toBeNull()
    expect(finEstimado(evento())).toBeNull()
  })

  it('pasada la medianoche sigue contando', () => {
    expect(finEstimado(evento({ hora: '23:00', duracionMin: 120 }))).toBe('01:00')
  })
})

describe('cuandoDe y duracionEnPalabras — lo que falta ⛔ no se rellena', () => {
  it('dice sólo lo que sabe', () => {
    expect(cuandoDe(evento())).toBe('2026-09-12')
    expect(cuandoDe(evento({ hora: '15:30' }))).toBe('2026-09-12 · 15:30')
    expect(cuandoDe(evento({ duracionMin: 90 }))).toBe('2026-09-12 · 1 h 30')
    expect(cuandoDe(evento({ hora: '15:30', duracionMin: 90 }))).toBe('2026-09-12 · 15:30 a 17:00 (1 h 30)')
  })

  it('la duración en la palabra de una persona', () => {
    expect(duracionEnPalabras(45)).toBe('45 min')
    expect(duracionEnPalabras(60)).toBe('1 h')
    expect(duracionEnPalabras(150)).toBe('2 h 30')
    expect(duracionEnPalabras(0)).toBeNull()
    expect(duracionEnPalabras(undefined)).toBeNull()
  })
})

describe('hijasDe y sueltas — el pedido de Bruno: VARIAS solicitudes en la misma sesión', () => {
  it('las hijas salen en el orden en que se crearon', () => {
    const sols = [
      sol('s2', { eventoId: 'e1', creado: 20 }),
      sol('s1', { eventoId: 'e1', creado: 10 }),
      sol('s3', { eventoId: 'e9', creado: 5 }),
      sol('s4'),
    ]
    expect(hijasDe(sols, 'e1').map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('las sueltas son las que ⛔ no cuelgan de ningún evento vivo', () => {
    const sols = [sol('s1', { eventoId: 'e1' }), sol('s2'), sol('s3', { eventoId: 'e9' })]
    // 🔴 s3 apunta a un evento que ya no está: sigue apareciendo, ⛔ no desaparece de la pantalla
    expect(sueltas(sols, [evento()]).map((s) => s.id)).toEqual(['s2', 's3'])
  })

  it('sin eventos, todas son sueltas — que es como quedó todo lo anterior al 4-sep', () => {
    const sols = [sol('s1'), sol('s2')]
    expect(sueltas(sols, []).map((s) => s.id)).toEqual(['s1', 's2'])
  })
})

describe('bloqueoEliminarEvento — 🔴 un evento con hijas ⛔ no se elimina de un click', () => {
  it('sin hijas se puede', () => {
    expect(bloqueoEliminarEvento(evento(), [sol('s1')])).toBeNull()
  })

  it('con hijas dice por qué no, y en singular o plural', () => {
    expect(bloqueoEliminarEvento(evento(), [sol('s1', { eventoId: 'e1' })])).toContain('una solicitud')
    expect(bloqueoEliminarEvento(evento(), [sol('s1', { eventoId: 'e1' }), sol('s2', { eventoId: 'e1' })])).toContain('2 solicitudes')
  })
})

describe('la lista de eventos', () => {
  it('conEvento reemplaza por id y ordena lo próximo arriba', () => {
    const a = evento({ id: 'a', fecha: '2026-09-10' })
    const b = evento({ id: 'b', fecha: '2026-09-20' })
    expect(conEvento([a], b).map((e) => e.id)).toEqual(['b', 'a'])
    const a2 = { ...a, descripcion: 'cambiada' }
    const lista = conEvento([a, b], a2)
    expect(lista.length).toBe(2)
    expect(lista.find((e) => e.id === 'a')?.descripcion).toBe('cambiada')
  })

  it('sinEvento lo saca', () => {
    expect(sinEvento([evento({ id: 'a' }), evento({ id: 'b' })], 'a').map((e) => e.id)).toEqual(['b'])
  })
})

describe('los campos que se editan', () => {
  it('la fecha sólo cambia si es una fecha, y una igual ⛔ no crea objeto nuevo', () => {
    const e = evento()
    expect(conFechaEvento(e, '2026-10-01').fecha).toBe('2026-10-01')
    expect(conFechaEvento(e, 'mañana')).toBe(e)
    expect(conFechaEvento(e, '2026-09-12')).toBe(e)
  })

  it('la descripción se recorta', () => {
    expect(conDescripcionEvento(evento(), '  Feria  ').descripcion).toBe('Feria')
  })

  it('el disparador se pone y se suelta borrando la clave', () => {
    const e = conDisparadorEvento(evento(), 'ingreso')
    expect(e.disparador).toBe('ingreso')
    expect('disparador' in conDisparadorEvento(e, null)).toBe(false)
  })

  it('el estado va y vuelve', () => {
    const e = conEstadoEvento(evento(), 'cerrado')
    expect(e.estado).toBe('cerrado')
    expect(conEstadoEvento(e, 'planificado').estado).toBe('planificado')
  })
})

describe('🔑 la modelo es la MISMA ficha que la de la solicitud, ⛔ no un tipo paralelo', () => {
  it('conModelo sirve para el evento sin copiar una línea', () => {
    const e = conModelo(evento(), { nombre: 'Sofi', talle: 's', altura: '1,70' }, { por: 'test', ts: 5 })
    expect(e.modelo?.talle).toBe('S')
    expect(e.modelo?.nombre).toBe('Sofi')
    // y sigue siendo un evento: ⛔ no perdió lo suyo
    expect(e.estado).toBe('planificado')
    expect(e.fecha).toBe('2026-09-12')
  })

  it('soltar el talle borra la ficha entera, igual que en la solicitud', () => {
    const e = conModelo(evento(), { talle: 'S' }, { por: 't', ts: 1 })
    expect('modelo' in conModelo(e, { talle: '' }, { por: 't', ts: 2 })).toBe(false)
  })
})

describe('procesarDraft — la hija nace con el eventoId estampado', () => {
  const draft: Draft = {
    desc: 'Zattia',
    prods: [{ pid: 'p1', name: 'TOP LEVEL', cat: '', variantes: [{ vid: 'v1', sid: '1', size: 'S', sku: 'A', local: 2, deposito: 2, sel: true, qty: 1 }] }],
    pendientes: [],
    manuales: [],
    disparador: null,
  }

  it('con evento, la solicitud lo lleva', () => {
    const s = procesarDraft(draft, 'deposito', { id: 's1', fecha: '2026-09-12', creado: 1, creadoPor: 'S', eventoId: 'e1' })
    expect(s?.eventoId).toBe('e1')
  })

  it('🔑 sin evento la clave ⛔ NO está — es la solicitud suelta de siempre', () => {
    const s = procesarDraft(draft, 'deposito', { id: 's1', fecha: '2026-09-12', creado: 1, creadoPor: 'S' })
    expect(s && 'eventoId' in s).toBe(false)
  })
})
