import { describe, expect, it } from 'vitest'
import { GRUPOS, cuidadosDe, grupoDe } from '@/lib/tn-desc/cuidados.core.js'
import { TELAS, TELA_SIN_IDENTIFICAR, sinTela, telasDe } from '@/lib/tn-desc/atributos.core.js'

describe('🔴 la cobertura: toda tela tiene un cuidado', () => {
  // Es el test que hace que el mapa no se pudra. El día que alguien agregue una tela a la lista
  // cerrada, esto se pone rojo hasta que decida en qué grupo va — y no sale a la tienda una
  // prenda con un bloque de cuidados vacío sin que nadie se entere.
  it('las 22 telas de la ficha están en algún grupo, salvo «no identifico»', () => {
    const sinGrupo = TELAS.filter((t: string) => t !== TELA_SIN_IDENTIFICAR && !grupoDe(t))
    expect(sinGrupo, `sin cuidado: ${sinGrupo.join(', ')}`).toEqual([])
  })

  it('⛔ y ninguna tela está en dos grupos: el cuidado sería ambiguo', () => {
    const vistas = new Set<string>()
    for (const g of GRUPOS) {
      for (const t of g.telas) {
        expect(vistas.has(t), `«${t}» está repetida`).toBe(false)
        vistas.add(t)
      }
    }
  })

  it('⛔ ningún grupo nombra una tela que no existe en la ficha', () => {
    for (const g of GRUPOS) {
      for (const t of g.telas) expect(TELAS, `«${t}» del grupo ${g.key}`).toContain(t)
    }
  })
})

describe('con dos telas gana la MÁS RESTRICTIVA, no la principal', () => {
  it('FALDA SAGE: microfibra + microtul se cuida como el microtul', () => {
    // El caso que lo disparó, contado por Bruno: «capaz la microfibra no necesita, pero si tiene
    // otra tela, capaz la tiene que cuidar».
    expect(cuidadosDe({ tela: 'microfibra', tela2: 'microtul' })?.grupo).toBe('delicadas')
    expect(cuidadosDe({ tela: 'microfibra' })?.grupo).toBe('punto')
  })

  it('da igual en qué casillero esté cargada cada una', () => {
    expect(cuidadosDe({ tela: 'microtul', tela2: 'microfibra' })).toEqual(cuidadosDe({ tela: 'microfibra', tela2: 'microtul' }))
  })

  it('el ecocuero gana incluso contra una delicada: lo que arruina la prenda es mojarla', () => {
    expect(cuidadosDe({ tela: 'encaje', tela2: 'ecocuero' })?.grupo).toBe('no-agua')
  })

  it('⛔ sin bolsa de red: lo sacó Bruno porque no es algo habitual', () => {
    for (const g of GRUPOS) for (const l of g.lineas) expect(l.toLowerCase()).not.toContain('bolsa de red')
  })
})

describe('🔴 sin tela no hay cuidados, y sin cuidados no se publica', () => {
  it('la ficha vacía no compone nada', () => {
    expect(cuidadosDe({})).toBe(null)
    expect(cuidadosDe({ largo: 'crop' })).toBe(null)
  })

  it('«no identifico» es sin tela: se guarda, pero no alcanza para salir', () => {
    expect(cuidadosDe({ tela: TELA_SIN_IDENTIFICAR })).toBe(null)
    expect(sinTela({ tela: TELA_SIN_IDENTIFICAR })).toBe(true)
    expect(telasDe({ tela: TELA_SIN_IDENTIFICAR, tela2: 'gasa' })).toEqual(['gasa'])
  })

  it('con una sola tela cargada ya se puede', () => {
    expect(sinTela({ tela: 'lino' })).toBe(false)
    expect(sinTela({ tela: TELA_SIN_IDENTIFICAR, tela2: 'lino' })).toBe(false)
  })
})
