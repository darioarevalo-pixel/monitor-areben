import { describe, it, expect } from 'vitest'
import { cruzarParaSesion, MOTIVO_EXCLUIDO_LABEL, porMotivo, variantesSinFoto } from '@/lib/tncat/a-sesion-fotos'
import { expandirProductos, tildarVariantes, vidsAusentes, draftVacio } from '@/lib/sesionfotos/draft'
import type { Variante, Producto } from '@/lib/etl/tipos'
import type { ProductoFchk, VarianteFchk } from '@/lib/tncat/tipos'

/** Variante de Gestión Nube (el destino del cruce). */
const gn = (o: { id: string; pid: string; sku?: string; barcode?: string; local?: number; deposito?: number; name?: string; size?: string }): Variante => ({
  id: o.id, pid: o.pid, sid: o.id.split('_')[1] ?? '0', name: o.name ?? 'Funda', size: o.size ?? 'U',
  stock: (o.local ?? 0) + (o.deposito ?? 0), local: o.local ?? 0, deposito: o.deposito ?? 0,
  sku: o.sku ?? '', barcode: o.barcode ?? '', lastSale: null, daysSinceLast: 0,
  sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, lifespan: 0,
  phase: { label: 'madurez', cls: '' },
})

/** Variante de Tienda Nube. Sin `image_url` = está esperando una foto. */
const tnv = (o: { color?: string | null; foto?: string | null; sku?: string; barcode?: string }): VarianteFchk => ({
  // `??` no sirve acá: `color: null` es un caso del test, no un valor ausente.
  color: 'color' in o ? o.color : 'NEGRO', image_url: o.foto ?? null, sku: o.sku ?? null, barcode: o.barcode ?? null,
})

const tnp = (id: string, name: string, variantes: VarianteFchk[]): ProductoFchk => ({ id, name, variantes })

const prod = (id: string, name: string): Producto => ({ id, name, category: '' } as unknown as Producto)

describe('variantesSinFoto — qué es lo que espera una foto', () => {
  it('con color y sin foto propia', () => {
    const p = tnp('1', 'Funda', [tnv({ color: 'NEGRO' }), tnv({ color: 'AZUL', foto: 'x.jpg' })])
    expect(variantesSinFoto(p).map((v) => v.color)).toEqual(['NEGRO'])
  })

  it('🔑 una variante SIN color no cuenta: usa la foto principal del producto', () => {
    expect(variantesSinFoto(tnp('1', 'Funda', [tnv({ color: null })]))).toEqual([])
  })
})

describe('cruzarParaSesion — el cruce TN → GN', () => {
  it('cruza por SKU y trae el pid + las variantes a tildar', () => {
    const p = tnp('t1', 'Funda TN', [tnv({ color: 'NEGRO', sku: 'F-N' }), tnv({ color: 'AZUL', sku: 'F-A', foto: 'x.jpg' })])
    const r = cruzarParaSesion([p], [gn({ id: 'p1_1', pid: 'p1', sku: 'F-N', deposito: 3, name: 'Funda GN' })])
    expect(r.excluidos).toEqual([])
    expect(r.pedir).toEqual([{ tnId: 't1', pid: 'p1', nombre: 'Funda GN', nombreTn: 'Funda TN', vids: ['p1_1'] }])
  })

  it('si no hay SKU, cruza por código de barras', () => {
    const p = tnp('t1', 'Funda', [tnv({ barcode: '779' })])
    const r = cruzarParaSesion([p], [gn({ id: 'p1_1', pid: 'p1', barcode: '779', local: 2 })])
    expect(r.pedir[0].vids).toEqual(['p1_1'])
  })

  it('🔴 el SKU manda sobre el barcode (mismo orden que stockDeVariante)', () => {
    // Si los dos criterios se contestaran distinto, el stock que muestra la cola y el producto
    // que abre el borrador serían de dos productos diferentes.
    const p = tnp('t1', 'Funda', [tnv({ sku: 'F-N', barcode: '779' })])
    const r = cruzarParaSesion([p], [
      gn({ id: 'porSku_1', pid: 'porSku', sku: 'F-N', deposito: 1 }),
      gn({ id: 'porBc_1', pid: 'porBc', barcode: '779', deposito: 1 }),
    ])
    expect(r.pedir[0].pid).toBe('porSku')
  })

  it('el código vacío no matchea a todos (en el ETL los que faltan son cadena vacía)', () => {
    const p = tnp('t1', 'Funda', [tnv({ sku: '', barcode: '' })])
    const r = cruzarParaSesion([p], [gn({ id: 'p1_1', pid: 'p1', sku: '', barcode: '', deposito: 5 })])
    expect(r.pedir).toEqual([])
    expect(r.excluidos[0].motivo).toBe('sin-cruce')
  })

  it('un producto sin nada esperando foto no se pide NI se excluye', () => {
    const p = tnp('t1', 'Funda', [tnv({ color: 'NEGRO', sku: 'F-N', foto: 'x.jpg' })])
    expect(cruzarParaSesion([p], [gn({ id: 'p1_1', pid: 'p1', sku: 'F-N', deposito: 5 })])).toEqual({ pedir: [], excluidos: [] })
  })
})

describe('cruzarParaSesion — 🔴 lo que queda afuera, con su motivo', () => {
  const conPendiente = (sku: string) => tnp('t1', 'Funda', [tnv({ color: 'NEGRO', sku })])

  it('sin-cruce: ninguna variante cruza por código', () => {
    const r = cruzarParaSesion([conPendiente('NO-EXISTE')], [gn({ id: 'p1_1', pid: 'p1', sku: 'OTRO', deposito: 5 })])
    expect(r.pedir).toEqual([])
    expect(r.excluidos).toEqual([{ tnId: 't1', nombre: 'Funda', motivo: 'sin-cruce' }])
  })

  it('sin-producto-gn: sólo aparece entre las huérfanas (existe la variante, no el producto)', () => {
    const r = cruzarParaSesion([conPendiente('F-N')], [], [gn({ id: 'h_1', pid: 'h', sku: 'F-N', deposito: 9 })])
    expect(r.excluidos).toEqual([{ tnId: 't1', nombre: 'Funda', motivo: 'sin-producto-gn' }])
  })

  it('🔑 sin-stock: cruza pero no queda una unidad — no se fotografía lo que no está', () => {
    const r = cruzarParaSesion([conPendiente('F-N')], [gn({ id: 'p1_1', pid: 'p1', sku: 'F-N', local: 0, deposito: 0 })])
    expect(r.pedir).toEqual([])
    expect(r.excluidos[0].motivo).toBe('sin-stock')
  })

  it('🔴 ambiguo: el mismo código lleva a DOS productos de GN', () => {
    const r = cruzarParaSesion([conPendiente('F-N')], [
      gn({ id: 'p1_1', pid: 'p1', sku: 'F-N', deposito: 5 }),
      gn({ id: 'p2_1', pid: 'p2', sku: 'F-N', deposito: 5 }),
    ])
    expect(r.pedir).toEqual([])
    expect(r.excluidos[0].motivo).toBe('ambiguo')
  })

  it('🔑 dos variantes del MISMO producto no son ambiguas: van las dos', () => {
    // Pasa cuando se duplica una variante en GN. El producto es uno solo, así que no hay nada
    // que adivinar y tildar las dos es lo correcto.
    const r = cruzarParaSesion([conPendiente('F-N')], [
      gn({ id: 'p1_1', pid: 'p1', sku: 'F-N', deposito: 5 }),
      gn({ id: 'p1_2', pid: 'p1', sku: 'F-N', deposito: 5 }),
    ])
    expect(r.excluidos).toEqual([])
    expect(r.pedir[0].vids).toEqual(['p1_1', 'p1_2'])
  })

  it('las variantes sin stock se descartan pero el producto entra si alguna tiene', () => {
    const p = tnp('t1', 'Funda', [tnv({ color: 'NEGRO', sku: 'F-N' }), tnv({ color: 'AZUL', sku: 'F-A' })])
    const r = cruzarParaSesion([p], [
      gn({ id: 'p1_1', pid: 'p1', sku: 'F-N', deposito: 0 }),
      gn({ id: 'p1_2', pid: 'p1', sku: 'F-A', deposito: 4 }),
    ])
    expect(r.pedir[0].vids).toEqual(['p1_2'])
  })

  it('cada producto se juzga solo: uno entra y el otro sale, en la misma pasada', () => {
    const ok = tnp('t1', 'Entra', [tnv({ sku: 'A' })])
    const no = tnp('t2', 'Sale', [tnv({ sku: 'Z' })])
    const r = cruzarParaSesion([ok, no], [gn({ id: 'p1_1', pid: 'p1', sku: 'A', deposito: 1 })])
    expect(r.pedir.map((x) => x.nombreTn)).toEqual(['Entra'])
    expect(r.excluidos.map((x) => x.nombre)).toEqual(['Sale'])
  })
})

describe('porMotivo — el resumen que se muestra antes de navegar', () => {
  it('cuenta por motivo, en orden fijo, y saltea los que no pasaron', () => {
    const e = [
      { tnId: '1', nombre: 'a', motivo: 'sin-stock' as const },
      { tnId: '2', nombre: 'b', motivo: 'sin-cruce' as const },
      { tnId: '3', nombre: 'c', motivo: 'sin-cruce' as const },
    ]
    expect(porMotivo(e)).toEqual([{ motivo: 'sin-cruce', n: 2 }, { motivo: 'sin-stock', n: 1 }])
  })

  it('sin excluidos no hay resumen (y una lista vacía no dice nada)', () => {
    expect(porMotivo([])).toEqual([])
  })

  it('los cuatro motivos tienen texto: un motivo sin rótulo se lee como un error', () => {
    for (const m of ['sin-cruce', 'sin-producto-gn', 'sin-stock', 'ambiguo'] as const) {
      expect(MOTIVO_EXCLUIDO_LABEL[m].length).toBeGreaterThan(10)
    }
  })
})

describe('tildarVariantes / vidsAusentes', () => {
  const draft = expandirProductos(
    draftVacio(),
    ['p1'],
    [gn({ id: 'p1_1', pid: 'p1', deposito: 3, size: '1' }), gn({ id: 'p1_2', pid: 'p1', deposito: 3, size: '2' })],
    [prod('p1', 'Funda')],
  )

  it('tilda sólo lo pedido y deja el resto como estaba', () => {
    const d = tildarVariantes(draft, ['p1_1'])
    expect(d.prods[0].variantes.map((v) => [v.vid, v.sel])).toEqual([['p1_1', true], ['p1_2', false]])
  })

  it('sin vids no toca nada (es el caso de Marketing)', () => {
    expect(tildarVariantes(draft, [])).toBe(draft)
  })

  it('un vid que no está se ignora, y `vidsAusentes` lo delata', () => {
    expect(tildarVariantes(draft, ['fantasma']).prods[0].variantes.every((v) => !v.sel)).toBe(true)
    expect(vidsAusentes(draft, ['p1_1', 'fantasma'])).toEqual(['fantasma'])
  })

  it('si entró todo, no falta nada', () => {
    expect(vidsAusentes(draft, ['p1_1', 'p1_2'])).toEqual([])
  })
})

/**
 * 🔴 EL TEST QUE SOSTIENE TODO EL PUENTE.
 *
 * La cola promete "estos productos, estas variantes" y el borrador tiene que poder cumplirlo.
 * `expandirProductos` deja afuera en silencio las variantes SIN STOCK (`continue`), así que si
 * `cruzarParaSesion` no filtrara por stock, la sesión saldría con menos de lo pedido y nadie se
 * enteraría. Lo que se prueba es la cadena entera: cruzar → expandir → tildar → no falta ninguna.
 */
describe('el puente entero: lo que la cola promete, el borrador lo cumple', () => {
  const variantesGn = [
    gn({ id: 'p1_1', pid: 'p1', sku: 'F-N', deposito: 3, size: '1', name: 'Funda GN' }),
    gn({ id: 'p1_2', pid: 'p1', sku: 'F-A', deposito: 0, local: 0, size: '2', name: 'Funda GN' }), // sin stock
    gn({ id: 'p2_1', pid: 'p2', sku: 'G-N', local: 7, size: 'U', name: 'Gorra GN' }),
  ]
  const productosGn = [prod('p1', 'Funda GN'), prod('p2', 'Gorra GN')]
  const cola = [
    tnp('t1', 'Funda TN', [tnv({ color: 'NEGRO', sku: 'F-N' }), tnv({ color: 'AZUL', sku: 'F-A' })]),
    tnp('t2', 'Gorra TN', [tnv({ color: 'NEGRO', sku: 'G-N' })]),
    tnp('t3', 'Huérfano', [tnv({ color: 'NEGRO', sku: 'NO-CRUZA' })]),
  ]

  it('lo pedido entra tildado, y no falta ni una', () => {
    const { pedir, excluidos } = cruzarParaSesion(cola, variantesGn)
    expect(pedir.map((p) => p.pid)).toEqual(['p1', 'p2'])
    expect(excluidos).toEqual([{ tnId: 't3', nombre: 'Huérfano', motivo: 'sin-cruce' }])

    const vids = pedir.flatMap((p) => p.vids)
    // La azul (`p1_2`) no se pide: no queda una unidad para fotografiar.
    expect(vids).toEqual(['p1_1', 'p2_1'])

    const d = tildarVariantes(expandirProductos(draftVacio(), pedir.map((p) => p.pid), variantesGn, productosGn), vids)
    expect(vidsAusentes(d, vids)).toEqual([])
    const tildadas = d.prods.flatMap((p) => p.variantes.filter((v) => v.sel).map((v) => v.vid))
    expect(tildadas).toEqual(['p1_1', 'p2_1'])
  })

  it('🔑 y lo que NO se pidió queda sin tildar, no se cuela', () => {
    const { pedir } = cruzarParaSesion(cola, variantesGn)
    const d = tildarVariantes(expandirProductos(draftVacio(), pedir.map((p) => p.pid), variantesGn, productosGn), pedir.flatMap((p) => p.vids))
    const sinTildar = d.prods.flatMap((p) => p.variantes.filter((v) => !v.sel).map((v) => v.vid))
    expect(sinTildar).not.toContain('p1_1')
    expect(sinTildar).not.toContain('p2_1')
  })
})
