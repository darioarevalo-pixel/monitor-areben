/**
 * La barra de formato del editor de novedades.
 *
 * Se prueba sobre `aplicar`, que toma texto + selección y devuelve texto + selección: sin React, sin
 * DOM, sin montar nada. El componente sólo lee `selectionStart/End` y los repone.
 */

import { describe, expect, it } from 'vitest'
import { aplicar } from '@/lib/markdown/barra'
import { parsearMd, parsearTrozos } from '@/lib/markdown/core'

/** Marca `palabra` dentro de `texto` y aplica la marca, para no contar índices a mano en cada test. */
function sobre(texto: string, palabra: string, m: Parameters<typeof aplicar>[3]) {
  const i = texto.indexOf(palabra)
  return aplicar(texto, i, i + palabra.length, m)
}

describe('envolver', () => {
  it('pone la negrita alrededor de lo marcado y deja marcado lo mismo', () => {
    const r = sobre('hola mundo', 'mundo', 'negrita')
    expect(r.texto).toBe('hola **mundo**')
    expect(r.texto.slice(r.ini, r.fin)).toBe('mundo')
  })

  it('vuelve a tocar y la saca, aunque los asteriscos queden afuera de lo marcado', () => {
    const r = sobre('hola **mundo**', 'mundo', 'negrita')
    expect(r.texto).toBe('hola mundo')
    expect(r.texto.slice(r.ini, r.fin)).toBe('mundo')
  })

  it('sin nada marcado deja el cursor en el medio, listo para escribir', () => {
    const r = aplicar('hola ', 5, 5, 'negrita')
    expect(r.texto).toBe('hola ****')
    expect(r.ini).toBe(7)
    expect(r.fin).toBe(7)
  })

  it('la cursiva usa guion bajo, que es lo que el parser entiende', () => {
    expect(sobre('esto va en cursiva', 'cursiva', 'italica').texto).toBe('esto va en _cursiva_')
  })

  it('el link deja el cursor pegado a https:// y el texto en los corchetes', () => {
    const r = sobre('mirá el panel acá', 'panel', 'link')
    expect(r.texto).toBe('mirá el [panel](https://) acá')
    expect(r.texto.slice(0, r.ini).endsWith('https://')).toBe(true)
  })
})

describe('prefijar líneas', () => {
  it('pone el guion en cada renglón que la selección toca, aunque lo toque por un carácter', () => {
    const t = 'uno\ndos\ntres'
    const r = aplicar(t, 1, t.indexOf('tres') + 1, 'lista')
    expect(r.texto).toBe('- uno\n- dos\n- tres')
  })

  it('volver a tocarlo se lo saca', () => {
    const t = '- uno\n- dos'
    expect(aplicar(t, 0, t.length, 'lista').texto).toBe('uno\ndos')
  })

  it('numera de verdad y no repite el 1', () => {
    const t = 'uno\ndos\ntres'
    expect(aplicar(t, 0, t.length, 'numerada').texto).toBe('1. uno\n2. dos\n3. tres')
  })

  it('destildar una numerada de varios renglones los limpia todos', () => {
    const t = '1. uno\n2. dos\n3. tres'
    expect(aplicar(t, 0, t.length, 'numerada').texto).toBe('uno\ndos\ntres')
  })

  it('los prefijos son excluyentes: una lista que pasa a título no queda con las dos', () => {
    expect(aplicar('- uno', 0, 5, 'titulo').texto).toBe('## uno')
  })

  it('una selección que termina justo en el salto no arrastra el renglón siguiente', () => {
    const t = 'uno\ndos'
    expect(aplicar(t, 0, 4, 'lista').texto).toBe('- uno\ndos')
  })

  it('los renglones en blanco quedan en blanco', () => {
    const t = 'uno\n\ndos'
    expect(aplicar(t, 0, t.length, 'lista').texto).toBe('- uno\n\n- dos')
  })
})

describe('lo que escribe la barra lo entiende el parser', () => {
  it('la negrita y la cursiva salen como trozos, no como asteriscos', () => {
    const conNegrita = sobre('hola mundo', 'mundo', 'negrita').texto
    const conAmbas = sobre(conNegrita, 'hola', 'italica').texto
    expect(parsearTrozos(conAmbas)).toEqual([
      { t: 'italica', v: 'hola' },
      { t: 'texto', v: ' ' },
      { t: 'negrita', v: 'mundo' },
    ])
  })

  it('la lista sale como lista y el título como título', () => {
    const lista = aplicar('uno\ndos', 0, 7, 'lista').texto
    expect(parsearMd(lista)[0]).toMatchObject({ t: 'lista', ordenada: false })
    expect(parsearMd(aplicar('titulito', 0, 8, 'titulo').texto)[0]).toMatchObject({ t: 'titulo', nivel: 2 })
    expect(parsearMd(aplicar('uno\ndos', 0, 7, 'numerada').texto)[0]).toMatchObject({ t: 'lista', ordenada: true })
  })
})

describe('los bloques que se insertan enteros', () => {
  it('la tabla entra con su fila de guiones y deja marcada la primera columna', () => {
    const r = aplicar('', 0, 0, 'tabla')
    // Que salga parseable es lo único que importa: si no trae la fila de guiones, el botón escribe
    // un párrafo con pipes y el que lo aprieta no se entera.
    expect(parsearMd(r.texto)[0].t).toBe('tabla')
    expect(r.texto.slice(r.ini, r.fin)).toBe('Qué')
  })

  it('arranca en su propio renglón y despegada del párrafo de arriba', () => {
    const r = aplicar('Un párrafo.', 11, 11, 'tabla')
    expect(r.texto.startsWith('Un párrafo.\n\n|')).toBe(true)
    // Pegada al párrafo, el parser la leería como parte del párrafo y no se dibujaría.
    expect(parsearMd(r.texto).map((b) => b.t)).toEqual(['parrafo', 'tabla'])
  })

  it('el recuadro se lleva puesto lo que estaba marcado', () => {
    const r = aplicar('No anules en GN.', 0, 16, 'recuadro')
    const b = parsearMd(r.texto)
    expect(b[0]).toMatchObject({ t: 'recuadro', tono: 'ojo' })
    expect(b[0].t === 'recuadro' && b[0].parrafos[0].map((t) => t.v).join('')).toBe('No anules en GN.')
    // Y deja marcado el rótulo, que es la palabra que hay que cambiar por REGLA o NUNCA.
    expect(r.texto.slice(r.ini, r.fin)).toBe('OJO')
  })

  it('⛔ NO son toggle: apretarlo dos veces pone dos, no borra el primero', () => {
    // Una tabla no se desarma sacándole un prefijo, y un botón que a veces borra tres renglones no
    // se aprieta tranquilo.
    const uno = aplicar('', 0, 0, 'tabla')
    const dos = aplicar(uno.texto, uno.texto.length, uno.texto.length, 'tabla')
    expect(parsearMd(dos.texto).filter((b) => b.t === 'tabla')).toHaveLength(2)
  })

  it('el toggle de título ahora también destilda un ####', () => {
    // `regexCualquierPrefijo` tenía #{2,3}: sin actualizarlo, poner «Título» sobre un #### dejaba
    // `## #### así`.
    const r = aplicar('#### Un rótulo', 0, 14, 'titulo')
    expect(r.texto).toBe('## Un rótulo')
  })
})
