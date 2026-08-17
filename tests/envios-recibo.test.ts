/**
 * El recibo de un movimiento de la cuenta del cadete.
 *
 * Los dos defectos que este papel puede tener son mudos: el que sale **cortado** (el bloque del
 * saldo empujado fuera del rollo por una nota larga) y el que dice **lo contrario** de lo que pasó
 * («Rindió» donde fue «Le pagamos», con el mismo número). Ninguno de los dos lo caza un ensayo que
 * verifique que el PDF se generó, y por eso el layout es una función pura que devuelve dónde queda
 * cada cosa y cuánto mide la página.
 */
import { describe, expect, it } from 'vitest'

import { armarRecibo, selloDeImpresion, type OpSaldo } from '@/lib/envios/recibo'
import { rotuloDeSaldo } from '@/lib/envios/reglas.core.js'
import type { MovimientoCuenta } from '@/lib/envios/tipos'

/** Corta cada 24 caracteres: no imita a jsPDF, sólo hace que un texto más largo ocupe más renglones. */
const medir = (txt: string) => txt.match(/.{1,24}/g) || ['']

const mov = (p: Partial<MovimientoCuenta> = {}): MovimientoCuenta =>
  ({
    id: 'mv1',
    fecha: '2026-08-17',
    monto: -10000,
    nota: null,
    autor: 'Bruno',
    created_at: '2026-08-17T20:00:00Z',
    anulado_en: null,
    anulado_por: null,
    ...p,
  }) as MovimientoCuenta

/** 17-ago-2026, 22:04 UTC = 19:04 en Argentina. */
const AHORA = Date.parse('2026-08-17T22:04:00Z')

const textos = (ops: { k: string }[]) =>
  ops.filter((o) => o.k === 'txt').map((o) => (o as unknown as { txt: string }).txt)
const saldoOp = (ops: { k: string }[]) => ops.find((o) => o.k === 'saldo') as OpSaldo

describe('🔴 el recibo no se corta', () => {
  it('el papel crece con la nota, y el recuadro del saldo sigue entero adentro', () => {
    const corto = armarRecibo(mov(), 47000, AHORA, medir)
    const largo = armarRecibo(
      mov({
        nota: 'Trajo lo del lunes, martes y miércoles todo junto, menos dos envíos de Funes que quedaron para el jueves que viene',
      }),
      47000,
      AHORA,
      medir,
    )
    expect(largo.alto).toBeGreaterThan(corto.alto)
    for (const r of [corto, largo]) {
      const s = saldoOp(r.ops)
      expect(s).toBeDefined()
      // El bloque ENTERO, no su primer milímetro: un recuadro que arranca adentro y termina afuera
      // sale con el saldo cortado por la cuchilla, que es el defecto propio de este formato.
      expect(s.y + s.alto).toBeLessThanOrEqual(r.alto)
    }
  })

  it('el saldo va último: nada se escribe abajo del número con el que se habla con el cadete', () => {
    const { ops } = armarRecibo(mov({ nota: 'rindió en el mostrador' }), 47000, AHORA, medir)
    expect(ops[ops.length - 1].k).toBe('saldo')
  })

  it('el recuadro crece cuando además va la explicación de para qué lado está el saldo', () => {
    const enCero = saldoOp(armarRecibo(mov(), 0, AHORA, medir).ops)
    const conSub = saldoOp(armarRecibo(mov(), 47000, AHORA, medir).ops)
    expect(conSub.alto).toBeGreaterThan(enCero.alto)
    expect(enCero.sub).toBe('')
  })
})

describe('🔴 el recibo no puede decir lo contrario de lo que pasó', () => {
  // El mutante que importa: leer el signo al revés, o directamente imprimir el número crudo. Los dos
  // dan un papel perfectamente plausible —«Le pagamos $10.000» y «Rindió $10.000» se leen igual de
  // bien— y la diferencia entre los dos son veinte mil pesos en la próxima discusión de plata.
  it('rendir imprime «Rindió» y que nos paguen imprime «Le pagamos»', () => {
    expect(textos(armarRecibo(mov({ monto: -10000 }), 0, AHORA, medir).ops)).toContain('Rindió')
    expect(textos(armarRecibo(mov({ monto: 3000 }), 0, AHORA, medir).ops)).toContain('Le pagamos')
  })

  it('🔴 en el papel NUNCA va un negativo: el signo lo dice el verbo', () => {
    const escrito = textos(armarRecibo(mov({ monto: -10000 }), -47000, AHORA, medir).ops).join(' ')
    expect(escrito).toContain('$10.000')
    expect(escrito).not.toContain('-$')
    expect(escrito).not.toContain('$-')
    // Y el del recuadro tampoco.
    expect(saldoOp(armarRecibo(mov(), -47000, AHORA, medir).ops).monto).toBe('$47.000')
  })

  it('el saldo del papel es el que se le pasa, y dice de qué lado está', () => {
    const debe = saldoOp(armarRecibo(mov(), -47000, AHORA, medir).ops)
    const tiene = saldoOp(armarRecibo(mov(), 47000, AHORA, medir).ops)
    expect(debe.titulo).toBe(rotuloDeSaldo(-47000).titulo)
    expect(tiene.titulo).toBe(rotuloDeSaldo(47000).titulo)
    // 🔑 Un número sin de-qué-lado no se puede leer: los dos casos imprimen $47.000 y son opuestos.
    expect(debe.monto).toBe(tiene.monto)
    expect(debe.titulo).not.toBe(tiene.titulo)
  })
})

describe('🔴 el papel dice CUÁNDO se leyó ese saldo', () => {
  // 🔑 Es toda la idea del recibo. El saldo se arrastra y no hay ningún total guardado: cambia solo
  // cuando alguien corrige el precio de un envío de la semana pasada. Sin el sello, dos
  // reimpresiones del MISMO movimiento se contradicen y no hay forma de saber cuál vale; con el
  // sello las dos son ciertas. El mutante —imprimir «Saldo: $X» a secas— deja un papel que envejece
  // en silencio, y es lo único que este archivo no puede dejar pasar.
  it('el recuadro trae el instante de impresión, no sólo el monto', () => {
    const s = saldoOp(armarRecibo(mov(), 47000, AHORA, medir).ops)
    expect(s.sello).toContain('17-ago')
    expect(s.sello).toContain('19:04')
  })

  it('🔴 el sello es la hora de Argentina, con offset fijo: a las 21:30 de acá no salta al día siguiente', () => {
    // 00:30 UTC del 18 son las 21:30 del 17 en Rosario. Con la hora del navegador —o en UTC— el
    // recibo que se imprime al cierre del turno tarde queda fechado mañana.
    expect(selloDeImpresion(Date.parse('2026-08-18T00:30:00Z'))).toBe('lun 17-ago 21:30')
    expect(selloDeImpresion(Date.parse('2026-08-17T22:04:00Z'))).toBe('lun 17-ago 19:04')
  })

  it('dos impresiones del mismo movimiento se distinguen por el sello, no por el hecho', () => {
    const a = armarRecibo(mov(), 47000, AHORA, medir)
    const b = armarRecibo(mov(), 12000, AHORA + 3600000, medir)
    expect(saldoOp(a.ops).sello).not.toBe(saldoOp(b.ops).sello)
    // El hecho es el mismo papel: mismo verbo, mismo monto, misma fecha del movimiento.
    expect(textos(a.ops)).toContain('Rindió')
    expect(textos(b.ops)).toContain('Rindió')
  })
})

describe('lo que el cadete necesita que diga el recibo', () => {
  it('está el día del movimiento, la nota y quién lo anotó', () => {
    const escrito = textos(armarRecibo(mov({ nota: 'rindió en el mostrador' }), 47000, AHORA, medir).ops).join(' ')
    expect(escrito).toContain('17-ago')
    expect(escrito).toContain('rindió en el mostrador')
    expect(escrito).toContain('Anotado por Bruno')
  })

  it('un movimiento sin nota ni autor no deja renglones vacíos', () => {
    const { ops } = armarRecibo(mov({ nota: null, autor: null }), 47000, AHORA, medir)
    expect(textos(ops).every((t) => t.trim() !== '')).toBe(true)
  })
})
