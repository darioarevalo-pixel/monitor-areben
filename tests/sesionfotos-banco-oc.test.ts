/**
 * De la ORDEN RECIBIDA al banco — Fase 4 del octavo.
 *
 * 🔴 Lo que este archivo vigila de verdad son dos cosas que la caminata ya midió y el código puede
 * volver a romper sin que nada falle:
 *   1. **La foto vieja del renglón (`en_gn`/`producto_id`) ⛔ no se lee.** 186 de los 819 renglones
 *      de Zattia llegaron con `en_gn` en false y **hoy cruzan**: leer la foto tira uno de cada
 *      cuatro y lo llama «no está cargado».
 *   2. **Nada se descarta en silencio.** Cada renglón sale como candidato o como excluido con su
 *      motivo.
 */
import { describe, it, expect } from 'vitest'
import { itemsBancoDesdeOC, type LineaOC } from '../lib/sesionfotos/banco-oc'
import { agregarAlBanco, comoPrendas, zonasDelBanco } from '../lib/sesionfotos/banco'
import { porMotivo } from '../lib/tncat/a-sesion-fotos'
import type { Variante } from '../lib/etl/tipos'

const gn = (p: Partial<Variante> & { id: string }): Variante => ({
  pid: p.id.split('_')[0],
  sid: p.id.split('_')[1] || '1',
  name: 'TOP LEVEL',
  size: 'M',
  stock: 0,
  local: 0,
  deposito: 0,
  sku: '',
  barcode: '',
  lastSale: null,
  daysSinceLast: 999,
  sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0,
  totalSales: 0,
  lifespan: 0,
  phase: { label: 'nuevo', cls: '' },
  ...p,
})

const linea = (l: Partial<LineaOC> = {}): LineaOC => ({
  oc_ref: 'zattia:469',
  sku: 'Z-100',
  codigo_barras: null,
  nombre: 'TOP LEVEL',
  color: 'NEGRO',
  talle: 'M',
  en_gn_hoy: true,
  ...l,
})

describe('el cruce del renglón con Gestión Nube', () => {
  it('cruza por SKU y el candidato queda listo para el banco, con la OC puesta', () => {
    const v = gn({ id: 'p1_1', sku: 'Z-100', name: 'TOP LEVEL', size: 'M', deposito: 3 })
    const { items, excluidos } = itemsBancoDesdeOC([linea()], [v], { ocLabel: 'OC-0469' })
    expect(excluidos).toEqual([])
    expect(items).toEqual([
      {
        vid: 'p1_1', pid: 'p1', sid: '1',
        nombre: 'TOP LEVEL', variante: 'M', sku: 'Z-100',
        stockDep: 3, stockLoc: 0,
        candidato: 'oc', ocRef: 'zattia:469', ocLabel: 'OC-0469',
      },
    ])
  })

  it('cae al código de barras cuando el SKU ⛔ no llega — el mismo orden que la cola de fotos', () => {
    const v = gn({ id: 'p2_1', barcode: '779123', local: 1 })
    const { items } = itemsBancoDesdeOC([linea({ sku: 'NO-ESTA', codigo_barras: '779123' })], [v])
    expect(items.map((i) => i.vid)).toEqual(['p2_1'])
  })

  it('🔑 el SKU manda sobre el barcode: si los dos contestan, gana el SKU', () => {
    const porSku = gn({ id: 'p1_1', sku: 'Z-100', deposito: 2 })
    const porBc = gn({ id: 'p9_1', barcode: '779123', deposito: 2 })
    const { items } = itemsBancoDesdeOC([linea({ codigo_barras: '779123' })], [porSku, porBc])
    expect(items.map((i) => i.vid)).toEqual(['p1_1'])
  })

  it('el nombre y el talle salen de GESTIÓN NUBE, ⛔ no del renglón de la orden', () => {
    const v = gn({ id: 'p1_1', sku: 'Z-100', name: 'TOP LEVEL RIB', size: 'L', deposito: 1 })
    const { items } = itemsBancoDesdeOC([linea({ nombre: 'top level (prov)', talle: 'M' })], [v])
    expect(items[0].nombre).toBe('TOP LEVEL RIB')
    expect(items[0].variante).toBe('L')
  })
})

describe('🔴 la foto vieja del renglón ⛔ no decide nada', () => {
  it('un renglón que llegó SIN estar en GN entra igual si hoy cruza', () => {
    // El caso normal de una importación: el producto se da de alta DESPUÉS de la recepción.
    const v = gn({ id: 'p1_1', sku: 'Z-100', deposito: 5 })
    const { items, excluidos } = itemsBancoDesdeOC([linea({ en_gn_hoy: true })], [v])
    expect(items.map((i) => i.vid)).toEqual(['p1_1'])
    expect(excluidos).toEqual([])
  })

  it('🔑 el tipo ⛔ ni siquiera acepta la foto vieja: sólo `en_gn_hoy` entra al cruce', () => {
    // Si alguien sumara `en_gn`/`producto_id` a `LineaOC`, este test ⛔ no lo cazaría — lo caza
    // `tsc`. Lo que sí se fija acá es que el cruce ⛔ no mire otra cosa que el catálogo vivo:
    // con el catálogo vacío ⛔ nada entra, por más que el renglón diga que estaba en GN.
    const { items, excluidos } = itemsBancoDesdeOC([linea({ en_gn_hoy: true })], [])
    expect(items).toEqual([])
    expect(excluidos[0].motivo).toBe('sin-cruce')
  })
})

describe('lo que ⛔ no entra sale NOMBRADO, con la mano que le falta', () => {
  it('sin cruce por código ⇒ «mapeá el SKU»', () => {
    const { excluidos } = itemsBancoDesdeOC([linea({ sku: 'NO-ESTA', en_gn_hoy: null })], [gn({ id: 'p1_1', sku: 'OTRO', deposito: 1 })])
    expect(excluidos).toEqual([{ sku: 'NO-ESTA', nombre: 'TOP LEVEL · NEGRO · M', motivo: 'sin-cruce' }])
  })

  it('🔴 el espejo dice que ⛔ NO está en GN ⇒ «cargalo», que es otra mano', () => {
    const { excluidos } = itemsBancoDesdeOC([linea({ en_gn_hoy: false })], [])
    expect(excluidos[0].motivo).toBe('sin-producto-gn')
  })

  it('🔴 `en_gn_hoy` en null es «⛔ no se pudo preguntar» y ⛔ NO baja a false', () => {
    // Sin este cuidado, una lectura con el espejo caído mandaría la orden entera a «dalos de alta».
    const { excluidos } = itemsBancoDesdeOC([linea({ en_gn_hoy: null })], [])
    expect(excluidos[0].motivo).toBe('sin-cruce')
  })

  it('cruza contra una HUÉRFANA ⇒ también es «cargalo en GN»', () => {
    const h = gn({ id: 'p7_1', sku: 'Z-100', deposito: 2 })
    const { items, excluidos } = itemsBancoDesdeOC([linea({ en_gn_hoy: true })], [], { huerfanas: [h] })
    expect(items).toEqual([])
    expect(excluidos[0].motivo).toBe('sin-producto-gn')
  })

  it('sin una sola unidad ⇒ «sin stock», el mismo control que hereda el pedido', () => {
    const v = gn({ id: 'p1_1', sku: 'Z-100', local: 0, deposito: 0 })
    const { items, excluidos } = itemsBancoDesdeOC([linea()], [v])
    expect(items).toEqual([])
    expect(excluidos[0].motivo).toBe('sin-stock')
  })

  it('🔴 el mismo código en DOS productos ⇒ ambiguo: elegir sería adivinar', () => {
    const a = gn({ id: 'p1_1', sku: 'Z-100', deposito: 1 })
    const b = gn({ id: 'p2_1', sku: 'Z-100', deposito: 1 })
    const { items, excluidos } = itemsBancoDesdeOC([linea()], [a, b])
    expect(items).toEqual([])
    expect(excluidos[0].motivo).toBe('ambiguo')
  })

  it('🔑 el conteo por motivo es el MISMO de la cola de fotos, ⛔ no una copia', () => {
    const lineas = [
      linea({ sku: 'A', en_gn_hoy: false }),
      linea({ sku: 'B', en_gn_hoy: null }),
      linea({ sku: 'C', en_gn_hoy: null }),
    ]
    const { excluidos } = itemsBancoDesdeOC(lineas, [])
    expect(porMotivo(excluidos)).toEqual([
      { motivo: 'sin-cruce', n: 2 },
      { motivo: 'sin-producto-gn', n: 1 },
    ])
  })

  it('🔴 el invariante: cada renglón sale de un lado o del otro, ⛔ ninguno se pierde', () => {
    const vivas = [gn({ id: 'p1_1', sku: 'A', deposito: 1 }), gn({ id: 'p2_1', sku: 'B', local: 0, deposito: 0 })]
    const lineas = [linea({ sku: 'A' }), linea({ sku: 'B' }), linea({ sku: 'C', en_gn_hoy: false }), linea({ sku: 'D', en_gn_hoy: null })]
    const { items, excluidos } = itemsBancoDesdeOC(lineas, vivas)
    expect(items.length + excluidos.length).toBe(lineas.length)
  })
})

describe('la orden entera, apoyada en la mesa', () => {
  it('dos renglones que llegan a la MISMA variante entran una sola vez, y ⛔ no como exclusión', () => {
    const v = gn({ id: 'p1_1', sku: 'Z-100', barcode: '779', deposito: 4 })
    const { items, excluidos } = itemsBancoDesdeOC([linea(), linea({ sku: null, codigo_barras: '779' })], [v])
    expect(items.map((i) => i.vid)).toEqual(['p1_1'])
    expect(excluidos).toEqual([])
  })

  it('lo que sale de la OC se suma al banco que ya estaba y hereda la clasificación de zona', () => {
    const top = gn({ id: 'p1_1', sku: 'Z-100', name: 'TOP LEVEL', deposito: 2 })
    const jean = gn({ id: 'p2_1', sku: 'Z-200', name: 'JEAN WIDE', deposito: 2 })
    const { items } = itemsBancoDesdeOC([linea({ sku: 'Z-100' }), linea({ sku: 'Z-200' })], [top, jean])
    const banco = agregarAlBanco([], items)
    expect(comoPrendas(banco).map((p) => p.nombre)).toEqual(['TOP LEVEL', 'JEAN WIDE'])
    expect(zonasDelBanco(banco)).toEqual({ p1_1: 'arriba', p2_1: 'abajo' })
  })

  it('el `ocRef` sale del renglón cuando ⛔ no se lo pasan a mano', () => {
    const v = gn({ id: 'p1_1', sku: 'Z-100', deposito: 1 })
    const { items } = itemsBancoDesdeOC([linea({ oc_ref: 'bdi:145' })], [v])
    expect(items[0].ocRef).toBe('bdi:145')
    expect('ocLabel' in items[0]).toBe(false)
  })
})
