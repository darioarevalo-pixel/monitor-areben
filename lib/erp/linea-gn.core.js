/**
 * La LÍNEA de una venta del espejo de Gestión Nube (`ventas` de la base de Zattia), en SQL, para las puertas del ERP que
 * leen por pg (Bruno, 30-oct: «cada marca ve sus propias ventas»). Las del motor ⛔ lo necesitan: `venta.marca` ya es la línea.
 *
 * 🔑 `venta_detalles` ⛔ tiene SKU: se cruza con `productos` y la regla es la de `skuParaLinea` + `esStunned`
 * (`lib/lineas.core.js`): SKU que empieza con STU, y SÓLO si el SKU falta, el proveedor STUNNED (el drop del 7-sep entró
 * sin SKU y un mes se contó como Zattia). Esto es su espejo en SQL; los dos los fija `tests/erp-linea-gn.test.ts`.
 *
 * Dos criterios, los que ya usa el repo:
 * - `lista` (clientes, compras): la venta entra en la línea si tiene AL MENOS un renglón de ella (`filtrarPorLinea`):
 *   una mixta sale en las dos. La que ⛔ tiene renglones es de Zattia (Stunned es por producto; ⛔ hay con qué ponerla ahí).
 * - `factura` (una venta es UNA factura): de Stunned sólo si TODOS sus renglones son STU; la mixta y la vacía, de Zattia.
 */

/** Un renglón (`vd` con su producto `p`, por left join) es de Stunned. */
export const SQL_RENGLON_STU = `(coalesce(p.sku, '') ilike 'stu%' or (coalesce(p.sku, '') = '' and upper(trim(coalesce(p.proveedor, ''))) = 'STUNNED'))`

/**
 * El CTE `linea_gn(sale_id, tiene_stu, tiene_otra)`: una pasada sobre los renglones, ⛔ un `exists` por venta.
 * Va con `with` al principio de la consulta; la venta se cruza con `left join linea_gn lg on lg.sale_id = v.id`.
 */
export const SQL_CTE_LINEA_GN = `linea_gn as (
  select vd.sale_id, bool_or(${SQL_RENGLON_STU}) as tiene_stu, bool_or(not ${SQL_RENGLON_STU}) as tiene_otra
    from venta_detalles vd left join productos p on p.id = vd.product_id
   group by vd.sale_id)`

/**
 * La condición sobre `lg` (el CTE cruzado) para que una venta sea de `linea`.
 * @param {'zattia' | 'stunned'} linea
 * @param {'lista' | 'factura'} criterio
 */
export function sqlVentaDeLinea(linea, criterio) {
  if (linea !== 'zattia' && linea !== 'stunned') throw new Error(`Línea inválida: ${linea}`)
  if (criterio === 'lista') return linea === 'stunned' ? 'coalesce(lg.tiene_stu, false)' : '(coalesce(lg.tiene_otra, false) or lg.sale_id is null)'
  if (criterio === 'factura') {
    const stu = '(coalesce(lg.tiene_stu, false) and not coalesce(lg.tiene_otra, false))'
    return linea === 'stunned' ? stu : `not ${stu}`
  }
  throw new Error(`Criterio inválido: ${criterio}`)
}

/**
 * Lo mismo en JS, para lo que ya está en memoria (renglones con el SKU de `skuParaLinea`): de qué líneas es una venta.
 * @param {Array<string | null | undefined>} skus  el SKU (ya con el respaldo del proveedor) de cada renglón
 * @param {'lista' | 'factura'} criterio
 * @returns {Array<'zattia' | 'stunned'>}
 */
export function lineasDeVenta(skus, criterio) {
  const stu = skus.some((s) => !!s && /^stu/i.test(String(s)))
  const otra = skus.some((s) => !(s && /^stu/i.test(String(s))))
  if (criterio === 'factura') return [stu && !otra ? 'stunned' : 'zattia']
  const r = []
  if (otra || !skus.length) r.push('zattia')
  if (stu) r.push('stunned')
  return r
}
