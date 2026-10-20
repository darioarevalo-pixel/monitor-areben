/**
 * Lo de la base que comparten la venta (`registrar.mjs`) y la cuenta (`cuenta.mjs`): leer la cuenta de un cliente
 * BLOQUEADA hasta el commit y escribir sus movimientos (sql/025). Sin transacción propia: corre dentro de la del que llama.
 */
import { estado, movimientosDeLibro } from './cuenta.core.mjs'

const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const AR = `at time zone 'America/Argentina/Buenos_Aires'`

export async function hoyAR(db) {
  const [r] = await q(db, `select (now() ${AR})::date::text as d`)
  return r.d
}

/** El crédito vigente del cliente: `{ credito, tope, dias, puesto_por, puesto_en }` o null (nunca se marcó). */
export async function creditoDe(db, clienteId) {
  const [k] = await q(db, `select credito, tope::float, dias, usuario as puesto_por, creado_en as puesto_en from credito_vigente where cliente_id = $1`, [clienteId])
  return k ?? null
}

/** Las filas del libro de un cliente, con el día AR y el detalle que se ve (el número de la venta, la cuenta del pago). */
export async function filasDe(db, { cliente_id, marca, prueba }) {
  return q(db, `select m.tipo, m.ref, m.monto, to_char(m.ocurrida_en ${AR}, 'YYYY-MM-DD') as fecha, m.detalle->'imputar' as imputar,
      case when m.tipo = 'compra' then 'Venta ' || v.numero when m.tipo = 'pago' then coalesce(c.nombre, '') else '' end as detalle
    from cuenta_movimiento m left join venta v on v.id = m.venta_id left join cuenta_cobro c on c.id = m.cuenta_cobro_id
    where m.cliente_id = $1 and m.marca = $2 and m.prueba = $3 order by m.ocurrida_en, m.creado_en`, [cliente_id, marca, prueba])
}

/**
 * Las filas del libro de TODOS los clientes de la marca, en una consulta (la lista: ⛔ 3 consultas por cliente). Mismas
 * columnas que `filasDe` más `cliente_id`, en el mismo orden.
 */
export async function filasDeMarca(db, { empresa_id, marca, prueba }) {
  return q(db, `select m.cliente_id::text, m.tipo, m.ref, m.monto, to_char(m.ocurrida_en ${AR}, 'YYYY-MM-DD') as fecha, m.detalle->'imputar' as imputar,
      case when m.tipo = 'compra' then 'Venta ' || v.numero when m.tipo = 'pago' then coalesce(c.nombre, '') else '' end as detalle
    from cuenta_movimiento m left join venta v on v.id = m.venta_id left join cuenta_cobro c on c.id = m.cuenta_cobro_id
    where m.empresa_id = $1 and m.marca = $2 and m.prueba = $3 order by m.ocurrida_en, m.creado_en`, [empresa_id, marca, prueba])
}

/** El crédito vigente de cada cliente de la empresa que alguna vez lo tuvo marcado: `Map(cliente_id → crédito)`. */
export async function creditosDe(db, empresa_id) {
  const filas = await q(db, `select k.cliente_id::text, k.credito, k.tope::float, k.dias, k.usuario as puesto_por, k.creado_en as puesto_en
    from credito_vigente k join cliente c on c.id = k.cliente_id where c.empresa_id = $1`, [empresa_id])
  return new Map(filas.map(({ cliente_id, ...k }) => [cliente_id, k]))
}

/**
 * La cuenta del cliente para DECIDIR (una venta a cuenta, un pago): bloquea (cliente, marca, prueba) hasta el commit,
 * así dos ventas a la vez ⛔ pasan las dos el tope.
 */
export async function cuentaBloqueada(db, { cliente_id, marca, prueba, hoy = null }) {
  await q(db, `select pg_advisory_xact_lock(hashtext('cuenta:' || $1 || ':' || $2 || ':' || $3))`, [cliente_id, marca, String(prueba)])
  const credito = await creditoDe(db, cliente_id)
  const movs = movimientosDeLibro(await filasDe(db, { cliente_id, marca, prueba }))
  return { credito, estado: estado({ movs, credito, hoy: hoy ?? await hoyAR(db) }) }
}

/** La compra (+) de una venta con parte a cuenta. */
export const filaCompra = (venta, monto, detalle = {}) => ({
  empresa_id: venta.empresa_id, marca: venta.marca, cliente_id: venta.cliente_id, tipo: 'compra', ref: `venta:${venta.id}`,
  monto, venta_id: venta.id, detalle, prueba: venta.prueba, usuario: venta.usuario, ocurrida_en: venta.ocurrida_en,
})

export async function insertarFila(db, f) {
  const cols = Object.keys(f)
  await db.query(`insert into cuenta_movimiento (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map((k) => (k === 'detalle' ? JSON.stringify(f[k]) : f[k])))
}

/** Al anular la venta: lo que dejó a cuenta se da vuelta (aunque ya se haya pagado: queda a favor). */
export async function anularCompraDe(db, venta, { usuario, motivo, en }) {
  // Una base sin la 025 anula igual (el cruce de mayoristas anula en producción): ⛔ hay cuenta que dar vuelta.
  const [{ hay }] = await q(db, `select to_regclass('cuenta_movimiento') is not null as hay`)
  if (!hay) return 0
  const [r] = await q(db, `select cliente_id, marca, empresa_id, prueba, sum(monto)::float as neto from cuenta_movimiento where venta_id = $1 group by 1, 2, 3, 4`, [venta.id])
  if (!r || !r.neto) return 0
  await insertarFila(db, {
    empresa_id: r.empresa_id, marca: r.marca, cliente_id: r.cliente_id, tipo: 'anulacion', ref: `venta:${venta.id}:anulacion`,
    monto: -r.neto, venta_id: venta.id, detalle: { motivo }, prueba: r.prueba, usuario, ocurrida_en: en,
  })
  return r.neto
}
