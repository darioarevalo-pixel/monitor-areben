import { describe, expect, it } from 'vitest'
import {
  calcularRentabilidad, DEFAULTS, escenariosDeFreno, proyeccionStock, type Supuestos,
} from '@/lib/meta-ads/rentabilidad'

/**
 * El motor del umbral de rentabilidad.
 *
 * 🔑 **El banco corre el camino real**: todo sale de `calcularRentabilidad(DEFAULTS)`, la misma
 * función con los mismos valores que lee la pantalla. Con supuestos propios, este archivo estaría
 * verificando un motor que nadie usa.
 *
 * Los números clavados son los que se midieron con Bruno el 13-ago-2026 y con los que se decidió el
 * umbral de BDI: **$12.679 con tarjeta, $11.411 por transferencia, contribución $6.978 y $7.023,
 * techo $9.100 por compra, break-even 1,7×**. Si un cambio los mueve, o el cambio está mal o hubo
 * una decisión de negocio que también hay que anotar en la pantalla.
 */
const centavos = (n: number) => Math.round(n)

describe('la economía unitaria de una funda', () => {
  const r = calcularRentabilidad(DEFAULTS)

  it('reconstruye los dos precios que paga el cliente', () => {
    expect(centavos(r.tarjeta.bruto)).toBe(12679) // 14.490 menos el raspa de 12,5%
    expect(centavos(r.transferencia.bruto)).toBe(11411) // y encima el 10% de transferencia
  })

  it('el raspa y la transferencia se acumulan, o no', () => {
    const sin = calcularRentabilidad({ ...DEFAULTS, acumulan: false })
    // Sin acumular, la transferencia se descuenta del precio de lista y no del ya raspado.
    expect(centavos(sin.transferencia.bruto)).toBe(centavos(DEFAULTS.precio * 0.9))
    expect(sin.transferencia.bruto).toBeGreaterThan(r.transferencia.bruto)
  })

  it('el raspa pesa por cuánta gente lo usa', () => {
    const mitad = calcularRentabilidad({ ...DEFAULTS, usaRaspa: 50 })
    expect(centavos(mitad.tarjeta.bruto)).toBe(centavos(DEFAULTS.precio * (1 - 0.125 * 0.5)))
    const nadie = calcularRentabilidad({ ...DEFAULTS, usaRaspa: 0 })
    expect(centavos(nadie.tarjeta.bruto)).toBe(DEFAULTS.precio)
  })

  it('la cascada cierra: lo que queda es el bruto menos todo lo que se va', () => {
    const c = r.tarjeta
    expect(c.contrib).toBeCloseTo(c.bruto - c.iva - c.producto - c.iibb - c.cheque - c.comision, 6)
    expect(c.neto).toBeCloseTo(c.bruto / 1.21, 6)
    // El costo del producto ya viene sin IVA: no se le vuelve a sacar.
    expect(c.producto).toBe(DEFAULTS.costo)
  })

  it('🔑 la transferencia deja MÁS plata aunque cobre 10% menos', () => {
    expect(centavos(r.tarjeta.contrib)).toBe(6978)
    expect(centavos(r.transferencia.contrib)).toBe(7023)
    expect(r.transferencia.contrib).toBeGreaterThan(r.tarjeta.contrib)
  })
})

describe('el umbral', () => {
  const r = calcularRentabilidad(DEFAULTS)

  it('da el techo por compra y el break-even con los que se decidió', () => {
    expect(Math.round(r.costoMax / 100) * 100).toBe(9100)
    expect(r.roasBE).toBeCloseTo(1.7, 1)
    expect(r.roasObj).toBeCloseTo(3.4, 1)
  })

  it('con lo que se paga hoy quedan casi cuatro veces de aire', () => {
    expect(r.aire).toBeCloseTo(3.7, 1)
  })

  it('el ticket y el margen coinciden con lo medido', () => {
    expect(Math.round(r.ticket / 100) * 100).toBe(31300) // ticket real medido: $31.552
    expect(Math.round(r.margenPct)).toBe(58)
  })

  it('el presupuesto diario es el techo por el objetivo de ventas', () => {
    expect(r.diario).toBeCloseTo(r.costoMax * DEFAULTS.ventasDia, 6)
  })

  it('🔑 el reparto mueve el techo pero NO el break-even', () => {
    const alHueso = calcularRentabilidad({ ...DEFAULTS, reparto: 100 })
    expect(alHueso.costoMax).toBeGreaterThan(r.costoMax)
    expect(alHueso.roasBE).toBeCloseTo(r.roasBE, 6)
    // Con todo el reparto a la pauta, el techo ES el break-even.
    expect(alHueso.roasObj).toBeCloseTo(alHueso.roasBE, 6)
  })

  it('el stock se traduce a compras, días y facturación', () => {
    expect(Math.round(r.compras)).toBe(4231)
    expect(Math.round(r.dias)).toBe(42)
    expect(Math.round(r.factu / 1e6)).toBe(132)
  })
})

describe('🔑 por qué el semáforo es el costo por compra y no el ROAS', () => {
  const r = calcularRentabilidad(DEFAULTS)

  it('el mix mueve el techo menos del 1% y el ROAS más del 10%', () => {
    expect(r.extremos.spreadPct).toBeLessThan(1)
    const salto = Math.abs(r.extremos.transferencia.roas - r.extremos.tarjeta.roas) / r.extremos.tarjeta.roas
    expect(salto).toBeGreaterThan(0.1)
  })

  it('el ROAS BAJA cuando crece la transferencia, sin que la pauta empeore', () => {
    // Es la lectura que ya confundió una vez: Meta reporta lo que el cliente efectivamente pagó.
    expect(r.extremos.transferencia.roas).toBeLessThan(r.extremos.tarjeta.roas)
    expect(r.extremos.transferencia.costoMax).toBeGreaterThan(r.extremos.tarjeta.costoMax)
  })

  it('los extremos son el mismo cálculo que el mix al 0% y al 100%', () => {
    const todoTarjeta = calcularRentabilidad({ ...DEFAULTS, mix: 0 })
    const todoTransf = calcularRentabilidad({ ...DEFAULTS, mix: 100 })
    expect(r.extremos.tarjeta.costoMax).toBeCloseTo(todoTarjeta.costoMax, 6)
    expect(r.extremos.transferencia.costoMax).toBeCloseTo(todoTransf.costoMax, 6)
    expect(r.extremos.tarjeta.roas).toBeCloseTo(todoTarjeta.roasObj, 6)
  })
})

describe('los escenarios de freno', () => {
  it('el 100% es el break-even y va en rojo', () => {
    const r = calcularRentabilidad(DEFAULTS)
    const e = escenariosDeFreno(DEFAULTS, r)
    const todo = e.find((x) => x.reparto === 100)!
    expect(todo.tono).toBe('danger')
    expect(todo.roas).toBeCloseTo(r.roasBE, 6)
    expect(todo.costoMax).toBeCloseTo(r.contribPedido, 6)
  })

  it('vienen de mayor a menor y sólo uno queda marcado', () => {
    const e = escenariosDeFreno(DEFAULTS, calcularRentabilidad(DEFAULTS))
    expect(e.map((x) => x.reparto)).toEqual([...e.map((x) => x.reparto)].sort((a, b) => b - a))
    expect(e.filter((x) => x.elegido)).toHaveLength(1)
  })

  it('un reparto que coincide con uno fijo no dibuja la fila dos veces', () => {
    const s: Supuestos = { ...DEFAULTS, reparto: 75 }
    const e = escenariosDeFreno(s, calcularRentabilidad(s))
    expect(e.filter((x) => x.reparto === 75)).toHaveLength(1)
    expect(e).toHaveLength(3)
  })
})

describe('la proyección del stock', () => {
  const r = calcularRentabilidad(DEFAULTS)
  const p = proyeccionStock(DEFAULTS, r)

  it('en el techo la pauta se lleva exactamente el reparto elegido de la ganancia', () => {
    const techo = p[2]
    expect(techo.pauta).toBeCloseTo(r.compras * r.costoMax, 6)
    expect(techo.ganancia).toBeCloseTo(r.compras * r.contribPedido * 0.5, 6)
  })

  it('pagar más por compra deja menos ganancia', () => {
    expect(p[0].ganancia).toBeGreaterThan(p[1].ganancia)
    expect(p[1].ganancia).toBeGreaterThan(p[2].ganancia)
  })

  it('sin costo de hoy no se inventa una fila', () => {
    const s = { ...DEFAULTS, costoHoy: 0 }
    expect(proyeccionStock(s, calcularRentabilidad(s))).toHaveLength(2)
  })
})
