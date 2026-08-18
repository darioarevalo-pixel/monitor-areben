import { describe, it, expect } from 'vitest'
// `.core.js` sin tipos propios: los importa `api/_norte.js`, que corre en Node pelado.
import { baseDeReparto, pylPorLinea } from '../lib/norte/pyl.core.js'
import { contribucionPorCanal } from '../lib/norte/contribucion.core.js'

/**
 * El **P&L «por arriba» por línea** de Norte.
 *
 * ## 🔑 El oráculo de este archivo NO es que esté en verde
 *
 * Son dos, y ninguno es la suite:
 *
 * 1. **Las cinco filas reales de julio-2026** que el dashboard tiene guardadas en `ventas_gn_agg` —
 *    las mismas de `tests/norte-contribucion.test.ts`— tienen que dar las mismas `ventas_netas`
 *    leídas por línea. Ese número lo calculó otra implementación, en otro repo, contra la API de
 *    Gestión Nube.
 * 2. **El total por línea tiene que ser el total por canal, al centavo.** Son dos cortes de la
 *    misma plata: si el reparto entre líneas se lleva algo puesto, o lo duplica, los dos totales se
 *    separan. Es la prueba de que los pesos suman 1, y la razón de que la cascada esté escrita en
 *    un solo lugar.
 *
 * Si alguno de los dos se cae, está mal el código y no el test.
 */

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

const CUENTAS = {
  'Transferencia Mayorista': 'propia',
  Efectivo: 'efectivo',
  'Credito - Nro 1 o 13': 'areben',
  'Mercado Pago 2': 'areben',
}

const SIN_COMISIONES: Record<string, number> = { 'Contado/Efectivo': 0, MercadoPago: 0 }

const correr = (
  store: string,
  ventas: unknown[],
  detalles: unknown[],
  skuPor: Map<string, string> | null = null,
  comisiones: Record<string, number> = SIN_COMISIONES,
) =>
  pylPorLinea({
    store,
    ventas,
    detalles,
    skuPor,
    cuentas: CUENTAS,
    comisiones,
    desde: '2026-07-01',
    hasta: '2026-07-31',
  })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const soloLinea = (r: { lineas: { linea: string }[] }, linea: string) => r.lineas.find((l) => l.linea === linea) as any

describe('pylPorLinea — reproduce julio-2026 del dashboard', () => {
  /** Las mismas cinco filas de `tests/norte-contribucion.test.ts`, leídas por línea. */
  const FILAS = [
    { que: 'mayorista por cuenta propia — sin IVA', cuenta: 'Transferencia Mayorista', canal: 'Mayorista', u: 676, merc: 2125266.3, desc: 0, envio: 0, cmv: 1294757.29, netas: 2125266.3 },
    { que: 'local en efectivo con un descuento grande', cuenta: 'Efectivo', canal: 'Mi Local', u: 103, merc: 3076170, desc: 466175.08, envio: 0, cmv: 1311484.85, netas: 2609994.92 },
    { que: 'local en efectivo con descuento NEGATIVO', cuenta: 'Efectivo', canal: 'Mi Local', u: 44, merc: 417281.5, desc: -360, envio: 0, cmv: 73945.24, netas: 417641.5 },
    { que: 'local con tarjeta — cuenta de Areben, lleva IVA', cuenta: 'Credito - Nro 1 o 13', canal: 'Mi Local', u: 35, merc: 1148150, desc: -350, envio: 0, cmv: 504255.39, netas: 949173.55 },
    { que: 'online con envío cobrado', cuenta: 'Mercado Pago 2', canal: 'Tienda Nube', u: 25, merc: 243650, desc: 42879.88, envio: 68367, cmv: 43995.96, netas: 222427.37 },
  ]

  for (const f of FILAS) {
    it(`${f.que}`, () => {
      const r = correr(
        'bdi',
        [venta({ id: 9, channel: f.canal, account_display: f.cuenta, discount: f.desc, shipping_cost: f.envio, total_cost: f.cmv })],
        [{ sale_id: 9, product_id: 100, quantity: f.u, total: f.merc }],
      )
      const l = soloLinea(r, 'bdi')
      expect(l.netas).toBeCloseTo(f.netas, 2)
      expect(l.unidades).toBe(f.u)
      // El margen bruto es el renglón que el corte por canal no muestra: netas − CMV.
      expect(l.margenBruto).toBeCloseTo(f.netas - f.cmv, 2)
      expect(r.cobertura.usadas).toBe(1)
    })
  }

  it('🔑 en BDI el total por línea es el total por canal, al centavo', () => {
    const ventas = FILAS.map((f, i) =>
      venta({ id: i + 1, channel: f.canal, account_display: f.cuenta, discount: f.desc, shipping_cost: f.envio, total_cost: f.cmv }),
    )
    const detalles = FILAS.map((f, i) => ({ sale_id: i + 1, product_id: 100, quantity: f.u, total: f.merc }))

    const porLinea = correr('bdi', ventas, detalles)
    const porCanal = contribucionPorCanal({
      ventas,
      detalles,
      cuentas: CUENTAS,
      comisiones: SIN_COMISIONES,
      desde: '2026-07-01',
      hasta: '2026-07-31',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sumar = (cs: any[], campo: string) => cs.reduce((t, c) => t + c[campo], 0)

    for (const campo of ['netas', 'cmv', 'mercaderia', 'iva', 'descuentos', 'envios', 'comisiones', 'contribucion']) {
      expect(porLinea.total[campo]).toBeCloseTo(sumar(porCanal.canales, campo), 2)
    }
    expect(porLinea.total.unidades).toBe(sumar(porCanal.canales, 'unidades'))
    expect(porLinea.total.ventas).toBe(porCanal.cobertura.usadas)
  })
})

describe('pylPorLinea — el reparto de una venta mixta', () => {
  /** Zattia y Stunned conviven en la misma base: la línea sale del prefijo de SKU. */
  const SKUS = new Map([
    ['1', 'ZAT-001'],
    ['2', 'STU-500'],
  ])

  it('🔑 reparte el CMV, el descuento y el envío por el peso de la mercadería de cada línea', () => {
    // 75% Zattia / 25% Stunned. CMV 40.000, descuento 8.000, envío 4.000.
    const r = correr(
      'zattia',
      [venta({ id: 7, discount: 8000, shipping_cost: 4000, total_cost: 40000 })],
      [
        { sale_id: 7, product_id: 1, quantity: 3, total: 75000 },
        { sale_id: 7, product_id: 2, quantity: 1, total: 25000 },
      ],
      SKUS,
    )
    const zat = soloLinea(r, 'zattia')
    const stu = soloLinea(r, 'stunned')

    expect(zat.mercaderia).toBeCloseTo(75000, 2)
    expect(stu.mercaderia).toBeCloseTo(25000, 2)
    expect(zat.cmv).toBeCloseTo(30000, 2)
    expect(stu.cmv).toBeCloseTo(10000, 2)
    expect(zat.descuentos).toBeCloseTo(6000, 2)
    expect(stu.descuentos).toBeCloseTo(2000, 2)
    expect(zat.envios).toBeCloseTo(3000, 2)
    expect(stu.envios).toBeCloseTo(1000, 2)
    // Las unidades NO se prorratean: son un hecho de cada renglón.
    expect(zat.unidades).toBe(3)
    expect(stu.unidades).toBe(1)
  })

  it('🔑 la venta mixta partida en dos suma lo mismo que la venta entera: los pesos suman 1', () => {
    const v = venta({ id: 7, account_display: 'Mercado Pago 2', payment_method: 'MercadoPago', discount: 8000, shipping_cost: 4000, total_cost: 40000 })
    const detalles = [
      { sale_id: 7, product_id: 1, quantity: 3, total: 75000 },
      { sale_id: 7, product_id: 2, quantity: 1, total: 25000 },
    ]
    const comisiones = { MercadoPago: 6.5 }

    const porLinea = correr('zattia', [v], detalles, SKUS, comisiones)
    const porCanal = contribucionPorCanal({
      ventas: [v],
      detalles,
      cuentas: CUENTAS,
      comisiones,
      desde: '2026-07-01',
      hasta: '2026-07-31',
    })
    expect(porLinea.lineas).toHaveLength(2)
    for (const campo of ['netas', 'iva', 'cmv', 'comisiones', 'contribucion']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((porLinea.total as any)[campo]).toBeCloseTo((porCanal.canales[0] as any)[campo], 2)
    }
  })

  it('⚠️ la venta mixta cuenta como una venta en CADA línea, pero UNA sola en el total', () => {
    const r = correr(
      'zattia',
      [venta({ id: 7, total_cost: 1000 })],
      [
        { sale_id: 7, product_id: 1, quantity: 3, total: 75000 },
        { sale_id: 7, product_id: 2, quantity: 1, total: 25000 },
      ],
      SKUS,
    )
    expect(soloLinea(r, 'zattia').ventas).toBe(1)
    expect(soloLinea(r, 'stunned').ventas).toBe(1)
    // 🔴 Sumar la columna daría 2 ventas donde hubo 1.
    expect(r.total.ventas).toBe(1)
  })

  it('en BDI no hay SKU que mirar: todo cae en la línea bdi', () => {
    const r = correr(
      'bdi',
      [venta({ id: 7, total_cost: 1000 })],
      [
        { sale_id: 7, product_id: 1, quantity: 3, total: 75000 },
        { sale_id: 7, product_id: 2, quantity: 1, total: 25000 },
      ],
      null,
    )
    expect(r.lineas.map((l: { linea: string }) => l.linea)).toEqual(['bdi'])
    expect(soloLinea(r, 'bdi').unidades).toBe(4)
  })
})

describe('pylPorLinea — lo que se niega a repartir', () => {
  /**
   * 🔴 **Medido contra producción el 18-ago-2026**, que es lo que ningún fixture podía decir: en la
   * ventana de 30 días hay **6 ventas así en BDI y 8 en Zattia**, y no están vacías — cargan CMV
   * **negativo** (devoluciones). La contribución por canal sí las cuenta.
   *
   * ⇒ sin `sinRepartoContribucion`, las dos tablas de la misma pantalla muestran totales distintos
   * y no hay con qué explicar la diferencia. **Éste es el test que las ata.**
   */
  it('🔑 lo que queda sin repartir + el total del P&L = el total por canal', () => {
    // 🔑 La venta sin reparto lleva envío y comisión a propósito: con esos dos renglones en cero el
    // test no discrimina —un mutante que guardara sólo `netas − cmv` sobreviviría—, y la igualdad
    // que se está afirmando es la de la cascada ENTERA.
    const comisiones = { MercadoPago: 10 }
    const ventas = [
      // Una venta normal, con renglones.
      venta({ id: 1, total_cost: 4000 }),
      // Una devolución: sin nada que repartir y con CMV negativo, como las 14 de producción.
      venta({ id: 2, payment_method: 'MercadoPago', total_cost: -1500, shipping_cost: 800 }),
    ]
    const detalles = [
      { sale_id: 1, product_id: 1, quantity: 2, total: 10000 },
      { sale_id: 2, product_id: 1, quantity: 0, total: 0 },
    ]
    const porLinea = correr('bdi', ventas, detalles, null, comisiones)
    const porCanal = contribucionPorCanal({
      ventas,
      detalles,
      cuentas: CUENTAS,
      comisiones,
      desde: '2026-07-01',
      hasta: '2026-07-31',
    })

    expect(porLinea.cobertura.sinReparto).toBe(1)
    // Netas 800 (el envío cobrado, cuenta sin IVA) − CMV −1.500 − comisión 80 − costo de envío 800.
    expect(porLinea.cobertura.sinRepartoContribucion).toBeCloseTo(800 + 1500 - 80 - 800, 2)
    expect(porLinea.total.contribucion + porLinea.cobertura.sinRepartoContribucion).toBeCloseTo(
      porCanal.canales.reduce((t, c) => t + c.contribucion, 0),
      2,
    )
  })

  it('🔴 una venta sin renglones no se manda a la línea más grande: queda afuera y se cuenta', () => {
    const r = correr('bdi', [venta({ id: 1, total_cost: 5000 })], [])
    expect(r.lineas).toHaveLength(0)
    expect(r.cobertura.sinReparto).toBe(1)
    // 🔑 `usadas` lo corrige este módulo: pasó el filtro de cuenta y costo, pero no entró al P&L.
    expect(r.cobertura.usadas).toBe(0)
    expect(r.cobertura.ventas).toBe(1)
  })

  it('🔴 con la mercadería en cero manda la UNIDAD, no un reparto al azar', () => {
    // Una venta con 100% de descuento: los renglones facturan 0 pero el costo es real.
    const r = correr(
      'zattia',
      [venta({ id: 7, total_cost: 10000 })],
      [
        { sale_id: 7, product_id: 1, quantity: 3, total: 0 },
        { sale_id: 7, product_id: 2, quantity: 1, total: 0 },
      ],
      new Map([
        ['1', 'ZAT-001'],
        ['2', 'STU-500'],
      ]),
    )
    expect(soloLinea(r, 'zattia').cmv).toBeCloseTo(7500, 2)
    expect(soloLinea(r, 'stunned').cmv).toBeCloseTo(2500, 2)
    expect(r.cobertura.sinReparto).toBe(0)
  })

  it('sin mercadería y sin unidades no hay a qué línea atribuir nada', () => {
    const r = correr('bdi', [venta({ id: 7, total_cost: 10000 })], [{ sale_id: 7, product_id: 1, quantity: 0, total: 0 }])
    expect(r.lineas).toHaveLength(0)
    expect(r.cobertura.sinReparto).toBe(1)
  })

  it('hereda el filtro de la contribución: sin cuenta clasificada y sin CMV quedan afuera', () => {
    const r = correr(
      'bdi',
      [
        venta({ id: 1, account_display: 'Cuenta Nueva de Alguien', total_cost: 100 }),
        venta({ id: 2, total_cost: null }),
        venta({ id: 3, total_cost: 100 }),
      ],
      [
        { sale_id: 1, product_id: 1, quantity: 1, total: 1000 },
        { sale_id: 2, product_id: 1, quantity: 1, total: 1000 },
        { sale_id: 3, product_id: 1, quantity: 1, total: 1000 },
      ],
    )
    expect(r.cobertura.sinCuenta).toBe(1)
    expect(r.cobertura.sinCosto).toBe(1)
    expect(r.cobertura.cuentasDesconocidas).toEqual(['Cuenta Nueva de Alguien'])
    expect(r.cobertura.usadas).toBe(1)
  })
})

describe('pylPorLinea — las dos divisiones que pueden no existir', () => {
  it('🔴 sin unidades la contribución por unidad es null, no 0', () => {
    const r = correr('bdi', [venta({ id: 7, total_cost: 0 })], [{ sale_id: 7, product_id: 1, quantity: 0, total: 5000 }])
    expect(soloLinea(r, 'bdi').unidades).toBe(0)
    expect(soloLinea(r, 'bdi').contribUnidad).toBe(null)
  })

  it('🔴 con las netas en cero el porcentaje es null: un 0% afirma que no deja nada', () => {
    const r = correr('bdi', [venta({ id: 7, total_cost: 0 })], [{ sale_id: 7, product_id: 1, quantity: 2, total: 0 }])
    expect(soloLinea(r, 'bdi').netas).toBe(0)
    expect(soloLinea(r, 'bdi').pctContribucion).toBe(null)
  })

  it('el porcentaje es sobre las netas, y el margen bruto no descuenta comisiones', () => {
    const r = correr(
      'bdi',
      [venta({ id: 7, payment_method: 'MercadoPago', total_cost: 4000 })],
      [{ sale_id: 7, product_id: 1, quantity: 1, total: 10000 }],
      null,
      { MercadoPago: 10 },
    )
    const l = soloLinea(r, 'bdi')
    expect(l.netas).toBeCloseTo(10000, 2)
    expect(l.margenBruto).toBeCloseTo(6000, 2)
    expect(l.contribucion).toBeCloseTo(5000, 2) // 6.000 − 1.000 de comisión
    expect(l.pctContribucion).toBeCloseTo(0.5, 4)
  })

  it('las líneas salen ordenadas por lo que dejan', () => {
    const r = correr(
      'zattia',
      [venta({ id: 7, total_cost: 0 })],
      [
        { sale_id: 7, product_id: 1, quantity: 1, total: 1000 },
        { sale_id: 7, product_id: 2, quantity: 1, total: 90000 },
      ],
      new Map([
        ['1', 'ZAT-001'],
        ['2', 'STU-500'],
      ]),
    )
    expect(r.lineas.map((l: { linea: string }) => l.linea)).toEqual(['stunned', 'zattia'])
  })
})

describe('baseDeReparto', () => {
  it('la mercadería manda cuando es positiva', () => {
    expect(baseDeReparto({ mercaderia: 100, unidades: 2 })).toBe('mercaderia')
  })

  it('🔴 una mercadería NEGATIVA no reparte: los pesos saldrían de signo cambiado', () => {
    expect(baseDeReparto({ mercaderia: -100, unidades: 2 })).toBe('unidades')
  })

  it('sin mercadería y sin unidades no hay base, y eso NO es cero', () => {
    expect(baseDeReparto({ mercaderia: 0, unidades: 0 })).toBe(null)
  })
})
