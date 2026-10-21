// El envío le avisa al MOTOR del ERP lo que pasó con su venta (contrato-venta.md §20). Lo usan `_envios.js` (la
// pantalla) y `_cadete.js` (el portal): las dos puntas escriben `estado` y `cobrado`, y las dos tienen que decir lo mismo.
// Qué verbo corresponde lo decide `verboDeVenta` (`lib/envios/venta.core.js`), mirando la fila antes y después.
//
// 🔴 **Nunca tira.** Envíos lo usa el equipo de verdad y el ERP es la prueba: si el motor no está conectado o
// contesta un error, el envío ya quedó escrito y esto devuelve `{ aviso }` para mostrar (⛔ un 500).
//
// 🔑 **La base del motor es la de la marca del envío** (`store`): Envíos guarda las dos marcas en la base de BDI, pero
// la venta de Zattia (y la de Stunned, que vive en la de Zattia) está en la otra. ⛔ el motor lee Envíos.
import { SIN_AVISO, verboDeVenta } from '../lib/envios/venta.core.js'
import { configPg } from '../lib/pg.core.js'

const PG_DE_STORE = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

/** Corre `fn(db, motor)` con la conexión del motor de la marca; sin la variable, `null` (⛔ está conectado). */
async function conMotor(store, fn) {
  const conexion = process.env[PG_DE_STORE[store]]
  if (!conexion) return null
  const [{ default: pg }, contraentrega, registrar] = await Promise.all([
    import('pg'),
    import('../motor/venta/contraentrega.mjs'),
    import('../motor/venta/registrar.mjs'),
  ])
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  try {
    await db.connect()
    return await fn(db, { ...contraentrega, ...registrar })
  } finally {
    await db.end().catch(() => {})
  }
}

const TEXTO = {
  corregir: 'No se pudo anotar el cobro en la venta del ERP',
  reabrir: 'No se pudo volver a dejar la venta del ERP sin cobrar',
}

/**
 * Lo que el motor tiene que saber de este cambio del envío. `antes`/`despues`: `{ store, estado, cobrado, venta_id }`
 * (null = no existía / se eliminó). Devuelve `{}` o `{ aviso }`.
 */
export async function seguirVenta({ antes, despues, usuario }) {
  const v = verboDeVenta(antes, despues)
  if (!v) return {}
  const store = (despues && despues.store) || (antes && antes.store)
  try {
    const r = await conMotor(store, (db, m) =>
      v.verbo === 'corregir'
        ? m.corregirContraentrega(db, { venta_id: v.venta_id, como: v.como, usuario: usuario || 'envíos' })
        : m.reabrirContraentrega(db, { venta_id: v.venta_id, usuario: usuario || 'envíos' }),
    )
    if (r === null) return { aviso: `${TEXTO[v.verbo]}: el ERP de ${store} no está conectado.` }
    if (r.ok || SIN_AVISO.includes(r.error?.codigo)) return {}
    console.error(`[envios-venta] ${v.verbo} ${v.venta_id}: ${r.error?.codigo} ${r.error?.mensaje}`)
    return { aviso: `${TEXTO[v.verbo]}: ${r.error?.mensaje || r.error?.codigo}.` }
  } catch (e) {
    console.error(`[envios-venta] ${v.verbo} ${v.venta_id}: ${e.message}`)
    return { aviso: `${TEXTO[v.verbo]}.` }
  }
}

/**
 * «No entregado» sin reintento ⇒ ANULAR la venta (§20.4, la anulación de §17: la prenda vuelve «a recibir»). Primero
 * se reabre por si la venta llegó a cerrarse (la plata ⛔ entró ⇒ ⛔ se devuelve); lo que se haya pagado aparte (una
 * seña) vuelve en plata por donde entró. Devuelve `{ ok }` o `{ status, error }`.
 */
export async function anularVentaDeEnvio({ envio, usuario }) {
  const r = await conMotor(envio.store, async (db, m) => {
    const re = await m.reabrirContraentrega(db, { venta_id: envio.venta_id, usuario })
    if (!re.ok && !SIN_AVISO.includes(re.error?.codigo)) return re
    return m.anularVenta(db, {
      venta_id: envio.venta_id,
      motivo: `No entregado (Envíos${envio.orden_numero ? `, pedido ${envio.orden_numero}` : ''})`,
      usuario,
      devolucion: { forma: 'plata' },
    })
  })
  if (r === null) return { status: 409, error: `El ERP de ${envio.store} no está conectado.` }
  if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADA' ? 404 : 409, error: r.error?.mensaje || 'No se pudo anular la venta.' }
  return { ok: true, vuelta: r.vuelta ?? null }
}
