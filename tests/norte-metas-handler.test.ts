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

/**
 * 🔴 **La línea abre los objetivos y NADA más** (23-ago-2026).
 *
 * Stunned no tiene base ni permisos propios: sus filas de `norte_metas` viven en la base de Zattia
 * con `store='stunned'`, igual que las de `solicitudes`. Lo que este bloque defiende es el borde —
 * que dejar entrar la línea no haya abierto de paso la plata:
 *
 *   - **las credenciales y el permiso salen de la MARCA** (`baseDeLinea`), nunca del `store` crudo:
 *     con `cfgFor(store)` un `?store=stunned` no habría encontrado base y con `puedeVer` sobre el
 *     store crudo el permiso se evalúa contra una marca que no existe;
 *   - **la contribución, el P&L y las compras rechazan la línea**: `contribucionDe` mira la venta
 *     ENTERA de la base y `skusDe` sólo reparte en Zattia, así que un `?store=stunned` por esa rama
 *     devolvería la plata de Zattia con el rótulo de Stunned — el mismo defecto que la línea vino a
 *     matar en la pantalla de Ventas, del otro lado.
 */
describe('🔴 el store del handler es una LÍNEA, y la marca sale de ella', () => {
  it('valida contra el catálogo de líneas, sin repetir la lista', () => {
    expect(handler).toContain("from '../lib/lineas.core.js'")
    expect(handler).toContain('if (!esLinea(store))')
    // ⛔ La lista vieja escrita a mano habría dejado a Stunned afuera para siempre.
    expect(handler).not.toContain("['bdi', 'zattia'].includes(store)")
  })

  it('la marca —credenciales y permiso— sale de baseDeLinea, no del store crudo', () => {
    expect(handler).toContain('const marca = baseDeLinea(store)')
    expect(handler).toContain('const cfg = cfgFor(marca)')
    expect(handler).toContain('puedeVerAlguna(perfil, marca, secciones)')
    expect(handler).not.toContain('cfgFor(store)')
    expect(handler).not.toContain('puedeVerAlguna(perfil, store,')
  })

  it('🔴 una línea que no es su marca sólo alcanza las rutas de metas, y corta ANTES del permiso', () => {
    expect(handler).toContain('if (store !== marca && !esDeMetas)')
    // El corte va antes de mirar credenciales o base: si se colara después, la rama de la plata ya
    // habría corrido con la conexión abierta.
    expect(handler.indexOf('!esDeMetas')).toBeLessThan(handler.indexOf('const cfg = cfgFor(marca)'))
  })

  it('⛔ las metas ya NO viajan en el pedido grande: una sola puerta, y es la que sabe de líneas', () => {
    // Dos caminos a la misma tabla era el defecto en potencia: el del viaje grande no sabe de
    // líneas, así que la pantalla habría tenido que elegir a cuál creerle según la pestaña abierta.
    expect(handler.match(/from\('norte_metas'\)\s*\n?\s*\.select/g) || []).toHaveLength(1)
  })

  it('las filas se eligen por LÍNEA aunque la base sea la de la marca', () => {
    // `.eq('store', store)` y no `('store', marca)`: es lo único que separa las dos rampas, que
    // conviven en la misma tabla con la misma `key` (la PK es `(key, store)`).
    expect(handler).toContain(".eq('store', store)")
    expect(handler).not.toContain(".eq('store', marca)")
  })
})
