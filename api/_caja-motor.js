// La venta de la Caja, anotada TAMBIÉN en el motor (opción (a), Bruno 14-oct). La regla y la forma de la
// entrada viven en `lib/caja/motor.core.js`; acá está la conexión pg (⛔ supabase-js: el motor escribe en
// UNA transacción) y el repaso de las que quedaron afuera.
//
// 🔴 NADA de acá frena a la cajera ni lanza: si el motor falla, la venta en GN ya salió. Se devuelve qué
// pasó y el handler lo anota en el log. Sin `DATABASE_URL_<MARCA>` en Vercel ⛔ está conectado todavía:
// cargarla (la URL del rol `motor`, puerto 6543) ES prenderlo, igual que el anular de `erp › Ventas`.
//
// ⛔ Archivo `_`: NO es una ruta.
import { COLUMNAS_MOTOR, DIAS_REPASO, REPASO_POR_VUELTA, entradaDelMotor, faltanEnMotor } from '../lib/caja/motor.core.js'

const PG_DE_STORE = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }
/** El motor tiene que contestar rápido: la cajera está esperando el ticket. Lo que no entra, lo sube el repaso. */
const TECHO_MS = 4000

async function conMotor(store, fn) {
  const conexion = process.env[PG_DE_STORE[store]]
  if (!conexion) return { sinConexion: true }
  const [{ default: pg }, { registrarVenta }] = await Promise.all([import('pg'), import('../motor/venta/registrar.mjs')])
  const db = new pg.Client({ connectionString: conexion, connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
  try {
    await db.connect()
    return await fn(db, registrarVenta)
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  } finally {
    await db.end().catch(() => {})
  }
}

async function anotarCada(db, registrarVenta, ventas) {
  const r = { anotadas: 0, yaEstaban: 0, fallidas: [] }
  for (const v of ventas) {
    const out = await registrarVenta(db, entradaDelMotor(v))
    if (!out.ok) r.fallidas.push({ id: v.id, codigo: out.error.codigo, mensaje: out.error.mensaje })
    else if (out.ya_existia) r.yaEstaban++
    else r.anotadas++
  }
  return r
}

/**
 * Anota en el motor UNA venta que acaba de llegar a GN. ⛔ Lanza.
 * @param {string} store @param {any} venta la fila de `caja_venta` (con `renglones` y `pagos`)
 */
export async function anotarEnMotor(store, venta) {
  if (!venta || venta.estado !== 'en_gn') return { salteada: true }
  return conMotor(store, (db, registrarVenta) => anotarCada(db, registrarVenta, [venta]))
}

/**
 * El repaso: las ventas en GN de los últimos días que el motor ⛔ tiene (falló, o se resolvieron a mano).
 * Va en la vuelta de `reintentar-pendientes` del POS. ⛔ Lanza.
 * @param {any} sb supabase de la marca @param {string} store
 */
export async function repasarMotor(sb, store) {
  if (!process.env[PG_DE_STORE[store]]) return { sinConexion: true }
  const desde = new Date(Date.now() - DIAS_REPASO * 24 * 3600 * 1000).toISOString()
  const enGN = await sb.from('caja_venta').select(COLUMNAS_MOTOR).eq('store', store).eq('estado', 'en_gn').gte('creada_en', desde).order('creada_en').limit(500)
  if (enGN.error) return { error: enGN.error.message }
  if (!enGN.data.length) return { anotadas: 0, yaEstaban: 0, fallidas: [] }
  return conMotor(store, async (db, registrarVenta) => {
    const ya = await db.query(`select origen_ref from venta where origen = 'caja' and origen_ref = any($1::text[])`, [enGN.data.map((v) => String(v.id))])
    const faltan = faltanEnMotor(enGN.data, ya.rows.map((r) => r.origen_ref)).slice(0, REPASO_POR_VUELTA)
    return anotarCada(db, registrarVenta, faltan)
  })
}

/** Una línea de log si hubo algo que leer (⛔ ruido cuando todo anduvo o no está conectado). */
export function avisoDelMotor(r, que) {
  if (!r || r.sinConexion || r.salteada) return null
  if (r.error) return `[caja→motor] ${que}: ${r.error}`
  if (r.fallidas && r.fallidas.length) return `[caja→motor] ${que}: ${r.fallidas.length} sin anotar — ${r.fallidas.slice(0, 3).map((f) => `${String(f.id).slice(0, 8)} ${f.codigo}`).join(' · ')}`
  return null
}
