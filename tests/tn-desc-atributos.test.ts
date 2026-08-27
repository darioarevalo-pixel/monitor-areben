/**
 * El diccionario de prendas: la lista cerrada que reemplazó al validador de bullets.
 *
 * 🔴 Lo que estos tests cuidan no es «que el objeto esté bien escrito»: es que el bullet sea
 * DETERMINISTA. Desde el 27-ago-2026 el HTML que sale a la tienda no lo escribe un modelo — lo
 * compone `bulletsDe` a partir de lo que cargó el local. Si el orden dependiera del orden de
 * carga, o si un valor de otra familia pudiera colarse, volvería a hacer falta un validador.
 *
 * La lista de categorías de abajo NO es inventada: es la que devolvió la tienda viva de Zattia el
 * 27-ago-2026 sobre los 328 productos publicados, con su suciedad incluida.
 */

import { describe, it, expect } from 'vitest'
import {
  ATRIBUTOS,
  ATRIBUTOS_CERRADOS,
  CATEGORIAS_FUERA_DE_ALCANCE,
  FAMILIAS,
  TELA_SIN_IDENTIFICAR,
  atributosDe,
  bulletsDe,
  cargadosDe,
  esValor,
  etiquetaDeBullet,
  familiaDe,
  fueraDeAlcance,
  textoDeBullet,
  valoresDe,
} from '../lib/tn-desc/atributos'
import type { Atributo, Familia } from '../lib/tn-desc/atributos'

/** Las 21 categorías reales de Zattia, tal cual vienen de TiendaNube (27-ago-2026). */
const CATEGORIAS_REALES = [
  'TOPS Y BODIES', 'REMERAS', 'SWEATERS', 'JEANS', 'SHORTS, MINIS y FALDAS', 'DENIM ',
  'SHORTS, MINIS Y FALDAS', 'VESTIDOS Y MONOS', 'BLUSAS', 'BEST SELLERS', 'PANTALONES',
  'CAMPERAS', 'ACCESORIOS', 'BLUSAS Y CAMISAS', 'VESTIDOS', 'CORSETS', 'BUZOS', 'BAGS',
  'BLAZERS', 'BLAZER', 'SHORTS', 'NEW IN', 'WINTER SALE',
]

describe('🔴 la familia sale de la categoría, y las categorías vienen sucias', () => {
  it('el espacio al final de «DENIM » no la parte en dos', () => {
    expect(familiaDe(['DENIM '])).toBe('pantalon')
    expect(familiaDe(['DENIM'])).toBe('pantalon')
  })

  it('las dos escrituras de SHORTS, MINIS Y FALDAS caen en la misma', () => {
    expect(familiaDe(['SHORTS, MINIS y FALDAS'])).toBe('faldas')
    expect(familiaDe(['SHORTS, MINIS Y FALDAS'])).toBe('faldas')
  })

  it('BLAZER y BLAZERS son la misma', () => {
    expect(familiaDe(['BLAZER'])).toBe('abrigo')
    expect(familiaDe(['BLAZERS'])).toBe('abrigo')
  })

  it('las de campaña no deciden: la familia sale de la otra', () => {
    expect(familiaDe(['NEW IN', 'WINTER SALE', 'TOPS Y BODIES'])).toBe('tops')
    expect(familiaDe(['NEW IN', 'SWEATERS'])).toBe('abrigo')
  })

  it('🔴 un producto con SÓLO «NEW IN» no tiene familia, y eso no rompe', () => {
    // Son BERMUDA HAYDEN y BERMUDA TIDE: nadie les puso categoría en TiendaNube. La pantalla
    // tiene que poder decirlo, no adivinarles una ficha.
    expect(familiaDe(['NEW IN'])).toBeNull()
    expect(familiaDe([])).toBeNull()
    expect(atributosDe(null)).toEqual([])
  })

  it('toda categoría real cae en una familia, o está fuera de alcance, o es de campaña', () => {
    const sinResolver = CATEGORIAS_REALES.filter(
      (c) => !familiaDe([c]) && !fueraDeAlcance([c]) && !['NEW IN', 'WINTER SALE', 'BEST SELLERS'].includes(c.trim()),
    )
    expect(sinResolver).toEqual([])
  })

  it('accesorios y bags quedan afuera a propósito', () => {
    for (const c of CATEGORIAS_FUERA_DE_ALCANCE) {
      expect(fueraDeAlcance([c])).toBe(true)
      expect(familiaDe([c])).toBeNull()
    }
  })
})

describe('las listas están sanas', () => {
  it('ninguna lista cerrada está vacía, y ningún valor se repite', () => {
    for (const fam of Object.keys(FAMILIAS) as Familia[]) {
      for (const a of atributosDe(fam)) {
        if (a.libre) continue
        expect(a.valores.length, `${fam}.${a.key}`).toBeGreaterThan(0)
        expect(new Set(a.valores).size, `${fam}.${a.key} repite un valor`).toBe(a.valores.length)
      }
    }
  })

  it('ningún valor viene con espacios de más (se guardan tal cual se eligen)', () => {
    for (const fam of Object.keys(FAMILIAS) as Familia[]) {
      for (const a of atributosDe(fam)) {
        for (const v of a.valores) expect(v, `${fam}.${a.key}`).toBe(v.trim())
      }
    }
  })

  it('cada familia pide sólo atributos que existen', () => {
    for (const [fam, cfg] of Object.entries(FAMILIAS)) {
      for (const k of cfg.atributos) expect(ATRIBUTOS[k], `${fam} pide «${k}»`).toBeTruthy()
    }
  })

  it('🔑 el orden canónico no tiene empates: sin eso, dos bullets podrían intercambiarse', () => {
    const ordenes = Object.values(ATRIBUTOS).map((a) => a.orden)
    expect(new Set(ordenes).size).toBe(ordenes.length)
  })

  it('«Detalle» es el único libre, y va último', () => {
    const libres = Object.entries(ATRIBUTOS).filter(([, a]) => a.libre).map(([k]) => k as Atributo)
    expect(libres).toEqual(['detalle'])
    expect(ATRIBUTOS_CERRADOS).not.toContain('detalle')
    for (const k of ATRIBUTOS_CERRADOS) expect(ATRIBUTOS[k].orden).toBeLessThan(ATRIBUTOS.detalle.orden)
  })

  it('«no identifico» está en la lista de Tela: es un valor que se carga, no un vacío', () => {
    expect(valoresDe('tops', 'tela')).toContain(TELA_SIN_IDENTIFICAR)
  })
})

describe('🔴 los valores son de la familia, y el servidor lo chequea', () => {
  it('un calce de pantalón no vale en un top', () => {
    expect(esValor('pantalon', 'calce', 'wide leg')).toBe(true)
    expect(esValor('tops', 'calce', 'wide leg')).toBe(false)
    expect(esValor('tops', 'calce', 'entallado')).toBe(true)
  })

  it('un largo de falda no vale en un pantalón', () => {
    expect(esValor('faldas', 'largo', 'mini')).toBe(true)
    expect(esValor('pantalon', 'largo', 'mini')).toBe(false)
  })

  it('un atributo que la familia no pide no vale, aunque el valor exista', () => {
    expect(esValor('tops', 'tiro', 'tiro alto')).toBe(false)
    expect(esValor('pantalon', 'tiro', 'tiro alto')).toBe(true)
    expect(esValor('pantalon', 'escote', 'en V')).toBe(false)
  })

  it('el detalle es libre: cualquier texto vale', () => {
    expect(esValor('tops', 'detalle', 'argolla plateada en el medio')).toBe(true)
  })
})

describe('🔑 Silueta es un campo aparte de Calce', () => {
  it('un sweater puede ser entallado Y oversize a la vez', () => {
    const b = bulletsDe('abrigo', { calce: 'entallado', silueta: 'oversize' })
    expect(b).toEqual([
      { etiqueta: 'Calce', texto: 'entallado' },
      { etiqueta: 'Silueta', texto: 'oversize' },
    ])
  })

  it('no se le pide a pantalón ni a falda', () => {
    expect(atributosDe('pantalon').map((a) => a.key)).not.toContain('silueta')
    expect(atributosDe('faldas').map((a) => a.key)).not.toContain('silueta')
    expect(atributosDe('vestidos').map((a) => a.key)).toContain('silueta')
  })
})

describe('🔑 un campo arriba, dos etiquetas: Cuello o Escote según el valor', () => {
  it('polera es cuello, en V es escote', () => {
    expect(etiquetaDeBullet('escote', 'polera')).toBe('Cuello')
    expect(etiquetaDeBullet('escote', 'volcado')).toBe('Cuello')
    expect(etiquetaDeBullet('escote', 'en V')).toBe('Escote')
    expect(etiquetaDeBullet('escote', 'sin espalda')).toBe('Escote')
  })

  it('todo valor de la lista cae en una de las dos', () => {
    for (const v of valoresDe('tops', 'escote')) {
      expect(['Cuello', 'Escote'], `«${v}»`).toContain(etiquetaDeBullet('escote', v))
    }
  })
})

describe('el bullet no repite la etiqueta que ya tiene adelante', () => {
  it('«manga larga» bajo Manga sale «larga»', () => {
    expect(textoDeBullet('manga', 'manga larga')).toBe('larga')
    expect(textoDeBullet('manga', 'manga 3/4')).toBe('3/4')
    expect(textoDeBullet('tiro', 'tiro alto')).toBe('alto')
  })

  it('lo que no empieza con la etiqueta queda igual', () => {
    expect(textoDeBullet('manga', 'breteles')).toBe('breteles')
    expect(textoDeBullet('manga', 'murciélago')).toBe('murciélago')
    expect(textoDeBullet('tela', 'jersey de algodón')).toBe('jersey de algodón')
    // ⚠️ «musculosa» empieza con «m» como «manga», pero no con la palabra: no se corta.
    expect(textoDeBullet('manga', 'musculosa')).toBe('musculosa')
  })
})

describe('🔴 el bullet es determinista', () => {
  const cargado = { largo: 'crop', tela: 'microfibra', manga: 'breteles', calce: 'entallado' }

  it('sale en el orden canónico, no en el orden de carga', () => {
    expect(bulletsDe('tops', cargado)).toEqual([
      { etiqueta: 'Tela', texto: 'microfibra' },
      { etiqueta: 'Calce', texto: 'entallado' },
      { etiqueta: 'Manga', texto: 'breteles' },
      { etiqueta: 'Largo', texto: 'crop' },
    ])
  })

  it('cargar las mismas cosas en otro orden da exactamente lo mismo', () => {
    const alReves = Object.fromEntries(Object.entries(cargado).reverse())
    expect(bulletsDe('tops', alReves)).toEqual(bulletsDe('tops', cargado))
  })

  it('lo que no se cargó no sale: una ficha a medias se ve corta, no rota', () => {
    expect(bulletsDe('tops', { tela: 'morley' })).toEqual([{ etiqueta: 'Tela', texto: 'morley' }])
    expect(bulletsDe('tops', {})).toEqual([])
    expect(bulletsDe('tops', { tela: '  ' })).toEqual([])
  })

  it('⛔ «no identifico» se guarda pero NO sale a la ficha', () => {
    const b = bulletsDe('tops', { tela: TELA_SIN_IDENTIFICAR, calce: 'holgado' })
    expect(b).toEqual([{ etiqueta: 'Calce', texto: 'holgado' }])
  })

  it('🔴 un valor que no es de la familia no se dibuja, aunque esté guardado', () => {
    // El guard del servidor puede haber sido salteado por un dato viejo: el que compone
    // vuelve a preguntar. Que la lista sea cerrada no puede depender de quién la escribió.
    expect(bulletsDe('tops', { calce: 'wide leg', tela: 'lino' })).toEqual([
      { etiqueta: 'Tela', texto: 'lino' },
    ])
  })

  it('el detalle libre va último, aunque se haya cargado primero', () => {
    const b = bulletsDe('tops', { detalle: 'argolla plateada en el medio', tela: 'encaje' })
    expect(b[b.length - 1]).toEqual({ etiqueta: 'Detalle', texto: 'argolla plateada en el medio' })
  })

  it('una familia que no existe no explota: devuelve nada', () => {
    expect(bulletsDe('mueble' as Familia, { tela: 'lino' })).toEqual([])
  })
})

describe('el contador que ve el local en la fila', () => {
  it('cuenta los cargados sobre el total de la familia', () => {
    expect(cargadosDe('tops', { tela: 'morley', calce: 'entallado' })).toEqual({ con: 2, total: 7 })
    expect(cargadosDe('pantalon', {})).toEqual({ con: 0, total: 5 })
    expect(cargadosDe('pantalon', { tela: 'denim rígido', tiro: 'tiro alto', calce: 'mom', largo: 'al tobillo', detalle: 'roturas' }))
      .toEqual({ con: 5, total: 5 })
  })
})
