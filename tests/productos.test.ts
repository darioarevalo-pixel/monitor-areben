import { describe, it, expect } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'
import { lifespanDays, lifespanDaysGeneric } from '@/lib/etl/helpers'
import {
  filtrarProductos,
  lifespanDaysByMode,
  mesLabel,
  mesesIngreso,
  proveedores,
  colorStock,
  fechaCorta,
  antiguedad,
} from '@/lib/productos'
import { PAGE_SIZE, paginar, sortList, totalPaginas } from '@/lib/tabla'
import { leerFixture } from './legacy-etl'

const AHORA = new Date('2026-07-17T12:00:00.000Z')

/** Un Producto mínimo para los tests de unidad (solo los campos que se tocan). */
function prod(over: Partial<Producto>): Producto {
  return {
    id: 'x', name: 'X', sku: null, proveedor: null, category: null,
    retailer_price: 0, unit_cost: 0, sinCosto: false, margin: null, markup: null,
    // diasVivo null = "no se sabe la edad", que es como se comportaba antes de que existiera:
    // las ventanas dividen por su largo completo. Los tests que miden la corrección lo pasan.
    ingresoMes: null, ingresoFecha: null, diasVivo: null, firstSale: null, lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0,
    monthlySales: [], stock: 0, lifespan: LIFESPAN_SIN_DATO, lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'madurez', cls: 'badge-info' },
    ...over,
  }
}

describe('filtrarProductos', () => {
  const lista = [
    prod({ id: '1', name: 'Remera Boxy', proveedor: 'ACME', ingresoMes: '2026-05', stock: 3, phase: { label: 'declive', cls: 'badge-warning' } }),
    prod({ id: '2', name: 'Buzo Over', proveedor: 'ZETA', ingresoMes: '2026-06', stock: 0, phase: { label: 'crecimiento', cls: 'badge-success' } }),
    prod({ id: '3', name: 'Remera Oversize', proveedor: 'ACME', ingresoMes: '2026-05', stock: 10, phase: { label: 'madurez', cls: 'badge-info' } }),
  ]
  const base = { busqueda: '', estado: '', proveedor: '', ingresos: new Set<string>(), ocultarSinStock: false }

  it('busca por nombre (case-insensitive)', () => {
    expect(filtrarProductos(lista, { ...base, busqueda: 'remera' }).map((p) => p.id)).toEqual(['1', '3'])
  })
  it('filtra por estado (phase.label)', () => {
    expect(filtrarProductos(lista, { ...base, estado: 'declive' }).map((p) => p.id)).toEqual(['1'])
  })
  it('filtra por proveedor', () => {
    expect(filtrarProductos(lista, { ...base, proveedor: 'ACME' }).map((p) => p.id)).toEqual(['1', '3'])
  })
  it('filtra por meses de ingreso', () => {
    expect(filtrarProductos(lista, { ...base, ingresos: new Set(['2026-06']) }).map((p) => p.id)).toEqual(['2'])
  })
  it('oculta sin stock', () => {
    expect(filtrarProductos(lista, { ...base, ocultarSinStock: true }).map((p) => p.id)).toEqual(['1', '3'])
  })
  it('🔑 "sin stock" incluye el stock NEGATIVO, no sólo el cero', () => {
    // Un stock negativo es un error de inventario, y a una campaña de sale no se le suma ni uno
    // agotado ni uno que da -3. La regla es `!(stock > 0)`; escrita como `stock === 0` dejaría
    // pasar los negativos en silencio, que es justo lo que Liquidación no quiere ver.
    const conNegativo = [...lista, prod({ id: '4', name: 'Campera Rota', stock: -3 })]
    expect(filtrarProductos(conNegativo, { ...base, ocultarSinStock: true }).map((p) => p.id)).toEqual(['1', '3'])
  })
  it('combina filtros (AND)', () => {
    expect(filtrarProductos(lista, { ...base, busqueda: 'remera', proveedor: 'ACME', ocultarSinStock: true }).map((p) => p.id)).toEqual(['1', '3'])
  })
})

describe('lifespanDaysByMode', () => {
  it('30d usa lifespanDays(stock, sales30)', () => {
    const p = prod({ stock: 60, sales30: 30 })
    expect(lifespanDaysByMode(p, '30d')).toBe(lifespanDays(60, 30))
  })
  it('7d y 15d usan lifespanDaysGeneric', () => {
    const p = prod({ stock: 70, sales7: 7, sales15: 15 })
    expect(lifespanDaysByMode(p, '7d')).toBe(lifespanDaysGeneric(70, 7, 7))
    expect(lifespanDaysByMode(p, '15d')).toBe(lifespanDaysGeneric(70, 15, 15))
  })
  it('firstSale reusa el precomputado lifespanFirst; sentinel → null', () => {
    expect(lifespanDaysByMode(prod({ lifespanFirst: 42 }), 'firstSale')).toBe(42)
    expect(lifespanDaysByMode(prod({ lifespanFirst: LIFESPAN_SIN_DATO }), 'firstSale')).toBeNull()
  })
  it('sin ventas en el período → null', () => {
    expect(lifespanDaysByMode(prod({ stock: 10, sales30: 0 }), '30d')).toBeNull()
  })
})

/**
 * El caso que originó el arreglo: fundas con 6 días de vida a las que la tabla les anunciaba
 * meses de stock, porque sus ventas se repartían entre los 30 días de la ventana en vez de entre
 * los 6 que llevaban a la venta.
 *
 * Los números son los reales del 9-ago-2026 (captura de "Por producto", BDI). Si alguien vuelve a
 * dividir por el largo de la ventana, estos cuatro casos se ponen en rojo con el número viejo.
 */
describe('vida útil · un producto nuevo se divide por los días que vivió, no por la ventana', () => {
  const casos = [
    { nombre: 'SHINY CASE', stock: 634, vendidas: 243, esperado: 16, viejo: 78 },
    { nombre: 'STELLAR CASE', stock: 282, vendidas: 193, esperado: 9, viejo: 44 },
    { nombre: 'SAM CASE', stock: 845, vendidas: 151, esperado: 34, viejo: 168 },
    { nombre: 'TIARA CASE', stock: 304, vendidas: 149, esperado: 12, viejo: 61 },
  ]

  it.each(casos)('$nombre: $esperado días, no $viejo', ({ stock, vendidas, esperado, viejo }) => {
    // 6 días de vida y todas las ventas dentro de la semana: sales7 === sales30.
    const p = prod({ stock, sales7: vendidas, sales30: vendidas, diasVivo: 6 })
    expect(lifespanDaysByMode(p, '30d')).toBe(esperado)
    expect(lifespanDaysByMode(p, '30d')).not.toBe(viejo)
    // La ventana elegida deja de importar cuando el producto es más joven que todas: los 7d y los
    // 30d dividen por los mismos 6 días y contestan lo mismo. Antes daban 18 y 78.
    expect(lifespanDaysByMode(p, '7d')).toBe(esperado)
  })

  it('un producto viejo no se mueve: min(30, 240) sigue siendo 30', () => {
    const viejo = prod({ stock: 60, sales30: 30, diasVivo: 240 })
    expect(lifespanDaysByMode(viejo, '30d')).toBe(lifespanDays(60, 30))
    expect(lifespanDaysByMode(viejo, '30d')).toBe(60)
  })

  it('sin edad conocida se comporta como antes del arreglo', () => {
    const p = prod({ stock: 634, sales30: 243, diasVivo: null })
    expect(lifespanDaysByMode(p, '30d')).toBe(lifespanDays(634, 243))
  })

  it('un producto que se dio de alta hoy y ya vendió no divide por cero', () => {
    const p = prod({ stock: 100, sales7: 20, sales30: 20, diasVivo: 0 })
    expect(lifespanDaysByMode(p, '30d')).toBe(5) // 100/20 * 1 día de piso
  })

  it('la edad recorta la ventana, nunca la estira', () => {
    // 45 días de vida contra una ventana de 30: manda la ventana, no la edad.
    const p = prod({ stock: 60, sales30: 30, diasVivo: 45 })
    expect(lifespanDaysByMode(p, '30d')).toBe(60)
  })
})

describe('proveedores / mesesIngreso / mesLabel / colorStock', () => {
  const lista = [
    prod({ proveedor: 'ZETA', ingresoMes: '2026-05' }),
    prod({ proveedor: 'ACME', ingresoMes: '2026-06' }),
    prod({ proveedor: 'ACME', ingresoMes: '2026-06' }),
    prod({ proveedor: null, ingresoMes: null }),
  ]
  it('proveedores: únicos, alfabéticos, sin nulos', () => {
    expect(proveedores(lista)).toEqual(['ACME', 'ZETA'])
  })
  it('mesesIngreso: conteo, más reciente primero', () => {
    expect(mesesIngreso(lista)).toEqual([
      { mes: '2026-06', cantidad: 2 },
      { mes: '2026-05', cantidad: 1 },
    ])
  })
  it('mesLabel', () => {
    expect(mesLabel('2026-07')).toBe('Jul 2026')
  })
  it('fechaCorta: sin ceros a la izquierda y sin correrse por zona horaria', () => {
    expect(fechaCorta('2026-08-03')).toBe('3 Ago 2026')
    expect(fechaCorta('2026-12-25')).toBe('25 Dic 2026')
    // El 1 a la medianoche UTC es el caso que `new Date(iso).getDate()` devuelve como día anterior
    // en Argentina (UTC-3). Se arma partiendo el string justamente para que no pase.
    expect(fechaCorta('2026-01-01')).toBe('1 Ene 2026')
    expect(fechaCorta(null)).toBe('')
  })
  it('antiguedad: la unidad cambia con la escala', () => {
    expect(antiguedad(0)).toBe('hoy')
    expect(antiguedad(1)).toBe('ayer')
    expect(antiguedad(6)).toBe('hace 6 días')
    expect(antiguedad(45)).toBe('hace 45 días')
    expect(antiguedad(46)).toBe('hace 2 meses')
    expect(antiguedad(240)).toBe('hace 8 meses')
    expect(antiguedad(730)).toBe('hace 24 meses')
    expect(antiguedad(1095)).toBe('hace 3 años')
    expect(antiguedad(900)).toBe('hace 2,5 años')
    expect(antiguedad(null)).toBe('')
  })
  it('colorStock: umbrales 5 / 20', () => {
    expect(colorStock(3)).toBe('#e24b4a')
    expect(colorStock(10)).toBe('#ef9f27')
    expect(colorStock(50)).toBe('#1d9e75')
  })
})

describe('lib/tabla', () => {
  it('sortList: strings por localeCompare, números con dir', () => {
    const l = [{ n: 'b', v: 2 }, { n: 'a', v: 10 }, { n: 'c', v: 1 }]
    expect(sortList(l, 'v', -1).map((x) => x.v)).toEqual([10, 2, 1])
    expect(sortList(l, 'n', 1).map((x) => x.n)).toEqual(['a', 'b', 'c'])
  })
  it('paginar / totalPaginas', () => {
    const l = Array.from({ length: 120 }, (_, i) => i)
    expect(totalPaginas(l.length)).toBe(Math.ceil(120 / PAGE_SIZE))
    expect(paginar(l, 1)).toEqual(l.slice(0, PAGE_SIZE))
    expect(paginar(l, 2)).toEqual(l.slice(PAGE_SIZE, PAGE_SIZE * 2))
  })
})

describe('paridad · sobre el ETL real', () => {
  for (const cuenta of ['bdi', 'zattia']) {
    const fixture = leerFixture(cuenta)
    if (!fixture) {
      it.skip(`falta tests/fixtures/etl-${cuenta}.json`, () => {})
      continue
    }
    it(`${cuenta}: orden por columna con lifespan pisado por modo replica renderProductos (index.html:2852)`, () => {
      const datos = computarDatos(fixture.entrada, { today: AHORA, colorManualMap: fixture.ctx.colorManualMap })
      expect(datos.allProductos.length).toBeGreaterThan(0)

      // El default del legacy: estado sin filtro, orden sales30 desc, modo 30d.
      const filtrada = filtrarProductos(datos.allProductos, {
        busqueda: '', estado: '', proveedor: '', ingresos: new Set(), ocultarSinStock: false,
      })
      expect(filtrada.length).toBe(datos.allProductos.length)

      // Ordenar por "Vida útil" en modo 15d: la columna ordena por el lifespan del
      // modo (sentinel 99999 si no hay dato), igual que el legacy.
      const conLifespan = filtrada.map((p) => ({ ...p, lifespan: lifespanDaysByMode(p, '15d') ?? LIFESPAN_SIN_DATO }))
      const ordenada = sortList(conLifespan, 'lifespan', -1)
      for (let i = 1; i < ordenada.length; i++) {
        expect(ordenada[i - 1].lifespan).toBeGreaterThanOrEqual(ordenada[i].lifespan)
      }
      // Y el valor pisado coincide con recomputar el modo directo.
      ordenada.forEach((p) => {
        const esperado = lifespanDaysByMode(datos.allProductos.find((x) => x.id === p.id)!, '15d') ?? LIFESPAN_SIN_DATO
        expect(p.lifespan).toBe(esperado)
      })
    })
  }
})
