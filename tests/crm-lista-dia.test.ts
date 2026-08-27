import { describe, it, expect } from 'vitest'
import { TOPE_LISTA, friosDelDia, listaDelDia } from '@/lib/crm/lista-dia'
import { estadoSeguimiento } from '@/lib/crm/core'
import type { MapaSeguimiento, Seguimiento } from '@/lib/crm/tipos'

/**
 * La lista del día del panel de WhatsApp.
 *
 * Lo que se prueba acá, más allá de los filtros: que **decida lo mismo que la sección** sobre
 * quién está vencido. El panel parte del KV crudo y la sección del agregado de las 27.990 ventas;
 * son dos caminos distintos hacia la misma respuesta, y el día que se desvíen, el panel va a decir
 * que un cliente está atrasado y la sección que está al día, sobre el mismo dato.
 */

const HOY = new Date('2026-08-23T12:00:00')

const seg = (p: Partial<Seguimiento> = {}): Seguimiento => ({ notas: [], ...p })

describe('listaDelDia · quién entra', () => {
  const mapa: MapaSeguimiento = {
    1: seg({ proximo_manual: '2026-08-10' }), // vencido hace 13
    2: seg({ proximo_manual: '2026-08-23' }), // vence hoy
    3: seg({ proximo_manual: '2026-08-30' }), // la semana que viene
    4: seg({ cadencia: 'semanal' }), // cadencia vieja SIN fecha: desde el 24-ago no agenda nada
    5: seg({ proximo_manual: '2026-08-01', descartado: true }),
    6: seg({}), // sin seguimiento
  }
  const ids = listaDelDia(mapa, HOY).map((f) => f.id)

  it('trae los vencidos y los de hoy', () => {
    expect(ids).toContain(1)
    expect(ids).toContain(2)
  })

  it('el que vence la semana que viene NO entra: en el panel sólo va lo de ahora', () => {
    expect(ids).not.toContain(3)
  })

  it('🔴 la cadencia vieja YA NO agenda: sin fecha a mano, el cliente no entra', () => {
    // Hasta el 24-ago-2026 éste entraba como "pendiente". Se sacó la cadencia porque no decidía
    // nada (medido: 744 de 771 con fecha a mano, que le gana siempre, y 0 clientes gobernados por
    // ella) y porque ninguna pantalla dejaba ponerla. Lo que queda en el KV no molesta: se ignora.
    expect(ids).not.toContain(4)
  })

  it('el descartado no entra', () => {
    expect(ids).not.toContain(5)
  })

  it('el que no tiene seguimiento no entra: no hay nada agendado', () => {
    expect(ids).not.toContain(6)
  })
})

describe('listaDelDia · el orden', () => {
  it('caliente antes que templado, aunque el templado esté más atrasado', () => {
    const mapa: MapaSeguimiento = {
      1: seg({ proximo_manual: '2026-01-01', temperatura: 'templado' }),
      2: seg({ proximo_manual: '2026-08-22', temperatura: 'caliente' }),
    }
    expect(listaDelDia(mapa, HOY).map((f) => f.id)).toEqual([2, 1])
  })

  it('dentro de la misma temperatura, primero el de HOY y el colgado al final', () => {
    // Dado vuelta el 27-ago-2026. Antes salía [2, 1, 3]: el colgado del 1-ago arriba y el
    // agendado para hoy último. Con 226 en la lista y 25 lugares, el de hoy no aparecía.
    const mapa: MapaSeguimiento = {
      1: seg({ proximo_manual: '2026-08-22' }),
      2: seg({ proximo_manual: '2026-08-01' }),
      3: seg({ proximo_manual: '2026-08-23' }),
    }
    expect(listaDelDia(mapa, HOY).map((f) => f.id)).toEqual([3, 1, 2])
  })

  it('el de hoy le gana al colgado aunque el tope corte', () => {
    // El caso real: una pila de atrasados y un puñado agendado para hoy. Lo que NO puede
    // pasar es que la pila se coma los 25 lugares y el de hoy quede afuera.
    const mapa: MapaSeguimiento = {}
    for (let i = 1; i <= 60; i++) mapa[i] = seg({ proximo_manual: '2026-08-01' })
    mapa[99] = seg({ proximo_manual: '2026-08-23' })
    expect(listaDelDia(mapa, HOY)[0].id).toBe(99)
  })

  it('el que sólo tiene la cadencia vieja no está: en la lista van los que tienen fecha', () => {
    const mapa: MapaSeguimiento = {
      1: seg({ cadencia: 'semanal' }),
      2: seg({ proximo_manual: '2026-08-22' }),
    }
    expect(listaDelDia(mapa, HOY).map((f) => f.id)).toEqual([2])
  })

  it('sin temperatura marcada se lee como templado, como en toda la app', () => {
    const mapa: MapaSeguimiento = { 1: seg({ proximo_manual: '2026-08-01' }) }
    expect(listaDelDia(mapa, HOY)[0].temperatura).toBe('templado')
  })
})

describe('listaDelDia · el tope', () => {
  it('corta en 25: una lista de 250 en una columna angosta no se usa', () => {
    const mapa: MapaSeguimiento = {}
    for (let i = 1; i <= 60; i++) mapa[i] = seg({ proximo_manual: '2026-08-01' })
    expect(listaDelDia(mapa, HOY)).toHaveLength(TOPE_LISTA)
  })

  it('el tope se puede bajar sin tocar la lógica', () => {
    const mapa: MapaSeguimiento = {}
    for (let i = 1; i <= 60; i++) mapa[i] = seg({ proximo_manual: '2026-08-01' })
    expect(listaDelDia(mapa, HOY, 5)).toHaveLength(5)
  })
})

describe('friosDelDia · la segunda etapa', () => {
  const mapa: MapaSeguimiento = {
    1: seg({ proximo_manual: '2026-08-01', temperatura: 'frio' }),
    2: seg({ proximo_manual: '2026-08-01', temperatura: 'caliente' }),
    3: seg({ proximo_manual: '2026-09-30', temperatura: 'frio' }), // todavía no vence
  }

  it('los fríos van aparte de la lista del día', () => {
    expect(listaDelDia(mapa, HOY).map((f) => f.id)).toEqual([2])
    expect(friosDelDia(mapa, HOY).map((f) => f.id)).toEqual([1])
  })

  it('NO corta ni ordena: el orden es por lo que compraron, y eso no está en el KV', () => {
    const muchos: MapaSeguimiento = {}
    for (let i = 1; i <= 40; i++) muchos[i] = seg({ proximo_manual: '2026-08-01', temperatura: 'frio' })
    expect(friosDelDia(muchos, HOY)).toHaveLength(40)
  })
})

describe('paridad con la sección: el mismo dato, dos caminos', () => {
  // El panel parte del KV crudo; la sección, del agregado. La regla del vencimiento tiene que ser
  // una sola: fecha manual, o cadencia sobre el último contacto.
  const casos: Array<[string, Seguimiento]> = [
    ['fecha manual vencida', seg({ proximo_manual: '2026-08-10' })],
    ['fecha manual de hoy', seg({ proximo_manual: '2026-08-23' })],
    ['fecha manual futura', seg({ proximo_manual: '2026-09-10' })],
    ['cadencia semanal sobre un contacto viejo', seg({ cadencia: 'semanal', ultimo_contacto: '2026-08-01' })],
    ['cadencia mensual recién contactado', seg({ cadencia: 'mensual', ultimo_contacto: '2026-08-22' })],
    ['cadencia sin ningún contacto', seg({ cadencia: 'semanal' })],
    ['sin nada', seg({})],
  ]

  for (const [nombre, s] of casos) {
    it(`coinciden: ${nombre}`, () => {
      const mapa: MapaSeguimiento = { 7: s }
      const deLaSeccion = estadoSeguimiento(7, mapa, HOY)
      const enLaLista = [...listaDelDia(mapa, HOY), ...friosDelDia(mapa, HOY)].length === 1
      const vencidoSegunSeccion = deLaSeccion.estado === 'vencido' || deLaSeccion.estado === 'pendiente'
      expect(enLaLista).toBe(vencidoSegunSeccion)
      if (enLaLista) {
        const f = listaDelDia(mapa, HOY)[0]
        expect(f.proximo).toBe(deLaSeccion.proximo)
        expect(f.dias).toBe(deLaSeccion.dias)
      }
    })
  }
})
