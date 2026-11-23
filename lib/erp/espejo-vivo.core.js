/**
 * **El espejo EN VIVO**: la copia del ERP al espejo (`productos`, `inventario`, `ventas`) cada 10 minutos, además de la
 * de la noche. Bruno, 23-nov: «en vivo seria ideal» (el ETL, Ubicaciones, la Caja y el buscador veían el día de ayer).
 *
 * POR QUÉ ESTO Y NO MÁS: la copia de la noche reescribe TODO (3.000 productos, 4.000 filas de stock, cada venta desde el
 * corte). Hacer eso cada 10 minutos son millones de filas al mes que no cambiaron, y crece con cada venta. La vuelta de
 * 10 minutos escribe sólo lo que CAMBIÓ; la de la noche sigue entera y es la que arregla cualquier cosa que esta se pierda.
 *
 * 🔑 Las reglas (qué fila va, qué precio, qué depósito, qué se saca) son las de la noche: `productos-espejo.core.js`,
 * `inventario-espejo.core.js`, `ventas-espejo.core.js`. Acá sólo se decide QUÉ PARTE del plan se escribe.
 * Puro: la base vive en `scripts/lib/erp-espejo-copias.mjs`.
 */

/** Un valor comparable: números por valor (`'10.00'` = 10), fechas por instante, vacío = null. */
function comparable(x) {
  if (x == null || x === '') return null
  if (typeof x === 'number' || typeof x === 'boolean') return x
  const s = String(x)
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    // 🔴 `productos.updated_at` del espejo es SIN zona (`…33.609`, lo que se escribió en UTC): sin la Z, `Date.parse` lo lee
    // en la hora de la máquina y los 545 productos de BDI «cambiaban» en cada vuelta (medido 23-nov, en seco).
    const t = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`)
    if (!Number.isNaN(t)) return t
  }
  return s
}

/**
 * Las filas de `nuevas` que el espejo ⛔ tiene, o que tiene con otro valor en alguno de los `campos` que se escriben.
 * @template T
 * @param {T[]} nuevas lo que la copia escribiría
 * @param {Array<Record<string, unknown>>} espejo lo que hoy tiene el espejo (con esos campos)
 * @param {(r: any) => string} clave
 * @param {string[]} campos los que la copia escribe (y sólo esos se comparan)
 * @returns {T[]}
 */
export function filasQueCambian(nuevas, espejo, clave, campos) {
  if (!Array.isArray(campos) || !campos.length) throw new Error('filasQueCambian: faltan los campos a comparar.')
  const hoy = new Map((espejo || []).map((r) => [clave(r), r]))
  return (nuevas || []).filter((n) => {
    const e = hoy.get(clave(n))
    if (!e) return true
    return campos.some((c) => c in /** @type {any} */ (n) && comparable(/** @type {any} */ (n)[c]) !== comparable(e[c]))
  })
}

/** El día de Argentina (YYYY-MM-DD) `dias` antes de `ahora`. */
export function diaAR(ahora, dias = 0) {
  return new Date(ahora.getTime() - 3 * 3600_000 - dias * 86400_000).toISOString().slice(0, 10)
}

/**
 * De un plan de ventas (`planVentasErp`), la parte que va cada 10 minutos: las ventas que el espejo ⛔ tiene y las de
 * `desde` en adelante (una de hoy puede cambiar de estado o de pago), con sus renglones. Lo que se SACA va entero: son
 * anuladas y el tope del plan ya lo frenó si eran demasiadas.
 * 🔑 Una corrección de una venta vieja (de antes de `desde`) entra a la noche, como hasta hoy.
 * @param {{ ventas: any[], detalles: any[], sacarVentas: number[], sacarDetalles: number[], freno: string | null }} plan
 * @param {number[]} idsEspejo los ids de ventas del ERP que hoy tiene el espejo
 * @param {string} desde YYYY-MM-DD (día de Argentina)
 */
export function ventasRecientes(plan, idsEspejo, desde) {
  const yaEsta = new Set((idsEspejo || []).map(Number))
  const ventas = plan.ventas.filter((v) => !yaEsta.has(Number(v.id)) || String(v.date_sale ?? '').slice(0, 10) >= desde)
  const ids = new Set(ventas.map((v) => Number(v.id)))
  return { ...plan, ventas, detalles: plan.detalles.filter((d) => ids.has(Number(d.sale_id))) }
}

/** Los campos que la copia de stock escribe en `inventario` (los de `SQL_INVENTARIO_LINEAS` sin `linea`). */
export const CAMPOS_INVENTARIO = ['product_name', 'size_name', 'available_quantity', 'sku', 'barcode']
export const claveInventario = (r) => `${r.product_id}|${r.size_id}|${r.store_name}`

/** Los campos que la copia de catálogo escribe en `productos` de un producto que ya está (`planProductosErp`). */
export const CAMPOS_PRODUCTOS = ['name', 'category', 'retailer_price', 'wholesaler_price', 'unit_cost', 'active', 'updated_at', 'proveedor']
export const claveProducto = (r) => String(Number(r.id))
