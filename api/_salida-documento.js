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
import { canjeDe, canjeErpDe, consumoDe, devolverDe, fallaErpDe, pedidoDeSolicitud, salidasErpDe, sinOrigenesErp, solicitudErpDe, volvioTodo } from '../lib/erp/salida-solicitud.core.js'
import { lineasEnErp } from '../lib/erp/corte.core.js'
import { baseDeLinea } from '../lib/lineas.core.js'
import { conBase, cortesDe, lineasDeProductos, PG_DE_STORE } from './_erp-corte.js'
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
    // Los orígenes que fueron al ERP (una línea con corte, §8.3) ya tienen su salida desde la carga: acá sólo se anota lo que VOLVIÓ.
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
        const err = sumar({ ya: true, ...(await seguirSalida(db, m, { linea: e.linea, ref: e.ref, solicitud: e.solicitud, store: e.linea, kind, quien })) })
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

/** Un ajuste que ES la baja (falla, canje, consumo de una línea en el ERP): se crea y se aprueba en el acto, a nombre de quien cargó. */
async function ajusteAplicado(db, aj, pedido, quien, que) {
  const c = await aj.crearAjuste(db, { ...pedido, usuario: quien })
  if (!c.ok) return { error: mensaje(c) }
  // Reintento de uno ya anotado: el ajuste vuelve por su `ref`. Si quedó sin aprobar (se cortó entre los dos pasos), se aprueba ahora.
  if (c.ajuste.estado === 'rechazado') return { error: `El ajuste A-${c.ajuste.numero} de ${que} está rechazado en ERP › Ajustes.` }
  if (c.ajuste.estado !== 'aplicado') {
    const a = await aj.aprobarAjuste(db, { ajuste_id: c.ajuste.id, usuario: quien })
    if (!a.ok) return { error: `El ajuste A-${c.ajuste.numero} quedó para aprobar en ERP › Ajustes (${mensaje(a)}).` }
  }
  return { ok: true, linea: pedido.linea, ajuste: Number(c.ajuste.numero), ya: c.ya === true }
}

/**
 * Lee el corte y la línea de cada producto y arma el pedido con `armar(b, store, lineas, enErp)`. `null` = ninguna línea del
 * pedido está en el ERP (sigue a GN). 🔴 Si la base ⛔ contesta, FRENA (`error`): ⛔ se sabe si la línea cortó, y caer a GN con
 * una línea cortada es el agujero.
 */
async function conPedidoErp({ store, b }, armar, fn) {
  const base = baseDeLinea(store)
  const ids = (Array.isArray(b.items) ? b.items : []).map((it) => it && it.product_id)
  if (!base || !ids.length) return null
  try {
    return await conBase(base, async (db) => {
      const enErp = lineasEnErp(await cortesDe(db), base)
      if (!enErp.length) return null
      const pedido = armar(b, base, await lineasDeProductos(db, base, ids), enErp)
      if (!pedido || pedido.error) return pedido
      return fn(db, pedido)
    }, TECHO_MS)
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) }
  }
}

/**
 * La FALLA de una línea que ya está en el ERP (`erp_corte`: Stunned desde el 28-oct, BDI y Zattia desde su corte), ⛔ a GN (Bruno
 * 30-oct): ajuste `fallado` que baja el libro al CARGARLA, como hacía la venta de GN ⇒ se aprueba en el acto (el `fallado` a mano
 * de `erp › Ajustes` sigue esperando al admin). 🔴 ⛔ es sombra: es LA baja ⇒ si falla, FRENA (`error`) y ⛔ cae a GN.
 * La línea sale del espejo (`productos.sku`, con el proveedor de respaldo), ⛔ del sku que manda la pantalla.
 * @param {{ store: string, b: any, usuario: string|null }} p `b` = el cuerpo del pedido a crear-venta
 * @returns {Promise<null | { ok: true, linea: string, ajuste: number, ya: boolean } | { error: string }>} `null` = sigue a GN
 */
export async function fallaAlErp({ store, b, usuario }) {
  if (!b || b.proposito !== 'falla') return null
  const aj = await import('../motor/stock/ajuste.mjs')
  return conPedidoErp({ store, b }, fallaErpDe, (db, pedido) => ajusteAplicado(db, aj, pedido, usuario || 'fallas', 'esta falla'))
}

/**
 * El CANJE de una línea que ya está en el ERP (hoy sólo BDI tiene canjes; corta el 15/16-nov), ⛔ a GN: ajuste `canje` aplicado en
 * el acto. Antes del corte sigue la venta de GN + el ajuste en sombra (`documentarCanje`). Mismas reglas que la falla.
 * @returns {Promise<null | { ok: true, linea: string, ajuste: number, ya: boolean } | { error: string }>} `null` = sigue a GN
 */
export async function canjeAlErp({ store, b, usuario }) {
  if (!b || b.proposito !== 'canje') return null
  const aj = await import('../motor/stock/ajuste.mjs')
  return conPedidoErp({ store, b }, canjeErpDe, (db, pedido) => ajusteAplicado(db, aj, pedido, usuario || 'canjes', 'este canje'))
}

/**
 * La SOLICITUD de una línea que ya está en el ERP (sesión de fotos / solicitud interna), ⛔ a GN (Bruno 30-oct, erp-stunned §8.3):
 * fotos y retornable ⇒ salida con vuelta de la línea (baja al cargarla; lo que vuelve sube al guardar la solicitud,
 * `documentarSalida`); consumo ⇒ ajuste `consumible`/`uso_interno` aprobado en el acto. 🔴 Como la falla ⛔ es sombra ⇒ si falla,
 * FRENA. 🔑 El corte IMPLICA que la salida mueve el libro: lo decide el MOTOR (`crearSalida`: la llave `salida_mueve_libro` o el
 * corte de la línea), ⛔ hay que prender nada el día del corte. Si igual nació sin mover el libro, FRENA.
 * @returns {Promise<null | { ok: true, linea: string, salida?: number, ajuste?: number, ya: boolean } | { error: string }>} `null` = sigue a GN
 */
export async function solicitudAlErp({ store, b, usuario }) {
  if (!b || b.proposito || b.accion) return null
  const [sal, aj] = await Promise.all([import('../motor/stock/salida.mjs'), import('../motor/stock/ajuste.mjs')])
  const quien = usuario || 'solicitudes'
  return conPedidoErp({ store, b }, solicitudErpDe, async (db, pedido) => {
    if (pedido.ajuste) return ajusteAplicado(db, aj, pedido.ajuste, quien, 'esta solicitud')
    const linea = pedido.salida.linea
    const c = await sal.crearSalida(db, { ...pedido.salida, usuario: quien })
    if (!c.ok) return { error: mensaje(c) }
    if (c.salida.mueve_libro !== true) return { error: `La salida S-${c.salida.numero} quedó anotada SIN bajar el stock del ERP: avisale a Bruno.` }
    return { ok: true, linea, salida: Number(c.salida.numero), ya: c.ya === true }
  })
}
