// ¿Qué líneas de esta base ya cortaron al ERP? Lee `erp_corte` del motor (`DATABASE_URL_<BASE>`), la regla de
// `lib/erp/corte.core.js`. La usan los syncs de GN (para ⛔ escribir el stock de una línea cortada: lo escribe el libro) y
// `scripts/erp-inventario-espejo.mjs`.
// 🔴 Sin la URL o con el motor caído TIRA: un sync que no sabe qué línea cortó pisaría el stock del libro con el de GN.
import pg from 'pg'
import { configPg } from '../../lib/pg.core.js'
import { cortesDeFilas, lineasEnErp, SQL_CORTES } from '../../lib/erp/corte.core.js'

export const ENV_MOTOR = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

/** @param {'bdi'|'zattia'} base @returns {Promise<string[]>} */
export async function lineasCortadasDe(base) {
  const env = ENV_MOTOR[base]
  if (!env) throw new Error(`base desconocida: ${base}`)
  const url = process.env[env]
  if (!url) throw new Error(`falta ${env}: sin el motor no se sabe qué línea pasó al ERP`)
  const db = new pg.Client({ ...configPg(url), connectionTimeoutMillis: 10000, statement_timeout: 30000 })
  try {
    await db.connect()
    return lineasEnErp(cortesDeFilas((await db.query(SQL_CORTES)).rows), base)
  } finally {
    await db.end().catch(() => {})
  }
}
