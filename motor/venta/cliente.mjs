/**
 * La ficha de la clienta (contrato §11, `sql/010-cliente.sql`). Alcance MÍNIMO (Bruno, 14-oct): lo que el ERP necesita
 * para operar —saldo a favor, factura A, mayoristas con cuenta corriente—, ⛔ un CRM. Una ficha POR EMPRESA, por documento.
 *
 * `guardarCliente`: la busca por documento o la crea; lo que viene con dato PISA (corregir un mail, sumar el CUIT de la
 * factura A), lo que viene vacío ⛔ borra. `buscarClientes`: por documento (prefijo) o por nombre, para la Caja.
 * Devuelven `{ ok: true, … }` o `{ ok: false, error }`. Sólo lanzan si la BASE falla.
 */
import { COND_IVA, cuitValido } from '../arca/arca.core.js'

const q = async (db, sql, params = []) => (await db.query(sql, params)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const CONDICIONES = new Set(Object.values(COND_IVA))
const COLUMNAS = 'id, empresa_id, doc, nombre, razon_social, condicion_iva, domicilio, whatsapp, email, gn_client_id, creado_en, actualizado_en'
/** Igual que `numeroWhatsapp` del monitor (`lib/erp/resumen-cuenta.core.js`): 54 9 + 10 dígitos o null. */
export function numeroWhatsapp(crudo) {
  let d = String(crudo ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) { d = d.slice(2); if (d.startsWith('9')) d = d.slice(1) }
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 12) for (const area of [2, 3, 4]) if (d.slice(area, area + 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break }
  return d.length === 10 ? `549${d}` : null
}
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** DNI (7-8 dígitos) o CUIT (11, con su verificador). '' si ⛔ es ninguno. */
export function docValido(doc) {
  const d = typeof doc === 'string' || typeof doc === 'number' ? String(doc).replace(/\D/g, '') : ''
  if (d.length === 7 || d.length === 8) return d
  if (d.length === 11 && cuitValido(d)) return d
  return ''
}

/**
 * @param {import('pg').ClientBase} db
 * @param {{ empresa_id: string, doc: string|number, nombre: string, razon_social?: string, condicion_iva?: number,
 *   domicilio?: string, whatsapp?: string, email?: string, gn_client_id?: number }} e
 */
export async function guardarCliente(db, e) {
  const doc = docValido(e?.doc)
  if (!doc) return falla('DOC_INVALIDO', 'El documento es un DNI (7 u 8 números) o un CUIT válido (11)', 'doc')
  const nombre = texto(e.nombre)
  if (!nombre) return falla('FALTA_CLIENTE', 'Falta el nombre de la clienta', 'nombre')
  const cond = e.condicion_iva == null || e.condicion_iva === '' ? null : Number(e.condicion_iva)
  if (cond != null && !CONDICIONES.has(cond)) return falla('ENTRADA_INVALIDA', 'La condición de IVA es 1 (RI), 4 (exento), 5 (consumidor final) o 6 (monotributo)', 'condicion_iva')
  if ((cond === COND_IVA.RESPONSABLE_INSCRIPTO || cond === COND_IVA.MONOTRIBUTO) && doc.length !== 11) {
    return falla('DOC_INVALIDO', 'Un responsable inscripto o monotributista va con su CUIT', 'doc')
  }
  const [emp] = await q(db, 'select id from empresa where id = $1', [e.empresa_id])
  if (!emp) return falla('ENTRADA_INVALIDA', 'No está esa empresa', 'empresa_id')
  // Una sola sentencia: el `unique` parcial de 007 hace que dos a la vez den la misma ficha.
  const [r] = await q(db, `insert into cliente (empresa_id, doc, nombre, razon_social, condicion_iva, domicilio, whatsapp, email, gn_client_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    on conflict (empresa_id, doc) where doc is not null do update set
      nombre = excluded.nombre,
      razon_social = coalesce(excluded.razon_social, cliente.razon_social),
      condicion_iva = coalesce(excluded.condicion_iva, cliente.condicion_iva),
      domicilio = coalesce(excluded.domicilio, cliente.domicilio),
      whatsapp = coalesce(excluded.whatsapp, cliente.whatsapp),
      email = coalesce(excluded.email, cliente.email),
      gn_client_id = coalesce(excluded.gn_client_id, cliente.gn_client_id),
      actualizado_en = now()
    returning ${COLUMNAS}, (xmax = 0) as creado`,
  [e.empresa_id, doc, nombre, texto(e.razon_social), cond, texto(e.domicilio), texto(e.whatsapp), texto(e.email), e.gn_client_id ?? null])
  const { creado, ...cliente } = r
  return { ok: true, cliente, creado }
}

/**
 * La ficha del cliente de GN SIN documento (la mayorista del espejo: ⛔ trae el DNI/CUIT; sql/030), por `gn_client_id`.
 * Lo que viene con dato pone al día el nombre y el contacto (⛔ borra); `actualizado_en` cambia sólo si algo cambió.
 * @param {import('pg').ClientBase} db
 * @param {{ empresa_id: string, gn_client_id: number, nombre: string, whatsapp?: string, email?: string }} e
 */
export async function guardarClienteGN(db, e) {
  const gn = Number(e?.gn_client_id)
  if (!Number.isInteger(gn) || gn <= 0) return falla('FALTA_CLIENTE', 'El cliente de GN es un número', 'cliente.gn_client_id')
  const nombre = texto(e.nombre)
  if (!nombre) return falla('FALTA_CLIENTE', 'Falta el nombre de la clienta', 'cliente.nombre')
  const [r] = await q(db, `insert into cliente (empresa_id, nombre, whatsapp, email, gn_client_id) values ($1, $2, $3, $4, $5)
    on conflict (empresa_id, gn_client_id) where gn_client_id is not null do update set
      nombre = excluded.nombre,
      whatsapp = coalesce(excluded.whatsapp, cliente.whatsapp),
      email = coalesce(excluded.email, cliente.email),
      actualizado_en = case when (cliente.nombre, cliente.whatsapp, cliente.email) is not distinct from
        (excluded.nombre, coalesce(excluded.whatsapp, cliente.whatsapp), coalesce(excluded.email, cliente.email)) then cliente.actualizado_en else now() end
    returning ${COLUMNAS}, (xmax = 0) as creado`, [e.empresa_id, nombre, texto(e.whatsapp), texto(e.email), gn])
  const { creado, ...cliente } = r
  return { ok: true, cliente, creado }
}

/**
 * El WhatsApp / mail de un cliente POR SU `id` (la cuenta corriente trae `clienteId`; las mayoristas de GN ⛔ tienen documento).
 * 🔑 El único verbo que PONE contacto sin pasar por el documento. Lo que viene con dato pisa, ⛔ borra (un campo ausente no se
 * toca) y el WhatsApp ⛔ se adivina: se normaliza a 549 + 10 dígitos o se rechaza (un número mal armado le escribe a OTRA persona).
 * `actualizado_en` cambia sólo si algo cambió.
 * @param {import('pg').ClientBase} db
 * @param {{ empresa_id: string, cliente_id: string (uuid), whatsapp?: string, email?: string }} e
 */
export async function ponerContactoCliente(db, e) {
  const id = typeof e?.cliente_id === 'string' ? e.cliente_id.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return falla('FALTA_CLIENTE', 'Falta el cliente', 'cliente_id')
  const crudoWa = texto(e.whatsapp)
  const whatsapp = crudoWa == null ? null : numeroWhatsapp(crudoWa)
  if (crudoWa != null && !whatsapp) return falla('ENTRADA_INVALIDA', 'No se puede asegurar ese WhatsApp: código de área + número, sin el 15', 'whatsapp')
  const email = texto(e.email)
  if (email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return falla('ENTRADA_INVALIDA', 'Ese mail no parece un mail', 'email')
  if (whatsapp == null && email == null) return falla('ENTRADA_INVALIDA', 'Falta el WhatsApp o el mail', 'whatsapp')
  const [r] = await q(db, `update cliente set whatsapp = coalesce($3, whatsapp), email = coalesce($4, email),
      actualizado_en = case when (whatsapp, email) is not distinct from (coalesce($3, whatsapp), coalesce($4, email)) then actualizado_en else now() end
    where empresa_id = $1 and id = $2 returning ${COLUMNAS}`, [e.empresa_id, id, whatsapp, email])
  if (!r) return falla('FALTA_CLIENTE', 'No está ese cliente en esa empresa', 'cliente_id')
  return { ok: true, cliente: r }
}

/**
 * Por documento (si `texto` son sólo números: prefijo) o por nombre (contiene). Hasta `limite` (10).
 * @param {import('pg').ClientBase} db @param {{ empresa_id: string, texto: string, limite?: number }} e
 */
export async function buscarClientes(db, e) {
  const t = texto(e?.texto)
  if (!t || t.length < 2) return { ok: true, clientes: [] }
  const limite = Math.min(Math.max(Number(e.limite) || 10, 1), 50)
  const soloNumeros = /^[\d.\s-]+$/.test(t)
  const clientes = soloNumeros
    ? await q(db, `select ${COLUMNAS} from cliente where empresa_id = $1 and doc like $2 order by doc limit $3`, [e.empresa_id, `${t.replace(/\D/g, '')}%`, limite])
    : await q(db, `select ${COLUMNAS} from cliente where empresa_id = $1 and lower(nombre) like $2 order by nombre limit $3`,
      [e.empresa_id, `%${t.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limite])
  return { ok: true, clientes }
}
