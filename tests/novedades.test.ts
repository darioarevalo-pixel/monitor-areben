/**
 * Novedades — la parte que se puede probar sin red: qué cuenta como "sin leer".
 *
 * Es lo que decide el número del badge y, en la tanda que viene, cuáles frenan al entrar. La regla
 * que importa no es "leída o no", es **leída EN ESTA VERSIÓN**: es lo que permite volver a mostrar
 * una novedad corregida sin borrar el registro de que se había leído la anterior.
 */

import { describe, expect, it } from 'vitest'
import { esEstado, ESTADOS, normalizarDestino, seMarcanAlEntrar, sinLeer, type Lectura, type Novedad } from '@/lib/novedades/tipos'
import { esParaMi } from '@/lib/novedades/destino.core.js'

const nov = (id: string, extra: Partial<Novedad> = {}): Novedad => ({
  id,
  estado: 'publicada',
  importante: false,
  titulo: id,
  cuerpo: '',
  version: 1,
  ...extra,
})

describe('estados', () => {
  it('son exactamente tres', () => {
    expect([...ESTADOS]).toEqual(['borrador', 'publicada', 'archivada'])
  })

  it('esEstado rechaza cualquier otra cosa', () => {
    expect(esEstado('publicada')).toBe(true)
    expect(esEstado('publicado')).toBe(false)
    expect(esEstado('')).toBe(false)
    expect(esEstado(undefined)).toBe(false)
  })
})

describe('sinLeer', () => {
  it('cuenta las publicadas que no tienen lectura', () => {
    const r = sinLeer([nov('a'), nov('b')], [{ novedad_id: 'a', version: 1 }])
    expect(r.map((n) => n.id)).toEqual(['b'])
  })

  it('los borradores y las archivadas NO cuentan', () => {
    // Un borrador es un texto a medio escribir y una archivada ya pasó: ninguno de los dos puede
    // encender el badge de alguien.
    const r = sinLeer([nov('a', { estado: 'borrador' }), nov('b', { estado: 'archivada' })], [])
    expect(r).toEqual([])
  })

  it('leída en la v1 pero la novedad va por la v2: vuelve a contar', () => {
    const r = sinLeer([nov('a', { version: 2 })], [{ novedad_id: 'a', version: 1 }])
    expect(r.map((n) => n.id)).toEqual(['a'])
  })

  it('y la lectura vieja sigue estando: no se pisa, se suma', () => {
    const leidas: Lectura[] = [
      { novedad_id: 'a', version: 1 },
      { novedad_id: 'a', version: 2 },
    ]
    expect(sinLeer([nov('a', { version: 2 })], leidas)).toEqual([])
    // La v1 sigue en la lista — es el dato que se quería conservar.
    expect(leidas).toHaveLength(2)
  })

  it('sin nada no explota', () => {
    expect(sinLeer([], [])).toEqual([])
  })
})

describe('destino: a quién le llega', () => {
  const perfil = (extra: Record<string, unknown> = {}) => ({ name: 'Ana', acceso: {}, ...extra }) as never

  it('sin destino, o con "todos", le llega a cualquiera', () => {
    expect(esParaMi(undefined, perfil())).toBe(true)
    expect(esParaMi({ tipo: 'todos' }, perfil())).toBe(true)
  })

  it('por rol: le llega a quien tiene alguno de esos roles', () => {
    const d = { tipo: 'roles', roles: ['local', 'deposito'] }
    expect(esParaMi(d, perfil({ funcion: ['local'] }))).toBe(true)
    expect(esParaMi(d, perfil({ funcion: ['marketing'] }))).toBe(false)
    expect(esParaMi(d, perfil())).toBe(false) // sin rol asignado no recibe: está avisado en la UI
  })

  it('por pantalla: le llega a quien puede verla en alguna marca', () => {
    const d = { tipo: 'seccion', key: 'atencion' }
    expect(esParaMi(d, perfil({ acceso: { bdi: { atencion: true } } }))).toBe(true)
    expect(esParaMi(d, perfil({ acceso: { bdi: { cupones: true } } }))).toBe(false)
    // Por función también, que es como lo tiene casi todo el equipo.
    expect(esParaMi(d, perfil({ funcion: ['local'] }))).toBe(true)
  })

  it('el admin recibe todo: es el que se tiene que dar cuenta si algo se mandó al grupo equivocado', () => {
    expect(esParaMi({ tipo: 'roles', roles: ['deposito'] }, perfil({ admin: true }))).toBe(true)
  })

  it('por persona: le llega a quien lleva el nombre, y a nadie más', () => {
    const d = { tipo: 'personas', personas: ['sofi', 'cande'] }
    expect(esParaMi(d, perfil({ name: 'sofi' }))).toBe(true)
    expect(esParaMi(d, perfil({ name: 'cami' }))).toBe(false)
    // Un puesto compartido se elige igual: ahí el dueño es el puesto y no una persona.
    expect(esParaMi({ tipo: 'personas', personas: ['Depósito'] }, perfil({ name: 'Depósito' }))).toBe(true)
  })

  /**
   * 🔑 Ésta es la línea entera del cambio del 23-ago-2026, y la única excepción al atajo del admin.
   * Si se cae, el «Hoy» del que carga las rutinas vuelve a ser la suma de los «Hoy» de los quince.
   */
  it('lo dirigido por nombre NO lo recibe el admin', () => {
    expect(esParaMi({ tipo: 'personas', personas: ['sofi'] }, perfil({ name: 'bruno', admin: true }))).toBe(false)
    // Y le sigue llegando lo suyo, obvio.
    expect(esParaMi({ tipo: 'personas', personas: ['bruno'] }, perfil({ name: 'bruno', admin: true }))).toBe(true)
  })

  it('elegir a alguien por nombre ya dijo todo: la marca no lo puede sacar', () => {
    const d = { tipo: 'personas', personas: ['sofi'], marca: 'zattia' }
    expect(esParaMi(d, perfil({ name: 'sofi', cuenta: 'bdi' }))).toBe(true)
  })

  it('sin perfil no le llega nada', () => {
    expect(esParaMi({ tipo: 'todos' }, null)).toBe(false)
  })

  it('una lista de roles vacía se cae a «todos», no a «a nadie»', () => {
    expect(normalizarDestino({ tipo: 'roles', roles: [] })).toEqual({ tipo: 'todos' })
    expect(normalizarDestino({ tipo: 'seccion' })).toEqual({ tipo: 'todos' })
    expect(normalizarDestino('cualquier cosa')).toEqual({ tipo: 'todos' })
  })

  it('una lista de personas vacía también, y la basura de adentro se descarta', () => {
    expect(normalizarDestino({ tipo: 'personas', personas: [] })).toEqual({ tipo: 'todos' })
    expect(normalizarDestino({ tipo: 'personas' })).toEqual({ tipo: 'todos' })
    expect(normalizarDestino({ tipo: 'personas', personas: ['sofi', '', null, 3] })).toEqual({
      tipo: 'personas',
      personas: ['sofi'],
    })
    // La marca se conserva aunque el resto se caiga, igual que en los roles.
    expect(normalizarDestino({ tipo: 'personas', personas: [], marca: 'zattia' })).toEqual({
      tipo: 'todos',
      marca: 'zattia',
    })
  })
})

describe('destino: la marca', () => {
  const perfil = (extra: Record<string, unknown> = {}) => ({ name: 'Ana', acceso: {}, ...extra }) as never

  it('🔴 la novedad del local de Zattia NO le llega al local de BDI', () => {
    // Es el bug que se vino a arreglar: el rol `local` solo no distingue de qué local se habla.
    const d = { tipo: 'roles', roles: ['local'], marca: 'zattia' }
    expect(esParaMi(d, perfil({ funcion: ['local'], cuenta: 'zattia' }))).toBe(true)
    expect(esParaMi(d, perfil({ funcion: ['local'], cuenta: 'bdi' }))).toBe(false)
  })

  it('a quien trabaja en las dos marcas le llega igual', () => {
    // Sólo queda afuera el que está CLAVADO a la otra. Quien puede cambiar de marca en el header
    // trabaja en las dos, y la novedad del local de Zattia también es asunto suyo.
    const d = { tipo: 'roles', roles: ['local'], marca: 'zattia' }
    expect(esParaMi(d, perfil({ funcion: ['local'], cuenta: null }))).toBe(true)
    expect(esParaMi(d, perfil({ funcion: ['local'] }))).toBe(true)
  })

  it('la marca sola, sin rol: a todo el equipo de esa marca', () => {
    const d = { tipo: 'todos', marca: 'bdi' }
    expect(esParaMi(d, perfil({ cuenta: 'bdi' }))).toBe(true)
    expect(esParaMi(d, perfil())).toBe(true)
    expect(esParaMi(d, perfil({ cuenta: 'zattia' }))).toBe(false)
  })

  it('por pantalla, la marca acota ANTES de mirar el permiso', () => {
    // Quien tiene Atención tildada sólo en BDI no recibe la de "Atención en Zattia", aunque pueda
    // cambiar de marca: ahí no atiende.
    const soloBdi = perfil({ acceso: { bdi: { atencion: true } } })
    expect(esParaMi({ tipo: 'seccion', key: 'atencion', marca: 'bdi' }, soloBdi)).toBe(true)
    expect(esParaMi({ tipo: 'seccion', key: 'atencion', marca: 'zattia' }, soloBdi)).toBe(false)
    // Sin marca sigue alcanzando con verla en alguna.
    expect(esParaMi({ tipo: 'seccion', key: 'atencion' }, soloBdi)).toBe(true)
  })

  it('sin marca le llega a todos, que es como están las ya publicadas', () => {
    // Las novedades de antes de este campo no lo traen: no puede significar "a nadie".
    const d = { tipo: 'roles', roles: ['local'] }
    expect(esParaMi(d, perfil({ funcion: ['local'], cuenta: 'bdi' }))).toBe(true)
    expect(esParaMi(d, perfil({ funcion: ['local'], cuenta: 'zattia' }))).toBe(true)
  })

  it('el admin recibe también las de la otra marca', () => {
    expect(esParaMi({ tipo: 'todos', marca: 'zattia' }, perfil({ admin: true, cuenta: 'bdi' }))).toBe(true)
  })

  it('una marca inventada se descarta: sin marca son las dos, nunca ninguna', () => {
    expect(normalizarDestino({ tipo: 'roles', roles: ['local'], marca: 'stunned' })).toEqual({ tipo: 'roles', roles: ['local'] })
    expect(normalizarDestino({ tipo: 'todos', marca: 'zattia' })).toEqual({ tipo: 'todos', marca: 'zattia' })
  })

  it('la marca sobrevive cuando la lista de roles vacía cae a «todos»', () => {
    // Destildar el último rol no puede ampliar el reparto a la otra marca: "para Zattia" es lo
    // único que quedó dicho, y sigue valiendo.
    expect(normalizarDestino({ tipo: 'roles', roles: [], marca: 'zattia' })).toEqual({ tipo: 'todos', marca: 'zattia' })
  })
})

describe('sinLeer y el destino', () => {
  it('una novedad que no es para mí no enciende el badge, aunque la reciba', () => {
    // Quien publica recibe la lista entera para administrarla. Si esto no filtrara, tendría el
    // badge prendido por lo que le mandó a otro grupo.
    const r = sinLeer([nov('a', { paraMi: false }), nov('b', { paraMi: true })], [])
    expect(r.map((n) => n.id)).toEqual(['b'])
  })
})

describe('qué se marca leído con sólo abrir la sección', () => {
  // 🔴 El defecto que esto amarra es el que se comió al cartel en la primera prueba en vivo: el
  // badge lleva a Novedades, la sección marcaba TODO al abrirse, y la importante quedaba leída sin
  // que nadie hubiera visto el cartel. O sea que no se disparaba nunca para quien entra por el
  // badge — que es por donde entra todo el mundo.
  it('una IMPORTANTE no se marca por entrar: sólo con «Entendido» en el cartel', () => {
    const r = seMarcanAlEntrar([nov('a', { importante: true }), nov('b')])
    expect(r.map((n) => n.id)).toEqual(['b'])
  })

  it('las que no son para mí tampoco', () => {
    expect(seMarcanAlEntrar([nov('a', { paraMi: false })])).toEqual([])
  })

  it('ni los borradores ni las archivadas', () => {
    expect(seMarcanAlEntrar([nov('a', { estado: 'borrador' }), nov('b', { estado: 'archivada' })])).toEqual([])
  })
})
