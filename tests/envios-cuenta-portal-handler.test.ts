import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **La cuenta del cadete, del lado del handler que la sirve a internet.**
 *
 * `paraElCadeteCuenta` ya tiene sus tests de verdad en `cadete-portal.test.ts`: qué sale, qué no, y
 * que el saldo se calcule sobre todos los días aunque el detalle se recorte. Lo que esos tests **no**
 * pueden ver es el orden en que el handler hace las cosas, y ahí viven los dos mutantes que importan:
 *
 * 1. **La rama de la cuenta arriba del chequeo de PIN.** Es la tentación razonable —«total, no toca la
 *    lista de envíos»— y deja el saldo, las rendiciones y las notas del local colgando de un link sin
 *    segundo factor. Es exactamente el mutante que el archivo ya documenta para la hoja del día.
 * 2. **Las columnas escritas a mano** en vez de las constantes compartidas. Una columna que no se pide
 *    llega `undefined` y **no falla nada** — es el modo de falla propio de este módulo (`cobrado`, que
 *    el portal escribía y el handler no pedía; `cp`, que el alta a mano no guardaba). Con `anulado_en`
 *    faltando, los movimientos anulados vuelven a sumar y el saldo miente sin que se rompa nada.
 *
 * Texto contra texto a propósito, del molde de `envios-cobrado-handler.test.ts`: el handler corre en
 * Node sin pasar por el compilador y acá no se prueba comportamiento sino el orden y el acuerdo.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_cadete.js'), 'utf8')

/** Dónde se rechaza un PIN que no coincide. Todo lo que arme una respuesta va después. */
const chequeoDePin = handler.indexOf("pin !== portal.pin")
/** La rama nueva: la cuenta corriente. */
const ramaDeLaCuenta = handler.indexOf("=== 'cuenta'")

describe('🔴 la cuenta del cadete, en el handler del portal', () => {
  it('las dos marcas existen (si esto falla, el test se quedó mirando un archivo que se movió)', () => {
    expect(chequeoDePin).toBeGreaterThan(-1)
    expect(ramaDeLaCuenta).toBeGreaterThan(-1)
  })

  it('🔴 la cuenta se arma DESPUÉS del PIN', () => {
    expect(ramaDeLaCuenta).toBeGreaterThan(chequeoDePin)
  })

  it('🔴 la respuesta pasa por `paraElCadeteCuenta`, que la arma campo por campo', () => {
    // El mutante es devolver `cuenta` tal cual: adentro viajan los movimientos crudos de la base y
    // los días se calcularon con filas que traen `cliente` y `orden_numero`.
    expect(handler).toContain('paraElCadeteCuenta(cuenta, hoyAR)')
    expect(handler).not.toMatch(/json\(\{\s*ok:\s*true,\s*cuenta\s*\}/)
  })

  it('🔴 la cuenta la calcula la implementación compartida, no una copia de acá', () => {
    // Copiarla en el handler es lo que este módulo prohíbe: el saldo del teléfono, el de la pantalla
    // y el del recibo impreso salen de una sola implementación o un día se contradicen.
    expect(handler).toContain("from '../lib/envios/reglas.core.js'")
    expect(handler).toContain('cuentaDelCadete(')
    expect(handler).not.toContain('function cuentaDelCadete')
  })

  it('🔴 las columnas salen de las constantes compartidas, no escritas a mano', () => {
    expect(handler).toContain('select(CAMPOS_CUENTA)')
    expect(handler).toContain('select(CAMPOS_MOVIMIENTO)')
  })

  // 🔑 Es de sólo lectura y ésa es la mitad de su seguridad: lo único que el portal escribe sigue
  // siendo la lista cerrada de cuatro parches, y ninguno toca la cuenta.
  it('desde la cuenta no se escribe nada', () => {
    const rama = handler.slice(ramaDeLaCuenta, handler.indexOf("if (req.method === 'GET') {", ramaDeLaCuenta))
    expect(rama).not.toContain('.update(')
    expect(rama).not.toContain('.insert(')
    expect(rama).not.toContain('.upsert(')
  })
})
