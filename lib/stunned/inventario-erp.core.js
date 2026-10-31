/**
 * **El stock de Stunned del ERP, con la forma del `inventario` de GN.**
 *
 * Stunned es una línea `STU…` adentro del `inventario` de Zattia y ~30 lectores (conteo, Exhib, Reposición, parte,
 * Caja, precios…) leen esa tabla. El día del corte el stock STU de GN pasa a 0 y el que vale es el LIBRO del motor
 * (`stock_movimiento`, línea `stunned`). En vez de tocar cada lector, las filas STU de `inventario` se ESCRIBEN desde el
 * libro (`scripts/erp-inventario-espejo.mjs`, después del sync de GN) y el sync de GN deja de escribirlas.
 *
 * 🔑 Desde el 31-oct lo manda `erp_corte` para TODAS las líneas: el genérico es `lib/erp/inventario-espejo.core.js`.
 * ⛔ Nunca toca filas que no sean STU: `esFilaStunned` es la ÚNICA regla (la de `lineaDe`, la de todo el monitor).
 */
import { lineaDe } from '../lineas.core.js'
import { DEPOSITO_DEL_ESPEJO, planInventarioErp } from '../erp/inventario-espejo.core.js'

/** ¿La fila de `inventario` es de Stunned? La misma regla que el resto del monitor (prefijo `STU` del SKU). */
export function esFilaStunned(fila) {
  return lineaDe('zattia', fila && fila.sku) === 'stunned'
}

/** Los nombres de depósito del espejo: viven en `lib/erp/inventario-espejo.core.js` (la regla de todas las líneas). */
export { DEPOSITO_DEL_ESPEJO }

/** Los niveles del libro por producto × talle × depósito, con el nombre del depósito de `DEPOSITO_DEL_ESPEJO`. */
export const SQL_INVENTARIO_STUNNED = `select m.product_id::integer as product_id,
       p.nombre as product_name,
       m.size_id::integer as size_id,
       v.talle as size_name,
       case m.deposito ${Object.entries(DEPOSITO_DEL_ESPEJO).map(([d, n]) => `when '${d}' then '${n}'`).join(' ')}
            else m.deposito end as store_name,
       sum(m.cantidad)::integer as available_quantity,
       v.sku as sku,
       v.barcode as barcode
  from stock_movimiento m
  join marca ma on ma.id = m.linea
  left join producto p on p.empresa_id = ma.empresa_id and p.id = m.product_id
  left join variante v on v.empresa_id = ma.empresa_id and v.product_id = m.product_id and v.size_id = m.size_id
 where m.linea = 'stunned'
 group by m.product_id, m.size_id, m.deposito, p.nombre, v.talle, v.sku, v.barcode`

/**
 * El stock de UNA variante de una línea que ya está en el ERP, en el libro, para la Caja (prueba del corte de Stunned, 28-oct:
 * tras la venta #25 del ERP el POS seguía diciendo «ÚLTIMA» porque leía GN en vivo, y GN ⛔ se entera de una venta del ERP).
 * `$3` = la línea. Depósitos: `local` (percha + atrás) y el que repone al local —`deposito` en Zattia, `deposito_minorista`
 * en BDI (motor sql/006a; el mismo que la Caja lee de GN, `lib/caja/marcas.core.js`)—; el Mayorista de BDI ⛔ cuenta.
 */
export const SQL_STOCK_VARIANTE_LIBRO = `select case deposito when 'deposito_minorista' then 'deposito' else deposito end as deposito, sum(cantidad)::integer as n
  from stock_movimiento
 where linea = $3 and product_id = $1 and size_id = $2 and deposito in ('local', 'deposito', 'deposito_minorista', 'evento')
 group by 1`

/** Las filas de `SQL_STOCK_VARIANTE_LIBRO` con la forma del stock de la Caja. */
export function stockDeVarianteLibro(filas) {
  const de = (d) => (filas || []).filter((f) => f.deposito === d).reduce((t, f) => t + Number(f.n || 0), 0)
  return { local: de('local'), deposito: de('deposito'), evento: de('evento') }
}

/**
 * Qué escribir y qué sacar del espejo para que sus filas STU sean exactamente el libro: el plan de todas las líneas
 * (`planInventarioErp`) con la línea `stunned`. Queda por sus tests, que prueban que el genérico hace lo mismo.
 * @param {Array<any>} libro filas de `SQL_INVENTARIO_STUNNED` @param {Array<any>} espejoStu
 */
export function planDeInventario(libro, espejoStu) {
  const { upserts, borrar, sinSku, frenoLimpieza } = planInventarioErp('zattia', ['stunned'], (libro || []).map((r) => ({ ...r, linea: 'stunned' })), espejoStu)
  return { upserts, borrar, sinSku, frenoLimpieza }
}
