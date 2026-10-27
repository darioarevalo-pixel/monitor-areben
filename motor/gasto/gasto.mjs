/**
 * Los GASTOS COMERCIALES (Bruno, 26-oct; `sql/055-gasto.sql`): comisiones de plataformas, impuestos y otros costos de vender.
 * Para sacar el resultado ANTES de gastos operativos; el dashboard los LEE por `gastosComerciales`.
 *
 * - `registrarGasto`: anota un gasto A MANO (impuestos y lo que no se calcula solo). Inmutable: corregir es otro gasto en negativo.
 * - `gastosComerciales`: por marca y mes, total y por tipo. 🔑 Las COMISIONES salen de los cobros (`venta_pago_vigente.comision`,
 *   la tasa de la ruta por el monto) y ⛔ se vuelven a cargar a mano: si la ruta ⛔ tiene tasa, el cobro queda sin comisión y la
 *   lectura lo dice en `cobrosSinComision` (⛔ inventar un porcentaje). Se cuentan las ventas confirmadas; lo anulado ⛔ suma.
 * Devuelven `{ ok: true, … }` o `{ ok: false, error }`. Sólo lanzan si la BASE falla.
 */
import { fuentePagos } from '../venta/pagos-fuente.mjs'

const q = async (db, sql, params = []) => (await db.query(sql, params)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const pesos = (x) => Math.round(Number(x) * 100) / 100
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const AR = `at time zone 'America/Argentina/Buenos_Aires'`
export const TIPOS = ['comision', 'impuesto', 'otro']
export const MAX_DIAS = 366

/**
 * @param {import('pg').ClientBase} db
 * @param {{ empresa_id: string, marca: string, fecha: string, tipo: string, monto: number, detalle: string, cuenta?: string,
 *   venta_id?: string, usuario: string, prueba?: boolean, origen?: 'manual'|'automatico' }} e
 */
export async function registrarGasto(db, e) {
  if (!TIPOS.includes(e?.tipo)) return falla('ENTRADA_INVALIDA', 'El tipo es comisión, impuesto u otro', 'tipo')
  if (!FECHA.test(String(e.fecha ?? '')) || Number.isNaN(Date.parse(e.fecha))) return falla('ENTRADA_INVALIDA', 'La fecha es AAAA-MM-DD', 'fecha')
  const monto = pesos(e.monto)
  if (!Number.isFinite(monto) || monto === 0) return falla('ENTRADA_INVALIDA', 'El monto es un número distinto de cero (negativo corrige uno de más)', 'monto')
  const detalle = typeof e.detalle === 'string' ? e.detalle.trim() : ''
  if (!detalle) return falla('ENTRADA_INVALIDA', 'Falta el detalle: de qué es el gasto', 'detalle')
  const usuario = typeof e.usuario === 'string' ? e.usuario.trim() : ''
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo carga', 'usuario')
  const [m] = await q(db, 'select empresa_id from marca where id = $1', [e.marca])
  if (!m || m.empresa_id !== e.empresa_id) return falla('ENTRADA_INVALIDA', 'No está esa marca en esa empresa', 'marca')
  if (e.venta_id != null) {
    const [v] = await q(db, 'select marca from venta where id = $1', [e.venta_id])
    if (!v || v.marca !== e.marca) return falla('ENTRADA_INVALIDA', 'Esa venta no es de esa marca', 'venta_id')
  }
  const [g] = await q(db, `insert into gasto (empresa_id, marca, fecha, tipo, monto, detalle, cuenta, origen, venta_id, prueba, usuario)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    returning id::text, empresa_id, marca, fecha::text, tipo, monto::float, detalle, cuenta, origen, venta_id::text, prueba, usuario, creado_en`,
  [e.empresa_id, e.marca, e.fecha, e.tipo, monto, detalle, typeof e.cuenta === 'string' && e.cuenta.trim() ? e.cuenta.trim() : null,
    e.origen === 'automatico' ? 'automatico' : 'manual', e.venta_id ?? null, e.prueba === true, usuario])
  return { ok: true, gasto: g }
}

/**
 * @param {import('pg').ClientBase} db
 * @param {{ empresa_id: string, marca: string, desde: string, hasta: string, prueba?: boolean }} e — días AR inclusive, hasta `MAX_DIAS`.
 * @returns {Promise<{ ok: true, total: number, por_tipo: Record<string, number>, meses: Array<{ mes: string, total: number,
 *   por_tipo: Record<string, number> }>, comision_automatica: number, cobrosSinComision: number, gastos: any[] } | { ok: false, error }>}
 */
export async function gastosComerciales(db, { empresa_id, marca, desde, hasta, prueba = false }) {
  for (const [k, v] of [['desde', desde], ['hasta', hasta]]) if (!FECHA.test(String(v ?? ''))) return falla('ENTRADA_INVALIDA', `${k} es una fecha AAAA-MM-DD`, k)
  if (desde > hasta) return falla('ENTRADA_INVALIDA', 'desde es después de hasta', 'desde')
  if ((Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1 > MAX_DIAS) return falla('ENTRADA_INVALIDA', `El período es de ${MAX_DIAS} días como máximo`, 'hasta')
  const p = [empresa_id, marca, prueba, desde, hasta]
  const dia = `(coalesce(p.cobrado_en, v.ocurrida_en) ${AR})::date`
  const auto = await q(db, `select to_char(${dia}, 'YYYY-MM') as mes, coalesce(sum(p.comision), 0)::float as monto,
      count(*) filter (where p.comision is null and p.monto > 0 and p.medio in ('debito', 'credito', 'mp', 'pagonube'))::int as sin
    from venta v join ${await fuentePagos(db)} p on p.venta_id = v.id 
   where v.empresa_id = $1 and v.marca = $2 and v.prueba = $3 and v.estado = 'confirmada' and ${dia} between $4::date and $5::date
   group by 1`, p)
  const manual = await q(db, `select to_char(fecha, 'YYYY-MM') as mes, tipo, sum(monto)::float as monto
    from gasto where empresa_id = $1 and marca = $2 and prueba = $3 and fecha between $4::date and $5::date group by 1, 2`, p)
  const gastos = await q(db, `select id::text, fecha::text, tipo, monto::float, detalle, cuenta, origen, venta_id::text, usuario, creado_en
    from gasto where empresa_id = $1 and marca = $2 and prueba = $3 and fecha between $4::date and $5::date order by fecha desc, creado_en desc`, p)
  const meses = new Map()
  const mes = (m) => { if (!meses.has(m)) meses.set(m, { mes: m, total: 0, por_tipo: { comision: 0, impuesto: 0, otro: 0 } }); return meses.get(m) }
  let comision_automatica = 0
  let cobrosSinComision = 0
  for (const a of auto) { mes(a.mes).por_tipo.comision += a.monto; comision_automatica += a.monto; cobrosSinComision += a.sin }
  for (const g of manual) mes(g.mes).por_tipo[g.tipo] += g.monto
  const por_tipo = { comision: 0, impuesto: 0, otro: 0 }
  const lista = [...meses.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1))
  for (const m of lista) {
    for (const t of TIPOS) { m.por_tipo[t] = pesos(m.por_tipo[t]); por_tipo[t] += m.por_tipo[t] }
    m.total = pesos(TIPOS.reduce((s, t) => s + m.por_tipo[t], 0))
  }
  for (const t of TIPOS) por_tipo[t] = pesos(por_tipo[t])
  return { ok: true, total: pesos(TIPOS.reduce((s, t) => s + por_tipo[t], 0)), por_tipo, meses: lista, comision_automatica: pesos(comision_automatica), cobrosSinComision, gastos }
}
