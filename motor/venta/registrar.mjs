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
import { randomUUID } from 'node:crypto'
import { armarAnulacion, armarCambio, armarVenta, movimientosDeAnulacion, mueveStock } from './armar.mjs'
import { costosDe } from './costo.mjs'
import { armarDevolucion, autorizacion, leerDevolucion, pagosDePlata, vueltaDe } from './devolucion.core.mjs'
import { frena } from '../cuenta/cuenta.core.mjs'
import { anularCompraDe, cuentaBloqueada, filaCompra, insertarFila } from '../cuenta/libro.mjs'
import { guardarClienteGN } from './cliente.mjs'
import { mandaEn } from '../tn/stock.mjs'

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
export async function leerConf(db, marca) {
  const marcas = await q(db, `select m.id, m.empresa_id, coalesce(array_agg(d.id) filter (where d.vende), '{}') as depositos
    from marca m left join deposito d on d.marca = m.id where m.id = $1 group by m.id, m.empresa_id`, [marca])
  const cuentas = await q(db, 'select id, marca, gn_cuenta_id, activa, medio, nombre from cuenta_cobro where marca = $1', [marca])
  const canales = (await q(db, 'select id from canal')).map((c) => c.id)
  // Las rutas de gerencia y las cuentas reales (sql/019-020). Una base sin la 020 ⇒ los cobros quedan sin cuenta real.
  const [{ hay }] = await q(db, `select exists (select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'ruta_cobro' and column_name = 'dias_acreditacion') as hay`)
  const rutas = hay ? await q(db, 'select marca, canal, medio, cuenta_real_id, tasa, dias_acreditacion, desde from ruta_cobro where marca = $1', [marca]) : []
  const cuentasReales = hay ? await q(db, 'select id, activa from cuenta_real') : []
  return { marcas: Object.fromEntries(marcas.map((m) => [m.id, { empresa_id: m.empresa_id, depositos: m.depositos }])), cuentas, canales, rutas, cuentasReales }
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

/** El costo vigente de cada prenda (`costosDe`: lo cargado en el ERP, si no el espejo de GN), que es POR PRODUCTO. */
async function ponerCosto(db, lineas, avisos) {
  const ids = [...new Set(lineas.filter((l) => l.costo_fuente == null).map((l) => l.product_id))]
  if (!ids.length) return
  const costos = await costosDe(db, ids)
  for (const l of lineas) {
    if (l.costo_fuente != null) continue
    const c = costos.get(l.product_id)
    if (c) Object.assign(l, { costo_unitario: c.costo, costo_fuente: c.fuente })
    else avisos.push({ codigo: 'SIN_COSTO', product_id: l.product_id, size_id: l.size_id })
  }
}

/**
 * Lo que dice el libro de cada prenda que SALE: si ⛔ alcanza, aviso `SIN_STOCK_EN_LIBRO` con el nivel. Se cuenta NETO por
 * variante: en un cambio por la misma prenda, la que entra suma antes de que reste la que sale (si no, falso aviso).
 */
async function avisarStock(db, venta, lineas, avisos) {
  const neto = new Map()
  for (const l of lineas) { const k = `${l.product_id}:${l.size_id}`; neto.set(k, (neto.get(k) || 0) + l.cantidad) }
  const salen = [...neto].filter(([, n]) => n > 0).map(([k, n]) => { const [product_id, size_id] = k.split(':').map(Number); return { product_id, size_id, cantidad: n } })
  if (!salen.length) return
  // La última unidad (auditoría 20-oct): sin candado, dos cajas leen el mismo nivel y pasan las dos. Uno por depósito ×
  // variante, hasta el commit ⇒ la segunda espera y lee el movimiento de la primera. ⛔ lleva la marca: Zattia y Stunned
  // comparten el depósito físico y el libro cuenta por depósito. En orden, para que dos ventas cruzadas ⛔ se traben.
  if (mueveStock(venta)) {
    const llaves = salen.map((l) => `stock:${venta.deposito}:${l.product_id}:${l.size_id}`).sort()
    for (const k of llaves) await q(db, 'select pg_advisory_xact_lock(hashtext($1))', [k])
  }
  const filas = await q(db, `select product_id, size_id, coalesce(sum(cantidad), 0)::int as nivel from stock_movimiento
    where deposito = $1 and (product_id, size_id) in (select * from unnest($2::bigint[], $3::bigint[])) group by 1, 2`,
  [venta.deposito, salen.map((l) => l.product_id), salen.map((l) => l.size_id)])
  const nivel = new Map(filas.map((r) => [`${r.product_id}:${r.size_id}`, r.nivel]))
  for (const l of salen) {
    const n = nivel.get(`${l.product_id}:${l.size_id}`) ?? 0
    if (n < l.cantidad) avisos.push({ codigo: 'SIN_STOCK_EN_LIBRO', product_id: l.product_id, size_id: l.size_id, nivel: n, cantidad: l.cantidad })
  }
}

/**
 * 🔑 «El libro MANDA» · sin negativos (Bruno, 18-oct): con la llave de la marca prendida, la venta de la CAJA que deja el
 * libro < 0 ⛔ entra, salvo con el PIN de la encargada (lo valida el monitor: llega `autoriza: { usuario, motivo:
 * 'pin_encargada' }`); si entra así, la venta guarda en `detalle.contar` qué variantes hay que CONTAR (la prenda estaba en
 * la mano ⇒ el que está mal es el libro). TN, mayorista y el resto ⛔ se frenan: ya los cobró otro. La de prueba ⛔ mueve
 * el libro ⇒ ⛔ se frena.
 * Llave: `VENTA_SIN_NEGATIVOS=zattia,stunned` (apagada: el libro todavía ⛔ es la verdad; se prende con el corte).
 */
export const MARCAS_LLAVE = ['bdi', 'zattia', 'stunned']
export function sinNegativosEn(marca, env = process.env) {
  const lista = String(env.VENTA_SIN_NEGATIVOS ?? '').split(',').map((m) => m.trim().toLowerCase()).filter(Boolean)
  for (const m of lista) if (!MARCAS_LLAVE.includes(m)) throw new Error(`VENTA_SIN_NEGATIVOS: marca desconocida «${m}»`)
  return lista.includes(marca)
}

/** El freno de `sinNegativosEn` sobre los avisos ya calculados: la falla, o null (y si lo autorizó la encargada, anota). */
function frenarSinStock(armada, avisos, e) {
  const v = armada.venta
  const faltan = avisos.filter((a) => a.codigo === 'SIN_STOCK_EN_LIBRO')
  if (!faltan.length || !mueveStock(v) || v.origen !== 'caja' || !sinNegativosEn(v.marca)) return null
  const a = e?.autoriza
  if (a?.motivo === 'pin_encargada' && typeof a.usuario === 'string' && a.usuario.trim()) {
    v.detalle = { ...v.detalle, contar: faltan.map(({ product_id, size_id, nivel }) => ({ product_id, size_id, nivel, autoriza: a.usuario.trim() })) }
    return null
  }
  const n = faltan.length
  return { ok: false, error: { codigo: 'SIN_STOCK', mensaje: `El libro dice que ${n === 1 ? 'esa prenda no está' : `${n} prendas no están`} en ${v.deposito}: hace falta el PIN de la encargada`, campo: 'lineas', faltan } }
}

const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
/** Medio peso de tolerancia al comparar saldos (todo se guarda con 2 decimales). */
const casi = (a, b) => a >= b - 0.005
const pesos = (x) => Math.round(Number(x) * 100) / 100

/**
 * Lo que queda A CUENTA (§15, sql/025): hace falta el cliente, y `frena` (sin crédito, atrasado, pasa el tope) se
 * salta sólo con el PIN de un admin (`autoriza: { motivo: 'pin_admin', usuario }`, queda en `detalle.cuenta_autoriza`).
 * La mayorista que llega de GN (`origen 'mayorista'`, en paralelo) ya se vendió allá ⇒ `autoriza: { motivo: 'gn' }` la deja
 * pasar y el freno queda anotado (lo que el ERP HABRÍA frenado). Bloquea la cuenta del cliente hasta el commit. `null` si está bien.
 */
async function chequearCuenta(db, armada, e) {
  if (!(armada.usa_cuenta > 0)) return null
  const v = armada.venta
  if (!v.cliente_id) return falla('FALTA_CLIENTE', 'Para dejar a cuenta hace falta el cliente', 'cliente')
  const { credito, estado } = await cuentaBloqueada(db, { cliente_id: v.cliente_id, marca: v.marca, prueba: v.prueba })
  const f = frena({ cuenta: estado, credito, monto: armada.usa_cuenta })
  if (!f) return null
  const a = e?.autoriza
  const porGN = a?.motivo === 'gn' && e.origen === 'mayorista'
  if ((a?.motivo === 'pin_admin' || porGN) && typeof a.usuario === 'string' && a.usuario.trim()) {
    v.detalle = { ...v.detalle, cuenta_autoriza: { usuario: a.usuario.trim(), codigo: f.codigo, ...(porGN ? { motivo: 'gn' } : {}) } }
    return null
  }
  return { ok: false, error: { codigo: f.codigo, mensaje: f.mensaje, campo: 'pagos', cuenta: { debe: estado.debe, vencido: estado.vencido, tope: credito?.tope ?? null } } }
}

/** Después de escribir la venta: su compra en la cuenta, y el saldo que queda. */
async function anotarCompra(db, venta, usaCuenta) {
  if (!(usaCuenta > 0)) return {}
  await insertarFila(db, filaCompra(venta, usaCuenta, venta.detalle?.cuenta_autoriza ? { autoriza: venta.detalle.cuenta_autoriza } : {}))
  const [r] = await q(db, 'select coalesce(sum(monto), 0)::float as s from cuenta_movimiento where cliente_id = $1 and marca = $2 and prueba = $3', [venta.cliente_id, venta.marca, venta.prueba])
  return { cuenta: r.s }
}

/**
 * La clienta de la venta (§6.2): por `cliente_id`, o por `cliente: { doc, nombre, whatsapp?, email? }` (la busca
 * por documento o la crea; el `unique` parcial de 007 hace que dos a la vez den la misma). `{ id: null }` si no vino.
 */
async function resolverCliente(db, empresaId, e) {
  if (e.cliente_id) {
    const [c] = await q(db, 'select id from cliente where id = $1 and empresa_id = $2', [e.cliente_id, empresaId])
    return c ? { id: c.id } : { error: falla('FALTA_CLIENTE', 'Esa clienta no está', 'cliente_id') }
  }
  const c = e.cliente
  if (!c) return { id: null }
  // El cliente de GN sin documento (la mayorista del espejo, sql/030): por `gn_client_id`.
  if (c.gn_client_id != null && !c.doc) {
    const r = await guardarClienteGN(db, { ...c, empresa_id: empresaId })
    return r.ok ? { id: r.cliente.id } : { error: r }
  }
  const doc = typeof c.doc === 'string' || typeof c.doc === 'number' ? String(c.doc).replace(/\D/g, '') : ''
  if (!doc) return { error: falla('FALTA_CLIENTE', 'Falta el documento de la clienta', 'cliente.doc') }
  if (!(typeof c.nombre === 'string' && c.nombre.trim())) return { error: falla('FALTA_CLIENTE', 'Falta el nombre de la clienta', 'cliente.nombre') }
  const [r] = await q(db, `insert into cliente (empresa_id, doc, nombre, whatsapp, email) values ($1, $2, $3, $4, $5)
    on conflict (empresa_id, doc) where doc is not null do update set doc = excluded.doc returning id`,
  [empresaId, doc, c.nombre.trim(), c.whatsapp || null, c.email || null])
  return { id: r.id }
}

/** El saldo a favor de la clienta en la marca, con su fila BLOQUEADA hasta el commit (dos usos a la vez ⛔ lo pasan). */
async function saldoDe(db, clienteId, marca, prueba) {
  await q(db, 'select id from cliente where id = $1 for update', [clienteId])
  const [r] = await q(db, 'select coalesce(sum(monto), 0) as s from saldo_favor_movimiento where cliente_id = $1 and marca = $2 and prueba = $3', [clienteId, marca, prueba])
  return Number(r.s)
}

const movSaldo = (venta, monto, tipo, usuario) => ({
  id: randomUUID(), empresa_id: venta.empresa_id, marca: venta.marca, cliente_id: venta.cliente_id, venta_id: venta.id,
  monto, tipo, prueba: venta.prueba, usuario, creado_en: new Date().toISOString(),
})

/** Pagar con saldo: hace falta la clienta y que le alcance. `null` si está bien. */
async function chequearUsoDeSaldo(db, armada) {
  if (!(armada.usa_saldo > 0)) return null
  const v = armada.venta
  if (!v.cliente_id) return falla('FALTA_CLIENTE', 'Para pagar con saldo a favor hace falta la clienta', 'cliente')
  const saldo = await saldoDe(db, v.cliente_id, v.marca, v.prueba)
  if (!casi(saldo, armada.usa_saldo)) return falla('SALDO_INSUFICIENTE', `La clienta tiene ${saldo} a favor y se quieren usar ${armada.usa_saldo}`, 'pagos')
  return null
}

/**
 * El id de GN de una venta que YA está en GN (la Caja la manda a los dos hasta el corte: `detalle.gn_sale_id`) va a
 * la COLUMNA: es la que mira `motivoFuera` para ⛔ contar dos veces en el techo. Lo halló B (15-oct): iba siempre null.
 */
export function idDeGN(detalle) {
  const n = Number(detalle && detalle.gn_sale_id)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

async function insertar(db, tabla, filas) {
  if (!filas.length) return
  await db.query(`insert into ${tabla} select * from jsonb_populate_recordset(null::${tabla}, $1::jsonb)`, [JSON.stringify(filas)])
}

/** Escribe la venta armada: número, cabecera, líneas, pagos y movimientos. */
async function escribir(db, armada) {
  const [n] = await q(db, `insert into venta_numero (marca, ultimo) values ($1, 1)
    on conflict (marca) do update set ultimo = venta_numero.ultimo + 1 returning ultimo`, [armada.venta.marca])
  const venta = { ...armada.venta, numero: Number(n.ultimo), registrada_en: new Date().toISOString(), gn_sale_id: idDeGN(armada.venta.detalle) }
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
  const unidades = unidadesDe(e)
  return conReintentoIdempotente(db, e, unidades, () => registrarDentro(db, e, unidades))
}

const unidadesDe = (e) => (Array.isArray(e?.lineas) ? e.lineas.reduce((s, l) => s + Number(l?.cantidad || 0), 0) : 0)

/** El cuerpo de `registrarVenta`, dentro de una transacción que abrió otro (registrar o reemplazar). */
async function registrarDentro(db, e, unidades) {
  const ya = e && e.origen && e.origen_ref ? await yaRegistrada(db, e.origen, String(e.origen_ref).trim()) : null
  if (ya) return (await mismaVenta(db, ya, e.marca, e.total, unidades)) ? respuestaYaExistia(ya) : conflicto(e)
  const armada = armarVenta(e, await leerConf(db, e?.marca))
  if (!armada.ok) return armada
  const cli = await resolverCliente(db, armada.venta.empresa_id, e)
  if (cli.error) return cli.error
  armada.venta.cliente_id = cli.id
  const sinSaldo = await chequearUsoDeSaldo(db, armada)
  if (sinSaldo) return sinSaldo
  const sinCuenta = await chequearCuenta(db, armada, e)
  if (sinCuenta) return sinCuenta
  const avisos = []
  await ponerCosto(db, armada.lineas, avisos)
  await avisarStock(db, armada.venta, armada.lineas, avisos)
  const sinStock = frenarSinStock(armada, avisos, e)
  if (sinStock) return sinStock
  const venta = await escribir(db, armada)
  if (armada.usa_saldo > 0) await insertar(db, 'saldo_favor_movimiento', [movSaldo(venta, -armada.usa_saldo, 'uso', venta.usuario)])
  return {
    ok: true, venta: { id: venta.id, numero: venta.numero, estado: venta.estado, tipo: venta.tipo, total: venta.total, prueba: venta.prueba }, ya_existia: false, movimientos: armada.movimientos.length, avisos,
    ...(armada.usa_saldo > 0 ? { saldo: await saldoDe(db, venta.cliente_id, venta.marca, venta.prueba) } : {}),
    ...(await anotarCompra(db, venta, armada.usa_cuenta)),
  }
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
    if (original && e.marca && e.marca !== original.venta.marca) return { ok: false, error: { codigo: 'OTRA_MARCA', mensaje: 'Todavía no se puede hacer un cambio entre marcas', campo: 'marca' } }
    const conf = original ? await leerConf(db, original.venta.marca) : { marcas: {}, cuentas: [] }
    const armada = armarCambio(e, conf, original)
    if (!armada.ok) return armada
    const leida = leerDevolucion(e.devolucion)
    if (leida.ok === false) return leida
    // §6.2: la clienta que vino en el cambio, o la de la venta original. Hace falta si queda saldo o si lo usa.
    const cli = await resolverCliente(db, armada.venta.empresa_id, e)
    if (cli.error) return cli.error
    armada.venta.cliente_id = cli.id ?? armada.venta.cliente_id
    // §17: lo que queda a favor se devuelve en PLATA si el local lo eligió; si no, es saldo (como siempre). Con la llave, PIN.
    const enPlata = armada.a_favor > 0 && leida.devolucion?.forma === 'plata'
    if (armada.a_favor > 0 && !enPlata && !armada.venta.cliente_id) return falla('FALTA_CLIENTE', `Quedan ${armada.a_favor} a favor: hace falta la clienta para guardarlos`, 'cliente')
    let dev = null, autoriza = null
    if (armada.a_favor > 0) {
      const a = autorizacion(armada.venta.marca, e.autoriza)
      if (a.ok === false) return a
      autoriza = a.autoriza
      if (leida.devolucion && !(await hayDevolucion(db))) return falla('ENTRADA_INVALIDA', 'Esta base todavía no registra devoluciones (falta sql/028)', 'devolucion')
      const o = original.venta
      // Lo pagado por lo devuelto: lo de lista con el descuento que tuvo la venta (13.500 por 15.000 en efectivo).
      const plata = Number(o.subtotal) > 0 ? (armada.a_favor * Number(o.total)) / Number(o.subtotal) : 0
      const pagos = leida.devolucion ? await pagosDe(db, o.id) : []
      if (enPlata) {
        const [ya] = await q(db, `select coalesce(sum(d.monto), 0)::float as s from venta_devolucion d join venta c on c.id = d.venta_id
          where c.venta_original_id = $1 and c.estado = 'confirmada' and d.forma = 'plata'`, [o.id])
        const queda = pagosDePlata(pagos).reduce((s, p) => s + p.monto, 0) - ya.s
        if (plata > queda + 0.01) return falla('DEVUELVE_DE_MAS', `De la venta ${o.numero} quedan ${pesos(queda)} pagados en plata y se quieren devolver ${pesos(plata)}`, 'devolucion')
      }
      if (leida.devolucion) {
        dev = armarDevolucion({ devolucion: leida.devolucion, plata, lista: armada.a_favor, pagos, conf, marca: o.marca, cliente_id: armada.venta.cliente_id })
        if (!dev.ok) return dev
      }
    }
    const sinSaldo = await chequearUsoDeSaldo(db, armada)
    if (sinSaldo) return sinSaldo
    const sinCuenta = await chequearCuenta(db, armada, e)
    if (sinCuenta) return sinCuenta
    const avisos = []
    await ponerCosto(db, armada.lineas, avisos)
    await avisarStock(db, armada.venta, armada.lineas, avisos)
    const sinStock = frenarSinStock(armada, avisos, e)
    if (sinStock) return sinStock
    const venta = await escribir(db, armada)
    const usuario = venta.usuario
    if (armada.a_favor > 0 && !enPlata) await insertar(db, 'saldo_favor_movimiento', [movSaldo(venta, armada.a_favor, 'cambio', usuario)])
    if (dev) await insertarDevolucion(db, venta, dev.filas, { usuario, autoriza, en: venta.ocurrida_en })
    if (armada.usa_saldo > 0) await insertar(db, 'saldo_favor_movimiento', [movSaldo(venta, -armada.usa_saldo, 'uso', usuario)])
    const enCuenta = await anotarCompra(db, venta, armada.usa_cuenta)
    return {
      ...enCuenta,
      ok: true, venta: { id: venta.id, numero: venta.numero, tipo: 'cambio', diferencia: armada.diferencia, total: venta.total },
      movimientos: armada.movimientos.length, a_favor: enPlata ? 0 : armada.a_favor, avisos, devolucion: resumenDevolucion(dev),
      saldo: venta.cliente_id ? await saldoDe(db, venta.cliente_id, venta.marca, venta.prueba) : null,
      nc_pendiente: await tieneFactura(db, original.venta.id),
    }
  })
}

/** §1 anularVenta. @param {import('pg').ClientBase} db @param {{ venta_id: string, motivo: string, usuario: string, devolucion?: any[] }} e */
export async function anularVenta(db, e) {
  return enTransaccion(db, () => anularDentro(db, e))
}

/** ¿La base tiene la 028 (devolución, vuelta de la prenda)? Sin ella se anula como antes: todo vuelve al instante. */
async function hayDevolucion(db) {
  const [r] = await q(db, `select to_regclass('venta_devolucion') is not null as hay`)
  return r.hay
}

/** Los pagos de una venta con el medio de su cuenta de cobro (`cuenta_medio`: saldo y cuenta ⛔ son plata). */
async function pagosDe(db, ventaId) {
  const filas = await q(db, `select p.*, c.medio as cuenta_medio from venta_pago p join cuenta_cobro c on c.id = p.cuenta_cobro_id where p.venta_id = $1 order by p.monto desc, p.id`, [ventaId])
  return filas.map((p) => ({ cuenta_cobro_id: p.cuenta_cobro_id, medio: p.medio ?? null, cuenta_real_id: p.cuenta_real_id ?? null, cuenta_medio: p.cuenta_medio, monto: Number(p.monto) }))
}

/** 37a: el estado del pedido de TN de la venta (sql/015), o null si no es de TN o la base ⛔ lo tiene. */
async function estadoDelPedido(db, venta) {
  if (venta.origen !== 'tn') return null
  const [{ hay }] = await q(db, `select exists (select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'tn_orden' and column_name = 'estado') as hay`)
  if (!hay) return null
  const [tienda, tnId] = String(venta.origen_ref).split(':')
  if (!/^\d+$/.test(tnId ?? '')) return null
  const [o] = await q(db, 'select estado from tn_orden where tienda = $1 and tn_id = $2', [tienda, tnId])
  return o?.estado ?? null
}

async function insertarDevolucion(db, venta, filas, { usuario, autoriza, en }) {
  await insertar(db, 'venta_devolucion', filas.map((f) => ({
    ...f, id: randomUUID(), empresa_id: venta.empresa_id, marca: venta.marca, venta_id: venta.id, autoriza, prueba: venta.prueba, usuario, ocurrida_en: en, creado_en: new Date().toISOString(),
  })))
}

const resumenDevolucion = (dev) => (dev ? { forma: dev.forma, monto: dev.monto, pagos: dev.filas.map(({ cuenta_cobro_id, medio, monto }) => ({ cuenta_cobro_id, medio, monto })) } : null)

/** El cuerpo de `anularVenta`, dentro de una transacción que abrió otro. */
async function anularDentro(db, e) {
  const actual = await leerParaCambiar(db, e?.venta_id)
  const leida = leerDevolucion(e?.devolucion)
  if (leida.ok === false) return leida
  // Con el libro mandando en la marca (la llave del corte), GN ya ⛔ devuelve la prenda: la anulación de una venta suya suma acá.
  const armada = armarAnulacion(actual, { ...(e ?? {}), devolucion: leida.devolucion }, { corte: !!actual && mandaEn(actual.venta.marca) })
  if (!armada.ok) return armada
  const v = actual.venta
  const con028 = await hayDevolucion(db)
  if (leida.devolucion && !con028) return falla('ENTRADA_INVALIDA', 'Esta base todavía no registra devoluciones (falta sql/028)', 'devolucion')
  if (con028) {
    const [d] = await q(db, `select exists (select 1 from venta_devolucion where venta_id = $1) as hay`, [v.id])
    if (d.hay) return falla('TIENE_DEVOLUCION', `La venta ${v.numero} ya devolvió plata o saldo: no se anula`)
  }
  // §17: lo PAGADO en plata vuelve como eligió el local (plata o saldo a favor, a lista); con la llave, con PIN.
  const pagos = con028 ? await pagosDe(db, v.id) : []
  const plata = pagosDePlata(pagos).reduce((s, p) => s + p.monto, 0)
  let dev = null, autoriza = null, clienteSaldo = v.cliente_id
  if (leida.devolucion) {
    const a = autorizacion(v.marca, e.autoriza)
    if (a.ok === false) return a
    autoriza = a.autoriza
    if (leida.devolucion.forma === 'saldo' && !clienteSaldo) {
      const cli = await resolverCliente(db, v.empresa_id, e)
      if (cli.error) return cli.error
      clienteSaldo = cli.id
    }
    const lista = Number(v.total) > 0 ? (plata * Number(v.subtotal)) / Number(v.total) : 0
    dev = armarDevolucion({ devolucion: leida.devolucion, plata, lista, pagos, conf: await leerConf(db, v.marca), marca: v.marca, cliente_id: clienteSaldo })
    if (!dev.ok) return dev
  }
  // 37a: empaquetado ⇒ «a desarmar», ya salió ⇒ «a recibir»: el libro espera a `confirmarVuelta`.
  const vuelta = con028 ? vueltaDe(await estadoDelPedido(db, v)) : 'ya'
  if (con028) Object.assign(armada.anulacion, { vuelta, autoriza })
  // §6.2: lo que la venta movió del saldo se da vuelta. Si generó saldo y ya se usó, primero se anula la que lo usó.
  const netos = await q(db, `select cliente_id, sum(monto) as neto from saldo_favor_movimiento where venta_id = $1 group by 1`, [actual.venta.id])
  const vueltas = []
  for (const n of netos) {
    const neto = Number(n.neto)
    if (!neto) continue
    const v = { ...actual.venta, cliente_id: n.cliente_id }
    if (neto > 0 && !casi(await saldoDe(db, n.cliente_id, v.marca, v.prueba), neto)) {
      return falla('SALDO_USADO', `La venta ${actual.venta.numero} dejó ${neto} a favor y ya se usó: primero se anula la venta que lo usó`)
    }
    vueltas.push(movSaldo(v, -neto, 'anulacion', armada.anulacion.usuario))
  }
  await insertar(db, 'venta_anulacion', [armada.anulacion])
  await insertar(db, 'saldo_favor_movimiento', vueltas)
  // §15: lo que dejó a cuenta se da vuelta (si ya lo pagó, le queda a favor en la cuenta).
  await anularCompraDe(db, actual.venta, { usuario: armada.anulacion.usuario, motivo: armada.anulacion.motivo, en: armada.anulacion.anulada_en })
  await db.query(`update venta set estado = 'anulada' where id = $1`, [actual.venta.id])
  const movimientos = vuelta === 'ya' ? armada.movimientos : []
  await insertarMovimientos(db, movimientos)
  const quien = { usuario: armada.anulacion.usuario, autoriza, en: armada.anulacion.anulada_en }
  if (dev) await insertarDevolucion(db, v, dev.filas, quien)
  if (dev?.forma === 'saldo' && dev.monto > 0) await insertar(db, 'saldo_favor_movimiento', [movSaldo({ ...v, cliente_id: clienteSaldo }, dev.monto, 'devolucion', quien.usuario)])
  return {
    ok: true, venta: { id: v.id, numero: v.numero, estado: 'anulada' }, movimientos: movimientos.length, nc_pendiente: await tieneFactura(db, v.id),
    vuelta, a_devolver: pesos(plata), devolucion: resumenDevolucion(dev),
    ...(dev?.forma === 'saldo' ? { saldo: await saldoDe(db, clienteSaldo, v.marca, v.prueba) } : {}),
  }
}

/**
 * §17 La prenda de una anulación «a desarmar» o «a recibir» (37a) VOLVIÓ: alguien la escaneó o la recibió. Recién
 * ahí el libro la suma. Una sola vez (`YA_VOLVIO`); la que volvió al anular ⛔ espera nada (`NO_PENDIENTE`).
 * @param {import('pg').ClientBase} db @param {{ venta_id: string, usuario: string }} e
 */
export async function confirmarVuelta(db, e) {
  if (!(typeof e?.usuario === 'string' && e.usuario.trim())) return falla('ENTRADA_INVALIDA', 'Falta quién la recibió', 'usuario')
  if (!/^[0-9a-f-]{36}$/i.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  return enTransaccion(db, async () => {
    const actual = await leerParaCambiar(db, e.venta_id)
    if (!actual) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
    const [a] = await q(db, `select a.vuelta, w.venta_id is not null as volvio from venta_anulacion a
      left join venta_vuelta w on w.venta_id = a.venta_id where a.venta_id = $1 for update of a`, [e.venta_id])
    if (!a || a.vuelta === 'ya') return falla('NO_PENDIENTE', `La venta ${actual.venta.numero} no espera ninguna prenda`, 'venta_id')
    if (a.volvio) return falla('YA_VOLVIO', `Las prendas de la venta ${actual.venta.numero} ya volvieron`, 'venta_id')
    const en = new Date().toISOString()
    await insertar(db, 'venta_vuelta', [{ venta_id: e.venta_id, usuario: e.usuario.trim(), vuelta_en: en }])
    const movimientos = movimientosDeAnulacion(actual.venta, actual.lineas, en, { corte: mandaEn(actual.venta.marca) })
      .map((m) => ({ ...m, detalle: { ...m.detalle, venta_numero: actual.venta.numero, vuelta: a.vuelta } }))
    await insertarMovimientos(db, movimientos)
    return { ok: true, venta: { id: actual.venta.id, numero: actual.venta.numero }, vuelta: a.vuelta, movimientos: movimientos.length }
  })
}


/**
 * Reemplazar una venta por otra (el pedido mayorista que el equipo rehace, pedido de B 14-oct): anula la vieja
 * y registra la nueva en UNA transacción ⇒ ⛔ queda una sin la otra. La nueva lleva `detalle.reemplaza` = la vieja
 * y su propio `origen_ref` (reintentar con el mismo devuelve la misma, como `registrarVenta`).
 * Mismo origen, marca y `prueba` que la vieja. Los errores de anular (TIENE_CAMBIO, YA_ANULADA, SALDO_USADO, …)
 * y de registrar salen tal cual, y entonces ⛔ se anuló nada.
 * @param {import('pg').ClientBase} db @param {{ venta_id: string, motivo: string, usuario: string, nueva: any }} e
 */
export async function reemplazarVenta(db, e) {
  const nueva = e?.nueva
  const unidades = unidadesDe(nueva)
  return conReintentoIdempotente(db, nueva ?? {}, unidades, async () => {
    if (!nueva || typeof nueva !== 'object') return falla('ENTRADA_INVALIDA', 'Falta la venta nueva', 'nueva')
    const ya = nueva.origen && nueva.origen_ref ? await yaRegistrada(db, nueva.origen, String(nueva.origen_ref).trim()) : null
    if (ya) return (await mismaVenta(db, ya, nueva.marca, nueva.total, unidades)) ? respuestaYaExistia(ya) : conflicto(nueva)
    const [vieja] = await q(db, 'select id, origen, marca, prueba from venta where id = $1', [e.venta_id])
    if (!vieja) return falla('NO_ENCONTRADA', 'No está la venta que se reemplaza', 'venta_id')
    if (nueva.origen !== vieja.origen || nueva.marca !== vieja.marca) return falla('ENTRADA_INVALIDA', 'El reemplazo es del mismo origen y la misma marca', 'nueva')
    if (nueva.prueba !== vieja.prueba) return falla('ENTRADA_INVALIDA', 'Una venta de prueba se reemplaza con otra de prueba (y al revés)', 'nueva.prueba')
    const anulada = await anularDentro(db, { venta_id: vieja.id, motivo: e.motivo, usuario: e.usuario, sigue_gn: e.sigue_gn })
    if (!anulada.ok) return anulada
    const r = await registrarDentro(db, { ...nueva, detalle: { ...(nueva.detalle ?? {}), reemplaza: vieja.id } }, unidades)
    if (!r.ok) return r
    return { ...r, anulada: anulada.venta, movimientos: r.movimientos + anulada.movimientos }
  })
}

const TIPOS_FACTURA = ['factura', 'nc', 'nd']

/**
 * Atar una factura de ARCA a la venta (paso 6, pedido de B 14-oct): `venta_factura`, N:M — una venta en varias
 * facturas (NC parciales) y una factura de varias ventas. El monitor emite (ARCA, `facturas`) y LUEGO llama esto
 * con el id de su fila de `facturas`; el motor ⛔ habla con ARCA ni sabe del ambiente ⇒ 🔴 que una venta de PRUEBA
 * ⛔ se facture en producción lo frena el que emite (`puedeFacturar` del monitor).
 * - `factura`: la venta tiene que estar confirmada (`YA_ANULADA`).
 * - `nc` / `nd`: la venta tiene que tener una factura antes (`SIN_FACTURA`); la venta puede estar anulada (es la NC del anular).
 * - Repetir lo mismo devuelve lo mismo (`ya_existia`); la misma factura con OTRO tipo ⇒ `CONFLICTO_TIPO`.
 * @param {import('pg').ClientBase} db @param {{ venta_id: string, factura_id: string|number, tipo: 'factura'|'nc'|'nd' }} e
 */
export async function vincularFactura(db, e) {
  const facturaId = e?.factura_id == null ? '' : String(e.factura_id).trim()
  if (!facturaId) return falla('ENTRADA_INVALIDA', 'Falta la factura', 'factura_id')
  if (!TIPOS_FACTURA.includes(e?.tipo)) return falla('ENTRADA_INVALIDA', `El tipo es ${TIPOS_FACTURA.join(', ')}`, 'tipo')
  if (!/^[0-9a-f-]{36}$/i.test(String(e?.venta_id ?? ''))) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
  return enTransaccion(db, async () => {
    const [venta] = await q(db, 'select id, numero, estado from venta where id = $1 for update', [e.venta_id])
    if (!venta) return falla('NO_ENCONTRADA', 'No está esa venta', 'venta_id')
    const otra = await q(db, 'select venta_id, tipo from venta_factura where factura_id = $1 and tipo <> $2 limit 1', [facturaId, e.tipo])
    if (otra.length) return falla('CONFLICTO_TIPO', `La factura ${facturaId} ya está atada como ${otra[0].tipo}`, 'tipo')
    const atadas = await q(db, 'select factura_id, tipo, creada_en from venta_factura where venta_id = $1 order by creada_en', [venta.id])
    const respuesta = (ya, facturas) => ({ ok: true, venta: { id: venta.id, numero: Number(venta.numero), estado: venta.estado }, vinculo: { venta_id: venta.id, factura_id: facturaId, tipo: e.tipo }, ya_existia: ya, facturas })
    if (atadas.some((f) => f.factura_id === facturaId)) return respuesta(true, atadas)
    if (e.tipo === 'factura' && venta.estado !== 'confirmada') return falla('YA_ANULADA', `La venta ${venta.numero} está anulada: no se factura`, 'venta_id')
    if (e.tipo !== 'factura' && !atadas.some((f) => f.tipo === 'factura')) return falla('SIN_FACTURA', `La venta ${venta.numero} no tiene factura: una ${e.tipo} va contra una factura`, 'tipo')
    const [nueva] = await q(db, 'insert into venta_factura (venta_id, factura_id, tipo) values ($1, $2, $3) returning factura_id, tipo, creada_en', [venta.id, facturaId, e.tipo])
    return respuesta(false, [...atadas, nueva])
  })
}

// La ficha de la clienta (§11) viaja por la misma puerta: `import { guardarCliente } from 'areben-motor/venta'`.
export { buscarClientes, guardarCliente } from './cliente.mjs'
