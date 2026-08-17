import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **El mutante que importa vive en el handler, donde no llega ningún test de lógica.**
 *
 * `cobrado` es el único campo del módulo con **tres** valores —`true` la cobró el cadete, `false` se
 * pagó al local por transferencia, `null` nadie dijo nada— y está rodeado de dos vecinos de dos
 * valores (`pagado` y `bonificado`) escritos con `!!b.<campo>`. Copiar esa línea es lo que sale solo
 * al escribir la tercera, y con el `!!` un cuerpo **sin el campo** escribe `false`: marca «se pagó al
 * local» sobre un envío que el cadete sí cobró, y esa plata le sale de lo que tiene que traer en la
 * rendición. **Nada falla**: es un 200 con el dato dado vuelta.
 *
 * Por eso la decisión vive en `valorDeCobro` (`reglas.core.js`), que sí se puede afirmar — pero nada
 * obliga al handler a llamarla. Eso es lo que prueba este archivo, y es la misma lección que dejó
 * `enviosDelDia` cuando el mutante vivía en `api/_cadete.js`: mutar una función pura y ver verde no
 * prueba nada si la decisión está en otro archivo.
 *
 * No prueba comportamiento —el handler corre en Node sin pasar por el compilador—: prueba que **las
 * dos puntas sigan de acuerdo**, igual que `blob-upload-sesion.test.ts` y `permisos-espejo.test.ts`.
 * Es texto contra texto a propósito.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')
const cliente = readFileSync(join(raiz, 'lib/envios/cliente.ts'), 'utf8')

/** El bloque de la acción, del `if` que la abre hasta el `if` de la que sigue. */
const bloque = handler.slice(handler.indexOf("b.action === 'cobrado'"), handler.indexOf("b.action === 'rotar-token'"))

describe('🔴 la acción `cobrado` del handler', () => {
  it('existe y el cliente le pega con ese nombre', () => {
    expect(bloque).not.toBe('')
    expect(cliente).toContain("action: 'cobrado'")
  })

  it('🔴 decide con `valorDeCobro`, que es donde se puede afirmar la regla', () => {
    expect(handler).toContain('valorDeCobro')
    expect(bloque).toContain('valorDeCobro(b.cobrado)')
  })

  // El mutante, escrito tal cual saldría de copiar el vecino de arriba.
  it('🔴 NO usa `!!b.cobrado`: el campo ausente no es «se pagó al local»', () => {
    expect(bloque).not.toContain('!!b.cobrado')
  })

  // Sin esto, un valor inválido caería en el `update` con `undefined` y PostgREST lo ignoraría en
  // silencio: 200, y la fila igual que antes. El que escribe cree que corrigió.
  it('🔴 rechaza lo que no es ninguno de los tres valores, antes de escribir', () => {
    expect(bloque).toContain('=== undefined')
    expect(bloque.indexOf('=== undefined')).toBeLessThan(bloque.indexOf('.update('))
  })

  // 🔑 Los tres valores tienen que poder llegar. `JSON.stringify` conserva `null` pero se come
  // `undefined`, así que el cliente manda el valor tal cual y el que decide es el handler.
  it('el cliente manda el valor sin normalizarlo de su lado', () => {
    expect(cliente).toContain('cobrado: boolean | null')
  })
})
