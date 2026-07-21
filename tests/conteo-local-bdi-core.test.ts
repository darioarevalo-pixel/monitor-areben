import { describe, it, expect } from 'vitest'
import {
  agruparFundas,
  calcularAjusteModelo,
  escanear,
  esFunda,
  modeloDeFunda,
  resolverScan,
  ultimosPorModelo,
} from '@/lib/conteo-local-bdi/core'
import { realMap } from '@/lib/inventario-vivo/core'
import type { FilaVivo } from '@/lib/inventario-vivo/tipos'
import type { ModeloGrupo } from '@/lib/conteo-local-bdi/tipos'

function fv(over: Partial<FilaVivo>): FilaVivo {
  return { inventory_id: 1, product_id: '10', product_name: 'Funda Silicona Case', product_code: 'F10', size_id: '1', size_name: 'iPhone 11 Negro', store_name: 'Local', barcode: 'B1', available_quantity: 5, fuente: 'vivo', ...over }
}

// Inventario del Local: 3 fundas (2 de iPhone 11 en distintos productos, 1 de iPhone 12),
// una funda no-iPhone (Samsung) y un producto que NO es funda (cargador → se excluye).
const ROWS: FilaVivo[] = [
  fv({ product_id: '10', product_name: 'Funda Silicona Case', size_id: '1', size_name: 'iPhone 11 Negro', barcode: 'B1', inventory_id: 500, available_quantity: 5 }),
  fv({ product_id: '20', product_name: 'Funda Rígida Case', size_id: '1', size_name: 'iPhone 11 Blanco', barcode: 'B2', inventory_id: 501, available_quantity: 3 }),
  fv({ product_id: '10', product_name: 'Funda Silicona Case', size_id: '2', size_name: 'iPhone 12 Negro', barcode: 'B3', inventory_id: 502, available_quantity: 2 }),
  fv({ product_id: '40', product_name: 'Funda Case Basica', size_id: '1', size_name: 'Samsung A54', barcode: 'B4', inventory_id: 503, available_quantity: 4 }),
  fv({ product_id: '30', product_name: 'Cargador USB-C', size_id: '1', size_name: 'Tipo C', barcode: 'B5', inventory_id: 504, available_quantity: 9 }),
]

describe('esFunda / modeloDeFunda', () => {
  it('funda = talle de modelo de celular O nombre con case/funda/cover', () => {
    // Por el nombre (aunque el talle no sea modelo)
    expect(esFunda('Funda Silicona Case', 'Único')).toBe(true)
    expect(esFunda('CASE transparente', 'Único')).toBe(true)
    // Por el TALLE-modelo, aunque el nombre NO diga "case" (el caso "Iconic Green")
    expect(esFunda('ICONIC GREEN', 'iPhone 11')).toBe(true)
    expect(esFunda('ICONIC BLACK', 'iPhone 16 Pro Max')).toBe(true)
    // Ni modelo ni case → no es funda
    expect(esFunda('Cargador USB-C', 'Tipo C')).toBe(false)
  })
  it('modelo = matchModelo(talle), fallback al talle crudo', () => {
    expect(modeloDeFunda('iPhone 11 Negro')).toBe('iPhone 11')
    expect(modeloDeFunda('iPhone XS Max - Blanco')).toBe('iPhone XS Max')
    expect(modeloDeFunda('Samsung A54')).toBe('Samsung A54') // no-iPhone → crudo
  })
})

describe('agruparFundas', () => {
  const { modelos, byBc, varByVid } = agruparFundas(realMap(ROWS))

  it('filtra solo fundas (excluye el cargador) y agrupa por modelo, iPhones ordenados primero', () => {
    expect(modelos.map((m) => m.modelo)).toEqual(['iPhone 11', 'iPhone 12', 'Samsung A54'])
    const i11 = modelos.find((m) => m.modelo === 'iPhone 11')!
    expect(i11.variants.map((v) => v.vid).sort()).toEqual(['10_1', '20_1']) // 2 productos distintos, mismo modelo
    // el cargador (B5) no entró
    expect(resolverScan(byBc, 'B5')).toBeNull()
    expect(varByVid['30_1']).toBeUndefined()
  })

  it('byBc mapea el código al vid de la variante', () => {
    expect(resolverScan(byBc, ' b1 ')).toBe('10_1')
    expect(resolverScan(byBc, 'B3')).toBe('10_2')
  })
})

describe('escanear', () => {
  it('suma +1 a la variante', () => {
    let s = escanear({}, '10_1')
    s = escanear(s, '10_1')
    expect(s['10_1']).toBe(2)
  })
})

describe('calcularAjusteModelo · nuevo = vivo + dif', () => {
  const { modelos } = agruparFundas(realMap(ROWS))
  const i11 = modelos.find((m) => m.modelo === 'iPhone 11') as ModeloGrupo
  // Escaneo: 10_1 = 8 (sistema 5 → +3). 20_1 NO escaneado (→ 0, sistema 3 → −3).
  const state = { '10_1': 8 }
  // Vivo FRESCO al cerrar (10_1 bajó a 6 por una venta; el ajuste usa este, no el esperado).
  const vivo = realMap([
    fv({ product_id: '10', size_id: '1', inventory_id: 500, barcode: 'B1', available_quantity: 6 }),
    fv({ product_id: '20', product_name: 'Funda Rígida Case', size_id: '1', size_name: 'iPhone 11 Blanco', inventory_id: 501, barcode: 'B2', available_quantity: 3 }),
  ])

  it('rows solo diferencias (nuevo=vivo+dif); registro TODAS las variantes; resumen sella modo+modelo', () => {
    const pv = calcularAjusteModelo(i11, state, vivo, 'Local', 'bdi', 1_700_000_000_000)
    // registro: las 2 variantes del modelo (incluida la no escaneada = 0)
    expect(pv.registro).toHaveLength(2)
    const noEscaneada = pv.registro.find((r) => r.variante === 'iPhone 11 Blanco')!
    expect(noEscaneada).toMatchObject({ contado: 0, sistema: 3, diferencia: -3, vivo_aplicado: 3, nuevo_stock: 0 })
    // rows: ambas tienen diferencia y stock confiable
    expect(pv.rows).toHaveLength(2)
    const escaneada = pv.rows.find((r) => r.variante === 'iPhone 11 Negro')!
    expect(escaneada).toMatchObject({ inventory_id: 500, contado: 8, sistema: 5, dif: 3, vivo: 6, nuevo: 9 })
    expect(pv.resumen).toMatchObject({ modo: 'local-bdi', modelo: 'iPhone 11', mas: 1, menos: 1, lineas: 2, unidades_ajustadas: 6 })
  })

  it('candado: variante con diferencia sin stock confiable en vivo → va a missing, no se ajusta', () => {
    // Vivo sin 20_1 (no confiable) → esa variante (dif −3) no se puede ajustar.
    const vivoParcial = realMap([fv({ product_id: '10', size_id: '1', inventory_id: 500, barcode: 'B1', available_quantity: 6 })])
    const pv = calcularAjusteModelo(i11, state, vivoParcial, 'Local', 'bdi', null)
    expect(pv.rows).toHaveLength(1) // solo 10_1
    expect(pv.missing).toEqual([{ prod: 'Funda Rígida Case', size: 'iPhone 11 Blanco' }])
    expect(pv.registro).toHaveLength(2) // el registro igual las lista a las dos
  })
})

describe('ultimosPorModelo', () => {
  it('solo cuenta modo local-bdi y keyea por modelo', () => {
    const conteos = [
      { fecha_aplicado: '2026-07-10T10:00:00Z', resumen: { modo: 'local-bdi', modelo: 'iPhone 11', lineas: 0 } },
      { fecha_aplicado: '2026-07-20T10:00:00Z', resumen: { modo: 'local-bdi', modelo: 'iPhone 11', lineas: 0 } }, // más reciente
      { fecha_aplicado: '2026-07-25T10:00:00Z', resumen: { modo: 'deposito', productos: [] } }, // otro modo → ignorado
    ]
    const map = ultimosPorModelo(conteos)
    expect(map['iPhone 11']).toBe(new Date('2026-07-20T10:00:00Z').getTime())
    expect(Object.keys(map)).toEqual(['iPhone 11'])
  })
})
