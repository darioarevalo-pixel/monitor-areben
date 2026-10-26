/**
 * **El stock de Stunned del ERP, con la forma del `inventario` de GN.**
 *
 * Stunned es una línea `STU…` adentro del `inventario` de Zattia y ~30 lectores (conteo, Exhib, Reposición, parte,
 * Caja, precios…) leen esa tabla. El día del corte el stock STU de GN pasa a 0 y el que vale es el LIBRO del motor
 * (`stock_movimiento`, línea `stunned`). En vez de tocar cada lector, las filas STU de `inventario` se ESCRIBEN desde el
 * libro (`scripts/stunned-erp-inventario.mjs`, después del sync de GN) y el sync de GN deja de escribirlas.
 *
 * 🔑 Llave `LECTURAS_STUNNED_ERP=1` (la misma de las ventas): APAGADA hasta el corte. Apagada, nada de esto corre.
 * ⛔ Nunca toca filas que no sean STU: `esFilaStunned` es la ÚNICA regla (la de `lineaDe`, la de todo el monitor).
 */
import { lineaDe } from '../lineas.core.js'

/** ¿La fila de `inventario` es de Stunned? La misma regla que el resto del monitor (prefijo `STU` del SKU). */
export function esFilaStunned(fila) {
  return lineaDe('zattia', fila && fila.sku) === 'stunned'
}

/** Los niveles del libro por producto × talle × depósito, con el nombre del depósito como lo escribe GN (mismo CASE que `espejo_motor.inventario`). */
export const SQL_INVENTARIO_STUNNED = `select m.product_id::integer as product_id,
       p.nombre as product_name,
       m.size_id::integer as size_id,
       v.talle as size_name,
       case m.deposito when 'local' then 'Local' when 'deposito' then 'Deposito'
            when 'deposito_minorista' then 'Deposito Minorista' when 'deposito_mayorista' then 'Deposito Mayorista'
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

const clave = (r) => `${r.product_id}|${r.size_id}|${r.store_name}`

/**
 * Qué escribir y qué sacar del espejo para que sus filas STU sean exactamente el libro.
 *
 * - `upserts`: todo lo del libro (con SKU: una fila sin SKU ⛔ se podría confundir con otra línea, se cuenta aparte).
 * - `borrar`: filas STU del espejo que el libro ya no tiene (stock viejo de GN que quedó colgado).
 * - Tope: si habría que borrar más de la mitad de las filas STU del espejo, ⛔ no se borra y se avisa (algo raro leyendo el libro).
 *
 * @param {Array<any>} libro filas de `SQL_INVENTARIO_STUNNED` @param {Array<{product_id:number,size_id:number,store_name:string,sku?:string|null}>} espejoStu
 */
export function planDeInventario(libro, espejoStu) {
  const conSku = (libro || []).filter((r) => r.sku)
  const sinSku = (libro || []).length - conSku.length
  const upserts = conSku.map((r) => ({ ...r, available_quantity: Number(r.available_quantity) || 0 }))
  const delLibro = new Set(upserts.map(clave))
  const colgadas = (espejoStu || []).filter((r) => !delLibro.has(clave(r)))
  const frena = (espejoStu || []).length > 0 && colgadas.length > (espejoStu || []).length * 0.5
  return { upserts, borrar: frena ? [] : colgadas, sinSku, frenoLimpieza: frena ? `borraría ${colgadas.length} de ${espejoStu.length} filas STU` : null }
}
