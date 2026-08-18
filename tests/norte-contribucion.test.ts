import { describe, it, expect } from 'vitest'
// `.core.js` sin tipos propios: lo importa `api/_norte.js`, que corre en Node pelado.
import { contribucionPorCanal, porUnidad, ventanaUltimos } from '../lib/norte/contribucion.core.js'

/**
 * La contribución por canal de Norte.
 *
 * ## 🔑 El oráculo de este archivo NO es que esté en verde
 *
 * Es que **reproduzca al centavo las cinco filas reales de julio-2026 que el dashboard ya tiene
 * guardadas** en `ventas_gn_agg`. Esa tabla la llenó otra implementación, en otro repo, contra la
 * API de Gestión Nube — o sea que el número viene por un camino distinto del código que se prueba
 * acá. Si alguien toca la cascada y ese caso se cae, la cascada está mal, no el test.
 *
 * Las cinco filas se eligieron porque cada una prueba algo que las otras no: la mayorista sin IVA,
 * un descuento grande, un descuento NEGATIVO (existe en la base), una cuenta facturable, y una
 * venta con envío cobrado — que es donde las dos mitades del dashboard se separan.
 */

/** Una venta con la forma que devuelve el espejo. */
const venta = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  date_sale: '2026-07-15',
  channel: 'Mi Local',
  payment_method: 'Contado/Efectivo',
  account_display: 'Efectivo',
  discount: 0,
  shipping_cost: 0,
  total_cost: 0,
  ...extra,
})

/** Las 18 cuentas del dashboard, reducidas a las que usan estos casos. */
const CUENTAS = {
  'Transferencia Mayorista': 'propia',
  'Transferencia CG': 'propia',
  Efectivo: 'efectivo',
  'Sin cobro': 'efectivo',
  'Credito - Nro 1 o 13': 'areben',
  'Mercado Pago 2': 'areben',
}

const SIN_COMISIONES: Record<string, number> = { MercadoPago: 0, 'Contado/Efectivo': 0, 'Transferencia Bancaria': 0 }

const correr = (ventas: unknown[], detalles: unknown[], comisiones: Record<string, number> = SIN_COMISIONES) =>
  contribucionPorCanal({
    ventas,
    detalles,
    cuentas: CUENTAS,
    comisiones,
    desde: '2026-07-01',
    hasta: '2026-07-31',
  })

const soloCanal = (r: { canales: { canal: string }[] }, canal: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  r.canales.find((c) => c.canal === canal) as any

describe('contribucionPorCanal — reproduce julio-2026 del dashboard', () => {
  /**
   * Cada caso es una fila de `ventas_gn_agg` (mes 2026-07), condensada en una venta: la cascada es
   * lineal en estos montos, así que sumar N ventas o una sola con los totales da lo mismo. Lo que
   * se compara es `ventas_netas`, que es la columna que el dashboard calculó.
   */
  const FILAS = [
    { que: 'mayorista por cuenta propia — sin IVA', cuenta: 'Transferencia Mayorista', canal: 'Mayorista', u: 676, merc: 2125266.3, desc: 0, envio: 0, cmv: 1294757.29, netas: 2125266.3 },
    { que: 'local en efectivo con un descuento grande', cuenta: 'Efectivo', canal: 'Mi Local', u: 103, merc: 3076170, desc: 466175.08, envio: 0, cmv: 1311484.85, netas: 2609994.92 },
    { que: 'local en efectivo con descuento NEGATIVO', cuenta: 'Efectivo', canal: 'Mi Local', u: 44, merc: 417281.5, desc: -360, envio: 0, cmv: 73945.24, netas: 417641.5 },
    { que: 'local con tarjeta — cuenta de Areben, lleva IVA', cuenta: 'Credito - Nro 1 o 13', canal: 'Mi Local', u: 35, merc: 1148150, desc: -350, envio: 0, cmv: 504255.39, netas: 949173.55 },
    { que: 'online con envío cobrado — donde las dos mitades se separan', cuenta: 'Mercado Pago 2', canal: 'Tienda Nube', u: 25, merc: 243650, desc: 42879.88, envio: 68367, cmv: 43995.96, netas: 222427.37 },
  ]

  for (const f of FILAS) {
    it(`${f.que}`, () => {
      const r = correr(
        [venta({ id: 9, channel: f.canal, account_display: f.cuenta, discount: f.desc, shipping_cost: f.envio, total_cost: f.cmv })],
        [{ sale_id: 9, quantity: f.u, total: f.merc }],
      )
      const c = soloCanal(r, r.canales[0].canal)
      expect(c.netas).toBeCloseTo(f.netas, 2)
      expect(c.unidades).toBe(f.u)
      expect(r.cobertura.usadas).toBe(1)
    })
  }

  it('la contribución es las netas menos el CMV, y por unidad divide por las unidades', () => {
    const f = FILAS[0]
    const r = correr(
      [venta({ id: 9, channel: f.canal, account_display: f.cuenta, total_cost: f.cmv })],
      [{ sale_id: 9, quantity: f.u, total: f.merc }],
    )
    const c = soloCanal(r, 'mayorista')
    expect(c.contribucion).toBeCloseTo(2125266.3 - 1294757.29, 2)
    // 🔑 El número que se venía citando desde el 17-ago era ~$1.046 por funda mayorista. Contra
    // julio da **$1.229**, y ése es el punto: el orden de magnitud que separa mayorista de online
    // es lo que la decisión usa, y hasta ahora vivía en una estimación en vez de en una medición.
    expect(c.contribUnidad).toBeCloseTo((2125266.3 - 1294757.29) / 676, 2)
    expect(Math.round(c.contribUnidad)).toBe(1229)
  })
})

describe('contribucionPorCanal — lo que se niega a calcular', () => {
  it('🔴 una cuenta que el dashboard no clasificó queda AFUERA y se la nombra', () => {
    const r = correr(
      [venta({ id: 1, account_display: 'Cuenta Nueva de Alguien', total_cost: 100 })],
      [{ sale_id: 1, quantity: 5, total: 10000 }],
    )
    expect(r.canales).toHaveLength(0)
    expect(r.cobertura.sinCuenta).toBe(1)
    expect(r.cobertura.cuentasDesconocidas).toEqual(['Cuenta Nueva de Alguien'])
  })

  it('🔴 una venta sin cuenta de cobro no se asume "no facturable" — sería 21% de más', () => {
    const r = correr([venta({ id: 1, account_display: null, total_cost: 100 })], [{ sale_id: 1, quantity: 5, total: 10000 }])
    expect(r.canales).toHaveLength(0)
    expect(r.cobertura.sinCuenta).toBe(1)
    expect(r.cobertura.cuentasDesconocidas).toEqual([]) // no hay nombre que nombrar
  })

  it('🔴 una venta sin CMV queda afuera: sin costo la contribución sale inflada', () => {
    const r = correr([venta({ id: 1, total_cost: null })], [{ sale_id: 1, quantity: 5, total: 10000 }])
    expect(r.canales).toHaveLength(0)
    expect(r.cobertura.sinCosto).toBe(1)
  })

  it('un CMV en 0 SÍ se calcula: cero es un costo, no un dato que falta', () => {
    const r = correr([venta({ id: 1, total_cost: 0 })], [{ sale_id: 1, quantity: 5, total: 10000 }])
    expect(r.cobertura.usadas).toBe(1)
    expect(soloCanal(r, 'local').contribucion).toBe(10000)
  })

  /**
   * 🔴 Pasa de verdad: el canal `tecnica` son las ventas que crea el propio Monitor para descontar
   * stock, y una venta puede quedarse sin renglones. Ahí la contribución por unidad **no es cero**
   * —cero se lee como "este canal no deja nada"—: es que no hay con qué dividir.
   */
  it('un canal con ventas pero sin unidades da contribUnidad null, no 0', () => {
    const r = correr([venta({ id: 1, channel: 'Ninguno', total_cost: 0 })], [])
    expect(soloCanal(r, 'tecnica').unidades).toBe(0)
    expect(soloCanal(r, 'tecnica').contribUnidad).toBe(null)
    expect(porUnidad(r.canales)).toEqual({})
  })

  it('la cobertura cuenta TODAS las ventas de la ventana, usadas o no', () => {
    const r = correr(
      [
        venta({ id: 1, total_cost: 100 }),
        venta({ id: 2, account_display: 'Desconocida', total_cost: 100 }),
        venta({ id: 3, total_cost: null }),
        venta({ id: 4, date_sale: '2026-06-01', total_cost: 100 }), // afuera de la ventana
      ],
      [],
    )
    expect(r.cobertura.ventas).toBe(3)
    expect(r.cobertura.usadas).toBe(1)
    expect(r.cobertura.sinCuenta).toBe(1)
    expect(r.cobertura.sinCosto).toBe(1)
  })

  it('avisa cuando ninguna comisión tiene porcentaje cargado', () => {
    expect(correr([], []).cobertura.comisionesCargadas).toBe(false)
    expect(correr([], [], { MercadoPago: 4.5 }).cobertura.comisionesCargadas).toBe(true)
  })
})

describe('contribucionPorCanal — las reglas finas', () => {
  it('la comisión se cobra sobre lo que el cliente pagó: mercadería − descuento + envío', () => {
    const r = correr(
      [venta({ id: 1, payment_method: 'MercadoPago', discount: 1000, shipping_cost: 500, total_cost: 0 })],
      [{ sale_id: 1, quantity: 1, total: 10000 }],
      { MercadoPago: 10 },
    )
    // 10% de (10.000 − 1.000 + 500) = 950. No de los 10.000 pelados.
    expect(soloCanal(r, 'local').comisiones).toBeCloseTo(950, 2)
  })

  it('el envío cobrado netea contra su costo: entra como ingreso y sale como gasto', () => {
    const conEnvio = correr([venta({ id: 1, shipping_cost: 5000, total_cost: 0 })], [{ sale_id: 1, quantity: 1, total: 10000 }])
    const sinEnvio = correr([venta({ id: 1, shipping_cost: 0, total_cost: 0 })], [{ sale_id: 1, quantity: 1, total: 10000 }])
    expect(soloCanal(conEnvio, 'local').contribucion).toBeCloseTo(soloCanal(sinEnvio, 'local').contribucion, 2)
  })

  it('la fecha que manda es la de la venta, no el rango de ids de los detalles', () => {
    const r = correr(
      [venta({ id: 1, date_sale: '2026-06-30', total_cost: 0 }), venta({ id: 2, date_sale: '2026-07-02', total_cost: 0 })],
      [
        { sale_id: 1, quantity: 100, total: 999999 },
        { sale_id: 2, quantity: 3, total: 3000 },
      ],
    )
    expect(soloCanal(r, 'local').unidades).toBe(3)
  })

  it('cada canal va por su lado y salen ordenados por lo que dejan', () => {
    const r = correr(
      [
        venta({ id: 1, channel: 'Mayorista', account_display: 'Transferencia Mayorista', total_cost: 0 }),
        venta({ id: 2, channel: 'Tienda Nube', account_display: 'Mercado Pago 2', total_cost: 0 }),
      ],
      [
        { sale_id: 1, quantity: 10, total: 1000 },
        { sale_id: 2, quantity: 1, total: 50000 },
      ],
    )
    expect(r.canales.map((c: { canal: string }) => c.canal)).toEqual(['online', 'mayorista'])
  })
})

describe('porUnidad', () => {
  it('un canal sin unidades NO entra al mapa: falta el dato, no vale cero', () => {
    const mapa = porUnidad([
      { canal: 'local', contribUnidad: 6276 },
      { canal: 'tecnica', contribUnidad: null },
    ])
    expect(mapa).toEqual({ local: 6276 })
    expect('tecnica' in mapa).toBe(false)
  })
})

describe('ventanaUltimos', () => {
  it('termina en el último día CON VENTA, no en hoy: el día en curso está a medio hacer', () => {
    expect(ventanaUltimos(['2026-08-01', '2026-08-16', '2026-08-10'], 30)).toEqual({
      desde: '2026-07-18',
      hasta: '2026-08-16',
      dias: 30,
    })
  })

  it('sin ninguna fecha usable devuelve null, no una ventana inventada', () => {
    expect(ventanaUltimos([], 30)).toBe(null)
    expect(ventanaUltimos(['', 'ayer', null as unknown as string], 30)).toBe(null)
  })

  it('acepta timestamps completos y se queda con el día', () => {
    expect(ventanaUltimos(['2026-08-16T22:31:00Z'], 7)?.hasta).toBe('2026-08-16')
    expect(ventanaUltimos(['2026-08-16T22:31:00Z'], 7)?.desde).toBe('2026-08-10')
  })
})
