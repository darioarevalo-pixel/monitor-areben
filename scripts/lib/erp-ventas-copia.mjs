/**
 * La COPIA de las ventas del ERP al espejo (`ventas` / `venta_detalles`), con las bases ya abiertas: la usan el sync diario
 * (`scripts/erp-ventas-espejo.mjs`) y el botón «traer las ventas de hoy» de Liquidación y Ventas de Marketing
 * (`api/_ventas-hoy.js`). La regla —qué se copia, qué se saca y el freno— vive en `ventas-espejo.core.js`.
 *
 * 🔴 Corre DESPUÉS de traer las de GN: la purga de GN ⛔ toca ids del ERP, pero el orden deja el espejo igual que la noche.
 * Sin línea cortada en la base ⇒ ⛔ se escribe ni se saca nada (el plan da vacío).
 */
import { ID_DESDE_ERP, planVentasErp, SQL_COLUMNAS, SQL_DETALLES_ERP, SQL_VENTAS_ERP } from '../../lib/erp/ventas-espejo.core.js'

/** Los ids ≥ ID_DESDE_ERP de una tabla del espejo. */
async function idsDelErp(sb, tabla) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select('id').gte('id', ID_DESDE_ERP).order('id').range(desde, desde + 999)
    if (error) throw new Error(`leyendo ${tabla}: ${error.message}`)
    out.push(...(data || []).map((f) => Number(f.id)))
    if (!data || data.length < 1000) break
  }
  return out
}

/**
 * Lee el motor (`db`, pg abierto) y el espejo (`sb`, supabase-js con service key) y, salvo `seco`, escribe.
 * @param {{ query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }} db
 * @param {any} sb
 * @param {{ seco?: boolean }} [o]
 * @returns {Promise<{ cortes: Array<{ linea: string, instante: any }>, ventas: number, detalles: number, espejo: { ventas: number, detalles: number }, sacadas: { ventas: number, detalles: number }, freno: string | null }>}
 *   🔴 `freno` (texto o null) = había demasiadas para sacar: ⛔ se sacó nada (lo que había que escribir, sí).
 */
export async function copiarVentasErp(db, sb, { seco = false } = {}) {
  const cortes = (await db.query('select linea, instante from erp_corte where instante <= now() order by linea')).rows
  const [v, d, c] = await Promise.all([db.query(SQL_VENTAS_ERP), db.query(SQL_DETALLES_ERP), db.query(SQL_COLUMNAS)])
  /** @type {{ ventas: string[], venta_detalles: string[] }} */
  const columnas = { ventas: [], venta_detalles: [] }
  for (const f of c.rows) columnas[/** @type {'ventas'|'venta_detalles'} */ (f.table_name)].push(f.column_name)
  const espejo = { ventas: await idsDelErp(sb, 'ventas'), detalles: await idsDelErp(sb, 'venta_detalles') }
  const plan = planVentasErp({ ventas: v.rows, detalles: d.rows }, espejo, columnas)
  if (!seco) {
    for (let i = 0; i < plan.ventas.length; i += 500) {
      const { error } = await sb.from('ventas').upsert(plan.ventas.slice(i, i + 500), { onConflict: 'id' })
      if (error) throw new Error(`escribiendo ventas: ${error.message}`)
    }
    for (let i = 0; i < plan.detalles.length; i += 1000) {
      const { error } = await sb.from('venta_detalles').upsert(plan.detalles.slice(i, i + 1000), { onConflict: 'id' })
      if (error) throw new Error(`escribiendo venta_detalles: ${error.message}`)
    }
    // Renglones primero: un renglón sin su venta ⛔ debe quedar ni un instante.
    for (const [tabla, ids] of /** @type {const} */ ([['venta_detalles', plan.sacarDetalles], ['ventas', plan.sacarVentas]])) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from(tabla).delete().in('id', ids.slice(i, i + 200)).gte('id', ID_DESDE_ERP)
        if (error) throw new Error(`sacando de ${tabla}: ${error.message}`)
      }
    }
  }
  return {
    cortes,
    ventas: plan.ventas.length,
    detalles: plan.detalles.length,
    espejo: { ventas: espejo.ventas.length, detalles: espejo.detalles.length },
    sacadas: { ventas: plan.sacarVentas.length, detalles: plan.sacarDetalles.length },
    freno: plan.freno || null,
  }
}
