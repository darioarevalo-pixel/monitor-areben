import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  abrirProducto,
  agruparVivo,
  aoaAjuste,
  calcularAjuste,
  detalleHistorial,
  HEADER_AJUSTE,
  setCount,
  stockSistema,
  terminarProducto,
  ultimosPorProducto,
} from '@/lib/conteo-deposito/core'
import { realMap } from '@/lib/inventario-vivo/core'
import type { FilaVivo } from '@/lib/inventario-vivo/tipos'
import type { CdepProducto, CdepState } from '@/lib/conteo-deposito/tipos'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

function fv(over: Partial<FilaVivo>): FilaVivo {
  return { inventory_id: 1, product_id: '10', product_name: 'Cover', product_code: 'C10', size_id: '100', size_name: 'iPhone 15', store_name: 'Deposito Minorista', barcode: 'B1', available_quantity: 5, fuente: 'vivo', ...over }
}

describe('HEADER_AJUSTE · idéntico al header del Excel del legacy', () => {
  it('coincide con el literal de conteoDepConfirmar en index.html', () => {
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
    // La línea: const header = ['id_inventario', 'codigo_producto', ... 'nuevo_stock'];
    const m = html.match(/const header = \[([^\]]+)\];/)
    expect(m).toBeTruthy()
    const legacy = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect([...HEADER_AJUSTE]).toEqual(legacy)
  })
})

describe('agruparVivo', () => {
  it('agrupa por producto, ordena por nombre, arma variantes', () => {
    const rows = [
      fv({ product_id: '20', product_name: 'Zeta', size_id: '1', size_name: 'A', available_quantity: 3 }),
      fv({ product_id: '10', product_name: 'Alfa', size_id: '2', size_name: 'B', available_quantity: 7 }),
      fv({ product_id: '10', product_name: 'Alfa', size_id: '3', size_name: 'C', available_quantity: 0 }),
    ]
    const prods = agruparVivo(realMap(rows))
    expect(prods.map((p) => p.name)).toEqual(['Alfa', 'Zeta'])
    const alfa = prods[0]
    expect(alfa.variants).toHaveLength(2)
    expect(alfa.variants[0]).toMatchObject({ vid: '10_2', size: 'B', esperado: 7 })
  })
})

describe('abrir / contar / terminar', () => {
  const prod: CdepProducto = {
    pid: '10',
    name: 'Cover',
    variants: [
      { vid: '10_1', sid: '1', size: 'iPhone 15', barcode: 'B1', inventory_id: 100, esperado: 5 },
      { vid: '10_2', sid: '2', size: 'iPhone 16', barcode: 'B2', inventory_id: 101, esperado: 3 },
    ],
  }

  it('abrir congela el snap del sistema y pasa a en_progreso', () => {
    const s = abrirProducto({}, prod)
    expect(s['10'].snap).toEqual({ '10_1': 5, '10_2': 3 })
    expect(s['10'].estado).toBe('en_progreso')
  })

  it('abrir NO re-congela el snap si ya existe (aunque cambie el esperado)', () => {
    const s1 = abrirProducto({}, prod)
    const prod2 = { ...prod, variants: prod.variants.map((v) => ({ ...v, esperado: 999 })) }
    const s2 = abrirProducto(s1, prod2)
    expect(s2['10'].snap).toEqual({ '10_1': 5, '10_2': 3 }) // el snap original, no 999
  })

  it('terminar: blancos → 0 y congela dif = contado − snap', () => {
    let s: CdepState = abrirProducto({}, prod)
    s = setCount(s, '10', '10_1', '8') // contado 8, sistema 5 → +3
    // 10_2 queda en blanco → 0, sistema 3 → −3
    s = terminarProducto(s, prod, 1_700_000_000_000)
    expect(s['10'].estado).toBe('terminado')
    expect(s['10'].contado).toEqual({ '10_1': 8, '10_2': 0 })
    expect(s['10'].dif).toEqual({ '10_1': 3, '10_2': -3 })
    expect(s['10'].terminadoAt).toBe(1_700_000_000_000)
  })

  it('setCount vacío borra la cuenta; negativo se clampa a 0', () => {
    let s = abrirProducto({}, prod)
    s = setCount(s, '10', '10_1', '4')
    s = setCount(s, '10', '10_1', '')
    expect(s['10'].contado['10_1']).toBeUndefined()
    s = setCount(s, '10', '10_2', '-9')
    expect(s['10'].contado['10_2']).toBe(0)
  })
})

describe('calcularAjuste · nuevo = vivo + dif + candado de seguridad', () => {
  const prod: CdepProducto = {
    pid: '10',
    name: 'Cover',
    variants: [
      { vid: '10_1', sid: '1', size: 'A', barcode: 'B1', inventory_id: 100, esperado: 5 },
      { vid: '10_2', sid: '2', size: 'B', barcode: 'B2', inventory_id: 101, esperado: 3 },
      { vid: '10_3', sid: '3', size: 'C', barcode: 'B3', inventory_id: null, esperado: 2 }, // sin inventory_id → missing
    ],
  }
  // dif: 10_1 = +3, 10_2 = 0 (no entra), 10_3 = +1 (pero sin inventory_id → missing)
  const state: CdepState = {
    '10': { estado: 'terminado', contado: { '10_1': 8, '10_2': 3, '10_3': 3 }, snap: { '10_1': 5, '10_2': 3, '10_3': 2 }, dif: { '10_1': 3, '10_2': 0, '10_3': 1 } },
  }
  const vivo = realMap([
    fv({ product_id: '10', size_id: '1', inventory_id: 500, available_quantity: 6, product_code: 'C10', barcode: 'B1' }),
    fv({ product_id: '10', size_id: '3', inventory_id: 502, available_quantity: 1 }),
  ])

  it('genera una fila por diferencia con stock confiable; nuevo = vivo + dif', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Deposito Minorista', 'bdi', 1_700_000_000_000)
    expect(pv.rows).toHaveLength(1)
    const r = pv.rows[0]
    expect(r).toMatchObject({ inventory_id: 500, producto: 'Cover', variante: 'A', vivo: 6, dif: 3, nuevo: 9, sistema: 5, contado: 8, product_code: 'C10', barcode: 'B1', ubicacion: 'Deposito Minorista' })
  })

  it('la variante sin inventory_id (o del espejo) va a missing, no se ajusta', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Deposito Minorista', 'bdi', null)
    expect(pv.missing).toEqual([{ prod: 'Cover', size: 'C' }])
  })

  it('resumen: mas/menos/lineas/unidades y hora_stock en ISO', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Deposito Minorista', 'bdi', 1_700_000_000_000)
    expect(pv.resumen).toMatchObject({ mas: 1, menos: 0, lineas: 1, unidades_ajustadas: 3 })
    expect(pv.resumen.hora_stock).toBe(new Date(1_700_000_000_000).toISOString())
    expect(pv.resumen.productos).toEqual([{ pid: '10', nombre: 'Cover' }])
  })

  it('el candado también aplica si la variante no está en el vivo', () => {
    const soloOtra = realMap([fv({ product_id: '10', size_id: '9', inventory_id: 9, available_quantity: 1 })])
    const pv = calcularAjuste([prod], state, soloOtra, 'Dep', 'bdi', null)
    expect(pv.rows).toHaveLength(0)
    expect(pv.missing.length).toBeGreaterThan(0)
  })

  it('registro guarda TODAS las variantes contadas (incluida la que coincide), no solo las diferencias', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Deposito Minorista', 'bdi', 1_700_000_000_000)
    expect(pv.rows).toHaveLength(1) // el ajuste: solo la diferencia con stock confiable
    expect(pv.registro).toHaveLength(3) // el registro: todo lo contado
    const b = pv.registro.find((r) => r.variante === 'B')! // coincidió con el sistema (dif 0)
    expect(b).toMatchObject({ producto: 'Cover', variante: 'B', diferencia: 0, sistema: 3, contado: 3, vivo_aplicado: null, nuevo_stock: null })
    const a = pv.registro.find((r) => r.variante === 'A')!
    expect(a).toMatchObject({ diferencia: 3, contado: 8, sistema: 5, vivo_aplicado: 6, nuevo_stock: 9, inventory_id: 500 })
  })
})

describe('aoaAjuste · Excel byte-fiel', () => {
  it('header + fila [inventory_id, product_code, producto, variante, ubicacion, barcode, vivo, nuevo]', () => {
    const rows = [{ inventory_id: 500, product_code: 'C10', producto: 'Cover', variante: 'A', ubicacion: 'Deposito Minorista', barcode: 'B1', vivo: 6, dif: 3, nuevo: 9, sistema: 5, contado: 8 }]
    expect(aoaAjuste(rows)).toEqual([
      ['id_inventario', 'codigo_producto', 'producto', 'variante', 'ubicacion', 'codigo_barras', 'stock_actual', 'nuevo_stock'],
      [500, 'C10', 'Cover', 'A', 'Deposito Minorista', 'B1', 6, 9],
    ])
  })
  it('detalleHistorial mapea los campos de auditoría', () => {
    const rows = [{ inventory_id: 500, product_code: 'C10', producto: 'Cover', variante: 'A', ubicacion: 'D', barcode: 'B1', vivo: 6, dif: 3, nuevo: 9, sistema: 5, contado: 8 }]
    expect(detalleHistorial(rows)[0]).toEqual({ inventory_id: 500, barcode: 'B1', producto: 'Cover', variante: 'A', sistema: 5, contado: 8, diferencia: 3, vivo_aplicado: 6, nuevo_stock: 9 })
  })
})

describe('stockSistema', () => {
  const prod: CdepProducto = {
    pid: '10',
    name: 'Cover',
    variants: [
      { vid: '10_1', sid: '1', size: 'A', inventory_id: 100, esperado: 5 },
      { vid: '10_2', sid: '2', size: 'B', inventory_id: 101, esperado: 3 },
      { vid: '10_3', sid: '3', size: 'C', inventory_id: 102, esperado: 0 },
    ],
  }
  it('suma el stock (esperado) de todas las variantes', () => {
    expect(stockSistema(prod)).toBe(8)
  })
  it('usa el snap congelado si el producto ya se empezó a contar', () => {
    const st = { estado: 'en_progreso' as const, contado: {}, snap: { '10_1': 2, '10_2': 3, '10_3': 0 }, dif: {} }
    expect(stockSistema(prod, st)).toBe(5) // el snap de 10_1 (2) pisa su esperado (5)
  })
})

describe('ultimosPorProducto', () => {
  it('matchea por pid y por nombre (fallback)', () => {
    const products: CdepProducto[] = [
      { pid: '10', name: 'Cover A', variants: [] },
      { pid: '11', name: 'Cover B', variants: [] },
      { pid: '12', name: 'Cover C', variants: [] },
    ]
    const conteos = [
      { fecha_aplicado: '2026-07-10T10:00:00Z', resumen: { productos: [{ pid: '10', nombre: 'Cover A' }] }, detalle: [{ producto: 'Cover B' }] },
      { fecha_aplicado: '2026-07-15T10:00:00Z', resumen: { productos: [{ pid: '10', nombre: 'Cover A' }] } }, // pid 10 más reciente
    ]
    const map = ultimosPorProducto(conteos, products)
    expect(map['10']).toBe(new Date('2026-07-15T10:00:00Z').getTime())
    expect(map['11']).toBe(new Date('2026-07-10T10:00:00Z').getTime()) // por nombre
    expect(map['12']).toBeUndefined()
  })

  it('asigna fecha aunque el producto NO tenga diferencia, vía el detalle-por-nombre (fix del balance)', () => {
    // El registro nuevo mete en el detalle también las variantes que coinciden
    // (diferencia 0). Antes solo entraban por resumen.productos.
    const products: CdepProducto[] = [{ pid: '10', name: 'Cover', variants: [] }]
    const conteos = [
      { fecha_aplicado: '2026-07-12T10:00:00Z', resumen: { lineas: 0 }, detalle: [{ producto: 'Cover', variante: 'A', diferencia: 0 }] },
    ]
    const map = ultimosPorProducto(conteos, products)
    expect(map['10']).toBe(new Date('2026-07-12T10:00:00Z').getTime())
  })
})
