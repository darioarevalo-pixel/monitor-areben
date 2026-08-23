/**
 * El markdown chiquito de Novedades y Manuales.
 *
 * Se prueba sobre `parsearMd`, que devuelve datos: sin React, sin DOM, sin montar nada. Lo que
 * importa acá son dos cosas — que cada regla haga lo suyo, y que **lo que no matchea se vea tal
 * cual en vez de desaparecer**, porque un hueco en blanco no dice qué se escribió mal.
 */

import { describe, expect, it } from 'vitest'
import { indiceDe, parsearMd, parsearTrozos, type Bloque, type Trozo } from '@/lib/markdown/core'

const texto = (ts: Trozo[]) => ts.map((t) => t.v).join('')

/**
 * El texto plano de un bloque, para no escribir el árbol entero en cada expect.
 *
 * Los sub-renglones de una lista salen entre paréntesis (`padre (sub · sub)`) y las filas de una
 * tabla separadas por `/`: alcanza para ver que cada cosa cayó donde tenía que caer, sin volver a
 * escribir la estructura.
 */
function plano(b: Bloque): string {
  if (b.t === 'codigo') return b.texto
  if (b.t === 'lista') {
    return b.items
      .map((i) => texto(i.hijos) + (i.sub ? ` (${i.sub.items.map(texto).join(' · ')})` : ''))
      .join(' | ')
  }
  if (b.t === 'tabla') {
    return [b.encabezado, ...b.filas].map((f) => f.map(texto).join(' | ')).join(' / ')
  }
  if (b.t === 'recuadro') return b.parrafos.map(texto).join(' // ')
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

describe('tablas', () => {
  const T = '| Qué | Quién |\n|---|---|\n| Abrir la caja | Local |\n| Cerrarla | Admin |'

  it('encabezado y filas, con o sin los pipes de los bordes', () => {
    const b = parsearMd(T)
    expect(b[0].t).toBe('tabla')
    expect(plano(b[0])).toBe('Qué | Quién / Abrir la caja | Local / Cerrarla | Admin')
    // Sin los pipes de los bordes da exactamente lo mismo: nadie la escribe dos veces igual.
    expect(plano(parsearMd('Qué | Quién\n---|---\nAbrir | Local')[0])).toBe('Qué | Quién / Abrir | Local')
  })

  it('la alineación sale de la fila de guiones', () => {
    const b = parsearMd('| a | b | c | d |\n| :-- | :--: | --: | --- |\n| 1 | 2 | 3 | 4 |')
    expect(b[0]).toMatchObject({ alineacion: ['izq', 'centro', 'der', 'izq'] })
  })

  /**
   * 🔑 La regla de oro del parser aplicada donde equivocarse cuesta más caro: un renglón suelto con
   * un pipe adentro es texto, no una tabla de una fila. Sin la fila de guiones no hay tabla.
   */
  it('sin la fila de guiones NO es una tabla: es un párrafo con pipes', () => {
    const b = parsearMd('Rioja 1234 | timbre 2')
    expect(b[0].t).toBe('parrafo')
    expect(plano(b[0])).toBe('Rioja 1234 | timbre 2')
  })

  it('y la de abajo tiene que ser guiones DE VERDAD, no una línea con un guion adentro', () => {
    // Éste es el caso que decide la regla: sin mirar la forma de cada celda, cualquier renglón con
    // un guion convertiría al de arriba en encabezado de tabla.
    const b = parsearMd('Qué | Quién\nesto - no es la fila de guiones')
    expect(b.every((x) => x.t === 'parrafo')).toBe(true)
  })

  it('las columnas las manda el encabezado: la fila corta se rellena y la larga se corta', () => {
    const b = parsearMd('| a | b |\n|---|---|\n| sola |\n| 1 | 2 | 3 |')
    // La celda que falta queda vacía, no ausente: la tabla no se dienta.
    expect(plano(b[0])).toBe('a | b / sola |  / 1 | 2')
  })

  it('un pipe escapado NO parte la celda', () => {
    // Sin esto una dirección con timbre se cortaría en dos columnas.
    const b = parsearMd('| Dirección |\n|---|\n| Rioja 1234 \\| timbre 2 |')
    expect(plano(b[0])).toBe('Dirección / Rioja 1234 | timbre 2')
  })

  it('la tabla se corta donde se acaban los pipes', () => {
    const b = parsearMd('| a |\n|---|\n| 1 |\nY esto ya es un párrafo.')
    expect(b.map((x) => x.t)).toEqual(['tabla', 'parrafo'])
  })

  it('el formato de adentro de una celda se sigue leyendo', () => {
    const b = parsearMd('| qué |\n|---|\n| la **caja** |')
    expect(b[0].t === 'tabla' && b[0].filas[0][0].some((t) => t.t === 'negrita')).toBe(true)
  })
})

describe('recuadros', () => {
  it('los tres rótulos, cada uno con su tono', () => {
    const b = parsearMd('> [!REGLA]\n> Se despacha con el pago acreditado.\n\n> [!OJO]\n> Mirá el talle.\n\n> [!NUNCA]\n> No anules en GN.')
    expect(b.map((x) => x.t === 'recuadro' && x.tono)).toEqual(['regla', 'ojo', 'nunca'])
    expect(plano(b[0])).toBe('Se despacha con el pago acreditado.')
  })

  it('un `>` vacío separa párrafos adentro del mismo recuadro', () => {
    const b = parsearMd('> [!OJO]\n> Primero esto.\n>\n> Y después esto.')
    expect(plano(b[0])).toBe('Primero esto. // Y después esto.')
  })

  /** No se inventa una cita común: acá no existe, y un bloque que no se pidió es peor que el texto. */
  it('un `>` sin uno de los tres rótulos se ve TAL CUAL', () => {
    const b = parsearMd('> [!NOTA]\n> algo')
    expect(b.every((x) => x.t === 'parrafo')).toBe(true)
    expect(b.map(plano).join(' ')).toContain('[!NOTA]')
    expect(parsearMd('> una cita cualquiera')[0].t).toBe('parrafo')
  })

  it('el rótulo no distingue mayúsculas, y el recuadro se corta donde se corta la cita', () => {
    const b = parsearMd('> [!ojo]\n> adentro\nafuera')
    expect(b.map((x) => x.t)).toEqual(['recuadro', 'parrafo'])
    expect(plano(b[0])).toBe('adentro')
    expect(plano(b[1])).toBe('afuera')
  })

  it('un rótulo solo, sin nada abajo, no explota', () => {
    const b = parsearMd('> [!REGLA]')
    expect(b[0]).toMatchObject({ t: 'recuadro', tono: 'regla', parrafos: [] })
  })
})

describe('listas anidadas', () => {
  it('4 espacios o un tab cuelgan el renglón del de arriba', () => {
    expect(plano(parsearMd('- uno\n    - uno a\n    - uno b\n- dos')[0])).toBe('uno (uno a · uno b) | dos')
    expect(plano(parsearMd('- uno\n\t- con tab')[0])).toBe('uno (con tab)')
  })

  /**
   * 🔴 El caso que decide la sangría: el patrón de primer nivel acepta hasta 3 espacios, así que en
   * los manuales YA ESCRITOS un ítem con 2 adelante es de primer nivel. Pedir 4 no le cambia la
   * forma a nada de lo cargado.
   */
  it('con 2 espacios sigue siendo de primer nivel, como en lo que ya está escrito', () => {
    expect(plano(parsearMd('- uno\n  - dos')[0])).toBe('uno | dos')
  })

  it('la sub-lista es ordenada según SU primer renglón, no según la de afuera', () => {
    const b = parsearMd('- pasos\n    1. primero\n    2. después')
    expect(b[0].t === 'lista' && b[0].items[0].sub?.ordenada).toBe(true)
    expect(b[0].t === 'lista' && b[0].ordenada).toBe(false)
  })

  it('un renglón sangrado NO abre una lista: se ve tal cual', () => {
    // Colgarlo de la nada sería inventarle un padre que nadie escribió, y tragárselo sería peor.
    const b = parsearMd('    - huérfano')
    expect(b[0].t).toBe('parrafo')
    expect(plano(b[0])).toBe('- huérfano')
  })

  it('un renglón en blanco corta la lista, y lo sangrado de después ya no es de nadie', () => {
    const b = parsearMd('- uno\n\n    - lejos')
    expect(b.map((x) => x.t)).toEqual(['lista', 'parrafo'])
    expect(plano(b[0])).toBe('uno')
  })

  it('dos niveles no existen: el segundo se aplana contra el primero', () => {
    const b = parsearMd('- uno\n    - dos\n        - tres')
    expect(plano(b[0])).toBe('uno (dos · tres)')
  })
})

describe('#### es un cuarto nivel de título', () => {
  it('entra, y entra al índice con su nivel', () => {
    const b = parsearMd('#### Un rótulo')
    expect(b[0]).toMatchObject({ t: 'titulo', nivel: 4 })
    expect(indiceDe(parsearMd('## a\n### b\n#### c')).map((x) => x.nivel)).toEqual([2, 3, 4])
  })

  it('##### ya no: cinco no es un nivel, es un error de tipeo', () => {
    expect(parsearMd('##### Cinco')[0].t).toBe('parrafo')
  })
})
