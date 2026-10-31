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
import { canjeDe, consumoDe, devolverDe, fallaStunnedDe, pedidoDeSolicitud, salidasErpDe, sinOrigenesErp, solicitudStunnedDe, volvioTodo } from '../lib/erp/salida-solicitud.core.js'
import { lineaDe, skuParaLinea } from '../lib/lineas.core.js'
import { lecturasStunnedErp } from '../lib/stunned/ventas-erp.core.js'

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
    // Los orígenes que fueron al ERP (Stunned, §8.3) ya tienen su salida desde la carga: acá sólo se anota lo que VOLVIÓ.
    const pedido = pedidoDeSolicitud(kind, sinOrigenesErp(solicitud), store)
    const delErp = salidasErpDe(kind, solicitud)
    if (!pedido && !delErp.length) return { salteada: true }
    const [{ default: pg }, m] = await Promise.all([import('pg'), import('../motor/stock/salida.mjs')])
    const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
    try {
      await db.connect()
      const quien = usuario || 'solicitudes'
      const total = { ok: true, ya: true, abierta: 0 }
      const sumar = (r) => {
        if (r.error) return r
        if (!r.ya) total.ya = false
        if (r.abierta) total.abierta += r.abierta
        if (r.cerrada) total.cerrada = true
        return null
      }
      if (pedido) {
        const c = await m.crearSalida(db, { ...pedido, usuario: quien })
        if (!c.ok) return { error: mensaje(c) }
        const err = sumar(c.salida.estado !== 'salio' ? { ya: true } : { ya: c.ya, ...(await seguirSalida(db, m, { linea: store, ref: pedido.ref, solicitud: sinOrigenesErp(solicitud), store, kind, quien })) })
        if (err) return err
      }
      for (const e of delErp) {
        const err = sumar({ ya: true, ...(await seguirSalida(db, m, { linea: 'stunned', ref: e.ref, solicitud: e.solicitud, store: 'stunned', kind, quien })) })
        if (err) return err
      }
      if (!total.abierta) delete total.abierta
      return total
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}

/** Lo que VOLVIÓ de una salida ya creada (por `linea` + `ref`): devuelve lo que subió y, si volvió todo, la cierra. */
async function seguirSalida(db, m, { linea, ref, solicitud, store, kind, quien }) {
  const { salidas } = await m.salidasDe(db, { linea, ref, limite: 1 })
  const doc = salidas[0]
  if (!doc || doc.estado !== 'salio') return {}
  const aDevolver = devolverDe(solicitud, store, doc.renglones, kind)
  if (aDevolver.length) {
    const d = await m.devolver(db, { salida_id: doc.id, usuario: quien, renglones: aDevolver })
    if (!d.ok) return { error: mensaje(d) }
  }
  if (volvioTodo(doc.renglones, aDevolver)) {
    const k = await m.cerrarSalida(db, { salida_id: doc.id, usuario: quien, renglones: [] })
    if (!k.ok) return { error: mensaje(k) }
    return { cerrada: true }
  }
  const recien = new Map(aDevolver.map((d) => [d.n, d.cantidad]))
  return { abierta: doc.renglones.reduce((s, r) => s + (r.cantidad - r.devuelta - (recien.get(r.n) ?? 0) - r.consumida - r.danada - r.perdida), 0) }
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
  return anotarAjustes({ store, pedidos: consumoDe(kind, sinOrigenesErp(solicitud), store), usuario })
}

/**
 * El CANJE (venta de GN ya creada), anotado como ajuste `canje` del motor. EN SOMBRA: la venta de GN descuenta GN; el ajuste
 * descuenta el libro del ERP (el canje ⛔ pasa por el motor como venta) y deja el gasto de marketing al costo real.
 * @param {{ store: string, b: any, usuario: string|null }} p `b` = el cuerpo del pedido a crear-venta
 */
export function documentarCanje({ store, b, usuario }) {
  return anotarAjustes({ store, pedidos: canjeDe(b, store), usuario })
}

/**
 * La FALLA de Stunned al ERP, ⛔ a GN (Bruno 30-oct): ajuste `fallado` de la línea `stunned` que baja el libro al CARGARLA, como
 * hacía la venta de GN ⇒ se crea y se aprueba en el acto, a nombre de quien la cargó (el `fallado` a mano de `erp › Ajustes`
 * sigue esperando al admin). 🔴 A diferencia del canje ⛔ es sombra: es LA baja ⇒ si falla, FRENA (devuelve `error`) y ⛔ cae a GN.
 * La línea sale del espejo (`productos.sku`, con el proveedor de respaldo), ⛔ del sku que manda la pantalla.
 * @param {{ store: string, b: any, usuario: string|null }} p `b` = el cuerpo del pedido a crear-venta
 * @returns {Promise<null | { ok: true, ajuste: number, ya: boolean } | { error: string }>} `null` = ⛔ es de Stunned: sigue a GN
 */
export async function fallaStunnedAlErp({ store, b, usuario }) {
  if (!b || b.proposito !== 'falla' || store !== 'zattia' || !lecturasStunnedErp()) return null
  const ids = [...new Set((Array.isArray(b.items) ? b.items : []).map((it) => Number(it && it.product_id)).filter(Number.isInteger))]
  if (!ids.length) return null
  const conexion = process.env[PG_DE_STORE[store]]
  if (!conexion) return { error: `Falta ${PG_DE_STORE[store]}: no se puede saber si la falla es de Stunned.` }
  try {
    const [{ default: pg }, m] = await Promise.all([import('pg'), import('../motor/stock/ajuste.mjs')])
    const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
    try {
      await db.connect()
      const { rows } = await db.query('select id, sku, proveedor from productos where id = any($1::bigint[])', [ids])
      const lineas = new Map(rows.map((p) => [Number(p.id), lineaDe(store, skuParaLinea(p))]))
      const pedido = fallaStunnedDe(b, store, lineas)
      if (!pedido) return null
      if (pedido.error) return { error: pedido.error }
      const quien = usuario || 'fallas'
      const c = await m.crearAjuste(db, { ...pedido, usuario: quien })
      if (!c.ok) return { error: mensaje(c) }
      // Reintento de una falla ya anotada: el ajuste vuelve por su `ref`. Si quedó sin aprobar (se cortó entre los dos pasos), se aprueba ahora.
      if (c.ajuste.estado === 'rechazado') return { error: `El ajuste A-${c.ajuste.numero} de esta falla está rechazado en ERP › Ajustes.` }
      if (c.ajuste.estado !== 'aplicado') {
        const a = await m.aprobarAjuste(db, { ajuste_id: c.ajuste.id, usuario: quien })
        if (!a.ok) return { error: `El ajuste A-${c.ajuste.numero} quedó para aprobar en ERP › Ajustes (${mensaje(a)}).` }
      }
      return { ok: true, ajuste: Number(c.ajuste.numero), ya: c.ya === true }
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}

/**
 * La SOLICITUD de Stunned (sesión de fotos / solicitud interna) al ERP, ⛔ a GN (Bruno 30-oct, erp-stunned §8.3): fotos y retornable
 * ⇒ salida con vuelta de la línea `stunned` (baja al cargarla; lo que vuelve sube al guardar la solicitud, `documentarSalida`);
 * consumo ⇒ ajuste `consumible`/`uso_interno` aprobado en el acto, como la venta de GN. 🔴 Como la falla ⛔ es sombra: es LA baja ⇒
 * si falla, FRENA (`error`) y ⛔ cae a GN. Con la llave `salida_mueve_libro` de Stunned apagada también frena: la salida ⛔ bajaría nada.
 * @param {{ store: string, b: any, usuario: string|null }} p `b` = el cuerpo del pedido a crear-venta
 * @returns {Promise<null | { ok: true, salida?: number, ajuste?: number, ya: boolean } | { error: string }>} `null` = ⛔ es de Stunned: sigue a GN
 */
export async function solicitudStunnedAlErp({ store, b, usuario }) {
  if (!b || b.proposito || b.accion || store !== 'zattia' || !lecturasStunnedErp()) return null
  const ids = [...new Set((Array.isArray(b.items) ? b.items : []).map((it) => Number(it && it.product_id)).filter(Number.isInteger))]
  if (!ids.length) return null
  const conexion = process.env[PG_DE_STORE[store]]
  if (!conexion) return { error: `Falta ${PG_DE_STORE[store]}: no se puede saber si la solicitud es de Stunned.` }
  try {
    const [{ default: pg }, sal, aj, sw] = await Promise.all([import('pg'), import('../motor/stock/salida.mjs'), import('../motor/stock/ajuste.mjs'), import('../motor/stock/interruptores.mjs')])
    const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: TECHO_MS, statement_timeout: TECHO_MS, query_timeout: TECHO_MS })
    try {
      await db.connect()
      const { rows } = await db.query('select id, sku, proveedor from productos where id = any($1::bigint[])', [ids])
      const lineas = new Map(rows.map((p) => [Number(p.id), lineaDe(store, skuParaLinea(p))]))
      const pedido = solicitudStunnedDe(b, store, lineas)
      if (!pedido) return null
      if (pedido.error) return { error: pedido.error }
      const quien = usuario || 'solicitudes'
      if (pedido.ajuste) {
        const c = await aj.crearAjuste(db, { ...pedido.ajuste, usuario: quien })
        if (!c.ok) return { error: mensaje(c) }
        if (c.ajuste.estado === 'rechazado') return { error: `El ajuste A-${c.ajuste.numero} de esta solicitud está rechazado en ERP › Ajustes.` }
        if (c.ajuste.estado !== 'aplicado') {
          const a = await aj.aprobarAjuste(db, { ajuste_id: c.ajuste.id, usuario: quien })
          if (!a.ok) return { error: `El ajuste A-${c.ajuste.numero} quedó para aprobar en ERP › Ajustes (${mensaje(a)}).` }
        }
        return { ok: true, ajuste: Number(c.ajuste.numero), ya: c.ya === true }
      }
      if ((await sw.configuracionDe(db, { linea: 'stunned' })).salida_mueve_libro !== true) {
        return { error: 'La salida de Stunned todavía no mueve el stock del ERP (la llave «salida_mueve_libro» está apagada): avisale a Bruno.' }
      }
      const c = await sal.crearSalida(db, { ...pedido.salida, usuario: quien })
      if (!c.ok) return { error: mensaje(c) }
      if (c.salida.mueve_libro !== true) return { error: `La salida S-${c.salida.numero} quedó anotada SIN bajar el stock del ERP: avisale a Bruno.` }
      return { ok: true, salida: Number(c.salida.numero), ya: c.ya === true }
    } finally {
      await db.end().catch(() => {})
    }
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}
