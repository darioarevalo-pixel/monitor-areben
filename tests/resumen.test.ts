import { describe, it, expect } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import { computarKpis, estadoSync, fmtFechaVenta, fmtHace } from '@/lib/resumen'
import { leerFixture } from './legacy-etl'
import type { SyncMeta } from '@/lib/etl/tipos'

const AHORA = new Date('2026-07-17T12:00:00.000Z')

describe('KPIs del resumen · sobre el ETL real', () => {
  for (const cuenta of ['bdi', 'zattia']) {
    const fixture = leerFixture(cuenta)
    if (!fixture) {
      it.skip(`falta tests/fixtures/etl-${cuenta}.json`, () => {})
      continue
    }
    it(`${cuenta}: los 5 KPIs coinciden con las fórmulas del legacy (index.html:2646-2650)`, () => {
      const datos = computarDatos(fixture.entrada, { today: AHORA, colorManualMap: fixture.ctx.colorManualMap })
      const kpis = computarKpis(datos)
      // Las mismas expresiones inline del legacy, sobre el mismo allProductos/allVariantes.
      expect(kpis.productos).toBe(datos.allProductos.length)
      expect(kpis.sinVenta30).toBe(datos.allProductos.filter((p) => p.daysSinceLast > 30).length)
      expect(kpis.declive).toBe(datos.allProductos.filter((p) => p.phase.label === 'declive').length)
      expect(kpis.crecimiento).toBe(datos.allProductos.filter((p) => p.phase.label === 'crecimiento').length)
      expect(kpis.variantes).toBe(datos.allVariantes.length)
      // Sanity: hay datos de verdad.
      expect(kpis.productos).toBeGreaterThan(0)
      expect(kpis.variantes).toBeGreaterThan(0)
    })
  }
})

describe('estadoSync · semáforo y notas', () => {
  const base = (over: Partial<NonNullable<SyncMeta>>): SyncMeta => ({ last_run: '2026-07-17T10:00:00.000Z', latest_status: 'completed', latest_conclusion: 'success', ...over })

  it('verde si es reciente (< 28 h)', () => {
    const r = estadoSync(base({}), AHORA) // 2 h
    expect(r).toMatchObject({ tipo: 'ok', dot: '🟢', nota: '' })
  })
  it('amarillo entre 28 y 52 h', () => {
    const r = estadoSync(base({ last_run: '2026-07-16T00:00:00.000Z' }), AHORA) // 36 h
    expect(r).toMatchObject({ tipo: 'ok', dot: '🟡' })
    if (r.tipo === 'ok') expect(r.nota).toContain('más de un día')
  })
  it('rojo si pasaron más de 52 h', () => {
    const r = estadoSync(base({ last_run: '2026-07-14T00:00:00.000Z' }), AHORA) // ~84 h
    expect(r).toMatchObject({ tipo: 'ok', dot: '🔴' })
  })
  it('rojo si la última corrida falló (aunque haya un éxito previo)', () => {
    const r = estadoSync(base({ latest_conclusion: 'failure' }), AHORA)
    expect(r).toMatchObject({ tipo: 'ok', dot: '🔴' })
    if (r.tipo === 'ok') expect(r.nota).toContain('FALLÓ')
  })
  it('nota de "en curso" si el status no es completed', () => {
    const r = estadoSync(base({ latest_status: 'in_progress' }), AHORA)
    if (r.tipo === 'ok') expect(r.nota).toContain('en curso')
  })
  it('sin last_run pero con failure → fallando', () => {
    expect(estadoSync({ last_run: null, latest_status: 'completed', latest_conclusion: 'failure' }, AHORA).tipo).toBe('fallando')
  })
  it('null → sin-lectura', () => {
    expect(estadoSync(null, AHORA).tipo).toBe('sin-lectura')
  })
})

describe('helpers de formato', () => {
  it('fmtHace: min / h / días', () => {
    expect(fmtHace(30 * 60000)).toBe('hace 30 min')
    expect(fmtHace(3 * 3600000)).toBe('hace 3 h')
    expect(fmtHace(25 * 3600000)).toBe('hace 1 día')
    expect(fmtHace(50 * 3600000)).toBe('hace 2 días')
    expect(fmtHace(10000)).toBe('hace 1 min') // mínimo 1
  })
  it('fmtFechaVenta: YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(fmtFechaVenta('2026-07-10')).toBe('10/07/2026')
    expect(fmtFechaVenta(null)).toBeNull()
  })
})
