// Las ventas de Stunned que nacen en el ERP, para memo / Norte / parte (forma de GN, ver `lib/stunned/ventas-erp.core.js`).
// Sin la llave `LECTURAS_STUNNED_ERP=1` no hace nada (antes del corte las ventas reales de Stunned siguen en GN).
// 🔴 Sin conexión o con error ⛔ calla: devuelve `error` y el lector lo agrega a sus avisos — un Stunned en cero sin
// decirlo sería afirmar que no vendió. ⛔ Archivo `_`: NO es una ruta.
import { lecturasStunnedErp, normalizarDetalles, normalizarVentas, SQL_DETALLES, SQL_SKUS, SQL_VENTAS } from '../lib/stunned/ventas-erp.core.js'
import { configPg } from '../lib/pg.core.js'

const TECHO_MS = 8000

/**
 * @param {string} desde AAAA-MM-DD @param {string} hasta AAAA-MM-DD @param {Record<string, string | undefined>} [env]
 * @returns {Promise<{ activa: false } | { activa: true, ventas: any[], detalles: any[], skuPor: Map<string,string> } | { activa: true, error: string }>}
 */
export async function ventasStunnedDelErp(desde, hasta, env = process.env) {
  if (!lecturasStunnedErp(env)) return { activa: false }
  const conexion = env.DATABASE_URL_ZATTIA
  if (!conexion) return { activa: true, error: 'Stunned (ERP): falta DATABASE_URL_ZATTIA, las ventas de Stunned del ERP NO están sumadas.' }
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
  try {
    await db.connect()
    const [v, d, s] = await Promise.all([db.query(SQL_VENTAS, [desde, hasta]), db.query(SQL_DETALLES, [desde, hasta]), db.query(SQL_SKUS)])
    return { activa: true, ventas: normalizarVentas(v.rows), detalles: normalizarDetalles(d.rows), skuPor: new Map(s.rows.map((r) => [String(r.product_id), r.sku])) }
  } catch (e) {
    return { activa: true, error: `Stunned (ERP): ${String((e && e.message) || e).slice(0, 160)} — sus ventas del ERP NO están sumadas.` }
  } finally {
    await db.end().catch(() => {})
  }
}
