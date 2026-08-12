import { describe, expect, it } from 'vitest'
import {
  decisionQueCalla,
  indexar,
  partir,
  porQueCallado,
  silenciaA,
  vigenteAl,
  type Decision,
} from '@/lib/meta-ads/decisiones'

/**
 * Una decisión calla una alarma, y eso es exactamente lo peligroso: el modo de fallar de esta pieza
 * no es gritar de más, es **dejar de avisar algo real y que nadie se entere**.
 *
 * Por eso lo que más se prueba acá es lo que NO calla —el otro preset, la vencida, la revocada, la
 * nota— y sobre todo que lo callado siga apareciendo: `hallazgos + silenciados` tiene que dar
 * siempre lo que entró.
 */

const HOY = '2026-08-11'

function decision(over: Partial<Decision> = {}): Decision {
  return {
    id: 1,
    creada: `${HOY}T12:00:00Z`,
    quien: 'bruno',
    clase: 'silencio',
    fecha: HOY,
    linea: 'bdi',
    nivel: 'aviso',
    objeto_id: 'a1',
    objeto_nombre: 'AD 04 - REEL TIKTOK FUNDAS VARIAS',
    cuenta_id: '1145878766790149',
    accion: 'apagado',
    motivo: 'sin stock: son fundas discontinuadas. NO reactivar',
    preset: 'atribucion-tardia',
    vence: null,
    estado: 'vigente',
    revocada_por: null,
    revocada_en: null,
    origen: 'manual',
    hallazgo_id: null,
    ...over,
  }
}

/** Un hallazgo con lo mínimo que mira el filtro. */
function hallazgo(objetoId: string, motivo = 'sumó compras después del corte') {
  return { objeto_id: objetoId, objeto_nombre: `Objeto ${objetoId}`, motivo }
}

describe('vigenteAl', () => {
  it('una decisión sin vencimiento vale siempre', () => {
    expect(vigenteAl(decision(), '2027-01-01')).toBe(true)
  })

  it('vale EL DÍA que vence, y no el siguiente', () => {
    // «Control al 14-ago» en castellano incluye el 14. Si el borde se corriera un día, una decisión
    // con fecha de control dejaría de valer justo el día en que hay que mirarla.
    const d = decision({ vence: '2026-08-14' })
    expect(vigenteAl(d, '2026-08-14')).toBe(true)
    expect(vigenteAl(d, '2026-08-15')).toBe(false)
  })

  it('una revocada no vale, aunque no haya vencido', () => {
    expect(vigenteAl(decision({ estado: 'revocada' }), HOY)).toBe(false)
  })

  it('una nota no vale nunca: queda escrita y no calla nada', () => {
    expect(vigenteAl(decision({ clase: 'nota' }), HOY)).toBe(false)
  })
})

describe('silenciaA', () => {
  it('con preset, calla ESE preset y no otro sobre el mismo objeto', () => {
    // 🔑 El caso que define el diseño: «no reactivar por falta de stock» calla el radar de
    // atribución tardía, pero si mañana alguien lo prende y empieza a quemar plata contra cero
    // ventas, el freno de emergencia tiene que gritar igual.
    const d = decision({ preset: 'atribucion-tardia' })
    expect(silenciaA(d, { objetoId: 'a1', preset: 'atribucion-tardia', hasta: HOY })).toBe(true)
    expect(silenciaA(d, { objetoId: 'a1', preset: 'freno-emergencia', hasta: HOY })).toBe(false)
  })

  it('sin preset, calla todos', () => {
    const d = decision({ preset: null })
    expect(silenciaA(d, { objetoId: 'a1', preset: 'atribucion-tardia', hasta: HOY })).toBe(true)
    expect(silenciaA(d, { objetoId: 'a1', preset: 'freno-emergencia', hasta: HOY })).toBe(true)
  })

  it('no calla a otro objeto', () => {
    expect(silenciaA(decision(), { objetoId: 'a2', preset: 'atribucion-tardia', hasta: HOY })).toBe(false)
  })

  it('una vencida no calla', () => {
    const d = decision({ vence: '2026-08-01' })
    expect(silenciaA(d, { objetoId: 'a1', preset: 'atribucion-tardia', hasta: HOY })).toBe(false)
  })
})

describe('indexar', () => {
  it('deja afuera las notas y las que no tienen objeto', () => {
    // Una `nota` en el índice sería una invitación a que algún día filtre.
    const mapa = indexar([
      decision({ id: 1, objeto_id: 'a1' }),
      decision({ id: 2, clase: 'nota', objeto_id: null }),
      decision({ id: 3, clase: 'nota', objeto_id: 'a1' }),
    ])
    expect(mapa.get('a1')).toHaveLength(1)
    expect(mapa.get('a1')?.[0].id).toBe(1)
  })

  it('agrupa varias decisiones del mismo objeto', () => {
    const mapa = indexar([
      decision({ id: 1, preset: 'atribucion-tardia' }),
      decision({ id: 2, preset: 'sin-avisos' }),
    ])
    expect(mapa.get('a1')).toHaveLength(2)
  })
})

describe('decisionQueCalla', () => {
  it('devuelve la decisión entera, para poder decir el porqué', () => {
    const mapa = indexar([decision()])
    const d = decisionQueCalla(mapa, { objetoId: 'a1', preset: 'atribucion-tardia', hasta: HOY })
    expect(d?.motivo).toContain('sin stock')
  })

  it('ante dos candidatas gana la más específica', () => {
    // Que convivan una ancha y una de preset lo permite el índice único de la tabla. Elegir la
    // específica hace que el renglón que se lee nombre la regla concreta y no «todas».
    const mapa = indexar([
      decision({ id: 1, preset: null, motivo: 'la ancha' }),
      decision({ id: 2, preset: 'atribucion-tardia', motivo: 'la específica' }),
    ])
    expect(decisionQueCalla(mapa, { objetoId: 'a1', preset: 'atribucion-tardia', hasta: HOY })?.motivo)
      .toBe('la específica')
    expect(decisionQueCalla(mapa, { objetoId: 'a1', preset: 'sin-avisos', hasta: HOY })?.motivo)
      .toBe('la ancha')
  })

  it('sin índice o sin objeto, null', () => {
    expect(decisionQueCalla(null, { objetoId: 'a1', preset: 'sin-avisos', hasta: HOY })).toBe(null)
  })
})

describe('partir', () => {
  it('🔴 nada desaparece: hallazgos + silenciados es lo que entró', () => {
    // La prueba del agujero negro. Si algún día `partir` devolviera sólo los vivos, una decisión
    // vieja se comería una alarma real y no habría forma de enterarse.
    const entraron = [hallazgo('a1'), hallazgo('a2'), hallazgo('a3')]
    const r = partir(entraron, indexar([decision({ objeto_id: 'a2', preset: null })]), { preset: 'sin-avisos', hasta: HOY })
    expect(r.hallazgos.length + r.silenciados.length).toBe(entraron.length)
    expect(r.hallazgos.map((h) => h.objeto_id)).toEqual(['a1', 'a3'])
    expect(r.silenciados.map((h) => h.objeto_id)).toEqual(['a2'])
  })

  it('el silenciado viaja con su decisión adentro', () => {
    const r = partir([hallazgo('a1')], indexar([decision()]), { preset: 'atribucion-tardia', hasta: HOY })
    expect(r.silenciados[0].decision.motivo).toContain('sin stock')
    expect(r.silenciados[0].objeto_id).toBe('a1')
  })

  it('sin decisiones no toca nada', () => {
    const r = partir([hallazgo('a1'), hallazgo('a2')], indexar([]), { preset: 'sin-avisos', hasta: HOY })
    expect(r.hallazgos).toHaveLength(2)
    expect(r.silenciados).toHaveLength(0)
  })

  it('una revocada devuelve a gritar lo que callaba', () => {
    const r = partir([hallazgo('a1')], indexar([decision({ estado: 'revocada' })]), { preset: 'atribucion-tardia', hasta: HOY })
    expect(r.hallazgos).toHaveLength(1)
    expect(r.silenciados).toHaveLength(0)
  })
})

describe('porQueCallado', () => {
  it('nombra el alcance, la fecha, el vencimiento y el motivo', () => {
    const t = porQueCallado(decision({ vence: '2026-08-14' }))
    expect(t).toContain('esta regla')
    expect(t).toContain('2026-08-11')
    expect(t).toContain('hasta el 2026-08-14')
    expect(t).toContain('sin stock')
  })

  it('dice «sin vencimiento» cuando no vence, en vez de callarlo', () => {
    // Un silencio permanente tiene que verse escrito: es lo que separa una decisión de un olvido.
    expect(porQueCallado(decision({ preset: null }))).toContain('todas las reglas')
    expect(porQueCallado(decision())).toContain('sin vencimiento')
  })
})
