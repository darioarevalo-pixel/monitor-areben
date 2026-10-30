/**
 * El COMPRADOR de un pedido de TN.
 *
 * 1. Guardado (Bruno 29-oct, erp-stunned.md §2.21; sql/059): nombre, mail, teléfono y DNI van a la FICHA de cliente del ERP
 *    (`cliente`) y la orden la apunta (`tn_orden.cliente_id`) ⇒ la lista los lee de la base y la factura tiene los datos.
 *    🔴 La ficha casi siempre YA existe (la de GN, por mail: 5.420 de 5.486 en Zattia tienen mail y ⛔ DNI) ⇒ TN sólo LLENA
 *    lo vacío: ⛔ pisa un nombre ni un mail que cargó otro. Lo borra / devuelve la privacidad de TN (`privacidad.mjs`).
 * 2. En vivo (Bruno 19-oct): `compradores` lee el nombre de TN para lo que todavía ⛔ tiene ficha (órdenes de antes de 059).
 */
import { TIENDAS } from './orden.mjs'
import { docValido, numeroWhatsapp } from '../venta/cliente.mjs'

/** Lo que pide la pantalla por vez (la lista de «Sin pagar» de una marca: hoy ~30). */
export const MAX_IDS = 60

const limpio = (v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 120) : null)

/** El nombre de una orden de TN: el de contacto del pedido o, si falta, el de la clienta. Puro. */
export const nombreDeComprador = (o) => limpio(o?.contact_name) ?? limpio(o?.customer?.name)

/** `ids` de la URL ⇒ ids de TN válidos, sin repetir; null si ⛔ hay ninguno o son demasiados. Puro. */
export function idsDe(texto) {
  const ids = [...new Set(String(texto || '').split(',').map((x) => x.trim()).filter((x) => /^\d{1,15}$/.test(x)).map(Number))]
  return ids.length && ids.length <= MAX_IDS ? ids : null
}

/**
 * Los nombres, de a `paralelo` órdenes por vez. Una orden que TN ⛔ encuentra o que falla queda en null (⛔ frena las otras).
 * @param {string} tienda @param {number[]} ids @param {{ porId: (tienda: string, id: number) => Promise<any> }} deps
 */
export async function compradores(tienda, ids, { porId, paralelo = 4 }) {
  if (!TIENDAS[tienda]) throw new Error(`tienda desconocida: ${tienda}`)
  const out = {}
  let fallaron = 0
  for (let i = 0; i < ids.length; i += paralelo) {
    await Promise.all(ids.slice(i, i + paralelo).map(async (id) => {
      try { out[id] = nombreDeComprador(await porId(tienda, id)) } catch { out[id] = null; fallaron++ }
    }))
  }
  return { compradores: out, fallaron }
}

const mailDe = (v) => {
  const m = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) ? m.slice(0, 200) : null
}

/**
 * Lo que la orden de TN dice del comprador, listo para la ficha; null si ⛔ trae nombre (la ficha lo exige). Puro.
 * El teléfono ⛔ se adivina: 549 + 10 dígitos o nada (`numeroWhatsapp`: uno mal armado le escribe a OTRA persona).
 * @returns {{ nombre: string, email: string|null, whatsapp: string|null, doc: string|null, tn_customer_id: number|null } | null}
 */
export function compradorDeOrden(o) {
  const nombre = nombreDeComprador(o)
  if (!nombre) return null
  const c = o?.customer || {}
  const id = Number(c.id)
  return {
    nombre,
    email: mailDe(o.contact_email) ?? mailDe(c.email),
    whatsapp: numeroWhatsapp(o.contact_phone || c.phone || ''),
    doc: docValido(o.contact_identification ?? c.identification ?? '') || null,
    tn_customer_id: Number.isSafeInteger(id) && id > 0 ? id : null,
  }
}

/**
 * La ficha del comprador: la que la orden ya tenía, o por DNI, o por mail, o una nueva (`tn_tienda` = la tienda). A la
 * que se encuentra se le LLENA lo vacío (mail, WhatsApp, DNI si ⛔ es de otra ficha); ⛔ se pisa nada. Devuelve su `id`.
 * @param {{ q: (sql: string, p?: any[]) => Promise<any[]> }} db
 * @param {{ tienda: string, comprador: ReturnType<typeof compradorDeOrden>, actual?: string|null }} e
 */
export async function guardarComprador(db, { tienda, comprador: c, actual = null }) {
  if (!TIENDAS[tienda]) throw new Error(`tienda desconocida: ${tienda}`)
  if (!c) return actual
  const [m] = await db.q('select empresa_id from marca where id = $1', [tienda])
  if (!m) throw new Error(`la marca ${tienda} no está en esta base`)
  const emp = m.empresa_id
  let id = actual
  if (!id && c.doc) id = (await db.q('select id::text from cliente where empresa_id = $1 and doc = $2', [emp, c.doc]))[0]?.id ?? null
  if (!id && c.email) {
    id = (await db.q(`select id::text from cliente where empresa_id = $1 and lower(email) = $2
      order by (doc is not null) desc, creado_en desc limit 1`, [emp, c.email]))[0]?.id ?? null
  }
  if (id) {
    // El DNI sólo si ⛔ lo tiene otra ficha (el `unique` de 007). `actualizado_en`, sólo si algo cambió.
    const [r] = await db.q(`update cliente set
        email = coalesce(email, $3), whatsapp = coalesce(whatsapp, $4),
        doc = coalesce(doc, case when $5::text is not null and not exists (select 1 from cliente o where o.empresa_id = $1 and o.doc = $5) then $5 end),
        actualizado_en = case when (email, whatsapp, doc) is not distinct from (coalesce(email, $3), coalesce(whatsapp, $4), doc) then actualizado_en else now() end
      where empresa_id = $1 and id = $2 returning id::text`, [emp, id, c.email, c.whatsapp, c.doc])
    if (r) return r.id
    // La ficha que apuntaba la orden ya ⛔ está (borrada a pedido): se resuelve de cero.
    if (actual) return guardarComprador(db, { tienda, comprador: c, actual: null })
  }
  // Nueva. Con DNI, dos a la vez dan la misma (el `unique` parcial de 007).
  const [r] = await db.q(`insert into cliente (empresa_id, doc, nombre, whatsapp, email, tn_tienda) values ($1, $2, $3, $4, $5, $6)
    on conflict (empresa_id, doc) where doc is not null do update set doc = excluded.doc returning id::text`,
  [emp, c.doc, c.nombre, c.whatsapp, c.email, tienda])
  return r.id
}
