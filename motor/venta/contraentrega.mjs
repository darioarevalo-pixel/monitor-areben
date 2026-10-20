/**
 * CONTRAENTREGA (contrato-venta.md §20, sql/032): la venta que cobra el CADETE en la puerta. La venta nace con un pago
 * de la cuenta «Contraentrega» (`registrarVenta`, ⛔ pide cliente); acá se CIERRA cuando Envíos la marca entregada, y se
 * lista lo que sigue en la calle.
 *
 * 🔑 Bruno (20-oct): el único externo es el cadete; la CUENTA DEL CADETE (lo que tiene en la mano, lo que rinde, el
 * recibo) es de Envíos ⇒ el motor sólo dice si la venta ya se cobró y por dónde entró: `cadete` (efectivo, lo trae en
 * la rendición) o `local` (le transfirió al local). Regla de Envíos (17-ago): un pedido ⛔ se entrega si ⛔ está pago ⇒
 * entregado = cobrado; si ⛔ paga, el envío es «no entregado» y la venta se ANULA (§17).
 *
 * Devuelven `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`, como la venta. `db` conectado y sin
 * transacción abierta.
 */
import { randomUUID } from 'node:crypto'
import { cuentaDe } from './armar.mjs'
import { leerConf } from './registrar.mjs'
import { cobroReal } from '../cuentas/cuentas.mjs'

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const pesos = (x) => Math.round(Number(x) * 100) / 100
const UUID = /^[0-9a-f-]{36}$/i
/** Por dónde entró la plata ⇒ el medio de la cuenta que se usa si la pantalla ⛔ elige una. */
const COMO = { cadete: 'efectivo', local: 'transferencia' }
const NO_ES_PLATA = ['saldo', 'cuenta', 'entrega']
/** Bruno (20-oct): el cadete trae EFECTIVO; si la clienta le transfiere al local, es «Transferencia CG». */
const PREFERIDA = { cadete: 'Efectivo', local: 'Transferencia CG' }

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

/** La cuenta de cobro del cierre: la que diga la pantalla, o la ÚNICA de la marca con el medio de `como`. */
function cuentaDelCierre(conf, marca, como, cuenta) {
  if (cuenta != null && cuenta !== '') {
    const c = cuentaDe(conf, marca, cuenta)
    if (!c) return fallo('CUENTA_DESCONOCIDA', `La cuenta de cobro ${cuenta} no es de ${marca}`, 'cuenta')
    if (NO_ES_PLATA.includes(c.medio)) return fallo('CUENTA_DESCONOCIDA', `La Contraentrega se cierra con plata, no con «${c.nombre}»`, 'cuenta')
    return { cuenta: c }
  }
  const medio = COMO[como]
  const hay = conf.cuentas.filter((c) => c.marca === marca && c.activa !== false && c.medio === medio)
  if (hay.length === 1) return { cuenta: hay[0] }
  // Con varias del medio (las copiadas de GN), la de la Contraentrega. Es sólo el MEDIO: la cuenta REAL (la del
  // dashboard) la pone la ruta de cobro (`cobroReal`).
  const una = hay.filter((c) => c.nombre === PREFERIDA[como])
  if (una.length === 1) return { cuenta: una[0] }
  return fallo('FALTA_CUENTA', `${marca} tiene ${hay.length} cuentas de ${medio}: elegí cuál`, 'cuenta')
}

/**
 * Lo que dicen los pagos de la venta (⛔ se edita nada: cada corrección agrega filas). Por cada pago de Contraentrega
 * (`medio = 'entrega'`, > 0): está `pendiente` mientras ⛔ tenga su fila contraria; con ella, la plata que lo cerró
 * NETA por quién la cobró ⇒ `como` es el que quedó con plata (cadete o local), o ninguno si se reabrió.
 */
async function leerContraentrega(db, venta_id) {
  const [v] = await q(db, 'select id::text, marca, canal, estado, ocurrida_en from venta where id = $1 for update', [venta_id])
  if (!v) return { error: fallo('NO_ENCONTRADA', 'No está esa venta', 'venta_id') }
  const pagos = await q(db, `select p.id::text, p.monto::float, p.base::float, p.cuenta_cobro_id::text, p.cuenta_real_id::text, p.medio,
      p.cierre_de::text, p.cobro_por, p.cobrado_en, c.medio as cuenta_medio
    from venta_pago p join cuenta_cobro c on c.id = p.cuenta_cobro_id where p.venta_id = $1 order by p.id`, [v.id])
  const ce = pagos.filter((p) => p.cuenta_medio === 'entrega' && p.monto > 0)
  if (!ce.length) return { error: fallo('SIN_CONTRAENTREGA', 'Esa venta no se cobra contra entrega', 'venta_id') }
  const cerrado = new Set(pagos.filter((p) => p.cuenta_medio === 'entrega' && p.cierre_de).map((p) => p.cierre_de))
  const abiertos = ce.map((p) => {
    const plata = pagos.filter((x) => x.cierre_de === p.id && x.cuenta_medio !== 'entrega')
    // La plata neta por (quién, cuenta, medio, cuenta real): una corrección resta en la vieja y suma en la nueva.
    const netos = new Map()
    for (const x of plata) {
      const k = [x.cobro_por, x.cuenta_cobro_id, x.medio, x.cuenta_real_id].join('|')
      const n = netos.get(k) ?? { cobro_por: x.cobro_por, cuenta_cobro_id: x.cuenta_cobro_id, medio: x.medio, cuenta_real_id: x.cuenta_real_id, cobrado_en: x.cobrado_en, monto: 0 }
      n.monto = pesos(n.monto + x.monto)
      netos.set(k, n)
    }
    const vivos = [...netos.values()].filter((n) => n.monto > 0)
    return { ...p, pendiente: !cerrado.has(p.id), vivos, como: [...new Set(vivos.map((n) => n.cobro_por))] }
  })
  return { v, abiertos }
}

/** Las dos filas que cierran un pago de Contraentrega: la contraria y la de la plata (`real` = `cobroReal`). */
function filasDeCierre(v, p, c, real, { en, como, usuario }) {
  const cierre = { venta_id: v.id, cierre_de: p.id, cobrado_en: en, cobro_por: como, cerrado_por: usuario, porcentaje: 0, descuento: 0, redondeo: 0 }
  return [
    { ...cierre, id: randomUUID(), cuenta_cobro_id: p.cuenta_cobro_id, medio: 'entrega', base: -p.monto, monto: -p.monto },
    { ...cierre, id: randomUUID(), cuenta_cobro_id: c.cuenta.id, base: p.monto, monto: p.monto, ...real.cobro },
  ]
}

/** La plata viva de un pago, dada vuelta (misma cuenta, medio y cuenta real, la MISMA fecha: ⛔ entró por ahí). */
const filasContrarias = (v, p, usuario) => p.vivos.map((n) => ({
  id: randomUUID(), venta_id: v.id, cierre_de: p.id, cobrado_en: n.cobrado_en, cobro_por: n.cobro_por, cerrado_por: usuario,
  cuenta_cobro_id: n.cuenta_cobro_id, medio: n.medio, cuenta_real_id: n.cuenta_real_id, base: -n.monto, monto: -n.monto, porcentaje: 0, descuento: 0, redondeo: 0,
}))

const insertar = (db, filas) => db.query('insert into venta_pago select * from jsonb_populate_recordset(null::venta_pago, $1::jsonb)', [JSON.stringify(filas)])

function validar(e, { conComo = true } = {}) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return fallo('ENTRADA_INVALIDA', 'Falta la venta', 'venta_id')
  if (conComo && !(e.como in COMO)) return fallo('ENTRADA_INVALIDA', 'Lo cobró el cadete o le pagaron al local', 'como')
  if (!(typeof e.usuario === 'string' && e.usuario.trim())) return fallo('ENTRADA_INVALIDA', 'Falta quién lo cierra', 'usuario')
  if (e.cobrado_en != null && Number.isNaN(Date.parse(e.cobrado_en))) return fallo('ENTRADA_INVALIDA', 'Fecha inválida', 'cobrado_en')
  return null
}

/**
 * Cerrar la Contraentrega de una venta: la cobró el cadete (`como: 'cadete'`) o le pagaron al local (`'local'`). Agrega
 * a la venta, por cada pago de Contraentrega abierto, la fila contraria y la de la plata (⛔ se edita nada). Repetir con
 * lo mismo devuelve lo mismo (`ya_existia`); con otro `como`, `YA_CERRADA` (para cambiarlo: `corregirContraentrega`).
 * @param {{ venta_id: string, como: 'cadete'|'local', cuenta?: string|number, cuenta_real?: string, usuario: string, cobrado_en?: string }} e
 */
export async function cerrarContraentrega(db, e) {
  const mal = validar(e)
  if (mal) return mal
  return enTransaccion(db, async () => {
    // El candado (`for update`): dos cierres a la vez de la misma venta ⇒ el segundo ve el primero.
    const l = await leerContraentrega(db, e.venta_id)
    if (l.error) return l.error
    const { v, abiertos } = l
    const faltan = abiertos.filter((p) => p.pendiente)
    if (!faltan.length) {
      const por = [...new Set(abiertos.flatMap((p) => p.como))]
      if (por.length === 1 && por[0] === e.como) return { ok: true, ya_existia: true, cerrado: { como: e.como, monto: pesos(abiertos.reduce((s, p) => s + p.monto, 0)) } }
      return fallo('YA_CERRADA', `Ya se cerró: ${por.join(' y ')}`, 'como')
    }
    return cerrarFaltan(db, v, faltan, e)
  })
}

async function cerrarFaltan(db, v, faltan, e) {
  if (v.estado !== 'confirmada') return fallo('VENTA_ANULADA', 'La venta está anulada: no se cobra', 'venta_id')
  const conf = await leerConf(db, v.marca)
  const c = cuentaDelCierre(conf, v.marca, e.como, e.cuenta)
  if (!c.cuenta) return c
  const en = new Date(e.cobrado_en ?? Date.now()).toISOString()
  const filas = []
  for (const p of faltan) {
    const real = cobroReal({ monto: p.monto, elegida: e.cuenta_real ?? null }, c.cuenta, { marca: v.marca, canal: v.canal, en }, conf)
    if (!real.ok) return fallo(real.codigo, real.mensaje, 'cuenta_real')
    filas.push(...filasDeCierre(v, p, c, real, { en, como: e.como, usuario: e.usuario.trim() }))
  }
  await insertar(db, filas)
  return { ok: true, ya_existia: false, cerrado: { como: e.como, cuenta: c.cuenta.nombre, monto: pesos(faltan.reduce((s, p) => s + p.monto, 0)) } }
}

/**
 * CORREGIR por dónde entró (Envíos: el tilde «cobrado» / «no cobré» después de «entregado», en cualquier orden): deja la
 * venta cerrada con `como`. Lo cerrado con el otro se da vuelta en su cuenta y entra por la nueva, con la fecha del
 * cierre (⛔ la de la corrección: la plata entró ese día, sólo que por otro lado); lo que faltaba cerrar, se cierra.
 * Ya estaba así ⇒ `ya_existia`. ⛔ en una anulada.
 * @param {{ venta_id: string, como: 'cadete'|'local', cuenta?: string|number, cuenta_real?: string, usuario: string }} e
 */
export async function corregirContraentrega(db, e) {
  const mal = validar(e)
  if (mal) return mal
  return enTransaccion(db, async () => {
    const l = await leerContraentrega(db, e.venta_id)
    if (l.error) return l.error
    const { v, abiertos } = l
    const mover = abiertos.filter((p) => !p.pendiente && p.vivos.some((n) => n.cobro_por !== e.como))
    const faltan = abiertos.filter((p) => p.pendiente)
    if (!mover.length && !faltan.length) return { ok: true, ya_existia: true, cerrado: { como: e.como, monto: pesos(abiertos.reduce((s, p) => s + p.monto, 0)) } }
    if (v.estado !== 'confirmada') return fallo('VENTA_ANULADA', 'La venta está anulada: ya no se corrige el cobro', 'venta_id')
    const usuario = e.usuario.trim()
    const conf = await leerConf(db, v.marca)
    const c = cuentaDelCierre(conf, v.marca, e.como, e.cuenta)
    if (!c.cuenta) return c
    const filas = []
    for (const p of mover) {
      const otros = p.vivos.filter((n) => n.cobro_por !== e.como)
      const monto = pesos(otros.reduce((s, n) => s + n.monto, 0))
      const en = new Date(otros[0].cobrado_en).toISOString()
      const real = cobroReal({ monto, elegida: e.cuenta_real ?? null }, c.cuenta, { marca: v.marca, canal: v.canal, en }, conf)
      if (!real.ok) return fallo(real.codigo, real.mensaje, 'cuenta_real')
      filas.push(...filasContrarias(v, { ...p, vivos: otros }, usuario),
        { id: randomUUID(), venta_id: v.id, cierre_de: p.id, cobrado_en: en, cobro_por: e.como, cerrado_por: usuario, cuenta_cobro_id: c.cuenta.id,
          base: monto, monto, porcentaje: 0, descuento: 0, redondeo: 0, ...real.cobro })
    }
    if (filas.length) await insertar(db, filas)
    if (faltan.length) {
      const r = await cerrarFaltan(db, v, faltan, { ...e, usuario })
      if (!r.ok) return r
    }
    return { ok: true, ya_existia: false, cerrado: { como: e.como, cuenta: c.cuenta.nombre, monto: pesos(abiertos.reduce((s, p) => s + p.monto, 0)) } }
  })
}

/**
 * REABRIR (Envíos: el «entregado» se deshace —«no entregado», o vuelve a la lista—): la plata del cierre se da vuelta
 * con su misma fecha (⛔ entró) y la venta vuelve a tener su Contraentrega EN LA CALLE (un pago nuevo por el mismo
 * monto; ⛔ se edita el viejo). Nada cerrado ⇒ `ya_existia`. ⛔ en una anulada (la anulación ya devolvió esa plata).
 * @param {{ venta_id: string, usuario: string }} e
 */
export async function reabrirContraentrega(db, e) {
  const mal = validar(e, { conComo: false })
  if (mal) return mal
  return enTransaccion(db, async () => {
    const l = await leerContraentrega(db, e.venta_id)
    if (l.error) return l.error
    const { v, abiertos } = l
    // Uno ya reabierto queda cerrado pero sin plata viva: ⛔ se vuelve a abrir (la calle ya tiene el pago nuevo).
    const cerrados = abiertos.filter((p) => !p.pendiente && p.vivos.length)
    if (!cerrados.length) return { ok: true, ya_existia: true, abierto: pesos(abiertos.reduce((s, p) => s + p.monto, 0)) }
    if (v.estado !== 'confirmada') return fallo('VENTA_ANULADA', 'La venta está anulada: ya no se reabre', 'venta_id')
    const usuario = e.usuario.trim()
    const filas = cerrados.flatMap((p) => [
      ...filasContrarias(v, p, usuario),
      { id: randomUUID(), venta_id: v.id, cuenta_cobro_id: p.cuenta_cobro_id, medio: 'entrega', base: p.base, monto: p.monto, porcentaje: 0, descuento: 0, redondeo: 0 },
    ])
    await insertar(db, filas)
    return { ok: true, ya_existia: false, abierto: pesos(cerrados.reduce((s, p) => s + p.monto, 0)) }
  })
}

/**
 * Lo que sigue EN LA CALLE: las ventas confirmadas con Contraentrega sin cerrar, la más vieja primero (Ventas › Cobros).
 * Cuánto tiene el cadete en la mano lo dice Envíos (su cuenta), ⛔ esto.
 * @param {{ empresa_id: string, marca: string, prueba?: boolean }} e
 */
export async function contraentregasAbiertas(db, { empresa_id, marca, prueba = false }) {
  const filas = await q(db, `select v.id::text as venta_id, v.numero::int, v.canal, v.origen, v.ocurrida_en as en, v.cliente_id::text,
      cl.nombre as cliente, sum(p.monto)::float as monto
    from venta v join venta_pago p on p.venta_id = v.id join cuenta_cobro c on c.id = p.cuenta_cobro_id
    left join cliente cl on cl.id = v.cliente_id
    where v.empresa_id = $1 and v.marca = $2 and v.prueba = $3 and v.estado = 'confirmada' and c.medio = 'entrega' and p.monto > 0
      and not exists (select 1 from venta_pago x where x.cierre_de = p.id)
    group by v.id, cl.nombre order by v.ocurrida_en`, [empresa_id, marca, prueba])
  return {
    ok: true,
    abiertas: filas.map((f) => ({ ...f, en: new Date(f.en).toISOString(), monto: pesos(f.monto), cliente: f.cliente_id ? { id: f.cliente_id, nombre: f.cliente } : null })),
    total: pesos(filas.reduce((s, f) => s + f.monto, 0)),
  }
}
