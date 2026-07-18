import { describe, it, expect } from 'vitest'
import { escanearDraft, expandirProductos, pidsQueMatchean, procesarDraft, totalDraft, type SIDraft } from '@/lib/solicitudes-internas/draft'
import { construirMapaBc } from '@/lib/sesionfotos/escaneo'
import type { Producto, Variante } from '@/lib/etl/tipos'
import { cargarExpandirLegacy, cargarProcesarLegacy } from './legacy-solicitudes-internas'

/** Variante del ETL (forma real de allVariantes). */
function v(over: Partial<Variante> = {}): Variante {
  return {
    id: 'v1', pid: '1', sid: '10', name: 'Remera', size: 'M', stock: 5, local: 2, deposito: 3, sku: 'REM-M',
    barcode: '779000001', lastSale: null, daysSinceLast: 0, sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0,
    totalSales: 0, lifespan: 0, phase: { label: 'madurez', cls: '' }, ...over,
  }
}
/** El mismo dato pero en la forma `repoInv` del legacy (usa `vid` en vez de `id`). */
function repo(x: Variante): Record<string, unknown> {
  return { vid: x.id, pid: x.pid, sid: x.sid, name: x.name, size: x.size, sku: x.sku, local: x.local, deposito: x.deposito }
}
function prod(over: Partial<Producto> = {}): Producto {
  return { id: '1', name: 'Remera', category: 'Remeras', ...over } as Producto
}

const VARS: Variante[] = [
  v({ id: 'a', pid: '1', sid: '10', size: 'S', local: 1, deposito: 4, sku: 'REM-S', barcode: '779001' }),
  v({ id: 'b', pid: '1', sid: '11', size: 'M', local: 3, deposito: 0, sku: 'REM-M', barcode: '779002' }),
  v({ id: 'c', pid: '2', sid: '20', size: 'U', local: 0, deposito: 2, sku: 'BUZO-U', barcode: '779003', name: 'Buzo' }),
  v({ id: 'z', pid: '3', sid: '30', size: 'L', local: 0, deposito: 0, sku: 'AGOT-L', barcode: '779004', name: 'Agotado' }), // sin stock
]
const PRODS: Producto[] = [prod({ id: '1', name: 'Remera' }), prod({ id: '2', name: 'Buzo' } as Producto)]

describe('expandirProductos · paridad con siDraftDesdeProductos', () => {
  it('mismas variantes con stock, mismo orden por talle', () => {
    const legacy = cargarExpandirLegacy(VARS.map(repo), PRODS as unknown[])(['1', '2'])
    const port = expandirProductos({ motivo: 'Otro', tipo: 'retornable', descripcion: '', origen: 'deposito', prods: [] }, ['1', '2'], VARS, PRODS).prods
    expect(port).toEqual(legacy)
  })

  it('descarta un producto sin stock (todas las variantes en 0)', () => {
    const d = expandirProductos({ motivo: 'Otro', tipo: 'retornable', descripcion: '', origen: 'deposito', prods: [] }, ['3'], VARS, PRODS)
    expect(d.prods).toEqual([])
  })
})

describe('procesarDraft · paridad de origen y estado con siProcesar', () => {
  function draft(over: Partial<SIDraft> = {}): SIDraft {
    return {
      motivo: 'Moldería', tipo: 'retornable', descripcion: 'molde falda',
      origen: 'deposito',
      prods: [
        {
          pid: '1', name: 'Remera',
          variantes: [
            { vid: 'a', sid: '10', size: 'S', sku: 'REM-S', local: 1, deposito: 4, sel: true, qty: 2 }, // deposito alcanza
            { vid: 'b', sid: '11', size: 'M', sku: 'REM-M', local: 3, deposito: 0, sel: true, qty: 2 }, // deposito NO alcanza → local
          ],
        },
        {
          pid: '2', name: 'Buzo',
          variantes: [{ vid: 'c', sid: '20', size: 'U', sku: 'BUZO-U', local: 0, deposito: 2, sel: true, qty: 1, origenManual: 'local' }], // fijado a mano
        },
      ],
      ...over,
    }
  }

  it('asigna el origen igual que el legacy (prioridad depósito + fallback + origenManual)', () => {
    const d = draft()
    const legacy = cargarProcesarLegacy(d, 'deposito', 'ana')!
    const port = procesarDraft(d, 'deposito', { id: 'x', fecha: '2026-07-18', creado: 1, creadoPor: 'ana' })!
    expect(port.items).toEqual(legacy.items)
  })

  it('con prioridad local invierte el fallback, igual que el legacy', () => {
    const d = draft({ origen: 'local' })
    const legacy = cargarProcesarLegacy(d, 'local', 'ana')!
    const port = procesarDraft(d, 'local', { id: 'x', fecha: '2026-07-18', creado: 1, creadoPor: 'ana' })!
    expect(port.items).toEqual(legacy.items)
  })

  it('estado inicial: retornable → aprobada, consumo → pendiente (paridad)', () => {
    const ret = procesarDraft(draft({ tipo: 'retornable' }), 'deposito', { id: 'x', fecha: 'f', creado: 1, creadoPor: 'ana' })!
    const con = procesarDraft(draft({ tipo: 'consumo' }), 'deposito', { id: 'x', fecha: 'f', creado: 1, creadoPor: 'ana' })!
    expect(ret.estado).toBe('aprobada')
    expect(con.estado).toBe('pendiente')
    expect(cargarProcesarLegacy(draft({ tipo: 'retornable' }), 'deposito', 'ana')!.estado).toBe('aprobada')
    expect(cargarProcesarLegacy(draft({ tipo: 'consumo' }), 'deposito', 'ana')!.estado).toBe('pendiente')
  })

  it('sin variantes tildadas → null', () => {
    const vacio: SIDraft = { motivo: 'Otro', tipo: 'retornable', descripcion: '', origen: 'deposito', prods: [] }
    expect(procesarDraft(vacio, 'deposito', { id: 'x', fecha: 'f', creado: 1, creadoPor: 'a' })).toBeNull()
  })
})

describe('escanearDraft', () => {
  const mapa = construirMapaBc(VARS.map((x) => ({ id: x.id, barcode: x.barcode })))
  const base: SIDraft = { motivo: 'Otro', tipo: 'retornable', descripcion: '', origen: 'deposito', prods: [] }

  it('escanea por código de barras: tilda y fija el origen elegido', () => {
    const { draft, resultado } = escanearDraft(base, '779001', mapa, VARS, PRODS)
    // QUIRK heredado del legacy (siDraftScan): expandir la variante la deja en qty:1
    // y el escaneo suma → el 1er escaneo de una variante con stock queda en qty 2.
    // Se replica fiel para no divergir del iframe durante la migración (mismo quirk
    // que Sesión de fotos; candidato a arreglar en las dos versiones a la vez).
    expect(resultado).toMatchObject({ tipo: 'variante', size: 'S', qty: 2, origen: 'deposito' })
    const varA = draft.prods.find((p) => p.pid === '1')!.variantes.find((x) => x.vid === 'a')!
    expect(varA).toMatchObject({ sel: true, qty: 2, origenManual: 'deposito' })
  })

  it('escanea por SKU cuando el código no es un barcode conocido', () => {
    const { resultado } = escanearDraft(base, 'BUZO-U', mapa, VARS, PRODS)
    expect(resultado).toMatchObject({ tipo: 'variante', size: 'U' })
  })

  it('código desconocido → no-encontrado (no crea pendientes)', () => {
    const { draft, resultado } = escanearDraft(base, 'NADA-123', mapa, VARS, PRODS)
    expect(resultado).toEqual({ tipo: 'no-encontrado', code: 'NADA-123' })
    expect(draft.prods).toEqual([])
  })

  it('dos escaneos del mismo código suman cantidad (quirk: arranca en 2)', () => {
    const uno = escanearDraft(base, '779001', mapa, VARS, PRODS).draft
    const { draft } = escanearDraft(uno, '779001', mapa, VARS, PRODS)
    expect(draft.prods[0].variantes.find((x) => x.vid === 'a')!.qty).toBe(3)
  })
})

describe('pidsQueMatchean y totalDraft', () => {
  it('pidsQueMatchean: por nombre o SKU, sólo con stock, únicos', () => {
    expect(pidsQueMatchean(VARS, 'rem').sort()).toEqual(['1'])
    expect(pidsQueMatchean(VARS, 'agot')).toEqual([]) // sin stock
    expect(pidsQueMatchean(VARS, '')).toEqual([])
  })

  it('totalDraft suma sólo las variantes tildadas', () => {
    const d: SIDraft = {
      motivo: 'Otro', tipo: 'retornable', descripcion: '', origen: 'deposito',
      prods: [{ pid: '1', name: 'Remera', variantes: [
        { vid: 'a', sid: '10', size: 'S', sku: '', local: 1, deposito: 4, sel: true, qty: 3 },
        { vid: 'b', sid: '11', size: 'M', sku: '', local: 3, deposito: 0, sel: false, qty: 9 },
      ] }],
    }
    expect(totalDraft(d)).toBe(3)
  })
})
