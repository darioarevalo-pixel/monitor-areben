/**
 * El bloque de medidas que sale a la tienda: lo que la clienta lee.
 *
 * ⚠️ Los oráculos de acá son los **defectos medidos el 1-sep-2026 contra la tienda viva**, no
 * casos inventados: la tabla vacía de VESTIDO SOLANA, la cintura sin multiplicar, y la ficha que
 * se contradecía sola.
 */
import { describe, expect, it } from 'vitest'
import { htmlDeMedidas } from '../lib/tn-medidas/bloque.core.js'
import { ESTIRA } from '../lib/tn-medidas/medidas'
import { componer, conservaLaTabla, partir } from '../lib/tn-desc/bloques'

const cargadas = { S: { contornoCintura: '34', largo: '92' }, M: { contornoCintura: '37', largo: '92' } }

describe('🔴 la cintura sale al doble, y sólo la cintura', () => {
  it('34 medidos se publican 68', () => {
    const h = htmlDeMedidas('faldas', {}, ['S', 'M'], cargadas)
    expect(h).toContain('>68<')
    expect(h).toContain('>74<')
    // El largo no se toca.
    expect(h).toContain('>92<')
    expect(h).not.toContain('>184<')
  })
})

describe('🔴 una tabla sin números NO se publica: el caso VESTIDO SOLANA', () => {
  it('sin ninguna medida cargada devuelve la cadena vacía', () => {
    expect(htmlDeMedidas('faldas', {}, ['S'], {})).toBe('')
  })

  it('con todo marcado «estira» tampoco hay tabla', () => {
    expect(htmlDeMedidas('tops', { manga: 'sin mangas' }, [''], { '': { ancho: ESTIRA } })).toBe('')
  })

  it('la fila que estira desaparece; la que tiene números queda', () => {
    const h = htmlDeMedidas('tops', { manga: 'sin mangas' }, [''], { '': { ancho: ESTIRA, largo: '40' } })
    expect(h).toContain('Largo')
    expect(h).not.toContain('>Ancho<')
    expect(h).toContain('>40<')
  })

  it('un talle a medias sale con guion, porque es un talle sin medir y no una fila que no va', () => {
    const h = htmlDeMedidas('faldas', {}, ['S', 'M'], { S: { largo: '92' } })
    expect(h).toContain('>92<')
    expect(h).toContain('>-<')
  })
})

describe('🔴 la ficha deja de contradecirse sola', () => {
  it('dice UNA vez cómo están tomadas, y coincide con el número publicado', () => {
    const h = htmlDeMedidas('faldas', {}, ['S'], { S: { contornoCintura: '34', largo: '92' } })
    expect(h).toContain('apoyada y plana')
    // ⛔ Lo que decía el bloque viejo diez líneas más abajo de «superficies planas».
    expect(h).not.toContain('alrededor de toda')
    // Y explica la fila que falta, en vez de dejar una tabla que parece incompleta.
    expect(h).toContain('elastizadas')
  })

  it('los rótulos son la palabra del dibujo, no letras', () => {
    const h = htmlDeMedidas('faldas', {}, ['S'], { S: { largo: '92' } })
    expect(h).toContain('Largo')
    expect(h).not.toMatch(/>a\. /)
  })

  it('sin eje de talle la columna se llama «cm», no «Talle único»', () => {
    const h = htmlDeMedidas('faldas', {}, [], { '': { largo: '92' } })
    expect(h).toContain('>cm<')
  })
})

describe('🔴 la tabla nueva REEMPLAZA la vieja, y nunca se suman dos', () => {
  const vieja = '<!--AREBEN-TALLES-INI--><table><tr><td>vieja</td></tr></table><!--AREBEN-TALLES-FIN-->'
  const actual = `<p>prosa suelta</p>${vieja}`

  it('usa la misma firma, así que la vieja se va con la nueva', () => {
    const nueva = htmlDeMedidas('faldas', {}, ['S'], { S: { largo: '92' } })
    const out = componer(actual, '<!--AREBEN-PROSA-INI-->nueva prosa<!--AREBEN-PROSA-FIN-->', { htmlTalles: nueva })
    expect(out).not.toContain('vieja')
    expect(out).toContain('>92<')
    // Una sola tabla, no dos.
    expect(out.match(/AREBEN-TALLES-INI/g)).toHaveLength(1)
  })

  it('⛔ una tabla nueva VACÍA no borra la que había', () => {
    const out = componer(actual, '<!--AREBEN-PROSA-INI-->x<!--AREBEN-PROSA-FIN-->', { htmlTalles: '' })
    expect(out).toContain('vieja')
    expect(partir(out).talles).toBe(vieja)
  })

  it('🔑 el guard sigue prendido: exige que la nueva esté ENTERA en el resultado', () => {
    const nueva = htmlDeMedidas('faldas', {}, ['S'], { S: { largo: '92' } })
    expect(conservaLaTabla(actual, `prosa\n${nueva}`, nueva)).toBe(true)
    // Reemplazar mal —perder las dos— sigue siendo un error, aunque venga `htmlTalles`.
    expect(conservaLaTabla(actual, 'prosa y nada más', nueva)).toBe(false)
    // Y sin reemplazo, el guard es el de siempre.
    expect(conservaLaTabla(actual, 'prosa y nada más')).toBe(false)
  })
})
