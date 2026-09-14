import { describe, it, expect } from 'vitest'
import { agotadosSinDeposito, aReponer, cercaDelLimite, nuncaEnLocal, stockAhora, ventasDelDia } from '@/lib/liquidacion/reposicion'
import type { FilaStock, LineaReposicion } from '@/lib/liquidacion/reposicion'
import type { LiquidacionItem } from '@/lib/liquidacion'

/**
 * Reposición durante la campaña.
 *
 * Lo que protege este archivo es que la lista mande a bajar **lo que de verdad falta**: una prenda de
 * más en la lista es un viaje al depósito para nada, y una de menos es un talle vacío en la mesa el
 * día de más gente. Los dos errores caros: descontar dos veces una venta que la base ya tenía, y
 * pedir reponer algo que no tiene de dónde.
 */

function item(pid: string, nombre: string, estado: LiquidacionItem['estado'] = 'aplicado'): LiquidacionItem {
  return {
    pid,
    estado,
    foto: {
      nombre, sku: null, costo: 1, sinCosto: false, precioNormal: 10, promoPrevia: null, stock: 1,
      ventas7: 0, ventas30: 0, ventas90: 0, vidaUtil: null, ultimaVenta: null, diasSinVender: 0, imagen: null,
    },
    decision: { precioSale: 5, pctDesc: 50, markup: null, margen: null, nota: null, porQuien: null, cuando: null },
    aplicacion: { aplicadoEn: null, variantesEscritas: null, categoriaSaleAgregada: false },
  }
}

const fila = (pid: string, sid: string, tienda: string, q: number, talle = 'M'): FilaStock =>
  ({ product_id: pid, size_id: sid, size_name: talle, store_name: tienda, available_quantity: q })

const venta = (over: Partial<LineaReposicion> = {}): LineaReposicion => ({
  saleId: 's1', pid: 'p1', sid: 'v1', tienda: 'Local', canal: 'Mi Local', fecha: '2026-09-14', unidades: 1, plata: 4990, ...over,
})

describe('stockAhora', () => {
  it('resta de la tienda de la que salió la venta', () => {
    const base = [fila('p1', 'v1', 'Local', 3), fila('p1', 'v1', 'Deposito ', 5)]
    const v = stockAhora(base, new Set(), [venta({ unidades: 2 })]).get('p1_v1')!
    expect(v.local).toBe(1)
    expect(v.deposito).toBe(5)
    expect(v.vendidas).toBe(2)
  })

  it('🔴 una venta que la base YA tiene adentro no se resta dos veces', () => {
    // Es el caso de releer el stock en vivo a mediodía: GN ya descontó lo de la mañana. Restarlo
    // otra vez deja el local en cero y pide bajar del depósito algo que está en la mesa.
    const base = [fila('p1', 'v1', 'Local', 2), fila('p1', 'v1', 'Deposito ', 5)]
    const lineas = [venta({ saleId: 'mañana' }), venta({ saleId: 'tarde' })]
    const v = stockAhora(base, new Set(['mañana']), lineas).get('p1_v1')!
    expect(v.local).toBe(1)
    expect(v.vendidas).toBe(1)
  })

  it('🔑 el depósito de Zattia se llama «Deposito » con espacio, y el de BDI de otra forma: todo lo que no es Local es depósito', () => {
    const base = [fila('p1', 'v1', 'Local', 1), fila('p1', 'v1', 'Deposito ', 2), fila('p1', 'v1', 'Deposito Minorista', 3)]
    expect(stockAhora(base, new Set(), []).get('p1_v1')!.deposito).toBe(5)
  })

  it('una devolución vuelve a la tienda', () => {
    const v = stockAhora([fila('p1', 'v1', 'Local', 0)], new Set(), [venta({ unidades: -1 })]).get('p1_v1')!
    expect(v.local).toBe(1)
  })

  it('las variantes son por talle: vender un M no toca el S', () => {
    const base = [fila('p1', 'v1', 'Local', 1, 'M'), fila('p1', 'v2', 'Local', 1, 'S')]
    const m = stockAhora(base, new Set(), [venta({ sid: 'v1' })])
    expect(m.get('p1_v1')!.local).toBe(0)
    expect(m.get('p1_v2')!.local).toBe(1)
  })

  it('lo que no es de la campaña no entra', () => {
    const m = stockAhora([fila('p9', 'v1', 'Local', 1)], new Set(), [venta({ pid: 'p9' })], new Set(['p1']))
    expect(m.size).toBe(0)
  })
})

describe('aReponer', () => {
  const items = [item('p1', 'TOP ZARA'), item('p2', 'SWEATER MONROE'), item('p3', 'TOP MIST')]

  it('local en el umbral o abajo, con depósito: se repone', () => {
    const vs = stockAhora([fila('p1', 'v1', 'Local', 1), fila('p1', 'v1', 'Deposito ', 4)], new Set(), [])
    expect(aReponer(vs.values(), items, 1)).toHaveLength(1)
  })

  it('🔴 sin depósito ⛔ no se repone: se agota en el local y ahí termina', () => {
    const vs = stockAhora([fila('p1', 'v1', 'Local', 0), fila('p1', 'v1', 'Deposito ', 0), fila('p1', 'v2', 'Local', 3, 'L')], new Set(), [])
    expect(aReponer(vs.values(), items, 1)).toHaveLength(0)
  })

  it('con el local por arriba del umbral no hace falta bajar nada', () => {
    const vs = stockAhora([fila('p1', 'v1', 'Local', 2), fila('p1', 'v1', 'Deposito ', 4)], new Set(), [])
    expect(aReponer(vs.values(), items, 1)).toHaveLength(0)
  })

  it('el sugerido es lo vendido, con piso 2 y sin pasarse de lo que hay en el depósito', () => {
    const base = [
      fila('p1', 'v1', 'Local', 5), fila('p1', 'v1', 'Deposito ', 10),
      fila('p2', 'v1', 'Local', 1), fila('p2', 'v1', 'Deposito ', 10),
      fila('p3', 'v1', 'Local', 3), fila('p3', 'v1', 'Deposito ', 1),
    ]
    const lineas = [venta({ pid: 'p1', unidades: 5 }), venta({ pid: 'p3', unidades: 3 })]
    const r = aReponer(stockAhora(base, new Set(), lineas).values(), items, 1)
    expect(Object.fromEntries(r.map((x) => [x.nombre, x.sugerido]))).toEqual({ 'TOP ZARA': 5, 'SWEATER MONROE': 2, 'TOP MIST': 1 })
  })

  it('🔴 un producto que NUNCA estuvo en el local no se repone: es otra decisión, va en nuncaEnLocal', () => {
    // El caso de la Feria (14-sep): 153 talles, y 138 eran de 48 productos enteros en el depósito.
    const vs = stockAhora([fila('p1', 'v1', 'Local', 0), fila('p1', 'v1', 'Deposito ', 40)], new Set(), [])
    expect(aReponer(vs.values(), items, 1)).toHaveLength(0)
    expect(nuncaEnLocal(vs.values(), items)).toEqual([{ pid: 'p1', nombre: 'TOP ZARA', categoria: 'TOP', deposito: 40 }])
  })

  it('🔑 «está en el local» es por PRODUCTO: el M vacío de un producto exhibido se baja', () => {
    const base = [fila('p1', 'v1', 'Local', 3, 'S'), fila('p1', 'v2', 'Local', 0, 'M'), fila('p1', 'v2', 'Deposito ', 5, 'M')]
    const vs = stockAhora(base, new Set(), [])
    expect(aReponer(vs.values(), items, 1).map((r) => r.talle)).toEqual(['M'])
    expect(nuncaEnLocal(vs.values(), items)).toHaveLength(0)
  })

  it('lo que se vendió hoy cuenta como exhibido aunque la base dijera cero', () => {
    const vs = stockAhora([fila('p1', 'v1', 'Deposito ', 5)], new Set(), [venta({ tienda: 'Local' })])
    expect(aReponer(vs.values(), items, 1)).toHaveLength(1)
  })

  it('va por categoría, y adentro lo que más se vendió primero', () => {
    const base = ['p1', 'p2', 'p3'].flatMap((p) => [fila(p, 'v1', 'Local', 0), fila(p, 'v1', 'Deposito ', 9), fila(p, 'v2', 'Local', 3, 'L')])
    const lineas = [venta({ pid: 'p3', unidades: 4 }), venta({ pid: 'p1', unidades: 1 })]
    const r = aReponer(stockAhora(base, new Set(), lineas).values(), items, 1)
    expect(r.map((x) => x.nombre)).toEqual(['SWEATER MONROE', 'TOP MIST', 'TOP ZARA'])
  })

  it('un descartado no se repone: no es de la feria', () => {
    const vs = stockAhora([fila('p1', 'v1', 'Local', 0), fila('p1', 'v1', 'Deposito ', 4), fila('p1', 'v2', 'Local', 3, 'L')], new Set(), [])
    expect(aReponer(vs.values(), [item('p1', 'TOP ZARA', 'descartado')], 1)).toHaveLength(0)
  })
})

describe('cercaDelLimite', () => {
  const items = [item('p1', 'TOP ZARA'), item('p2', 'SWEATER MONROE'), item('p3', 'TOP MIST')]
  const con = (local: number, dep = 5, pid = 'p1') => [fila(pid, 'v1', 'Local', local), fila(pid, 'v1', 'Deposito ', dep)]

  it('entra lo que está hasta 2 por encima del umbral, con depósito', () => {
    const vs = stockAhora([...con(2), ...con(3, 5, 'p2')], new Set(), [])
    expect(cercaDelLimite(vs.values(), items, 1).map((r) => r.nombre)).toEqual(['TOP ZARA', 'SWEATER MONROE'])
  })

  it('🔴 no pisa a aReponer: lo que ya está en la línea va en la otra lista, nunca en las dos', () => {
    const vs = stockAhora(con(1), new Set(), [])
    expect(cercaDelLimite(vs.values(), items, 1)).toHaveLength(0)
    expect(aReponer(vs.values(), items, 1)).toHaveLength(1)
  })

  it('🔴 lo que está lejos de la línea no entra', () => {
    const vs = stockAhora(con(4), new Set(), [])
    expect(cercaDelLimite(vs.values(), items, 1)).toHaveLength(0)
  })

  it('sin depósito no entra: no hay de dónde bajar', () => {
    const vs = stockAhora(con(2, 0), new Set(), [])
    expect(cercaDelLimite(vs.values(), items, 1)).toHaveLength(0)
  })

  it('el margen se mueve con el umbral', () => {
    const vs = stockAhora(con(4), new Set(), [])
    expect(cercaDelLimite(vs.values(), items, 2)).toHaveLength(1)
  })

  it('🔑 primero lo que a este ritmo se acaba hoy: vendió hoy lo que le queda en el local', () => {
    // p1 vendió 3 y le quedan 3 ⇒ se acaba, AUNQUE es el que MÁS tiene · p2 tiene 2 y no vendió ·
    // p3 vendió 1 y le quedan 2. Si el orden fuera sólo por lo que queda, p1 iría último.
    const base = [...con(6, 5, 'p1'), ...con(2, 5, 'p2'), ...con(3, 5, 'p3')]
    const lineas = [venta({ pid: 'p1', unidades: 3 }), venta({ pid: 'p3', unidades: 1 })]
    const r = cercaDelLimite(stockAhora(base, new Set(), lineas).values(), items, 1)
    expect(r.map((x) => [x.nombre, x.alRitmo])).toEqual([['TOP ZARA', true], ['TOP MIST', false], ['SWEATER MONROE', false]])
  })
})

describe('agotadosSinDeposito', () => {
  it('lo que se vendió y quedó en cero en las dos tiendas', () => {
    const items = [item('p1', 'TOP ZARA'), item('p2', 'TOP MIST')]
    const base = [fila('p1', 'v1', 'Local', 1), fila('p2', 'v1', 'Local', 0)]
    const r = agotadosSinDeposito(stockAhora(base, new Set(), [venta({ pid: 'p1' })]).values(), items)
    // p2 ya estaba en cero y no vendió: no se agotó hoy, no es novedad.
    expect(r.map((x) => x.nombre)).toEqual(['TOP ZARA'])
  })
})

describe('ventasDelDia', () => {
  it('🔑 cuenta local y online, ⛔ no mayorista ni técnicas, y sólo del día', () => {
    const lineas = [
      venta({ unidades: 2, plata: 9980 }),
      venta({ pid: 'p2', canal: 'Tienda Nube', plata: 4990 }),
      venta({ pid: 'p3', canal: 'Mayorista', plata: 3000 }),
      venta({ pid: 'p4', canal: 'Ninguno', plata: 0 }),
      venta({ pid: 'p5', fecha: '2026-09-13' }),
    ]
    expect(ventasDelDia(lineas, '2026-09-14')).toEqual({ unidades: 3, plata: 14970, productos: 2 })
  })
})
