import { describe, it, expect } from 'vitest'
import { cargarDeposito, escanear, grupoSku, skuBase, skuDeProducto, ordenDeposito, planTerminarGrupo, SIN_SKU, terminarVarios } from '@/lib/conteo-estandar/core'
import type { CeProducto } from '@/lib/conteo-estandar/tipos'

const prod = (pid: string, name: string, skus: (string | undefined)[], esperado = 1): CeProducto => ({
  pid,
  name,
  linea: 'zattia',
  variants: skus.map((sku, i) => ({ vid: `${pid}_${i}`, sid: i, size: String(i), sku, inventory_id: i + 1, esperado })),
})

describe('grupoSku', () => {
  it('toma los segmentos sin números', () => {
    expect(grupoSku('RBE-0010-34')).toBe('RBE')
    expect(grupoSku('STU-REM-0001-S')).toBe('STU-REM')
    expect(grupoSku('RBT0109')).toBe('RBT')
    expect(grupoSku('')).toBe(SIN_SKU)
    expect(grupoSku(undefined)).toBe(SIN_SKU)
  })
})

describe('skuBase', () => {
  it('categoría + número; el resto es detalle de la variante', () => {
    expect(skuBase('RTO-0013-NG')).toBe('RTO-0013')
    expect(skuBase('RBE-0010-34')).toBe('RBE-0010')
    expect(skuBase('STU-REM-0001-S')).toBe('STU-REM-0001')
    expect(skuBase('RBT0109')).toBe('RBT0109')
    expect(skuBase('')).toBe('')
    expect(skuDeProducto(prod('x', 'X', ['RTO-0013-NG', 'RTO-0013-BL']))).toBe('RTO-0013')
  })
})

describe('ordenDeposito', () => {
  it('ordena como el estante: por grupo y por SKU numérico, sin SKU al final', () => {
    const g = ordenDeposito([
      prod('1', 'Z', [undefined]),
      prod('2', 'Sweater B', ['RSW-0010-M']),
      prod('3', 'Bermuda', ['RBE-0002-36', 'RBE-0002-34']),
      prod('4', 'Sweater A', ['RSW-0009-S']),
    ])
    expect(g.map((x) => x.grupo)).toEqual(['RBE', 'RSW', SIN_SKU])
    expect(g[1].productos.map((p) => p.name)).toEqual(['Sweater A', 'Sweater B'])
  })
})

describe('terminar categoría', () => {
  it('termina solo lo cargado y separa lo que tiene stock sin cargar', () => {
    const a = prod('a', 'A', ['RBE-1-S', 'RBE-1-M'], 2)
    const b = prod('b', 'B', ['RBE-2-S'], 3)
    const c = prod('c', 'C', ['RBE-3-S'], 0)
    let s = cargarDeposito({}, a, 'a_0', '2')
    expect(s.a.estado).toBe('en_progreso')
    s = escanear(s, b, 'b_0')
    const plan = planTerminarGrupo(s, [a, b, c])
    expect(plan.aTerminar.map((p) => p.pid)).toEqual(['a', 'b'])
    expect(plan.talles0).toBe(1) // a_1 en blanco
    expect(plan.sinCargarConStock).toEqual([])
    const fin = terminarVarios(s, plan.aTerminar, 1)
    expect(fin.a.dif).toEqual({ a_0: 0, a_1: -2 })
    expect(fin.b.dif).toEqual({ b_0: -2 })
    expect(fin.c).toBeUndefined()
  })
  it('un producto con stock y nada cargado queda afuera pero avisado', () => {
    const a = prod('a', 'A', ['RBE-1-S'], 4)
    const plan = planTerminarGrupo({}, [a])
    expect(plan.aTerminar).toEqual([])
    expect(plan.sinCargarConStock.map((p) => p.pid)).toEqual(['a'])
  })
  it('editar un terminado lo reabre', () => {
    const a = prod('a', 'A', ['RBE-1-S'], 1)
    const s = terminarVarios(cargarDeposito({}, a, 'a_0', '1'), [a], 1)
    expect(cargarDeposito(s, a, 'a_0', '2').a.estado).toBe('en_progreso')
  })
})
