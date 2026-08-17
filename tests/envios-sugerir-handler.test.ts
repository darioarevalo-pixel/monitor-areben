import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **El candado tiene dos piezas que no viven en `direccion.core.js`, y las dos fallan calladas.**
 *
 * 1. **La columna `cp` en el `select`.** El código postal es la segunda señal con la que `consultaDe`
 *    caza la localidad que miente. Si no se la pide a la base, llega `undefined`, el candado la lee
 *    como «esta fila no tiene CP» y **afloja sin que falle nada**: vuelven los precios de la zona de
 *    al lado, con 200 y con cara de buenos. Es exactamente lo que ya pasó en esta sección con
 *    `cobrado` —la columna existía, el portal la escribía y faltaba en el `select` del handler—, que
 *    es el modo de falla que ningún test de lógica caza.
 * 2. **El orden de las dos vueltas de geocodificación.** Que la del código postal corra **después** y
 *    sólo sobre las que no ubicaron nada es toda la seguridad que tiene el reintento. La decisión se
 *    sacó a `pedidosDelReintento` para poder afirmarla, pero nada obliga al handler a llamarla.
 *
 * Texto contra texto a propósito, igual que `envios-cobrado-handler.test.ts` y `permisos-espejo`:
 * el handler corre en Node sin pasar por el compilador y acá no se prueba comportamiento, se prueba
 * que las dos puntas sigan de acuerdo.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')

/** El bloque de la acción, del `if` que la abre hasta el `return` del final del handler. */
const bloque = handler.slice(
  handler.indexOf("b.action === 'zonas-sugerir'"),
  handler.indexOf("return res.status(400).json({ error: 'Acción desconocida.' })"),
)

describe('🔴 la acción `zonas-sugerir` del handler', () => {
  it('existe', () => {
    expect(bloque).not.toBe('')
  })

  it('🔴 le pide `cp` a la base: sin esa columna el candado afloja y no falla nada', () => {
    expect(bloque).toMatch(/from\('envios_reparto'\)\.select\('[^']*\bcp\b[^']*'\)/)
  })

  it('🔴 la segunda vuelta la decide `pedidosDelReintento`, que sí se puede afirmar', () => {
    expect(bloque).toContain('pedidosDelReintento(aPreguntar, puntos)')
  })

  it('🔴 y corre DESPUÉS de la primera: al revés, el CP le pisa el punto a las que ya resolvieron', () => {
    const primera = bloque.indexOf('await geocodificarEnEscalera(aPreguntar)')
    const segunda = bloque.indexOf('pedidosDelReintento')
    expect(primera).toBeGreaterThan(-1)
    expect(segunda).toBeGreaterThan(primera)
  })

  // Sin esto el motivo de `localidad_dudosa` sale genérico («no coinciden») y pierde los dos nombres,
  // que es lo único que le permite a quien cotiza resolverlo en diez segundos.
  it('🔴 arma el motivo con `motivoDeSugerencia` y le pasa la sugerencia entera', () => {
    expect(bloque).toContain('motivoDeSugerencia(c.estado, c)')
    expect(bloque).not.toContain('MOTIVO_SUGERENCIA[c.estado]')
  })
})
