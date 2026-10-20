/**
 * ERP › Ventas › anular y DESARMAR (contrato-venta.md §17, 37a): la regla de la pantalla, sin base ni React.
 * - Qué le pasa a la prenda al anular, dicho como lo lee el local (`vueltaDe` del motor decide; acá sólo el texto).
 * - El ESCANEO del desarme: cada prenda del paquete se escanea (código de barras o SKU) contra las prendas de la venta;
 *   recién con TODAS contadas se confirma la vuelta (`confirmarVuelta`) y el libro las suma.
 */

/** El código como lo comparamos: sin guiones ni espacios y en mayúsculas («rbt-0151» = «RBT0151»). */
export const codigoNormal = (x) => String(x ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')

/**
 * Qué pasa con las prendas al anular, según adónde está el pedido (`vuelta` del motor: 'ya' | 'a_desarmar' | 'a_recibir').
 * @param {string} vuelta @param {{ deposito: string, prueba: boolean }} v
 */
export function textoDeVuelta(vuelta, { deposito, prueba }) {
  if (prueba) return 'Es de prueba: el stock del libro no se mueve.'
  if (vuelta === 'a_desarmar') return `El pedido ya está empaquetado: queda «A desarmar». Las prendas vuelven al stock de ${deposito} cuando se escanea el desarme.`
  if (vuelta === 'a_recibir') return `El pedido ya salió: es una DEVOLUCIÓN. Queda «A recibir» y las prendas vuelven al stock de ${deposito} cuando llegan y se escanean.`
  return `Las prendas vuelven al stock de ${deposito} al instante.`
}

/**
 * Las prendas a escanear: una por línea vendida (las devueltas en un cambio ⛔: ya volvieron por el cambio).
 * @param {Array<{ id: string, cantidad: number, sku?: string | null, codigo?: string | null }>} lineas
 */
export function prendasADesarmar(lineas) {
  return lineas.filter((l) => l.cantidad > 0).map((l) => ({ id: l.id, cantidad: l.cantidad - Number(/** @type {any} */ (l).cambiado || 0), codigos: [l.codigo, l.sku].map(codigoNormal).filter(Boolean) }))
    .filter((p) => p.cantidad > 0)
}

/**
 * Un escaneo: suma 1 a la primera prenda de ese código que todavía falte. Devuelve los contados nuevos y qué pasó
 * (`ok` · `no_es` = esa prenda no es de esta venta · `de_mas` = ya están todas las de ese código).
 * @param {ReturnType<typeof prendasADesarmar>} prendas @param {Record<string, number>} contados @param {string} codigo
 */
export function escanear(prendas, contados, codigo) {
  const c = codigoNormal(codigo)
  const delCodigo = prendas.filter((p) => c && p.codigos.includes(c))
  if (!delCodigo.length) return { contados, resultado: 'no_es' }
  const falta = delCodigo.find((p) => (contados[p.id] || 0) < p.cantidad)
  if (!falta) return { contados, resultado: 'de_mas', id: delCodigo[0].id }
  return { contados: { ...contados, [falta.id]: (contados[falta.id] || 0) + 1 }, resultado: 'ok', id: falta.id }
}

/** Cuántas unidades faltan escanear (0 = se puede confirmar). */
export function faltanEscanear(prendas, contados) {
  return prendas.reduce((s, p) => s + Math.max(0, p.cantidad - (contados[p.id] || 0)), 0)
}
