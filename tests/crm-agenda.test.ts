import { describe, it, expect } from 'vitest'
import {
  aplicarAgenda,
  esHabil,
  feriadosDe,
  grupoDe,
  habilesDesde,
  planificarAgenda,
  proximoHabil,
} from '@/lib/crm/agenda.core.js'

/**
 * El reparto de recontactos en días hábiles.
 *
 * El caso que hay que no romper nunca: **el lunes 17-ago-2026 es feriado** (San Martín,
 * tercer lunes de agosto) y sale del módulo de calendario, no de una constante escrita a
 * mano acá. Si algún día alguien "simplifica" eso a una fecha fija, este test sigue
 * pasando el 2026 y empieza a mentir el 2027 — por eso además se verifica 2027, donde el
 * feriado cae otro día del almanaque.
 */

const FERIADOS = feriadosDe([2026, 2027])

describe('días hábiles', () => {
  it('el 17-ago-2026 es feriado y sale del calendario del Monitor', () => {
    expect(FERIADOS.has('2026-08-17')).toBe(true)
  })

  it('en 2027 San Martín cae otro día: la regla es el tercer lunes, no el 17', () => {
    // 2027: los lunes de agosto son 2, 9, 16, 23, 30 → el tercero es el 16.
    expect(FERIADOS.has('2027-08-16')).toBe(true)
    expect(FERIADOS.has('2027-08-17')).toBe(false)
  })

  it('sábado y domingo no son hábiles', () => {
    expect(esHabil('2026-08-15', FERIADOS)).toBe(false) // sábado
    expect(esHabil('2026-08-16', FERIADOS)).toBe(false) // domingo
  })

  it('el feriado tampoco', () => {
    expect(esHabil('2026-08-17', FERIADOS)).toBe(false)
  })

  it('jueves y viernes sí', () => {
    expect(esHabil('2026-08-13', FERIADOS)).toBe(true)
    expect(esHabil('2026-08-14', FERIADOS)).toBe(true)
  })

  it('lo que caería el finde largo se corre solo al martes 18', () => {
    expect(proximoHabil('2026-08-15', FERIADOS)).toBe('2026-08-18') // sábado
    expect(proximoHabil('2026-08-16', FERIADOS)).toBe('2026-08-18') // domingo
    expect(proximoHabil('2026-08-17', FERIADOS)).toBe('2026-08-18') // el feriado
  })

  it('un día hábil se devuelve a sí mismo', () => {
    expect(proximoHabil('2026-08-13', FERIADOS)).toBe('2026-08-13')
  })

  it('la seguidilla de hábiles saltea el fin de semana largo entero', () => {
    expect(habilesDesde('2026-08-13', 7, FERIADOS)).toEqual([
      '2026-08-13', // jue
      '2026-08-14', // vie
      '2026-08-18', // mar — se saltó sáb, dom y el feriado
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24', // lun
    ])
  })
})

describe('grupos por antigüedad de la última compra', () => {
  it('corta en 60 y en 180 días', () => {
    expect(grupoDe(0)).toBe('activo')
    expect(grupoDe(59)).toBe('activo')
    expect(grupoDe(60)).toBe('tibio')
    expect(grupoDe(180)).toBe('tibio')
    expect(grupoDe(181)).toBe('frio')
  })

  it('sin última compra conocida cae en frío', () => {
    expect(grupoDe(null)).toBe('frio')
    expect(grupoDe(undefined)).toBe('frio')
  })
})

// ── El reparto ────────────────────────────────────────────────────────────────

const CONFIG = {
  activo: { desde: '2026-08-13', porDia: 48 },
  tibio: { desde: '2026-08-18', porDia: 25 },
  frio: { desde: '2026-08-13', porDia: 25 },
}

/** n clientes de un grupo, con montos decrecientes para poder mirar el orden. */
function lote(n: number, diasUltimo: number, desdeId: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: desdeId + i,
    diasUltimo,
    total: (n - i) * 1000,
  }))
}

describe('planificarAgenda', () => {
  it('los activos entran hoy y mañana, 48 por día', () => {
    const { porFecha } = planificarAgenda({ clientes: lote(96, 10, 1), feriados: FERIADOS, config: CONFIG })
    expect(porFecha.get('2026-08-13').activo).toBe(48)
    expect(porFecha.get('2026-08-14').activo).toBe(48)
    expect(porFecha.has('2026-08-15')).toBe(false) // el sábado no existe
  })

  it('los tibios arrancan el martes 18, no el lunes feriado', () => {
    const { asignaciones } = planificarAgenda({ clientes: lote(100, 90, 1), feriados: FERIADOS, config: CONFIG })
    const fechas = [...new Set(asignaciones.map((a: { fecha: string }) => a.fecha))]
    expect(fechas).toEqual(['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'])
  })

  it('ningún cliente cae en sábado, domingo ni feriado', () => {
    const clientes = [...lote(96, 10, 1), ...lote(100, 90, 1000), ...lote(571, 400, 10000)]
    const { asignaciones } = planificarAgenda({ clientes, feriados: FERIADOS, config: CONFIG })
    for (const a of asignaciones as { fecha: string }[]) {
      expect(esHabil(a.fecha, FERIADOS)).toBe(true)
    }
  })

  it('reparte a TODOS y una sola vez a cada uno', () => {
    const clientes = [...lote(96, 10, 1), ...lote(100, 90, 1000), ...lote(571, 400, 10000)]
    const { asignaciones } = planificarAgenda({ clientes, feriados: FERIADOS, config: CONFIG })
    expect(asignaciones.length).toBe(767)
    expect(new Set(asignaciones.map((a: { id: number }) => a.id)).size).toBe(767)
  })

  it('adentro de cada grupo, primero el que más compró', () => {
    // Es LA decisión del reparto: con el goteo de fríos durando más de un mes, el orden
    // define a quién se llama esta semana y a quién dentro de cuarenta días.
    const clientes = [
      { id: 1, diasUltimo: 400, total: 10 },
      { id: 2, diasUltimo: 400, total: 900_000 },
      { id: 3, diasUltimo: 400, total: 5_000 },
    ]
    const config = { frio: { desde: '2026-08-13', porDia: 1 } }
    const { asignaciones } = planificarAgenda({ clientes, feriados: FERIADOS, config })
    expect(asignaciones.map((a: { id: number }) => a.id)).toEqual([2, 3, 1])
  })

  it('con el mismo monto, el orden es estable entre corridas', () => {
    const clientes = [
      { id: 7, diasUltimo: 400, total: 100 },
      { id: 3, diasUltimo: 400, total: 100 },
    ]
    const config = { frio: { desde: '2026-08-13', porDia: 1 } }
    const a = planificarAgenda({ clientes, feriados: FERIADOS, config })
    const b = planificarAgenda({ clientes: [...clientes].reverse(), feriados: FERIADOS, config })
    expect(a.asignaciones).toEqual(b.asignaciones)
  })

  it('una fecha de arranque en fin de semana se corre sola al hábil siguiente', () => {
    const config = { frio: { desde: '2026-08-16', porDia: 10 } } // domingo
    const { asignaciones } = planificarAgenda({ clientes: lote(3, 400, 1), feriados: FERIADOS, config })
    expect(asignaciones[0].fecha).toBe('2026-08-18')
  })

  it('sin clientes no rompe', () => {
    const { asignaciones, porFecha } = planificarAgenda({ clientes: [], feriados: FERIADOS, config: CONFIG })
    expect(asignaciones).toEqual([])
    expect(porFecha.size).toBe(0)
  })
})

// ── La escritura sobre el mapa ────────────────────────────────────────────────

describe('aplicarAgenda', () => {
  const HOY = '2026-08-13'

  it('escribe la fecha nueva sin tocar notas, cadencia ni último contacto', () => {
    const antes = {
      '1': {
        cadencia: 'semanal',
        ultimo_contacto: '2026-07-01',
        proximo_manual: '2026-07-08',
        notas: [{ fecha: '2026-07-01', texto: 'quedó en avisar' }],
        es_mayorista: true,
      },
    }
    const out = aplicarAgenda(antes, [{ id: 1, fecha: '2026-08-18' }], HOY)
    expect(out['1'].proximo_manual).toBe('2026-08-18')
    expect(out['1'].ultimo_contacto).toBe('2026-07-01')
    expect(out['1'].notas).toEqual([{ fecha: '2026-07-01', texto: 'quedó en avisar' }])
    expect(out['1'].cadencia).toBe('semanal')
    expect(out['1'].es_mayorista).toBe(true)
  })

  it('no muta el mapa de entrada', () => {
    const antes = { '1': { proximo_manual: '2026-01-01', notas: [] } }
    const copia = JSON.parse(JSON.stringify(antes))
    aplicarAgenda(antes, [{ id: 1, fecha: '2026-08-18' }], HOY)
    expect(antes).toEqual(copia)
  })

  it('limpia la fecha vencida de quien NO entró en el plan', () => {
    const antes = { '9': { proximo_manual: '2026-05-02', notas: [] } }
    const out = aplicarAgenda(antes, [], HOY)
    expect(out['9'].proximo_manual).toBe(null)
  })

  it('a quien tiene fecha futura y no entró en el plan no lo toca', () => {
    const antes = { '9': { proximo_manual: '2026-12-01', notas: [] } }
    const out = aplicarAgenda(antes, [], HOY)
    expect(out['9'].proximo_manual).toBe('2026-12-01')
  })

  it('crea la ficha del cliente que todavía no tenía seguimiento', () => {
    const out = aplicarAgenda({}, [{ id: 42, fecha: '2026-08-19' }], HOY)
    expect(out['42']).toEqual({
      cadencia: '',
      ultimo_contacto: null,
      proximo_manual: '2026-08-19',
      notas: [],
    })
  })

  it('no pierde a nadie del mapa original', () => {
    const antes = { '1': { notas: [] }, '2': { notas: [] }, '3': { notas: [] } }
    const out = aplicarAgenda(antes, [{ id: 1, fecha: '2026-08-18' }], HOY)
    expect(Object.keys(out).sort()).toEqual(['1', '2', '3'])
  })
})
