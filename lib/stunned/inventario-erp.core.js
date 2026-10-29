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

/**
 * Los nombres de depósito como los escribe GN en el `inventario` de Zattia, que es lo que buscan los lectores
 * (`DEPOSITO` de `lib/ubicaciones/cliente.ts`). 🔴 El de Zattia lleva un ESPACIO al final: `'Deposito '`. El
 * `espejo_motor.inventario` del motor lo escribe sin espacio, y copiar ese CASE (29-oct) dejó el depósito de Stunned
 * DOBLE en el espejo: las filas viejas de GN con espacio, las del libro sin él (y nadie leía las del libro).
 */
export const DEPOSITO_DEL_ESPEJO = {
  local: 'Local',
  deposito: 'Deposito ',
  deposito_minorista: 'Deposito Minorista',
  deposito_mayorista: 'Deposito Mayorista',
}
const nombresDelEspejo = new Set(Object.values(DEPOSITO_DEL_ESPEJO))

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
 * El stock de UNA variante de Stunned en el libro, para la Caja (prueba del corte, 28-oct: tras la venta #25 del ERP
 * el POS seguía diciendo «ÚLTIMA» porque leía GN en vivo, y GN ⛔ se entera de una venta del ERP).
 * Depósitos canónicos de Zattia: `local` (percha + atrás) y `deposito` (el de afuera, sólo repone).
 */
export const SQL_STOCK_VARIANTE_STUNNED = `select deposito, sum(cantidad)::integer as n
  from stock_movimiento
 where linea = 'stunned' and product_id = $1 and size_id = $2 and deposito in ('local', 'deposito')
 group by deposito`

/** Las filas de `SQL_STOCK_VARIANTE_STUNNED` con la forma del stock de la Caja. */
export function stockDeVarianteStunned(filas) {
  const de = (d) => (filas || []).filter((f) => f.deposito === d).reduce((t, f) => t + Number(f.n || 0), 0)
  return { local: de('local'), deposito: de('deposito') }
}

const clave = (r) => `${r.product_id}|${r.size_id}|${r.store_name}`

/**
 * Qué escribir y qué sacar del espejo para que sus filas STU sean exactamente el libro.
 *
 * - `upserts`: todo lo del libro (con SKU: una fila sin SKU ⛔ se podría confundir con otra línea, se cuenta aparte).
 * - `borrar`: filas STU del espejo que el libro no tiene y MIENTEN: con stock (lo viejo de GN que quedó colgado) o en
 *   un depósito que el libro no escribe (un nombre mal copiado). Las colgadas EN 0 se dejan: dicen lo mismo que el
 *   libro y siguen mostrando el talle (29-oct: eran 154 de 189 y hacían saltar el tope todos los días).
 * - Tope: si habría que sacar más de la mitad de las filas STU CON STOCK del espejo, ⛔ no se saca nada y se avisa
 *   (algo raro leyendo el libro).
 *
 * @param {Array<any>} libro filas de `SQL_INVENTARIO_STUNNED` @param {Array<{product_id:number,size_id:number,store_name:string,sku?:string|null,available_quantity?:number|null}>} espejoStu
 */
export function planDeInventario(libro, espejoStu) {
  const conSku = (libro || []).filter((r) => r.sku)
  const sinSku = (libro || []).length - conSku.length
  const upserts = conSku.map((r) => ({ ...r, available_quantity: Number(r.available_quantity) || 0 }))
  const delLibro = new Set(upserts.map(clave))
  const conStock = (r) => (Number(r.available_quantity) || 0) !== 0
  const mienten = (espejoStu || []).filter((r) => !delLibro.has(clave(r)) && (conStock(r) || !nombresDelEspejo.has(r.store_name)))
  const espejoConStock = (espejoStu || []).filter(conStock).length
  const sacaConStock = mienten.filter(conStock).length
  const frena = sacaConStock > 0 && sacaConStock > espejoConStock * 0.5
  return { upserts, borrar: frena ? [] : mienten, sinSku, frenoLimpieza: frena ? `sacaría ${sacaConStock} de ${espejoConStock} filas STU con stock` : null }
}
