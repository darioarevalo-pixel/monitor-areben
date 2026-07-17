import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import { leerFixture } from './legacy-etl'
import { cargarDemandaLegacy, windowDeLegacy } from './legacy-fundas'
import { demandaPorModelo } from '@/lib/fundas/demanda'
import type { CorteDemanda, DatosDemanda, FilaDemanda, ResultadoDemanda } from '@/lib/fundas/tipos'

/**
 * Paridad de la DEMANDA: fmDemandaPorModelo del legacy (index.html) contra el port
 * (lib/fundas/demanda.ts), con los MISMOS datos reales de Supabase.
 *
 * Es la parte que decide qué producir (la demanda estimada por modelo), así que se
 * compara campo por campo en varias combinaciones de cutoff/K/corte. La trampa que
 * cubre: que el port trate "clave inexistente" igual que "stock 0" y marque todo
 * agotado → inflaría el empujón. Si eso pasara, las proporciones ajustadas
 * divergirían del legacy acá.
 *
 * **Reloj congelado**: el legacy usa Date.now() (3233) y el port recibe `today`.
 * Con fake timers los dos miran el mismo instante y el corte de ventana es
 * reproducible. El fixture no está en el repo: `npm run fixture-etl`.
 */
const AHORA = new Date('2026-07-16T12:00:00.000Z')

const fixture = leerFixture('bdi')

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA) })
afterAll(() => { vi.useRealTimers() })

describe('Demanda de Fundas: legacy vs port (fixture BDI)', () => {
  if (!fixture) {
    it.skip("falta tests/fixtures/etl-bdi.json — corré 'npm run fixture-etl'", () => {})
    return
  }

  const datosETL = computarDatos(fixture.entrada, { today: AHORA, colorManualMap: fixture.ctx.colorManualMap })
  const datos: DatosDemanda = {
    allVentas: datosETL.ventas,
    allDetalles: datosETL.detalles,
    invDepoMin: datosETL.invDepoMin,
    prodMeta: datosETL.prodMeta,
    fmKeyPids: datosETL.fmKeyPids,
    today: AHORA,
  }
  const legacy = cargarDemandaLegacy(windowDeLegacy(datos))

  const porModelo = (res: ResultadoDemanda) => {
    const m: Record<string, FilaDemanda> = {}
    res.rows.forEach((r) => { m[r.model] = r })
    return m
  }

  const COMBOS: { nombre: string; cutoff: string; K: number; corte: CorteDemanda }[] = [
    { nombre: 'defaults (2026, corte 30/5)', cutoff: '2026-01-01', K: 2.5, corte: { on: true, dias: 30, modelos: 5 } },
    { nombre: 'sin corte de ventana', cutoff: '2026-01-01', K: 2.5, corte: { on: false, dias: 30, modelos: 5 } },
    { nombre: 'cutoff viejo, K bajo', cutoff: '2025-06-01', K: 1.5, corte: { on: true, dias: 60, modelos: 3 } },
    { nombre: 'K alto, corte agresivo', cutoff: '2025-01-01', K: 5, corte: { on: true, dias: 15, modelos: 1 } },
  ]

  describe.each(COMBOS)('$nombre', ({ cutoff, K, corte }) => {
    // OJO: computar acá afuera correría en la fase de colección, ANTES de que
    // beforeAll congele el reloj — y el legacy usa Date.now(). Se computa adentro
    // de cada `it`, con los fake timers ya activos.
    it('los totales y el peso natural coinciden', () => {
      const port = demandaPorModelo(datos, cutoff, K, corte)
      const leg = legacy(cutoff, K, corte)
      expect(port.totMin).toBeCloseTo(leg.totMin, 9)
      expect(port.totMay).toBeCloseTo(leg.totMay, 9)
      expect(port.wMinDefault).toBeCloseTo(leg.wMinDefault, 12)
      expect(port.cutoff).toBe(leg.cutoff)
    })

    it('las mismas filas de modelo, con las 6 magnitudes iguales', () => {
      const p = porModelo(demandaPorModelo(datos, cutoff, K, corte))
      const l = porModelo(legacy(cutoff, K, corte))
      expect(Object.keys(p).sort()).toEqual(Object.keys(l).sort())
      Object.keys(l).forEach((model) => {
        const a = p[model], b = l[model]
        expect(a, `modelo ${model} falta en el port`).toBeTruthy()
        expect(a.umin, `umin ${model}`).toBeCloseTo(b.umin, 9)
        expect(a.umay, `umay ${model}`).toBeCloseTo(b.umay, 9)
        expect(a.volMin, `volMin ${model}`).toBeCloseTo(b.volMin, 9)
        expect(a.volMay, `volMay ${model}`).toBeCloseTo(b.volMay, 9)
        expect(a.ajMin, `ajMin ${model}`).toBeCloseTo(b.ajMin, 9)
        expect(a.ajMay, `ajMay ${model}`).toBeCloseTo(b.ajMay, 9)
      })
    })
  })

  it('prueba de mutante: mover unidades cambia el resultado (el pipeline lee las cantidades)', () => {
    const corte: CorteDemanda = { on: true, dias: 30, modelos: 5 }
    const base = demandaPorModelo(datos, '2026-01-01', 2.5, corte)
    expect(base.totMin + base.totMay).toBeGreaterThan(0)
    // Sumar 1 a TODA línea: las que caen dentro de la ventana suben el total.
    const detalles = datos.allDetalles.map((d) => ({ ...d, quantity: (d.quantity ?? 1) + 1 }))
    const mut = demandaPorModelo({ ...datos, allDetalles: detalles }, '2026-01-01', 2.5, corte)
    expect(mut.totMin + mut.totMay).not.toBe(base.totMin + base.totMay)
  })
})
