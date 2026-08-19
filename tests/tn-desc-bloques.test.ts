/**
 * Componer la descripción de TiendaNube sin romper lo que ya hay.
 *
 * 🔑 El caso que manda: medido el 19-ago-2026, 19 de los 369 publicados de Zattia tienen un
 * `<img>` adentro de la descripción, fuera de la tabla. Si el compositor tirara «el resto»,
 * se las comería en silencio — y del otro lado no hay historial.
 */

import { describe, it, expect } from 'vitest'
import { partir, componer, conservaLaTabla, tieneBloqueProsa } from '../lib/tn-desc/bloques'
import { generarHtml } from '../lib/tn-desc/formato'

const TALLES_FIRMADA =
  '<!--AREBEN-TALLES-INI--><div style="max-width:680px;"><h3>Tabla de talles — Top</h3>' +
  '<table><tr><td>S</td><td>92</td></tr></table></div><!--AREBEN-TALLES-FIN-->'
const TALLES_WRAPPER = // el generador viejo: mismo dibujo, sin la firma
  '<div style="font-family:Arial;max-width:680px;margin:0 auto;"><h3>Tabla</h3><table><tr><td>S</td></tr></table></div>'
const TABLA_SUELTA = '<table style="width: 735px;"><tbody><tr><td>TALLE</td></tr></tbody></table>'
const IMG = '<img src="https://acdn-us.mitiendanube.com/stores/004/445/369/x.jpg" alt="">'

const BORRADOR = {
  parrafo: 'Una camisa fluida que resuelve el día y aguanta la noche.',
  bullets: [
    { etiqueta: 'Tela', texto: 'gasa liviana con caída' },
    { etiqueta: 'Cuello', texto: 'solapa clásica' },
    { etiqueta: 'Calce', texto: 'holgado, cae del hombro' },
  ],
}

describe('partir: los tres pedazos, sin perder un carácter', () => {
  it('reconoce la tabla firmada', () => {
    const p = partir('<h5>Top de red.</h5>' + TALLES_FIRMADA)
    expect(p.talles).toBe(TALLES_FIRMADA)
    expect(p.residuo).toBe('<h5>Top de red.</h5>')
    expect(p.prosa).toBe('')
  })

  it('reconoce el wrapper del generador viejo, sin firma', () => {
    const p = partir('<h5>Top de red.</h5>' + TALLES_WRAPPER)
    expect(p.talles).toBe(TALLES_WRAPPER)
    expect(p.residuo).toBe('<h5>Top de red.</h5>')
  })

  it('reconoce una <table> suelta: las 149 tablas de otra fuente', () => {
    const p = partir('<h5>Top de red.</h5>' + TABLA_SUELTA)
    expect(p.talles).toBe(TABLA_SUELTA)
    expect(p.residuo).toBe('<h5>Top de red.</h5>')
  })

  it('el `<img>` cae en el residuo, que es lo que se conserva por default', () => {
    const p = partir('<h5>Corset.</h5>' + IMG + TALLES_FIRMADA)
    expect(p.residuo).toContain(IMG)
    expect(p.talles).toBe(TALLES_FIRMADA)
  })

  it('una descripción vacía no rompe nada', () => {
    expect(partir('')).toEqual({ prosa: '', talles: '', residuo: '' })
    expect(partir(null)).toEqual({ prosa: '', talles: '', residuo: '' })
  })
})

describe('componer: qué se conserva y qué se reemplaza', () => {
  const html = generarHtml(BORRADOR)

  it('la tabla firmada sobrevive BYTE A BYTE y queda abajo', () => {
    const nuevo = componer('<h5>vieja</h5>' + TALLES_FIRMADA, html)
    expect(nuevo).toContain(TALLES_FIRMADA)
    expect(nuevo.indexOf(TALLES_FIRMADA)).toBeGreaterThan(nuevo.indexOf('AREBEN-PROSA-INI'))
    expect(nuevo.endsWith(TALLES_FIRMADA)).toBe(true)
  })

  it('la tabla legacy y la suelta también sobreviven byte a byte', () => {
    expect(componer('<h5>x</h5>' + TALLES_WRAPPER, html)).toContain(TALLES_WRAPPER)
    expect(componer('<h5>x</h5>' + TABLA_SUELTA, html)).toContain(TABLA_SUELTA)
  })

  it('🔴 el `<img>` NO se pierde: es el default y no hay default destructivo', () => {
    const nuevo = componer('<h5>Corset.</h5>' + IMG + TALLES_FIRMADA, html)
    expect(nuevo).toContain(IMG)
    expect(nuevo).toContain('<h5>Corset.</h5>')
  })

  it('descartar el residuo es EXPLÍCITO, nunca por omisión', () => {
    const actual = '<h5>Corset.</h5>' + IMG + TALLES_FIRMADA
    expect(componer(actual, html, {})).toContain(IMG)
    expect(componer(actual, html, { conservarResiduo: true })).toContain(IMG)
    expect(componer(actual, html, { conservarResiduo: false })).not.toContain(IMG)
    // y aun descartando, la tabla se queda
    expect(componer(actual, html, { conservarResiduo: false })).toContain(TALLES_FIRMADA)
  })

  it('es idempotente: aplicarla dos veces da lo mismo que una', () => {
    const uno = componer('<h5>vieja</h5>' + TALLES_FIRMADA, html)
    expect(componer(uno, html)).toBe(uno)
    const otro = generarHtml({ ...BORRADOR, parrafo: 'Otro párrafo distinto.' })
    expect(componer(uno, otro)).toBe(componer(componer(uno, otro), otro))
  })

  it('reemplaza el bloque de prosa anterior en vez de acumular dos', () => {
    const uno = componer('<h5>vieja</h5>' + TALLES_FIRMADA, html, { conservarResiduo: false })
    const dos = componer(uno, generarHtml({ ...BORRADOR, parrafo: 'Nuevo.' }))
    expect(dos.match(/AREBEN-PROSA-INI/g)).toHaveLength(1)
    expect(dos).toContain('Nuevo.')
    expect(dos).not.toContain('aguanta la noche')
  })

  it('sobre un producto vacío (los 41) sale sólo el bloque de prosa', () => {
    expect(componer('', html)).toBe(html)
    expect(tieneBloqueProsa(componer('', html))).toBe(true)
  })
})

describe('conservaLaTabla: el invariante que chequea el servidor', () => {
  const html = generarHtml(BORRADOR)
  it('dice que sí cuando la tabla viajó', () => {
    const actual = '<h5>x</h5>' + TALLES_FIRMADA
    expect(conservaLaTabla(actual, componer(actual, html))).toBe(true)
  })
  it('🔴 dice que NO si el nuevo se comió la tabla', () => {
    expect(conservaLaTabla('<h5>x</h5>' + TALLES_FIRMADA, html)).toBe(false)
  })
  it('sin tabla previa no hay nada que exigir', () => {
    expect(conservaLaTabla('<h5>x</h5>', html)).toBe(true)
    expect(conservaLaTabla('', html)).toBe(true)
  })
})
