import { describe, expect, it } from 'vitest'
import { BILLETES_INICIALES, armarSobre, billetesDe, cambioDeLaCaja, conteoVacio, limpiarConteo, totalDeConteo } from '@/lib/caja/conteo.core.js'

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

describe('billetesDe', () => {
  it('🔑 los billetes que circulan en Argentina, siempre: una lista vieja guardada ⛔ cuenta (Bruno, 12-oct)', () => {
    expect(billetesDe({})).toEqual([20000, 10000, 2000, 1000, 500, 200, 100])
    expect(billetesDe(null)).toEqual(B)
    expect(billetesDe({ billetes: [1000, 2000] })).toEqual(B)
  })
})

describe('armarSobre (Bruno, 13-oct): qué queda de fondo y qué va al sobre', () => {
  const suma = (c: Record<string, number>) => B.reduce((s, v) => s + v * (c[String(v)] || 0), 0)
  it('🔑 el fondo sale de los billetes CHICOS (cambio) y suma exacto; fondo + sobre = lo contado', () => {
    const conteo = { 20000: 18, 10000: 10, 2000: 20, 1000: 10, 500: 4, 200: 1, 100: 1 }
    const r = armarSobre(conteo, 50000, B)
    expect(r.exacto).toBe(true)
    expect(r.totalFondo).toBe(50000)
    expect(r.totalSobre).toBe(512300 - 50000)
    expect(r.fondo['20000']).toBe(0)
    expect(r.fondo['10000']).toBe(0)
    for (const v of B) expect(r.fondo[String(v)] + r.sobre[String(v)]).toBe((conteo as Record<string, number>)[String(v)] ?? 0)
    expect(suma(r.fondo) + suma(r.sobre)).toBe(512300)
  })
  it('sin cómo llegar exacto: lo más cerca por debajo y `exacto: false`', () => {
    const r = armarSobre({ 20000: 5, 10000: 0 }, 50000, B)
    expect(r.exacto).toBe(false)
    expect(r.totalFondo).toBe(40000)
    expect(r.totalSobre).toBe(60000)
  })
  it('contó menos que el fondo: todo queda en la caja y el sobre va vacío', () => {
    const r = armarSobre({ 10000: 2, 1000: 5 }, 50000, B)
    expect(r.exacto).toBe(false)
    expect(r.totalFondo).toBe(25000)
    expect(r.totalSobre).toBe(0)
  })
})

describe('nombreEnCaja y porFormaDePago (Bruno, 13-oct): crédito es crédito, ⛔ «Feria - Efectivo»', () => {
  it('sólo la forma de pago, y las cuentas de la misma forma se suman en una fila', async () => {
    const { REGLAS_INICIALES, nombreEnCaja } = await import('@/lib/caja/core.core.js')
    const { porFormaDePago } = await import('@/lib/caja/cierre.core.js')
    const r = REGLAS_INICIALES
    expect(nombreEnCaja(r.medios.efectivo.feria, r)).toBe('Efectivo')
    expect(nombreEnCaja(r.medios.credito.promo, r)).toBe('Tarjeta de crédito')
    expect(nombreEnCaja(r.titulares.dario, r)).toBe('Transferencia')
    for (const c of Object.keys(r.cuentas)) expect(nombreEnCaja(Number(c), r)).not.toMatch(/feria|oferta|CG|promo/i)
    const filas = porFormaDePago([
      { cuenta: r.medios.efectivo.normal, nombre: 'Efectivo', efectivo: true, monto: 1000, cobros: 2 },
      { cuenta: r.medios.efectivo.feria, nombre: 'Feria - Efectivo', efectivo: true, monto: 500, cobros: 1 },
      { cuenta: r.medios.credito.promo, nombre: 'Credito 10% OFF', monto: 3000, cobros: 1 },
      { cuenta: r.medios.credito.normal, nombre: 'Credito', monto: 2000, cobros: 1 },
      { cuenta: 999999, nombre: 'Vieja', monto: 10, cobros: 1 },
    ], r)
    expect(filas).toEqual([
      { nombre: 'Efectivo', efectivo: true, monto: 1500, cobros: 3 },
      { nombre: 'Tarjeta de crédito', efectivo: false, monto: 5000, cobros: 2 },
      { nombre: 'Vieja', efectivo: false, monto: 10, cobros: 1 },
    ])
  })
})

describe('cambioDeLaCaja (Bruno, 22-oct): la mitad del fondo en billetes de $1.000 o menos', () => {
  // Oráculo a mano: fondo $50.000 ⇒ umbral $25.000.
  it('🔑 $25.000 justos en chicos ⇒ bien', () => {
    expect(cambioDeLaCaja({ 20000: 1, 1000: 20, 500: 10 }, 50000, B)).toEqual({ nivel: 'bien', chicos: 25000, dosMil: 0, umbral: 25000 })
  })
  it('$24.900 en chicos y un billete de $2.000 ⇒ ojo (sólo llega con el de $2.000)', () => {
    expect(cambioDeLaCaja({ 1000: 24, 500: 1, 200: 2, 2000: 1 }, 50000, B).nivel).toBe('ojo')
  })
  it('los de $2.000 solos ⛔ hacen «bien»: 13 × $2.000 = $26.000 ⇒ ojo', () => {
    expect(cambioDeLaCaja({ 2000: 13 }, 50000, B)).toEqual({ nivel: 'ojo', chicos: 0, dosMil: 26000, umbral: 25000 })
  })
  it('🔴 el 14-oct de Zattia: $4.300 en chicos con fondo $53.600 ⇒ falta', () => {
    expect(cambioDeLaCaja({ 20000: 2, 10000: 1, 1000: 1, 500: 3, 100: 18 }, 53600, B)).toEqual({ nivel: 'falta', chicos: 4300, dosMil: 0, umbral: 26800 })
  })
  it('los de $10.000 y $20.000 ⛔ cuentan como cambio', () => {
    expect(cambioDeLaCaja({ 20000: 2, 10000: 1 }, 50000, B).nivel).toBe('falta')
  })
})
