import { describe, expect, it } from 'vitest'
import {
  AYUDA_PUBLICO, ETIQUETA_PUBLICO, PUBLICOS, parteDe, publicoDe, repartirPorPublico,
  sesgoDeAtribucion, veredictoDePublicos,
} from '@/lib/meta-ads/publicos'

/**
 * **Fría vs remarketing.** El módulo contesta *«¿cuánta de la plata de esta marca le compra a gente
 * que YA nos conocía?»*, y lo que estos tests defienden es sobre todo **lo que ⛔ no puede afirmar**:
 * las tres formas en que este reparto se vuelve mentira son las tres que se prueban primero.
 */

const conjunto = (id: string, o: Record<string, unknown> = {}) => ({
  nivel: 'conjunto', objeto_id: id, spend: 100000, compras: 10, revenue: 400000, clicks: 500,
  impresiones: 20000, ...o,
})

describe('el público de un conjunto sale del targeting', () => {
  it('incluir una lista nuestra es remarketing', () => {
    expect(publicoDe({ custom_audiences: [{ id: '1' }] })).toBe('remarketing')
  })

  it('🔴 incluir GANA sobre excluir: el remarketing más fino excluye a los que ya compraron', () => {
    // Incluye «visitantes de la web» y excluye «compradores»: le habla a conocidos que todavía ⛔ no
    // compraron. Leerlo como frío por la exclusión contaría el mejor remarketing como adquisición.
    const t = { custom_audiences: [{ id: '1' }], excluded_custom_audiences: [{ id: '2' }] }
    expect(publicoDe(t)).toBe('remarketing')
  })

  it('excluir sin incluir es fría — es la única adquisición PROBADA', () => {
    expect(publicoDe({ excluded_custom_audiences: [{ id: '2' }] })).toBe('fria')
  })

  it('sin listas es «abierta», que ⛔ NO es «fría»: Meta elige y le habla a los dos', () => {
    expect(publicoDe({ geo_locations: { countries: ['AR'] } })).toBe('abierta')
  })

  it('🔴 un targeting ilegible es null y ⛔ NO «abierta» por descarte', () => {
    // «⛔ No se pudo leer» cayendo en un balde con plata adentro es plata contada en el único que no
    // se puede contradecir.
    for (const malo of [null, undefined, '', 0, 'abierto']) expect(publicoDe(malo)).toBeNull()
  })
})

describe('el reparto de la plata', () => {
  it('suma por público y calcula la parte de cada uno', () => {
    const { partes, total } = repartirPorPublico(
      [conjunto('a'), conjunto('b', { spend: 300000 }), conjunto('c', { spend: 100000 })],
      new Map([['a', 'remarketing'], ['b', 'abierta'], ['c', 'fria']]),
    )
    expect(total).toBe(500000)
    expect(parteDe(partes, 'abierta')).toBe(0.6)
    expect(parteDe(partes, 'remarketing')).toBe(0.2)
    expect(parteDe(partes, 'fria')).toBe(0.2)
  })

  it('🔴 lo que Meta ya ⛔ no lista va a «sin clasificar» y ⛔ NO se reparte entre los otros tres', () => {
    // Repartirlo por descarte inflaría justo el número que se vino a mirar. Es el mismo error que el
    // reparto por línea del censo vino a matar.
    const { partes } = repartirPorPublico(
      [conjunto('a'), conjunto('zombi', { spend: 100000 })],
      new Map([['a', 'remarketing']]),
    )
    expect(parteDe(partes, 'remarketing')).toBe(0.5)
    expect(parteDe(partes, 'sin-clasificar')).toBe(0.5)
  })

  it('los tres públicos aparecen SIEMPRE, aunque estén en cero — «sin clasificar» sólo si tiene plata', () => {
    const { partes } = repartirPorPublico([conjunto('a')], new Map([['a', 'remarketing']]))
    for (const p of PUBLICOS) expect(partes.some((x) => x.publico === p)).toBe(true)
    // 🔑 Un balde vacío arriba de la tabla es ruido; uno con plata escondido hace dudar de todo.
    expect(partes.some((x) => x.publico === 'sin-clasificar')).toBe(false)
  })

  it('⛔ sólo cuentan las filas de CONJUNTO: la misma plata está en los cuatro niveles', () => {
    const { total } = repartirPorPublico(
      [conjunto('a'), { ...conjunto('a'), nivel: 'campania' }, { ...conjunto('a'), nivel: 'aviso' }],
      new Map([['a', 'remarketing']]),
    )
    expect(total).toBe(100000)
  })

  it('sin plata ninguna parte es NaN', () => {
    const { partes, total } = repartirPorPublico([], new Map())
    expect(total).toBe(0)
    for (const p of partes) expect(p.parte).toBe(0)
  })
})

describe('el veredicto: uno solo, y el que tiene una mano del otro lado', () => {
  const armar = (reparto: Record<string, number>, opts = {}) => {
    const filas = Object.entries(reparto).map(([k, v], i) => conjunto(`c${i}`, { spend: v, _k: k }))
    const mapa = new Map(Object.keys(reparto).map((k, i) => [`c${i}`, k]))
    const { partes, total } = repartirPorPublico(filas, mapa as never)
    return veredictoDePublicos(partes, { total, marca: 'BDI', ...opts })
  }

  it('sin gasto suficiente se calla en vez de inventar un diagnóstico', () => {
    expect(armar({ remarketing: 1000 }).clase).toBe('sin-base')
  })

  it('🔴🔑 con la mayoría en público abierto el veredicto es que ⛔ NO se puede contestar', () => {
    const v = armar({ abierta: 600000, remarketing: 200000, fria: 200000 })
    expect(v.clase).toBe('no-se-puede-partir')
    expect(v.titulo).toContain('60%')
    // Y ⛔ no se queda en el diagnóstico: la mano es un cambio de PÚBLICO, ⛔ no de plata.
    expect(v.mano).toContain('Excluir a los compradores')
  })

  it('el abierto GANA sobre el resto: es el que hace que los otros dos números no signifiquen', () => {
    // Con 50% abierto y 50% remarketing, «le hablás sólo a conocidos» sería afirmar sobre una mitad
    // que ⛔ no se sabe de quién es.
    expect(armar({ abierta: 500000, remarketing: 500000 }).clase).toBe('no-se-puede-partir')
  })

  it('con la mayoría en remarketing avisa que la lista se agota sola', () => {
    const v = armar({ remarketing: 800000, fria: 200000 })
    expect(v.clase).toBe('solo-conocidos')
    expect(v.detalle).toContain('se agota')
  })

  it('🔴 sin un peso de remarketing lo dice, y ⛔ no lo confunde con «está repartido»', () => {
    const v = armar({ fria: 900000, abierta: 100000 })
    expect(v.clase).toBe('sin-remarketing')
    expect(v.mano).toContain('lista nuestra')
  })

  it('repartido entre los dos medibles ⛔ no propone nada: no hay nada que hacer con esto', () => {
    const v = armar({ fria: 600000, remarketing: 400000 })
    expect(v.clase).toBe('repartido')
    expect(v.mano).toBeNull()
  })
})

describe('el sesgo de atribución', () => {
  it('🔴 avisa cuántas veces MÁS BARATO se ve el remarketing, que es el tamaño del sesgo', () => {
    const { partes } = repartirPorPublico(
      [conjunto('a', { spend: 100000, compras: 50 }), conjunto('b', { spend: 300000, compras: 30 })],
      new Map([['a', 'remarketing'], ['b', 'abierta']]),
    )
    const s = sesgoDeAtribucion(partes)!
    expect(Math.round(s.costoRemarketing)).toBe(2000)
    expect(Math.round(s.costoResto)).toBe(10000)
    expect(s.veces).toBe(5)
  })

  it('⛔ sin remarketing con compras NO hay cartel: uno que ⛔ no corresponde enseña a ignorarlos', () => {
    const { partes } = repartirPorPublico([conjunto('b')], new Map([['b', 'abierta']]))
    expect(sesgoDeAtribucion(partes)).toBeNull()
  })

  it('⛔ tampoco si no hay contra qué compararlo', () => {
    const { partes } = repartirPorPublico([conjunto('a')], new Map([['a', 'remarketing']]))
    expect(sesgoDeAtribucion(partes)).toBeNull()
  })
})

describe('los textos de la pantalla', () => {
  it('cada público tiene nombre en criollo y una ayuda, incluido «sin clasificar»', () => {
    for (const k of [...PUBLICOS, 'sin-clasificar' as const]) {
      expect(ETIQUETA_PUBLICO[k]).toBeTruthy()
      expect(AYUDA_PUBLICO[k].length).toBeGreaterThan(40)
    }
  })

  it('🔴 la ayuda de «abierta» dice explícitamente que ⛔ NO es gente nueva', () => {
    // Es la confusión que vuelve mentira a la pantalla entera, y por eso la corrección va en la
    // fila y ⛔ no en un popover: un dato que hay que ir a buscar ⛔ no corrige a nadie.
    expect(AYUDA_PUBLICO.abierta).toContain('⛔ No es «gente nueva»')
  })

  it('⛔ ningún rótulo dice «fría» ni «remarketing» a secas: el nombre manda en criollo', () => {
    for (const k of PUBLICOS) {
      expect(ETIQUETA_PUBLICO[k].toLowerCase()).not.toMatch(/remarketing|prospecting/)
    }
  })
})
