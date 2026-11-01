// Las ventas nacidas en el ERP (líneas cortadas), para memo / Norte / parte (forma de GN, ver `lib/stunned/ventas-erp.core.js`).
// Sin corte en esa base, 0 filas: se prende solo con `erp_corte`, ⛔ una variable.
// 🔴 Sin conexión o con error ⛔ calla: devuelve `error` y el lector lo agrega a sus avisos — una marca en cero sin
// decirlo sería afirmar que no vendió. ⛔ Archivo `_`: NO es una ruta.
import { normalizarDetalles, normalizarVentas, sqlDetalles, sqlSkus, sqlVentas } from '../lib/stunned/ventas-erp.core.js'
import { lineasDeMarca } from '../lib/lineas.core.js'
import { configPg } from '../lib/pg.core.js'

const TECHO_MS = 8000
const CONEXION = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

/**
 * @param {'bdi' | 'zattia'} base @param {string} desde AAAA-MM-DD @param {string} hasta AAAA-MM-DD @param {Record<string, string | undefined>} [env]
 * @returns {Promise<{ activa: true, ventas: any[], detalles: any[], skuPor: Map<string,string> } | { activa: true, error: string }>}
 */
export async function ventasDelErp(base, desde, hasta, env = process.env) {
  const conexion = env[CONEXION[base]]
  if (!conexion) return { activa: true, error: `ERP: falta ${CONEXION[base] || `la base de ${base}`}, las ventas del ERP NO están sumadas.` }
  const lineas = lineasDeMarca(base)
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
  try {
    await db.connect()
    const [v, d, s] = await Promise.all([db.query(sqlVentas(lineas), [desde, hasta]), db.query(sqlDetalles(lineas), [desde, hasta]), db.query(sqlSkus(lineas))])
    return { activa: true, ventas: normalizarVentas(v.rows), detalles: normalizarDetalles(d.rows), skuPor: new Map(s.rows.map((r) => [String(r.product_id), r.sku])) }
  } catch (e) {
    return { activa: true, error: `ERP: ${String((e && e.message) || e).slice(0, 160)} — las ventas del ERP NO están sumadas.` }
  } finally {
    await db.end().catch(() => {})
  }
}
