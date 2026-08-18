import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canalDeMeta, esMedidor, medidorDe } from '../lib/norte/medidores'

/**
 * 🔴 **La validación de una meta vive en el handler**, y es lo único que separa «se guardó» de «se
 * guardó y nunca va a medir nada».
 *
 * El modo de falla no es un error: una meta con un medidor que `medirMeta` no conoce se guarda
 * bien, se lista bien, y muestra la columna vacía **para siempre**. Se ve igual que una meta cuyo
 * dato todavía no llegó. Por eso el medidor y el canal se validan contra el catálogo del motor —
 * `lib/norte/medidores.core.js` y `lib/liquidacion/canal.core.js` — antes de tocar la base.
 *
 * ⛔ Y por eso el catálogo NO se copia acá adentro: una copia vieja acepta lo que el motor no sabe
 * medir. Es la misma regla que `permisos.core.js`, que nunca se copia en `api/*.js`.
 *
 * Texto contra texto en la parte del handler, porque invocarlo pide una sesión y una base; las
 * funciones que usa se ejercen de verdad.
 */

const handler = readFileSync(join(__dirname, '..', 'api/_norte.js'), 'utf8')
/** La rama que guarda una meta, de su `if` hasta el `const c = b.condiciones` que la sigue. */
const rama = handler.slice(handler.indexOf('if (b.meta) {'), handler.indexOf('const c = b.condiciones'))

describe('🔴 el handler valida la meta contra el catálogo del motor', () => {
  it('importa el catálogo en vez de llevar una copia', () => {
    expect(handler).toContain("from '../lib/norte/medidores.core.js'")
    // ⛔ Ninguna lista de medidores escrita a mano en el handler.
    expect(rama).not.toContain("'contrib-unidad'")
    expect(rama).not.toContain("'contrib-dia'")
  })

  it('rechaza un medidor que el motor no sabe medir, antes de escribir', () => {
    expect(rama).toContain('if (!esMedidor(medidor))')
    expect(rama.indexOf('esMedidor')).toBeLessThan(rama.indexOf('.upsert'))
  })

  it('rechaza un canal que no existe, y deja pasar el vacío como «todos»', () => {
    expect(rama).toContain('canalDeMeta(b.meta.canal)')
    expect(rama).toContain('canal === undefined')
    expect(canalDeMeta('')).toBeNull()
    expect(canalDeMeta('online')).toBe('online')
    expect(canalDeMeta('Online')).toBeUndefined()
    expect(canalDeMeta('mayoristas')).toBeUndefined()
  })

  it('la unidad que guarda sale del catálogo, no del request', () => {
    expect(rama).toContain('unidad: medidorDe(medidor).unidad')
    expect(rama).not.toContain('b.meta.unidad')
    expect(medidorDe('contrib-unidad')?.unidad).toBe('$/funda')
  })

  it('el GET devuelve el medidor y el canal, sin los cuales la meta no se puede medir', () => {
    expect(handler).toContain("select('key, label, medidor, canal, objetivo, fecha_objetivo, orden, activa')")
    expect(handler).toContain("medidor: r.medidor || 'unidades-dia'")
    expect(handler).toContain('canal: r.canal || null')
  })

  it('⛔ sigue sin guardar nada medido: el avance se calcula al mirar', () => {
    // ⚠️ `\b` y no `toContain`: «medidor» **contiene** «medido», y con `toContain` este caso
    // fallaba contra un handler correcto. Un subtexto no es una palabra.
    expect(rama).not.toMatch(/\bmedido\b/)
  })

  it('los tres medidores del catálogo pasan la validación que usa el handler', () => {
    for (const m of ['unidades-dia', 'contrib-unidad', 'contrib-dia']) expect(esMedidor(m)).toBe(true)
    expect(esMedidor('ventas-mes')).toBe(false)
    expect(esMedidor('')).toBe(false)
  })
})
