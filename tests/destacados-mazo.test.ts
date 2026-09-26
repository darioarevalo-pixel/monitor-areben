import { describe, expect, it } from 'vitest'
import { alternarEstrella, armarMazo, marcadas, mover, tieneEstrella } from '@/lib/destacados/mazo'

/**
 * Las reglas de la «Asignación rápida» de ⭐ (`lib/destacados/mazo.ts`).
 *
 * Mutantes que tienen que caer:
 *  1. Dejar entrar productos sin foto.
 *  2. `mover` que da la vuelta, o que se pasa del final / del principio.
 *  3. Leer «¿tiene ⭐?» sólo de la lista (ignorando lo escrito en la pasada).
 *  4. Contar como marcadas las que ya tenían ⭐ al abrir, o las que se apagaron.
 */

describe('armarMazo', () => {
  it('saltea los que no tienen foto y respeta el orden de la tabla', () => {
    const fotos: Record<string, string[]> = { a: ['a1', 'a2'], b: [], c: ['', 'c1'] }
    const m = armarMazo(['a', 'b', 'c'], (p) => fotos[p])
    expect(m.map((c) => c.p)).toEqual(['a', 'c'])
    expect(m[1].imagenes).toEqual(['c1'])
  })
})

describe('mover', () => {
  it('→ avanza hasta la pantalla final (i = total) y no más; ← no baja de 0', () => {
    expect(mover(0, 3, 1)).toBe(1)
    expect(mover(2, 3, 1)).toBe(3)
    expect(mover(3, 3, 1)).toBe(3)
    expect(mover(3, 3, -1)).toBe(2)
    expect(mover(0, 3, -1)).toBe(0)
  })
})

describe('la ⭐', () => {
  it('lo escrito en la pasada gana sobre la lista, en los dos sentidos', () => {
    const lista = new Set(['1'])
    expect(tieneEstrella('1', new Map(), lista)).toBe(true)
    expect(tieneEstrella('1', new Map([['1', false]]), lista)).toBe(false)
    expect(tieneEstrella('2', new Map([['2', true]]), lista)).toBe(true)
    expect(tieneEstrella('2', new Map(), lista)).toBe(false)
  })

  it('es un interruptor', () => {
    expect(alternarEstrella(false)).toBe('marcar')
    expect(alternarEstrella(true)).toBe('sacar')
  })

  it('cuenta sólo las nuevas de esta pasada que siguen prendidas', () => {
    const propias = new Map([['1', true], ['2', true], ['3', false]])
    expect(marcadas(propias, new Set(['2']))).toBe(1)
  })
})
