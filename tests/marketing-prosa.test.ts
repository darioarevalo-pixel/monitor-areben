/**
 * El contador «Sin descripción» de Marketing, después de migrarlo a la prosa real.
 *
 * 🔑 Por qué existe este archivo: hasta hoy `lib/marketing/core.ts` no tenía NINGÚN test,
 * y el contador estaba mintiendo. Medido contra Zattia el 19-ago-2026: decía 39 publicados
 * sin descripción y son 41. Los dos que faltaban son los dos casos de abajo, con la forma
 * real que tienen en la tienda.
 */

import { describe, it, expect } from 'vitest'
import { buildLista, calcularStats, matchCalidad } from '../lib/marketing/core'
import type { TnProducto } from '../lib/tn'
import type { Producto } from '../lib/etl/tipos'

const gn = (name: string, sku: string): Producto =>
  ({ id: sku, name, sku, stock: 3, sales30: 0, ingresoMes: '2026-08' }) as unknown as Producto

const tn = (over: Partial<TnProducto>): TnProducto => ({
  id: '1', name: 'x', sku: null, published: true, image_count: 4, ...over,
})

/** Los dos publicados de Zattia que `has_desc` contaba como «con descripción». */
const DALLAS_TABLA_SIN_PROSA =
  '<div dir="ltr"><table style="width: 735px;"><tbody>' +
  '<tr><td><p>TALLE</p></td><td><p>LARGO</p></td></tr><tr><td><p>S</p></td><td><p>60</p></td></tr>' +
  '</tbody></table></div>'
const BLISS_SOLO_NBSP = '<p>&nbsp;</p>\n<p>&nbsp;</p>'

const PROSA_CORTA = '<h5>Body de microfibra con detalle de argolla plateada. Disponible en blanco.</h5>'
const TABLA = '<!--AREBEN-TALLES-INI--><table><tr><td>S</td></tr></table><!--AREBEN-TALLES-FIN-->'
const PROSA_LARGA =
  '<h5>' + 'Sweater de punto acanalado que se adapta a la silueta y abriga sin abultar. '.repeat(3) + '</h5>'

describe('el contador de Marketing dice la verdad', () => {
  const productos = [
    gn('Sweater Dallas', 'D-1'),
    gn('Top Bliss', 'B-1'),
    gn('Body Helix', 'H-1'),
    gn('Sweater Vienna', 'V-1'),
  ]
  const tnProducts = [
    tn({ id: 10, sku: 'D-1', name: 'Sweater Dallas', raw_desc: DALLAS_TABLA_SIN_PROSA, has_desc: true }),
    tn({ id: 11, sku: 'B-1', name: 'Top Bliss', raw_desc: BLISS_SOLO_NBSP, has_desc: true }),
    tn({ id: 12, sku: 'H-1', name: 'Body Helix', raw_desc: PROSA_CORTA + TABLA, has_desc: true }),
    tn({ id: 13, sku: 'V-1', name: 'Sweater Vienna', raw_desc: PROSA_LARGA + TABLA, has_desc: true }),
  ]

  it('los dos que `has_desc` daba por buenos ahora cuentan como sin descripción', () => {
    const lista = buildLista(productos, tnProducts, 'zattia')
    expect(lista).toHaveLength(4)
    // Los cuatro tienen has_desc=true, o sea el contador viejo habría dicho 0.
    expect(tnProducts.every((t) => t.has_desc)).toBe(true)
    expect(calcularStats(lista, 'zattia').sinDesc).toBe(2)
  })

  it('la banda «corta» separa las «6 o 7 palabras» de una ficha completa', () => {
    const lista = buildLista(productos, tnProducts, 'zattia')
    const st = calcularStats(lista, 'zattia')
    expect(st.prosaCorta).toBe(1) // Body Helix
    expect(st.sinDesc + st.prosaCorta).toBe(3) // los tres que hay que redactar
  })

  it('el estado de la fila lo dice, y el filtro los encuentra', () => {
    const lista = buildLista(productos, tnProducts, 'zattia')
    const porNombre = Object.fromEntries(lista.map((x) => [x.gn.name, x]))
    expect(porNombre['Sweater Dallas'].calidad).toBe('sin-desc')
    expect(porNombre['Top Bliss'].calidad).toBe('sin-desc')
    expect(porNombre['Body Helix'].calidad).toBe('prosa-corta')
    expect(matchCalidad(porNombre['Body Helix'], 'prosa-corta', 'zattia')).toBe(true)
    expect(matchCalidad(porNombre['Sweater Dallas'], 'sin-desc', 'zattia')).toBe(true)
    expect(matchCalidad(porNombre['Sweater Dallas'], 'prosa-corta', 'zattia')).toBe(false)
  })

  it('🔑 «sin tabla» le gana a «descripción corta» en el estado de la fila, y eso es a propósito', () => {
    // En Zattia 143 publicados no tienen tabla: si `prosa-corta` ganara, taparía a la cola
    // de talles, que es de otra sección. El estado es UNO; el contador, el filtro y los
    // badges son independientes, así que la información corta no se pierde en ningún lado.
    const sinTablaYCorta = buildLista([gn('Top Fray', 'F-1')], [tn({ id: 14, sku: 'F-1', name: 'Top Fray', raw_desc: PROSA_CORTA, has_desc: true })], 'zattia')[0]
    expect(sinTablaYCorta.calidad).toBe('sin-tabla')
    expect(sinTablaYCorta.prosa.banda).toBe('corta')
    expect(matchCalidad(sinTablaYCorta, 'prosa-corta', 'zattia')).toBe(true)
    expect(calcularStats([sinTablaYCorta], 'zattia').prosaCorta).toBe(1)
  })

  it('«sin tabla» no acusa a los que ya no tienen descripción: sería la misma queja dos veces', () => {
    const lista = buildLista(productos, tnProducts, 'zattia')
    // Bliss no tiene ni tabla ni prosa → ya cuenta en sinDesc, no se lo acusa dos veces.
    expect(matchCalidad(lista.find((x) => x.gn.sku === 'B-1')!, 'sin-tabla', 'zattia')).toBe(false)
    // Helix tiene prosa Y tabla → tampoco.
    expect(matchCalidad(lista.find((x) => x.gn.sku === 'H-1')!, 'sin-tabla', 'zattia')).toBe(false)
  })

  it('«sin foto NI descripción» también mide la prosa, no el HTML crudo', () => {
    // Una ficha sin fotos cuya descripción es SÓLO la tabla: `has_desc` la daba por
    // descrita, así que no entraba en el balde de las peores.
    const lista = buildLista(
      [gn('Corset Mudo', 'C-1')],
      [tn({ id: 15, sku: 'C-1', name: 'Corset Mudo', raw_desc: DALLAS_TABLA_SIN_PROSA, has_desc: true, image_count: 0 })],
      'zattia',
    )
    expect(calcularStats(lista, 'zattia').sinAmbos).toBe(1)
    expect(matchCalidad(lista[0], 'sin-foto-desc', 'zattia')).toBe(true)
  })

  it('en BDI la tabla de talles no aplica: son fundas', () => {
    const lista = buildLista(productos, tnProducts, 'bdi')
    expect(calcularStats(lista, 'bdi').sinTabla).toBe(0)
    expect(matchCalidad(lista.find((x) => x.gn.sku === 'D-1')!, 'sin-tabla', 'bdi')).toBe(false)
  })
})
