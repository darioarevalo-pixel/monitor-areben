import { describe, expect, it } from 'vitest'
import { BILLETES_INICIALES, billetesDe, conteoVacio, limpiarConteo, normalizarBilletes, totalDeConteo } from '@/lib/caja/conteo.core.js'

/**
 * Caja · fase B: la calculadora de billetes (Bruno, 5-oct-2026). El oráculo se hizo a mano, antes:
 * 3 × $20.000 + 4 × $1.000 + 1 × $500 = $60.000 + $4.000 + $500 = $64.500.
 */
const B = [...BILLETES_INICIALES]

describe('totalDeConteo', () => {
  it('🔑 3 × $20.000 + 4 × $1.000 + 1 × $500 = $64.500', () => {
    expect(totalDeConteo({ 20000: 3, 1000: 4, 500: 1 }, B)).toBe(64500)
  })

  it('todos los billetes una vez = $33.800; vacío = 0', () => {
    expect(totalDeConteo(Object.fromEntries(B.map((v) => [v, 1])), B)).toBe(33800)
    expect(totalDeConteo({}, B)).toBe(0)
    expect(totalDeConteo(conteoVacio(B), B)).toBe(0)
  })

  it('las cantidades pueden venir como texto (lo que escribe el input); vacío o null es 0', () => {
    expect(totalDeConteo({ 10000: '2', 200: '', 100: null }, B)).toBe(20000)
  })

  it('un billete que ⛔ está en la lista se ignora', () => {
    expect(totalDeConteo({ 50: 7, 1000: 1 }, B)).toBe(1000)
    expect(totalDeConteo({ 20000: 1, 100: 3 }, [100])).toBe(300)
  })

  it('🔴 cantidad negativa o con coma ⇒ lanza, ⛔ resta ni redondea', () => {
    expect(() => totalDeConteo({ 1000: -1 }, B)).toThrow(/\$1000/)
    expect(() => totalDeConteo({ 1000: 1.5 }, B)).toThrow(/entero/)
    expect(() => totalDeConteo({ 1000: 'x' }, B)).toThrow(/entero/)
  })

  it('sin conteo o sin billetes ⇒ lanza', () => {
    expect(() => totalDeConteo(null as never, B)).toThrow(/conteo/)
    expect(() => totalDeConteo([3] as never, B)).toThrow(/conteo/)
    expect(() => totalDeConteo({}, null as never)).toThrow(/billetes/)
  })
})

describe('limpiarConteo', () => {
  it('deja cada billete de la lista, con 0 los que faltan, y nada más', () => {
    expect(limpiarConteo({ 20000: '3', 50: 9 }, [20000, 100])).toEqual({ 20000: 3, 100: 0 })
  })
})

describe('normalizarBilletes / billetesDe', () => {
  it('ordena de mayor a menor', () => {
    expect(normalizarBilletes([100, 20000, '500'])).toEqual([20000, 500, 100])
  })
  it('🔴 un billete de $0, negativo, con coma o repetido ⇒ lanza', () => {
    expect(() => normalizarBilletes([0])).toThrow()
    expect(() => normalizarBilletes([-100])).toThrow()
    expect(() => normalizarBilletes([100.5])).toThrow()
    expect(() => normalizarBilletes([100, 100])).toThrow(/repetido/)
    expect(() => normalizarBilletes([])).toThrow()
  })
  it('sin lista en las reglas, o rota ⇒ los iniciales, sin monedas', () => {
    expect(billetesDe({})).toEqual([20000, 10000, 2000, 1000, 500, 200, 100])
    expect(billetesDe(null)).toEqual(B)
    expect(billetesDe({ billetes: [0, 100] })).toEqual(B)
    expect(billetesDe({ billetes: [1000, 2000] })).toEqual([2000, 1000])
  })
})
