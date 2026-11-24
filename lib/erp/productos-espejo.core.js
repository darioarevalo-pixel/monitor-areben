/**
 * **El catálogo de una línea que ya cortó, en el ESPEJO de GN** (`productos`) — la mitad «catálogo» de lo que ya hacen
 * `inventario-espejo.core.js` (stock) y `ventas-espejo.core.js` (ventas). Bruno, 23-nov: «hay que desconectar todo de gn».
 *
 * POR QUÉ: el ETL (Liquidación, Márgenes, Comisiones, Reposición…), el buscador de artículos, Etiquetas, la Caja y los
 * costos que se estampan leen `productos`, que sólo escribía GN. Desde el corte de una línea (`erp_corte`) el catálogo, el
 * precio y el costo viven en el motor ⇒ sin esto un producto nacido en el ERP ⛔ existía para el ETL (medido 23-nov: 16 de
 * BDI y 52 de Zattia) y el precio/costo era el que GN tenía al cortar.
 *
 * QUÉ: cada producto del motor de una línea cortada se ESCRIBE en `productos` (`scripts/erp-productos-espejo.mjs`, después
 * del sync de GN). ⛔ Se borra nada: el espejo no tiene columna de línea y un producto de GN que el motor no tenga se deja.
 *
 * 🔑 LA REGLA (medida 23-nov contra el espejo, `oraculos/etl-productos-regla-vs-gn-lectura.mjs`: 0 distintos en precio,
 *    mayorista y nombre sobre 529 + 2.993 productos; lo distinto eran cambios hechos en el ERP después del corte):
 *    - `retailer_price` = la lista `online` de `precio_lista` (el precio de LISTA, el que tenía GN); si no tiene, la `local`.
 *      ⛔ `oferta` ni la `local` primero: esas siguen a lo que cobra TN con su promo (el margen se medía contra la lista).
 *    - `wholesaler_price` = la lista `mayorista`. `unit_cost` = `costo_vigente`.
 *    - 🔴 Sin valor ⇒ **0, como lo guardaba GN** (⛔ null). Medido en seco 23-nov: con null cambiaban 769 costos de Zattia de
 *      0 a «sin costo», 1.879 mayoristas y 295 precios, sin que nada hubiera cambiado ⇒ Márgenes y Liquidación se movían
 *      solos. El 0 de GN ES «no se cargó» (`docs/sync-ventas.md`: «el cero es un costo real», 769 de 2.676 en Zattia), y
 *      Etiquetas/Caja ya tratan el precio ≤ 0 como «sin precio».
 *    - `created_at` y `sku` del producto ⛔ se pisan: son los de GN (la edad del producto mueve fases y vida útil). Un
 *      producto que el espejo ⛔ tiene entra con `created_at` = `actualizado_en` del motor (el día que se cargó) y sku null
 *      (como `espejo_motor.productos`, motor sql/045).
 * 🔑 Manda `erp_corte` (la regla de `lib/erp/corte.core.js`), ⛔ una llave aparte: sin corte, ⛔ se toca nada.
 * Puro: la base vive en el script.
 */

/** Los productos del motor de las líneas de `$1` (text[]), con precio de lista, mayorista y costo vigentes. */
export const SQL_PRODUCTOS_LINEAS = `select p.id::integer as id,
       p.marca as linea,
       p.nombre,
       p.categoria,
       p.proveedor,
       p.activo,
       p.actualizado_en,
       coalesce(
         (select l.precio from precio_lista l where l.marca = p.marca and l.product_id = p.id and l.lista = 'online'),
         (select l.precio from precio_lista l where l.marca = p.marca and l.product_id = p.id and l.lista = 'local')) as precio,
       (select l.precio from precio_lista l where l.marca = p.marca and l.product_id = p.id and l.lista = 'mayorista') as mayorista,
       (select c.costo from costo_vigente c where c.marca = p.marca and c.product_id = p.id limit 1) as costo
  from producto p
 where p.marca = any($1::text[])`

/** Sin valor ⇒ 0, la convención de GN (ver arriba). */
const num = (x) => (x == null || x === '' ? 0 : Number(x))
const iso = (x) => (x == null ? null : new Date(x).toISOString())

/**
 * Qué escribir en `productos` para que las líneas cortadas tengan el catálogo del motor.
 *
 * - `existentes`: los que el espejo ya tiene ⇒ sin `created_at` ni `sku` (el upsert ⛔ los toca).
 * - `nuevos`: los que el espejo ⛔ tiene ⇒ con `created_at` = el día que se cargó en el motor y `sku` null.
 * - `proveedor` va sólo si la base lo tiene en el espejo (`conProveedor`: Zattia sí, BDI no).
 * - Freno: una línea cortada sin un solo producto en el motor ⇒ ⛔ se escribe nada y se avisa (algo raro leyendo el motor:
 *   escribir medio catálogo es peor que dejar el de ayer).
 *
 * @param {string[]} lineas las que cortaron
 * @param {Array<any>} motor filas de `SQL_PRODUCTOS_LINEAS`
 * @param {Array<{ id: number|string }>} espejo los ids que ya están en `productos`
 * @param {{ conProveedor: boolean }} o OBLIGATORIO: ¿el espejo de esta base tiene la columna `proveedor`?
 */
export function planProductosErp(lineas, motor, espejo, o) {
  if (!Array.isArray(lineas)) throw new Error('planProductosErp: faltan las líneas cortadas.')
  if (!o || typeof o.conProveedor !== 'boolean') throw new Error('planProductosErp: falta decir si la tabla del sistema anterior tiene la columna `proveedor`.')
  const filas = (motor || []).filter((r) => lineas.includes(r.linea))
  const vacias = lineas.filter((l) => !filas.some((r) => r.linea === l))
  if (vacias.length) {
    return { existentes: [], nuevos: [], freno: `Areben Gestión no devolvió ningún producto de ${vacias.join(', ')}` }
  }
  const yaEsta = new Set((espejo || []).map((r) => Number(r.id)))
  const existentes = []
  const nuevos = []
  for (const r of filas) {
    const fila = {
      id: Number(r.id),
      name: r.nombre,
      category: r.categoria ?? null,
      retailer_price: num(r.precio),
      wholesaler_price: num(r.mayorista),
      unit_cost: num(r.costo),
      active: r.activo === true,
      updated_at: iso(r.actualizado_en),
      ...(o.conProveedor ? { proveedor: r.proveedor ?? null } : {}),
    }
    if (yaEsta.has(fila.id)) existentes.push(fila)
    else nuevos.push({ ...fila, sku: null, created_at: iso(r.actualizado_en) })
  }
  return { existentes, nuevos, freno: null }
}
