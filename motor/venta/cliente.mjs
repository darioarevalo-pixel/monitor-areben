/**
 * La ficha de la clienta (contrato §11, `sql/010-cliente.sql`). Alcance MÍNIMO (Bruno, 14-oct): lo que el ERP necesita
 * para operar —saldo a favor, factura A, mayoristas con cuenta corriente—, ⛔ un CRM. Una ficha POR EMPRESA, por documento.
 *
 * `guardarCliente`: la busca por documento o la crea; lo que viene con dato PISA (corregir un mail, sumar el CUIT de la
 * factura A), lo que viene vacío ⛔ borra. `buscarClientes`: por documento (prefijo) o por nombre, para la Caja. `clientePorWhatsapp` · `anotarWhatsapp` · `sacarWhatsapp` · `whatsappsDe`: el panel de WhatsApp (la empresa con varias personas).
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
 * La ficha por WhatsApp (plan «BDI directo al ERP», 30-oct): el panel de WhatsApp de Darío reconoce al cliente del chat.
 * 🔑 El cliente es la EMPRESA con VARIAS PERSONAS que compran (pedido de Darío §1, Bruno 30-oct): primero va por los números
 * ANOTADOS (`cliente_whatsapp`, sql/062) —uno activo es de una sola ficha ⇒ da una—; si ⛔ está anotado, por el número de la
 * ficha (`cliente.whatsapp`). 🔴 Ése está guardado CRUDO (medido en BDI 30-oct: 10.367 de 13.315 como `54…` sin el 9, con y
 * sin «+», con el 15) ⇒ el índice va por los ÚLTIMOS 6 DÍGITOS y la igualdad la decide `numeroWhatsapp` acá. Ahí puede haber
 * MÁS DE UNA (329 números repetidos medidos): devuelve todas, la que se movió último primero; elegir es del que llama
 * (anotando el número, la próxima vez da una).
 * @param {import('pg').ClientBase} db @param {{ empresa_id: string, whatsapp: string }} e
 * @returns {Promise<{ ok: true, clientes: any[], persona: { id: string, nombre: string|null } | null } | { ok: false, error: any }>}
 */
export async function clientePorWhatsapp(db, e) {
  const wa = numeroWhatsapp(e?.whatsapp)
  if (!wa) return falla('ENTRADA_INVALIDA', 'No se puede asegurar ese WhatsApp: código de área + número, sin el 15', 'whatsapp')
  const [anotado] = await q(db, `select ${COLUMNAS.split(', ').map((c) => `c.${c}`).join(', ')}, w.id::text as persona_id, w.nombre as persona
    from cliente_whatsapp w join cliente c on c.id = w.cliente_id where w.empresa_id = $1 and w.whatsapp = $2 and w.activo`, [e.empresa_id, wa])
  if (anotado) {
    const { persona_id, persona, ...cliente } = anotado
    return { ok: true, clientes: [cliente], persona: { id: persona_id, nombre: persona } }
  }
  const filas = await q(db, `select ${COLUMNAS} from cliente where empresa_id = $1 and whatsapp is not null and right(regexp_replace(whatsapp, '\\D', '', 'g'), 6) = $2
    order by coalesce(actualizado_en, creado_en) desc, id`, [e.empresa_id, wa.slice(-6)])
  return { ok: true, clientes: filas.filter((c) => numeroWhatsapp(c.whatsapp) === wa), persona: null }
}

/**
 * Anotar un número a la ficha, con QUIÉN es («¿Es de un cliente que ya tenés?», pedido de Darío §1). Idempotente: el mismo
 * número en la misma ficha sólo actualiza el nombre. Un número activo en OTRA ficha ⛔ se pisa: `YA_ANOTADO` (hay que sacarlo
 * de allá primero, a la vista).
 * @param {import('pg').ClientBase} db
 * @param {{ empresa_id: string, cliente_id: string, whatsapp: string, nombre?: string, usuario: string }} e
 */
export async function anotarWhatsapp(db, e) {
  const wa = numeroWhatsapp(e?.whatsapp)
  if (!wa) return falla('ENTRADA_INVALIDA', 'No se puede asegurar ese WhatsApp: código de área + número, sin el 15', 'whatsapp')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo anota', 'usuario')
  const [c] = await q(db, 'select id::text, nombre from cliente where id::text = $1 and empresa_id = $2', [String(e.cliente_id ?? ''), e.empresa_id])
  if (!c) return falla('FALTA_CLIENTE', 'No está ese cliente', 'cliente_id')
  const nombre = texto(e.nombre)
  const [ya] = await q(db, `select w.id::text, w.cliente_id::text, c.nombre as cliente from cliente_whatsapp w join cliente c on c.id = w.cliente_id
    where w.empresa_id = $1 and w.whatsapp = $2 and w.activo`, [e.empresa_id, wa])
  if (ya && ya.cliente_id !== c.id) return falla('YA_ANOTADO', `Ese número ya es de ${ya.cliente}`, 'whatsapp')
  const [r] = ya
    ? await q(db, `update cliente_whatsapp set nombre = coalesce($2, nombre) where id = $1 returning id::text, whatsapp, nombre, creado_en`, [ya.id, nombre])
    : await q(db, `insert into cliente_whatsapp (empresa_id, cliente_id, whatsapp, nombre, usuario) values ($1, $2, $3, $4, $5)
      returning id::text, whatsapp, nombre, creado_en`, [e.empresa_id, c.id, wa, nombre, usuario])
  return { ok: true, persona: r, ya_estaba: !!ya }
}

/**
 * Sacar a alguien de la lista (dejó de estar): ⛔ se borra, queda inactivo con quién y cuándo; sus pedidos viejos lo siguen
 * nombrando. Sacar uno ya sacado ⇒ `ok` sin cambiar nada.
 * @param {import('pg').ClientBase} db @param {{ empresa_id: string, id: string, usuario: string }} e
 */
export async function sacarWhatsapp(db, e) {
  const usuario = texto(e?.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo saca', 'usuario')
  const [r] = await q(db, `update cliente_whatsapp set activo = false, sacado_por = $3, sacado_en = now()
    where id::text = $1 and empresa_id = $2 and activo returning id::text`, [String(e.id ?? ''), e.empresa_id, usuario])
  if (r) return { ok: true, sacado: true }
  const [hay] = await q(db, 'select 1 from cliente_whatsapp where id::text = $1 and empresa_id = $2', [String(e.id ?? ''), e.empresa_id])
  return hay ? { ok: true, sacado: false } : falla('NO_ENCONTRADO', 'No está ese número', 'id')
}

/** Las personas (números activos) de una ficha, la más vieja primero. @param {import('pg').ClientBase} db @param {{ cliente_id: string }} e */
export async function whatsappsDe(db, e) {
  return q(db, `select id::text, whatsapp, nombre, usuario, creado_en from cliente_whatsapp where cliente_id::text = $1 and activo order by creado_en, id`, [String(e?.cliente_id ?? '')])
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
