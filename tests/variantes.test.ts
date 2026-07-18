import { describe, it, expect } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import { formatLifespan, lifespanDays } from '@/lib/etl/helpers'
import type { Variante } from '@/lib/etl/tipos'
import { filtrarVariantes } from '@/lib/variantes'
import { sortList } from '@/lib/tabla'
import { leerFixture } from './legacy-etl'

const AHORA = new Date('2026-07-17T12:00:00.000Z')

function variante(over: Partial<Variante> & { id: string }): Variante {
  return {
    pid: 'p', sid: 's', name: '', size: '', stock: 0, local: 0, deposito: 0, sku: '', barcode: '',
    lastSale: null, daysSinceLast: 0, sales7: 0, sales15: 0, sales30: 0, sales60: 0, sales90: 0,
    totalSales: 0, lifespan: 0, phase: { label: 'madurez', cls: 'badge-info' }, ...over,
  } as Variante
}

describe('filtrarVariantes', () => {
  const lista = [
    variante({ id: '1', name: 'Remera Boxy', size: 'M Negro', phase: { label: 'declive', cls: 'badge-warning' } }),
    variante({ id: '2', name: 'Buzo Over', size: 'L Gris', phase: { label: 'crecimiento', cls: 'badge-success' } }),
    variante({ id: '3', name: 'Pantalón', size: 'M Negro', phase: { label: 'madurez', cls: 'badge-info' } }),
  ]

  it('busca por NOMBRE', () => {
    expect(filtrarVariantes(lista, { busqueda: 'buzo', estado: '' }).map((v) => v.id)).toEqual(['2'])
  })
  it('busca también por VARIANTE (size), a diferencia de productos', () => {
    expect(filtrarVariantes(lista, { busqueda: 'negro', estado: '' }).map((v) => v.id)).toEqual(['1', '3'])
  })
  it('filtra por estado', () => {
    expect(filtrarVariantes(lista, { busqueda: '', estado: 'crecimiento' }).map((v) => v.id)).toEqual(['2'])
  })
  it('combina búsqueda y estado (AND)', () => {
    expect(filtrarVariantes(lista, { busqueda: 'negro', estado: 'madurez' }).map((v) => v.id)).toEqual(['3'])
  })
})

describe('paridad · sobre el ETL real', () => {
  for (const cuenta of ['bdi', 'zattia']) {
    const fixture = leerFixture(cuenta)
    if (!fixture) {
      it.skip(`falta tests/fixtures/etl-${cuenta}.json`, () => {})
      continue
    }
    it(`${cuenta}: la vida útil mostrada y el orden por columna replican renderVariantes (index.html:2967)`, () => {
      const datos = computarDatos(fixture.entrada, { today: AHORA, colorManualMap: fixture.ctx.colorManualMap })
      expect(datos.allVariantes.length).toBeGreaterThan(0)

      // El texto de vida útil replica lifespanStr(stock, sales30) del legacy
      // (index.html:2138): sin dato → "Sin movimiento"/"—"; con dato → buckets.
      const lifespanStrLegacy = (stock: number, s30: number) => {
        const d = lifespanDays(stock, s30)
        if (d === null) return stock > 0 ? 'Sin movimiento' : '—'
        if (d > 365) return '+1 año'
        if (d > 60) return Math.round(d / 30) + ' meses'
        return d + ' días'
      }
      datos.allVariantes.slice(0, 300).forEach((v) => {
        expect(formatLifespan(lifespanDays(v.stock, v.sales30), v.stock)).toBe(lifespanStrLegacy(v.stock, v.sales30))
      })

      // Orden por 'lifespan' usa el campo precomputado v.lifespan (sin modo).
      const ordenada = sortList(datos.allVariantes, 'lifespan', -1)
      for (let i = 1; i < ordenada.length; i++) {
        expect(ordenada[i - 1].lifespan).toBeGreaterThanOrEqual(ordenada[i].lifespan)
      }
    })
  }
})
