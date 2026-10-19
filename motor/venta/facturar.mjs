/**
 * Facturar ventas PROPIAS (paso 6): los cobros de las ventas del motor, con la forma que piden `techoDelMes` y
 * `ventasParaFacturar` de `lib/arca` ({ marca, venta_id, fecha, cuenta, monto }), para sumarlos a los de GN.
 *
 * 🔴 ⛔ se cuenta dos veces: mientras GN viva, la Caja escribe la venta en GN Y en el motor (y TN la crea en GN)
 * ⇒ una venta propia con `gn_sale_id` ya entra por los cobros de GN. Acá van sólo las que GN ⛔ tiene. Tampoco
 * las de `prueba` (TN en sombra) ni las anuladas (GN tampoco cuenta las suyas: `ventaCuenta`).
 * La fecha es la del día AR de la venta (la Caja cobra en el momento); un cambio trae su cobro en su propia venta.
 * 🔑 Bruno (19-oct): lo DEVUELTO resta en el MES EN QUE SE DEVOLVIÓ (sql/028, como la NC y `pendiente_facturar`): la
 * plata devuelta y el saldo a favor que se dejó van en negativo, en su fecha, a la venta ORIGINAL; la anulada CON
 * devolución propia cuenta sus cobros en plata (la plata entró). Usar el saldo es un cobro más.
 *
 * Sin dependencias fuera de `lib/venta`: el monitor lo usa desde la copia (`npm run traer-motor`).
 */

/** Por qué una venta propia ⛔ entra (para el contador de lo que se dejó afuera). */
export function motivoFuera(v) {
  if (v.prueba) return 'prueba'
  // La anulada con devolución propia ⛔ queda afuera: su plata entró y salió, y lo que salió resta aparte (sql/028).
  if (v.estado !== 'confirmada' && !v.con_devolucion) return 'anulada'
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
  const AR = `at time zone 'America/Argentina/Buenos_Aires'`
  const [{ hay }] = (await db.query(`select to_regclass('venta_devolucion') is not null as hay`)).rows
  const { rows } = await db.query(
    `select v.id as venta_id, v.marca, v.estado, v.prueba, v.gn_sale_id, jsonb_build_object('gn_sale_id', v.detalle->'gn_sale_id') as detalle,
            to_char(v.ocurrida_en ${AR}, 'YYYY-MM-DD') as fecha, c.nombre as cuenta, c.medio as cuenta_medio, p.monto,
            ${hay ? 'exists (select 1 from venta_devolucion d where d.venta_id = v.id)' : 'false'} as con_devolucion
       from venta v
       join venta_pago p on p.venta_id = v.id
       join cuenta_cobro c on c.id = p.cuenta_cobro_id
      where to_char(v.ocurrida_en ${AR}, 'YYYY-MM') = $1
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
    // De la anulada sólo la plata: lo pagado con saldo o a cuenta lo dieron vuelta sus libros.
    if (r.estado !== 'confirmada' && ['saldo', 'cuenta'].includes(r.cuenta_medio)) continue
    cobros.push({ marca: r.marca, venta_id: r.venta_id, fecha: r.fecha, cuenta: r.cuenta, monto: Number(r.monto) })
  }
  if (hay) for (const r of await devueltoEn(db, mes)) if (!motivoFuera(r)) cobros.push({ marca: r.marca, venta_id: r.venta_id, fecha: r.fecha, cuenta: r.cuenta, monto: -Number(r.monto) })
  return { cobros, fuera }
}

/**
 * Lo que SALIÓ en el mes (sql/028): la plata devuelta y el saldo a favor que se dejó (+ la anulación de lo que lo dejó,
 * que vuelve a entrar ⇒ monto negativo acá), por la fecha en que pasó y con la venta ORIGINAL (de ella el
 * `motivoFuera`: prueba o ya en GN ⇒ ⛔ entra; anulada ⛔ la saca: lo devuelto de una anulada es justo lo que resta).
 */
async function devueltoEn(db, mes) {
  const AR = `at time zone 'America/Argentina/Buenos_Aires'`
  const { rows } = await db.query(
    `select o.id as venta_id, o.marca, 'confirmada' as estado, o.prueba, o.gn_sale_id, jsonb_build_object('gn_sale_id', o.detalle->'gn_sale_id') as detalle,
            x.fecha, x.cuenta, x.monto
       from (
         select d.venta_id, to_char(d.ocurrida_en ${AR}, 'YYYY-MM-DD') as fecha, c.nombre as cuenta, d.monto, d.ocurrida_en as en
           from venta_devolucion d join cuenta_cobro c on c.id = d.cuenta_cobro_id
          where d.forma = 'plata' and to_char(d.ocurrida_en ${AR}, 'YYYY-MM') = $1
         union all
         select s.venta_id, to_char(s.creado_en ${AR}, 'YYYY-MM-DD'), c.nombre, s.monto, s.creado_en
           from saldo_favor_movimiento s join cuenta_cobro c on c.marca = s.marca and c.medio = 'saldo'
          where (s.tipo in ('cambio', 'devolucion') or (s.tipo = 'anulacion' and s.monto < 0)) and to_char(s.creado_en ${AR}, 'YYYY-MM') = $1
       ) x
       join venta v on v.id = x.venta_id
       join venta o on o.id = coalesce(v.venta_original_id, v.id)
      order by x.en`,
    [mes],
  )
  return rows
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
