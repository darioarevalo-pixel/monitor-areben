import { describe, expect, it } from 'vitest'
import { randomInt } from 'node:crypto'
import { ALFABETO, MAX_LOTE, codigoVisible, csvDeLote, enmascarado, esCodigo, estadoGift, generarCodigos, normalizarCodigo, nuevoCodigo, pareceGift, verificador } from '@/lib/caja/gift.core.js'

/**
 * Gift card, el código (W6, 11-oct). Oráculo del verificador: Luhn mod N hecho A MANO sobre una tira
 * corta (abajo), y la propiedad que se le pide —todo error de UN símbolo y todo cambio de dos vecinos
 * distintos lo detecta— recorrida entera, ⛔ muestreada.
 */
describe('gift card · el código', () => {
  it('el verificador, a mano: «12» ⇒ 2 se dobla (4), 1 queda ⇒ 5 ⇒ 32-5 = 27 = «V»', () => {
    // De derecha a izquierda: «2» doblado = 4; «1» tal cual = 1; suma 5; (32 - 5) % 32 = 27 ⇒ ALFABETO[27].
    expect(ALFABETO[27]).toBe('V')
    expect(verificador('12')).toBe('V')
    // Un doble que se pasa de 32: «G» = 16 ⇒ 32 ⇒ 1 + 0 = 1 ⇒ 31 = «Z».
    expect(verificador('G')).toBe('Z')
  })

  it('detecta TODO error de un símbolo y todo cambio de dos vecinos distintos', () => {
    const cuerpo = 'K7Q2M9XC4P'
    const c = 'GC' + cuerpo + verificador(cuerpo)
    expect(esCodigo(c)).toBe(true)
    let malos = 0
    for (let i = 2; i < c.length; i++) {
      for (const s of ALFABETO) {
        if (s === c[i]) continue
        const m = c.slice(0, i) + s + c.slice(i + 1)
        if (esCodigo(m)) malos++
      }
    }
    expect(malos).toBe(0)
    for (let i = 2; i < c.length - 1; i++) {
      if (c[i] === c[i + 1]) continue
      const t = c.slice(0, i) + c[i + 1] + c[i] + c.slice(i + 2)
      // Luhn deja pasar UN cambio de vecinos por alfabeto (el par que suma igual doblado): acá ⛔ aparece.
      expect(esCodigo(t), `transposición en ${i}`).toBe(false)
    }
  })

  it('lo que llega del lector se normaliza: minúsculas, espacios, guiones, O/I/L', () => {
    const c = nuevoCodigo(randomInt)
    expect(esCodigo(c.toLowerCase())).toBe(true)
    expect(esCodigo(codigoVisible(c))).toBe(true)
    expect(normalizarCodigo('gc-1o1l-i')).toBe('GC1011' + '1')
    expect(esCodigo('')).toBe(false)
    expect(esCodigo(null)).toBe(false)
    expect(esCodigo('RBT0137BE')).toBe(false)
    expect(esCodigo(c.slice(0, -1))).toBe(false)
  })

  it('pareceGift: el buscador la reconoce aunque el verificador esté mal', () => {
    const c = nuevoCodigo(randomInt)
    const mal = c.slice(0, -1) + (c.slice(-1) === '0' ? '1' : '0')
    expect(esCodigo(mal)).toBe(false)
    expect(pareceGift(mal)).toBe(true)
    expect(pareceGift('RBT-0137')).toBe(false)
  })

  it('el lote: la cantidad pedida, todos distintos, todos válidos, y ⛔ repite los que ya estaban', () => {
    const l = generarCodigos(500, randomInt)
    expect(l).toHaveLength(500)
    expect(new Set(l).size).toBe(500)
    expect(l.every(esCodigo)).toBe(true)
    // Un azar que repite: el primero sale de nuevo ⇒ se descarta y se pide otro.
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    let i = 0
    const repetido = generarCodigos(1, () => 0)[0]
    expect(generarCodigos(1, () => seq[i++], [repetido])[0]).not.toBe(repetido)
    expect(() => generarCodigos(0, randomInt)).toThrow()
    expect(() => generarCodigos(MAX_LOTE + 1, randomInt)).toThrow()
    expect(() => generarCodigos(2.5, randomInt)).toThrow()
  })

  it('lo impreso, lo enmascarado y el CSV', () => {
    const c = 'GC' + 'ABCDEFGHJK' + verificador('ABCDEFGHJK')
    expect(codigoVisible(c)).toBe(`GC ABCD EFGH JK${c.slice(-1)}`)
    expect(enmascarado(c)).toBe(`····HJK${c.slice(-1)}`)
    expect(csvDeLote([{ codigo: c }])).toBe(`n,codigo,numero\n1,${c},${codigoVisible(c)}\n`)
  })

  it('el estado que se muestra', () => {
    const hoy = '2026-10-11'
    const g = (estado: 'inactiva' | 'pendiente' | 'activa' | 'anulada', saldo: number | null, vence_en: string | null) => estadoGift({ estado, saldo, vence_en }, hoy)
    expect(g('activa', 1000, '2027-10-11')).toBe('activa')
    expect(g('activa', 1000, '2026-10-11')).toBe('activa') // vence ese día: el día entero vale
    expect(g('activa', 1000, '2026-10-10')).toBe('vencida')
    expect(g('activa', 0, '2027-10-11')).toBe('agotada')
    expect(g('activa', 0, '2026-10-10')).toBe('vencida')
    expect(g('anulada', 1000, '2027-10-11')).toBe('anulada')
    expect(g('inactiva', null, null)).toBe('inactiva')
    expect(g('pendiente', 1000, '2027-10-11')).toBe('pendiente')
  })
})
