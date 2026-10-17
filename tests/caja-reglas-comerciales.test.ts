import { describe, expect, it } from 'vitest'
import { REGLAS_INICIALES, armarVentaGN, baseParaMonto, cobro, cobraConReglas, pagosDeMedio, pctDeMedio, renglones, type Reglas } from '@/lib/caja/core.core.js'

// Parte 3 de `reglas-comerciales.md` (17-oct): con la llave prendida, la Caja saca el % de cada pago de las REGLAS
// comerciales (`reglas.comerciales`, lo pone `reglasDeHoy`); la cuenta de GN y el reparto son los de siempre.
const base = { marca: 'zattia', canal: 'local', campania: null, alcance: 'todo', alcance_ids: [] as string[], banco: null, cuotas: null, monto_minimo: null, desde: null, hasta: null, dias: null, activa: true }
const regla = (id: string, x: Record<string, unknown>) => ({ ...base, id, nombre: id, ...x })
// Lo de hoy de Zattia traducido (`reglasDeCaja`) + la promo Payway de la Agenda.
const TEMPORADA = [
  regla('efectivo', { medios: ['efectivo'], efecto: 'descuento', pct: 15 }),
  regla('transf', { medios: ['transferencia'], efecto: 'descuento', pct: 10 }),
  regla('debito', { medios: ['debito'], efecto: 'descuento', pct: 10 }),
  regla('oferta-final', { campania: 'liq1', medios: ['efectivo', 'transferencia'], efecto: 'final', pct: null }),
  regla('oferta-no', { campania: 'liq1', medios: ['debito', 'credito'], efecto: 'no', pct: null }),
  regla('agenda:1', { nombre: 'Payway crédito −10 %', medios: ['credito'], banco: 'Payway', efecto: 'descuento', pct: 10, desde: '2026-09-01T03:00:00.000Z', hasta: '2026-10-31T03:00:00.000Z', dias: [3, 5, 6] }),
]
const JEANS = regla('jeans', { alcance: 'categorias', alcance_ids: ['JEANS'], medios: ['efectivo'], efecto: 'descuento', pct: 20 })
const VIERNES = '2026-10-16T21:58:15Z'

const CORSET = 571449
const zattia = { ...REGLAS_INICIALES, transferenciaA: 13015, feriaCampanias: ['liq1'], feriaIdsCampania: [CORSET], feriaPrecios: { [CORSET]: 17990 } } as unknown as Reglas
const conReglas = (lista: unknown[], fecha = VIERNES): Reglas => ({ ...zattia, comerciales: { marca: 'zattia', lista, campaniasDe: { [CORSET]: ['liq1'] }, fecha } }) as Reglas
const sinRespuestas = { promoCreditoHoy: false, esDelBanco: false, seisCuotas: false }

const cobrar = (reglas: Reglas, items: Parameters<typeof renglones>[0], medio: 'efectivo' | 'transferencia' | 'debito' | 'credito', resp = sinRespuestas) => {
  const filas = renglones(items)
  const pagos = pagosDeMedio(medio, { filas, reglas, total: 0, ...resp })
  return cobro({ filas, pagos, reglas, descuentoVenta: null })
}

describe('Caja · cobra con las reglas comerciales (parte 3)', () => {
  it('apagada (sin `comerciales`) es la Caja de siempre: el % de la cuenta', () => {
    expect(cobraConReglas(zattia)).toBe(false)
    const items = [{ product_id: 1, size_id: 1, cantidad: 1, precio: 30000, categorias: ['JEANS'] }]
    expect(cobrar(zattia, items, 'efectivo').total).toBe(25500)
  })

  it('la venta e1ef6206: con las reglas de hoy, el MISMO cobro que con las cuentas (corset de oferta a precio final + vestido −15 %)', () => {
    const items = [{ product_id: CORSET, size_id: 1, cantidad: 1, precio: 17990 }, { product_id: 1131616, size_id: 1, cantidad: 1, precio: 39490 }]
    const viejo = cobrar(zattia, items, 'efectivo')
    const nuevo = cobrar(conReglas(TEMPORADA), items, 'efectivo')
    expect(nuevo.pagos.map((p) => [p.cuenta, p.porcentaje, p.monto])).toEqual([[25867, 0, 18000], [12921, 15, 33600]])
    expect(nuevo).toEqual(viejo)
  })

  it('«jeans efectivo −20 %» sin crear cuentas en GN: UN pago a la cuenta de efectivo, cada prenda con su %', () => {
    const items = [{ product_id: 1, size_id: 1, cantidad: 1, precio: 30000, categorias: ['JEANS'] }, { product_id: 2, size_id: 1, cantidad: 1, precio: 10000, categorias: ['REMERAS'] }]
    const reglas = conReglas([...TEMPORADA, JEANS])
    const c = cobrar(reglas, items, 'efectivo')
    // 30000 × 0,80 + 10000 × 0,85 = 24000 + 8500
    expect(c.pagos.map((p) => [p.cuenta, p.porcentaje, p.monto])).toEqual([[12921, 18.75, 32500]])
    const gn = armarVentaGN({ filas: renglones(items), pagos: c.pagos, modoLocal: { client_id: 1, channel_id: 1, sale_type_id: 1, sale_state_id: 1, currency_id: 1, store_id: 1 }, integrationId: 'x', fecha: '2026-10-16' })
    expect(gn.payments).toEqual([{ amount: 32500, account_id: 12921, date_payment: '2026-10-16', description: '' }])
    // la transferencia ⛔ tiene regla de jeans: −10 % en las dos
    expect(cobrar(reglas, items, 'transferencia').total).toBe(36000)
  })

  it('la promo bancaria sale de la Agenda: la cuenta de la promo es «tarjeta Payway», sólo los días de la promo', () => {
    const items = [{ product_id: 1, size_id: 1, cantidad: 1, precio: 10000 }]
    const conPromo = { promoCreditoHoy: true, esDelBanco: true, seisCuotas: false }
    const viernes = cobrar(conReglas(TEMPORADA), items, 'credito', conPromo)
    expect(viernes.pagos.map((p) => [p.cuenta, p.monto])).toEqual([[25172, 9000]])
    expect(cobrar(conReglas(TEMPORADA, '2026-10-15T15:00:00Z'), items, 'credito', conPromo).total).toBe(10000) // jueves
    expect(cobrar(conReglas(TEMPORADA), items, 'credito').total).toBe(10000) // crédito común
  })

  it('una regla «no se acepta» en una prenda que ⛔ es oferta frena el cobro, con el porqué', () => {
    const NO = regla('jeans-sin-debito', { nombre: 'Jeans sin débito', alcance: 'categorias', alcance_ids: ['JEANS'], medios: ['debito'], efecto: 'no', pct: null })
    const items = [{ product_id: 1, size_id: 1, cantidad: 1, precio: 30000, categorias: ['JEANS'] }]
    expect(() => cobrar(conReglas([...TEMPORADA, NO]), items, 'debito')).toThrow(/Jeans sin débito — débito no se acepta/)
  })

  it('«varios pagos»: lo que paga en efectivo ⇒ la base, con el % de las reglas (la vuelta de `cobro()`)', () => {
    const items = [{ product_id: 1, size_id: 1, cantidad: 1, precio: 30000, categorias: ['JEANS'] }, { product_id: 2, size_id: 1, cantidad: 1, precio: 10000 }]
    const reglas = conReglas([...TEMPORADA, JEANS])
    const filas = renglones(items)
    const b = baseParaMonto({ filas, reglas, descuentoVenta: null, cuenta: 12921, monto: 16250 })
    expect(b).toBe(20000)
    const c = cobro({ filas, pagos: [{ cuenta: 12921, base: b as number }, { cuenta: 13015 }], reglas, descuentoVenta: null })
    expect(c.pagos.map((p) => p.monto)).toEqual([16300, 18000])
  })

  it('lo que se DICE en la tarjeta de cada forma de pago sale de las reglas prendidas, ⛔ de la cuenta', () => {
    const reglas = conReglas([regla('efectivo', { medios: ['efectivo'], efecto: 'descuento', pct: 20 }), JEANS])
    expect(pctDeMedio('efectivo', reglas, 12921)).toBe(20)
    expect(pctDeMedio('debito', reglas, 20196)).toBe(0)
    expect(pctDeMedio('efectivo', zattia, 12921)).toBe(15)
  })
})
