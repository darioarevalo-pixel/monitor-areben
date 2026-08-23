/**
 * `detectarDeMarca` — la costura entre "los datos de una marca" y "los accionables de esa marca".
 *
 * Lo que este archivo defiende es **de qué línea habla Gerencial**. Es una pregunta que el código no
 * se hacía hasta el 22-ago-2026: `computarFilas` excluía los SKU de Stunned adentro, siempre, y por
 * eso nadie tuvo que elegir. Al volverse un parámetro, elegir mal es un cambio silencioso —los
 * avisos siguen saliendo, con los productos de otro negocio— y ningún test lo veía.
 */

import { describe, it, expect } from 'vitest'
import { detectarDeMarca, type DatosMarca } from '@/lib/gerencial/agregar'
import { UMBRALES } from '@/lib/gerencial/umbrales'
import { indexarTn } from '@/lib/tn'
import { LIFESPAN_SIN_DATO, type DatosETL, type Producto } from '@/lib/etl/tipos'

function prod(over: Partial<Producto> & { id: string }): Producto {
  return {
    name: 'X', sku: null, proveedor: null, category: null, retailer_price: 0, unit_cost: 0, sinCosto: false,
    margin: null, markup: null, ingresoMes: null, ingresoFecha: null, diasVivo: null, firstSale: null, lastSale: null, daysSinceLast: 0,
    sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0, totalSales: 0, monthlySales: [],
    stock: 0, lifespan: LIFESPAN_SIN_DATO, lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'madurez', cls: 'badge-info' }, ...over,
  }
}

// Markup 20% con objetivo 130 ⇒ desfase −110: bien abajo del umbral de subprecio (−15 pts).
const barato = (id: string, name: string, sku: string | null) =>
  prod({ id, name, sku, stock: 5, unit_cost: 100, retailer_price: 120 })

function datos(productos: Producto[]): DatosMarca {
  const etl = { allProductos: productos, allVariantes: [], allVariantesHuerfanas: [], allMonths: [], allMonthlyStats: [], ventas: [], detalles: [] } as unknown as DatosETL
  return { marca: 'zattia', etl, fotos: [], internas: [], ingresos: [], tnPromo: indexarTn([]), errores: [] }
}

const precios = (as: ReturnType<typeof detectarDeMarca>) => as.filter((a) => a.id.startsWith('comercial:precio-'))

describe('🔴 de qué línea habla Gerencial', () => {
  it('en Zattia avisa de los productos de ZATTIA, no de los de Stunned', () => {
    const as = precios(detectarDeMarca(datos([
      barato('1', 'Corset Zattia', 'ZAT-1'),
      barato('2', 'Buzo Stunned', 'STU-1'),
    ]), UMBRALES, new Date('2026-08-22T12:00:00Z')))
    expect(as).toHaveLength(1)
    expect(as[0].valor).toBe(1)
    expect(as[0].detalle).toContain('Corset Zattia')
    // Éste es el mutante: pasar `'stunned'` en vez de `d.marca` deja el aviso con la misma pinta,
    // el mismo id y un número plausible — hablando del otro negocio.
    expect(as[0].detalle).not.toContain('Buzo Stunned')
  })

  it('sin nada de Zattia desfasado no hay aviso, aunque Stunned lo esté', () => {
    // El caso que hace la diferencia entre "elige la marca" y "elige cualquier línea": acá un
    // parámetro equivocado no cambia un número, INVENTA un aviso donde no había ninguno.
    const as = precios(detectarDeMarca(datos([barato('2', 'Buzo Stunned', 'STU-1')]), UMBRALES, new Date('2026-08-22T12:00:00Z')))
    expect(as).toHaveLength(0)
  })
})
