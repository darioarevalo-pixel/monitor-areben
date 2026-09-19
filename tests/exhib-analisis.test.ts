import { describe, expect, it } from 'vitest'
import { analisisUnidades } from '../lib/exhib/analisis'
import { aEscaneo, DOBLE_LECTURA_MS, esDobleLectura, sumarUna, unidadesVistas, vecesDe, type EscaneoLibre } from '../lib/exhib/libre'
import type { ExhibItem } from '../lib/exhib/tipos'

const it0 = (over: Partial<ExhibItem>): ExhibItem => ({ barcode: '', sku: '', productId: 'p', name: 'X', size: 'U', qty: 1, img: null, cat: 'TOPS', cleanCats: ['TOPS'], tnId: null, precio: null, promo: null, ...over })

// TOP ZARA NEGRO, el caso real que trajo Bruno: 9 unidades de un solo color en el sistema.
const ZARA_NG = it0({ barcode: '801', productId: '9', name: 'TOP ZARA', size: 'NEGRO', qty: 9 })
const ZARA_BL = it0({ barcode: '802', productId: '9', name: 'TOP ZARA', size: 'BLANCO', qty: 4 })
const MIA = it0({ barcode: '803', productId: '7', name: 'TOP MIA', size: 'CHOCOLATE', qty: 1 })
const LOCAL = [ZARA_NG, ZARA_BL, MIA]

const t = (s: number) => Date.parse('2026-09-19T10:00:00Z') + s * 1000
/** Escanear la misma prenda N veces, como en el perchero: una al lado de la otra. */
const escanear = (it: ExhibItem, veces: number, lugar = 'Tops', desde = 0): EscaneoLibre => {
  let e = aEscaneo(it, it.barcode, lugar, t(desde))
  for (let i = 1; i < veces; i++) e = sumarUna(e, t(desde + i * 3))
  return e
}

describe('contar unidades — el repetido SUMA en vez de rebotar', () => {
  it('una fila sin el campo vale 1: las de antes del cambio ⛔ no se rompen', () => {
    expect(vecesDe({ veces: undefined })).toBe(1)
    expect(vecesDe({ veces: 0 })).toBe(1)
    expect(vecesDe({ veces: 3 })).toBe(3)
  })

  it('sumar una deja UNA fila con el contador y la hora del último', () => {
    const e = escanear(ZARA_NG, 3)
    expect(e.veces).toBe(3)
    expect(e.ultimo_en).toBe(new Date(t(6)).toISOString())
    // 🔑 La primera hora ⛔ no se pisa: es la que ordena la caminata.
    expect(e.escaneado_en).toBe(new Date(t(0)).toISOString())
  })

  it('unidadesVistas suma el mismo código en DOS muebles: en el salón hay las dos', () => {
    const v = unidadesVistas([escanear(ZARA_NG, 2, 'Tops'), escanear(ZARA_NG, 1, 'Mesa entrada', 60)])
    expect(v.get('801')).toBe(3)
  })

  it('el triage ⛔ no suma: nadie la vio', () => {
    const buscada = { ...aEscaneo(ZARA_NG, '801', 'Tops', t(0)), estado: 'no-encuentra' as const }
    expect(unidadesVistas([buscada]).get('801')).toBeUndefined()
  })
})

/**
 * 🔴 El lector entra como teclado y puede repetir el Enter solo. 📊 Medido sobre los 166 escaneos
 * reales del 19-sep: el intervalo humano más corto fue **997 ms**. El corte va en 600.
 */
describe('esDobleLectura — el rebote del aparato ⛔ no es una segunda prenda', () => {
  it('el corte es 600 ms, y el escaneo humano más rápido medido (997 ms) queda afuera', () => {
    expect(DOBLE_LECTURA_MS).toBe(600)
    const e = aEscaneo(ZARA_NG, '801', 'Tops', t(0))
    expect(esDobleLectura(e, t(0) + 120)).toBe(true)
    expect(esDobleLectura(e, t(0) + 997)).toBe(false)
  })

  it('mide contra la ÚLTIMA sumada y ⛔ no contra la primera', () => {
    const e = sumarUna(aEscaneo(ZARA_NG, '801', 'Tops', t(0)), t(30))
    // 30 s después de la primera, pero 100 ms después de la segunda: es el rebote de ésa.
    expect(esDobleLectura(e, t(30) + 100)).toBe(true)
  })
})

describe('analisisUnidades — lo que se vio contra lo que el sistema dice', () => {
  it('vi 2 de las 9 ⇒ «pueden faltar 7», y ⛔ NO es la lista de colgar', () => {
    const a = analisisUnidades([escanear(ZARA_NG, 2)], LOCAL)
    expect(a.puedenFaltar.map((l) => [l.it.size, l.vistas, l.stock, l.dif])).toEqual([['NEGRO', 2, 9, -7]])
    expect(a.hayDeMas).toEqual([])
  })

  it('vi 3 y el sistema tiene 1 ⇒ hay de más: o el stock está mal, o entró sin ingresar', () => {
    const a = analisisUnidades([escanear(MIA, 3)], LOCAL)
    expect(a.hayDeMas.map((l) => [l.it.name, l.vistas, l.stock, l.dif])).toEqual([['TOP MIA', 3, 1, 2]])
  })

  it('lo que cuadra se cuenta y ⛔ no se lista: si da exacto ⛔ no hay nada que ir a mirar', () => {
    const a = analisisUnidades([escanear(ZARA_BL, 4)], LOCAL)
    expect(a.cuadran).toBe(1)
    expect(a.puedenFaltar).toEqual([])
    expect(a.hayDeMas).toEqual([])
  })

  /** 🔴 La regla de oro del recorrido: ⛔ no se afirma nada sobre lo que nadie caminó. */
  it('la variante que el recorrido ⛔ no vio ⛔ NO aparece en ninguna lista', () => {
    const a = analisisUnidades([escanear(MIA, 1)], LOCAL)
    const nombres = [...a.puedenFaltar, ...a.hayDeMas].map((l) => l.it.size)
    expect(nombres).not.toContain('NEGRO')
    expect(nombres).not.toContain('BLANCO')
  })

  it('«hay dos repetidos» es una lista propia: es el dato que antes ⛔ no se podía anotar', () => {
    const a = analisisUnidades([escanear(ZARA_NG, 2), escanear(ZARA_BL, 1, 'Tops', 20), escanear(MIA, 3, 'Tops', 40)], LOCAL)
    expect(a.repetidas.map((l) => [l.it.name + ' ' + l.it.size, l.vistas])).toEqual([['TOP MIA CHOCOLATE', 3], ['TOP ZARA NEGRO', 2]])
  })

  it('los totales son unidades y ⛔ no prendas, y sólo de lo que el recorrido vio', () => {
    const a = analisisUnidades([escanear(ZARA_NG, 2), escanear(MIA, 3)], LOCAL)
    expect(a.unidadesVistas).toBe(5)
    // 9 del NEGRO + 1 de MIA. Los 4 del BLANCO ⛔ no entran: nadie lo vio.
    expect(a.unidadesEnSistema).toBe(10)
  })

  it('lo más gordo primero: una diferencia de 7 ⛔ no es lo mismo que una de 1', () => {
    const a = analisisUnidades([escanear(ZARA_NG, 2), escanear(ZARA_BL, 3, 'Tops', 30)], LOCAL)
    expect(a.puedenFaltar.map((l) => l.dif)).toEqual([-7, -1])
  })
})
