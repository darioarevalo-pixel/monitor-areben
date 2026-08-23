/**
 * El markdown chiquito de Novedades y Manuales.
 *
 * Se prueba sobre `parsearMd`, que devuelve datos: sin React, sin DOM, sin montar nada. Lo que
 * importa acá son dos cosas — que cada regla haga lo suyo, y que **lo que no matchea se vea tal
 * cual en vez de desaparecer**, porque un hueco en blanco no dice qué se escribió mal.
 */

import { describe, expect, it } from 'vitest'
import { indiceDe, parsearMd, parsearTrozos, type Bloque } from '@/lib/markdown/core'

/** El texto plano de un bloque, para no escribir el árbol entero en cada expect. */
function plano(b: Bloque): string {
  if (b.t === 'codigo') return b.texto
  if (b.t === 'lista') return b.items.map((i) => i.map((t) => t.v).join('')).join(' | ')
  return b.hijos.map((t) => t.v).join('')
}

describe('bloques', () => {
  it('los títulos son ## y ###', () => {
    const b = parsearMd('## Uno\n### Dos')
    expect(b.map((x) => x.t)).toEqual(['titulo', 'titulo'])
    expect(b[0]).toMatchObject({ nivel: 2 })
    expect(b[1]).toMatchObject({ nivel: 3 })
  })

  it('un # solo NO es título: el h1 es el de la sección', () => {
    const b = parsearMd('# Esto no')
    expect(b[0].t).toBe('parrafo')
    expect(plano(b[0])).toBe('# Esto no')
  })

  it('dos saltos separan párrafos, uno solo une', () => {
    const b = parsearMd('uno\ndos\n\ntres')
    expect(b).toHaveLength(2)
    expect(plano(b[0])).toBe('uno dos')
    expect(plano(b[1])).toBe('tres')
  })

  it('listas con - y con *, y numeradas', () => {
    const b = parsearMd('- a\n- b\n\n1. x\n2. y')
    expect(b[0]).toMatchObject({ t: 'lista', ordenada: false })
    expect(plano(b[0])).toBe('a | b')
    expect(b[1]).toMatchObject({ t: 'lista', ordenada: true })
    expect(plano(b[1])).toBe('x | y')
  })

  it('una lista pegada a un párrafo corta el párrafo', () => {
    const b = parsearMd('texto\n- a')
    expect(b.map((x) => x.t)).toEqual(['parrafo', 'lista'])
  })

  it('el bloque de código conserva los saltos y no se interpreta', () => {
    const b = parsearMd('```\nnpm run **build**\n  sangría\n```')
    expect(b[0].t).toBe('codigo')
    expect(plano(b[0])).toBe('npm run **build**\n  sangría')
  })

  it('una cerca sin cerrar se come lo que queda, no rompe', () => {
    const b = parsearMd('```\nasí quedó')
    expect(b).toHaveLength(1)
    expect(plano(b[0])).toBe('así quedó')
  })

  it('el texto vacío da una lista vacía, no explota', () => {
    expect(parsearMd('')).toEqual([])
    expect(parsearMd('   \n\n  ')).toEqual([])
  })
})

describe('trozos', () => {
  it('negrita y código inline', () => {
    expect(parsearTrozos('esto es **fuerte** y `code`')).toEqual([
      { t: 'texto', v: 'esto es ' },
      { t: 'negrita', v: 'fuerte' },
      { t: 'texto', v: ' y ' },
      { t: 'codigo', v: 'code' },
    ])
  })

  it('un ** sin cerrar se ve tal cual', () => {
    expect(parsearTrozos('queda **así')).toEqual([{ t: 'texto', v: 'queda **así' }])
  })

  it('la itálica es con guion bajo; el asterisco simple sigue siendo un asterisco', () => {
    expect(parsearTrozos('_sí_')).toEqual([{ t: 'italica', v: 'sí' }])
    expect(parsearTrozos('*no*')).toEqual([{ t: 'texto', v: '*no*' }])
  })

  it('un guion bajo en medio de una palabra no abre cursiva', () => {
    expect(parsearTrozos('el campo publicada_at de la tabla')).toEqual([
      { t: 'texto', v: 'el campo publicada_at de la tabla' },
    ])
    expect(parsearTrozos('mirá api/_sistema.js')).toEqual([{ t: 'texto', v: 'mirá api/_sistema.js' }])
  })

  it('un _ sin cerrar, o con espacio pegado, se ve tal cual', () => {
    expect(parsearTrozos('queda _así')).toEqual([{ t: 'texto', v: 'queda _así' }])
    expect(parsearTrozos('esto _ y esto _ no')).toEqual([{ t: 'texto', v: 'esto _ y esto _ no' }])
  })

  it('los links http y https son externos', () => {
    expect(parsearTrozos('[la tienda](https://zattia.com.ar)')).toEqual([
      { t: 'link', v: 'la tienda', href: 'https://zattia.com.ar', externo: true },
    ])
  })

  it('una ruta interna es link y NO abre en otra pestaña', () => {
    expect(parsearTrozos('[Atención](/atencion)')).toEqual([
      { t: 'link', v: 'Atención', href: '/atencion', externo: false },
    ])
  })

  it('una URL suelta no se autolinkea', () => {
    expect(parsearTrozos('https://zattia.com.ar')).toEqual([{ t: 'texto', v: 'https://zattia.com.ar' }])
  })
})

describe('lo que no se acepta como link', () => {
  // Lista blanca: todo lo que no sea http(s) o ruta interna se degrada a TEXTO, con los corchetes
  // puestos, para que se vea qué se escribió.
  it.each([
    ['javascript:', '[x](javascript:alert(1))'],
    ['data:', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
    ['protocolo-relativo', '[x](//otro-dominio.com)'],
    ['sin protocolo', '[x](zattia.com.ar)'],
    ['vacío', '[x]()'],
  ])('%s no es un link', (_caso, texto) => {
    const ts = parsearTrozos(texto)
    expect(ts.every((t) => t.t === 'texto')).toBe(true)
    expect(ts.map((t) => t.v).join('')).toBe(texto)
  })

  it('`//` no cuenta como ruta interna aunque empiece con barra', () => {
    // El navegador la resuelve como externa con el protocolo actual. Es el caso que se cuela solo.
    expect(parsearTrozos('[x](//evil.com)')[0]).toMatchObject({ t: 'texto' })
  })
})

describe('el índice: las anclas de los títulos', () => {
  it('el ancla sale del texto, sin acentos y en kebab', () => {
    expect(indiceDe(parsearMd('## Configuración de la caja'))).toEqual([
      { nivel: 2, texto: 'Configuración de la caja', ancla: 'configuracion-de-la-caja' },
    ])
  })

  it('el formato de adentro no ensucia ni el texto ni el ancla', () => {
    const i = indiceDe(parsearMd('## Cómo se **cierra** la `caja`'))
    expect(i[0].texto).toBe('Cómo se cierra la caja')
    expect(i[0].ancla).toBe('como-se-cierra-la-caja')
  })

  /**
   * 🔑 El caso entero por el que el ancla la calcula el parser y no la pantalla: el componente ve
   * un título por vez y no puede saber que ya hubo otro igual. Sin esto, el índice de un manual con
   * dos «Cómo se hace» manda siempre al primero, y en silencio.
   */
  it('dos títulos iguales NO comparten ancla', () => {
    const i = indiceDe(parsearMd('## Cómo se hace\n### Cómo se hace\n## Cómo se hace'))
    expect(i.map((x) => x.ancla)).toEqual(['como-se-hace', 'como-se-hace-2', 'como-se-hace-3'])
  })

  it('un título sin una sola letra tiene ancla igual, y única', () => {
    // Un `id` vacío no es un ancla rota: es un ancla que apunta a cualquier lado.
    const i = indiceDe(parsearMd('## 🎉\n## ✅'))
    expect(i.map((x) => x.ancla)).toEqual(['titulo', 'titulo-2'])
  })

  it('un documento sin títulos no tiene índice, y no explota', () => {
    expect(indiceDe(parsearMd('Un párrafo suelto.\n\n- y una lista'))).toEqual([])
    expect(indiceDe(parsearMd(''))).toEqual([])
  })

  it('respeta el orden del documento y conserva el nivel', () => {
    const i = indiceDe(parsearMd('## Uno\n### Uno bis\n## Dos'))
    expect(i.map((x) => `${x.nivel}:${x.ancla}`)).toEqual(['2:uno', '3:uno-bis', '2:dos'])
  })
})
