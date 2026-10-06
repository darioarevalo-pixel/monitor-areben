import { describe, it, expect } from 'vitest'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'
import {
  candidatos,
  coincide,
  depositosOrdenados,
  diasDesde,
  normNombre,
  pendientesTn,
  type Caducado,
  type ProductoGn,
  type StockPorDeposito,
  type UltimaVenta,
} from '@/lib/caducados'

const NOW = new Date('2026-07-17T12:00:00.000Z')

function prod(over: Partial<Producto> & { id: string }): Producto {
  return {
    name: 'X', sku: null, proveedor: null, category: null, retailer_price: 0, unit_cost: 0, sinCosto: false,
    margin: null, markup: null, ingresoMes: null, ingresoFecha: null, diasVivo: null, firstSale: null, lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, monthlySales: [],
    stock: 0, lifespan: LIFESPAN_SIN_DATO, lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'obsoleto', cls: 'badge-danger' }, ventasMin: { total: 0, s7: 0, s15: 0, s30: 0, s90: 0, first: null, last: null }, ventasMay: { total: 0, s7: 0, s15: 0, s30: 0, s90: 0, first: null, last: null }, minOnline: 0, minLocal: 0, ...over,
  }
}

describe('diasDesde', () => {
  it('cuenta días desde una fecha hasta now', () => {
    expect(diasDesde('2026-07-07', NOW)).toBe(10)
  })
})

describe('depositosOrdenados', () => {
  it('"Local" primero, el resto alfabético', () => {
    const stock: StockPorDeposito = {
      a: { total: 0, stores: { Depósito: 0, Local: 0, 'A-Bodega': 0 } },
    }
    expect(depositosOrdenados(stock)).toEqual(['Local', 'A-Bodega', 'Depósito'])
  })
})

describe('candidatos', () => {
  const productos = [
    prod({ id: '1', name: 'Sin stock viejo', category: 'Remeras' }),
    prod({ id: '2', name: 'Con stock' }),
    prod({ id: '3', name: 'Sin stock reciente' }),
    prod({ id: '4', name: 'Sin ventas nunca' }),
  ]
  const stock: StockPorDeposito = {
    '1': { total: 0, stores: { Local: 0, Depósito: 0 } },
    '2': { total: 5, stores: { Local: 5 } },
    '3': { total: 0, stores: { Local: 0 } },
    '4': { total: 0, stores: { Local: 0 } },
  }
  const ultimaVenta: UltimaVenta = {
    '1': '2026-01-01', // hace mucho
    '2': '2026-07-10',
    '3': '2026-07-10', // reciente
    // '4' sin venta
  }

  it('incluye sólo stock 0 + última venta anterior al corte', () => {
    const cands = candidatos(productos, stock, ultimaVenta, 30, NOW)
    expect(cands.map((c) => c.id)).toEqual(['1'])
  })
  it('excluye los que tienen stock, venta reciente o nunca vendieron', () => {
    const cands = candidatos(productos, stock, ultimaVenta, 30, NOW)
    expect(cands.some((c) => ['2', '3', '4'].includes(c.id))).toBe(false)
  })
  it('ordena por última venta ascendente (más viejo primero)', () => {
    const ps = [prod({ id: 'a' }), prod({ id: 'b' })]
    const st: StockPorDeposito = { a: { total: 0, stores: {} }, b: { total: 0, stores: {} } }
    const uv: UltimaVenta = { a: '2026-05-01', b: '2026-02-01' }
    expect(candidatos(ps, st, uv, 30, NOW).map((c) => c.id)).toEqual(['b', 'a'])
  })
  it('el corte se corre con N días', () => {
    // La venta de id '1' es de hace ~197 días: entra con N=30 pero NO con N=250
    // (ahí el corte exige un gap mayor al que tiene).
    expect(candidatos(productos, stock, ultimaVenta, 30, NOW).map((c) => c.id)).toEqual(['1'])
    expect(candidatos(productos, stock, ultimaVenta, 250, NOW)).toEqual([])
    // Venta de hace 10 días: entra con N=5, no con N=30.
    const uv2: UltimaVenta = { '3': '2026-07-07' }
    const st2: StockPorDeposito = { '3': { total: 0, stores: {} } }
    expect(candidatos([productos[2]], st2, uv2, 5, NOW).map((c) => c.id)).toEqual(['3'])
    expect(candidatos([productos[2]], st2, uv2, 30, NOW)).toEqual([])
  })
})

describe('pendientesTn — la pestaña de Tienda Nube', () => {
  const cad = (id: string, name: string, last = '2026-03-01'): Caducado => ({ id, name, cat: 'Tops', last, stores: {} })
  const gn: ProductoGn[] = [
    { id: '1', name: 'TOP ALO', category: 'Tops', active: false },
    { id: '2', name: 'TOP VERA', category: 'Tops', active: false }, // viejo, caducado
    { id: '3', name: 'TOP VERA', category: 'Tops', active: true }, // gemelo vigente
    { id: '4', name: 'TOP BALI', category: 'Tops', active: true },
    { id: '5', name: 'Top  Cíelo', category: 'Tops', active: true },
  ]
  const ST: StockPorDeposito = { '3': { total: 4, stores: { Local: 4 } } }
  const UV: UltimaVenta = { '3': '2026-09-20' }
  const cads = [cad('1', 'TOP ALO'), cad('2', 'TOP VERA'), cad('4', 'TOP BALI', '2026-08-19'), cad('5', 'Top  Cíelo')]

  it('lista los caducados que siguen en la tienda aunque estén DESACTIVADOS en GN', () => {
    const { filas } = pendientesTn([{ id: 10, name: 'TOP ALO', published: false }], gn, cads, {}, ST, UV)
    expect(filas.map((f) => f.tnId)).toEqual(['10'])
    expect(filas[0].gn[0].active).toBe(false)
    expect(filas[0].visible).toBe(false)
  })
  it('no lista la publicación que comparte nombre con un producto vigente (gemelo)', () => {
    const r = pendientesTn([{ id: 11, name: 'TOP VERA', published: true }], gn, cads, {}, ST, UV)
    expect(r.filas).toEqual([])
    expect(r.gemelos).toBe(1)
  })
  it('un gemelo vendido dentro del plazo bloquea aunque no tenga stock', () => {
    const g2: ProductoGn[] = [...gn, { id: '6', name: 'TOP ALO', category: 'Tops', active: true }]
    const r = pendientesTn([{ id: 18, name: 'TOP ALO' }], g2, cads, {}, {}, { '6': '2026-09-17' })
    expect(r.filas).toEqual([])
    expect(r.gemelos).toBe(1)
  })
  it('un duplicado desactivado, sin stock y sin ventas no bloquea (basura de carga)', () => {
    const g2: ProductoGn[] = [...gn, { id: '7', name: 'TOP ALO', category: 'Tops', active: false }]
    expect(pendientesTn([{ id: 19, name: 'TOP ALO' }], g2, cads, {}, {}, {}).filas.map((f) => f.tnId)).toEqual(['19'])
  })
  it('un duplicado ACTIVO sin ventas sí bloquea: puede ser el alta de lo que viene', () => {
    const g2: ProductoGn[] = [...gn, { id: '8', name: 'TOP ALO', category: 'Tops', active: true }]
    expect(pendientesTn([{ id: 20, name: 'TOP ALO' }], g2, cads, {}, {}, {}).gemelos).toBe(1)
  })
  it('cruza por nombre EXACTO: "TOP BALINA" no es "TOP BALI"', () => {
    expect(pendientesTn([{ id: 12, name: 'TOP BALINA' }], gn, cads, {}, ST, UV).filas).toEqual([])
  })
  it('el nombre se compara sin tildes, mayúsculas ni espacios de más', () => {
    expect(pendientesTn([{ id: 13, name: 'TOP CIELO' }], gn, cads, {}, ST, UV).filas.map((f) => f.tnId)).toEqual(['13'])
  })
  it('el código de variante manda sobre el nombre', () => {
    const tn = [{ id: 14, name: 'OTRO NOMBRE', variantes: [{ sku: 'bali-u', stock: 0 }] }]
    expect(pendientesTn(tn, gn, cads, { '4': ['BALI-U'] }, ST, UV).filas.map((f) => f.tnId)).toEqual(['14'])
  })
  it('suma el stock de TN para avisarlo; null si TN no manda variantes', () => {
    const tn = [
      { id: 15, name: 'TOP BALI', variantes: [{ stock: 2 }, { stock: 1 }] },
      { id: 16, name: 'TOP ALO' },
    ]
    const f = pendientesTn(tn, gn, cads, {}, ST, UV).filas
    expect(f.find((x) => x.tnId === '15')?.stockTn).toBe(3)
    expect(f.find((x) => x.tnId === '16')?.stockTn).toBeNull()
  })
  it('un código vacío no cruza con nada', () => {
    expect(pendientesTn([{ id: 17, name: 'X', variantes: [{ sku: '' }] }], gn, cads, { '1': [''] }, ST, UV).filas).toEqual([])
  })
})

describe('normNombre / coincide', () => {
  it('normaliza', () => expect(normNombre('  Tóp   alo ')).toBe('TOP ALO'))
  it('filtra por palabra en nombre o categoría; vacío deja todo', () => {
    expect(coincide('top', 'TOP ALO', 'Remeras')).toBe(true)
    expect(coincide('jean', 'TOP ALO', 'Tops')).toBe(false)
    expect(coincide('', 'x')).toBe(true)
  })
})

describe('eliminar de Tienda Nube — quién ve el botón', () => {
  it('sólo Darío y Bruno, y siendo admin; la cuenta técnica CRM no', async () => {
    const { puedeEliminarTn } = await import('@/components/caducados/eliminarTn')
    const p = (name: string, admin = true) => ({ name, admin, cuenta: null, acceso: {} })
    expect(puedeEliminarTn(p('Dario Arevalo'))).toBe(true)
    expect(puedeEliminarTn(p('Bruno Arevalo'))).toBe(true)
    expect(puedeEliminarTn(p('CRM'))).toBe(false)
    expect(puedeEliminarTn(p('Dario Arevalo', false))).toBe(false)
    expect(puedeEliminarTn(null)).toBe(false)
  })
})
