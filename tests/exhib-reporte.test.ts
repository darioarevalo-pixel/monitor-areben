/**
 * **El reporte del chequeo** (`lib/exhib/reporte.ts` + el ticket de `lib/exhib/ticket.ts`).
 *
 * 📊 Oráculo medido el 11-oct-2026 con los dos recorridos reales del 10-oct («Tops» 302 +
 * «Partes de abajo» 258) contra el stock de ese día: **76 variantes pendientes de 64 productos y 23
 * duplicadas**. La lista que se armó a mano el 10-oct dio 75 de 63 (el stock se movió en el medio).
 */

import { describe, expect, it } from 'vitest'
import { aEscaneo, sumarUna, type EscaneoLibre } from '../lib/exhib/libre'
import { esRegular, MIN_TIPO_SIN_ESCANEAR, nuevosDesde, porSku, reporteDelChequeo } from '../lib/exhib/reporte'
import { ALTO_MAX, armarTicket, AVISO_FRONTAL } from '../lib/exhib/ticket'
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

  it('marca «nuevo» con el día de alta los productos que vienen en el mapa de nuevos (Darío, 12-oct)', () => {
    const r = reporteDelChequeo([], items, mapa, new Map([['mini', '2026-10-08']]))
    expect(r.pendientes.find((p) => p.sku === 'RMI-0002-38')?.nuevo).toBe('2026-10-08')
    expect(r.pendientes.find((p) => p.sku === 'RTO-0010-NG')?.nuevo).toBeNull()
    // Sin el mapa (el default), ninguno.
    expect(reporteDelChequeo([], items, mapa).pendientes.every((p) => p.nuevo === null)).toBe(true)
  })

  it('avisa el tipo de prenda del que ⛔ pasó ninguna variante, si tiene al menos el mínimo', () => {
    const bodies = Array.from({ length: MIN_TIPO_SIN_ESCANEAR }, (_, i) => variante({ barcode: `b${i}`, sku: `RBO-00${i}`, productId: `body${i}`, name: 'BODY Z' }))
    const r = reporteDelChequeo([escanear(negro, 'Tops', 0)], [...items, ...bodies], mapa)
    expect(r.tiposSinEscanear).toEqual([{ tipo: 'BODY', variantes: MIN_TIPO_SIN_ESCANEAR }])
    // TOP tuvo una escaneada y MINI tiene una sola variante (menos del mínimo): ninguno avisa.
    expect(reporteDelChequeo([escanear(negro, 'Tops', 0)], items, mapa).tiposSinEscanear).toEqual([])
  })

  it('🔑 lo repetido en una exhibición FRONTAL ⛔ es duplicado, pero cuenta como exhibido (Darío, 12-oct)', () => {
    const esc = [sumarUna(escanear(negro, 'D03 arriba frontal', 0), T0 + 60_000), escanear(blanco, 'D03 arriba frontal', 2), escanear(blanco, 'D03 arriba', 3)]
    const r = reporteDelChequeo(esc, items, mapa)
    expect(r.duplicadas).toEqual([])
    expect(r.pendientes.map((p) => p.sku)).toEqual(['RMI-0002-38'])
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

  it('feria en regulares: la que pasó por el lector, con dónde y cuántas veces; ⛔ lo regular ni Stunned', () => {
    const stunned = variante({ barcode: '7', sku: 'STU-0001-NG', productId: 'stu', promo: 10000 })
    const esc = [
      escanear(negro, 'Tops', 0),
      sumarUna(escanear(feria, 'Tops', 2), T0 + 6 * 60_000),
      escanear(feria, 'Partes de abajo', 30),
      escanear(stunned, 'Tops', 3),
    ]
    const r = reporteDelChequeo(esc, [...items, stunned], mapa)
    expect(r.feria.map((f) => [f.sku, f.veces, f.lugares.join('+')])).toEqual([['RTO-0099-NG', 3, 'Partes de abajo+Tops']])
    expect(reporteDelChequeo([escanear(negro, 'Tops', 0)], items, mapa).feria).toEqual([])
  })

  it('ordena por SKU con los números en orden de número; sin SKU al final', () => {
    const fila = (sku: string) => ({ sku, nombre: 'A', variante: '' })
    expect([fila(''), fila('RTO-0100'), fila('RTO-0099'), fila('RBLU-0005')].sort(porSku).map((f) => f.sku)).toEqual(['RBLU-0005', 'RTO-0099', 'RTO-0100', ''])
  })
})

describe('el ticket de 80 mm', () => {
  // Un medidor de mentira: un renglón por texto, salvo los largos.
  const partir = (txt: string) => (txt.length > 40 ? [txt.slice(0, 40), txt.slice(40)] : [txt])
  const pend = [{ clave: '1', sku: 'RTO-0010-BL', productId: 'top', nombre: 'TOP X', variante: 'BLANCO', enLocal: 2, unaCualquiera: false, nuevo: '2026-10-08' }]
  const dup = [{ clave: '2', sku: 'RMI-0002-38', nombre: 'MINI Y', variante: '38', veces: 2, lugares: ['Tops'], otrasEnMedio: 3 }]

  it('las dos listas con sus casillas y el aviso de los frontales al final, en negrita', () => {
    const [{ ops, alto }, ...resto] = armarTicket(pend, dup, T0, partir)
    expect(resto).toHaveLength(0)
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
    const textos = armarTicket([], [], T0, partir)[0].ops.flatMap((o) => (o.k === 'txt' ? [o.txt] : []))
    expect(textos).toContain('No hay variantes pendientes.')
    expect(textos).toContain('No hay variantes duplicadas.')
  })
})

describe('el ticket del local entero (14-oct: la Epson cortó en «Remera Bell»)', () => {
  const partir = (txt: string) => [txt]
  const pend = Array.from({ length: 120 }, (_, i) => ({ clave: `p${i}`, sku: `RTO-${String(i).padStart(4, '0')}-BL`, productId: `p${i}`, nombre: `TOP ${i}`, variante: 'BLANCO', enLocal: 1, unaCualquiera: false, nuevo: null }))
  const dup = Array.from({ length: 40 }, (_, i) => ({ clave: `d${i}`, sku: `RMI-${String(i).padStart(4, '0')}-38`, nombre: `MINI ${i}`, variante: '38', veces: 2, lugares: ['Tops'], otrasEnMedio: 0 }))
  const paginas = armarTicket(pend, dup, T0, partir)
  const textos = (o: (typeof paginas)[number]) => o.ops.flatMap((x) => (x.k === 'txt' ? [x.txt] : []))

  it('sale en partes que entran en la impresora, y cada una dice cuál es', () => {
    expect(paginas.length).toBeGreaterThan(1)
    for (const p of paginas) expect(p.alto).toBeLessThanOrEqual(ALTO_MAX)
    paginas.forEach((p, i) => expect(textos(p)).toContain(`Parte ${i + 1} de ${paginas.length}`))
    for (const p of paginas.slice(0, -1)) expect(textos(p)).toContain('Sigue en el próximo papel.')
  })

  it('⛔ se pierde ningún renglón, ningún renglón se repite, y cada uno con sus 2 casillas', () => {
    const skus = paginas.flatMap((p) => textos(p).filter((t) => /^R(TO|MI)-/.test(t)))
    expect(skus).toEqual([...pend.map((p) => p.sku), ...dup.map((d) => `${d.sku}  × 2`)])
    expect(paginas.flatMap((p) => p.ops).filter((o) => o.k === 'casilla')).toHaveLength(2 * (pend.length + dup.length))
  })

  it('la parte que sigue en medio de una lista repite su título; el aviso de los frontales va al final', () => {
    expect(textos(paginas[1])).toContain('Pendiente de exhibición (sigue)')
    expect(textos(paginas[paginas.length - 1]).some((t) => AVISO_FRONTAL.startsWith(t.slice(0, 20)))).toBe(true)
  })

  it('un ticket corto sale en un solo papel y ⛔ dice «Parte 1 de 1»', () => {
    const corto = armarTicket(pend.slice(0, 3), [], T0, partir)
    expect(corto).toHaveLength(1)
    expect(textos(corto[0]).join(' ')).not.toMatch(/Parte|Sigue/)
  })
})

describe('nuevosDesde', () => {
  const r = (dia: string, escaneos: number) => ({ dia, escaneos })
  it('desde el chequeo ANTERIOR al que se mira, ⛔ el último de todos', () => {
    expect(nuevosDesde('2026-10-10', [r('2026-10-17', 500), r('2026-10-05', 638), r('2026-10-10', 560), r('2026-09-21', 415)])).toEqual({ desde: '2026-10-05', hayAnterior: true })
  })
  it('las pruebas chicas ⛔ son chequeo (el 7-oct: 4 recorridos, 46 escaneos); suma los recorridos del día', () => {
    const reales = [r('2026-10-07', 9), r('2026-10-07', 15), r('2026-10-07', 15), r('2026-10-07', 7), r('2026-10-05', 52), r('2026-10-05', 366)]
    expect(nuevosDesde('2026-10-10', reales)).toEqual({ desde: '2026-10-05', hayAnterior: true })
  })
  it('sin chequeo anterior: la semana de antes', () => {
    expect(nuevosDesde('2026-09-21', [r('2026-09-21', 415), r('2026-10-05', 638)])).toEqual({ desde: '2026-09-14', hayAnterior: false })
  })
})
