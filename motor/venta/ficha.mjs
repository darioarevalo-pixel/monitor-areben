/**
 * La FICHA de la venta: editar lo editable con historial, y las notas (sql/027, contrato-venta.md §16; pedido de la
 * sesión Diseño para el piloto de Ventas, 18-oct).
 *
 * 🔑 Lo ECONÓMICO ⛔ se edita (prendas, precios, pagos, total, marca, depósito): `reemplazarVenta` / `anularVenta` /
 * `registrarCambio`. Lo editable: el cliente, el vendedor, la entrega y los datos para facturar. Cada cambio deja su
 * fila en `venta_edicion` (campo, antes, después, quién, cuándo); un «cambio» que deja todo igual ⛔ deja fila.
 * Las notas son inmutables: editar una es agregar otra que la REEMPLAZA.
 *
 * `db` conectado y sin transacción (como `registrarVenta`): las que escriben abren la suya.
 * Devuelven `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`.
 */
import { COND_IVA } from '../arca/arca.core.js'
import { docValido } from './cliente.mjs'

const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const UUID = /^[0-9a-f-]{36}$/i
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export const EDITABLES = ['cliente_id', 'vendedor', 'entrega', 'facturar']
export const ENTREGAS = ['retira', 'envio', 'cadete']
export const ORIGENES_NOTA = ['usuario', 'tn', 'ml', 'catalogo', 'importacion']
const CONDICIONES = new Set(Object.values(COND_IVA))
/** El nombre del campo en el historial (el que ve la pantalla). */
const CAMPO = { cliente_id: 'cliente', vendedor: 'vendedor', entrega: 'entrega', facturar: 'facturar' }

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

/** Lo que pide cada campo, ya normalizado; `{ error }` si ⛔ sirve. */
function normalizar(campo, v) {
  if (campo === 'cliente_id') return v == null ? { valor: null } : UUID.test(String(v)) ? { valor: String(v) } : { error: 'El cliente es su id' }
  if (campo === 'vendedor') return v == null || typeof v === 'string' ? { valor: texto(v) } : { error: 'El vendedor es un texto' }
  if (campo === 'entrega') {
    if (v == null) return { valor: null }
    if (!ENTREGAS.includes(v?.tipo)) return { error: `La entrega es ${ENTREGAS.join(', ')}` }
    const direccion = texto(v.direccion)
    if (v.tipo !== 'retira' && !direccion) return { error: 'El envío y el cadete llevan la dirección' }
    return { valor: v.tipo === 'retira' ? { tipo: 'retira' } : { tipo: v.tipo, direccion } }
  }
  // facturar
  if (v == null) return { valor: null }
  const doc = docValido(v?.doc)
  if (!doc) return { error: 'El documento es un DNI (7 u 8 números) o un CUIT válido (11)' }
  const cond = Number(v.condicion_iva)
  if (!CONDICIONES.has(cond)) return { error: 'La condición de IVA es 1 (RI), 4 (exento), 5 (consumidor final) o 6 (monotributo)' }
  if ((cond === COND_IVA.RESPONSABLE_INSCRIPTO || cond === COND_IVA.MONOTRIBUTO) && doc.length !== 11) return { error: 'Un responsable inscripto o monotributista va con su CUIT' }
  return { valor: { doc, condicion_iva: cond } }
}

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Editar lo editable de una venta. ⛔ si está anulada (`ANULADA`); los datos para facturar ⛔ si ya tiene factura
 * (`YA_FACTURADA`: se corrige con nota de crédito); el cliente ⛔ si la venta movió su cuenta corriente o su saldo a
 * favor (`CLIENTE_CON_CUENTA`: la deuda es de ese cliente ⇒ se anula y se rehace).
 * @param {{ venta_id: string, cambios: { cliente_id?: string|null, vendedor?: string|null,
 *   entrega?: { tipo: 'retira'|'envio'|'cadete', direccion?: string }|null, facturar?: { doc: string, condicion_iva: number }|null },
 *   usuario: string }} e
 */
export async function editarVenta(db, e) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién la edita', 'usuario')
  const cambios = e.cambios
  if (!cambios || typeof cambios !== 'object' || !Object.keys(cambios).length) return falla('ENTRADA_INVALIDA', 'No hay nada que cambiar', 'cambios')
  const nuevos = {}
  for (const [k, v] of Object.entries(cambios)) {
    if (!EDITABLES.includes(k)) return falla('NO_EDITABLE', `«${k}» no se edita: se corrige con un cambio, un reemplazo o anulando`, `cambios.${k}`)
    const n = normalizar(k, v)
    if (n.error) return falla('ENTRADA_INVALIDA', n.error, `cambios.${k}`)
    nuevos[k] = n.valor
  }
  return enTransaccion(db, async () => {
    const [v] = await q(db, 'select id, empresa_id, numero, estado, cliente_id::text, vendedor, entrega, facturar from venta where id = $1 for update', [e.venta_id])
    if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
    if (v.estado === 'anulada') return falla('ANULADA', `La venta ${v.numero} está anulada`)
    const cambia = Object.keys(nuevos).filter((k) => !igual(v[k], nuevos[k]))
    if (cambia.includes('facturar')) {
      const [f] = await q(db, `select 1 from venta_factura where venta_id = $1 and tipo = 'factura' limit 1`, [v.id])
      if (f) return falla('YA_FACTURADA', `La venta ${v.numero} ya está facturada: los datos se corrigen con una nota de crédito`, 'cambios.facturar')
    }
    if (cambia.includes('cliente_id')) {
      if (nuevos.cliente_id) {
        const [c] = await q(db, 'select 1 from cliente where id = $1 and empresa_id = $2', [nuevos.cliente_id, v.empresa_id])
        if (!c) return falla('FALTA_CLIENTE', 'Ese cliente no está', 'cambios.cliente_id')
      }
      // Una base sin la 025 ⛔ tiene cuenta corriente: se mira sólo el saldo a favor (en una transacción, un error la aborta).
      const [{ cc }] = await q(db, `select to_regclass('cuenta_movimiento') is not null as cc`)
      const [{ hay }] = await q(db, `select exists (select 1 from saldo_favor_movimiento where venta_id = $1)
          ${cc ? 'or exists (select 1 from cuenta_movimiento where venta_id = $1)' : ''} as hay`, [v.id])
      if (hay) return falla('CLIENTE_CON_CUENTA', `La venta ${v.numero} movió la cuenta (o el saldo a favor) de su cliente: para cambiarlo se anula y se rehace`, 'cambios.cliente_id')
    }
    const ediciones = []
    for (const k of cambia) {
      const antes = k === 'cliente_id' ? await clienteVisible(db, v.cliente_id) : v[k]
      const despues = k === 'cliente_id' ? await clienteVisible(db, nuevos.cliente_id) : nuevos[k]
      await q(db, `update venta set ${k} = $2 where id = $1`, [v.id, k === 'entrega' || k === 'facturar' ? (nuevos[k] == null ? null : JSON.stringify(nuevos[k])) : nuevos[k]])
      const [ed] = await q(db, `insert into venta_edicion (empresa_id, venta_id, campo, antes, despues, usuario) values ($1, $2, $3, $4, $5, $6)
        returning campo, antes, despues, usuario, creado_en as en`, [v.empresa_id, v.id, CAMPO[k], JSON.stringify(antes ?? null), JSON.stringify(despues ?? null), usuario])
      ediciones.push(ed)
    }
    const [h] = await q(db, 'select id, numero, cliente_id::text, vendedor, entrega, facturar from venta where id = $1', [v.id])
    return { ok: true, venta: { ...h, numero: Number(h.numero) }, ediciones }
  })
}

/** El cliente como lo guarda el historial: el id y el nombre de ese momento (el nombre puede cambiar después). */
async function clienteVisible(db, id) {
  if (!id) return null
  const [c] = await q(db, 'select id::text, nombre from cliente where id = $1', [id])
  return c ?? { id, nombre: null }
}

/** El historial de ediciones de una venta, de la más vieja a la más nueva. */
export async function historialDe(db, { venta_id }) {
  if (!UUID.test(String(venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const ediciones = await q(db, `select campo, antes, despues, usuario, creado_en as en from venta_edicion where venta_id = $1 order by creado_en, id`, [venta_id])
  return { ok: true, ediciones }
}

/**
 * Agregar una nota (o EDITAR una: la nueva lleva `reemplaza_id`, y la vieja queda en el historial).
 * @param {{ venta_id: string, texto: string, origen: 'usuario'|'tn'|'ml'|'catalogo'|'importacion', detalle?: string,
 *   usuario: string, reemplaza_id?: string }} e
 */
export async function agregarNota(db, e) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const t = texto(e.texto)
  if (!t) return falla('ENTRADA_INVALIDA', 'La nota está vacía', 'texto')
  if (!ORIGENES_NOTA.includes(e.origen)) return falla('ENTRADA_INVALIDA', `El origen es ${ORIGENES_NOTA.join(', ')}`, 'origen')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién la escribe', 'usuario')
  if (e.reemplaza_id != null && !UUID.test(String(e.reemplaza_id))) return falla('NO_ENCONTRADA', 'No está la nota que se edita', 'reemplaza_id')
  return enTransaccion(db, async () => {
    const [v] = await q(db, 'select id, empresa_id from venta where id = $1', [e.venta_id])
    if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
    if (e.reemplaza_id) {
      const [vieja] = await q(db, 'select venta_id::text, exists (select 1 from venta_nota r where r.reemplaza_id = n.id) as reemplazada from venta_nota n where id = $1 for update', [e.reemplaza_id])
      if (!vieja || vieja.venta_id !== e.venta_id) return falla('NO_ENCONTRADA', 'No está la nota que se edita en esta venta', 'reemplaza_id')
      if (vieja.reemplazada) return falla('YA_REEMPLAZADA', 'Esa nota ya se editó: se edita la última', 'reemplaza_id')
    }
    const [n] = await q(db, `insert into venta_nota (empresa_id, venta_id, texto, origen, detalle, reemplaza_id, usuario) values ($1, $2, $3, $4, $5, $6, $7)
      returning id::text, texto, origen, detalle, reemplaza_id::text, usuario, creada_en`, [v.empresa_id, v.id, t, e.origen, texto(e.detalle), e.reemplaza_id ?? null, usuario])
    return { ok: true, nota: n }
  })
}

/**
 * Las notas de una venta: la VIGENTE de cada hilo (la última edición), con su `historial` de la primera a la anterior.
 * En el orden en que se escribió la primera de cada hilo.
 */
export async function notasDe(db, { venta_id }) {
  if (!UUID.test(String(venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const filas = await q(db, `select id::text, texto, origen, detalle, reemplaza_id::text, usuario, creada_en from venta_nota where venta_id = $1 order by creada_en, id`, [venta_id])
  const siguiente = new Map(filas.filter((f) => f.reemplaza_id).map((f) => [f.reemplaza_id, f]))
  const notas = []
  for (const primera of filas.filter((f) => !f.reemplaza_id)) {
    const hilo = [primera]
    for (let x = siguiente.get(primera.id); x; x = siguiente.get(x.id)) hilo.push(x)
    notas.push({ ...hilo.at(-1), historial: hilo.slice(0, -1) })
  }
  return { ok: true, notas }
}
