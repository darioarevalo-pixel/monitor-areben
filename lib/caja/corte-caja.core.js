/**
 * **¿A dónde va el ticket de la Caja?** — por el CORTE de la línea (`erp_corte`), ⛔ por una llave de Stunned.
 *
 * Bruno (31-oct): «obvio, el día que sea el corte la Caja tendría que mandar al ERP las ventas de BDI y las de Zattia».
 * La regla es la de conteos, fallas, canjes y `crear-venta` (`lib/erp/corte.core.js`): una línea va al ERP desde que
 * tiene fila en `erp_corte` y el instante pasó. Cortes: Stunned 28-oct, BDI 15/16-nov, Zattia 23-nov. Sin corte ⇒ GN
 * (y la copia de prueba al motor) como siempre.
 *
 * - **La línea sale del PRODUCTO** (`productos.sku`, con el proveedor de respaldo: `skuParaLinea`), ⛔ de lo que dice la
 *   pantalla. El SKU de la variante también cuenta (hay productos de GN sin SKU propio, como `esDeStunned` de la pantalla).
 * - **Un ticket es de UNA marca** (Bruno, 26-oct): una venta del motor tiene una sola marca ⇒ el ticket que mezcla líneas
 *   y alguna ya va por el ERP se frena con «cobralas por separado». Sin ninguna línea en el ERP, mezclado va a GN como hoy.
 * - Lo que va al ERP es venta REAL (`prueba: false`): va al ERP ⇔ su línea cortó. (Reemplaza `CAJA_STUNNED_ERP` y
 *   `CAJA_STUNNED_PRUEBA`, que en producción daban lo mismo para Stunned.)
 *
 * JS plano, sin red: lo importan `api/_caja.js`, `api/_caja-motor.js`, `scripts/caja-reintentar.mjs` y los tests.
 */
import { lineaEnErp, lineasEnErp } from '../erp/corte.core.js'
import { ETIQUETA_LINEA, baseDeLinea, esLinea, esStunned, lineaDe, lineasDeMarca, skuParaLinea } from '../lineas.core.js'

/**
 * La línea de un renglón: la del producto del espejo y, en Zattia, Stunned también si el SKU de la variante es `STU`.
 * Sin el producto en el espejo, sólo el SKU del renglón.
 * @param {string} store @param {{ sku?: string | null }} renglon @param {{ sku?: string | null, proveedor?: string | null } | null | undefined} producto
 */
export function lineaDelRenglon(store, renglon, producto) {
  const delProducto = producto ? skuParaLinea(producto) : null
  if (store === 'zattia' && (esStunned(delProducto) || esStunned(renglon && renglon.sku))) return 'stunned'
  return lineaDe(store, delProducto || (renglon && renglon.sku) || null)
}

/**
 * El destino del ticket. `lineas`: la de cada renglón (`lineaDelRenglon`). `cortes` OBLIGATORIO (`{ linea: ISO }`).
 * @param {{ cortes: Record<string, string>, lineas: string[], ahora?: Date }} o
 * @returns {{ destino: 'gn' | 'erp', marca: string | null, error?: string }}
 */
export function destinoPorCorte({ cortes, lineas, ahora = new Date() }) {
  if (!cortes || typeof cortes !== 'object') throw new Error('destinoPorCorte: faltan los cortes (erp_corte).')
  const distintas = [...new Set(lineas || [])]
  const alErp = distintas.filter((l) => lineaEnErp(cortes, l, ahora))
  if (!alErp.length) return { destino: 'gn', marca: distintas.length === 1 ? distintas[0] : null }
  if (distintas.length > 1) {
    const nombres = distintas.map((l) => ETIQUETA_LINEA[l] || l).join(' y de ')
    return { destino: 'gn', marca: null, error: `Este ticket mezcla productos de ${nombres}: cobralas por separado (un ticket por marca).` }
  }
  return { destino: 'erp', marca: alErp[0] }
}

/** Las líneas de la Caja de `store` que ya venden por el ERP (para la pantalla y el cierre). */
export function lineasErpDeStore(cortes, store, ahora = new Date()) {
  return lineasEnErp(cortes, store, ahora)
}

/**
 * ¿Todas las líneas de la Caja ya estaban en el ERP en `instante`? Entonces GN ⛔ tiene ventas de ese turno: ⛔ se lo lee
 * (el día que se apague, leerlo frenaría el cierre).
 */
export function todoEnErp(cortes, store, instante) {
  const todas = lineasDeMarca(store)
  return todas.length > 0 && lineasErpDeStore(cortes, store, instante).length === todas.length
}

/**
 * La MARCA del motor de una venta de la Caja que va al ERP: la `linea` que el servidor dejó en sus renglones. Las filas
 * de antes de anotar la línea (sólo Stunned iba al ERP) ⇒ `stunned` en la Caja de Zattia.
 * @param {{ store: string, renglones?: Array<{ linea?: string | null }> }} fila @returns {string}
 */
export function marcaDeVentaErp(fila) {
  const lineas = [...new Set((fila.renglones || []).map((r) => r && r.linea).filter(Boolean))]
  if (lineas.length > 1) throw new Error(`La venta ${String(fila.id || '').slice(0, 8)} mezcla líneas (${lineas.join(', ')}): no se puede anotar en el ERP.`)
  if (lineas.length === 1) {
    const l = String(lineas[0])
    if (!esLinea(l) || baseDeLinea(l) !== fila.store) throw new Error(`La línea «${l}» no es de la Caja de ${fila.store}.`)
    return l
  }
  if (fila.store === 'zattia') return 'stunned'
  throw new Error(`La venta ${String(fila.id || '').slice(0, 8)} no dice de qué línea es: no se puede anotar en el ERP.`)
}

/**
 * La MARCA de un cambio sin venta del ERP (la venta es de Gestión Nube, o ⛔ hay ticket): la línea de lo que DEVUELVE y de lo que se
 * LLEVA (`lineaDelRenglon`, del producto), permitido sólo si esa línea ya cortó (`erp_corte`). Reemplaza a «sólo Stunned»
 * (`CAJA_STUNNED_PRUEBA`): sirve para cambiar en BDI una prenda comprada en GN antes del corte (Bruno 28-oct: 30 días de política).
 * - Un cambio es de UNA marca (Bruno, 26-oct): mezclado ⇒ error.
 * - Sin corte de esa línea ⇒ error: el cambio de esa marca se sigue haciendo en Gestión Nube.
 * - Lo que pasa es REAL (`prueba: false`): pasa ⇔ la línea cortó.
 * @param {{ cortes: Record<string, string>, devueltas: string[], nuevas: string[], ahora?: Date }} o
 * @returns {{ marca: string, error?: undefined } | { marca?: undefined, error: string }}
 */
export function marcaDelCambio({ cortes, devueltas, nuevas, ahora = new Date() }) {
  if (!cortes || typeof cortes !== 'object') throw new Error('marcaDelCambio: faltan los cortes (erp_corte).')
  const dev = [...new Set(devueltas || [])]
  if (!dev.length) return { error: 'Marcá qué producto devuelve.' }
  const todas = [...new Set([...dev, ...(nuevas || [])])]
  if (todas.length > 1) {
    const nombres = todas.map((l) => ETIQUETA_LINEA[l] || l).join(' y de ')
    return { error: `Este cambio mezcla productos de ${nombres}: un cambio es de una sola marca.` }
  }
  const l = todas[0]
  if (!lineaEnErp(cortes, l, ahora)) return { error: `Los cambios de ${ETIQUETA_LINEA[l] || l} sin venta del ERP todavía se hacen en Gestión Nube.` }
  return { marca: l }
}
