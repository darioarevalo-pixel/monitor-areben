import { describe, it, expect } from 'vitest'
import {
  abrir,
  agruparVivo,
  calcularAjuste,
  detalleHistorial,
  escanear,
  estadoDe,
  lineaDe,
  resolverScan,
  setDeposito,
  terminar,
  total,
  ultimosPorProducto,
} from '@/lib/conteo-estandar/core'
import { aoaAjuste } from '@/lib/conteo-deposito/core'
import { realMap } from '@/lib/inventario-vivo/core'
import type { FilaVivo } from '@/lib/inventario-vivo/tipos'
import type { CeProducto, CeState } from '@/lib/conteo-estandar/tipos'

function fv(over: Partial<FilaVivo>): FilaVivo {
  return { inventory_id: 1, product_id: '10', product_name: 'Remera', product_code: 'R10', size_id: '100', size_name: 'S', store_name: 'Local', sku: 'REM-S', barcode: 'B1', available_quantity: 5, fuente: 'vivo', ...over }
}

describe('lineaDe', () => {
  it('stunned si alguna variante tiene SKU STU*', () => {
    expect(lineaDe([{ sku: 'REM-S' }, { sku: 'STU-BOX-M' }])).toBe('stunned')
    expect(lineaDe([{ sku: 'REM-S' }, { sku: 'ZAT-1' }])).toBe('zattia')
    expect(lineaDe([{ sku: 'stu-x' }])).toBe('stunned') // case-insensitive
  })
})

describe('agruparVivo · línea + byBc', () => {
  it('etiqueta la línea por SKU y arma el mapa barcode→vid', () => {
    const rows = [
      fv({ product_id: '10', size_id: '1', sku: 'REM-S', barcode: '779001' }),
      fv({ product_id: '20', product_name: 'Box', size_id: '1', sku: 'STU-BOX', barcode: '779002' }),
    ]
    const { products, byBc } = agruparVivo(realMap(rows))
    expect(products.find((p) => p.pid === '10')!.linea).toBe('zattia')
    expect(products.find((p) => p.pid === '20')!.linea).toBe('stunned')
    expect(byBc['779001']).toBe('10_1')
    expect(byBc['779002']).toBe('20_1')
  })
})

describe('escaneo + dos acumuladores + terminar', () => {
  const prod: CeProducto = {
    pid: '10',
    name: 'Remera',
    linea: 'zattia',
    variants: [
      { vid: '10_1', sid: '1', size: 'S', barcode: 'B1', sku: 'REM-S', inventory_id: 100, esperado: 5 },
      { vid: '10_2', sid: '2', size: 'M', barcode: 'B2', sku: 'REM-M', inventory_id: 101, esperado: 4 },
    ],
  }

  it('escanear suma 1 al exhibido y congela el snap', () => {
    let s = escanear({}, prod, '10_1')
    s = escanear(s, prod, '10_1')
    expect(s['10'].exhibido['10_1']).toBe(2)
    expect(s['10'].snap).toEqual({ '10_1': 5, '10_2': 4 })
    expect(s['10'].estado).toBe('en_progreso')
  })

  it('total = exhibido + depósito', () => {
    let s = escanear({}, prod, '10_1') // exhibido 1
    s = setDeposito(s, '10', '10_1', '3') // depósito 3
    expect(total(s['10'], '10_1')).toBe(4)
  })

  it('terminar congela dif = (exhibido+depósito) − sistema; sin tocar → 0', () => {
    let s = abrir({}, prod)
    s = escanear(s, prod, '10_1') // exhibido 1
    s = setDeposito(s, '10', '10_1', '6') // total 7, sistema 5 → +2
    // 10_2 sin tocar → total 0, sistema 4 → −4
    s = terminar(s, prod, 1_700_000_000_000)
    expect(s['10'].dif).toEqual({ '10_1': 2, '10_2': -4 })
    expect(s['10'].estado).toBe('terminado')
  })
})

describe('calcularAjuste · nuevo = vivo + dif (con desglose)', () => {
  const prod: CeProducto = {
    pid: '10',
    name: 'Remera',
    linea: 'zattia',
    variants: [{ vid: '10_1', sid: '1', size: 'S', barcode: 'B1', sku: 'REM-S', inventory_id: 100, esperado: 5 }],
  }
  const state: CeState = { '10': { estado: 'terminado', exhibido: { '10_1': 1 }, deposito: { '10_1': 6 }, snap: { '10_1': 5 }, dif: { '10_1': 2 } } }
  const vivo = realMap([fv({ product_id: '10', size_id: '1', inventory_id: 500, available_quantity: 4, product_code: 'R10', barcode: 'B1' })])

  it('genera la fila con exhibido/depósito y nuevo = vivo + dif', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Local', 'zattia', 1_700_000_000_000, 'zattia')
    expect(pv.rows[0]).toMatchObject({ inventory_id: 500, producto: 'Remera', variante: 'S', vivo: 4, dif: 2, nuevo: 6, exhibido: 1, deposito: 6, contado: 7, sistema: 5 })
    expect(pv.resumen).toMatchObject({ modo: 'estandar', linea: 'zattia', mas: 1, lineas: 1, unidades_ajustadas: 2 })
  })

  it('el AOA del Excel se reusa del conteo de depósito (header exacto)', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Local', 'zattia', null, 'zattia')
    expect(aoaAjuste(pv.rows)).toEqual([
      ['id_inventario', 'codigo_producto', 'producto', 'variante', 'ubicacion', 'codigo_barras', 'stock_actual', 'nuevo_stock'],
      [500, 'R10', 'Remera', 'S', 'Local', 'B1', 4, 6],
    ])
  })

  it('detalleHistorial incluye exhibido y depósito', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Local', 'zattia', null, 'zattia')
    expect(detalleHistorial(pv.rows)[0]).toMatchObject({ exhibido: 1, deposito: 6, contado: 7, diferencia: 2, vivo_aplicado: 4, nuevo_stock: 6 })
  })
})

describe('registroConteo · guarda TODO lo contado (no solo diferencias)', () => {
  const prod: CeProducto = {
    pid: '10',
    name: 'Remera',
    linea: 'zattia',
    variants: [
      { vid: '10_1', sid: '1', size: 'S', barcode: 'B1', sku: 'REM-S', inventory_id: 100, esperado: 5 },
      { vid: '10_2', sid: '2', size: 'M', barcode: 'B2', sku: 'REM-M', inventory_id: 101, esperado: 4 },
    ],
  }
  // 10_1: total 7 vs sistema 5 → +2 (diferencia). 10_2: contado 4 = sistema 4 → 0 (coincide).
  const state: CeState = { '10': { estado: 'terminado', exhibido: { '10_1': 1, '10_2': 4 }, deposito: { '10_1': 6 }, snap: { '10_1': 5, '10_2': 4 }, dif: { '10_1': 2, '10_2': 0 } } }
  const vivo = realMap([
    fv({ product_id: '10', size_id: '1', inventory_id: 500, available_quantity: 4, barcode: 'B1', size_name: 'S' }),
    fv({ product_id: '10', size_id: '2', inventory_id: 501, available_quantity: 4, barcode: 'B2', size_name: 'M' }),
  ])

  it('rows solo trae la diferencia; registro trae TODAS las variantes (incluida la que coincide)', () => {
    const pv = calcularAjuste([prod], state, vivo, 'Local', 'zattia', null, 'zattia')
    // El Excel/ajuste: solo la diferencia.
    expect(pv.rows).toHaveLength(1)
    expect(pv.rows[0]).toMatchObject({ variante: 'S', dif: 2 })
    // El registro del historial: todo lo contado.
    expect(pv.registro).toHaveLength(2)
    const m = pv.registro.find((r) => r.variante === 'M')!
    expect(m).toMatchObject({ producto: 'Remera', variante: 'M', diferencia: 0, sistema: 4, contado: 4, exhibido: 4, deposito: 0, vivo_aplicado: 4, nuevo_stock: 4, inventory_id: 501 })
  })
})

describe('resolverScan / ultimosPorProducto', () => {
  it('resolverScan normaliza y matchea', () => {
    const byBc = { '779001': '10_1' }
    expect(resolverScan(byBc, ' 779001 ')).toBe('10_1')
    expect(resolverScan(byBc, 'nada')).toBeNull()
  })

  it('ultimosPorProducto SOLO cuenta el modo estandar de ESA línea', () => {
    const products: CeProducto[] = [{ pid: '10', name: 'Remera', linea: 'zattia', variants: [] }]
    const conteos = [
      { fecha_aplicado: '2026-07-10T10:00:00Z', resumen: { modo: 'estandar', linea: 'zattia', productos: [{ pid: '10', nombre: 'Remera' }] } },
      { fecha_aplicado: '2026-07-20T10:00:00Z', resumen: { modo: 'estandar', linea: 'stunned', productos: [{ pid: '10', nombre: 'Remera' }] } }, // otra línea → ignorado
      { fecha_aplicado: '2026-07-25T10:00:00Z', resumen: { productos: [{ pid: '10', nombre: 'Remera' }] } }, // sin modo → ignorado (conteo-deposito)
    ]
    const map = ultimosPorProducto(conteos, products, 'zattia')
    expect(map['10']).toBe(new Date('2026-07-10T10:00:00Z').getTime())
  })

  it('asigna fecha aunque el producto NO tenga diferencia, vía el detalle-por-nombre (fix del balance)', () => {
    // Simula el registro nuevo: el detalle ahora incluye una línea del producto
    // que coincidió con el sistema (diferencia 0). Antes solo entraba por
    // resumen.productos; ahora el detalle lo rescata igual.
    const products: CeProducto[] = [{ pid: '10', name: 'Remera', linea: 'zattia', variants: [] }]
    const conteos = [
      { fecha_aplicado: '2026-07-12T10:00:00Z', resumen: { modo: 'estandar', linea: 'zattia', lineas: 0 }, detalle: [{ producto: 'Remera', variante: 'S', diferencia: 0 }] },
    ]
    const map = ultimosPorProducto(conteos, products, 'zattia')
    expect(map['10']).toBe(new Date('2026-07-12T10:00:00Z').getTime())
  })
})

describe('estadoDe', () => {
  it('sin_iniciar por defecto', () => {
    expect(estadoDe({}, '99')).toBe('sin_iniciar')
  })
})
