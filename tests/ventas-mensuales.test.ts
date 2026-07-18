import { describe, it, expect } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import {
  canalesOrdenados,
  categoriasOrdenadas,
  datosChart,
  filasCanal,
  filasCategoria,
  filtrarPeriodo,
  monthLabel,
} from '@/lib/ventas-mensuales'
import { leerFixture } from './legacy-etl'
import type { EstadisticaMensual } from '@/lib/etl/tipos'

const AHORA = new Date('2026-07-17T12:00:00.000Z')

describe('monthLabel', () => {
  it('YYYY-MM → Mmm YY', () => {
    expect(monthLabel('2026-07')).toBe('Jul 26')
    expect(monthLabel('2025-01')).toBe('Ene 25')
    expect(monthLabel('2024-12')).toBe('Dic 24')
  })
})

describe('filtrarPeriodo', () => {
  const stats = [
    { mes: '2026-01' },
    { mes: '2026-02' },
    { mes: '2026-03' },
    { mes: '2026-04' },
  ] as EstadisticaMensual[]

  it('reverse (más reciente primero) y toma los primeros N', () => {
    expect(filtrarPeriodo(stats, 2).map((s) => s.mes)).toEqual(['2026-04', '2026-03'])
  })
  it('periodo 0 = todos, igual reversados', () => {
    expect(filtrarPeriodo(stats, 0).map((s) => s.mes)).toEqual(['2026-04', '2026-03', '2026-02', '2026-01'])
  })
  it('no muta el arreglo original', () => {
    const copia = [...stats]
    filtrarPeriodo(stats, 2)
    expect(stats).toEqual(copia)
  })
})

describe('categorías/canales ordenados por total desc', () => {
  const filtered = [
    { byCategory: { A: 3, B: 10 }, byChannel: { web: 5 } },
    { byCategory: { A: 4, C: 1 }, byChannel: { web: 2, local: 20 } },
  ] as unknown as EstadisticaMensual[]

  it('categorías: B(10) > A(7) > C(1)', () => {
    expect(categoriasOrdenadas(filtered)).toEqual(['B', 'A', 'C'])
  })
  it('canales: local(20) > web(7)', () => {
    expect(canalesOrdenados(filtered)).toEqual(['local', 'web'])
  })
})

describe('filasCategoria', () => {
  const filtered = [
    { mes: '2026-07', items: 100, ventasCount: 40, byCategory: { A: 60, B: 0 } },
  ] as unknown as EstadisticaMensual[]

  it('promedio con 1 decimal; 0/ausente en categoría → null (se pinta —)', () => {
    const [f] = filasCategoria(filtered, ['A', 'B', 'C'])
    expect(f.prom).toBe('2.5') // 100/40
    expect(f.cats).toEqual([60, null, null]) // B=0 y C ausente → null
  })
  it('sin ventas → prom "—"', () => {
    const [f] = filasCategoria([{ mes: '2026-07', items: 0, ventasCount: 0, byCategory: {} }] as unknown as EstadisticaMensual[], [])
    expect(f.prom).toBe('—')
  })
})

describe('filasCanal', () => {
  const filtered = [
    { mes: '2026-07', ventasCount: 40, byChannel: { web: 10, local: 0 } },
  ] as unknown as EstadisticaMensual[]

  it('cuenta + porcentaje redondeado sobre ventasCount', () => {
    const [f] = filasCanal(filtered, ['web', 'local'])
    expect(f.canales).toEqual([{ cnt: 10, pct: 25 }, { cnt: 0, pct: 0 }])
  })
  it('sin ventas → pct 0', () => {
    const [f] = filasCanal([{ mes: '2026-07', ventasCount: 0, byChannel: {} }] as unknown as EstadisticaMensual[], ['web'])
    expect(f.canales).toEqual([{ cnt: 0, pct: 0 }])
  })
})

describe('datosChart · orden cronológico', () => {
  it('deshace el reverse del filtro (más viejo primero para el eje X)', () => {
    const filtered = [{ mes: '2026-04', items: 4 }, { mes: '2026-03', items: 3 }] as EstadisticaMensual[]
    expect(datosChart(filtered)).toEqual([
      { label: 'Mar 26', items: 3 },
      { label: 'Abr 26', items: 4 },
    ])
  })
})

describe('paridad · sobre el ETL real', () => {
  for (const cuenta of ['bdi', 'zattia']) {
    const fixture = leerFixture(cuenta)
    if (!fixture) {
      it.skip(`falta tests/fixtures/etl-${cuenta}.json`, () => {})
      continue
    }
    it(`${cuenta}: las filas replican las expresiones inline del legacy (index.html:3039-3069)`, () => {
      const datos = computarDatos(fixture.entrada, { today: AHORA, colorManualMap: fixture.ctx.colorManualMap })
      const filtered = filtrarPeriodo(datos.allMonthlyStats, 12)
      expect(filtered.length).toBeGreaterThan(0)

      const cats = categoriasOrdenadas(filtered)
      const filas = filasCategoria(filtered, cats)
      filas.forEach((f, i) => {
        const s = filtered[i]
        expect(f.items).toBe(s.items)
        expect(f.prom).toBe(s.ventasCount > 0 ? (s.items / s.ventasCount).toFixed(1) : '—')
        cats.forEach((c, j) => {
          expect(f.cats[j]).toBe(s.byCategory[c] ? s.byCategory[c] : null)
        })
      })

      const channels = canalesOrdenados(filtered)
      const filasCh = filasCanal(filtered, channels)
      filasCh.forEach((f, i) => {
        const s = filtered[i]
        expect(f.ventas).toBe(s.ventasCount)
        channels.forEach((c, j) => {
          const cnt = (s.byChannel || {})[c] || 0
          expect(f.canales[j].cnt).toBe(cnt)
          expect(f.canales[j].pct).toBe(s.ventasCount > 0 ? Math.round((cnt / s.ventasCount) * 100) : 0)
        })
      })
    })
  }
})
