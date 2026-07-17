import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { vi } from 'vitest'
import { computarDatos } from '@/lib/etl/computar'
import type { DatosETL } from '@/lib/etl/tipos'
import { computarLegacy, normalizar, leerFixture } from './legacy-etl'

/**
 * Paridad del ETL: el computarDatos del legacy (index.html) contra el port a
 * TypeScript (lib/etl/computar.ts), con los MISMOS datos reales de Supabase.
 *
 * Es la prueba que habilita a conectar el port: mientras esto no dé verde, el
 * ETL nuevo no calcula stock, ventas ni agotamiento en prod.
 *
 * El fixture no está en el repo (son ventas reales). Se baja con:
 *   npm run fixture-etl
 *
 * **Reloj congelado a propósito.** El legacy usa `new Date()` para el refDate de
 * agotamiento (index.html:2560) y el global TODAY para el resto; el port usa
 * `today` para todo. Con el reloj real, legacy y port miran instantes distintos
 * y la diferencia parece un bug del port sin serlo. Congelándolo, los dos ven lo
 * mismo y además el test es reproducible.
 */
const AHORA = new Date('2026-07-16T12:00:00.000Z')

/**
 * Los campos de DatosETL que deben coincidir campo-a-campo con el legacy. Se
 * comparan de a uno: un toEqual del objeto entero dice "algo cambió" y nada más.
 *
 * `allVariantes` va aparte (más abajo): el port le agregó `local`/`deposito` para
 * Sesión de fotos, campos que el ETL legacy no computa, así que su comparación
 * excluye esos dos y verifica el split por separado.
 */
const CAMPOS: (keyof DatosETL)[] = [
  'ventas', 'detalles', 'invByProduct', 'invByProdModelo', 'invDepoMin', 'prodMeta',
  'fmKeyPids', 'fmProdCreatedAt', 'allVvar', 'allProductos', 'allMonths',
  'allMonthlyStats', 'allFundasStats', 'allProveedoresData', 'allColoresSales',
  'allAgotamientoData', 'allTallesData', 'allTallesCategories', 'proveedoresList',
  'maxVentaDate', 'syncMeta',
]

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA) })
afterAll(() => { vi.useRealTimers() })

describe.each(['bdi', 'zattia'])('ETL %s: legacy vs port', (cuenta) => {
  const fixture = leerFixture(cuenta)

  if (!fixture) {
    it.skip(`falta tests/fixtures/etl-${cuenta}.json — corré 'npm run fixture-etl'`, () => {})
    return
  }

  const ctx = { today: AHORA, colorManualMap: fixture.ctx.colorManualMap }
  let legacy: DatosETL
  let port: DatosETL

  beforeAll(() => {
    legacy = computarLegacy(fixture.entrada, ctx)
    port = computarDatos(fixture.entrada, ctx)
  })

  it('el fixture tiene datos (si no, la paridad pasaría comparando vacío contra vacío)', () => {
    expect(fixture.entrada.productos.length).toBeGreaterThan(0)
    expect(fixture.entrada.ventas.length).toBeGreaterThan(0)
    expect(fixture.entrada.detalles.length).toBeGreaterThan(0)
  })

  it.each(CAMPOS)('%s', (campo) => {
    expect(normalizar(port[campo])).toEqual(normalizar(legacy[campo]))
  })

  // allVariantes: mismos campos que el legacy una vez sacados local/deposito (que
  // el legacy no computa), y el split nuevo tiene que sumar exactamente el stock.
  it('allVariantes (sin los campos nuevos local/deposito)', () => {
    const sinNuevos = (vs: DatosETL['allVariantes']) =>
      vs.map((v) => {
        const copia: Record<string, unknown> = { ...v }
        delete copia.local
        delete copia.deposito
        return copia
      })
    expect(normalizar(sinNuevos(port.allVariantes))).toEqual(normalizar(sinNuevos(legacy.allVariantes)))
  })

  // El split tiene que sumar exactamente el stock. NO se chequea no-negatividad:
  // GN permite available_quantity negativo (sobreventa) y el legacy tampoco lo
  // acota, así que un local/deposito negativo es dato real, no un bug del split.
  it('el split local/deposito de allVariantes suma el stock', () => {
    for (const v of port.allVariantes) {
      expect(v.local + v.deposito).toBe(v.stock)
    }
  })

  // fmKeyPids son Sets y JSON.stringify los aplasta a {}: sin esto, un deep-equal
  // por JSON compararía {} contra {} y pasaría sin haber comparado nada.
  it('fmKeyPids: los Sets tienen contenido real, no {} contra {}', () => {
    const pids = Object.values(legacy.fmKeyPids)
    if (pids.length === 0) return // Zattia no carga fundas: vacío legítimo
    expect(pids.every((s) => s instanceof Set)).toBe(true)
    expect(pids.some((s) => s.size > 0)).toBe(true)
  })
})
