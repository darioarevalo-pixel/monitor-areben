/**
 * La base del motor para la regla «¿esta línea ya está en el ERP?» (`lib/erp/corte.core.js`). La usan los conteos
 * (`api/_conteo-erp.js`) y la falla / solicitud / canje (`api/_salida-documento.js`).
 *
 * 🔴 Si la base ⛔ contesta o falta `erp_corte`, TIRA: sin saber si la línea cortó ⛔ se elige un camino (caer a GN con una línea
 * cortada es el agujero; ir al ERP con una sin cortar ajusta un libro que nadie mira). ⛔ Archivo `_`: NO es una ruta.
 */
import { configPg } from '../lib/pg.core.js'
import { cortesDeFilas, SQL_CORTES } from '../lib/erp/corte.core.js'
import { baseDeLinea, lineaDe, skuParaLinea } from '../lib/lineas.core.js'

/** La conexión del motor de cada base (Stunned vive en la de Zattia). */
export const PG_DE_STORE = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA', stunned: 'DATABASE_URL_ZATTIA' }

/** Abre la base del motor de ese store, corre `fn(db)` y la cierra. Sin la variable, TIRA. */
export async function conBase(store, fn, techoMs = 6000) {
  const nombre = PG_DE_STORE[store]
  const conexion = nombre && process.env[nombre]
  if (!conexion) throw new Error(`Falta ${nombre || `la base de ${store}`}: no se puede saber si la línea ya está en el ERP.`)
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: techoMs, statement_timeout: techoMs, query_timeout: techoMs })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end().catch(() => {})
  }
}

/** `{ linea: ISO }` de `erp_corte`. Sin la tabla, TIRA (⛔ un vacío que diga «nadie cortó»). */
export async function cortesDe(db) {
  try {
    const { rows } = await db.query(SQL_CORTES)
    return cortesDeFilas(rows)
  } catch (e) {
    if (e && e.code === '42P01') throw new Error('Falta la tabla erp_corte (motor sql/063): no se sabe qué línea ya está en el ERP.')
    throw e
  }
}

/**
 * La línea de cada producto (`product_id` → `bdi|zattia|stunned`), del ESPEJO (`productos.sku`, con el proveedor de respaldo),
 * ⛔ de lo que manda la pantalla. Un producto que ⛔ está en el espejo ⛔ entra al Map.
 * 🔴 `proveedor` existe SÓLO en el espejo de Zattia (lo usa Stunned): el de BDI ⛔ la tiene (medido en prod 31-oct) ⇒ se lee por
 * `to_jsonb`, que da null si falta. Con `select proveedor` el corte de BDI frenaba TODA falla, canje, solicitud y conteo.
 */
export async function lineasDeProductos(db, store, ids) {
  const base = baseDeLinea(store)
  const unicos = [...new Set((ids || []).map(Number).filter(Number.isInteger))]
  if (!unicos.length || !base) return new Map()
  const { rows } = await db.query(`select p.id, p.sku, to_jsonb(p)->>'proveedor' as proveedor from productos p where p.id = any($1::bigint[])`, [unicos])
  return new Map(rows.map((p) => [Number(p.id), lineaDe(base, skuParaLinea(p))]))
}
