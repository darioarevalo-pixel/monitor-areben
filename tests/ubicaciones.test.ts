import { describe, it, expect } from 'vitest'
import { cambiosPendientes, computarUbicaciones, esNNN, filtrar, ubiValido, valorMostrado } from '@/lib/ubicaciones/core'
import type { FilaInvUbi, UbiProducto } from '@/lib/ubicaciones/tipos'

const fila = (pid: number, obs: string | null, name = 'Prod ' + pid, sku = 'S' + pid): FilaInvUbi => ({
  product_id: pid,
  product_name: name,
  sku,
  store_name: 'Deposito Minorista',
  observation: obs,
})

describe('ubicaciones/core — validación', () => {
  it('esNNN: número-número', () => {
    expect(esNNN('11-1')).toBe(true)
    expect(esNNN(' 3-12 ')).toBe(true)
    expect(esNNN('A-1')).toBe(false)
    expect(esNNN('')).toBe(false)
  })
  it('ubiValido: vacío o NN-N', () => {
    expect(ubiValido('')).toBe(true)
    expect(ubiValido('  ')).toBe(true)
    expect(ubiValido('11-1')).toBe(true)
    expect(ubiValido('viejo')).toBe(false)
  })
})

describe('ubicaciones/core — computarUbicaciones', () => {
  it('ubicación dominante NN-N + consistente', () => {
    const rows = [fila(1, '11-1'), fila(1, '11-1'), fila(1, '11-1')]
    const [p] = computarUbicaciones(rows, new Set([1]))
    expect(p.actual).toBe('11-1')
    expect(p.inconsistente).toBe(false)
    expect(p.reparable).toBe(false)
    expect(p.nvar).toBe(3)
  })

  it('variantes desparejas con dominante → reparable', () => {
    const rows = [fila(1, '11-1'), fila(1, '11-1'), fila(1, '')]
    const [p] = computarUbicaciones(rows, new Set([1]))
    expect(p.actual).toBe('11-1')
    expect(p.inconsistente).toBe(true)
    expect(p.reparable).toBe(true)
  })

  it('elige el NN-N más frecuente como dominante', () => {
    const rows = [fila(1, '11-1'), fila(1, '22-2'), fila(1, '22-2')]
    const [p] = computarUbicaciones(rows, new Set([1]))
    expect(p.actual).toBe('22-2')
    expect(p.valores.sort()).toEqual(['11-1', '22-2'])
  })

  it('formato viejo (sin NN-N) → malFormato, no reparable', () => {
    const rows = [fila(1, 'estante A'), fila(1, 'estante A')]
    const [p] = computarUbicaciones(rows, new Set([1]))
    expect(p.actual).toBe('')
    expect(p.malFormato).toBe(true)
    expect(p.reparable).toBe(false)
  })

  it('saltea productos inactivos', () => {
    const rows = [fila(1, '11-1'), fila(2, '22-2')]
    const out = computarUbicaciones(rows, new Set([1]))
    expect(out.map((p) => p.product_id)).toEqual([1])
  })

  it('ordena por nombre', () => {
    const rows = [fila(1, '1-1', 'Zeta'), fila(2, '2-2', 'Alfa')]
    const out = computarUbicaciones(rows, new Set([1, 2]))
    expect(out.map((p) => p.name)).toEqual(['Alfa', 'Zeta'])
  })
})

const prod = (over: Partial<UbiProducto>): UbiProducto => ({
  product_id: 1, name: 'P', sku: 'S', actual: '', valores: [], nvar: 1, inconsistente: false, malFormato: false, reparable: false, ...over,
})

describe('ubicaciones/core — filtrado y cambios', () => {
  it('valorMostrado: lo tipeado gana sobre el actual', () => {
    const p = prod({ product_id: 7, actual: '11-1' })
    expect(valorMostrado(p, {})).toBe('11-1')
    expect(valorMostrado(p, { '7': '22-2' })).toBe('22-2')
    expect(valorMostrado(p, { '7': '' })).toBe('') // vacío tipeado tampoco cae al actual
  })

  it('filtrar: búsqueda + solo sin ubicación + solo a reparar', () => {
    const data = [
      prod({ product_id: 1, name: 'Alfa', actual: '11-1' }),
      prod({ product_id: 2, name: 'Beta', actual: '', malFormato: true, valores: ['viejo'] }),
      prod({ product_id: 3, name: 'Gamma', actual: '22-2', reparable: true, inconsistente: true }),
    ]
    expect(filtrar(data, 'bet', false, false, {}).map((p) => p.product_id)).toEqual([2])
    // solo sin ubicación = sin NN-N válido (mostrado)
    expect(filtrar(data, '', true, false, {}).map((p) => p.product_id)).toEqual([2])
    // pero si tipeo un NN-N en el 2, deja de estar "sin ubicación"
    expect(filtrar(data, '', true, false, { '2': '9-9' }).map((p) => p.product_id)).toEqual([])
    expect(filtrar(data, '', false, true, {}).map((p) => p.product_id)).toEqual([3])
  })

  it('cambiosPendientes: separa válidos e inválidos, ignora los iguales al actual', () => {
    const data = [
      prod({ product_id: 1, actual: '11-1' }),
      prod({ product_id: 2, actual: '' }),
      prod({ product_id: 3, actual: '' }),
    ]
    const cambios = { '1': '11-1', '2': '5-5', '3': 'malo' } // 1 = igual al actual (se ignora)
    const { validos, invalidos } = cambiosPendientes(data, cambios)
    expect(validos.map((p) => p.product_id)).toEqual([2])
    expect(invalidos.map((p) => p.product_id)).toEqual([3])
  })
})
