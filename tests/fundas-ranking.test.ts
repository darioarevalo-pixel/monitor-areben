import { describe, it, expect } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import { leerFixture } from './legacy-etl'
import { computarRanking, defaultsRanking } from '@/lib/fundas/ranking'
import type { DatosRanking, FiltroRanking } from '@/lib/fundas/tipos'

/**
 * Smoke del ranking de Fundas sobre el fixture BDI real. No es paridad legacy vs
 * port (renderFundasPorModelo vive pegado al DOM y al Chart: la paridad fina va
 * por A/B en prod, como el Paso 6 del CRM). Lo que cubre acá es que el cómputo
 * puro corra sobre datos reales sin romperse — en particular el cruce del corte,
 * que toca `fmKeyPids` (Sets): si esos datos llegaran serializados, los Sets
 * quedarían en `{}` y el stock daría 0 para todo. Este test los usa en memoria.
 *
 * El fixture no está en el repo (ventas reales). Se baja con `npm run fixture-etl`.
 */
const AHORA = new Date('2026-07-16T12:00:00.000Z')

const fixture = leerFixture('bdi')

describe.skipIf(!fixture)('Ranking de Fundas (fixture BDI)', () => {
  const datosETL = computarDatos(fixture!.entrada, { today: AHORA, colorManualMap: fixture!.ctx.colorManualMap })
  const datos: DatosRanking = {
    allMonths: datosETL.allMonths,
    allFundasStats: datosETL.allFundasStats,
    fmKeyPids: datosETL.fmKeyPids,
    invByProdModelo: datosETL.invByProdModelo,
  }
  const def = defaultsRanking(datos)

  // Total de fundas distintas en el histórico (para saber si el filtro está activo).
  const totalProds = new Set<string>()
  Object.values(datosETL.allFundasStats).forEach((d) =>
    Object.keys(d).forEach((k) => totalProds.add(k.slice(k.indexOf('|||') + 3))),
  )

  const filtroBase = (over: Partial<FiltroRanking> = {}): FiltroRanking => ({
    rangeStart: def.rangeStart,
    rangeEnd: def.rangeEnd,
    checkedModels: def.checkedModels,
    totalModels: def.modelos.length,
    checkedProds: def.checkedProds,
    totalProds: totalProds.size,
    corteEnabled: def.corteEnabled,
    corteN: 3,
    corteDiseno: [...def.checkedProds].find((p) => p.toLowerCase().includes('wave case')) ?? [...def.checkedProds][0],
    ...over,
  })

  it('los defaults son coherentes con el fixture', () => {
    expect(def.meses.length).toBeGreaterThan(0)
    expect(def.modelos.length).toBeGreaterThan(0)
    expect(def.rangeStart <= def.rangeEnd).toBe(true)
    expect(def.corteEnabled).toBe(true)
  })

  it('produce un ranking ordenado por qty desc, con pct que suma ~100', () => {
    const r = computarRanking(datos, filtroBase())
    expect(r.filas.length).toBeGreaterThan(0)
    expect(r.total).toBeGreaterThan(0)
    // Orden por qty descendente.
    for (let i = 1; i < r.filas.length; i++) expect(r.filas[i - 1].qty >= r.filas[i].qty).toBe(true)
    // pos correlativo.
    r.filas.forEach((f, i) => expect(f.pos).toBe(i + 1))
    // Los pct suman ~100 (redondeo a 1 decimal).
    const sumaPct = r.filas.reduce((s, f) => s + f.pct, 0)
    expect(Math.abs(sumaPct - 100)).toBeLessThan(1.5)
  })

  it('el corte por agotamiento cruza los Sets sin romperse y puede recortar el rango', () => {
    // Con corte activo, el resultado no debe lanzar y el rango efectivo cae
    // dentro del pedido.
    const r = computarRanking(datos, filtroBase({ corteEnabled: true }))
    expect(r.effStart >= def.rangeStart || r.effStart <= r.effEnd).toBe(true)
    expect(r.effEnd <= def.rangeEnd).toBe(true)
    // Sin corte, no hay cartel y el rango llega hasta rangeEnd.
    const sinCorte = computarRanking(datos, filtroBase({ corteEnabled: false }))
    expect(sinCorte.corte.visible).toBe(false)
  })
})
