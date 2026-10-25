/**
 * Los COBROS de un período, todos juntos (pedido de Diseño, 20-oct: «Ventas › Cobros» ⛔ tiene pantalla sin esto). SÓLO
 * LEE. Junta tres libros que ya existen, sin tabla nueva:
 * - `venta_pago`: lo que se cobró con cada venta (la fecha es la de la venta: el pago ⛔ tiene fecha propia). Negativo =
 *   la plata que devolvió un cambio.
 * - `cuenta_movimiento` tipo `pago`: el PAGO A CUENTA de un cliente (sql/025), con su fecha.
 * - `venta_devolucion` forma `plata`: lo que salió al anular (sql/028), con la fecha en que se devolvió.
 *
 * Cada renglón trae `clase`: `plata` (entró o salió plata) · `a_cuenta` (quedó debiendo: ⛔ es plata) · `saldo` (pagó con
 * saldo a favor: ⛔ es plata). Los totales cuentan sólo `plata`; la pantalla decide si muestra las otras.
 * Lo anulado ⛔ se borra: queda con `anulado: true` (la venta anulada, el pago a cuenta dado vuelta).
 */
import { medioDeCuenta } from '../cuentas/cuentas.mjs'
import { fuentePagos } from './pagos-fuente.mjs'

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const pesos = (x) => Math.round(Number(x) * 100) / 100
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const AR = `at time zone 'America/Argentina/Buenos_Aires'`
export const MAX_DIAS = 93

const claseDe = (medio) => (medio === 'cuenta' ? 'a_cuenta' : medio === 'saldo' ? 'saldo' : 'plata')

/**
 * @param {{ empresa_id: string, marca: string, desde: string, hasta: string, prueba?: boolean }} e — `desde`/`hasta`
 *   días AR inclusive, hasta `MAX_DIAS`.
 * @returns {Promise<{ ok: true, cobros: Array<{ id, origen: 'venta'|'pago_a_cuenta'|'devolucion', fecha, en, clase,
 *   monto, medio, cuenta: { id, nombre }, cuenta_real: { id, nombre }|null, venta: { id, numero, canal, origen }|null,
 *   cliente: { id, nombre }|null, usuario, comision, acredita_el, anulado, ref }>, totales: { plata, entro, salio,
 *   por_medio: Record<string, number> } } | { ok: false, error }>}
 *   `monto` con signo: + entra, − sale. Del más nuevo al más viejo.
 */
export async function cobrosDe(db, { empresa_id, marca, desde, hasta, prueba = false }) {
  for (const [k, v] of [['desde', desde], ['hasta', hasta]]) if (!FECHA.test(String(v ?? ''))) return fallo('ENTRADA_INVALIDA', `${k} es una fecha AAAA-MM-DD`, k)
  if (desde > hasta) return fallo('ENTRADA_INVALIDA', 'desde es después de hasta', 'desde')
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1
  if (dias > MAX_DIAS) return fallo('ENTRADA_INVALIDA', `El período es de ${MAX_DIAS} días como máximo`, 'hasta')
  const p = [empresa_id, marca, prueba, desde, hasta]
  const enPeriodo = (col) => `(${col} ${AR})::date between $4::date and $5::date`

  // sql/032: la Contraentrega ⛔ es un cobro (lo es su cierre, el día que se cerró: `cobrado_en`).
  const [{ con032 }] = await q(db, `select exists (select 1 from information_schema.columns where table_schema = current_schema()
    and table_name = 'venta_pago' and column_name = 'cobrado_en') as con032`)
  const EN = con032 ? 'coalesce(p.cobrado_en, v.ocurrida_en)' : 'v.ocurrida_en'
  const PAGOS = await fuentePagos(db)   // sql/042: el medio CORREGIDO
  const ventas = await q(db, `select p.id::text, p.monto::float, p.medio, p.comision::float, p.acredita_el::text,
      p.cuenta_cobro_id::text as cuenta_id, cc.nombre as cuenta, cc.medio as cuenta_medio, p.cuenta_real_id::text, cr.nombre as cuenta_real,
      v.id::text as venta_id, v.numero::int, v.canal, v.origen, ${con032 ? 'coalesce(p.cerrado_por, v.usuario)' : 'v.usuario'} as usuario, ${EN} as en, v.estado = 'anulada' as anulado,
      exists (select 1 from venta_devolucion d where d.venta_id = v.id) as con_devolucion, v.cliente_id::text, cl.nombre as cliente
    from ${PAGOS} p join venta v on v.id = p.venta_id join cuenta_cobro cc on cc.id = p.cuenta_cobro_id
    left join cuenta_real cr on cr.id = p.cuenta_real_id left join cliente cl on cl.id = v.cliente_id
    where v.empresa_id = $1 and v.marca = $2 and v.prueba = $3 and cc.medio <> 'entrega' and ${enPeriodo(EN)}`, p)

  const aCuenta = await q(db, `select m.id::text, -m.monto::float as monto, m.medio, m.ref, m.usuario, m.ocurrida_en as en,
      m.cuenta_cobro_id::text as cuenta_id, cc.nombre as cuenta, cc.medio as cuenta_medio, m.cuenta_real_id::text, cr.nombre as cuenta_real,
      m.cliente_id::text, cl.nombre as cliente,
      exists (select 1 from cuenta_movimiento x where x.empresa_id = m.empresa_id and x.ref = m.ref || ':anulacion') as anulado
    from cuenta_movimiento m join cuenta_cobro cc on cc.id = m.cuenta_cobro_id join cliente cl on cl.id = m.cliente_id
    left join cuenta_real cr on cr.id = m.cuenta_real_id
    where m.tipo = 'pago' and m.empresa_id = $1 and m.marca = $2 and m.prueba = $3 and ${enPeriodo('m.ocurrida_en')}`, p)

  const devueltas = await q(db, `select d.id::text, -d.monto::float as monto, d.medio, d.usuario, d.ocurrida_en as en,
      d.cuenta_cobro_id::text as cuenta_id, cc.nombre as cuenta, cc.medio as cuenta_medio, d.cuenta_real_id::text, cr.nombre as cuenta_real,
      v.id::text as venta_id, v.numero::int, v.canal, v.origen, v.cliente_id::text, cl.nombre as cliente
    from venta_devolucion d join venta v on v.id = d.venta_id join cuenta_cobro cc on cc.id = d.cuenta_cobro_id
    left join cuenta_real cr on cr.id = d.cuenta_real_id left join cliente cl on cl.id = v.cliente_id
    where d.forma = 'plata' and d.empresa_id = $1 and d.marca = $2 and d.prueba = $3 and ${enPeriodo('d.ocurrida_en')}`, p)

  const fecha = (en) => new Date(en).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
  const renglon = (origen, r, extra) => {
    // Lo viejo (antes de la 019) ⛔ guardó el medio: sale de la cuenta, como en la ruta.
    const medio = r.medio ?? medioDeCuenta({ medio: r.cuenta_medio, nombre: r.cuenta })
    return {
      id: r.id, origen, fecha: fecha(r.en), en: new Date(r.en).toISOString(), clase: claseDe(medio), monto: pesos(r.monto), medio,
      cuenta: { id: r.cuenta_id, nombre: r.cuenta }, cuenta_real: r.cuenta_real_id ? { id: r.cuenta_real_id, nombre: r.cuenta_real } : null,
      venta: r.venta_id ? { id: r.venta_id, numero: r.numero, canal: r.canal, origen: r.origen } : null,
      cliente: r.cliente_id ? { id: r.cliente_id, nombre: r.cliente } : null,
      usuario: r.usuario, comision: r.comision ?? null, acredita_el: r.acredita_el ?? null, anulado: Boolean(r.anulado), ref: r.ref ?? null,
      ...extra,
    }
  }
  const cobros = [
    ...ventas.map((r) => renglon('venta', r)),
    ...aCuenta.map((r) => renglon('pago_a_cuenta', r)),
    ...devueltas.map((r) => renglon('devolucion', r)),
  ].sort((a, b) => b.en.localeCompare(a.en) || a.id.localeCompare(b.id))

  // Una venta anulada SIN devolución propia (la de TN, la del repaso de la Caja): la plata la devolvieron afuera ⇒ ⛔
  // suma. Con devolución (aunque caiga en otro período) el cobro suma el día de la venta; la devolución en plata resta
  // el suyo, y la que quedó en SALDO ⛔ resta: la plata se quedó (como `cobrosPropios` de facturar.mjs).
  const conDevolucion = new Set(ventas.filter((r) => r.con_devolucion).map((r) => r.id))
  const cuenta = (c) => c.clase === 'plata' && (!c.anulado || conDevolucion.has(c.id))
  const totales = { plata: 0, entro: 0, salio: 0, por_medio: {} }
  for (const c of cobros.filter(cuenta)) {
    totales.plata = pesos(totales.plata + c.monto)
    if (c.monto > 0) totales.entro = pesos(totales.entro + c.monto)
    else totales.salio = pesos(totales.salio - c.monto)
    const m = c.medio ?? 'sin_medio'
    totales.por_medio[m] = pesos((totales.por_medio[m] ?? 0) + c.monto)
  }
  return { ok: true, cobros, totales }
}
