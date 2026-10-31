/**
 * El PEDIDO MAYORISTA dentro del ERP (plan «BDI directo al ERP», paso 3; pedido de Darío §2-§3; sql/064).
 *
 * 🔑 Bruno (30-oct): el pedido mayorista funciona como un pedido de TN — entra y RESERVA stock. En el motor eso es una
 * VENTA `origen 'mayorista'`, `origen_ref 'pedido:<clave>'` (⛔ choca con `gn:<id>` de la copia de GN) con TODO A CUENTA
 * («Cuenta corriente», `autoriza: { motivo: 'pedido' }`): la venta mueve el libro (la reserva) y lo que debe vive en la
 * cuenta corriente del cliente, donde los pagos se IMPUTAN al pedido (`registrarPagoACuenta`). Así el estado del pago
 * sale de lo que ya existe: Pagado / Pagó una parte (falta $X) / Sin pagar = lo pendiente de esa compra.
 * 🔄 (Bruno 30-oct, pedido de Darío §3) «Mandar a preparar» lo decide Darío A MANO, esté pago o no; el FRENO va en el
 * DESPACHO: sin pagar + cliente sin cuenta corriente ⇒ Logística lo manda a «Pendiente de pago» (`zonaDeDespacho`).
 * Se cambia hasta que el depósito empieza a escanear (`preparacion_en`, lo pone Logística): cambiar = `reemplazarVenta`.
 * El que se cae ⇒ `anularVenta` (suelta la reserva; lo que ya pagó queda a favor en su cuenta).
 * ❓ (plan 1b) la reserva del mayorista ⛔ vence sola (la de TN, 15 días): se suelta A MANO, anulando.
 *
 * Interruptor `VENTA_MAYORISTA_REAL` (lista de marcas): apagado ⇒ la venta es de PRUEBA (⛔ mueve el libro). Mientras GN
 * viva, el monitor ⛔ llama nada de esto (409): la venta mayorista la sigue registrando la copia de GN (`bin/mayorista.mjs`).
 *
 * Las funciones con `db` reciben un cliente pg CONECTADO y sin transacción (como `registrarVenta`, que abre la suya).
 * Devuelven `{ ok: true, … }` o `{ ok: false, error }`.
 */
import { MARCAS_LLAVE, anularVenta, reemplazarVenta, registrarVenta } from '../venta/registrar.mjs'
import { redondear } from '../venta/redondeo.mjs'
import { redondeoDe } from '../venta/redondeo-db.mjs'
import { pendienteDeVentas } from '../cuenta/cuenta.mjs'
import { creditoDe } from '../cuenta/libro.mjs'

const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const pesos = (x) => Math.round(Number(x) * 100) / 100
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const texto = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Medido 15-oct (GN, 60 d): la mayorista sale del Depósito Minorista (216/217). El pedido trae el suyo si el catálogo lo mandó. */
export const DEPOSITO_MAYORISTA = { bdi: 'deposito_minorista' }

/** 🔑 La llave «el pedido mayorista del ERP es venta REAL»: `VENTA_MAYORISTA_REAL=bdi`. Se prende el día del corte. Un typo FALLA. */
export function ventaMayoristaRealEn(marca, env = process.env) {
  const lista = String(env.VENTA_MAYORISTA_REAL ?? '').split(',').map((m) => m.trim().toLowerCase()).filter(Boolean)
  for (const m of lista) if (!MARCAS_LLAVE.includes(m)) throw new Error(`VENTA_MAYORISTA_REAL: marca desconocida «${m}»`)
  return lista.includes(marca)
}

/** `pedido:<clave>` (o `pedido:<id>` si entró sin clave, el de antes de la 033); la versión `n` > 1 de un pedido cambiado lleva `:<n>`. */
export function origenRefPedido(p, n = 1) {
  const base = `pedido:${p.clave ?? p.id}`
  return n > 1 ? `${base}:${n}` : base
}

/**
 * El estado del pago del pedido (Darío §3), de lo que su compra DEBE en la cuenta corriente.
 * @param {{ total: number, pendiente: number }} p
 * @returns {{ estado: 'pagado'|'parcial'|'sin_pagar', falta: number, pagado: number }}
 */
export function estadoDePago({ total, pendiente }) {
  const t = pesos(total), falta = Math.max(0, pesos(pendiente))
  const pagado = pesos(t - falta)
  if (falta < 0.5) return { estado: 'pagado', falta: 0, pagado: t }
  if (pagado < 0.5) return { estado: 'sin_pagar', falta, pagado: 0 }
  return { estado: 'parcial', falta, pagado }
}

/**
 * A qué zona lo manda Logística al terminar de armarlo (Darío §3): sin pagar del todo y SIN cuenta corriente ⇒
 * «Pendiente de pago»; el resto ⇒ «Despacho». Son los dos datos que el ERP le pasa a Logística (con Ger).
 * @param {{ pago: { estado: string }, cuentaHabilitada: boolean }} p @returns {'despacho'|'pendiente_pago'}
 */
export function zonaDeDespacho({ pago, cuentaHabilitada }) {
  return pago.estado === 'pagado' || cuentaHabilitada ? 'despacho' : 'pendiente_pago'
}

const claveVar = (l) => `${Number(l.product_id)}:${Number(l.size_id)}`

/**
 * Los renglones CAMBIADOS (Darío §2: cambiar cantidades, sacar y agregar). Puro.
 * El precio: el que ya tenía ese renglón en el pedido (lo que se le prometió); el AGREGADO, el de la lista `mayorista`
 * vigente (`precios`: Map product_id → precio). Cantidad 0 = se saca. Sin renglones ⇒ ⛔ (eso es anular).
 * @param {Array<{product_id, size_id, cantidad, precio}>} actuales  @param {Array<{product_id, size_id, cantidad}>} pedidas
 * @param {Map<number, number>} precios
 */
export function lineasCambiadas(actuales, pedidas, precios) {
  if (!Array.isArray(pedidas)) return falla('ENTRADA_INVALIDA', 'Faltan los renglones', 'lineas')
  const previo = new Map(actuales.map((l) => [claveVar(l), pesos(l.precio)]))
  const vistas = new Set()
  const lineas = []
  for (const [i, l] of pedidas.entries()) {
    const product_id = Number(l?.product_id), size_id = Number(l?.size_id), cantidad = Number(l?.cantidad)
    if (!Number.isSafeInteger(product_id) || product_id <= 0 || !Number.isSafeInteger(size_id) || size_id <= 0) return falla('ENTRADA_INVALIDA', 'Un renglón sin producto o sin talle', `lineas[${i}]`)
    if (!Number.isInteger(cantidad) || cantidad < 0) return falla('ENTRADA_INVALIDA', 'La cantidad es un número entero', `lineas[${i}].cantidad`)
    const k = claveVar({ product_id, size_id })
    if (vistas.has(k)) return falla('ENTRADA_INVALIDA', 'Un talle aparece dos veces', `lineas[${i}]`)
    vistas.add(k)
    if (cantidad === 0) continue
    const precio = previo.get(k) ?? (precios.has(product_id) ? pesos(precios.get(product_id)) : null)
    if (precio == null) return falla('SIN_PRECIO', `El producto ${product_id} no tiene precio mayorista cargado`, `lineas[${i}]`)
    lineas.push({ product_id, size_id, cantidad, precio })
  }
  if (!lineas.length) return falla('SIN_RENGLONES', 'El pedido quedaría vacío: para eso se anula', 'lineas')
  return { ok: true, lineas }
}

/** Los mismos renglones (producto, talle, cantidad y precio), sin importar el orden. */
export const mismasLineas = (a, b) => {
  const f = (ls) => ls.map((l) => `${claveVar(l)}:${Number(l.cantidad)}:${pesos(l.precio).toFixed(2)}`).sort().join('|')
  return f(a) === f(b)
}

/**
 * La venta del pedido para `registrarVenta` / `reemplazarVenta`. Puro.
 * @param {{ pedido: object, lineas: any[], total: number, cliente_id: string, cuenta: string, usuario: string, real: boolean, n?: number }} p
 */
export function ventaDePedido({ pedido, lineas, total, cliente_id, cuenta, usuario, real, n = 1 }) {
  const ls = lineas.map((l) => ({ product_id: Number(l.product_id), size_id: Number(l.size_id), cantidad: Number(l.cantidad), precio: pesos(l.precio),
    descuento: 0, rebaja: 0, importe: pesos(Number(l.precio) * Number(l.cantidad)) }))
  const subtotal = pesos(ls.reduce((s, l) => s + l.importe, 0))
  const t = pesos(total)
  return {
    origen: 'mayorista', origen_ref: origenRefPedido(pedido, n), marca: pedido.marca, canal: 'mayorista',
    deposito: pedido.deposito ?? DEPOSITO_MAYORISTA[pedido.marca], usuario, prueba: !real,
    ocurrida_en: new Date(pedido.recibido_en).toISOString(), cliente_id, lineas: ls, subtotal, total: t,
    pagos: [{ cuenta, monto: t }], autoriza: { motivo: 'pedido', usuario },
    detalle: { pedido_mayorista: pedido.id, pedido_numero: Number(pedido.numero), ajuste: pesos(t - subtotal) },
  }
}

// ── Contra la base ───────────────────────────────────────────────────────────────────────────────

async function leerPedido(db, id, { bloquear = false } = {}) {
  if (!UUID.test(String(id ?? ''))) return null
  const [p] = await q(db, `select * from pedido_mayorista where id = $1${bloquear ? ' for update' : ''}`, [id])
  return p ? { ...p, lineas: p.lineas ?? [], numero: Number(p.numero), total: Number(p.total) } : null
}

async function cuentaCorrienteDe(db, marca) {
  const [c] = await q(db, `select id::text from cuenta_cobro where marca = $1 and medio = 'cuenta' and activa`, [marca])
  return c?.id ?? null
}

/** En una transacción: `fn` devuelve el resultado. */
async function enTransaccion(db, fn) {
  await db.query('begin')
  try {
    const r = await fn()
    await db.query('commit')
    return r
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

const cambio = (db, p, motivo, usuario, antes, despues = null) => q(db,
  `insert into pedido_mayorista_cambio (empresa_id, pedido_id, motivo, antes, despues, usuario) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
  [p.empresa_id, p.id, motivo, JSON.stringify(antes), despues == null ? null : JSON.stringify(despues), usuario])

const foto = (p) => ({ total: Number(p.total), unidades: Number(p.unidades), lineas: p.lineas })

/**
 * El pedido ENTRA al ERP: su venta (reserva, todo a cuenta) con el cliente —la empresa— y QUIÉN lo pidió. Idempotente: el
 * pedido que ya tiene venta devuelve esa (`ya`).
 * @param {import('pg').ClientBase} db
 * @param {{ pedido_id: string, cliente_id: string, persona_id?: string|null, usuario: string }} e  @param {{ env?: object }} [op]
 */
export async function entrarPedidoMayorista(db, e, { env = process.env } = {}) {
  const usuario = texto(e?.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo hace', 'usuario')
  const p = await leerPedido(db, e?.pedido_id)
  if (!p) return falla('NO_ENCONTRADO', 'No está ese pedido', 'pedido_id')
  if (p.venta_id) return { ok: true, ya: true, pedido: { id: p.id, numero: p.numero }, venta_id: p.venta_id }
  if (p.anulado_en) return falla('ANULADO', `El pedido ${p.numero} está anulado`)
  if (!UUID.test(String(e.cliente_id ?? ''))) return falla('FALTA_CLIENTE', 'Falta el cliente', 'cliente_id')
  const [cli] = await q(db, 'select id::text from cliente where id = $1 and empresa_id = $2', [e.cliente_id, p.empresa_id])
  if (!cli) return falla('FALTA_CLIENTE', 'No está ese cliente', 'cliente_id')
  if (e.persona_id != null) {
    const [w] = UUID.test(String(e.persona_id)) ? await q(db, 'select cliente_id::text from cliente_whatsapp where id = $1', [e.persona_id]) : []
    if (!w || w.cliente_id !== cli.id) return falla('ENTRADA_INVALIDA', 'Esa persona no es de ese cliente', 'persona_id')
  }
  if (p.lineas.some((l) => l.size_id == null)) return falla('SIN_TALLE', `El pedido ${p.numero} tiene un renglón sin talle: hay que cambiarlo antes`, 'lineas')
  const cuenta = await cuentaCorrienteDe(db, p.marca)
  if (!cuenta) return falla('SIN_CUENTA_CORRIENTE', `${p.marca} no tiene la cuenta «Cuenta corriente» (sql/025)`)
  const nueva = ventaDePedido({ pedido: p, lineas: p.lineas, total: p.total, cliente_id: cli.id, cuenta, usuario, real: ventaMayoristaRealEn(p.marca, env) })
  const r = await registrarVenta(db, nueva)
  if (!r.ok) return r
  // La venta ya quedó (idempotente por `origen_ref`): si esto falla, repetir la toma igual.
  const quedo = await enTransaccion(db, async () => {
    const [u] = await q(db, `update pedido_mayorista set venta_id = $2, cliente_id = $3, persona_id = $4 where id = $1 and venta_id is null returning id`,
      [p.id, r.venta.id, cli.id, e.persona_id ?? null])
    return !!u
  })
  return { ok: true, ya: !quedo, pedido: { id: p.id, numero: p.numero }, venta_id: r.venta.id, venta: r.venta, avisos: r.avisos ?? [] }
}

/** El precio de la lista `mayorista` vigente de cada producto. */
async function preciosMayoristas(db, marca, ids) {
  if (!ids.length) return new Map()
  const filas = await q(db, `select product_id, precio from precio_lista where marca = $1 and lista = 'mayorista' and product_id = any($2::bigint[]) and precio is not null`, [marca, ids])
  return new Map(filas.map((f) => [Number(f.product_id), Number(f.precio)]))
}

/**
 * CAMBIAR el pedido (Darío §2): cantidades, sacar y agregar. El total se recalcula (redondeo del canal mayorista) y el stock
 * se acomoda solo (`reemplazarVenta`: la venta vieja vuelve, la nueva sale). Queda quién cambió qué. ⛔ se toca si el depósito
 * ya empezó a escanear. Si ya estaba «a preparar», devuelve `avisar_deposito` (el aviso lo da Logística).
 * Repetir el mismo cambio ⇒ `sin_cambios`.
 * @param {import('pg').ClientBase} db  @param {{ pedido_id: string, lineas: Array<{product_id, size_id, cantidad}>, usuario: string }} e
 */
export async function cambiarPedidoMayorista(db, e, { env = process.env } = {}) {
  const usuario = texto(e?.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo cambia', 'usuario')
  const p = await leerPedido(db, e?.pedido_id)
  if (!p) return falla('NO_ENCONTRADO', 'No está ese pedido', 'pedido_id')
  if (p.anulado_en) return falla('ANULADO', `El pedido ${p.numero} está anulado`)
  if (!p.venta_id) return falla('SIN_ENTRAR', `El pedido ${p.numero} todavía no entró al ERP`)
  if (p.preparacion_en) return falla('EN_PREPARACION', `El depósito ya empezó a armar el pedido ${p.numero}: no se cambia`)
  const pedidasIds = [...new Set((Array.isArray(e.lineas) ? e.lineas : []).map((l) => Number(l?.product_id)).filter((x) => Number.isSafeInteger(x) && x > 0))]
  const c = lineasCambiadas(p.lineas, e.lineas, await preciosMayoristas(db, p.marca, pedidasIds))
  if (!c.ok) return c
  if (mismasLineas(c.lineas, p.lineas)) return { ok: true, sin_cambios: true, pedido: { id: p.id, numero: p.numero }, venta_id: p.venta_id }
  const totalCatalogo = pesos(c.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0))
  const total = redondear(totalCatalogo, await redondeoDe(db, { marca: p.marca, canal: 'mayorista' }))
  const unidades = c.lineas.reduce((s, l) => s + l.cantidad, 0)
  const [{ n }] = await q(db, `select count(*)::int as n from venta where origen = 'mayorista' and (origen_ref = $1 or origen_ref like $2)`, [origenRefPedido(p), `${origenRefPedido(p)}:%`])
  const [vieja] = await q(db, 'select cliente_id::text, prueba from venta where id = $1', [p.venta_id])
  const cuenta = await cuentaCorrienteDe(db, p.marca)
  if (!cuenta) return falla('SIN_CUENTA_CORRIENTE', `${p.marca} no tiene la cuenta «Cuenta corriente» (sql/025)`)
  const real = ventaMayoristaRealEn(p.marca, env)
  if (real === vieja.prueba) return falla('CAMBIO_DE_LLAVE', `El pedido ${p.numero} entró ${vieja.prueba ? 'de prueba' : 'real'} y la llave cambió: se anula y se vuelve a entrar`)
  const nueva = ventaDePedido({ pedido: p, lineas: c.lineas, total, cliente_id: vieja.cliente_id, cuenta, usuario, real, n: n + 1 })
  const r = await reemplazarVenta(db, { venta_id: p.venta_id, motivo: `Pedido ${p.numero}: cambiado por ${usuario}`, usuario, nueva })
  if (!r.ok) return r
  const despues = { total, unidades, lineas: c.lineas }
  await enTransaccion(db, async () => {
    await q(db, `update pedido_mayorista set lineas = $2::jsonb, total = $3, unidades = $4, total_catalogo = $5, venta_id = $6, editado_en = now() where id = $1`,
      [p.id, JSON.stringify(c.lineas), total, unidades, totalCatalogo, r.venta.id])
    await cambio(db, p, 'cambio', usuario, foto(p), despues)
  })
  return { ok: true, sin_cambios: false, pedido: { id: p.id, numero: p.numero, total, unidades }, venta_id: r.venta.id, avisar_deposito: !!p.a_preparar_en, avisos: r.avisos ?? [] }
}

/**
 * «Mandar a preparar» (Darío §3): lo decide Darío A MANO, esté pago o no. Idempotente (`ya`).
 * @param {import('pg').ClientBase} db @param {{ pedido_id: string, usuario: string }} e
 */
export async function mandarAPreparar(db, e) {
  const usuario = texto(e?.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo manda', 'usuario')
  return enTransaccion(db, async () => {
    const p = await leerPedido(db, e?.pedido_id, { bloquear: true })
    if (!p) return falla('NO_ENCONTRADO', 'No está ese pedido', 'pedido_id')
    if (p.anulado_en) return falla('ANULADO', `El pedido ${p.numero} está anulado`)
    if (!p.venta_id) return falla('SIN_ENTRAR', `El pedido ${p.numero} todavía no entró al ERP`)
    if (p.a_preparar_en) return { ok: true, ya: true, pedido: { id: p.id, numero: p.numero }, a_preparar_en: p.a_preparar_en }
    const [u] = await q(db, `update pedido_mayorista set a_preparar_en = now(), a_preparar_por = $2 where id = $1 returning a_preparar_en`, [p.id, usuario])
    await cambio(db, p, 'a_preparar', usuario, foto(p))
    return { ok: true, ya: false, pedido: { id: p.id, numero: p.numero }, a_preparar_en: u.a_preparar_en }
  })
}

/**
 * El pedido SE CAE: se anula su venta (vuelve el stock; lo que ya pagó le queda a favor en su cuenta) y el pedido queda
 * anulado, con quién y por qué. ⛔ si el depósito ya empezó a armarlo. Idempotente (`ya`).
 * @param {import('pg').ClientBase} db @param {{ pedido_id: string, motivo: string, usuario: string }} e
 */
export async function anularPedidoDelErp(db, e) {
  const usuario = texto(e?.usuario), motivo = texto(e?.motivo)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo anula', 'usuario')
  if (!motivo) return falla('FALTA_MOTIVO', 'Falta el motivo', 'motivo')
  const p = await leerPedido(db, e?.pedido_id)
  if (!p) return falla('NO_ENCONTRADO', 'No está ese pedido', 'pedido_id')
  if (p.anulado_en) return { ok: true, ya: true, pedido: { id: p.id, numero: p.numero } }
  if (p.preparacion_en) return falla('EN_PREPARACION', `El depósito ya empezó a armar el pedido ${p.numero}: no se anula desde acá`)
  if (p.venta_id) {
    const [v] = await q(db, 'select estado from venta where id = $1', [p.venta_id])
    if (v?.estado !== 'anulada') {
      const r = await anularVenta(db, { venta_id: p.venta_id, motivo: `Pedido ${p.numero}: ${motivo}`, usuario })
      if (!r.ok) return r
    }
  }
  await enTransaccion(db, async () => {
    const [u] = await q(db, 'update pedido_mayorista set anulado_en = now() where id = $1 and anulado_en is null returning id', [p.id])
    if (u) await cambio(db, p, 'anulado', usuario, foto(p), { motivo })
  })
  return { ok: true, ya: false, pedido: { id: p.id, numero: p.numero } }
}

/** Lo que hay en el libro de un depósito, por variante. */
async function nivelesDe(db, deposito, lineas) {
  if (!lineas.length || !deposito) return new Map()
  const filas = await q(db, `select product_id, size_id, coalesce(sum(cantidad), 0)::int as nivel from stock_movimiento
    where deposito = $1 and (product_id, size_id) in (select * from unnest($2::bigint[], $3::bigint[])) group by 1, 2`,
  [deposito, lineas.map((l) => Number(l.product_id)), lineas.map((l) => Number(l.size_id))])
  return new Map(filas.map((f) => [claveVar(f), f.nivel]))
}

/** El estado del pago y la cuenta habilitada de varios pedidos con venta. */
async function pagosDe(db, pedidos) {
  const conVenta = pedidos.filter((p) => p.venta_id)
  if (!conVenta.length) return new Map()
  const { pendientes } = await pendienteDeVentas(db, { venta_ids: conVenta.map((p) => p.venta_id) })
  const creditos = new Map()
  const out = new Map()
  for (const p of conVenta) {
    if (!creditos.has(p.cliente_id)) creditos.set(p.cliente_id, (await creditoDe(db, p.cliente_id))?.credito === true)
    const pago = estadoDePago({ total: p.total, pendiente: pendientes[p.venta_id] ?? 0 })
    const cuentaHabilitada = creditos.get(p.cliente_id)
    out.set(p.id, { pago, cuenta_habilitada: cuentaHabilitada, zona: zonaDeDespacho({ pago, cuentaHabilitada }) })
  }
  return out
}

/** El estado que se ve del pedido. */
export function etapaDe(p) {
  if (p.anulado_en) return 'anulado'
  if (p.despachado_en) return 'despachado'
  if (p.preparado_en) return 'preparado'
  if (p.preparacion_en) return 'en_preparacion'
  if (p.a_preparar_en) return 'a_preparar'
  return p.venta_id ? 'pedido' : 'sin_entrar'
}

/**
 * La FICHA del pedido para el panel (Darío §2-§3): renglones con el STOCK REAL al lado (el libro del depósito; la reserva
 * del propio pedido ya está descontada), quién lo pidió, el estado del pago, la zona de despacho y quién cambió qué.
 * @param {import('pg').ClientBase} db @param {{ pedido_id: string }} e
 */
export async function fichaDePedidoMayorista(db, e) {
  const p = await leerPedido(db, e?.pedido_id)
  if (!p) return falla('NO_ENCONTRADO', 'No está ese pedido', 'pedido_id')
  const deposito = p.deposito ?? DEPOSITO_MAYORISTA[p.marca]
  const niveles = await nivelesDe(db, deposito, p.lineas.filter((l) => l.size_id != null))
  const [persona] = p.persona_id ? await q(db, 'select id::text, nombre, whatsapp, activo from cliente_whatsapp where id = $1', [p.persona_id]) : []
  const cambios = await q(db, `select motivo, antes, despues, usuario, cuando from pedido_mayorista_cambio where pedido_id = $1 order by cuando desc, id desc`, [p.id])
  const pago = (await pagosDe(db, [p])).get(p.id) ?? null
  return {
    ok: true,
    pedido: {
      id: p.id, numero: p.numero, marca: p.marca, origen: p.origen, recibido_en: p.recibido_en, etapa: etapaDe(p), editable: !p.anulado_en && !p.preparacion_en,
      total: p.total, unidades: Number(p.unidades), deposito, cliente_id: p.cliente_id, venta_id: p.venta_id, contacto: p.contacto ?? null,
      persona: persona ?? null, a_preparar_en: p.a_preparar_en, a_preparar_por: p.a_preparar_por,
      preparacion_en: p.preparacion_en, preparado_en: p.preparado_en, despachado_en: p.despachado_en, anulado_en: p.anulado_en,
      ...(pago ?? {}),
    },
    lineas: p.lineas.map((l) => ({ ...l, stock: l.size_id == null ? null : niveles.get(claveVar(l)) ?? 0 })),
    cambios,
  }
}

/**
 * Los pedidos de un cliente (la ficha del panel), el más nuevo primero, con su etapa y su pago.
 * @param {import('pg').ClientBase} db @param {{ cliente_id: string, limite?: number }} e
 */
export async function pedidosMayoristasDe(db, e) {
  if (!UUID.test(String(e?.cliente_id ?? ''))) return falla('FALTA_CLIENTE', 'Falta el cliente', 'cliente_id')
  const limite = Math.min(Math.max(Number(e.limite) || 30, 1), 200)
  const filas = (await q(db, `select p.*, w.nombre as persona from pedido_mayorista p left join cliente_whatsapp w on w.id = p.persona_id
    where p.cliente_id = $1 order by p.recibido_en desc limit $2`, [e.cliente_id, limite])).map((p) => ({ ...p, numero: Number(p.numero), total: Number(p.total) }))
  const pagos = await pagosDe(db, filas)
  return {
    ok: true,
    pedidos: filas.map((p) => ({ id: p.id, numero: p.numero, recibido_en: p.recibido_en, etapa: etapaDe(p), total: p.total, unidades: Number(p.unidades),
      persona: p.persona ?? null, venta_id: p.venta_id, ...(pagos.get(p.id) ?? {}) })),
  }
}

/**
 * «Preparados sin pagar» (Hoy del panel, Darío §3): los pedidos LISTOS (Logística puso `preparado_en`), sin despachar, de
 * clientes SIN cuenta corriente, que deben algo — con cuánto deben y hace cuánto están listos. El más viejo primero.
 * @param {import('pg').ClientBase} db @param {{ empresa_id: string, marca: string }} e
 */
export async function preparadosSinPagar(db, e) {
  const filas = (await q(db, `select p.*, c.nombre as cliente from pedido_mayorista p join cliente c on c.id = p.cliente_id
    where p.empresa_id = $1 and p.marca = $2 and p.preparado_en is not null and p.despachado_en is null and p.anulado_en is null and p.venta_id is not null
    order by p.preparado_en`, [e.empresa_id, e.marca])).map((p) => ({ ...p, numero: Number(p.numero), total: Number(p.total) }))
  const pagos = await pagosDe(db, filas)
  return {
    ok: true,
    pedidos: filas.filter((p) => pagos.get(p.id)?.zona === 'pendiente_pago').map((p) => ({
      id: p.id, numero: p.numero, cliente_id: p.cliente_id, cliente: p.cliente, preparado_en: p.preparado_en, total: p.total, debe: pagos.get(p.id).pago.falta,
    })),
  }
}

/** Las palabras de una búsqueda, sin tildes ni comodines de `ilike` (⛔ más de 5). */
export function palabrasDeBusqueda(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[%_\\]/g, ' ')
    .split(/\s+/).filter((w) => w.length >= 2).slice(0, 5)
}
const SIN_TILDE = `translate(lower(%s), 'áéíóúüñ', 'aeiouun')`

/**
 * AGREGAR un producto al pedido (Darío §2): el catálogo de la MARCA del pedido por nombre o SKU (cada palabra tiene que
 * estar), o el código de barras exacto; cada variante con su talle, el STOCK del depósito del pedido y el precio de la
 * lista `mayorista` — el MISMO que va a tomar `cambiarPedidoMayorista` (`preciosMayoristas`). Sin precio cargado ⇒
 * `precio: null`: la pantalla lo muestra y ⛔ deja agregarlo (el cambio contestaría SIN_PRECIO).
 * @param {import('pg').ClientBase} db @param {{ pedido_id: string, q: string, limite?: number }} e
 */
export async function productosParaPedido(db, e) {
  const p = await leerPedido(db, e?.pedido_id)
  if (!p) return falla('NO_ENCONTRADO', 'No está ese pedido', 'pedido_id')
  const palabras = palabrasDeBusqueda(e?.q)
  const codigo = String(e?.q ?? '').trim()
  if (!palabras.length && !/^\d{6,}$/.test(codigo)) return { ok: true, productos: [] }
  const limite = Math.min(Math.max(Number(e.limite) || 12, 1), 40)
  const filas = await q(db, `with prod as (
      select distinct p.id from producto p join variante v on v.empresa_id = p.empresa_id and v.product_id = p.id
      where p.empresa_id = $1 and p.marca = $2 and p.activo and v.activa
        and (v.barcode = $4 or (cardinality($3::text[]) > 0 and (select bool_and(${SIN_TILDE.replace('%s', 'p.nombre')} like '%' || w || '%'
          or lower(coalesce(v.sku, '')) like '%' || w || '%') from unnest($3::text[]) w)))
      order by p.id desc limit $5)
    select p.id::text as product_id, p.nombre, v.size_id::text as size_id, v.talle, v.sku
    from prod join producto p on p.empresa_id = $1 and p.id = prod.id join variante v on v.empresa_id = $1 and v.product_id = p.id and v.activa
    order by p.nombre, p.id, v.size_id`, [p.empresa_id, p.marca, palabras, codigo, limite])
  const deposito = p.deposito ?? DEPOSITO_MAYORISTA[p.marca]
  const niveles = await nivelesDe(db, deposito, filas)
  const precios = await preciosMayoristas(db, p.marca, [...new Set(filas.map((f) => Number(f.product_id)))])
  const en = new Set(p.lineas.map(claveVar))
  const porProducto = new Map()
  for (const f of filas) {
    const id = Number(f.product_id)
    if (!porProducto.has(id)) porProducto.set(id, { product_id: id, nombre: f.nombre, precio: precios.has(id) ? pesos(precios.get(id)) : null, variantes: [] })
    porProducto.get(id).variantes.push({ size_id: Number(f.size_id), talle: f.talle, sku: f.sku, stock: niveles.get(claveVar(f)) ?? 0, en_pedido: en.has(claveVar(f)) })
  }
  return { ok: true, deposito, productos: [...porProducto.values()] }
}
