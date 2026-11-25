/**
 * **Reposición lee DIRECTO de Areben Gestión** (Darío, 25-nov-2026: «¿por qué tendría en cuenta la copia si ahora es 100 %
 * nuestros los datos?»). Puro: el handler (`api/_reposicion-erp.js`) corre estas consultas y esto arma la respuesta.
 *
 * POR QUÉ: hasta acá la pantalla leía el ESPEJO de GN (`inventario`, `ventas`, `venta_detalles`), que desde el corte de cada
 * línea lo escriben una vez por día los pasos «del ERP al espejo» del sync de la mañana. Dos agujeros:
 *  - el stock era el de la mañana: un armado, una venta o un ingreso del día ⛔ se veía hasta el otro día;
 *  - la pantalla sabía «hay datos nuevos» por `sync_state`, que esos pasos ⛔ escriben (BDI quedó en el 14-nov, Zattia en el
 *    22-nov): la hora de «Stock …» mentía, la foto guardada en la compu ⛔ se renovaba en el día y «Actualizar stock» de
 *    Zattia esperaba 10 min un aviso que nunca llegaba.
 * Ahora el stock sale del LIBRO (`stock_movimiento`) y las ventas de `venta` en el momento.
 *
 * 🔑 Stock: la misma consulta y el mismo filtro que escriben el espejo (`SQL_INVENTARIO_LINEAS` + `planInventarioErp`,
 *    `lib/erp/inventario-espejo.core.js`) ⇒ mismas filas, mismos nombres de depósito (`'Deposito '` de Zattia con espacio).
 * 🔑 Ventas: cada venta vive en UN sistema (la regla de `lib/erp/ventas-espejo.core.js`): lo traído de GN (`gn_sale_id`)
 *    ANTES del corte de su línea ∪ lo nacido en el ERP (`gn_sale_id` nulo) DESPUÉS. ⛔ las `prueba` (copias de la Caja
 *    antes del corte) ni las anuladas. Medido 25-nov contra el espejo: 7 días idéntico en las dos bases; 60 días, BDI
 *    1352 vs 1330 unidades y Zattia 3807 vs 3802 (lo que el espejo perdió en ediciones y anulaciones de GN).
 * 🔑 Canales: los mismos que leía `ventasLocal` — BDI sólo el local; Zattia local + online (el online se despacha del local).
 */
import { planInventarioErp } from '../erp/inventario-espejo.core.js'

/** Los canales de `venta.canal` que descuentan del Local, por base. */
export const CANALES_LOCAL = { bdi: ['local'], zattia: ['local', 'online'] }

/** Techo de días que se puede pedir (la config usa 60; más es un error de carga). */
export const MAX_DIAS = 180

/**
 * Las ventanas pedidas (`?dias=7,60`): enteros 1..MAX_DIAS, sin repetir, a lo sumo 4. Inválido ⇒ `null`.
 * @param {unknown} q
 * @returns {number[] | null}
 */
export function leerDias(q) {
  const partes = String(q ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!partes.length || partes.length > 4) return null
  const dias = []
  for (const p of partes) {
    if (!/^\d+$/.test(p)) return null
    const n = Number(p)
    if (n < 1 || n > MAX_DIAS) return null
    if (!dias.includes(n)) dias.push(n)
  }
  return dias
}

/**
 * Unidades vendidas por variante (`pid_sid`) en los últimos `$2` días argentinos (hoy incluido), en los canales `$1`.
 * El día corre en hora de Argentina, como `date_sale` del espejo.
 */
export const SQL_VENTAS_LOCAL = `select l.product_id::text || '_' || l.size_id::text as vid, sum(l.cantidad)::integer as cant
  from venta v
  join venta_linea l on l.venta_id = v.id
  left join erp_corte c on c.linea = v.marca
 where not v.prueba
   and v.estado <> 'anulada'
   and v.canal = any($1::text[])
   and (v.ocurrida_en at time zone 'America/Argentina/Buenos_Aires')::date
       >= (now() at time zone 'America/Argentina/Buenos_Aires')::date - $2::integer
   and ((v.gn_sale_id is not null and (c.instante is null or v.ocurrida_en < c.instante))
     or (v.gn_sale_id is null and c.instante is not null and v.ocurrida_en >= c.instante))
 group by 1`

/** `[{ vid, cant }]` ⇒ `{ vid: cant }` (sin los ceros). */
export function mapaDeVentas(filas) {
  const out = {}
  for (const f of filas || []) {
    const n = Number(f.cant) || 0
    if (n) out[String(f.vid)] = n
  }
  return out
}

/**
 * Las filas del libro con la forma del espejo (`FilaInvRepo`), sólo las de las líneas cortadas y con el SKU de su línea.
 * @param {'bdi'|'zattia'} base @param {string[]} lineas @param {Array<any>} libro filas de `SQL_INVENTARIO_LINEAS`
 */
export function inventarioDelLibro(base, lineas, libro) {
  return planInventarioErp(base, lineas, libro, []).upserts
}
