import { describe, it, expect } from 'vitest'
import {
  compararConMesPrevio,
  diaDe,
  mesAnterior,
  mesDe,
  metricasPorMes,
  primeraCompraPorCliente,
  recortarAlDia,
  variacion,
  ventasMayoristas,
} from '@/lib/crm/metricas'
import type { FilaVenta } from '@/lib/crm/tipos'

/**
 * Lo que se prueba acá son las tres decisiones de negocio del tablero mayorista,
 * que son justo las que un refactor bienintencionado rompe sin que nadie lo note:
 *
 *  1. Mayorista es el canal 10 y nada más (el ★ del CRM no entra).
 *  2. El estado de la venta NO filtra.
 *  3. "Cliente nuevo" se decide con la primera compra global, nunca con el recorte
 *     que se está mirando — si no, todos serían nuevos siempre.
 */

let sid = 0
function venta(date_sale: string | null, total: number, client_id: number | null, channel_id: number | null = 10, sale_state = 'Entregado'): FilaVenta {
  return { id: ++sid, date_sale, total_price: total, client_id, channel_id, sale_state }
}

describe('qué cuenta como venta mayorista', () => {
  it('deja solo el canal 10', () => {
    const v = [venta('2026-07-01', 100, 1, 10), venta('2026-07-02', 200, 2, 4), venta('2026-07-03', 300, 3, null)]
    expect(ventasMayoristas(v).map((x) => x.total_price)).toEqual([100])
  })

  it('acepta el canal como número o como texto', () => {
    const v = [venta('2026-07-01', 100, 1, 10), venta('2026-07-02', 200, 2, '10' as unknown as number)]
    expect(ventasMayoristas(v)).toHaveLength(2)
  })

  it('descarta las ventas sin fecha usable', () => {
    const v = [venta(null, 100, 1), venta('', 100, 1), venta('2026-07-01', 100, 1)]
    expect(ventasMayoristas(v)).toHaveLength(1)
  })

  it('NO filtra por estado: una Compra Pendiente cuenta igual', () => {
    const v = [venta('2026-07-01', 100, 1, 10, 'Compra Pendiente'), venta('2026-07-02', 100, 2, 10, 'Entregado')]
    expect(ventasMayoristas(v)).toHaveLength(2)
  })
})

describe('primera compra por cliente', () => {
  it('se queda con la fecha más vieja de cada uno', () => {
    const v = [venta('2026-07-01', 10, 1), venta('2025-03-04', 10, 1), venta('2026-01-01', 10, 2)]
    expect(primeraCompraPorCliente(v)).toEqual({ 1: '2025-03-04', 2: '2026-01-01' })
  })

  it('ignora las ventas sin cliente', () => {
    expect(primeraCompraPorCliente([venta('2026-07-01', 10, null)])).toEqual({})
  })
})

describe('métricas por mes', () => {
  const ventas = [
    // Junio: el cliente 1 estrena, el 2 estrena, el 1 repite en el mismo mes.
    venta('2026-06-05', 1000, 1),
    venta('2026-06-20', 500, 1),
    venta('2026-06-21', 2000, 2),
    // Julio: el 1 ya no es nuevo, el 3 sí.
    venta('2026-07-02', 3000, 1),
    venta('2026-07-10', 1000, 3),
  ]
  const primeras = primeraCompraPorCliente(ventas)
  const filas = metricasPorMes(ventas, primeras)

  it('devuelve el mes más reciente primero', () => {
    expect(filas.map((f) => f.mes)).toEqual(['2026-07', '2026-06'])
  })

  it('cuenta ventas y facturación', () => {
    const jun = filas.find((f) => f.mes === '2026-06') as (typeof filas)[number]
    expect(jun.ventas).toBe(3)
    expect(jun.facturacion).toBe(3500)
    expect(Math.round(jun.ticket)).toBe(1167)
  })

  it('un cliente que compra dos veces en el mes es UN cliente', () => {
    const jun = filas.find((f) => f.mes === '2026-06') as (typeof filas)[number]
    expect(jun.clientes).toBe(2)
    expect(jun.nuevos).toBe(2)
    expect(jun.repiten).toBe(0)
  })

  it('el que estrenó en junio ya no es nuevo en julio', () => {
    const jul = filas.find((f) => f.mes === '2026-07') as (typeof filas)[number]
    expect(jul.nuevos).toBe(1) // el 3
    expect(jul.repiten).toBe(1) // el 1
    expect(jul.clientes).toBe(2)
  })

  it('nuevos + repiten siempre da el total de clientes del mes', () => {
    for (const f of filas) expect(f.nuevos + f.repiten).toBe(f.clientes)
  })

  it('las ventas sin cliente suman plata pero no cuentan como cliente', () => {
    const f = metricasPorMes([venta('2026-07-01', 800, null)], {})[0]
    expect(f.facturacion).toBe(800)
    expect(f.ventas).toBe(1)
    expect(f.clientes).toBe(0)
  })

  it('lee el total aunque PostgREST lo mande como string', () => {
    const f = metricasPorMes([venta('2026-07-01', '1500.50' as unknown as number, 1)], {})[0]
    expect(f.facturacion).toBeCloseTo(1500.5)
  })

  it('un mes sin ventas no genera fila', () => {
    expect(metricasPorMes([], {})).toEqual([])
  })
})

describe('recorte a la misma altura de mes', () => {
  const ventas = [venta('2026-07-05', 100, 1), venta('2026-07-29', 100, 1), venta('2026-06-05', 100, 2), venta('2026-06-30', 100, 2)]

  it('deja fuera lo posterior al día de corte, en todos los meses', () => {
    expect(recortarAlDia(ventas, 10).map((v) => v.date_sale)).toEqual(['2026-07-05', '2026-06-05'])
  })

  it('NO cambia quién es cliente nuevo: la primera compra se calcula aparte', () => {
    // El cliente 5 estrena el 25 de junio y vuelve el 3 de julio. Recortado al día
    // 10, su estreno desaparece del conteo. Si "nuevo" se decidiera sobre el recorte,
    // su venta de julio pasaría a ser su primera y aparecería como estreno de julio:
    // el mes en curso inventaría clientes nuevos todos los días.
    const soloEl5 = [venta('2026-06-25', 100, 5), venta('2026-07-03', 100, 5)]
    const primeras = primeraCompraPorCliente(soloEl5)
    const filas = metricasPorMes(recortarAlDia(soloEl5, 10), primeras)
    const jul = filas.find((f) => f.mes === '2026-07') as (typeof filas)[number]
    expect(jul.nuevos).toBe(0)
    expect(jul.repiten).toBe(1)
  })
})

describe('comparación contra el mes previo', () => {
  const ventas = [
    venta('2026-07-05', 1000, 1),
    venta('2026-07-28', 1000, 2),
    venta('2026-06-05', 500, 3),
    venta('2026-06-29', 9999, 4), // después del día 20: no debe entrar en la comparación
  ]

  it('mes en curso: recorta el previo a la misma altura', () => {
    const c = compararConMesPrevio(ventas, new Date(2026, 6, 20)) // 20-jul-2026
    expect(c.parcial).toBe(true)
    expect(c.dia).toBe(20)
    expect(c.actual?.ventas).toBe(1) // solo la del 5 de julio
    expect(c.previo?.ventas).toBe(1) // solo la del 5 de junio
    expect(c.previo?.facturacion).toBe(500) // la del 29 quedó afuera
  })

  it('mes cerrado: compara los meses enteros', () => {
    const c = compararConMesPrevio(ventas, new Date(2026, 6, 31)) // 31-jul, último día
    expect(c.parcial).toBe(false)
    expect(c.actual?.ventas).toBe(2)
    expect(c.previo?.facturacion).toBe(10499)
  })

  it('sin ventas en el mes previo lo devuelve en null, no en cero', () => {
    const c = compararConMesPrevio([venta('2026-07-05', 100, 1)], new Date(2026, 6, 20))
    expect(c.actual?.ventas).toBe(1)
    expect(c.previo).toBeNull()
  })

  it('cruza bien el año', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(mesAnterior('2026-07')).toBe('2026-06')
  })
})

describe('helpers', () => {
  it('mesDe y diaDe leen la fecha con o sin hora', () => {
    expect(mesDe('2026-07-29T14:03:00')).toBe('2026-07')
    expect(diaDe('2026-07-29T14:03:00')).toBe(29)
    expect(mesDe('cualquier cosa')).toBeNull()
    expect(diaDe(null)).toBeNull()
  })

  it('variación: null cuando la base es cero, no Infinity', () => {
    expect(variacion(150, 100)).toBeCloseTo(50)
    expect(variacion(50, 100)).toBeCloseTo(-50)
    expect(variacion(100, 0)).toBeNull()
  })
})
