import { describe, it, expect } from 'vitest'
import {
  buscarProductos,
  draftVacio,
  escanearDraft,
  expandirProductos,
  procesarDraft,
  totalDraft,
  type Draft,
} from '@/lib/sesionfotos/draft'
import { construirMapaBc } from '@/lib/sesionfotos/escaneo'
import type { Producto, Variante } from '@/lib/etl/tipos'
import { cargarExpandirLegacy, cargarProcesarLegacy } from './legacy-sesionfotos'

function mkVar(o: { id: string; pid: string; sid?: string; name?: string; size?: string; sku?: string; local?: number; deposito?: number; barcode?: string }): Variante {
  return {
    id: o.id, pid: o.pid, sid: o.sid ?? '0', name: o.name ?? 'Prod', size: o.size ?? 'M',
    stock: (o.local ?? 0) + (o.deposito ?? 0), local: o.local ?? 0, deposito: o.deposito ?? 0,
    sku: o.sku ?? '', barcode: o.barcode ?? '', lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, lifespan: 0,
    phase: { label: 'madurez', cls: '' },
  }
}
/** El legacy solo lee id/name/category de allProductos. */
const prod = (id: string, name: string, category = ''): Producto => ({ id, name, category } as unknown as Producto)
/** Forma repoInv del legacy a partir de una Variante del ETL. */
const aRepoInv = (v: Variante) => ({ vid: v.id, pid: v.pid, sid: v.sid, name: v.name, cat: '', size: v.size, sku: v.sku, local: v.local, deposito: v.deposito })

const VARIANTES: Variante[] = [
  mkVar({ id: '1_10', pid: '1', sid: '10', name: 'Remera', size: 'S', sku: 'REM-S', local: 0, deposito: 5, barcode: '111' }),
  mkVar({ id: '1_11', pid: '1', sid: '11', name: 'Remera', size: 'M', sku: 'REM-M', local: 3, deposito: 0, barcode: '112' }),
  mkVar({ id: '1_12', pid: '1', sid: '12', name: 'Remera', size: 'L', sku: 'REM-L', local: 0, deposito: 0, barcode: '113' }), // sin stock
  mkVar({ id: '2_20', pid: '2', sid: '20', name: 'Buzo', size: 'U', sku: 'BUZ-U', local: 2, deposito: 4, barcode: '222' }),
]
const PRODUCTOS: Producto[] = [prod('1', 'Remera', 'REMERAS'), prod('2', 'Buzo', 'BUZOS')]

describe('expandirProductos · paridad con sfDraftDesdeProductos', () => {
  const legacyExpandir = cargarExpandirLegacy(VARIANTES.map(aRepoInv), PRODUCTOS as unknown[])

  it('trae las variantes con stock, ordenadas, sin tildar', () => {
    const legacy = legacyExpandir(['1'])
    const port = expandirProductos(draftVacio(), ['1'], VARIANTES, PRODUCTOS).prods
    expect(port).toEqual(legacy)
    // sanity: solo S y M (L sin stock queda afuera)
    expect(port[0].variantes.map((v) => v.size)).toEqual(['M', 'S'])
  })

  it('no duplica un producto ya presente', () => {
    const d1 = expandirProductos(draftVacio(), ['1'], VARIANTES, PRODUCTOS)
    const d2 = expandirProductos(d1, ['1', '2'], VARIANTES, PRODUCTOS)
    expect(d2.prods.map((p) => p.pid)).toEqual(['1', '2'])
  })
})

describe('procesarDraft · paridad con sfProcesar (asignación de origen)', () => {
  // Draft con casos: stock alcanza en depósito, alcanza en local, no alcanza en
  // ninguno, y con origen fijado a mano (origenManual).
  const draft: Draft = {
    desc: 'Sesión test',
    prods: [
      {
        pid: '1', name: 'Remera', cat: '',
        variantes: [
          { vid: '1_10', sid: '10', size: 'S', sku: 'REM-S', local: 0, deposito: 5, sel: true, qty: 2 }, // dep alcanza
          { vid: '1_11', sid: '11', size: 'M', sku: 'REM-M', local: 3, deposito: 0, sel: true, qty: 2 }, // dep no, local sí
          { vid: '1_12', sid: '12', size: 'L', sku: 'REM-L', local: 1, deposito: 1, sel: true, qty: 5 }, // ninguno alcanza
          { vid: '1_13', sid: '13', size: 'XL', sku: 'REM-XL', local: 9, deposito: 9, sel: true, qty: 1, origenManual: 'local' }, // fijado a mano
          { vid: '1_14', sid: '14', size: 'XXL', sku: 'REM-XXL', local: 9, deposito: 9, sel: false, qty: 3 }, // NO seleccionada
        ],
      },
    ],
    pendientes: [{ barcode: '999', qty: 2, origenManual: 'local' }],
    manuales: [{ mid: 'm1', desc: 'Estampa X', qty: 3 }, { mid: 'm2', desc: '  ', qty: 1 }], // el vacío se descarta
  }
  const meta = { id: 's_test', fecha: '2026-07-18', creado: 123, creadoPor: 'ana' }

  it.each(['deposito', 'local'] as const)('mismos items con prioridad %s', (prio) => {
    const legacyItems = cargarProcesarLegacy(JSON.parse(JSON.stringify(draft)), prio, 'ana')
    const portItems = procesarDraft(draft, prio, meta)!.items
    expect(portItems).toEqual(legacyItems)
  })

  it('devuelve null si no hay nada seleccionado', () => {
    expect(procesarDraft(draftVacio(), 'deposito', meta)).toBeNull()
  })
})

describe('buscarProductos', () => {
  it('agrupa por producto las variantes con stock y matchea por nombre o SKU', () => {
    const r = buscarProductos(VARIANTES, 'rem', new Set())
    expect(r).toHaveLength(1)
    expect(r[0].pid).toBe('1')
    expect(r[0].vars.map((v) => v.size)).toEqual(['M', 'S']) // L sin stock no aparece
    expect(buscarProductos(VARIANTES, 'buz-u', new Set()).map((e) => e.pid)).toEqual(['2']) // por SKU
  })
  it('menos de 2 letras no busca; marca los ya presentes', () => {
    expect(buscarProductos(VARIANTES, 'r', new Set())).toEqual([])
    expect(buscarProductos(VARIANTES, 'rem', new Set(['1']))[0].yaEsta).toBe(true)
  })
})

describe('escanearDraft', () => {
  const mapa = construirMapaBc(VARIANTES)

  // QUIRK FIEL AL LEGACY: expandirProductos/sfDraftDesdeProductos deja las variantes
  // con stock en qty:1, y el escaneo reusa esa expansión y hace +1 → el primer
  // escaneo de una variante CON stock queda en qty 2 (no 1). Se replica tal cual
  // para no divergir del iframe en el A/B. (Una variante sin stock arrancaría en 1.)
  it('escanear un barcode existente tilda la variante, suma y fija el origen', () => {
    const { draft, resultado } = escanearDraft(draftVacio(), '111', mapa, VARIANTES, 'local', PRODUCTOS)
    expect(resultado).toMatchObject({ tipo: 'variante', size: 'S', qty: 2, origen: 'local' })
    const v = draft.prods[0].variantes.find((x) => x.vid === '1_10')!
    expect(v).toMatchObject({ sel: true, qty: 2, origenManual: 'local' })
  })

  it('escanear dos veces sigue sumando 1 por escaneo', () => {
    let d = draftVacio()
    d = escanearDraft(d, '111', mapa, VARIANTES, 'deposito', PRODUCTOS).draft // qty 2 (1 del expand + 1)
    const { draft, resultado } = escanearDraft(d, '111', mapa, VARIANTES, 'deposito', PRODUCTOS)
    expect(resultado).toMatchObject({ qty: 3 })
    expect(draft.prods[0].variantes.find((x) => x.vid === '1_10')!.qty).toBe(3)
  })

  it('un código desconocido cae a "nuevo" por código de barras', () => {
    const { draft, resultado } = escanearDraft(draftVacio(), '77777', mapa, VARIANTES, 'deposito', PRODUCTOS)
    expect(resultado).toMatchObject({ tipo: 'nuevo', barcode: '77777', qty: 1 })
    expect(draft.pendientes).toEqual([{ barcode: '77777', qty: 1, origenManual: 'deposito' }])
  })

  it('cae al SKU si el código no es un barcode', () => {
    const { resultado } = escanearDraft(draftVacio(), 'buz-u', mapa, VARIANTES, 'deposito', PRODUCTOS)
    expect(resultado).toMatchObject({ tipo: 'variante', size: 'U' })
  })
})

describe('totalDraft', () => {
  it('suma seleccionadas + pendientes + manuales', () => {
    const d: Draft = {
      desc: '', prods: [{ pid: '1', name: 'R', cat: '', variantes: [{ vid: 'a', sid: '0', size: 'S', sku: '', local: 0, deposito: 9, sel: true, qty: 2 }, { vid: 'b', sid: '0', size: 'M', sku: '', local: 0, deposito: 9, sel: false, qty: 5 }] }],
      pendientes: [{ barcode: '9', qty: 3, origenManual: 'deposito' }],
      manuales: [{ mid: 'm', desc: 'x', qty: 4 }],
    }
    expect(totalDraft(d)).toBe(2 + 3 + 4) // la no-seleccionada (5) no cuenta
  })
})
