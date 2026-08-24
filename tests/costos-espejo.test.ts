import { describe, it, expect } from 'vitest'
import { revisarCostos, sinCostoSiNoSeVe } from '../scripts/lib/costos-espejo.mjs'

/**
 * El guard que impide que «el token no puede ver el costo» se escriba como «el producto no tiene
 * costo». Lo que se prueba acá es un defecto que ya pasó y duró meses **en verde**: 450 productos
 * de BDI con `unit_cost` en NULL porque el token de GitHub Actions no tiene `costs:read`.
 */

describe('revisarCostos: distinguir «no tiene costo» de «no lo puedo ver»', () => {
  it('🔴 ningún producto con costo NO es un dato: es un token sin permiso', () => {
    const r = revisarCostos([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(r.legible).toBe(false)
    expect(r.conCosto).toBe(0)
    expect(r.problema).toContain('costs:read')
  })

  it('🔴 el costo CERO es un costo, no una ausencia', () => {
    // Zattia tiene 769 productos con costo 0 sobre 2.676. Si el guard los leyera como «sin costo»,
    // un catálogo legítimo dispararía la alarma y el aviso se volvería ruido que nadie mira.
    const r = revisarCostos([{ id: 1, unit_cost: 0 }, { id: 2, unit_cost: 0 }])
    expect(r.legible).toBe(true)
    expect(r.conCosto).toBe(2)
    expect(r.problema).toBeNull()
  })

  it('con uno solo que traiga costo, el token ve: la falla es de todo o nada', () => {
    const r = revisarCostos([{ id: 1 }, { id: 2, unit_cost: 1500 }, { id: 3 }])
    expect(r.legible).toBe(true)
    expect(r.conCosto).toBe(1)
  })

  it('sin productos no hay nada que afirmar: no es una alarma', () => {
    // Un catálogo vacío es otro problema, y hacerlo pasar por «token sin permiso» mandaría a
    // revisar el secret equivocado.
    expect(revisarCostos([]).legible).toBe(true)
    expect(revisarCostos([]).problema).toBeNull()
    expect(revisarCostos(undefined).legible).toBe(true)
  })

  it('un `unit_cost` explícitamente null cuenta como ausente', () => {
    expect(revisarCostos([{ id: 1, unit_cost: null }]).legible).toBe(false)
  })
})

describe('sinCostoSiNoSeVe: sacar la columna, no escribirla en NULL', () => {
  const filas = [
    { id: 1, name: 'a', unit_cost: null },
    { id: 2, name: 'b', unit_cost: null },
  ]

  it('🔴 cuando el costo no se ve, la clave NO viaja en el upsert', () => {
    // Es lo único que impide que el `ON CONFLICT DO UPDATE` pise el espejo con NULL. Dejarla en
    // null «porque total es null» es exactamente el defecto que este archivo existe para tapar.
    const out = sinCostoSiNoSeVe(filas, false)
    expect(out.every((p: object) => !('unit_cost' in p))).toBe(true)
    expect(out[0]).toEqual({ id: 1, name: 'a' })
  })

  it('🔴 lo saca de TODAS o de ninguna', () => {
    // PostgREST arma el INSERT con las claves de las filas: si unas la traen y otras no, las que
    // faltan igual se escriben NULL. Un filtrado fila por fila no arreglaría nada.
    const mezcla = [{ id: 1, unit_cost: null }, { id: 2, unit_cost: 900 }]
    const out = sinCostoSiNoSeVe(mezcla, false)
    expect(out.some((p: object) => 'unit_cost' in p)).toBe(false)
  })

  it('cuando el costo SÍ se ve, no toca nada: un null suelto ahí es un dato real', () => {
    const mezcla = [{ id: 1, unit_cost: 900 }, { id: 2, unit_cost: null }]
    expect(sinCostoSiNoSeVe(mezcla, true)).toBe(mezcla)
  })
})
