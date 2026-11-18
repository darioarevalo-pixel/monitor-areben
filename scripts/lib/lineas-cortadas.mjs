// ¿Qué líneas de esta base ya cortaron al ERP? Lee `erp_corte` del motor (`DATABASE_URL_<BASE>`), la regla de
// `lib/erp/corte.core.js`. La usan los syncs de GN (para ⛔ escribir el stock de una línea cortada: lo escribe el libro) y
// `scripts/erp-inventario-espejo.mjs`.
// 🔴 Sin la URL o con el motor caído TIRA: un sync que no sabe qué línea cortó pisaría el stock del libro con el de GN.
import pg from 'pg'
import { configPg } from '../../lib/pg.core.js'
import { cortesDeFilas, GN_SIGUE_DESPUES_DEL_CORTE, gnSeSaltea, lineasEnErp, SQL_CORTES } from '../../lib/erp/corte.core.js'

export const ENV_MOTOR = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

/** Los cortes (`erp_corte`) de la base del motor. @param {'bdi'|'zattia'} base @returns {Promise<Record<string, string>>} */
export async function cortesDe(base) {
  const env = ENV_MOTOR[base]
  if (!env) throw new Error(`base desconocida: ${base}`)
  const url = process.env[env]
  if (!url) throw new Error(`falta ${env}: sin el motor no se sabe qué línea pasó al ERP`)
  const db = new pg.Client({ ...configPg(url), connectionTimeoutMillis: 10000, statement_timeout: 30000 })
  try {
    await db.connect()
    return cortesDeFilas((await db.query(SQL_CORTES)).rows)
  } finally {
    await db.end().catch(() => {})
  }
}

/** @param {'bdi'|'zattia'} base @returns {Promise<string[]>} */
export async function lineasCortadasDe(base) {
  return lineasEnErp(await cortesDe(base), base)
}

/**
 * ¿El sync deja de leer el GN de esta base? (`gnSeSaltea`). Una base de `GN_SIGUE_DESPUES_DEL_CORTE` ⛔ toca el motor.
 * 🔴 Sin poder leer los cortes TIRA: ⛔ adivina (un sync que lee un GN dado de baja queda en rojo; uno que saltea de más, callado).
 * @param {'bdi'|'zattia'} base @returns {Promise<boolean>}
 */
export async function gnApagadoPara(base) {
  if (GN_SIGUE_DESPUES_DEL_CORTE.includes(base)) return false
  return gnSeSaltea(await cortesDe(base), base)
}
