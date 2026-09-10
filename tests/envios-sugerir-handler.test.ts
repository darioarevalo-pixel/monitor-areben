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
 *    🔑 **Desde que también se cotiza una dirección suelta, ese orden vive en `cotizarPuntos`** y no
 *    adentro de esta acción: dos llamadores con dos copias serían dos órdenes que hay que corregir
 *    juntos, y corregir uno solo es el modo de falla que esta sección ya se comió con `cobrado`. Así
 *    que acá se afirma que la acción **usa** el helper, y el orden se afirma sobre el helper —una
 *    sola vez, en el lugar donde de verdad está—.
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

  it('🔴 no geocodifica por su cuenta: delega en `cotizarPuntos`, que es donde vive el orden', () => {
    expect(bloque).toContain('cotizarPuntos(aPreguntar, zonas)')
    // Si vuelve a llamar al geocoder desde acá, es que alguien recreó la copia que este helper vino
    // a borrar — y entonces hay dos órdenes, y sólo uno testeado.
    expect(bloque).not.toContain('geocodificarEnEscalera(')
  })

  it('🔴 y no pierde la clave: la sugerencia sale con el `id` de la fila que se preguntó', () => {
    // `cotizarPuntos` devuelve `clave`; mapearla mal deja a cada fila con la propuesta de otra, que
    // es el corrimiento de un lugar que `alinear` existe para hacer imposible del otro lado.
    expect(bloque).toMatch(/const \{ clave, \.\.\.resto \}/)
    expect(bloque).toContain('sugerencias.push({ id: clave, ...resto })')
  })

  // Sin esto el motivo de `localidad_dudosa` sale genérico («no coinciden») y pierde los dos nombres,
  // que es lo único que le permite a quien cotiza resolverlo en diez segundos.
  it('🔴 arma el motivo con `motivoDeSugerencia` y le pasa la sugerencia entera', () => {
    expect(bloque).toContain('motivoDeSugerencia(c.estado, c)')
    expect(bloque).not.toContain('MOTIVO_SUGERENCIA[c.estado]')
  })
})
