/**
 * **Las ventas de una línea que ya cortó, en el ESPEJO de GN** (ítem 6.4 del plan, Bruno 31-oct: «dale sí, armalo»).
 *
 * POR QUÉ: Liquidación (la foto con ventas 7/30/90 y la escalera 0 ventas ⇒ 30 %), el ETL, Reposición, Márgenes y
 * Comisiones leen `ventas` / `venta_detalles`, el espejo que llena el sync de GN. El día del corte de una línea
 * (`erp_corte`) GN deja de recibir sus ventas ⇒ sin esto, todo lo de esa línea se queda en cero ventas: la escalera la
 * pone entera al 30 %. Muerde a BDI el 15/16-nov y a Zattia el 23-nov (Stunned ya, desde el 28-oct).
 *
 * QUÉ: copia al espejo las ventas que NACIERON en el ERP (`gn_sale_id` nulo) DESPUÉS del corte de su línea, con la forma
 * de GN de las vistas del motor (`espejo_motor.ventas` / `venta_detalles`, sql/045: mismas columnas, ids desde
 * 1.000.000.000 ⇒ ⛔ chocan con GN). Es la regla del lector del dashboard del motor (`8cd03bc`): cada venta vive en UN
 * sistema ⇒ GN hasta el corte ∪ ERP después, ⛔ hueco ni doble. Antes del corte el ERP tiene COPIAS de lo de GN (la Caja
 * de Zattia nace `prueba` con su `gn_sale_id`) ⇒ ⛔ entran.
 *
 * 🔑 Manda `erp_corte` (la misma tabla que `lib/erp/corte.core.js`), ⛔ una llave aparte: sin fila de corte, ⛔ copia nada.
 * 🔑 Los que hoy SUMAN las ventas de Stunned del ERP al leer (memo, Norte, parte, Inicio) descartan las que ya estén en el
 * espejo por id (`sumarVentasDelErp`) ⇒ ⛔ se cuentan dos veces, se prenda esto antes o después.
 * 🔑 La purga de GN (`scripts/lib/purga-ventas.mjs`) ⛔ toca ids del ERP: GN ⛔ las tiene y las borraría todas las noches.
 * Una venta del ERP anulada después sale del espejo acá (con freno, como la purga de GN). Puro: la base vive en
 * `scripts/erp-ventas-espejo.mjs`.
 */

/** Desde acá son ids del ERP (sql/045 del motor: `id_espejo` arranca en 1.000.000.000). */
export const ID_DESDE_ERP = 1_000_000_000

/** ¿Este id del espejo es de una venta (o renglón) nacida en el ERP? */
export const esIdDelErp = (id) => Number(id) >= ID_DESDE_ERP

const DEL_CORTE = `join venta v on v.id_espejo = %ID% and v.gn_sale_id is null
  join erp_corte c on c.linea = v.marca and c.instante <= now() and v.ocurrida_en >= c.instante`

/** Las ventas a copiar: la vista del motor, sólo las nacidas en el ERP después del corte de su línea. */
export const SQL_VENTAS_ERP = `select e.* from espejo_motor.ventas e
  ${DEL_CORTE.replace('%ID%', 'e.id')}
 order by e.id`

/** Sus renglones. */
export const SQL_DETALLES_ERP = `select d.* from espejo_motor.venta_detalles d
  ${DEL_CORTE.replace('%ID%', 'd.sale_id')}
 order by d.sale_id, d.id`

/** Las columnas de la tabla del espejo (la de Zattia tiene menos que la de BDI: se copian sólo las que existen). */
export const SQL_COLUMNAS = `select table_name, column_name from information_schema.columns
 where table_schema = 'public' and table_name in ('ventas', 'venta_detalles')`

/** Filas que se pueden sacar aunque pasen el porcentaje (igual que la purga de GN). */
const PISO = 20

/**
 * Qué escribir y qué sacar.
 * @param {{ ventas: any[], detalles: any[] }} erp lo que dice el motor HOY
 * @param {{ ventas: number[], detalles: number[] }} espejo los ids ≥ ID_DESDE_ERP que hoy tiene el espejo
 * @param {{ ventas: string[], venta_detalles: string[] }} columnas las de cada tabla del espejo
 * @param {{ topePorc?: number }} [o]
 */
export function planVentasErp(erp, espejo, columnas, { topePorc = 0.1 } = {}) {
  if (!columnas || !columnas.ventas?.length || !columnas.venta_detalles?.length) throw new Error('planVentasErp: faltan las columnas del espejo.')
  const raras = [...(erp.ventas || []).map((v) => v.id), ...(erp.detalles || []).map((d) => d.id)].filter((id) => !esIdDelErp(id))
  if (raras.length) throw new Error(`planVentasErp: ${raras.length} filas del ERP con id de GN (< ${ID_DESDE_ERP}): ⛔ se escribe nada.`)
  const recortar = (fila, cols) => Object.fromEntries(cols.filter((c) => c in fila).map((c) => [c, fila[c]]))
  const ventas = (erp.ventas || []).map((v) => recortar(v, columnas.ventas))
  const idsVenta = new Set(ventas.map((v) => Number(v.id)))
  const detalles = (erp.detalles || []).filter((d) => idsVenta.has(Number(d.sale_id))).map((d) => recortar(d, columnas.venta_detalles))
  const idsDet = new Set(detalles.map((d) => Number(d.id)))
  const sacarVentas = (espejo.ventas || []).map(Number).filter((id) => esIdDelErp(id) && !idsVenta.has(id))
  const sacarDetalles = (espejo.detalles || []).map(Number).filter((id) => esIdDelErp(id) && !idsDet.has(id))
  const universo = (espejo.ventas || []).length
  const freno = sacarVentas.length > Math.max(PISO, universo * topePorc)
    ? `se sacarían ${sacarVentas.length} ventas del ERP de ${universo} (tope ${Math.max(PISO, Math.floor(universo * topePorc))})`
    : null
  return { ventas, detalles, sacarVentas: freno ? [] : sacarVentas, sacarDetalles: freno ? [] : sacarDetalles, freno }
}
