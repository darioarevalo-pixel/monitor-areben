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
 * `allVariantes` y `allProductos` van aparte (más abajo): el port les agregó campos
 * que el ETL legacy no computa — `local`/`deposito` para Sesión de fotos, y `sinCosto`
 * para distinguir un costo ausente de un costo en cero. Sus comparaciones excluyen
 * esos campos y los verifican por separado.
 */
const CAMPOS: (keyof DatosETL)[] = [
  'ventas', 'detalles', 'invByProduct', 'invByProdModelo', 'invDepoMin', 'prodMeta',
  'fmKeyPids', 'fmProdCreatedAt', 'allVvar', 'allMonths',
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

  // allProductos: igual que el legacy una vez sacados los campos que el legacy no computa.
  // `sinCosto` distingue "el costo no vino de GN" de "el costo es 0" — el legacy hace
  // `parseFloat(...) || 0` y pierde esa diferencia para siempre.
  // `diasVivo` es la edad del producto, que el legacy no mira, y `phase` cambia con ella: los
  // productos de menos de 30 días ahora dicen "nuevo" donde el legacy decía otra cosa. Por eso
  // `phase` sale de esta comparación y se verifica aparte, abajo, en los dos sentidos.
  it('allProductos (sin los campos nuevos sinCosto/diasVivo/ingresoFecha/phase)', () => {
    const sinNuevos = (ps: DatosETL['allProductos']) =>
      ps.map((p) => {
        const copia: Record<string, unknown> = { ...p }
        delete copia.sinCosto
        delete copia.diasVivo
        delete copia.ingresoFecha
        delete copia.phase
        return copia
      })
    expect(normalizar(sinNuevos(port.allProductos))).toEqual(normalizar(sinNuevos(legacy.allProductos)))
  })

  // La fase sigue siendo la del legacy en todo producto que NO sea nuevo. Sin esto, sacar `phase`
  // de la comparación de arriba dejaría la fórmula entera sin cubrir.
  it('phase: idéntica al legacy en los productos que no son nuevos', () => {
    const legacyPorId = new Map(legacy.allProductos.map((p) => [p.id, p.phase]))
    const noNuevos = port.allProductos.filter((p) => p.phase.label !== 'nuevo')
    expect(noNuevos.length).toBeGreaterThan(0) // si fueran todos nuevos, esto no probaría nada
    for (const p of noNuevos) expect(p.phase).toEqual(legacyPorId.get(p.id))
  })

  // Y el otro sentido: "nuevo" aparece exactamente donde el producto tiene menos de 30 días.
  it('phase: "nuevo" está exactamente en los de menos de 30 días', () => {
    for (const p of port.allProductos) {
      expect(p.phase.label === 'nuevo').toBe(p.diasVivo !== null && p.diasVivo < 30)
    }
  })

  // `sinCosto` tiene que mirar el dato CRUDO, no el normalizado: si se calculara desde
  // `unit_cost` (ya colapsado a 0) marcaría también los que valen cero de verdad.
  it('sinCosto marca sólo los que Gestión Nube no mandó, no los que valen 0', () => {
    const crudo = new Map(fixture.entrada.productos.map((p) => [String(p.id), p.unit_cost]))
    for (const p of port.allProductos) {
      const v = crudo.get(p.id)
      expect(p.sinCosto).toBe(v == null || v === '')
      if (p.sinCosto) expect(p.unit_cost).toBe(0) // se sigue normalizando a 0 para poder sumar
    }
  })

  // allVariantes: mismos campos que el legacy una vez sacados local/deposito (que
  // el legacy no computa), y el split nuevo tiene que sumar exactamente el stock.
  // `phase` sale por lo mismo que en allProductos: la variante hereda la edad de su producto.
  it('allVariantes (sin los campos nuevos local/deposito/phase)', () => {
    const sinNuevos = (vs: DatosETL['allVariantes']) =>
      vs.map((v) => {
        const copia: Record<string, unknown> = { ...v }
        delete copia.local
        delete copia.deposito
        delete copia.phase
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
