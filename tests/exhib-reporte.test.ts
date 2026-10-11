/**
 * **El reporte del chequeo** (`lib/exhib/reporte.ts` + el ticket de `lib/exhib/ticket.ts`).
 *
 * 📊 Oráculo medido el 11-oct-2026 con los dos recorridos reales del 10-oct («Tops» 302 +
 * «Partes de abajo» 258) contra el stock de ese día: **76 variantes pendientes de 64 productos y 23
 * duplicadas**. La lista que se armó a mano el 10-oct dio 75 de 63 (el stock se movió en el medio).
 */

import { describe, expect, it } from 'vitest'
import { aEscaneo, sumarUna, type EscaneoLibre } from '../lib/exhib/libre'
import { esRegular, porSku, reporteDelChequeo } from '../lib/exhib/reporte'
import { armarTicket, AVISO_FRONTAL } from '../lib/exhib/ticket'
import type { ExhibItem } from '../lib/exhib/tipos'

const variante = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '',
  sku: '',
  productId: 'p',
  name: 'TOP X',
  size: 'NEGRO',
  qty: 2,
  img: null,
  cat: 'TOPS',
  cleanCats: ['TOPS'],
  tnId: 1,
  precio: 30000,
  promo: null,
  ...over,
})

const T0 = Date.parse('2026-10-10T12:05:00Z')
const escanear = (it: ExhibItem, lugar: string, min: number): EscaneoLibre => aEscaneo(it, it.barcode, lugar, T0 + min * 60_000)

describe('qué es regular', () => {
  it('precio de TN sin oferta: sí · en oferta, sin precio de TN o Stunned: no', () => {
    expect(esRegular(variante({ sku: 'RTO-0001-NG' }))).toBe(true)
    expect(esRegular(variante({ sku: 'RTO-0001-NG', promo: 20000 }))).toBe(false)
    expect(esRegular(variante({ sku: 'OUTLET 1', precio: null }))).toBe(false)
    expect(esRegular(variante({ sku: 'STU-0001-NG' }))).toBe(false)
  })
})

describe('reporteDelChequeo', () => {
  const negro = variante({ barcode: '1', sku: 'RTO-0010-NG', productId: 'top', size: 'NEGRO' })
  const blanco = variante({ barcode: '2', sku: 'RTO-0010-BL', productId: 'top', size: 'BLANCO' })
  const mini = variante({ barcode: '3', sku: 'RMI-0002-38', productId: 'mini', name: 'MINI Y', size: '38' })
  const feria = variante({ barcode: '4', sku: 'RTO-0099-NG', productId: 'feria', promo: 15000 })
  const bombacha = variante({ barcode: '5', sku: 'RBO-0001-NG', productId: 'bomb', name: 'BOMBACHA Z' })
  const sinStock = variante({ barcode: '6', sku: 'RTO-0011-NG', productId: 'otro', qty: 0 })
  const items = [negro, blanco, mini, feria, bombacha, sinStock]
  const mapa = { tipos: [{ tipo: 'BOMBACHA', largo: 'L1' as const, perchasPorM: 20, topePorM: null, cuelga: false }] }

  it('junta los recorridos del día: lo escaneado en cualquiera ⛔ queda pendiente', () => {
    const tops = [escanear(negro, 'Tops', 0)]
    const abajo = [escanear(mini, 'Partes de abajo', 30)]
    const r = reporteDelChequeo([...tops, ...abajo], items, mapa)
    expect(r.pendientes.map((p) => p.sku)).toEqual(['RTO-0010-BL'])
    // Feria, lo que no va en percha y lo que está en cero ⛔ entran ni en el total.
    expect(r.total).toBe(3)
    expect(r.vistas).toBe(2)
  })

  it('una variante escaneada ⛔ tapa a su hermana (es por variante)', () => {
    const r = reporteDelChequeo([escanear(blanco, 'Tops', 0)], items, mapa)
    expect(r.pendientes.map((p) => p.sku)).toEqual(['RMI-0002-38', 'RTO-0010-NG'])
  })

  it('«una sola variante»: con una exhibida ⛔ pide el resto; sin ninguna, pide una cualquiera', () => {
    const conUna = reporteDelChequeo([escanear(negro, 'Tops', 0), escanear(mini, 'Abajo', 1)], items, { ...mapa, unaVariante: ['top'] })
    expect(conUna.pendientes).toEqual([])
    expect(conUna.porUnaVariante).toBe(1)

    const sinNinguna = reporteDelChequeo([escanear(mini, 'Abajo', 1)], items, { ...mapa, unaVariante: ['top'] })
    expect(sinNinguna.pendientes).toHaveLength(1)
    expect(sinNinguna.pendientes[0]).toMatchObject({ sku: 'RTO-0010-BL', unaCualquiera: true, enLocal: 4 })
  })

  it('duplicadas: la misma variante dos veces en un lugar o en dos recorridos; ⛔ la feria', () => {
    const esc = [
      sumarUna(escanear(negro, 'Tops', 0), T0 + 5 * 60_000),
      escanear(mini, 'Partes de abajo', 30),
      escanear(mini, 'Vidriera', 40),
      sumarUna(escanear(feria, 'Tops', 2), T0 + 6 * 60_000),
    ]
    const r = reporteDelChequeo(esc, items, mapa)
    expect(r.duplicadas.map((d) => [d.sku, d.veces, d.lugares.join('+')])).toEqual([
      ['RMI-0002-38', 2, 'Partes de abajo+Vidriera'],
      ['RTO-0010-NG', 2, 'Tops'],
    ])
  })

  it('ordena por SKU con los números en orden de número; sin SKU al final', () => {
    const fila = (sku: string) => ({ sku, nombre: 'A', variante: '' })
    expect([fila(''), fila('RTO-0100'), fila('RTO-0099'), fila('RBLU-0005')].sort(porSku).map((f) => f.sku)).toEqual(['RBLU-0005', 'RTO-0099', 'RTO-0100', ''])
  })
})

describe('el ticket de 80 mm', () => {
  // Un medidor de mentira: un renglón por texto, salvo los largos.
  const partir = (txt: string) => (txt.length > 40 ? [txt.slice(0, 40), txt.slice(40)] : [txt])
  const pend = [{ clave: '1', sku: 'RTO-0010-BL', productId: 'top', nombre: 'TOP X', variante: 'BLANCO', enLocal: 2, unaCualquiera: false }]
  const dup = [{ clave: '2', sku: 'RMI-0002-38', nombre: 'MINI Y', variante: '38', veces: 2, lugares: ['Tops'], otrasEnMedio: 3 }]

  it('las dos listas con sus casillas y el aviso de los frontales al final, en negrita', () => {
    const { ops, alto } = armarTicket(pend, dup, T0, partir)
    const textos = ops.filter((o) => o.k === 'txt' || o.k === 'col').map((o) => ('txt' in o ? o.txt : ''))
    for (const t of ['Pendiente de exhibición (1)', 'Variantes duplicadas (1)', 'Exhibido', 'No', 'encontrado', 'Retirado', 'Exhibición', 'frontal', 'RMI-0002-38  × 2']) expect(textos).toContain(t)
    // Dos casillas por renglón.
    expect(ops.filter((o) => o.k === 'casilla')).toHaveLength(4)
    const aviso = ops.filter((o) => o.k === 'txt' && AVISO_FRONTAL.startsWith(o.txt.slice(0, 20)))
    expect(aviso.length).toBeGreaterThan(0)
    expect(aviso.every((o) => o.k === 'txt' && o.bold)).toBe(true)
    // ⛔ Ni stock ni ventas en el papel.
    expect(textos.join(' ')).not.toMatch(/en el local|vend/i)
    expect(alto).toBeGreaterThan(82)
  })

  it('sin nada que hacer lo dice, en vez de dejar la lista vacía', () => {
    const textos = armarTicket([], [], T0, partir).ops.flatMap((o) => (o.k === 'txt' ? [o.txt] : []))
    expect(textos).toContain('No hay variantes pendientes.')
    expect(textos).toContain('No hay variantes duplicadas.')
  })
})
