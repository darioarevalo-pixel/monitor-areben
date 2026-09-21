/**
 * **El balance del sector**: qué hay que ir a buscar al depósito del local, y con qué número se
 * decide si la lista se puede creer.
 */

import { describe, expect, it } from 'vitest'
import { buscarEnDeposito, coberturaPorCat, filasBuscar, resumenBuscar, sinCategoriaSinVer, vistasDelRecorrido } from '../lib/exhib/balance'
import { aEscaneo, type EscaneoLibre } from '../lib/exhib/libre'
import type { ExhibItem } from '../lib/exhib/tipos'

const v = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '', sku: '', productId: 'p', name: 'X', size: 'U', qty: 1, img: null,
  cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES'], tnId: null, precio: null, promo: null, ...over,
})

const TOP_A = v({ productId: '1', name: 'TOP ORSA', size: 'Beige', barcode: 'b1', qty: 2 })
const TOP_B = v({ productId: '1', name: 'TOP ORSA', size: 'Negro', barcode: 'b2', qty: 3 })
const TOP_C = v({ productId: '2', name: 'TOP NARA', size: 'Blanco', barcode: 'b3', qty: 1 })
// El bolsón de TN se come un corset: está en las DOS categorías.
const CORSET = v({ productId: '3', name: 'CORSET BERNA', size: 'M', barcode: 'b4', qty: 4, cat: 'TOPS Y BODIES', cleanCats: ['TOPS Y BODIES', 'CORSETS'] })
// De otro sector, no tiene por qué aparecer.
const JEAN = v({ productId: '4', name: 'JEAN MOM', size: '38', barcode: 'b5', qty: 5, cat: 'JEANS', cleanCats: ['JEANS'] })
// Sin categoría en TN: invisible para cualquier universo.
const MUSCULOSA = v({ productId: '5', name: 'MUSCULOSA GOA', size: 'Blanco', barcode: 'b6', qty: 6, cat: '(Sin categoría)', cleanCats: [] })

const LOCAL = [TOP_A, TOP_B, TOP_C, CORSET, JEAN, MUSCULOSA]
const TOPS = 'TOPS Y BODIES'

const escanear = (its: ExhibItem[], lugar = 'sector tops'): EscaneoLibre[] => its.map((it) => aEscaneo(it, it.barcode, lugar))

describe('vistasDelRecorrido', () => {
  it('cuenta lo que pasó por el lector en CUALQUIER lugar del recorrido', () => {
    const es = [...escanear([TOP_A], 'sector tops'), ...escanear([TOP_C], 'vidriera')]
    expect(vistasDelRecorrido(es).size).toBe(2)
  })

  /** Un triage ⛔ no vio nada: «no se encuentra» quiere decir que la buscaron y ⛔ no estaba. */
  it('un estado de triage ⛔ no cuenta como visto', () => {
    const [e] = escanear([TOP_A])
    expect(vistasDelRecorrido([{ ...e, estado: 'no-encuentra' }]).size).toBe(0)
  })
})

describe('coberturaPorCat — el número con el que se decide', () => {
  it('dice cuánto del universo tocó, ⛔ no cuántos escaneos hubo', () => {
    const [c] = coberturaPorCat(escanear([TOP_A]), LOCAL)
    expect(c.cat).toBe(TOPS)
    // El universo de TOPS son TOP_A, TOP_B, TOP_C y el CORSET que el bolsón se come: 4.
    expect(c).toMatchObject({ universo: 4, vistas: 1 })
    expect(c.cubierto).toBeCloseTo(0.25)
    expect(c.unidadesSinVer).toBe(3 + 1 + 4)
  })

  it('sólo propone las categorías que el recorrido TOCÓ', () => {
    const cats = coberturaPorCat(escanear([TOP_A]), LOCAL).map((c) => c.cat)
    expect(cats).toEqual([TOPS])
    expect(cats).not.toContain('JEANS')
  })

  it('una prenda en dos categorías propone las dos', () => {
    const cats = coberturaPorCat(escanear([CORSET]), LOCAL).map((c) => c.cat).sort()
    expect(cats).toEqual(['CORSETS', 'TOPS Y BODIES'])
  })

  it('«(Sin categoría)» ⛔ nunca se propone: ⛔ no es un sector del salón', () => {
    expect(coberturaPorCat(escanear([MUSCULOSA]), LOCAL).map((c) => c.cat)).toEqual([])
  })
})

describe('buscarEnDeposito — el mandado', () => {
  it('sin categorías declaradas ⛔ no afirma nada', () => {
    expect(buscarEnDeposito(escanear([TOP_A]), LOCAL, [])).toEqual([])
  })

  it('pide lo de la categoría que ⛔ no pasó por el lector, lo más gordo primero', () => {
    const lista = buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS])
    expect(lista.map((b) => b.it.name + ' ' + b.it.size)).toEqual(['CORSET BERNA M', 'TOP ORSA Negro', 'TOP NARA Blanco'])
    expect(resumenBuscar(lista)).toEqual({ variantes: 3, unidades: 8, productos: 3 })
  })

  it('⛔ no pide lo de otras categorías', () => {
    expect(buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]).some((b) => b.it.name === 'JEAN MOM')).toBe(false)
  })

  /** 🔑 La misma prenda colgada en otro mueble del mismo recorrido ⛔ no se va a buscar al depósito. */
  it('lo escaneado en OTRO lugar del recorrido cuenta como colgado', () => {
    const es = [...escanear([TOP_A], 'sector tops'), ...escanear([TOP_C], 'vidriera')]
    expect(buscarEnDeposito(es, LOCAL, [TOPS]).map((b) => b.it.name)).toEqual(['CORSET BERNA', 'TOP ORSA'])
  })

  /** 🔴 El corset aparece porque el bolsón de TN se lo come, y la lista lo EXPLICA. */
  it('dice en qué otra categoría está el que parece ajeno', () => {
    const corset = buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]).find((b) => b.it.name === 'CORSET BERNA')
    expect(corset?.tambienEn).toEqual(['CORSETS'])
    // La declarada ⛔ no se repite: sería ruido en la columna que explica.
    expect(corset?.tambienEn).not.toContain(TOPS)
  })

  /** En el catálogo vive la misma categoría dos veces (mismo nombre, distinto ID en TN). */
  it('⛔ no repite la misma categoría escrita igual', () => {
    const dosVeces = { ...CORSET, cleanCats: ['TOPS Y BODIES', 'CORSETS', 'CORSETS'] }
    const lista = buscarEnDeposito(escanear([TOP_A]), [dosVeces], [TOPS])
    expect(lista[0].tambienEn).toEqual(['CORSETS'])
  })

  it('el Excel lleva el stock del local y la explicación', () => {
    const filas = filasBuscar(buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]))
    expect(filas[0]).toContain('Unidades en el local')
    expect(filas[1]).toEqual(['CORSET BERNA', 'M', '', 'b4', 4, 'CORSETS'])
  })
})

describe('lo que el balance ⛔ NO puede juzgar', () => {
  it('la prenda sin categoría se cuenta aparte y ⛔ no se calla', () => {
    expect(sinCategoriaSinVer(escanear([TOP_A]), LOCAL).map((i) => i.name)).toEqual(['MUSCULOSA GOA'])
  })

  it('la sin categoría que SÍ pasó por el lector ⛔ no es un pendiente: está colgada', () => {
    expect(sinCategoriaSinVer(escanear([TOP_A, MUSCULOSA]), LOCAL)).toEqual([])
  })

  it('⛔ no se cuela en el mandado por más que se declare la categoría', () => {
    expect(buscarEnDeposito(escanear([TOP_A]), LOCAL, [TOPS]).some((b) => b.it.name === 'MUSCULOSA GOA')).toBe(false)
  })
})
