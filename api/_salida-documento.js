// La solicitud del monitor (sesión de fotos / solicitud interna retornable), anotada TAMBIÉN como salida con vuelta del motor
// (sql/048). EN SOMBRA: mientras GN sirva, la venta de GN ya movió el stock ⇒ el documento nace con `mueve_libro = false` (la
// llave `salida_mueve_libro` se prende el día del corte) y sólo cuenta qué salió, qué volvió y qué falta declarar.
//
// Lo que hace en cada guardado de la solicitud (idempotente, se puede repetir):
//   · salió (`ventas` cargadas) y ⛔ hay documento  → crearSalida (por `ref` = id de la solicitud);
//   · volvió algo más que lo anotado               → devolver (sólo lo que SUBIÓ);
//   · volvió TODO                                  → cerrarSalida (sin ajustes: no hay gasto);
//   · faltan unidades                               → queda ABIERTA: declarar consumida / dañada / perdida es una acción
//                                                     (`salida-cerrar` en la puerta del ERP), ⛔ se adivina.
//
// 🔴 NADA de acá frena el guardado ni lanza: la solicitud ya está guardada y la venta de GN ya salió. Sin
// `DATABASE_URL_<MARCA>` en Vercel ⛔ está conectado todavía: cargarla ES prenderlo (igual que `api/_repo-documento.js`).
//
// ⛔ Archivo `_`: NO es una ruta.
import { configPg } from '../lib/pg.core.js'
import { canjeDe, consumoDe, devolverDe, pedidoDeSolicitud, volvioTodo } from '../lib/erp/salida-solicitud.core.js'

const PG_DE_STORE = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA', stunned: 'DATABASE_URL_ZATTIA' }
/** El guardado de la solicitud ya espera a Supabase: el documento no puede sumar mucho más que esto. */
const TECHO_MS = 4000

const mensaje = (r) => `${r.error.codigo}: ${r.error.mensaje}`

/**
 * @param {{ store: string, kind: string, solicitud: any, usuario: string }} p
 * @returns {Promise<{ ok?: true, ya?: boolean, sinConexion?: true, salteada?: true, abierta?: number, cerrada?: true, error?: string }>} ⛔ lanza
 */
export async function documentarSalida({ store, kind, solicitud, usuario }) {
  try {
    const conexion = process.env[PG_DE_STORE[store]]
    if (!conexion) return { sinConexion: true }
    const pedido = pedidoDeSolicitud(kind, solicitud, store)
    if (!pedido) return { salteada: true }
    const [{ default: pg }, m] = await Promise.all([import('pg'), import('../motor/stock/salida.mjs')])
    const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
    try {
      await db.connect()
      const quien = usuario || 'solicitudes'
      const c = await m.crearSalida(db, { ...pedido, usuario: quien })
      if (!c.ok) return { error: mensaje(c) }
      if (c.salida.estado !== 'salio') return { ok: true, ya: true }
      const { salidas } = await m.salidasDe(db, { linea: store, ref: pedido.ref, limite: 1 })
      const doc = salidas[0]
      if (!doc) return { ok: true, ya: c.ya }
      const aDevolver = devolverDe(solicitud, store, doc.renglones, kind)
      if (aDevolver.length) {
        const d = await m.devolver(db, { salida_id: doc.id, usuario: quien, renglones: aDevolver })
        if (!d.ok) return { error: mensaje(d) }
      }
      if (volvioTodo(doc.renglones, aDevolver)) {
        const k = await m.cerrarSalida(db, { salida_id: doc.id, usuario: quien, renglones: [] })
        if (!k.ok) return { error: mensaje(k) }
        return { ok: true, ya: c.ya, cerrada: true }
      }
      const recien = new Map(aDevolver.map((d) => [d.n, d.cantidad]))
      return { ok: true, ya: c.ya, abierta: doc.renglones.reduce((s, r) => s + (r.cantidad - r.devuelta - (recien.get(r.n) ?? 0) - r.consumida - r.danada - r.perdida), 0) }
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}

/**
 * Anota ajustes del motor (`crearAjuste`) para un pedido ya armado, idempotentes por `ref` (sql/050). Mismas reglas que
 * `documentarSalida`: ⛔ frena ni lanza, y sin `DATABASE_URL_<MARCA>` ⛔ toca nada.
 * @returns {Promise<{ ok?: true, ajustes?: number, ya?: number, sinConexion?: true, salteada?: true, error?: string }>}
 */
async function anotarAjustes({ store, pedidos, usuario }) {
  try {
    const conexion = process.env[PG_DE_STORE[store]]
    if (!conexion) return { sinConexion: true }
    if (!pedidos.length) return { salteada: true }
    const [{ default: pg }, m] = await Promise.all([import('pg'), import('../motor/stock/ajuste.mjs')])
    const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
    try {
      await db.connect()
      let nuevos = 0
      let ya = 0
      for (const p of pedidos) {
        const r = await m.crearAjuste(db, { ...p, usuario: usuario || 'solicitudes' })
        if (!r.ok) return { error: mensaje(r) }
        if (r.ya) ya += 1
        else nuevos += 1
      }
      return { ok: true, ajustes: nuevos, ya }
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}

/**
 * El CONSUMO de una solicitud interna, anotado como ajustes `consumible` del motor (gasto de marketing al costo real; mueve el
 * libro del ERP al instante, a nombre de quien guardó).
 */
export function documentarConsumo({ store, kind, solicitud, usuario }) {
  return anotarAjustes({ store, pedidos: consumoDe(kind, solicitud, store), usuario })
}

/**
 * El CANJE (venta de GN ya creada), anotado como ajuste `canje` del motor. EN SOMBRA: la venta de GN descuenta GN; el ajuste
 * descuenta el libro del ERP (el canje ⛔ pasa por el motor como venta) y deja el gasto de marketing al costo real.
 * @param {{ store: string, b: any, usuario: string|null }} p `b` = el cuerpo del pedido a crear-venta
 */
export function documentarCanje({ store, b, usuario }) {
  return anotarAjustes({ store, pedidos: canjeDe(b, store), usuario })
}
