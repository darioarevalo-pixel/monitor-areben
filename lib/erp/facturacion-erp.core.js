/**
 * **Lo cobrado por las ventas del ERP, en la Facturación del mes** (auditoría del corte, 3-nov).
 *
 * POR QUÉ: `leerMes` arma el tope y la lista «sin factura» de `ventas_cobros`, que sólo llena el sync de GN. Desde el corte de
 * una línea GN ⛔ recibe sus ventas ⇒ lo que BDI y Zattia cobran después de su corte ⛔ entraría al tope ni se podría facturar
 * (~650 facturas por mes, sep-2026). Stunned ya estaba así desde el 28-oct: 0 filas de `ventas_cobros` contra 18 ventas.
 *
 * QUÉ SE SUMA: `cobrosPropios` del motor (lo real que GN ⛔ tiene; lo devuelto resta en el mes en que se devolvió, Bruno 19-oct)
 * + el PAGO A CUENTA del mayorista (`cuenta_movimiento`), que `cobrosPropios` ⛔ lee y en GN entraba como un cobro más.
 * Lo que queda en cuenta corriente ⛔ es plata: se saca acá, para que $17 M de deuda ⛔ aparezcan como «sin clasificar».
 * La cuenta se clasifica por NOMBRE contra `cuentas_cobro`, igual que la de GN; la que ⛔ está ahí se avisa y ⛔ suma.
 *
 * 🔴 SÓLO TOPE: entró plata, pero ⛔ se ofrece en la lista: un cambio (se factura con «Facturar el cambio»: NC + factura), una
 * venta anulada con devolución propia y un pago a cuenta (el mayorista se factura por parte, desde su hoja).
 * Puro: la lectura de la base vive en `leerMes`.
 */

const AR = `at time zone 'America/Argentina/Buenos_Aires'`

/** $1 = ids de las ventas (uuid[]). */
export const SQL_FICHAS_ERP = `
  select v.id::text as id, v.marca as linea, v.tipo, v.estado, v.numero, c.nombre as cliente,
         exists (select 1 from venta_factura f where f.venta_id = v.id and f.tipo = 'factura') as facturada
    from venta v left join cliente c on c.id = v.cliente_id
   where v.id = any($1::uuid[])`

/** $1 = mes 'YYYY-MM'. Con su fecha y su signo, como `cobrosDe` (`-m.monto`): el pago dado vuelta ⛔ cuenta. */
export const SQL_PAGOS_A_CUENTA_ERP = `
  select m.id::text as id, m.marca as linea, -m.monto as monto, cc.nombre as cuenta, cl.nombre as cliente,
         to_char(m.ocurrida_en ${AR}, 'YYYY-MM-DD') as fecha
    from cuenta_movimiento m
    join cuenta_cobro cc on cc.id = m.cuenta_cobro_id
    left join cliente cl on cl.id = m.cliente_id
   where m.tipo = 'pago' and not m.prueba and to_char(m.ocurrida_en ${AR}, 'YYYY-MM') = $1
     and not exists (select 1 from cuenta_movimiento x where x.empresa_id = m.empresa_id and x.ref = m.ref || ':anulacion')`

/** Las cuentas donde queda la deuda: ⛔ entró plata. */
export const SQL_CUENTAS_SIN_PLATA = `select distinct nombre from cuenta_cobro where medio = 'cuenta'`

/**
 * @param {string} marca la marca de la BASE (`bdi` | `zattia`): Stunned vive en la de Zattia y factura con su lote. Los cobros
 *   del motor vienen con la LÍNEA en `marca`; la clave de la Facturación (`claveVenta`) va por la base.
 * @param {{ propios: Array<{ venta_id: string, fecha: string, cuenta: string, monto: number }>,
 *   fichas: Array<{ id: string, linea: string, tipo: string, estado: string, numero: number|string|null, cliente: string|null, facturada: boolean }>,
 *   pagos: Array<{ id: string, linea: string, monto: number|string, cuenta: string, cliente: string|null, fecha: string }>,
 *   sinPlata: string[] }} d
 * @returns {{ cobros: Array<{ marca: string, venta_id: string, fecha: string, cuenta: string, monto: number }>,
 *   lineas: Map<string, string>, datos: Map<string, { numero: string|null, cliente: string|null }>, soloTope: Set<string>, facturadas: Set<string> }}
 */
export function cobrosDeVentasErp(marca, { propios, fichas, pagos, sinPlata }) {
  const lineas = new Map(), datos = new Map(), soloTope = new Set(), facturadas = new Set()
  const noEsPlata = new Set(sinPlata.map((n) => String(n).trim()))
  for (const f of fichas) {
    lineas.set(f.id, f.linea)
    datos.set(f.id, { numero: f.numero != null ? String(f.numero) : null, cliente: f.cliente || null })
    if (f.tipo !== 'venta' || f.estado !== 'confirmada') soloTope.add(f.id)
    if (f.facturada) facturadas.add(f.id)
  }
  const cobros = propios
    .filter((c) => !noEsPlata.has(String(c.cuenta ?? '').trim()))
    .map((c) => ({ marca, venta_id: String(c.venta_id), fecha: c.fecha, cuenta: c.cuenta ?? '', monto: Number(c.monto) }))
  for (const p of pagos) {
    lineas.set(p.id, p.linea)
    datos.set(p.id, { numero: null, cliente: p.cliente || null })
    soloTope.add(p.id)
    cobros.push({ marca, venta_id: p.id, fecha: p.fecha, cuenta: p.cuenta ?? '', monto: Number(p.monto) })
  }
  return { cobros, lineas, datos, soloTope, facturadas }
}
