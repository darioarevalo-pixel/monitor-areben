import { describe, it, expect } from 'vitest'
import { grupoDe, modeloDe, ordenarModelo } from '@/lib/reposicion/grupos'
import { completarExcel, construirVars, difsReporte, filtrarVars, gruposOrdenados, resolverScan } from '@/lib/conteo/core'
import type { ConteoVar, FilaInvLocal } from '@/lib/conteo/tipos'

describe('reposicion/grupos', () => {
  it('modeloDe extrae el modelo ignorando el color', () => {
    expect(modeloDe('iPhone 13 Negro')).toBe('iPhone 13')
    expect(modeloDe('iPhone 15 Pro Max Azul')).toBe('iPhone 15 Pro Max')
    expect(modeloDe('Único')).toBeNull()
  })
  it('grupoDe: modelo gana; si no, primera cat útil; si no, (otros)', () => {
    expect(grupoDe('iPhone 14 Pro', 'Fundas', [])).toBe('iPhone 14 Pro') // funda por modelo
    expect(grupoDe('Único', 'VIDRIOS TEMPLADOS, Accesorios', [])).toBe('VIDRIOS TEMPLADOS')
    expect(grupoDe('Único', 'Accesorios, Sale', [])).toBe('(otros)') // ambas descartadas
    expect(grupoDe('Único', 'Auriculares', ['auriculares'])).toBe('(otros)') // catsOff
  })
  it('ordenarModelo ordena por número y sufijo', () => {
    const arr = ['iPhone 15 Pro', 'iPhone 15', 'iPhone 13', 'iPhone 15 Pro Max']
    expect(arr.slice().sort(ordenarModelo)).toEqual(['iPhone 13', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max'])
  })
})

function inv(over: Partial<FilaInvLocal>): FilaInvLocal {
  return { product_id: '10', product_name: 'Templado', size_id: '100', size_name: 'iPhone 15', barcode: '779001', available_quantity: 3, store_name: 'Local', ...over }
}

describe('construirVars', () => {
  const prodById = { '10': { category: 'VIDRIOS TEMPLADOS' }, '11': { category: 'Fundas' } }
  it('cruza con activos, agrupa y suma esperado; ignora inactivos', () => {
    const { vars, byBc } = construirVars(
      [
        inv({ product_id: '10', size_id: '100', size_name: 'Único', barcode: '779001', available_quantity: 3 }), // sin modelo → por categoría
        inv({ product_id: '11', product_name: 'Funda', size_id: '200', size_name: 'iPhone 14 Pro', barcode: '779002', available_quantity: 1 }),
        inv({ product_id: '99', size_id: '900', barcode: '779999', available_quantity: 5 }), // inactivo (no en prodById)
      ],
      prodById,
      [],
    )
    expect(vars).toHaveLength(2)
    expect(vars.find((v) => v.pid === '10')!.grupo).toBe('VIDRIOS TEMPLADOS')
    expect(vars.find((v) => v.pid === '11')!.grupo).toBe('iPhone 14 Pro') // funda por modelo
    expect(byBc['779001']).toBe('10_100')
    expect(byBc['779999']).toBeUndefined()
  })
  it('suma esperado de varias filas del mismo vid', () => {
    const { vars } = construirVars([inv({ available_quantity: 2 }), inv({ available_quantity: 3 })], prodById, [])
    expect(vars[0].esperado).toBe(5)
  })
})

function cv(over: Partial<ConteoVar>): ConteoVar {
  return { vid: '10_100', pid: '10', name: 'Templado', size: 'iPhone 15', barcode: '779001', grupo: 'VIDRIOS', esperado: 3, ...over }
}

describe('resolverScan / visible / gruposOrdenados / difsReporte', () => {
  const vars = [
    cv({ vid: '10_100', barcode: '779001', grupo: 'VIDRIOS', esperado: 3 }),
    cv({ vid: '11_200', barcode: '779002', grupo: 'iPhone 14', esperado: 0, name: 'Funda' }),
    cv({ vid: '12_300', barcode: '779003', grupo: 'iPhone 13', esperado: 2, name: 'Otra' }),
  ]
  const byBc = { '779001': '10_100', '779002': '11_200', '779003': '12_300' }

  it('resolverScan normaliza', () => {
    expect(resolverScan(byBc, ' 779001 ')).toBe('10_100')
    expect(resolverScan(byBc, 'nada')).toBeNull()
  })
  it('gruposOrdenados: iPhone primero por modelo, resto alfabético; oculta 0-sin-escanear', () => {
    expect(gruposOrdenados(vars, {})).toEqual(['iPhone 13', 'VIDRIOS']) // 11_200 tiene esperado 0 y no escaneado → su grupo iPhone 14 no aparece
    expect(gruposOrdenados(vars, { '11_200': 1 })).toEqual(['iPhone 13', 'iPhone 14', 'VIDRIOS'])
  })
  it('difsReporte: solo las que difieren, ordenadas', () => {
    const difs = difsReporte(vars, { '10_100': 5, '12_300': 2 }) // 10_100: +2; 12_300: 0 (igual)
    expect(difs.map((d) => [d.v.vid, d.dif])).toEqual([['10_100', 2]])
  })
  it('filtrarVars: por grupo, visibles, ordenadas por nombre', () => {
    expect(filtrarVars(vars, {}, 'VIDRIOS').map((v) => v.vid)).toEqual(['10_100'])
    expect(filtrarVars(vars, {}, '__todos__').map((v) => v.vid).sort()).toEqual(['10_100', '12_300']) // 11_200 esperado 0 sin escanear → oculto
  })
})

describe('completarExcel · byte-fiel (superficie que ajusta stock)', () => {
  const vars = [
    cv({ vid: '10_100', barcode: '779001', grupo: 'VIDRIOS', esperado: 3 }),
    cv({ vid: '11_200', barcode: '779002', grupo: 'iPhone 14', esperado: 1, name: 'Funda' }),
  ]
  const count = { '10_100': 5, '11_200': 0 }
  const header = ['id_inventario', 'codigo_producto', 'producto', 'variante', 'ubicacion', 'codigo_barras', 'stock_actual', 'nuevo_stock']
  // filas: local vidrios (grupo marcado), local funda (grupo NO marcado), depósito (se descarta)
  const aoa = [
    header,
    [1, 'C1', 'Templado', 'iPhone 15', 'Local', '779001', 3, ''],
    [2, 'C2', 'Funda', 'iPhone 14 Pro', 'Local', '779002', 1, ''],
    [3, 'C3', 'Templado', 'iPhone 15', 'Deposito Minorista', '779001', 9, ''],
  ]

  it('completa nuevo_stock=contado solo del Local de grupos marcados; descarta el resto', () => {
    const r = completarExcel(aoa.map((x) => [...x]), vars, count, ['VIDRIOS'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // header + la fila de VIDRIOS (marcado). La de iPhone 14 (no marcado) y la de depósito se descartan.
    expect(r.outRows).toHaveLength(2)
    expect(r.outRows[1]).toEqual([1, 'C1', 'Templado', 'iPhone 15', 'Local', '779001', 3, 5]) // nuevo_stock=5
    expect(r.enGrupos).toBe(1)
    expect(r.ajustadas).toBe(1) // 5 !== 3
  })

  it('error si faltan columnas', () => {
    const r = completarExcel([['a', 'b']], vars, count, ['VIDRIOS'])
    expect(r).toEqual({ ok: false, motivo: 'columnas' })
  })
  it('error si no hay filas del Local de grupos marcados', () => {
    const r = completarExcel(aoa.map((x) => [...x]), vars, count, ['iPhone 99'])
    expect(r).toEqual({ ok: false, motivo: 'sin-filas' })
  })
})
