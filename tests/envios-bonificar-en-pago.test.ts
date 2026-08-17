import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **Bonificar vive en la columna «Pago del envío», y quién lo dibuja decide qué escribe.**
 *
 * `pagoDelEnvio` ya tiene sus tests de verdad en `envios-core.test.ts`: los tres estados, las acciones
 * de cada uno y el `campo` al que le escribe cada botón. Lo que esos tests **no** pueden ver es la
 * otra mitad, que vive en el JSX y falla callada de dos formas:
 *
 * 1. **`Bonificar` vuelve a colgar de `Cotizar`** —donde estaba hasta el 17-ago-2026—, o sea debajo
 *    del precio. Nada se rompe: quedan dos formas de bonificar, una en cada columna, y la que está al
 *    lado del monto sigue diciendo que la pregunta es cuánto sale el reparto cuando es quién lo paga.
 * 2. **`PagoDelEnvio` despacha siempre a `marcarPagado`.** Es el mutante caro: el botón dice
 *    «Bonificar», contesta 200, y la fila queda marcada como **pagada por la clienta**. Son dos
 *    verdades opuestas sobre la misma plata (`validarEnvio` las rechaza juntas justamente por eso) y
 *    la caja del día suma un envío que en realidad regalamos.
 *
 * Texto contra texto a propósito, del molde de `envios-cp-alta-a-mano.test.ts`: acá no se prueba
 * comportamiento —eso ya está probado— sino que la pantalla siga dibujando lo que el núcleo decide.
 */

const raiz = join(__dirname, '..')
const pantalla = readFileSync(join(raiz, 'components/envios/Envios.tsx'), 'utf8')

/** El componente de la columna «Pago del envío», que se monta en la bandeja Y en la hoja del día. */
const pago = pantalla.slice(pantalla.indexOf('function PagoDelEnvio('), pantalla.indexOf('function QuienCobro('))

/** La columna «Precio del envío»: el input, la propuesta del mapa, y nada más. */
const cotizar = pantalla.slice(pantalla.indexOf('function Cotizar('), pantalla.indexOf('function MontoEnFila('))

describe('🔴 bonificar, en la columna del pago', () => {
  it('los dos bloques existen (si esto falla, el test se quedó mirando un archivo que se movió)', () => {
    expect(pago).not.toBe('')
    expect(cotizar).not.toBe('')
  })

  it('🔴 el botón de bonificar lo dibuja la columna del PAGO', () => {
    expect(pago).toContain('marcarBonificado')
  })

  it('🔴 y despacha por `campo`: sin esa rama, «Bonificar» marca el envío como PAGO', () => {
    expect(pago).toMatch(/campo\s*===\s*'pagado'/)
    expect(pago).toContain('marcarPagado')
  })

  // 🔑 La columna del precio pregunta cuánto sale el reparto. Quién lo paga es la otra.
  it('🔴 la columna del precio no bonifica nada', () => {
    expect(cotizar).not.toMatch(/[Bb]onific/)
  })

  it('no quedó una segunda puerta suelta en la pantalla', () => {
    expect(pantalla).not.toContain('function Bonificar(')
  })

  // 🔑 **`donde` es un prop y no dos booleanos.** La pastilla y el botón de bonificar se apagan en el
  // mismo lugar y por la misma razón; con dos flags sueltos un llamador nuevo los pasa cruzados y
  // queda una pantalla que no es ni la bandeja ni la hoja.
  it('🔴 cada pantalla se monta diciendo cuál es', () => {
    expect(pantalla).toContain('<PagoDelEnvio envio={e} onGuardado={recargar} donde="hoja" />')
    expect(pantalla).toContain('<PagoDelEnvio envio={e} onGuardado={onRecargar} donde="bandeja" />')
    // Y la decisión de qué se ofrece la toma el núcleo, no el JSX: acá sólo se le dice dónde está.
    expect(pago).toContain('pagoDelEnvio(envio, enLaBandeja)')
    expect(pago).not.toMatch(/acciones\.filter/)
  })

  // 🔴 En `ghost` no tienen borde ni fondo: se leen como texto suelto y no como algo que se pueda
  // apretar. Lo dijo Bruno mirando la bandeja, donde son dos seguidos y la columna queda una lista
  // de frases. Un botón que no parece un botón es una función que no existe.
  it('🔴 los botones parecen botones', () => {
    expect(pago).toContain('variant="outline"')
    expect(pago).not.toContain('variant="ghost"')
  })
})

/**
 * 🔴 **La hora de la entrega la escriben DOS handlers, y ninguno la decide.**
 *
 * `selloDeEntrega` ya tiene sus tests: entregado pone la hora, cualquier otro estado la borra. Lo que
 * esos tests no pueden ver es que los dos lados la llamen — y el modo de falla es el de siempre en
 * este módulo: un `if` copiado que escribe la hora pero **no la limpia** al volver atrás, o un handler
 * que se olvida del sello y deja la mitad de las entregas sin hora sin que nada falle.
 */
describe('🔴 el sello de la entrega, en los dos handlers', () => {
  const interno = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')
  const portal = readFileSync(join(raiz, 'api/_cadete.js'), 'utf8')
  const nucleo = readFileSync(join(raiz, 'lib/envios/portal.core.js'), 'utf8')

  it('🔴 la pantalla interna sella con la función compartida, no con un `if` propio', () => {
    expect(interno).toContain('selloDeEntrega(b.estado, ahora)')
    expect(interno).not.toMatch(/entregado_en:\s*(new Date|ahora)/)
  })

  it('🔴 y el portal también: la hora la pone el SERVIDOR, no el teléfono', () => {
    // El reloj del celular del cadete puede estar corrido, y una hora de entrega no se corrige después.
    expect(portal).toContain("parcheDeAccion(String(body.accion || ''), ahora)")
    expect(nucleo).toContain('selloDeEntrega(parche.estado, ahora)')
  })

  it('🔴 y la columna se PIDE: sin eso llega `undefined` y no falla nada', () => {
    // Es el modo de falla propio de esta sección: `cobrado` lo escribía el portal, el handler no lo
    // pedía, y del otro lado no se enteraba nadie.
    const reglas = readFileSync(join(raiz, 'lib/envios/reglas.core.js'), 'utf8')
    const campos = reglas.slice(reglas.indexOf('export const CAMPOS ='), reglas.indexOf('export const CAMPOS_CUENTA ='))
    expect(campos).toContain('entregado_en')
    expect(reglas.slice(reglas.indexOf('export const CAMPOS_CUENTA ='))).toContain('entregado_en')
  })
})
