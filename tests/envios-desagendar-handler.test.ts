import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **Sacar del día dejaba presa a la fila, y el defecto vivía en el handler.**
 *
 * `desagendar` escribía `{ fecha: null, turno: null }` a secas, sin mirar el estado. La bandeja
 * «Sin fecha» pregunta `fecha is null` y nada más (`FILTRO_BANDEJA`), así que un envío **entregado**
 * al que alguien le tocara «sacar del día» caía ahí — y ahí no tenía un solo verbo encima: los
 * cerrados no dibujan el botón de estado (`siguienteEstado` devuelve `null`) y el cartel de «volvió»
 * es sólo de `no_entregado`. La única salida era el tacho.
 *
 * La decisión se mudó a `parcheAlSacarDelDia` (`reglas.core.js`), que sí se puede afirmar. Pero
 * **nada obliga al handler a llamarla**: el mutante es dejar el objeto literal donde estaba, que da
 * 200 y deja la bandeja igual de rota. Eso es lo que prueba este archivo — la misma lección de
 * `envios-cobrado-handler.test.ts`: mutar una función pura y ver verde no prueba nada si la
 * decisión está en otro archivo.
 *
 * No prueba comportamiento —el handler corre en Node sin pasar por el compilador—: prueba que las
 * dos puntas sigan de acuerdo. Es texto contra texto a propósito.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')
const reglas = readFileSync(join(raiz, 'lib/envios/reglas.core.js'), 'utf8')

/** El bloque de agendar/desagendar, del `if` que lo abre hasta el `if` de la acción que sigue. */
const bloque = handler.slice(
  handler.indexOf("b.action === 'agendar' || b.action === 'desagendar'"),
  handler.indexOf("b.action === 'pagado'"),
)

/** La rama del desagendar sola, hasta el `} else {` que abre la del agendar. */
const rama = bloque.slice(bloque.indexOf("b.action === 'desagendar'"), bloque.indexOf('} else {'))

describe('🔴 la rama `desagendar` del handler', () => {
  it('existe, y la función que decide también', () => {
    expect(bloque).not.toBe('')
    expect(rama).not.toBe('')
    expect(reglas).toContain('export function parcheAlSacarDelDia(')
  })

  it('🔴 la importa: sin el import es un `ReferenceError` en la calle, no un test rojo', () => {
    expect(handler).toContain('parcheAlSacarDelDia,')
  })

  it('🔴 decide con `parcheAlSacarDelDia`, que es donde se puede afirmar la regla', () => {
    expect(rama).toContain('parcheAlSacarDelDia(actual)')
  })

  // El mutante, escrito tal cual estaba antes: el parche a mano da 200 y deja la fila sin salida.
  it('🔴 NO arma el parche a mano', () => {
    expect(rama).not.toMatch(/parche\s*=\s*\{\s*fecha:\s*null/)
  })

  // Sin la lectura previa, `parcheAlSacarDelDia` recibe `undefined` y devuelve siempre el parche
  // corto: el arreglo queda puesto y apagado, con todos los tests verdes.
  it('🔴 lee el estado de la fila ANTES de escribir', () => {
    expect(rama).toContain(".select('estado')")
    expect(rama.indexOf(".select('estado')")).toBeLessThan(rama.indexOf('parcheAlSacarDelDia(actual)'))
  })
})
