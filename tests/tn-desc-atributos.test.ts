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
  NO_APLICA,
  TELA_SIN_IDENTIFICAR,
  MAX_PROPUESTA,
  atributosDe,
  atributosExtra,
  esPalabraPropuesta,
  normalizarPropuesta,
  propuestasDe,
  bulletsDe,
  cargadosDe,
  esValor,
  etiquetaDeBullet,
  familiaDe,
  fueraDeAlcance,
  opcionesDe,
  textoDeBullet,
  valoresDe,
  valoresPrestados,
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

describe('🔴 el valor sale de una lista cerrada, y el servidor lo chequea', () => {
  // 🔴 Este bloque cambió el 1-sep-2026 y ⛔ no se borró ni una sola aserción: hasta ese día
  // exigía «el valor tiene que ser de la lista de ESTA familia», y hoy exige «tiene que ser de
  // la lista de ALGUNA familia». Lo pidió Bruno usando la pantalla —un short de ecocuero cae en
  // `faldas`, cuyo `calce` ofrece palabras de pollera y ninguna le sirve. Lo que la lista cerrada
  // existía para impedir sigue impedido: un valor inventado NO entra, que es de lo que depende
  // que el catálogo se pueda sumar.

  it('un calce de pantalón SE PUEDE PRESTAR en un top, y el propio sigue valiendo', () => {
    expect(esValor('pantalon', 'calce', 'wide leg')).toBe(true)
    expect(esValor('tops', 'calce', 'wide leg')).toBe(true)
    expect(esValor('tops', 'calce', 'entallado')).toBe(true)
    // Y prestado NO es lo mismo que propio: el desplegable los separa.
    expect(valoresDe('tops', 'calce')).not.toContain('wide leg')
    expect(valoresPrestados('tops', 'calce')).toContain('wide leg')
  })

  it('un largo de falda se puede prestar en un pantalón', () => {
    expect(esValor('faldas', 'largo', 'mini')).toBe(true)
    expect(esValor('pantalon', 'largo', 'mini')).toBe(true)
    expect(valoresDe('pantalon', 'largo')).not.toContain('mini')
  })

  it('🔴 un valor que no existe en NINGUNA familia sigue sin valer', () => {
    expect(esValor('tops', 'calce', 'apretadito')).toBe(false)
    expect(esValor('pantalon', 'largo', 'hasta el piso')).toBe(false)
    expect(esValor('tops', 'escote', 'redondito')).toBe(false)
  })

  it('un atributo que la familia no pide se puede SUMAR, pero uno inventado no existe', () => {
    expect(esValor('tops', 'tiro', 'tiro alto')).toBe(true)
    expect(esValor('pantalon', 'escote', 'en V')).toBe(true)
    // @ts-expect-error — un atributo que no está en el diccionario
    expect(esValor('tops', 'color', 'negro')).toBe(false)
    // @ts-expect-error — una familia inventada tampoco
    expect(esValor('camisas', 'calce', 'entallado')).toBe(false)
  })

  it('⛔ «no aplica» vale en todo atributo cerrado MENOS tela', () => {
    expect(esValor('tops', 'manga', NO_APLICA)).toBe(true)
    expect(esValor('pantalon', 'largo', NO_APLICA)).toBe(true)
    // Tela ya tiene «no identifico», que contesta otra cosa: dos maneras de decir lo mismo en la
    // misma lista es lo que hace que después no se pueda sumar.
    expect(esValor('tops', 'tela', NO_APLICA)).toBe(false)
    expect(opcionesDe('tops', 'tela').noAplica).toBe(false)
    expect(opcionesDe('tops', 'manga').noAplica).toBe(true)
  })

  it('el detalle es libre: cualquier texto vale', () => {
    expect(esValor('tops', 'detalle', 'argolla plateada en el medio')).toBe(true)
  })
})

describe('🔑 el «+ agregar un dato»: los atributos de las otras familias', () => {
  it('faldas no pide silueta, y por eso silueta es un extra suyo', () => {
    expect(atributosDe('faldas').map((a) => a.key)).not.toContain('silueta')
    expect(atributosExtra('faldas').map((a) => a.key)).toContain('silueta')
  })

  it('⛔ un extra nunca es también un campo propio', () => {
    for (const fam of Object.keys(FAMILIAS) as Familia[]) {
      const propios = new Set(atributosDe(fam).map((a) => a.key))
      for (const e of atributosExtra(fam)) expect(propios.has(e.key)).toBe(false)
    }
  })

  it('el extra llega con valores para elegir: sumarlo sin lista sería un campo muerto', () => {
    for (const fam of Object.keys(FAMILIAS) as Familia[]) {
      for (const e of atributosExtra(fam)) {
        if (e.libre) continue
        expect(e.valores.length).toBeGreaterThan(0)
      }
    }
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

describe('el bullet no grita: lo que está TODO en mayúsculas baja a minúscula', () => {
  // Lo pidió Bruno el 4-sep-2026 mirando la primera ficha real: el local carga el `detalle` en
  // mayúsculas («DETALLE EN EL BOLSILLO») y así salía a la tienda.
  it('el detalle en mayúsculas sale en minúscula', () => {
    // ⚠️ «DETALLE EN EL BOLSILLO» pierde además la etiqueta repetida, que es la regla de al lado:
    // el bullet ya dice «Detalle:». Las dos cosas se aplican al mismo valor.
    expect(textoDeBullet('detalle', 'DETALLE EN EL BOLSILLO')).toBe('en el bolsillo')
    expect(textoDeBullet('detalle', 'CON LENTEJUELAS')).toBe('con lentejuelas')
    expect(textoDeBullet('detalle', 'TRANSPARENTE')).toBe('transparente')
    expect(textoDeBullet('detalle', 'ESTAMPA DE LUNARES')).toBe('estampa de lunares')
  })

  it('los acentos también bajan', () => {
    expect(textoDeBullet('detalle', 'CON APLIQUE DE CORAZÓN')).toBe('con aplique de corazón')
  })

  it('🔴 la mezcla se resuelve PALABRA POR PALABRA: el caso real de Bruno', () => {
    // Cargado en mayúsculas por el local y corregido a mano después. Con la regla mirando el valor
    // entero, esa única minúscula dejaba las otras cuatro palabras gritando.
    expect(textoDeBullet('detalle', 'DETALLE EN EL BOLSILLO trasero')).toBe('en el bolsillo trasero')
    expect(textoDeBullet('detalle', 'CON LENTEJUELAS en el ruedo')).toBe('con lentejuelas en el ruedo')
  })

  it('⛔ lo que tiene mezcla queda como lo escribieron', () => {
    expect(textoDeBullet('detalle', 'argolla plateada en el medio')).toBe('argolla plateada en el medio')
    // ⛔ Una letra sola es la forma que nombra, no un grito.
    expect(textoDeBullet('detalle', 'cuello V')).toBe('cuello V')
    expect(textoDeBullet('detalle', 'ESCOTE EN V')).toBe('escote en V')
    expect(textoDeBullet('detalle', '100% ALGODÓN')).toBe('100% algodón')
    expect(textoDeBullet('detalle', 'Con Argolla Plateada')).toBe('Con Argolla Plateada')
  })

  it('las listas cerradas no cambian: ya vienen en minúscula', () => {
    expect(textoDeBullet('tela', 'denim rígido')).toBe('denim rígido')
    expect(textoDeBullet('manga', 'manga larga')).toBe('larga')
  })

  it('y sale así en el bullet compuesto, que es lo que ve la clienta', () => {
    expect(bulletsDe('pantalon', { tela: 'denim rígido', detalle: 'DETALLE EN EL BOLSILLO' })).toEqual([
      { etiqueta: 'Tela', texto: 'denim rígido' },
      { etiqueta: 'Detalle', texto: 'en el bolsillo' },
    ])
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

  it('🔴 un valor INVENTADO no se dibuja, aunque esté guardado', () => {
    // El guard del servidor puede haber sido salteado por un dato viejo: el que compone
    // vuelve a preguntar. Que la lista sea cerrada no puede depender de quién la escribió.
    expect(bulletsDe('tops', { calce: 'apretadito', tela: 'lino' })).toEqual([
      { etiqueta: 'Tela', texto: 'lino' },
    ])
  })

  it('⛔ «no aplica» se guarda pero NO sale a la ficha', () => {
    expect(bulletsDe('tops', { manga: NO_APLICA, tela: 'lino' })).toEqual([
      { etiqueta: 'Tela', texto: 'lino' },
    ])
  })

  it('🔑 un atributo SUMADO de otra familia sí se dibuja, y en el orden canónico', () => {
    // Si el «+ agregar un dato» guardara algo que después no se compone, el gesto no haría nada.
    // Tiro es orden 4 y largo orden 7: el sumado se ordena por la lista, no por cuándo se cargó.
    expect(bulletsDe('faldas', { largo: 'mini', silueta: 'oversize', tela: 'lino' })).toEqual([
      { etiqueta: 'Tela', texto: 'lino' },
      { etiqueta: 'Silueta', texto: 'oversize' },
      { etiqueta: 'Largo', texto: 'mini' },
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

describe('🔑 la palabra propuesta: el escape que NO abre la lista', () => {
  it('tiene que tener forma de etiqueta, no de frase', () => {
    expect(esPalabraPropuesta('forrado')).toBe(true)
    expect(esPalabraPropuesta('con ballenas')).toBe(true)
    // ⛔ Esto es una descripción, y sería el campo de texto libre por la puerta de atrás.
    expect(esPalabraPropuesta('top negro con ballenas y encaje')).toBe(false)
    expect(esPalabraPropuesta('a')).toBe(false)
    expect(esPalabraPropuesta('')).toBe(false)
    // Termina pegado en la descripción de un producto el día que se apruebe.
    expect(esPalabraPropuesta('<b>x</b>')).toBe(false)
    expect(esPalabraPropuesta('x'.repeat(MAX_PROPUESTA + 1))).toBe(false)
  })

  it('🔴 se normaliza, o el escape trae de vuelta el problema que evita la lista', () => {
    // «Wide Leg» y «wide leg » serían dos filas distintas en el group by.
    expect(normalizarPropuesta('  Wide  Leg ')).toBe('wide leg')
  })

  it('es propuesta lo que NO está en ninguna lista, y se deriva: no hace falta marcarlo', () => {
    const p = propuestasDe('tops', { tela: 'microfibra', escote: 'forrado', calce: 'entallado' })
    expect(p.map((x) => x.valor)).toEqual(['forrado'])
  })

  it('⛔ un valor prestado de otra prenda NO es una propuesta', () => {
    expect(propuestasDe('tops', { calce: 'wide leg' })).toEqual([])
  })

  it('🔴 y mientras sea propuesta NO se publica: el bullet no sale', () => {
    // Es texto que lee una clienta: un error de tipeo ⛔ no puede llegar solo a la tienda.
    expect(bulletsDe('tops', { tela: 'microfibra', escote: 'forrado' })).toEqual([
      { etiqueta: 'Tela', texto: 'microfibra' },
    ])
  })

  it('🔑 el día que la palabra entra al diccionario, deja de ser propuesta sola', () => {
    // No hay migración: `bandó` y `volcado` entraron así. Lo que prueba el mecanismo es que un
    // valor que YA está en la lista nunca aparece como propuesta.
    for (const v of ATRIBUTOS.escote.valores || []) {
      expect(propuestasDe('tops', { escote: v })).toEqual([])
    }
  })
})
