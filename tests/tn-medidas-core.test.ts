/**
 * El diccionario de medidas: la guía de Bruno hecha código.
 *
 * Lo que este archivo vigila son las cuatro reglas que ⛔ no se deducen del código y que, si se
 * pierden, no rompen nada visible: se publican números mal.
 */
import { describe, expect, it } from 'vitest'
import {
  ESTIRA,
  MEDIDAS,
  MEDIDAS_POR_FAMILIA,
  MEDIDAS_QUE_ESTIRAN,
  contestadasDe,
  esMedida,
  esValorDeMedida,
  filasDe,
  medidasDe,
  paraPublicar,
} from '../lib/tn-medidas/medidas'
import type { Medida } from '../lib/tn-medidas/medidas'
import { FAMILIAS } from '../lib/tn-desc/atributos'

describe('🔴 el largo se mide SIEMPRE: la regla de Bruno, hecha imposible de romper', () => {
  it('el largo no puede marcarse «estira», y el ancho sí', () => {
    expect(esValorDeMedida('largo', ESTIRA)).toBe(false)
    expect(esValorDeMedida('largoManga', ESTIRA)).toBe(false)
    expect(esValorDeMedida('ancho', ESTIRA)).toBe(true)
    expect(esValorDeMedida('contornoCintura', ESTIRA)).toBe(true)
  })

  it('la lista de las que estiran no incluye ningún largo', () => {
    expect(MEDIDAS_QUE_ESTIRAN).not.toContain('largo')
    expect(MEDIDAS_QUE_ESTIRAN).not.toContain('largoManga')
    expect(MEDIDAS_QUE_ESTIRAN.length).toBeGreaterThan(0)
  })
})

describe('🔴 el ×2 de la cintura lo hace el sistema, nunca la persona', () => {
  it('la cintura se publica al doble y las demás tal cual', () => {
    expect(paraPublicar('contornoCintura', '36')).toBe('72')
    expect(paraPublicar('ancho', '36')).toBe('36')
    expect(paraPublicar('largo', '40,5')).toBe('40,5')
    expect(paraPublicar('contornoCintura', '35,5')).toBe('71')
  })

  it('⛔ la cintura es la ÚNICA que se duplica', () => {
    const duplican = Object.keys(MEDIDAS).filter((k) => MEDIDAS[k as Medida].duplicar)
    expect(duplican).toEqual(['contornoCintura'])
  })

  it('«estira» y el vacío no publican nada', () => {
    expect(paraPublicar('ancho', ESTIRA)).toBeNull()
    expect(paraPublicar('ancho', '')).toBeNull()
    expect(paraPublicar('ancho', '  ')).toBeNull()
  })
})

describe('una medida es un número, no un texto', () => {
  it('acepta centímetros con coma o punto, y nada más', () => {
    expect(esValorDeMedida('largo', '40')).toBe(true)
    expect(esValorDeMedida('largo', '40,5')).toBe(true)
    expect(esValorDeMedida('largo', '40.5')).toBe(true)
    expect(esValorDeMedida('largo', '0')).toBe(false)
    expect(esValorDeMedida('largo', 'medio largo')).toBe(false)
    expect(esValorDeMedida('largo', '40 cm')).toBe(false)
    expect(esValorDeMedida('largo', '1234')).toBe(false)
  })
})

describe('🔑 la ficha ya contesta si hay manga que medir', () => {
  it('un top sin mangas no pide largo de manga', () => {
    expect(medidasDe('tops', { manga: 'sin mangas' }).map((m) => m.key)).toEqual(['ancho', 'largo'])
    expect(medidasDe('tops', { manga: 'breteles' }).map((m) => m.key)).toEqual(['ancho', 'largo'])
    expect(medidasDe('tops', { manga: 'musculosa' }).map((m) => m.key)).toEqual(['ancho', 'largo'])
  })

  it('con manga, la pide; y sin la ficha cargada también (no se adivina que no hay)', () => {
    expect(medidasDe('tops', { manga: 'manga larga' }).map((m) => m.key)).toContain('largoManga')
    expect(medidasDe('tops', {}).map((m) => m.key)).toContain('largoManga')
  })

  it('⛔ el servidor lo vuelve a preguntar: no alcanza con que el casillero no se dibuje', () => {
    expect(esMedida('tops', 'largoManga', { manga: 'sin mangas' })).toBe(false)
    expect(esMedida('tops', 'contornoCintura', {})).toBe(false)
    expect(esMedida('pantalon', 'contornoCintura', {})).toBe(true)
  })
})

describe('🔑 las familias son las MISMAS que las de la ficha', () => {
  it('toda familia de atributos tiene sus medidas, y ninguna de más', () => {
    expect(Object.keys(MEDIDAS_POR_FAMILIA).sort()).toEqual(Object.keys(FAMILIAS).sort())
  })

  it('toda medida nombrada por una familia existe en el diccionario', () => {
    for (const ks of Object.values(MEDIDAS_POR_FAMILIA)) {
      for (const k of ks) expect(MEDIDAS).toHaveProperty(k)
    }
  })

  it('todas piden el largo: es la que se mide siempre', () => {
    for (const ks of Object.values(MEDIDAS_POR_FAMILIA)) expect(ks).toContain('largo')
  })
})

describe('🔴 una fila sin un solo número NO se publica', () => {
  const talles = ['S', 'M']

  it('la medida que estira desaparece de la tabla, no sale vacía', () => {
    const filas = filasDe('tops', { manga: 'sin mangas' }, talles, {
      S: { ancho: ESTIRA, largo: '40' },
      M: { ancho: ESTIRA, largo: '41' },
    })
    expect(filas.map((f) => f.key)).toEqual(['largo'])
    expect(filas[0].valores).toEqual(['40', '41'])
  })

  it('un talle a medias deja la celda vacía pero la fila sale', () => {
    const filas = filasDe('tops', { manga: 'sin mangas' }, talles, { S: { largo: '40' } })
    expect(filas.map((f) => f.key)).toEqual(['largo'])
    expect(filas[0].valores).toEqual(['40', null])
  })

  it('⛔ sin ningún número no hay tabla: es el caso de VESTIDO SOLANA, publicado con «CM» solo', () => {
    expect(filasDe('vestidos', {}, talles, {})).toEqual([])
    expect(filasDe('vestidos', {}, talles, { S: { contornoCintura: ESTIRA } })).toEqual([])
  })

  it('un producto sin talles publica una sola columna', () => {
    const filas = filasDe('faldas', {}, [], { '': { largo: '92', contornoCintura: '34' } })
    expect(filas.map((f) => f.key)).toEqual(['contornoCintura', 'largo'])
    expect(filas[0].valores).toEqual(['68'])
  })
})

describe('el contador de la fila cuenta «estira» como contestada', () => {
  it('marcar que estira ES trabajo hecho, no trabajo pendiente', () => {
    expect(contestadasDe('tops', { manga: 'sin mangas' }, ['S'], { S: { ancho: ESTIRA, largo: '40' } }))
      .toEqual({ con: 2, total: 2 })
    expect(contestadasDe('tops', { manga: 'sin mangas' }, ['S'], { S: { largo: '40' } }))
      .toEqual({ con: 1, total: 2 })
    expect(contestadasDe('tops', { manga: 'sin mangas' }, ['S'], {})).toEqual({ con: 0, total: 2 })
  })
})
