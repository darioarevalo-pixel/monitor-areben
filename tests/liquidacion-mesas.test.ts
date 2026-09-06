import { describe, expect, it } from 'vitest'
import {
  armarItemDesdeProducto,
  confirmarItem,
  decidirItem,
  leerEscalera,
  porEscalera,
  revisionDe,
} from '@/lib/liquidacion'
import type { LiquidacionItem } from '@/lib/liquidacion'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'

/**
 * Los precios de mesa de una feria.
 *
 * Lo que protegen: **una mesa es una promesa de que ninguna prenda de ahí cuesta más de lo que la
 * mesa cobra**. El escalón se elige por el costo y con `>=`; el que no entra en ninguno queda
 * afuera con nombre, en vez de caer al escalón más alto y rematarse abajo del costo sin que nadie
 * lo haya decidido. Son precios que se le escriben a Gestión Nube y rigen en el local.
 */

function prod(over: Partial<Producto> = {}): Producto {
  return {
    id: 'p1',
    name: 'SWEATER STANFORD',
    sku: 'STA-1',
    proveedor: null,
    category: null,
    retailer_price: 35490,
    unit_cost: 13007,
    sinCosto: false,
    margin: null,
    markup: null,
    ingresoMes: null, ingresoFecha: null, diasVivo: null,
    firstSale: null,
    lastSale: '2026-08-01',
    daysSinceLast: 30,
    sales7: 0, sales15: 0, sales30: 0, sales60: 1, sales90: 2,
    totalSales: 12,
    monthlySales: [],
    stock: 48,
    lifespan: 90,
    lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'dormido', cls: '' },
    ...over,
  }
}

const MESAS = [5900, 9900, 14900, 19900, 24900, 29900]
const item = (over: Partial<Producto> = {}) => armarItemDesdeProducto(prod(over))

describe('porEscalera — a qué mesa va cada prenda', () => {
  it('va al PRIMER escalón que le cubre el costo', () => {
    const { cambiados } = porEscalera([item({ unit_cost: 13007 })], MESAS, 'Bruno')
    expect(cambiados[0].decision.precioSale).toBe(14900)
  })

  it('🔴 un costo IGUAL al escalón entra en ese escalón, no en el siguiente', () => {
    // Con `>` en vez de `>=` la prenda sube una mesa entera: $9.900 de costo terminaría a $14.900.
    // Nadie lo vería en la pantalla — es un precio plausible — y la mesa se llenaría con menos.
    const { cambiados } = porEscalera([item({ unit_cost: 9900 })], MESAS, null)
    expect(cambiados[0].decision.precioSale).toBe(9900)
  })

  it('🔑 el precio de mesa se guarda tal cual: NO pasa por el redondeo a 90', () => {
    // El redondeo a 90 es de los precios calculados con un %. Un precio de cartel es un número
    // elegido: $14.900 que se guarda como $14.890 deja la caja y el cartel diciendo cosas distintas.
    const { cambiados } = porEscalera([item({ unit_cost: 13007 })], MESAS, null)
    expect(cambiados[0].decision.precioSale).toBe(14900)
  })

  it('🔴 la que no entra en NINGÚN escalón queda afuera, con nombre y costo', () => {
    // Mandarla al escalón más alto la remata abajo del costo sin decisión de nadie.
    const caro = item({ id: 'p2', name: 'CAMPERA SAVAGE', unit_cost: 43626 })
    const { cambiados, afuera } = porEscalera([caro], MESAS, null)
    expect(cambiados).toEqual([])
    expect(afuera).toEqual([{ pid: 'p2', nombre: 'CAMPERA SAVAGE', costo: 43626, motivo: 'mas-caro' }])
  })

  it('🔴 sin costo no hay mesa posible: queda afuera y se nombra', () => {
    // Con costo cero cualquier precio parece tener 100% de margen y la feria regala mercadería.
    const sin = item({ id: 'p3', name: 'TOP ORSA', unit_cost: 0, sinCosto: true })
    const { cambiados, afuera } = porEscalera([sin], MESAS, null)
    expect(cambiados).toEqual([])
    expect(afuera[0].motivo).toBe('sin-costo')
  })

  it('no toca los descartados: se los miró y no van', () => {
    const descartado = { ...item({ id: 'p4' }), estado: 'descartado' as const }
    const r = porEscalera([descartado], MESAS, null)
    expect(r.cambiados).toEqual([])
    expect(r.yaEstaban).toEqual([])
    expect(r.afuera).toEqual([])
  })

  it('la escalera se ordena y se deduplica sola: el orden en que se tipeó no cambia el precio', () => {
    const { cambiados } = porEscalera([item({ unit_cost: 13007 })], [29900, 14900, 5900, 14900], null)
    expect(cambiados[0].decision.precioSale).toBe(14900)
  })

  it('🔑 el que ya tenía ese precio NO vuelve a la cola de revisión', () => {
    // Correr la escalera dos veces es normal mientras se arma la feria. Si cada pasada
    // desconfirmara lo ya revisado, revisar 381 productos no terminaría nunca.
    const yaConfirmado = confirmarItem(decidirItem(item(), { precioSale: 14900 }, 'Bruno'), 'Darío')
    const { cambiados, yaEstaban } = porEscalera([yaConfirmado], MESAS, 'Bruno')
    expect(cambiados).toEqual([])
    expect(yaEstaban[0].estado).toBe('confirmado')
    expect(revisionDe(yaEstaban[0]).porQuien).toBe('Darío')
  })

  it('el que cambia de precio sí vuelve a «definido», con quién lo puso', () => {
    const confirmado = confirmarItem(decidirItem(item(), { precioSale: 19900 }, 'Bruno'), 'Darío')
    const { cambiados } = porEscalera([confirmado], MESAS, 'Bruno')
    expect(cambiados[0].estado).toBe('definido')
    expect(cambiados[0].decision.precioSale).toBe(14900)
    expect(revisionDe(cambiados[0]).porQuien).toBeNull()
    expect(cambiados[0].decision.porQuien).toBe('Bruno')
  })

  it('reparte una feria entera y las tres listas suman lo que entró', () => {
    const lote: LiquidacionItem[] = [
      item({ id: 'a', unit_cost: 4767 }),                       // lencería → 5900
      item({ id: 'b', unit_cost: 7571 }),                       // tops → 9900
      item({ id: 'c', unit_cost: 13007 }),                      // sweater → 14900
      item({ id: 'd', unit_cost: 43626 }),                      // más caro que la escalera
      item({ id: 'e', unit_cost: 0, sinCosto: true }),          // sin costo
    ]
    const { cambiados, yaEstaban, afuera } = porEscalera(lote, MESAS, null)
    expect(cambiados.map((i) => i.decision.precioSale)).toEqual([5900, 9900, 14900])
    expect(yaEstaban).toEqual([])
    expect(afuera.map((a) => a.pid)).toEqual(['d', 'e'])
    expect(cambiados.length + yaEstaban.length + afuera.length).toBe(lote.length)
  })
})

describe('leerEscalera — la escalera tal como se tipea', () => {
  it('acepta pesos, puntos de miles y espacios', () => {
    expect(leerEscalera('$5.900, 9900 , $14.900')).toEqual([5900, 9900, 14900])
  })

  it('ordena y deduplica', () => {
    expect(leerEscalera('14900, 5900, 14900, 9900')).toEqual([5900, 9900, 14900])
  })

  it('🔴 si un escalón no es un número usable, devuelve null en vez de saltearlo', () => {
    // Una escalera a la que se le cayó un escalón en silencio manda prendas a la mesa equivocada.
    expect(leerEscalera('5900, ochomil, 14900')).toBeNull()
    expect(leerEscalera('5900, -900')).toBeNull()
    expect(leerEscalera('5900, 0')).toBeNull()
  })

  it('sin nada escrito, null', () => {
    expect(leerEscalera('')).toBeNull()
    expect(leerEscalera('  , ; ')).toBeNull()
  })
})
