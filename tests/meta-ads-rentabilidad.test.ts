import { describe, expect, it } from 'vitest'
import {
  calcularRentabilidad, DEFAULTS, escenariosDeFreno, normalizar, proyeccionStock, type Supuestos,
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

/**
 * 🔴 **La puerta por la que entra lo que se guarda.**
 *
 * Desde la tanda 2 los supuestos se persisten (`api/_meta-rentabilidad.js`), así que lo que llegue
 * en un POST termina siendo el techo contra el que se juzga si una campaña rinde. Lo que este
 * bloque amarra no es el formulario —el navegador ya clampea— sino **qué pasa con lo que NO viene
 * del formulario**: un campo que falta, un `"catorce mil"`, un `reparto` de 10.000%.
 *
 * La regla es una sola y es la que hace la diferencia entre un número raro y un número mentiroso:
 * **lo inválido cae al DEFAULT, lo válido-pero-fuera-de-rango se recorta contra el borde.** Un 0
 * puesto por descarte calcula igual, se ve razonable, y está mal.
 */
describe('normalizar — lo que se guarda no puede ser cualquier cosa', () => {
  it('lo que no vino queda en el default, y devuelve los campos completos', () => {
    const n = normalizar({ precio: 20000 })
    expect(n.precio).toBe(20000)
    expect(n.costo).toBe(DEFAULTS.costo)
    expect(Object.keys(n).sort()).toEqual(Object.keys(DEFAULTS).sort())
  })

  it('🔑 lo que vino MAL cae al default, no a 0', () => {
    for (const basura of ['catorce mil', null, undefined, NaN, Infinity, {}, []]) {
      expect(normalizar({ precio: basura }).precio).toBe(DEFAULTS.precio)
    }
  })

  it('lo válido fuera de rango se recorta contra el borde', () => {
    expect(normalizar({ reparto: 10000 }).reparto).toBe(100)
    expect(normalizar({ iva: -5 }).iva).toBe(0)
    expect(normalizar({ precio: -1 }).precio).toBe(0)
    expect(normalizar({ unidades: 0.2 }).unidades).toBe(1) // media unidad por pedido no existe
  })

  it('acepta el número escrito como texto, que es como viaja en un JSON descuidado', () => {
    expect(normalizar({ precio: '16990' }).precio).toBe(16990)
  })

  it('`acumulan` sólo cambia con un booleano de verdad', () => {
    expect(normalizar({ acumulan: false }).acumulan).toBe(false)
    expect(normalizar({ acumulan: 'false' }).acumulan).toBe(DEFAULTS.acumulan)
    expect(normalizar({ acumulan: 0 }).acumulan).toBe(DEFAULTS.acumulan)
  })

  it('un cuerpo vacío, o que ni siquiera es un objeto, da los defaults enteros', () => {
    for (const nada of [{}, null, undefined, 'hola', 42]) {
      expect(normalizar(nada)).toEqual(DEFAULTS)
    }
  })

  it('lo normalizado siempre calcula: ningún camino deja un NaN adentro del techo', () => {
    for (const raro of [{}, { precio: 'x' }, { unidades: -3 }, { reparto: 1e9 }, { iva: 'NaN' }]) {
      const r = calcularRentabilidad(normalizar(raro))
      expect(Number.isFinite(r.costoMax)).toBe(true)
      expect(Number.isFinite(r.ticket)).toBe(true)
    }
  })

  it('normalizar dos veces da lo mismo que una: lo guardado se puede releer sin derivar', () => {
    const una = normalizar({ precio: '16990', reparto: 200, acumulan: false })
    expect(normalizar(una)).toEqual(una)
  })
})

/**
 * Los tres renglones que entraron el 19-ago-2026 para poder cargar la economía de ZATTIA: DREI, el
 * costo de envío y el saldo de IVA a favor.
 *
 * 🔑 **El primero de estos tests es el más importante y no habla de ninguno de los tres**: nacen
 * neutros porque `normalizar()` arranca en `DEFAULTS` y una clave que la fila guardada no tiene se
 * queda con el default. Un default ≠ 0 le habría cambiado el techo **en silencio** a BDI, que tiene
 * fila desde el 13-ago. Si alguien mueve esos defaults, este test lo caza antes que la pantalla.
 */
describe('DREI, envío y saldo de IVA', () => {
  /** La fila que Bruno guardó el 13-ago-2026, tal cual está en `meta_ads_rentabilidad`. */
  const FILA_BDI = {
    iva: 21, mix: 50, iibb: 4, costo: 1700, raspa: 12.5, stock: 11000, cheque: 1.2, precio: 14490,
    transf: 10, reparto: 50, acumulan: true, costoHoy: 2472, tnTransf: 0, unidades: 2.6,
    usaRaspa: 100, pasTransf: 1, tnTarjeta: 1, ventasDia: 100, pasTarjeta: 8,
  }

  it('🔴 los tres nacen neutros: la fila guardada de BDI sigue dando el mismo techo', () => {
    const r = calcularRentabilidad(normalizar(FILA_BDI))
    expect(centavos(r.costoMax)).toBe(9101)
    expect(r.recuperoPedido).toBe(0)
    expect(r.cajaPedido).toBe(r.contribPedido)
    expect(r.roasBECaja).toBe(r.roasBE)
  })

  it('el DREI sale de la contribución, y en las dos puntas del mix', () => {
    const con = calcularRentabilidad({ ...DEFAULTS, drei: 0.75 })
    for (const c of [con.tarjeta, con.transferencia]) {
      expect(centavos(c.drei)).toBe(centavos(c.bruto * 0.0075))
      expect(c.contrib).toBeCloseTo(c.neto - c.producto - c.iibb - c.cheque - c.drei - c.comision, 6)
    }
    expect(con.contribPedido).toBeLessThan(calcularRentabilidad(DEFAULTS).contribPedido)
  })

  it('el envío es del PEDIDO y no de la unidad: no se multiplica por las unidades', () => {
    const una = calcularRentabilidad({ ...DEFAULTS, envio: 7710, unidades: 1 })
    const cinco = calcularRentabilidad({ ...DEFAULTS, envio: 7710, unidades: 5 })
    const baseUna = calcularRentabilidad({ ...DEFAULTS, unidades: 1 })
    const baseCinco = calcularRentabilidad({ ...DEFAULTS, unidades: 5 })
    // El mismo descuento en las dos, aunque una tenga cinco veces más unidades.
    expect(baseUna.contribPedido - una.contribPedido).toBeCloseTo(baseCinco.contribPedido - cinco.contribPedido, 6)
  })

  it('de la GANANCIA el envío sale NETO, porque se factura con IVA', () => {
    const sin = calcularRentabilidad(DEFAULTS)
    const con = calcularRentabilidad({ ...DEFAULTS, envio: 7710 })
    expect(sin.contribPedido - con.contribPedido).toBeCloseTo(7710 / 1.21, 6)
  })

  it('de la CAJA sale ENTERO: con saldo a favor el crédito del envío no vuelve nunca', () => {
    const con = calcularRentabilidad({ ...DEFAULTS, envio: 7710, saldoIva: true })
    const sinEnvio = calcularRentabilidad({ ...DEFAULTS, saldoIva: true })
    expect(sinEnvio.cajaPedido - con.cajaPedido).toBeCloseTo(7710, 6)
    // Y la diferencia entre las dos lecturas es exactamente el IVA del envío.
    expect((sinEnvio.contribPedido - con.contribPedido) - (sinEnvio.cajaPedido - con.cajaPedido))
      .toBeCloseTo(7710 / 1.21 - 7710, 6)
  })

  it('el recupero es el IVA débito del ticket, y NO entra en la ganancia', () => {
    const s: Supuestos = { ...DEFAULTS, saldoIva: true }
    const con = calcularRentabilidad(s)
    const sin = calcularRentabilidad(DEFAULTS)
    expect(con.recuperoPedido).toBeCloseTo(con.ticket * (21 / 121), 6)
    // 🔑 La ganancia y el techo del semáforo NO se mueven: el recupero vive en su propio renglón.
    expect(con.contribPedido).toBeCloseTo(sin.contribPedido, 6)
    expect(con.costoMax).toBeCloseTo(sin.costoMax, 6)
    // Lo que aparece es el segundo techo, y es más alto.
    expect(con.cajaPedido).toBeCloseTo(con.contribPedido + con.recuperoPedido, 6)
    expect(con.costoMaxCaja).toBeGreaterThan(con.costoMax)
    expect(con.roasBECaja).toBeLessThan(con.roasBE)
  })

  it('apagado, el recupero es cero y las dos lecturas son la misma', () => {
    const r = calcularRentabilidad({ ...DEFAULTS, saldoIva: false, envio: 7710 })
    expect(r.recuperoPedido).toBe(0)
    expect(r.cajaPedido).toBeCloseTo(r.contribPedido, 6)
    expect(r.costoMaxCaja).toBeCloseTo(r.costoMax, 6)
  })

  it('`saldoIva` sólo cambia con un booleano de verdad, como `acumulan`', () => {
    expect(normalizar({ saldoIva: true }).saldoIva).toBe(true)
    expect(normalizar({ saldoIva: 'true' }).saldoIva).toBe(DEFAULTS.saldoIva)
    expect(normalizar({ saldoIva: 1 }).saldoIva).toBe(DEFAULTS.saldoIva)
  })

  it('la economía online de Zattia, cargada entera, da los dos números medidos', () => {
    const zattia: Supuestos = {
      ...DEFAULTS,
      precio: 30430, raspa: 0, usaRaspa: 0, transf: 10, acumulan: false, mix: 50,
      costo: 14657, iva: 21, iibb: 3, drei: 0.75, cheque: 1.2,
      tnTarjeta: 0, pasTarjeta: 9, tnTransf: 0, pasTransf: 1,
      unidades: 1.59, envio: 0, saldoIva: true, reparto: 50, costoHoy: 1229,
    }
    const r = calcularRentabilidad(zattia)
    // Ganancia ~$10.251 y caja ~$18.228 por pedido, con el ticket de $45.964 de la mezcla 50/50.
    expect(centavos(r.ticket)).toBeGreaterThan(45000)
    expect(centavos(r.ticket)).toBeLessThan(47000)
    expect(r.roasBE).toBeGreaterThan(4.2)
    expect(r.roasBE).toBeLessThan(4.8)
    expect(r.roasBECaja).toBeGreaterThan(2.3)
    expect(r.roasBECaja).toBeLessThan(2.7)
  })
})
