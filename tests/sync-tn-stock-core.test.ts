import { describe, it, expect } from 'vitest'
import { aplicarResultadoTanda, candidatasDeStock, enTandas, marcarSinConfirmar, type DryRow } from '../lib/sync-tn/stock.core'

/**
 * Lo que se prueba acá es lo que escribe en la **tienda viva**. La falla que este núcleo existe
 * para impedir es una sola: que una tanda que volvió a medias se cuente como completa. Por eso hay
 * un caso por cada forma de volver a medias — con errores, sin respuesta, y mezclada.
 */

const fila = (over: Partial<DryRow> = {}): DryRow => ({
  sku: 'STU-REM-0001-S',
  nombre: 'Remera',
  tnProductId: '100',
  tnVariantId: '200',
  gn: 5,
  tn: 2,
  delta: 3,
  ...over,
})

describe('candidatasDeStock', () => {
  it('toma sólo las que tienen diferencia y saben a qué variante de TN escribirle', () => {
    const rows = [
      fila({ sku: 'A' }),
      fila({ sku: 'B', tn: 5, delta: 0 }), // ya coincide
      fila({ sku: 'C', tn: null, delta: null }), // TN no gestiona stock ahí
      fila({ sku: 'D', tnVariantId: null }), // no se sabe a qué variante escribir
    ]
    expect(candidatasDeStock(rows).map((r) => r.sku)).toEqual(['A'])
  })

  it('una diferencia negativa (TN tiene de más) también se escribe', () => {
    expect(candidatasDeStock([fila({ gn: 1, tn: 4, delta: -3 })])).toHaveLength(1)
  })
})

describe('enTandas', () => {
  it('parte de a `tam` y la última tanda queda corta', () => {
    expect(enTandas([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('con lista vacía no manda ninguna tanda', () => {
    expect(enTandas([], 20)).toEqual([])
  })

  it('con un tamaño inválido devuelve UNA tanda: nunca un bucle infinito', () => {
    expect(enTandas([1, 2, 3], 0)).toEqual([[1, 2, 3]])
  })
})

describe('aplicarResultadoTanda', () => {
  const a = fila({ sku: 'A', tnProductId: '1', tnVariantId: '10', gn: 5, tn: 2, delta: 3 })
  const b = fila({ sku: 'B', tnProductId: '1', tnVariantId: '11', gn: 7, tn: 0, delta: 7 })
  const c = fila({ sku: 'C', tnProductId: '2', tnVariantId: '12', gn: 9, tn: 9, delta: 0 })

  it('la que escribió queda TN = GN y la que falló CONSERVA su delta', () => {
    const { rows, ok, fallaron } = aplicarResultadoTanda([a, b, c], [a, b], {
      ok: true,
      aplicados: 1,
      errores: [{ product_id: '1', variant_id: '11', status: 422, msg: 'Variant not found' }],
    })
    expect(ok).toBe(1)
    expect(fallaron).toBe(1)
    expect(rows[0]).toMatchObject({ sku: 'A', tn: 5, delta: 0, err: null })
    expect(rows[1]).toMatchObject({ sku: 'B', tn: 0, delta: 7, err: 'Variant not found' })
  })

  it('no toca las filas que no se mandaron en esta tanda', () => {
    const { rows } = aplicarResultadoTanda([a, b, c], [a], { ok: true, aplicados: 1, errores: [] })
    expect(rows[1]).toBe(b)
    expect(rows[2]).toBe(c)
  })

  it('cuenta las escritas por fila y NO por el `aplicados` que manda el handler', () => {
    // Si el handler se equivocara en su propio contador, el que manda es quién tiene error y quién no.
    const { ok, fallaron } = aplicarResultadoTanda([a, b], [a, b], { ok: true, aplicados: 99, errores: [] })
    expect(ok).toBe(2)
    expect(fallaron).toBe(0)
  })

  it('reconoce la fila aunque TN devuelva los ids como número y no como texto', () => {
    const { rows, fallaron } = aplicarResultadoTanda([a], [a], {
      ok: true,
      aplicados: 0,
      errores: [{ product_id: 1, variant_id: 10, error: 'rate limit' }],
    })
    expect(fallaron).toBe(1)
    expect(rows[0].err).toBe('rate limit')
  })

  it('un error sin texto igual dice algo: el status', () => {
    const { rows } = aplicarResultadoTanda([a], [a], { ok: true, aplicados: 0, errores: [{ product_id: '1', variant_id: '10', status: 500 }] })
    expect(rows[0].err).toBe('TN contestó 500')
  })

  it('un reintento que sale bien limpia el error de la fila', () => {
    const conError = { ...a, err: 'Variant not found' }
    const { rows, ok } = aplicarResultadoTanda([conError], [conError], { ok: true, aplicados: 1, errores: [] })
    expect(ok).toBe(1)
    expect(rows[0]).toMatchObject({ tn: 5, delta: 0, err: null })
  })
})

describe('marcarSinConfirmar', () => {
  it('la tanda que no contestó no se da por escrita NI por fallada: se dice que no se sabe', () => {
    const a = fila({ sku: 'A', tnVariantId: '10' })
    const b = fila({ sku: 'B', tnVariantId: '11' })
    const rows = marcarSinConfirmar([a, b], [a], 'timeout')
    expect(rows[0].err).toContain('Sin confirmar')
    expect(rows[0].err).toContain('timeout')
    // ⛔ Lo que importa: el delta NO se toca, porque en TN puede haber quedado escrito igual.
    expect(rows[0]).toMatchObject({ tn: 2, delta: 3 })
    expect(rows[1]).toBe(b)
  })
})
