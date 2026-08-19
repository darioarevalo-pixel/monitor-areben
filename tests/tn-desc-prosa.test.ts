/**
 * La prosa de una ficha de TiendaNube, separada de la tabla de talles que vive en el
 * MISMO campo `description`.
 *
 * 🔑 Los casos NO son inventados: son las formas reales que tiene Zattia en producción,
 * recortadas. Medido el 19-ago-2026 sobre los 706 productos (369 publicados):
 *   41 sin una palabra de prosa · 237 «cortas» (<120) · 91 de 120 o más
 *   y adentro de las cortas, 232 caen en 30-120 — las «6 o 7 palabras» del local.
 * `has_desc` del audit decía 39 sin descripción. Los DOS que faltaban están abajo.
 *
 * ⛔ No se afirma el total contra la tienda viva: ese número se mueve cada vez que el
 * local escribe una descripción, que es justamente lo que queremos que pase. Lo que se
 * fija acá son las FORMAS, que no se mueven.
 */

import { describe, it, expect } from 'vitest'
import { prosaDe, tieneProsa, sinTablas, sacarWrappers, desescapar, LARGO_OK } from '../lib/tn-desc/prosa'

/** Lo que hace hoy `has_desc` en `bdi-catalogo/api/tiendanube-audit.js:155`. */
const hasDescDelAudit = (raw: string) =>
  raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length > 10

/** El bloque firmado por el generador propio, con su wrapper de 680px adentro. */
const BLOQUE_TALLES =
  '<!--AREBEN-TALLES-INI--><div style="font-family:Arial;max-width:680px;margin:0 auto;">' +
  '<h3>Tabla de talles — Pantalón</h3><table><thead><tr><th>Talle</th><th>65CM</th></tr></thead>' +
  '<tbody><tr><td>S</td><td>92</td></tr></tbody></table>' +
  '<div><b>c. Contorno cintura:</b> Medir alrededor de toda la cintura.</div></div><!--AREBEN-TALLES-FIN-->'

describe('prosaDe: el hueco que `has_desc` no ve', () => {
  it('SWEATER DALLAS: una <table> legacy sin firma y CERO prosa — el audit la cuenta como descripción', () => {
    const raw =
      '<div dir="ltr" style="margin-left: 0pt;" align="left">\n' +
      '<table style="width: 735px;" border="1pt" cellpadding="5pt"><tbody>' +
      '<tr><td><p dir="ltr">TALLE</p></td><td><p dir="ltr">LARGO</p></td></tr>' +
      '<tr><td><p dir="ltr">S</p></td><td><p dir="ltr">60</p></td></tr>' +
      '</tbody></table>\n</div>'
    expect(hasDescDelAudit(raw)).toBe(true) // ← el audit dice «tiene descripción»
    expect(prosaDe(raw).largo).toBe(0) // ← y no tiene ni una palabra
    expect(prosaDe(raw).banda).toBe('nada')
  })

  it('TOP BLISS: dos <p> con &nbsp; — el audit cuenta las ENTIDADES como texto', () => {
    const raw = '<p>&nbsp;</p>\n<p>&nbsp;</p>'
    expect(raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).toHaveLength(13)
    expect(hasDescDelAudit(raw)).toBe(true) // ← 13 > 10, o sea «tiene descripción»
    expect(prosaDe(raw).largo).toBe(0) // ← es espacio en blanco
  })

  it('un producto que SÓLO tiene el bloque firmado no tiene prosa', () => {
    expect(hasDescDelAudit(BLOQUE_TALLES)).toBe(true)
    expect(tieneProsa(BLOQUE_TALLES)).toBe(false)
  })
})

describe('prosaDe: lo que sí es prosa', () => {
  it('MONITO CAPRY: prosa arriba, bloque firmado abajo — se queda con la prosa sola', () => {
    const raw =
      '<h5>Monito enterito realizado en tela crepe. Talle &uacute;nico. Disponibles en color beige y celeste.</h5>' +
      '<div dir="ltr" style="margin-left: 0pt;" align="left">\n\n</div>\n' +
      BLOQUE_TALLES
    const p = prosaDe(raw)
    expect(p.texto).toBe(
      'Monito enterito realizado en tela crepe. Talle único. Disponibles en color beige y celeste.',
    )
    expect(p.texto).not.toContain('Contorno cintura') // nada del bloque de talles
  })

  it('no se cuela nada de la tabla en la prosa', () => {
    const raw = '<h5>Top de red con brillos.</h5>' + BLOQUE_TALLES
    const p = prosaDe(raw)
    expect(p.texto).toBe('Top de red con brillos.')
    expect(p.texto).not.toContain('Contorno cintura')
    expect(p.texto).not.toContain('65CM')
  })

  it('desescapa las entidades: si no, `&aacute;` cuenta 8 caracteres en vez de 1', () => {
    expect(prosaDe('<p>Pantal&oacute;n de red con culote.</p>').texto).toBe('Pantalón de red con culote.')
    expect(desescapar('&ntilde;&amp;&#233;&#xe1;')).toBe('ñ&éá')
  })

  it('una prosa marcada NO se saca: eso es justamente lo que arreglamos', () => {
    const raw = '<!--AREBEN-PROSA-INI--><p>Camisa de gasa liviana.</p><!--AREBEN-PROSA-FIN-->' + BLOQUE_TALLES
    expect(prosaDe(raw).texto).toBe('Camisa de gasa liviana.')
  })
})

describe('prosaDe: las bandas', () => {
  const conLargo = (n: number) => '<p>' + 'a'.repeat(n) + '</p>'

  it('vacío es «nada», y el vacío de verdad también', () => {
    expect(prosaDe('').banda).toBe('nada')
    expect(prosaDe(null).banda).toBe('nada')
    expect(prosaDe(undefined).banda).toBe('nada')
    expect(prosaDe('   \n  ').banda).toBe('nada')
  })

  it('el corte entre «corta» y «ok» está en 120, y 120 ya es «ok»', () => {
    expect(prosaDe(conLargo(1)).banda).toBe('corta')
    expect(prosaDe(conLargo(LARGO_OK - 1)).banda).toBe('corta')
    expect(prosaDe(conLargo(LARGO_OK)).banda).toBe('ok')
    expect(prosaDe(conLargo(LARGO_OK + 1)).banda).toBe('ok')
  })

  it('las tres formas reales de las «6 o 7 palabras» caen en «corta»', () => {
    const dialectos = [
      '<h5>Body de microfibra con detalle de argolla plateada. Disponible en color blanco.</h5>',
      '<h5>Top micro de morley - Talle &uacute;nico - Colores disponibles: Vino / Negro / Blanco</h5>',
      '<h5>TOP KOBE Top de microfibra con espalda cruzada y cuello buche.</h5>',
    ]
    for (const d of dialectos) expect(prosaDe(d).banda).toBe('corta')
  })
})

describe('el ORDEN es la regla', () => {
  it('sacar los bloques ANTES que los tags: al revés, la prosa se traga la tabla', () => {
    const raw = '<h5>Top de red.</h5>' + BLOQUE_TALLES
    // Lo que pasa si alguien pela los tags primero (el defecto que tiene hoy has_desc):
    const alReves = raw.replace(/<[^>]*>/g, ' ').replace(/<table[\s\S]*?<\/table>/gi, '')
    expect(alReves).toContain('Contorno cintura')
    // Lo que hace prosaDe:
    expect(prosaDe(raw).texto).toBe('Top de red.')
  })

  it('sinTablas deja el resto intacto y sólo saca los bloques', () => {
    expect(sinTablas('<h5>Hola</h5>' + BLOQUE_TALLES)).toBe('<h5>Hola</h5>')
    expect(sinTablas('<p>a</p><table><tr><td>x</td></tr></table><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  it('sacarWrappers cuenta el balance de <div> y no toca un HTML sin cierre', () => {
    const env = '<div style="max-width:680px"><div>adentro</div>fin</div>DESPUES'
    expect(sacarWrappers(env)).toBe('DESPUES')
    const roto = '<div style="max-width:680px"><div>adentro</div>sin cerrar'
    expect(sacarWrappers(roto)).toBe(roto) // ⛔ un HTML roto no se «arregla» adivinando
  })
})
