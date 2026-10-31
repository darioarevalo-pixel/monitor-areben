/**
 * **El stock de una línea que ya cortó, en el ESPEJO de GN** (`inventario`) — ítem 6 del plan, la mitad «stock» de 6.4.
 *
 * POR QUÉ: ~30 lectores (conteo, Exhibición, Reposición, Liquidación, el parte, la Caja, precios…) leen `inventario`, el espejo
 * que llena el sync de GN. Desde el corte de una línea (`erp_corte`) el stock que vale es el LIBRO del motor
 * (`stock_movimiento`) y GN ya ⛔ se entera de lo que se vende ⇒ sin esto el espejo se queda congelado en el corte. Stunned
 * lo hacía sólo para ella (el viejo `scripts/stunned-erp-inventario.mjs`, por SKU `STU`); acá vale para cualquier línea: BDI el
 * 15/16-nov, Zattia el 23-nov.
 *
 * QUÉ: las filas de `inventario` de cada línea cortada se ESCRIBEN desde el libro (`scripts/erp-inventario-espejo.mjs`,
 * después del sync de GN) y el sync de GN deja de escribirlas (`scripts/lib/lineas-cortadas.mjs`).
 *
 * 🔑 Manda `erp_corte` (la regla de `lib/erp/corte.core.js`), ⛔ una llave aparte: sin corte, ⛔ se toca nada.
 * 🔑 Qué fila es de qué línea lo dice `lineaDe` (la de todo el monitor), y nada más. En BDI toda fila es BDI, con SKU o
 * sin él; en Zattia la separa el prefijo `STU`. Una fila del libro cuyo SKU diría OTRA línea ⛔ se escribe (en el espejo
 * se la confundiría con la otra) y se cuenta aparte.
 * Puro: la base vive en el script.
 */
import { lineaDe } from '../lineas.core.js'

/**
 * Los nombres de depósito como los escribe GN en el `inventario`, que es lo que buscan los lectores (`DEPOSITO` de
 * `lib/ubicaciones/cliente.ts`). 🔴 El de Zattia lleva un ESPACIO al final: `'Deposito '`. El `espejo_motor.inventario`
 * del motor lo escribe sin espacio, y copiar ese CASE (29-oct) dejó el depósito de Stunned DOBLE en el espejo: las filas
 * viejas de GN con espacio, las del libro sin él (y nadie leía las del libro). BDI (medido 31-oct): `Local`,
 * `Deposito Minorista`, `Deposito Mayorista`, sin espacios.
 */
export const DEPOSITO_DEL_ESPEJO = {
  local: 'Local',
  deposito: 'Deposito ',
  deposito_minorista: 'Deposito Minorista',
  deposito_mayorista: 'Deposito Mayorista',
  evento: 'Evento',   // el depósito activable del ERP (motor sql/058): GN ⛔ lo tiene
}
const nombresDelEspejo = new Set(Object.values(DEPOSITO_DEL_ESPEJO))

const NOMBRE_DEPOSITO = `case m.deposito ${Object.entries(DEPOSITO_DEL_ESPEJO).map(([d, n]) => `when '${d}' then '${n}'`).join(' ')}
            else m.deposito end`

/** Los niveles del libro por línea × producto × talle × depósito, para las líneas de `$1` (text[]). */
export const SQL_INVENTARIO_LINEAS = `select m.linea as linea,
       m.product_id::integer as product_id,
       p.nombre as product_name,
       m.size_id::integer as size_id,
       v.talle as size_name,
       ${NOMBRE_DEPOSITO} as store_name,
       sum(m.cantidad)::integer as available_quantity,
       v.sku,
       v.barcode
  from stock_movimiento m
  join marca ma on ma.id = m.linea
  left join producto p on p.empresa_id = ma.empresa_id and p.id = m.product_id
  left join variante v on v.empresa_id = ma.empresa_id and v.product_id = m.product_id and v.size_id = m.size_id
 where m.linea = any($1::text[])
 group by m.linea, m.product_id, m.size_id, m.deposito, p.nombre, v.talle, v.sku, v.barcode`

/**
 * ¿Esta fila de `inventario` (de la base `base`) es de una de las líneas `lineas`? La única regla: `lineaDe`.
 * @param {'bdi'|'zattia'} base @param {string[]} lineas @param {{ sku?: string | null }} fila
 */
export function esDeLineas(base, lineas, fila) {
  return (lineas || []).includes(lineaDe(base, fila && fila.sku))
}

const clave = (r) => `${r.product_id}|${r.size_id}|${r.store_name}`

/**
 * Qué escribir y qué sacar del espejo para que las filas de las líneas cortadas sean exactamente el libro.
 *
 * - `upserts`: lo del libro cuyo SKU dice su misma línea (`lineaDe(base, sku) === linea`); el resto se cuenta en `sinSku`.
 * - `borrar`: filas de esas líneas en el espejo que el libro no tiene y MIENTEN: con stock (lo viejo de GN que quedó
 *   colgado) o en un depósito que el libro no escribe (un nombre mal copiado). Las colgadas EN 0 se dejan: dicen lo mismo
 *   que el libro y siguen mostrando el talle (29-oct: eran 154 de 189 y hacían saltar el tope todos los días).
 * - Tope: si habría que sacar más de la mitad de las filas CON STOCK de esas líneas, ⛔ no se saca nada y se avisa (algo
 *   raro leyendo el libro).
 *
 * @param {'bdi'|'zattia'} base @param {string[]} lineas las que cortaron
 * @param {Array<any>} libro filas de `SQL_INVENTARIO_LINEAS` (con `linea`)
 * @param {Array<{product_id:number,size_id:number,store_name:string,sku?:string|null,available_quantity?:number|null}>} espejo
 *   el `inventario` de la base (entero o ya filtrado: se filtra igual)
 */
export function planInventarioErp(base, lineas, libro, espejo) {
  if (!Array.isArray(lineas)) throw new Error('planInventarioErp: faltan las líneas cortadas.')
  const deLaLinea = (libro || []).filter((r) => lineas.includes(r.linea) && lineaDe(base, r.sku) === r.linea)
  const sinSku = (libro || []).length - deLaLinea.length
  const upserts = deLaLinea.map(({ linea, ...r }) => ({ ...r, available_quantity: Number(r.available_quantity) || 0 }))
  const delLibro = new Set(upserts.map(clave))
  const espejoDeLineas = (espejo || []).filter((r) => esDeLineas(base, lineas, r))
  const conStock = (r) => (Number(r.available_quantity) || 0) !== 0
  const mienten = espejoDeLineas.filter((r) => !delLibro.has(clave(r)) && (conStock(r) || !nombresDelEspejo.has(r.store_name)))
  const espejoConStock = espejoDeLineas.filter(conStock).length
  const sacaConStock = mienten.filter(conStock).length
  const frena = sacaConStock > 0 && sacaConStock > espejoConStock * 0.5
  return {
    upserts,
    borrar: frena ? [] : mienten,
    sinSku,
    espejoDeLineas: espejoDeLineas.length,
    frenoLimpieza: frena ? `sacaría ${sacaConStock} de ${espejoConStock} filas con stock de ${lineas.join(', ')}` : null,
  }
}
