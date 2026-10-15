/**
 * Facturar ventas PROPIAS (paso 6): los cobros de las ventas del motor, con la forma que piden `techoDelMes` y
 * `ventasParaFacturar` de `lib/arca` ({ marca, venta_id, fecha, cuenta, monto }), para sumarlos a los de GN.
 *
 * 🔴 ⛔ se cuenta dos veces: mientras GN viva, la Caja escribe la venta en GN Y en el motor (y TN la crea en GN)
 * ⇒ una venta propia con `gn_sale_id` ya entra por los cobros de GN. Acá van sólo las que GN ⛔ tiene. Tampoco
 * las de `prueba` (TN en sombra) ni las anuladas (GN tampoco cuenta las suyas: `ventaCuenta`).
 * La fecha es la del día AR de la venta (la Caja cobra en el momento); un cambio trae su cobro o devolución
 * (monto negativo) en su propia venta.
 *
 * Sin dependencias fuera de `lib/venta`: el monitor lo usa desde la copia (`npm run traer-motor`).
 */

/** Por qué una venta propia ⛔ entra (para el contador de lo que se dejó afuera). */
export function motivoFuera(v) {
  if (v.prueba) return 'prueba'
  if (v.estado !== 'confirmada') return 'anulada'
  // La columna, o el id que trajo la Caja en `detalle` (las anotadas antes de que `registrarVenta` lo copiara).
  if (v.gn_sale_id != null || (v.detalle && v.detalle.gn_sale_id != null)) return 'en_gn'
  return null
}

/**
 * Los cobros del mes de las ventas propias que se facturan desde el motor, y cuántas quedaron afuera y por qué.
 * @param {import('pg').ClientBase} db @param {string} mes 'YYYY-MM'
 * @returns {Promise<{ cobros: Array<{ marca: string, venta_id: string, fecha: string, cuenta: string, monto: number }>, fuera: Record<string, number> }>}
 */
export async function cobrosPropios(db, mes) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error(`Mes inválido: ${mes}`)
  const { rows } = await db.query(
    `select v.id as venta_id, v.marca, v.estado, v.prueba, v.gn_sale_id, jsonb_build_object('gn_sale_id', v.detalle->'gn_sale_id') as detalle,
            to_char(v.ocurrida_en at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') as fecha,
            c.nombre as cuenta, p.monto
       from venta v
       join venta_pago p on p.venta_id = v.id
       join cuenta_cobro c on c.id = p.cuenta_cobro_id
      where to_char(v.ocurrida_en at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') = $1
      order by v.ocurrida_en, v.id, p.id`,
    [mes],
  )
  const cobros = []
  const fuera = {}
  const contadas = new Set()
  for (const r of rows) {
    const m = motivoFuera(r)
    if (m) {
      if (!contadas.has(r.venta_id)) { contadas.add(r.venta_id); fuera[m] = (fuera[m] || 0) + 1 }
      continue
    }
    cobros.push({ marca: r.marca, venta_id: r.venta_id, fecha: r.fecha, cuenta: r.cuenta, monto: Number(r.monto) })
  }
  return { cobros, fuera }
}

/**
 * Las ventas propias que ya tienen factura (`venta_factura`), como claves `marca:venta_id` de `claveVenta`.
 * @param {import('pg').ClientBase} db
 */
export async function facturadasPropias(db) {
  const { rows } = await db.query(
    `select distinct v.marca, v.id from venta_factura f join venta v on v.id = f.venta_id where f.tipo = 'factura'`,
  )
  return new Set(rows.map((r) => `${r.marca}:${r.id}`))
}
