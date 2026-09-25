import { describe, expect, it } from 'vitest'
import { armarMazo, decidir, deshacer, marcadas, MAZO_INICIAL } from '@/lib/destacados/mazo'

/**
 * Las reglas de la «Asignación rápida» de ⭐ (`lib/destacados/mazo.ts`).
 *
 * Mutantes que tienen que caer:
 *  1. Dejar entrar productos sin foto.
 *  2. Que pasar a uno que ya tenía ⭐ escriba «sacar».
 *  3. Que marcar uno que ya tenía ⭐ escriba (y que deshacerlo se la saque).
 *  4. Que deshacer un «pasar» escriba algo.
 */

describe('armarMazo', () => {
  it('saltea los que no tienen foto y respeta el orden de la tabla', () => {
    const fotos: Record<string, string[]> = { a: ['a1', 'a2'], b: [], c: ['', 'c1'] }
    const m = armarMazo(['a', 'b', 'c'], (p) => fotos[p])
    expect(m.map((c) => c.p)).toEqual(['a', 'c'])
    expect(m[1].imagenes).toEqual(['c1'])
  })
})

describe('decidir', () => {
  it('→ sobre uno sin ⭐ escribe marcar y avanza', () => {
    const r = decidir(MAZO_INICIAL, 3, 'estrella', false)
    expect(r.escritura).toBe('marcar')
    expect(r.estado.i).toBe(1)
    expect(marcadas(r.estado)).toBe(1)
  })

  it('← ⛔ desmarca: pasar uno que ya tenía ⭐ no escribe nada', () => {
    const r = decidir(MAZO_INICIAL, 3, 'pasar', true)
    expect(r.escritura).toBeNull()
    expect(r.estado.i).toBe(1)
  })

  it('→ sobre uno que ya tenía ⭐ avanza sin escribir ni contarlo', () => {
    const r = decidir(MAZO_INICIAL, 3, 'estrella', true)
    expect(r.escritura).toBeNull()
    expect(marcadas(r.estado)).toBe(0)
  })

  it('con el mazo terminado no hace nada', () => {
    const fin = { i: 2, historia: [] }
    expect(decidir(fin, 2, 'estrella', false)).toEqual({ estado: fin, escritura: null })
  })
})

describe('deshacer', () => {
  it('deshacer un → propio saca la ⭐ y vuelve a esa carta', () => {
    const a = decidir(MAZO_INICIAL, 3, 'pasar', false).estado
    const b = decidir(a, 3, 'estrella', false).estado
    const r = deshacer(b)
    expect(r).toMatchObject({ escritura: 'sacar', i: 1 })
    expect(r.estado.i).toBe(1)
    expect(marcadas(r.estado)).toBe(0)
  })

  it('deshacer un ← o un → sobre una ⭐ ajena ⛔ escribe', () => {
    const a = decidir(MAZO_INICIAL, 3, 'pasar', false).estado
    expect(deshacer(a).escritura).toBeNull()
    const b = decidir(MAZO_INICIAL, 3, 'estrella', true).estado
    expect(deshacer(b).escritura).toBeNull()
  })

  it('sin historia no hace nada', () => {
    expect(deshacer(MAZO_INICIAL)).toEqual({ estado: MAZO_INICIAL, escritura: null, i: null })
  })
})
