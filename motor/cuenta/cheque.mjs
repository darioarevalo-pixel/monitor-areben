/**
 * Los CHEQUES RECIBIDOS y su cartera (sql/079; Bruno 10-nov, las 5 decisiones en la cabecera de la migración).
 *
 * 🔑 RECIBIR un cheque ⛔ es un verbo aparte: es `registrarPagoACuenta` con la cuenta de cobro «Cheque» y `cheque: {…}` — baja la
 *    deuda en el momento y el cheque queda EN CARTERA, sin cuenta real. Acá están los datos (`validarCheque`) y lo que le pasa
 *    después: depositarlo (se ELIGE la cuenta), acreditarlo y rechazarlo (la deuda VUELVE: se anula su pago a cuenta).
 * ⛔ endoso (Bruno, 10-nov: «más adelante»).
 *
 * Devuelven `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`, como la venta. Las que escriben abren su
 * transacción (`db` conectado y sin transacción).
 */
import { cuentaBloqueada, hoyAR, insertarFila } from './libro.mjs'

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i
const texto = (x) => (typeof x === 'string' ? x.trim() : '')

export const TIPOS_CHEQUE = ['fisico', 'echeq']
export const ESTADOS_CHEQUE = ['en_cartera', 'depositado', 'acreditado', 'rechazado', 'anulado']
/** Las palabras de la pantalla (`VOCABULARIO.md` §5 del monitor). */
export const NOMBRE_ESTADO_CHEQUE = { en_cartera: 'En cartera', depositado: 'Depositado', acreditado: 'Acreditado', rechazado: 'Rechazado', anulado: 'Anulado' }
/** Dónde se deposita: un banco, una billetera o la caja (un físico cobrado por ventanilla). ⛔ tránsito. */
export const TIPOS_CUENTA_DEPOSITO = ['banco', 'billetera', 'caja']

/** El número como se compara: sin espacios, puntos ni guiones, y sin ceros adelante («00012345» = «12.345»). */
export const numeroDeCheque = (x) => texto(String(x ?? '')).replace(/[\s.\-_/]/g, '').toUpperCase().replace(/^0+(?=.)/, '')
/** El día AR (AAAA-MM-DD) de un instante. */
const diaAR = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10)

/**
 * Los datos de un cheque que entra con un pago. Puro.
 * @param {any} c `{ tipo, numero, banco, librador, librador_cuit?, emitido_el?, vence_el }`
 * @returns {{ ok: true, cheque: object } | { ok: false, error: object }}
 */
export function validarCheque(c) {
  if (!c || typeof c !== 'object') return fallo('ENTRADA_INVALIDA', 'Faltan los datos del cheque', 'cheque')
  if (!TIPOS_CHEQUE.includes(c.tipo)) return fallo('ENTRADA_INVALIDA', 'El cheque es físico o eCheq', 'cheque.tipo')
  const numero = numeroDeCheque(c.numero)
  if (!numero) return fallo('ENTRADA_INVALIDA', 'Falta el número del cheque', 'cheque.numero')
  if (numero.length > 30) return fallo('ENTRADA_INVALIDA', 'El número del cheque es demasiado largo', 'cheque.numero')
  const banco = texto(c.banco)
  if (!banco) return fallo('ENTRADA_INVALIDA', 'Falta el banco', 'cheque.banco')
  const librador = texto(c.librador)
  if (!librador) return fallo('ENTRADA_INVALIDA', 'Falta quién firma el cheque (el librador)', 'cheque.librador')
  const cuit = c.librador_cuit == null || c.librador_cuit === '' ? null : String(c.librador_cuit).replace(/\D/g, '')
  if (cuit != null && cuit.length !== 11) return fallo('ENTRADA_INVALIDA', 'El CUIT del librador tiene 11 números', 'cheque.librador_cuit')
  const vence = texto(c.vence_el)
  if (!FECHA.test(vence) || Number.isNaN(Date.parse(vence))) return fallo('ENTRADA_INVALIDA', 'Falta la fecha de pago del cheque', 'cheque.vence_el')
  const emitido = c.emitido_el == null || c.emitido_el === '' ? null : texto(c.emitido_el)
  if (emitido != null && (!FECHA.test(emitido) || Number.isNaN(Date.parse(emitido)))) return fallo('ENTRADA_INVALIDA', 'Fecha de emisión inválida', 'cheque.emitido_el')
  if (emitido != null && emitido > vence) return fallo('ENTRADA_INVALIDA', 'La fecha de pago no puede ser anterior a la de emisión', 'cheque.vence_el')
  return { ok: true, cheque: { tipo: c.tipo, numero, banco, librador, librador_cuit: cuit, emitido_el: emitido, vence_el: vence } }
}

/**
 * Anota el cheque de un pago a cuenta. Lo llama `registrarPagoACuenta` DENTRO de su transacción, antes de anotar el pago.
 * Un cheque vivo (⛔ anulado ni rechazado) con el mismo banco y número ⇒ `CHEQUE_REPETIDO`.
 */
export async function anotarCheque(db, { empresa_id, marca, cliente_id, pago_ref, monto, prueba, usuario, cheque }) {
  const [otro] = await q(db, `select e.id, e.estado, e.monto::float as monto, c.nombre as cliente from cheque_estado e join cliente c on c.id = e.cliente_id
     where e.empresa_id = $1 and e.prueba = $2 and lower(e.banco) = lower($3) and e.numero = $4 and e.estado not in ('anulado', 'rechazado') limit 1`,
  [empresa_id, prueba, cheque.banco, cheque.numero])
  if (otro) return fallo('CHEQUE_REPETIDO', `El cheque ${cheque.numero} del ${cheque.banco} ya está cargado (${otro.cliente ?? 'otro cliente'}, $${otro.monto})`, 'cheque.numero')
  const [fila] = await q(db, `insert into cheque (empresa_id, marca, cliente_id, pago_ref, tipo, numero, banco, librador, librador_cuit, emitido_el, vence_el, monto, prueba, usuario)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id::text`,
  [empresa_id, marca, cliente_id, pago_ref, cheque.tipo, cheque.numero, cheque.banco, cheque.librador, cheque.librador_cuit, cheque.emitido_el, cheque.vence_el, monto, prueba, usuario])
  return { ok: true, id: fila.id }
}

async function enTransaccion(db, fn) {
  await db.query('begin')
  try {
    const r = await fn()
    await db.query(r && r.ok ? 'commit' : 'rollback')
    return r
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

/** El cheque con su estado, BLOQUEADO hasta el fin de la transacción (dos manos a la vez ⛔ lo depositan dos veces). */
async function chequeBloqueado(db, { empresa_id, cheque_id }) {
  if (!UUID.test(String(cheque_id ?? ''))) return null
  const [c] = await q(db, 'select id from cheque where empresa_id = $1 and id = $2 for update', [empresa_id, cheque_id])
  if (!c) return null
  const [e] = await q(db, `select *, monto::float as monto, to_char(vence_el, 'YYYY-MM-DD') as vence_dia from cheque_estado where id = $1`, [cheque_id])
  return e
}

function entradaDeEvento(e) {
  if (!texto(e?.empresa_id)) return fallo('ENTRADA_INVALIDA', 'Falta la empresa', 'empresa_id')
  if (!UUID.test(String(e?.cheque_id ?? ''))) return fallo('ENTRADA_INVALIDA', 'Falta el cheque', 'cheque_id')
  if (!texto(e.usuario)) return fallo('ENTRADA_INVALIDA', 'Falta quién lo registra', 'usuario')
  if (e.ocurrida_en != null && Number.isNaN(Date.parse(e.ocurrida_en))) return fallo('ENTRADA_INVALIDA', 'Fecha inválida', 'ocurrida_en')
  return null
}

const enEstado = (c, ...estados) => estados.includes(c.estado)
const fueraDeEstado = (c, verbo) => fallo('CHEQUE_ESTADO', `El cheque está ${NOMBRE_ESTADO_CHEQUE[c.estado].toLowerCase()}: no se puede ${verbo}`, 'cheque_id')

async function anotarEvento(db, { empresa_id, cheque_id, estado, cuenta_real_id = null, motivo = null, usuario, en }) {
  await q(db, `insert into cheque_evento (empresa_id, cheque_id, estado, cuenta_real_id, motivo, usuario, ocurrida_en) values ($1, $2, $3, $4, $5, $6, $7)`,
    [empresa_id, cheque_id, estado, cuenta_real_id, motivo, usuario, en])
}

/**
 * DEPOSITAR (o cobrar por ventanilla, o aceptar el eCheq): sale de cartera a la cuenta que elige quien lo deposita. Desde su fecha de
 * pago (antes el banco ⛔ lo toma).
 * @param {{ empresa_id: string, cheque_id: string, cuenta_real_id: string, usuario: string, ocurrida_en?: string }} e
 */
export async function depositarCheque(db, e) {
  const mal = entradaDeEvento(e)
  if (mal) return mal
  if (!UUID.test(String(e.cuenta_real_id ?? ''))) return fallo('ENTRADA_INVALIDA', 'Falta en qué cuenta se deposita', 'cuenta_real_id')
  return enTransaccion(db, async () => {
    const c = await chequeBloqueado(db, e)
    if (!c) return fallo('NO_ENCONTRADO', 'No está ese cheque', 'cheque_id')
    if (!enEstado(c, 'en_cartera')) return fueraDeEstado(c, 'depositar')
    const [r] = await q(db, 'select id, tipo, activa, empresa_id from cuenta_real where id = $1', [e.cuenta_real_id])
    if (!r || r.empresa_id !== e.empresa_id || !r.activa) return fallo('CUENTA_REAL_DESCONOCIDA', 'Esa cuenta no está o está inactiva', 'cuenta_real_id')
    if (!TIPOS_CUENTA_DEPOSITO.includes(r.tipo)) return fallo('CUENTA_REAL_DESCONOCIDA', 'Un cheque se deposita en un banco, una billetera o la caja', 'cuenta_real_id')
    const en = new Date(e.ocurrida_en ?? Date.now()).toISOString()
    if (diaAR(en) < venceDe(c)) {
      return fallo('CHEQUE_NO_VENCE', `El cheque se puede depositar desde el ${venceDe(c)}`, 'ocurrida_en')
    }
    await anotarEvento(db, { empresa_id: e.empresa_id, cheque_id: c.id, estado: 'depositado', cuenta_real_id: r.id, usuario: texto(e.usuario), en })
    return { ok: true, cheque: { id: c.id, estado: 'depositado', cuenta_real_id: r.id } }
  })
}

const venceDe = (c) => c.vence_dia

/**
 * ACREDITAR: la plata ya está en la cuenta donde se depositó.
 * @param {{ empresa_id: string, cheque_id: string, usuario: string, ocurrida_en?: string }} e
 */
export async function acreditarCheque(db, e) {
  const mal = entradaDeEvento(e)
  if (mal) return mal
  return enTransaccion(db, async () => {
    const c = await chequeBloqueado(db, e)
    if (!c) return fallo('NO_ENCONTRADO', 'No está ese cheque', 'cheque_id')
    if (!enEstado(c, 'depositado')) return fueraDeEstado(c, 'acreditar')
    const en = new Date(e.ocurrida_en ?? Date.now()).toISOString()
    if (Date.parse(en) < new Date(c.depositado_en).getTime()) return fallo('ENTRADA_INVALIDA', 'Se acredita después de depositarlo', 'ocurrida_en')
    await anotarEvento(db, { empresa_id: e.empresa_id, cheque_id: c.id, estado: 'acreditado', usuario: texto(e.usuario), en })
    return { ok: true, cheque: { id: c.id, estado: 'acreditado' } }
  })
}

/**
 * RECHAZAR (rebotó): la deuda VUELVE a la cuenta del cliente — se anula su pago a cuenta, con el motivo — en la misma transacción.
 * Desde la cartera o depositado (⛔ acreditado: ya es plata).
 * @param {{ empresa_id: string, cheque_id: string, motivo: string, usuario: string, ocurrida_en?: string }} e
 */
export async function rechazarCheque(db, e) {
  const mal = entradaDeEvento(e)
  if (mal) return mal
  const motivo = texto(e.motivo)
  if (!motivo) return fallo('FALTA_MOTIVO', 'Falta por qué se rechazó (sin fondos, firma…)', 'motivo')
  return enTransaccion(db, async () => {
    const c = await chequeBloqueado(db, e)
    if (!c) return fallo('NO_ENCONTRADO', 'No está ese cheque', 'cheque_id')
    if (!enEstado(c, 'en_cartera', 'depositado')) return fueraDeEstado(c, 'rechazar')
    await cuentaBloqueada(db, { cliente_id: c.cliente_id, marca: c.marca, prueba: c.prueba })
    const [p] = await q(db, `select monto::float as monto from cuenta_movimiento where empresa_id = $1 and ref = $2 and tipo = 'pago'`, [e.empresa_id, c.pago_ref])
    if (!p) return fallo('NO_ENCONTRADO', 'No está el pago de ese cheque', 'cheque_id')
    const usuario = texto(e.usuario)
    const en = new Date(e.ocurrida_en ?? Date.now()).toISOString()
    await anotarEvento(db, { empresa_id: e.empresa_id, cheque_id: c.id, estado: 'rechazado', motivo, usuario, en })
    await insertarFila(db, {
      empresa_id: e.empresa_id, marca: c.marca, cliente_id: c.cliente_id, tipo: 'anulacion', ref: `${c.pago_ref}:anulacion`, monto: -p.monto,
      detalle: { motivo: `Cheque rechazado: ${motivo}`, cheque_id: c.id }, prueba: c.prueba, usuario, ocurrida_en: en,
    })
    const [s] = await q(db, 'select coalesce(sum(monto), 0)::float as s from cuenta_movimiento where cliente_id = $1 and marca = $2 and prueba = $3', [c.cliente_id, c.marca, c.prueba])
    return { ok: true, cheque: { id: c.id, estado: 'rechazado' }, cuenta: s.s }
  })
}

/**
 * La CARTERA: los cheques de la marca con su estado, cliente y cuenta de depósito, y los totales por estado (los suma el motor).
 * Primero los que vencen antes.
 * @param {{ empresa_id: string, marca: string, prueba?: boolean, estado?: string|null, hoy?: string|null }} e
 */
export async function chequesDe(db, { empresa_id, marca, prueba = false, estado = null, hoy = null }) {
  if (estado != null && !ESTADOS_CHEQUE.includes(estado)) return fallo('ENTRADA_INVALIDA', `Estado desconocido: ${estado}`, 'estado')
  const dia = hoy ?? await hoyAR(db)
  const filas = await q(db, `select e.id::text, e.cliente_id::text, c.nombre as cliente, e.tipo, e.numero, e.banco, e.librador, e.librador_cuit,
         to_char(e.emitido_el, 'YYYY-MM-DD') as emitido_el, to_char(e.vence_el, 'YYYY-MM-DD') as vence_el, e.monto::float as monto, e.estado,
         e.pago_ref, e.usuario, e.creado_en, e.cuenta_real_id::text, r.nombre as cuenta_real, r.banco as cuenta_real_banco, r.titular as cuenta_real_titular,
         e.depositado_en, e.acreditado_en, e.rechazado_en, e.motivo_rechazo
    from cheque_estado e join cliente c on c.id = e.cliente_id left join cuenta_real r on r.id = e.cuenta_real_id
   where e.empresa_id = $1 and e.marca = $2 and e.prueba = $3
   order by e.vence_el, e.creado_en, e.id`, [empresa_id, marca, prueba])
  const totales = Object.fromEntries(ESTADOS_CHEQUE.map((k) => [k, { cantidad: 0, monto: 0 }]))
  for (const f of filas) {
    totales[f.estado].cantidad += 1
    totales[f.estado].monto = Math.round((totales[f.estado].monto + f.monto) * 100) / 100
    f.se_puede_depositar = f.estado === 'en_cartera' && f.vence_el <= dia
  }
  return { ok: true, hoy: dia, cheques: estado ? filas.filter((f) => f.estado === estado) : filas, totales }
}
