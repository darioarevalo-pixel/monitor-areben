import { describe, expect, it } from 'vitest'
import { agruparLecturas, claveDe, controles, leerCodigo, ubicacionesDe } from '@/lib/ubicaciones-local/core.core.js'
import { skuBase } from '@/lib/conteo-estandar/core'

/**
 * Ubicaciones depósito: el núcleo.
 *
 * 🔑 Los SKU son REALES del Local de Zattia (espejo del 1-oct-2026): `RBT-0137-BE/CR/MA` es la Baby Tee
 * Nex en tres colores, `RBE-0016-38` lleva talle, y Stunned arranca con `STU-`.
 */

describe('claveDe: el producto es el SKU sin color ni talle', () => {
  it.each([
    ['RBT-0137-BE', 'RBT-0137'],
    ['RBT-0137-MA', 'RBT-0137'],
    ['RBE-0016-38', 'RBE-0016'],
    ['STU-REM-0001-S', 'STU-REM-0001'],
    ['rbt-0149', 'RBT-0149'],
    [' RBLU-0028-CT ', 'RBLU-0028'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (sku, clave) => expect(claveDe(sku)).toBe(clave))

  it('🔑 el conteo usa LA MISMA regla (una sola definición de «el producto»)', () => {
    for (const s of ['RBT-0137-BE', 'STU-REM-0001-S', 'CINTO', '']) expect(skuBase(s)).toBe(claveDe(s))
  })
})

describe('leerCodigo: estante o bolsa', () => {
  it('la etiqueta EST- es un estante', () => {
    expect(leerCodigo('EST-A1')).toEqual({ tipo: 'estante', estante: 'A1' })
    expect(leerCodigo('est-b12')).toEqual({ tipo: 'estante', estante: 'B12' })
  })
  it("🔴 el lector con teclado en castellano escribe ' por -", () => {
    expect(leerCodigo("EST'A1")).toEqual({ tipo: 'estante', estante: 'A1' })
    expect(leerCodigo("RBT'0137")).toEqual({ tipo: 'bolsa', codigo: 'RBT-0137', clave: 'RBT-0137' })
  })
  it('cualquier otra cosa es una bolsa, con su clave', () => {
    expect(leerCodigo('RBT-0137')).toEqual({ tipo: 'bolsa', codigo: 'RBT-0137', clave: 'RBT-0137' })
    // la etiqueta de una prenda también llega al producto
    expect(leerCodigo('RBT-0137-BE')).toMatchObject({ tipo: 'bolsa', clave: 'RBT-0137' })
  })
  it('vacío o «EST-» solo no es nada', () => {
    expect(leerCodigo('  ')).toEqual({ tipo: 'vacio' })
    expect(leerCodigo('EST-')).toEqual({ tipo: 'vacio' })
  })
})

describe('agruparLecturas: cada lectura repetida es una bolsa más', () => {
  it('cuenta bolsas y ordena por SKU (numérico)', () => {
    expect(agruparLecturas(['RBT-0137', 'RBT-0101', 'RBT-0137', 'RBT-0137'])).toEqual([
      { clave: 'RBT-0101', bolsas: 1 },
      { clave: 'RBT-0137', bolsas: 3 },
    ])
  })
  it('una lista vacía es un estante vacío', () => expect(agruparLecturas([])).toEqual([]))
})

describe('ubicacionesDe', () => {
  const foto = [
    { estante: 'A2', clave: 'RBT-0137' },
    { estante: 'A1', clave: 'RBT-0137' },
    { estante: 'A1', clave: 'RBT-0101' },
  ]
  it('repartido en dos estantes ⇒ los dos, ordenados', () => expect(ubicacionesDe(foto, 'RBT-0137-BE')).toEqual(['A1', 'A2']))
  it('sin bolsa ⇒ ninguno', () => expect(ubicacionesDe(foto, 'RBT-0999')).toEqual([]))
})

describe('controles contra el stock del Local', () => {
  const fila = (sku: string, q: number) => ({ sku, product_name: `P ${sku}`, available_quantity: q })

  it('bolsa escaneada y el Local en 0 ⇒ «bolsa sin stock»', () => {
    const r = controles([{ estante: 'A1', clave: 'RBT-0137' }], [fila('RBT-0137-BE', 0), fila('RBT-0137-CR', 0)])
    expect(r.bolsaSinStock).toEqual([{ clave: 'RBT-0137', nombre: 'P RBT-0137-BE', estantes: ['A1'] }])
  })

  it('bolsa escaneada de un producto que el Local ni tiene ⇒ también avisa', () => {
    expect(controles([{ estante: 'B3', clave: 'RTO-0065' }], []).bolsaSinStock).toHaveLength(1)
  })

  it('más de 3 en una variante y ninguna bolsa ⇒ «stock sin bolsa»', () => {
    const r = controles([], [fila('RBT-0137-BE', 5), fila('RBT-0137-CR', 1)])
    expect(r.stockSinBolsa).toEqual([{ clave: 'RBT-0137', nombre: 'P RBT-0137-BE', enLocal: 6, maxVariante: 5 }])
  })

  it('🔑 hasta 3 por variante y sin bolsa ⇒ ⛔ no avisa: puede estar todo colgado', () => {
    const r = controles([], [fila('RBT-0137-BE', 3), fila('RBT-0137-CR', 3), fila('RBT-0137-MA', 2)])
    expect(r.stockSinBolsa).toEqual([])
  })

  it('con bolsa y con stock ⇒ ningún aviso', () => {
    const r = controles([{ estante: 'A1', clave: 'RBT-0137' }], [fila('RBT-0137-BE', 9)])
    expect(r).toEqual({ bolsaSinStock: [], stockSinBolsa: [] })
  })

  it('un stock negativo de GN no tapa el de otra variante', () => {
    const r = controles([{ estante: 'A1', clave: 'RBT-0137' }], [fila('RBT-0137-BE', -1), fila('RBT-0137-CR', 2)])
    expect(r.bolsaSinStock).toEqual([])
  })
})
