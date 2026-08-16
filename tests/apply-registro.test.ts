/**
 * Las sondas del registro de migraciones (`scripts/apply-registro.mjs`).
 *
 * 🔑 **El error probable acá no es de lógica, es un nombre mal escrito.** Cada fila de `POR_EFECTO`
 * dice "cuando se cumpla esto, marcá ESTE archivo como aplicado". Si el nombre no coincide con un
 * `.sql` real —una `s` de más, un renombre— la sonda corre, da true, e inserta una fila **para un
 * archivo que no existe**, mientras el archivo de verdad sigue figurando pendiente. No falla nada:
 * el registro simplemente miente, que es exactamente lo que este registro vino a evitar.
 *
 * Es el mismo modo de falla que ya tuvo `tablasDe` (ver su comentario): un detector equivocado es
 * peor que no tener detector.
 */
import { describe, it, expect, vi } from 'vitest'
import { readdirSync } from 'fs'

/**
 * 🔑 El mock tiene que estar ANTES del import (vitest lo iza) para que el `new pg.Client(...)` del
 * script caiga acá en vez de abrir una conexión de verdad. Es lo único que convierte el test del
 * guard en una prueba: sin esto daba verde con el guard roto (medido con un mutante).
 */
const clientes = vi.fn()
vi.mock('pg', () => ({
  default: {
    Client: class {
      constructor(cfg: unknown) {
        clientes(cfg)
      }
    },
  },
}))

import { POR_EFECTO } from '../scripts/apply-registro.mjs'

const SQL = new Set(readdirSync('sql').filter((f) => f.endsWith('.sql')))

describe('POR_EFECTO', () => {
  it('🔑 cada sonda apunta a un .sql que EXISTE', () => {
    const fantasmas = POR_EFECTO.map((p) => p.archivo).filter((a) => !SQL.has(a))
    expect(fantasmas).toEqual([])
  })

  it('no hay dos sondas para el mismo archivo (la segunda no se aplicaría nunca)', () => {
    const nombres = POR_EFECTO.map((p) => p.archivo)
    expect(nombres).toHaveLength(new Set(nombres).size)
  })

  it('toda sonda trae su prueba y su explicación: la nota del registro sale de ahí', () => {
    for (const p of POR_EFECTO) {
      expect(p.prueba, `${p.archivo} sin prueba`).toBeTruthy()
      expect(p.que, `${p.archivo} sin "que"`).toBeTruthy()
    }
  })

  it('`soloEn`, si está, nombra una marca real', () => {
    for (const p of POR_EFECTO) {
      if (p.soloEn) expect(['bdi', 'zattia']).toContain(p.soloEn)
    }
  })

  it('la prueba es una EXPRESIÓN, no una consulta: se interpola dentro de un select', () => {
    // El script hace `select (${prueba}) as ok`. Un `select ...` adentro rompe el paréntesis, y un
    // `;` permitiría colar una segunda sentencia contra una base de producción.
    for (const p of POR_EFECTO) {
      expect(p.prueba, `${p.archivo}`).not.toMatch(/;/)
      expect(p.prueba.trim().toLowerCase(), `${p.archivo}`).not.toMatch(/^select\s/)
    }
  })

  it('🔑 importar el script NO construye un cliente de base', () => {
    // Si el guard de "¿me ejecutaron directo?" se cae, importar este archivo abre las DOS bases de
    // producción en cada corrida de la suite. Con `pg` mockeado, la única señal fiable es que el
    // constructor no se haya llamado ni una vez — no que el import haya resuelto.
    expect(clientes).not.toHaveBeenCalled()
  })
})
