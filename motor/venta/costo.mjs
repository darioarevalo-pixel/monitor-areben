/**
 * El costo vigente de cada producto (paso 5, `sql/009-precio-costo.sql`). Vive en `lib/venta` porque la venta lo usa
 * y el monitor copia esta carpeta (`npm run traer-motor`). Antes de 009, sólo el espejo de GN.
 */

const q = async (db, sql, params = []) => (await db.query(sql, params)).rows

/**
 * El costo de cada producto para la línea de venta. Mientras GN vive, el espejo es la copia más fresca de GN ⇒
 * gana un costo CARGADO en el ERP (`fuente` ≠ 'gn'); si no, el espejo; si el espejo ⛔ lo tiene, la última copia.
 * @returns {Promise<Map<number, { costo: number, fuente: 'costo'|'gn_espejo' }>>}
 */
export async function costosDe(db, ids) {
  const out = new Map()
  if (!ids.length) return out
  const [h] = await q(db, `select to_regclass('public.productos') is not null as espejo, to_regclass('public.costo_vigente') is not null as tabla`)
  const tabla = h.tabla ? await q(db, 'select product_id, costo, fuente from costo_vigente where product_id = any($1::bigint[])', [ids]) : []
  const espejo = h.espejo ? await q(db, 'select id, unit_cost from productos where id = any($1::bigint[])', [ids]) : []
  for (const r of tabla) if (r.fuente !== 'gn' && Number(r.costo) > 0) out.set(Number(r.product_id), { costo: Number(r.costo), fuente: 'costo' })
  for (const r of espejo) if (!out.has(Number(r.id)) && Number(r.unit_cost) > 0) out.set(Number(r.id), { costo: Number(r.unit_cost), fuente: 'gn_espejo' })
  for (const r of tabla) if (!out.has(Number(r.product_id)) && Number(r.costo) > 0) out.set(Number(r.product_id), { costo: Number(r.costo), fuente: 'costo' })
  return out
}
