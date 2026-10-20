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
  if (hay.length !== 1) return fallo('FALTA_CUENTA', `${marca} tiene ${hay.length} cuentas de ${medio}: elegí cuál`, 'cuenta')
  return { cuenta: hay[0] }
}

/**
 * Cerrar la Contraentrega de una venta: la cobró el cadete (`como: 'cadete'`) o le pagaron al local (`'local'`). Agrega
 * a la venta, por cada pago de Contraentrega abierto, la fila contraria y la de la plata (⛔ se edita nada). Repetir con
 * lo mismo devuelve lo mismo (`ya_existia`); con otro `como`, `YA_CERRADA`.
 * @param {{ venta_id: string, como: 'cadete'|'local', cuenta?: string|number, cuenta_real?: string, usuario: string, cobrado_en?: string }} e
 */
export async function cerrarContraentrega(db, e) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return fallo('ENTRADA_INVALIDA', 'Falta la venta', 'venta_id')
  if (!(e.como in COMO)) return fallo('ENTRADA_INVALIDA', 'Lo cobró el cadete o le pagaron al local', 'como')
  const usuario = typeof e.usuario === 'string' ? e.usuario.trim() : ''
  if (!usuario) return fallo('ENTRADA_INVALIDA', 'Falta quién lo cierra', 'usuario')
  if (e.cobrado_en != null && Number.isNaN(Date.parse(e.cobrado_en))) return fallo('ENTRADA_INVALIDA', 'Fecha inválida', 'cobrado_en')
  return enTransaccion(db, async () => {
    // El candado: dos cierres a la vez de la misma venta ⇒ el segundo ve el primero.
    const [v] = await q(db, 'select id::text, marca, canal, estado, ocurrida_en from venta where id = $1 for update', [e.venta_id])
    if (!v) return fallo('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
    const pagos = await q(db, `select p.id::text, p.monto::float, p.cuenta_cobro_id::text, p.cierre_de::text, p.cobro_por, c.medio as cuenta_medio
      from venta_pago p join cuenta_cobro c on c.id = p.cuenta_cobro_id where p.venta_id = $1 order by p.id`, [v.id])
    const abiertos = pagos.filter((p) => p.cuenta_medio === 'entrega' && p.monto > 0)
    if (!abiertos.length) return fallo('SIN_CONTRAENTREGA', 'Esa venta no se cobra contra entrega', 'venta_id')
    const cerrados = new Map(pagos.filter((p) => p.cierre_de && p.cuenta_medio !== 'entrega').map((p) => [p.cierre_de, p]))
    const faltan = abiertos.filter((p) => !cerrados.has(p.id))
    if (!faltan.length) {
      const por = [...new Set(abiertos.map((p) => cerrados.get(p.id).cobro_por))]
      if (por.length === 1 && por[0] === e.como) return { ok: true, ya_existia: true, cerrado: { como: e.como, monto: pesos(abiertos.reduce((s, p) => s + p.monto, 0)) } }
      return fallo('YA_CERRADA', `Ya se cerró: ${por.join(' y ')}`, 'como')
    }
    if (v.estado !== 'confirmada') return fallo('VENTA_ANULADA', 'La venta está anulada: no se cobra', 'venta_id')
    const conf = await leerConf(db, v.marca)
    const c = cuentaDelCierre(conf, v.marca, e.como, e.cuenta)
    if (!c.cuenta) return c
    const en = new Date(e.cobrado_en ?? Date.now()).toISOString()
    const filas = []
    for (const p of faltan) {
      const real = cobroReal({ monto: p.monto, elegida: e.cuenta_real ?? null }, c.cuenta, { marca: v.marca, canal: v.canal, en }, conf)
      if (!real.ok) return fallo(real.codigo, real.mensaje, 'cuenta_real')
      const cierre = { venta_id: v.id, cierre_de: p.id, cobrado_en: en, cobro_por: e.como, cerrado_por: usuario, porcentaje: 0, descuento: 0, redondeo: 0 }
      filas.push(
        { ...cierre, id: randomUUID(), cuenta_cobro_id: p.cuenta_cobro_id, medio: 'entrega', base: -p.monto, monto: -p.monto },
        { ...cierre, id: randomUUID(), cuenta_cobro_id: c.cuenta.id, base: p.monto, monto: p.monto, ...real.cobro },
      )
    }
    await db.query('insert into venta_pago select * from jsonb_populate_recordset(null::venta_pago, $1::jsonb)', [JSON.stringify(filas)])
    return { ok: true, ya_existia: false, cerrado: { como: e.como, cuenta: c.cuenta.nombre, monto: pesos(faltan.reduce((s, p) => s + p.monto, 0)) } }
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
