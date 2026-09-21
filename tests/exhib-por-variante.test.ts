/**
 * 🔴 **El chequeo es POR VARIANTE: marcar una ⛔ NO marca a sus hermanas.**
 *
 * Éste es el test que existe para una sola regla, y está aparte porque la regla **cruza los cuatro
 * módulos** —los ítems, los escaneos, lo que falta colgar y el conteo—: un test adentro de cada uno
 * la ejerce por pedazos, y el pedazo que se rompa puede ser el del módulo que nadie tocó.
 *
 * 🔑 **Lo pidió Bruno el 20-sep-2026**, antes de salir a caminar el local: *«si un producto tiene
 * tres variantes de color o talle y las tres están en el local, al escanear una ⛔ no marca
 * automáticamente las otras como exhibidas»*. ⛔ No es una hipótesis: **285 de los 467 productos**
 * del Local de Zattia tienen más de una variante con stock, así que es el caso normal y ⛔ no el
 * raro. Y en Zattia el **color viaja en el talle** —TOP ORSA tiene Chocolate, Beige y Negro como
 * tres `size_name` del mismo `product_id`—, que es justo el caso que se confunde.
 *
 * 📊 Medido contra el recorrido real `ex1789825143664_abbjt3` (97 escaneos, Tops, 19-sep-2026):
 * **97 escaneos ⇒ 97 variantes distintas sobre 67 productos**, y **24 de esos productos tienen
 * varias variantes escaneadas por separado, cada una con su hora** —TOP ORSA Chocolate 10:42:17,
 * Beige 10:42:26, Negro 10:46:58—. La independencia ⛔ no es teórica: ya pasó en el salón.
 */

import { describe, expect, it } from 'vitest'
import { coincidencias, exhibId, faltantes, contarSinMarcar } from '../lib/exhib/core'
import { aEscaneo, avanceDelRecorrido, claveEscaneo, estadosDe, sumarUna, unidadesVistas, type EscaneoLibre } from '../lib/exhib/libre'
import { paraColgar } from '../lib/exhib/colgar'
import { analisisUnidades } from '../lib/exhib/analisis'
import type { ExhibItem } from '../lib/exhib/tipos'

/** Una variante del Local, con lo poco que la regla mira. */
const variante = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '',
  sku: '',
  productId: 'p',
  name: 'X',
  size: 'U',
  qty: 1,
  img: null,
  cat: 'TOPS',
  cleanCats: ['TOPS'],
  tnId: null,
  precio: null,
  promo: null,
  ...over,
})

// El caso de Bruno, con los nombres reales: **un solo producto, tres colores**, los tres colgados.
const BEIGE = variante({ productId: '77', name: 'TOP ORSA', size: 'Beige', barcode: '7790001', sku: 'ORSA', qty: 2 })
const CREMA = variante({ productId: '77', name: 'TOP ORSA', size: 'Crema', barcode: '7790002', sku: 'ORSA', qty: 3 })
const NEGRO = variante({ productId: '77', name: 'TOP ORSA', size: 'Negro', barcode: '7790003', sku: 'ORSA', qty: 1 })
const LOCAL = [BEIGE, CREMA, NEGRO]

const LUGAR = 'perchero tops'

describe('el id de una variante ⛔ no lo comparte ninguna hermana', () => {
  it('tres colores del MISMO producto son tres ids distintos', () => {
    const ids = LOCAL.map(exhibId)
    expect(new Set(ids).size).toBe(3)
  })

  it('sin código de barras, el talle alcanza para separarlas', () => {
    const sinBc = LOCAL.map((v) => ({ ...v, barcode: '' }))
    expect(new Set(sinBc.map(exhibId)).size).toBe(3)
    expect(exhibId(sinBc[0])).toBe('77|Beige')
  })

  it('la clave de la cola (y el único de la base) también separa por variante', () => {
    const claves = LOCAL.map((v) => claveEscaneo(aEscaneo(v, v.barcode, LUGAR)))
    expect(new Set(claves).size).toBe(3)
  })
})

describe('escanear UNA variante ⛔ no toca a las otras dos', () => {
  // Se escanea sólo la Beige, que es la que está en la mano.
  const escaneos: EscaneoLibre[] = [aEscaneo(BEIGE, BEIGE.barcode, LUGAR)]

  it('el escaneo guarda el id de la variante escaneada, ⛔ no el del producto', () => {
    expect(escaneos[0].variante_id).toBe(exhibId(BEIGE))
    expect(escaneos[0].size).toBe('Beige')
    expect(escaneos[0].product_id).toBe('77')
  })

  it('sólo la Beige queda exhibida', () => {
    const estados = estadosDe([{ ...escaneos[0], estado: 'exhibido' }])
    expect(estados[exhibId(BEIGE)]).toBe('exhibido')
    expect(estados[exhibId(CREMA)]).toBeUndefined()
    expect(estados[exhibId(NEGRO)]).toBeUndefined()
  })

  it('Crema y Negro siguen contando como faltantes', () => {
    const estados = estadosDe([{ ...escaneos[0], estado: 'exhibido' }])
    expect(faltantes(LOCAL, estados).map((v) => v.size)).toEqual(['Crema', 'Negro'])
    // Las dos quedan además **sin triar**: nadie dijo todavía si aparecieron o no.
    expect(contarSinMarcar(faltantes(LOCAL, estados), estados)).toBe(2)
  })

  it('las unidades vistas son las de la Beige y de nadie más', () => {
    const vistas = unidadesVistas(escaneos)
    expect(vistas.get(exhibId(BEIGE))).toBe(1)
    expect(vistas.has(exhibId(CREMA))).toBe(false)
    expect(vistas.has(exhibId(NEGRO))).toBe(false)
  })

  it('«qué falta colgar» pide las DOS hermanas que no aparecieron, y ⛔ no la escaneada', () => {
    const lista = paraColgar(escaneos, LOCAL)
    expect(lista.map((c) => c.it.size).sort()).toEqual(['Crema', 'Negro'])
    expect(lista.every((c) => c.lugar === LUGAR)).toBe(true)
  })

  it('el conteo del final habla sólo de la variante que pasó por el lector', () => {
    const a = analisisUnidades(escaneos, LOCAL)
    // Se vio 1 y el sistema tiene 2 ⇒ la Beige puede tener una sin colgar. Crema y Negro ⛔ no
    // aparecen en ninguna lista: de lo que nadie miró, acá ⛔ no se afirma nada.
    expect(a.puedenFaltar.map((l) => l.it.size)).toEqual(['Beige'])
    expect(a.hayDeMas).toEqual([])
    // 🔴 El número contra el que se compara es el stock **de la Beige** (2) y ⛔ no el del producto
    // entero (2+3+1=6): sumar las hermanas convertiría el conteo en una alarma falsa de 5 unidades.
    expect(a.unidadesEnSistema).toBe(2)
    expect(a.unidadesVistas).toBe(1)
  })
})

describe('escanear las tres las cuenta a las tres por separado', () => {
  const escaneos = LOCAL.map((v) => aEscaneo(v, v.barcode, LUGAR))

  it('son tres filas, ⛔ no una', () => {
    expect(new Set(escaneos.map((e) => e.variante_id)).size).toBe(3)
  })

  it('ninguna queda pendiente de colgar', () => {
    expect(paraColgar(escaneos, LOCAL)).toEqual([])
  })

  it('cada una cuenta una unidad vista, ⛔ no tres para el producto', () => {
    const vistas = unidadesVistas(escaneos)
    expect([...vistas.values()]).toEqual([1, 1, 1])
  })
})

/**
 * ⚠️ **El único camino por el que un código puede enganchar a una hermana**: el SKU compartido.
 *
 * Los tres colores del ejemplo comparten `ORSA`, que es lo que pasa de verdad —medido el
 * 20-sep-2026 sobre el Local: **7 grupos / 18 variantes con stock comparten SKU**, entre ellas TOP
 * MIA BLANCO y CHOCOLATE—. Con el lector ⛔ no pasa nunca: las 1.058 variantes con stock tienen
 * código de barras y **ninguno se repite**. Pasa tipeando a mano, y por eso `coincidencias`
 * devuelve **todas** para que elija quien tiene la prenda en la mano.
 */
describe('un código que engancha a las hermanas las devuelve a TODAS', () => {
  it('el barcode engancha una sola', () => {
    expect(coincidencias(LOCAL, '7790002').map((v) => v.size)).toEqual(['Crema'])
  })

  it('el SKU compartido engancha las tres, y ⛔ no se elige sola', () => {
    expect(coincidencias(LOCAL, 'ORSA').map((v) => v.size)).toEqual(['Beige', 'Crema', 'Negro'])
  })
})

/**
 * **El número que se canta después de cada escaneo.** Es la confirmación de que la prenda entró,
 * para quien camina con el lector y ⛔ no mira el teléfono ⇒ **tiene que crecer siempre**.
 */
describe('el avance del recorrido', () => {
  it('cuenta las unidades que pasaron por el lector, en todos los lugares', () => {
    const es = [aEscaneo(BEIGE, BEIGE.barcode, 'tops'), aEscaneo(CREMA, CREMA.barcode, 'vidriera')]
    expect(avanceDelRecorrido(es)).toBe(2)
  })

  /** 🔴 Si el repetido ⛔ no sumara, el número se quedaría quieto justo cuando el escaneo SÍ anduvo. */
  it('el repetido de una prenda que ya estaba también hace crecer el número', () => {
    const uno = aEscaneo(BEIGE, BEIGE.barcode, 'tops')
    expect(avanceDelRecorrido([uno])).toBe(1)
    expect(avanceDelRecorrido([sumarUna(uno)])).toBe(2)
  })

  /** ⚠️ Un triage ⛔ no vio nada: «no se encuentra» quiere decir que la buscaron y ⛔ no estaba. */
  it('una marca de triage ⛔ no cuenta como avance', () => {
    const e = aEscaneo(BEIGE, BEIGE.barcode, 'tops')
    expect(avanceDelRecorrido([{ ...e, estado: 'no-encuentra' }])).toBe(0)
  })
})
