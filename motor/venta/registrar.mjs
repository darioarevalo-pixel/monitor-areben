/**
 * La venta propia contra la base: `registrarVenta`, `anularVenta`, `registrarCambio` del contrato
 * (`~/Documents/erp-monitor/contrato-venta.md`). Cada una en UNA transacción: venta + líneas + costo +
 * pagos + movimientos del libro, todo o nada.
 *
 * `db` es un cliente pg CONECTADO y sin transacción abierta (`pool.connect()` en el monitor, `pg.Client`
 * en un script): la función hace `begin`/`commit` y lo deja como lo recibió. ⛔ supabase-js: no tiene
 * transacciones.
 *
 * Devuelven `{ ok: true, … }` o `{ ok: false, error }`. Sólo lanzan si la BASE falla.
 */
import { armarAnulacion, armarCambio, armarVenta } from './armar.mjs'

const q = async (db, sql, params = []) => (await db.query(sql, params)).rows

/** Una transacción: `fn` devuelve el resultado; si es `{ ok: false }`, se vuelve atrás. */
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

/** La configuración de la marca (§3 del contrato), con la forma que pide `armar.mjs`. */
async function leerConf(db, marca) {
  const marcas = await q(db, `select m.id, m.empresa_id, coalesce(array_agg(d.id) filter (where d.vende), '{}') as depositos
    from marca m left join deposito d on d.marca = m.id where m.id = $1 group by m.id, m.empresa_id`, [marca])
  const cuentas = await q(db, 'select id, marca, gn_cuenta_id, activa from cuenta_cobro where marca = $1', [marca])
  return { marcas: Object.fromEntries(marcas.map((m) => [m.id, { empresa_id: m.empresa_id, depositos: m.depositos }])), cuentas }
}

/** La venta que ya entró con esa clave, para devolverla igual (idempotencia). */
async function yaRegistrada(db, origen, origenRef) {
  const [v] = await q(db, 'select id, numero, estado, tipo, total, prueba, marca from venta where origen = $1 and origen_ref = $2', [origen, origenRef])
  return v ?? null
}

/** ¿La repetición trae lo MISMO? Se compara lo que la define: marca, total y cuántas prendas. */
async function mismaVenta(db, v, marca, total, unidades) {
  const [r] = await q(db, 'select coalesce(sum(cantidad), 0)::int as u from venta_linea where venta_id = $1', [v.id])
  return v.marca === marca && Number(v.total) === Math.max(Number(total), 0) && r.u === unidades
}

const respuestaYaExistia = (v) => ({ ok: true, venta: { id: v.id, numero: Number(v.numero), estado: v.estado, tipo: v.tipo, total: Number(v.total), prueba: v.prueba }, ya_existia: true, movimientos: 0, avisos: [] })
const conflicto = (e) => ({ ok: false, error: { codigo: 'CONFLICTO_IDEMPOTENCIA', mensaje: `Ya entró otra venta con ${e.origen} ${e.origen_ref} y es distinta: no se pisa`, campo: 'origen_ref' } })

/** El costo vigente de cada prenda. Hasta la tabla de costo (paso 5), el espejo de GN, que es POR PRODUCTO. */
async function ponerCosto(db, lineas, avisos) {
  const ids = [...new Set(lineas.filter((l) => l.costo_fuente == null).map((l) => l.product_id))]
  if (!ids.length) return
  const hay = (await q(db, `select to_regclass('public.productos') is not null as hay`))[0].hay
  const costos = hay ? new Map((await q(db, 'select id, unit_cost from productos where id = any($1::bigint[])', [ids])).map((r) => [Number(r.id), Number(r.unit_cost)])) : new Map()
  for (const l of lineas) {
    if (l.costo_fuente != null) continue
    const c = costos.get(l.product_id)
    if (c > 0) Object.assign(l, { costo_unitario: c, costo_fuente: 'gn_espejo' })
    else avisos.push({ codigo: 'SIN_COSTO', product_id: l.product_id, size_id: l.size_id })
  }
}

/** Lo que dice el libro de cada prenda que SALE: si ⛔ alcanza, aviso (en sombra el libro todavía ⛔ cierra ⇒ ⛔ frena). */
async function avisarStock(db, venta, lineas, avisos) {
  const salen = lineas.filter((l) => l.cantidad > 0)
  if (!salen.length) return
  const filas = await q(db, `select product_id, size_id, coalesce(sum(cantidad), 0)::int as nivel from stock_movimiento
    where deposito = $1 and (product_id, size_id) in (select * from unnest($2::bigint[], $3::bigint[])) group by 1, 2`,
  [venta.deposito, salen.map((l) => l.product_id), salen.map((l) => l.size_id)])
  const nivel = new Map(filas.map((r) => [`${r.product_id}:${r.size_id}`, r.nivel]))
  for (const l of salen) {
    if ((nivel.get(`${l.product_id}:${l.size_id}`) ?? 0) < l.cantidad) avisos.push({ codigo: 'SIN_STOCK_EN_LIBRO', product_id: l.product_id, size_id: l.size_id })
  }
}

async function insertar(db, tabla, filas) {
  if (!filas.length) return
  await db.query(`insert into ${tabla} select * from jsonb_populate_recordset(null::${tabla}, $1::jsonb)`, [JSON.stringify(filas)])
}

/** Escribe la venta armada: número, cabecera, líneas, pagos y movimientos. */
async function escribir(db, armada) {
  const [n] = await q(db, `insert into venta_numero (marca, ultimo) values ($1, 1)
    on conflict (marca) do update set ultimo = venta_numero.ultimo + 1 returning ultimo`, [armada.venta.marca])
  const venta = { ...armada.venta, numero: Number(n.ultimo), registrada_en: new Date().toISOString(), gn_sale_id: null }
  await insertar(db, 'venta', [venta])
  await insertar(db, 'venta_linea', armada.lineas)
  await insertar(db, 'venta_pago', armada.pagos)
  const movimientos = armada.movimientos.map((m) => ({ ...m, detalle: { ...m.detalle, venta_numero: venta.numero } }))
  await insertarMovimientos(db, movimientos)
  return venta
}

/** `stock_movimiento` tiene `id` identity y `registrado_en` por defecto ⇒ se nombran las columnas. */
async function insertarMovimientos(db, movimientos) {
  if (!movimientos.length) return
  await db.query(`insert into stock_movimiento (linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle)
    select linea, product_id, size_id, sku, barcode, deposito, cantidad, tipo, origen, clave, origen_ref, ocurrido_en, hora_exacta, grupo, detalle
    from jsonb_populate_recordset(null::stock_movimiento, $1::jsonb)`, [JSON.stringify(movimientos)])
}

/** Dos llamadas a la vez con la misma clave: la segunda choca con el `unique` ⇒ se lee la primera. */
const esDuplicada = (e) => e && e.code === '23505' && /origen/.test(String(e.constraint || e.detail || ''))

async function conReintentoIdempotente(db, e, unidades, fn) {
  try {
    return await enTransaccion(db, fn)
  } catch (err) {
    if (!esDuplicada(err)) throw err
    const v = await yaRegistrada(db, e.origen, String(e.origen_ref).trim())
    if (!v) throw err
    return (await mismaVenta(db, v, v.marca, e.total ?? v.total, unidades)) ? respuestaYaExistia(v) : conflicto(e)
  }
}

/** §1 registrarVenta. @param {import('pg').ClientBase} db @param {any} e */
export async function registrarVenta(db, e) {
  const unidades = Array.isArray(e?.lineas) ? e.lineas.reduce((s, l) => s + Number(l?.cantidad || 0), 0) : 0
  return conReintentoIdempotente(db, e, unidades, async () => {
    const ya = e && e.origen && e.origen_ref ? await yaRegistrada(db, e.origen, String(e.origen_ref).trim()) : null
    if (ya) return (await mismaVenta(db, ya, e.marca, e.total, unidades)) ? respuestaYaExistia(ya) : conflicto(e)
    const armada = armarVenta(e, await leerConf(db, e?.marca))
    if (!armada.ok) return armada
    const avisos = []
    await ponerCosto(db, armada.lineas, avisos)
    await avisarStock(db, armada.venta, armada.lineas, avisos)
    const venta = await escribir(db, armada)
    return { ok: true, venta: { id: venta.id, numero: venta.numero, estado: venta.estado, tipo: venta.tipo, total: venta.total, prueba: venta.prueba }, ya_existia: false, movimientos: armada.movimientos.length, avisos }
  })
}

/** La venta con sus líneas (y cuánto de cada una ya se devolvió en cambios), bloqueada para la transacción. */
async function leerParaCambiar(db, ventaId) {
  const [venta] = await q(db, 'select * from venta where id = $1 for update', [ventaId])
  if (!venta) return null
  const lineas = await q(db, `select l.*, coalesce((select -sum(d.cantidad) from venta_linea d join venta c on c.id = d.venta_id
      where d.linea_origen_id = l.id and c.estado = 'confirmada'), 0)::int as cambiado
    from venta_linea l where l.venta_id = $1 order by l.n`, [ventaId])
  const num = (l) => ({ ...l, product_id: Number(l.product_id), size_id: Number(l.size_id), importe: Number(l.importe), costo_unitario: l.costo_unitario == null ? null : Number(l.costo_unitario) })
  const [c] = await q(db, `select exists (select 1 from venta where venta_original_id = $1 and estado = 'confirmada') as hay`, [ventaId])
  return { venta: { ...venta, numero: Number(venta.numero) }, lineas: lineas.map(num), tieneCambio: c.hay }
}

/** ¿Tiene factura? (paso 6: `venta_factura`). Para avisar que falta la NC. */
async function tieneFactura(db, ventaId) {
  const [r] = await q(db, `select exists (select 1 from venta_factura where venta_id = $1 and tipo = 'factura') as hay`, [ventaId])
  return r.hay
}

/** §1 registrarCambio. @param {import('pg').ClientBase} db @param {any} e */
export async function registrarCambio(db, e) {
  const devueltas = Array.isArray(e?.devueltas) ? e.devueltas.reduce((s, d) => s + Number(d?.cantidad || 0), 0) : 0
  const nuevas = Array.isArray(e?.nuevas) ? e.nuevas.reduce((s, l) => s + Number(l?.cantidad || 0), 0) : 0
  return conReintentoIdempotente(db, { ...e, total: undefined }, nuevas - devueltas, async () => {
    const ya = e && e.origen && e.origen_ref ? await yaRegistrada(db, e.origen, String(e.origen_ref).trim()) : null
    if (ya) return (await mismaVenta(db, ya, ya.marca, ya.total, nuevas - devueltas)) ? respuestaYaExistia(ya) : conflicto(e)
    const original = await leerParaCambiar(db, e?.venta_original_id)
    if (original && e.marca && e.marca !== original.venta.marca) return { ok: false, error: { codigo: 'OTRA_MARCA', mensaje: 'Un cambio entre marcas ⛔ se puede todavía', campo: 'marca' } }
    const armada = armarCambio(e, original ? await leerConf(db, original.venta.marca) : { marcas: {}, cuentas: [] }, original)
    if (!armada.ok) return armada
    const avisos = []
    await ponerCosto(db, armada.lineas, avisos)
    await avisarStock(db, armada.venta, armada.lineas, avisos)
    const venta = await escribir(db, armada)
    return {
      ok: true, venta: { id: venta.id, numero: venta.numero, tipo: 'cambio', diferencia: armada.diferencia },
      movimientos: armada.movimientos.length, a_favor: armada.a_favor, avisos,
      nc_pendiente: await tieneFactura(db, original.venta.id),
    }
  })
}

/** §1 anularVenta. @param {import('pg').ClientBase} db @param {{ venta_id: string, motivo: string, usuario: string, devolucion?: any[] }} e */
export async function anularVenta(db, e) {
  return enTransaccion(db, async () => {
    const actual = await leerParaCambiar(db, e?.venta_id)
    const armada = armarAnulacion(actual, e ?? {})
    if (!armada.ok) return armada
    await insertar(db, 'venta_anulacion', [armada.anulacion])
    await db.query(`update venta set estado = 'anulada' where id = $1`, [actual.venta.id])
    await insertarMovimientos(db, armada.movimientos)
    return { ok: true, venta: { id: actual.venta.id, numero: actual.venta.numero, estado: 'anulada' }, movimientos: armada.movimientos.length, nc_pendiente: await tieneFactura(db, actual.venta.id) }
  })
}
