/**
 * CORREGIR EL PRECIO de una venta ya hecha, CASO 1: sin mover plata (sql/036; Bruno 24-oct). La venta, sus líneas y sus
 * pagos ⛔ se editan: la corrección es una fila inmutable con el precio antes/después de cada línea, el motivo y quién.
 * El total nuevo = el vigente + la diferencia de importes de las líneas corregidas (el descuento por forma de pago ⛔ se
 * recalcula). Se compara con lo COBRADO y la diferencia queda guardada y visible, para resolverla a mano.
 * Con factura (`venta_factura`) ⇒ `FACTURADA`. Quién puede (el interruptor `precio`) lo decide el monitor, ⛔ el motor.
 *
 * `db` conectado y sin transacción. Devuelven `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`.
 */
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const UUID = /^[0-9a-f-]{36}$/i
const pesos = (n) => Math.round(Number(n) * 100) / 100
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** El precio y el importe VIGENTES de cada línea (el de la última corrección, o el original). */
async function vigentes(db, ventaId) {
  return q(db, `select l.id::text as id, l.n, l.cantidad, l.sku,
      coalesce(c.precio_despues, l.precio)::float as precio, coalesce(c.importe_despues, l.importe)::float as importe
    from venta_linea l
    left join lateral (select cl.precio_despues, cl.importe_despues from venta_correccion_linea cl
      join venta_correccion k on k.id = cl.correccion_id where cl.venta_linea_id = l.id order by k.creada_en desc, k.id desc limit 1) c on true
    where l.venta_id = $1 order by l.n`, [ventaId])
}

/**
 * @param {{ venta_id: string, motivo: string, usuario: string, lineas: { n?: number, linea_id?: string, precio: number }[] }} e
 *   Cada línea se nombra por `n` (el renglón de la venta) o por `linea_id`; `precio` es el UNITARIO nuevo.
 */
export async function corregirPrecio(db, e) {
  if (!UUID.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const motivo = texto(e.motivo)
  if (!motivo) return falla('ENTRADA_INVALIDA', 'Falta el motivo', 'motivo')
  const usuario = texto(e.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién corrige', 'usuario')
  if (!Array.isArray(e.lineas) || !e.lineas.length) return falla('ENTRADA_INVALIDA', 'No hay líneas que corregir', 'lineas')
  const pedidas = []
  for (const [i, l] of e.lineas.entries()) {
    const precio = Number(l?.precio)
    if (!Number.isFinite(precio) || precio < 0) return falla('ENTRADA_INVALIDA', 'El precio es un número desde 0', `lineas[${i}].precio`)
    if (!Number.isInteger(l?.n) && !UUID.test(String(l?.linea_id ?? ''))) return falla('ENTRADA_INVALIDA', 'Falta cuál línea (n o linea_id)', `lineas[${i}]`)
    pedidas.push({ n: l.n, linea_id: l.linea_id, precio: pesos(precio) })
  }
  await db.query('begin')
  try {
    const r = await dentro(db, e, motivo, usuario, pedidas)
    await db.query(r.ok ? 'commit' : 'rollback')
    return r
  } catch (x) {
    await db.query('rollback').catch(() => {})
    throw x
  }
}

async function dentro(db, e, motivo, usuario, pedidas) {
  const [v] = await q(db, 'select id, empresa_id, marca, numero, tipo, estado, total::float as total, prueba from venta where id = $1 for update', [e.venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  if (v.estado === 'anulada') return falla('ANULADA', `La venta ${v.numero} está anulada`)
  if (v.tipo !== 'venta') return falla('ES_CAMBIO', `La ${v.numero} es un cambio: el precio se corrige en la venta original`)
  const [f] = await q(db, 'select 1 from venta_factura where venta_id = $1 limit 1', [v.id])
  if (f) return falla('FACTURADA', `La venta ${v.numero} ya tiene factura: el precio se corrige con una nota de crédito`)
  const [c] = await q(db, `select exists (select 1 from venta where venta_original_id = $1 and estado = 'confirmada') as hay`, [v.id])
  if (c.hay) return falla('CON_CAMBIO', `La venta ${v.numero} ya tuvo un cambio: el precio ya no se corrige acá`)
  const lineas = await vigentes(db, v.id)
  const vistas = new Set()
  const filas = []
  for (const [i, p] of pedidas.entries()) {
    const l = lineas.find((x) => (p.linea_id ? x.id === String(p.linea_id).toLowerCase() : x.n === p.n))
    if (!l) return falla('NO_ENCONTRADA', 'Esa línea no es de la venta', `lineas[${i}]`)
    if (vistas.has(l.id)) return falla('ENTRADA_INVALIDA', 'La misma línea dos veces', `lineas[${i}]`)
    vistas.add(l.id)
    if (pesos(l.precio) === p.precio) continue   // ⛔ fila de un «cambio» que deja todo igual
    filas.push({ id: l.id, precio_antes: pesos(l.precio), precio_despues: p.precio, importe_antes: pesos(l.importe),
      importe_despues: pesos(l.importe + (p.precio - l.precio) * l.cantidad) })
  }
  if (!filas.length) return falla('SIN_CAMBIO', 'Los precios ya son esos')
  const [ult] = await q(db, 'select total_despues::float as t from venta_correccion where venta_id = $1 order by creada_en desc, id desc limit 1', [v.id])
  const totalAntes = pesos(ult ? ult.t : v.total)
  const totalDespues = pesos(totalAntes + filas.reduce((s, x) => s + x.importe_despues - x.importe_antes, 0))
  if (totalDespues < 0) return falla('ENTRADA_INVALIDA', 'El total no puede quedar en negativo', 'lineas')
  const [{ cobrado }] = await q(db, 'select coalesce(sum(monto), 0)::float as cobrado from venta_pago where venta_id = $1', [v.id])
  const diferencia = pesos(totalDespues - cobrado)
  const [k] = await q(db, `insert into venta_correccion (empresa_id, marca, venta_id, motivo, total_antes, total_despues, cobrado, diferencia, prueba, usuario)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::text, creada_en`,
  [v.empresa_id, v.marca, v.id, motivo, totalAntes, totalDespues, pesos(cobrado), diferencia, v.prueba, usuario])
  for (const x of filas) {
    await q(db, `insert into venta_correccion_linea (correccion_id, venta_linea_id, precio_antes, precio_despues, importe_antes, importe_despues)
      values ($1, $2, $3, $4, $5, $6)`, [k.id, x.id, x.precio_antes, x.precio_despues, x.importe_antes, x.importe_despues])
  }
  return { ok: true, correccion: { id: k.id, venta_id: v.id, numero: Number(v.numero), total_antes: totalAntes, total_despues: totalDespues,
    cobrado: pesos(cobrado), diferencia, motivo, usuario, creada_en: k.creada_en, lineas: filas } }
}

/** Las correcciones de una venta (de la más vieja a la más nueva) y su estado vigente: total, cobrado y lo que falta resolver. */
export async function correccionesDe(db, { venta_id }) {
  if (!UUID.test(String(venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const [v] = await q(db, 'select total::float as total from venta where id = $1', [venta_id])
  if (!v) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  const correcciones = await q(db, `select k.id::text, k.motivo, k.usuario, k.creada_en, k.total_antes::float, k.total_despues::float, k.cobrado::float, k.diferencia::float,
      (select coalesce(json_agg(json_build_object('n', l.n, 'precio_antes', cl.precio_antes::float, 'precio_despues', cl.precio_despues::float) order by l.n), '[]')
        from venta_correccion_linea cl join venta_linea l on l.id = cl.venta_linea_id where cl.correccion_id = k.id) as lineas
    from venta_correccion k where k.venta_id = $1 order by k.creada_en, k.id`, [venta_id])
  const [{ cobrado }] = await q(db, 'select coalesce(sum(monto), 0)::float as cobrado from venta_pago where venta_id = $1', [venta_id])
  const total = correcciones.length ? correcciones.at(-1).total_despues : v.total
  return { ok: true, correcciones, total, cobrado: pesos(cobrado), diferencia: pesos(total - cobrado) }
}

export { vigentes as lineasVigentes }
