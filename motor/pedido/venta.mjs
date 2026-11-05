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
 * Interruptor: el corte de la marca o `VENTA_MAYORISTA_REAL` (`ventaMayoristaReal`, `lib/llave-corte.mjs`): apagado ⇒ PRUEBA (⛔ mueve el libro). Mientras GN
 * viva, el monitor ⛔ llama nada de esto (409): la venta mayorista la sigue registrando la copia de GN (`bin/mayorista.mjs`).
 *
 * Las funciones con `db` reciben un cliente pg CONECTADO y sin transacción (como `registrarVenta`, que abre la suya).
 * Devuelven `{ ok: true, … }` o `{ ok: false, error }`.
 */
import { anularVenta, reemplazarVenta, registrarVenta } from '../venta/registrar.mjs'
import { redondear } from '../venta/redondeo.mjs'
import { redondeoDe } from '../venta/redondeo-db.mjs'
import { pendienteDeVentas } from '../cuenta/cuenta.mjs'
import { creditoDe } from '../cuenta/libro.mjs'
import { leerCortes, ventaMayoristaReal } from '../llave-corte.mjs'
import { clientePorWhatsapp } from '../venta/cliente.mjs'

const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const pesos = (x) => Math.round(Number(x) * 100) / 100
const falla = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const texto = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Medido 15-oct (GN, 60 d): la mayorista sale del Depósito Minorista (216/217). El pedido trae el suyo si el catálogo lo mandó. */
export const DEPOSITO_MAYORISTA = { bdi: 'deposito_minorista' }

/** 🔑 La llave «el pedido mayorista del ERP es venta REAL»: el corte de la marca (`erp_corte`) o `VENTA_MAYORISTA_REAL` a mano
 * (`lib/llave-corte.mjs`, Bruno 1-nov). La variable sola se re-exporta por compatibilidad (tests y puertas viejas). */
export { ventaMayoristaRealEn } from '../llave-corte.mjs'

/** `pedido:<clave>` (o `pedido:<id>` si entró sin clave, el de antes de la 033); la versión `n` > 1 de un pedido cambiado lleva `:<n>`. */
export function origenRefPedido(p, n = 1) {
  const base = `pedido:${p.clave ?? p.id}`
  return n > 1 ? `${base}:${n}` : base
}

/** Darío §4 (Bruno 31-oct): si le faltan $1.000 o menos, el pedido se ve «Pagado» — ⛔ se perdona, sigue debiéndose en la cuenta. */
export const TOLERANCIA_PAGO = 1000

/**
 * El estado del pago del pedido (Darío §3-§4), de lo que su compra DEBE en la cuenta corriente.
 * Con `falta` ≤ `TOLERANCIA_PAGO` (y algo pagado) es «pagado» con `tolerado: true` y la `falta` REAL: lo que falta queda
 * en la cuenta («es como una cuenta», Bruno 31-oct) y la pantalla lo puede decir.
 * @param {{ total: number, pendiente: number }} p
 * @returns {{ estado: 'pagado'|'parcial'|'sin_pagar', falta: number, pagado: number, tolerado?: true }}
 */
export function estadoDePago({ total, pendiente }) {
  const t = pesos(total), falta = Math.max(0, pesos(pendiente))
  const pagado = pesos(t - falta)
  if (falta < 0.5) return { estado: 'pagado', falta: 0, pagado: t }
  if (pagado < 0.5) return { estado: 'sin_pagar', falta, pagado: 0 }
  if (falta <= TOLERANCIA_PAGO) return { estado: 'pagado', falta, pagado, tolerado: true }
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
  const nueva = ventaDePedido({ pedido: p, lineas: p.lineas, total: p.total, cliente_id: cli.id, cuenta, usuario, real: ventaMayoristaReal(p.marca, await leerCortes(db), env) })
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

/**
 * El pedido del catálogo ENTRA SOLO cuando se sabe de quién es (Darío §1: «todos los pedidos con ese número entran solos a ese
 * cliente»; Bruno 30-oct: «entra y RESERVA»). Sólo desde el corte: antes la venta la registra la copia de GN. Un número que ⛔ se
 * conoce, o con dos fichas, queda «sin entrar» y lo decide Darío en el panel (⛔ se adivina a quién le pertenece).
 * Nunca tira por el dato del cliente: el pedido ya está guardado.
 * @param {import('pg').ClientBase} db  @param {{ pedido_id: string, telefono?: string|null }} e  @param {{ env?: object }} [op]
 * @returns {Promise<{ entro: boolean, motivo?: string, venta_id?: string }>}
 */
export async function entrarSiSeConoce(db, e, { env = process.env } = {}) {
  const [p] = await q(db, 'select empresa_id, marca from pedido_mayorista where id = $1', [e?.pedido_id])
  if (!p) return { entro: false, motivo: 'no_encontrado' }
  if (!ventaMayoristaReal(p.marca, await leerCortes(db), env)) return { entro: false, motivo: 'sin_corte' }
  const r = await clientePorWhatsapp(db, { empresa_id: p.empresa_id, whatsapp: e.telefono })
  if (!r.ok) return { entro: false, motivo: 'numero_invalido' }
  if (r.clientes.length !== 1) return { entro: false, motivo: r.clientes.length ? 'varias_fichas' : 'numero_desconocido' }
  const entro = await entrarPedidoMayorista(db, { pedido_id: e.pedido_id, cliente_id: r.clientes[0].id, persona_id: r.persona?.id ?? null, usuario: 'catálogo' }, { env })
  return entro.ok ? { entro: true, venta_id: entro.venta_id } : { entro: false, motivo: entro.error?.codigo ?? 'no_entro' }
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
  const real = ventaMayoristaReal(p.marca, await leerCortes(db), env)
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

/** Los momentos que marca Logística: la columna que escribe cada uno. */
const MOMENTOS = Object.freeze({ empezo: 'preparacion_en', terminado: 'preparado_en', despachado: 'despachado_en' })

/**
 * Logística marca el pedido (Darío §2-§3). Idempotente: repetir un momento ⇒ `ya`, con la hora de la primera vez. Un momento
 * posterior completa los anteriores que ⛔ llegaron (si «terminado» llega sin «empezó», igual ya no se puede cambiar el pedido).
 * 🔴 EL FRENO del despacho vive acá (Darío §3): sin pagar y sin cuenta corriente ⛔ se despacha. `yaOcurrio` = lo LEÍDO de Logística
 * (`lib/logistica/lectura.mjs`): es un hecho, y el freno lo tiene ella, que relee la zona antes de despachar (Ger §7).
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, numero: number, evento: 'empezo'|'terminado'|'despachado', usuario: string, en?: Date, yaOcurrio?: boolean }} e
 */
export async function marcarLogistica(db, e) {
  const usuario = texto(e?.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo marca', 'usuario')
  const columna = MOMENTOS[e?.evento]
  if (!columna) return falla('ENTRADA_INVALIDA', 'El evento es empezo, terminado o despachado', 'evento')
  return enTransaccion(db, async () => {
    const [fila] = await q(db, 'select id from pedido_mayorista where marca = $1 and numero = $2', [e.marca, e.numero])
    const p = fila ? await leerPedido(db, fila.id, { bloquear: true }) : null
    if (!p) return falla('NO_ENCONTRADO', `No está el pedido ${e.numero}`, 'numero')
    if (p.anulado_en) return falla('ANULADO', `El pedido ${p.numero} está anulado`)
    if (!p.a_preparar_en) return falla('SIN_MANDAR', `El pedido ${p.numero} todavía no se mandó a preparar`)
    return marcarEsteMomento(db, p, e, usuario, columna)
  })
}

/** El momento, sobre el pedido ya bloqueado. Dentro de una transacción. */
async function marcarEsteMomento(db, p, e, usuario, columna) {
  if (p[columna]) return { ok: true, ya: true, pedido: { id: p.id, numero: p.numero }, etapa: etapaDe(p), en: p[columna] }
  if (e.evento === 'despachado' && !e.yaOcurrio) {
    const pago = (await pagosDe(db, [p])).get(p.id)
    if (pago?.zona !== 'despacho') return falla('SIN_PAGAR', `El pedido ${p.numero} está sin pagar y el cliente no tiene cuenta corriente: va a Pendiente de pago`)
  }
  const en = e.en ?? new Date()
  const orden = Object.values(MOMENTOS)
  const hasta = orden.slice(0, orden.indexOf(columna) + 1)
  const [u] = await q(db, `update pedido_mayorista set ${hasta.map((c) => `${c} = coalesce(${c}, $2)`).join(', ')} where id = $1 returning *`, [p.id, en])
  await cambio(db, p, e.evento, usuario, foto(p))
  return { ok: true, ya: false, pedido: { id: p.id, numero: p.numero }, etapa: etapaDe(u), en: u[columna] }
}

/**
 * EMPEZAR A PREPARAR con la versión que vio el depósito (`start-picking` de la API externa, contrato de Ger §4.2). El orden importa:
 * lo despachado y lo anulado frenan siempre; lo ya empezado contesta `ya` ANTES de mirar la versión, porque empezar mueve
 * `actualizado_en` y un reintento trae la de antes. Lo no mandado a preparar ⛔ se publica ⇒ `NO_ENCONTRADO`, como otro negocio.
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, numero: number, esperado: Date, usuario: string }} e
 * @returns {Promise<{ ok: true, ya: boolean } | { ok: false, error: { codigo: 'NO_ENCONTRADO'|'ANULADO'|'DESPACHADO'|'VERSION', mensaje: string } }>}
 */
export async function empezarPreparacion(db, e) {
  const usuario = texto(e?.usuario)
  if (!usuario) return falla('ENTRADA_INVALIDA', 'Falta quién lo marca', 'usuario')
  return enTransaccion(db, async () => {
    const [fila] = await q(db, 'select id from pedido_mayorista where marca = $1 and numero = $2 and a_preparar_en is not null', [e.marca, e.numero])
    const p = fila ? await leerPedido(db, fila.id, { bloquear: true }) : null
    if (!p) return falla('NO_ENCONTRADO', `No está el pedido ${e.numero}`, 'numero')
    if (p.anulado_en) return falla('ANULADO', `El pedido ${p.numero} está anulado`)
    if (p.despachado_en) return falla('DESPACHADO', `El pedido ${p.numero} ya se despachó`)
    if (p.preparacion_en) return { ok: true, ya: true }
    if (new Date(p.actualizado_en).getTime() !== e.esperado.getTime()) return falla('VERSION', `El pedido ${p.numero} cambió desde que se leyó: mirá cómo quedó antes de empezar`)
    const r = await marcarEsteMomento(db, p, { evento: 'empezo' }, usuario, MOMENTOS.empezo)
    return r.ok ? { ok: true, ya: false } : r
  })
}

/**
 * LA COLA de Logística: lo mandado a preparar y sin despachar, con lo que el depósito necesita. Se lee entera cada vez: la zona
 * cambia sola cuando Darío carga un pago, sin que el pedido se toque. `cambio_en` = se cambió DESPUÉS de mandarse a preparar
 * (el aviso al depósito). `anulados`: los mandados a preparar y anulados en los últimos 7 días, para sacarlos de la app.
 * @param {import('pg').ClientBase} db  @param {{ marca: string }} e
 */
export async function colaDeLogistica(db, { marca }) {
  const filas = await q(db, `select p.*, c.nombre as cliente, w.nombre as persona from pedido_mayorista p
      left join cliente c on c.id = p.cliente_id left join cliente_whatsapp w on w.id = p.persona_id
    where p.marca = $1 and p.a_preparar_en is not null and p.despachado_en is null and p.anulado_en is null order by p.a_preparar_en`, [marca])
  const anulados = await q(db, `select numero, anulado_en from pedido_mayorista where marca = $1 and a_preparar_en is not null and anulado_en > now() - interval '7 days' order by anulado_en desc`, [marca])
  const pedidos = (await armarParaLogistica(db, filas, marca)).map(({ anulado_en: _a, actualizado_en: _v, ...p }) => p)
  return { ok: true, anulados: anulados.map((a) => ({ numero: Number(a.numero), anulado_en: a.anulado_en })), pedidos }
}

/** Las filas de `pedido_mayorista`, con lo que el depósito necesita: variante, ubicación, pago y zona. */
async function armarParaLogistica(db, crudas, marca, { sensibles = false } = {}) {
  const filas = crudas.map((p) => ({ ...p, lineas: p.lineas ?? [], numero: Number(p.numero), total: Number(p.total) }))
  const lineas = filas.flatMap((p) => p.lineas.filter((l) => l.size_id != null).map((l) => ({ ...l, deposito: p.deposito ?? DEPOSITO_MAYORISTA[marca] })))
  const ids = [...new Set(lineas.map((l) => Number(l.product_id)))]
  const variantes = ids.length ? await q(db, `select v.product_id, v.size_id, v.talle, v.sku, v.barcode, p.nombre from variante v join producto p on p.empresa_id = v.empresa_id and p.id = v.product_id where v.product_id = any($1::bigint[])`, [ids]) : []
  const ubicaciones = ids.length ? await q(db, 'select deposito, product_id, size_id, texto from ubicacion where linea = $1 and product_id = any($2::bigint[])', [marca, ids]) : []
  const variante = new Map(variantes.map((v) => [claveVar(v), v]))
  const ubicacion = new Map(ubicaciones.map((u) => [`${u.deposito}:${claveVar(u)}`, u.texto]))
  const pagos = await pagosDe(db, filas)
  return filas.map((p) => {
    const deposito = p.deposito ?? DEPOSITO_MAYORISTA[marca]
    const pago = pagos.get(p.id)
    return {
      numero: p.numero, etapa: etapaDe(p), prueba: p.venta_prueba === true, deposito, cliente: p.cliente ?? null, persona: p.persona ?? null, entrega: p.contacto?.entrega ?? null, notas: p.contacto?.obs ?? null,
      a_preparar_en: p.a_preparar_en, preparacion_en: p.preparacion_en, preparado_en: p.preparado_en, anulado_en: p.anulado_en, actualizado_en: p.actualizado_en,
      cambio_en: p.editado_en && new Date(p.editado_en) > new Date(p.a_preparar_en) ? p.editado_en : null,
      ...(sensibles ? { cliente_datos: { id: p.cliente_id ?? null, gn_id: p.cliente_gn_id ?? null, telefono: p.persona_whatsapp ?? p.cliente_whatsapp ?? null, email: p.cliente_email ?? null } } : {}),
      total: p.total, pagado: pago?.pago.estado === 'pagado', falta: pago?.pago.falta ?? p.total, cuenta_corriente: pago?.cuenta_habilitada ?? false, zona: pago?.zona ?? 'pendiente_pago',
      renglones: p.lineas.map((l) => {
        const v = variante.get(claveVar(l))
        return { product_id: Number(l.product_id), size_id: l.size_id == null ? null : Number(l.size_id), sku: v?.sku ?? null, barcode: v?.barcode ?? null, nombre: v?.nombre ?? null, talle: v?.talle ?? null, cantidad: Number(l.cantidad), ubicacion: ubicacion.get(`${deposito}:${claveVar(l)}`) ?? null, ...(sensibles ? { precio: l.precio ?? null } : {}) }
      }),
    }
  })
}

const ETAPA_SQL = `case when p.anulado_en is not null then 'anulado' when p.despachado_en is not null then 'despachado' when p.preparado_en is not null then 'preparado'
  when p.preparacion_en is not null then 'en_preparacion' else 'a_preparar' end`

/**
 * Lo que Logística puede leer por la API externa: TODO lo mandado a preparar, también lo despachado y lo anulado, porque un consumidor
 * que se atrasó tiene que poder enterarse (Ger §4.1). Lo no mandado ⛔ sale: el pedido todavía es de Darío.
 * @param {import('pg').ClientBase} db
 * @param {{ marca: string, numero?: number, etapa?: string|null, desde?: Date|null, limit: number, offset: number }} e
 * @returns {Promise<{ total: number, pedidos: any[] }>}
 */
export async function pedidosDeLogistica(db, { marca, numero = null, etapa = null, desde = null, limit, offset, sensibles = false }) {
  const where = `p.marca = $1 and p.a_preparar_en is not null and ($2::bigint is null or p.numero = $2) and ($3::text is null or (${ETAPA_SQL}) = $3) and ($4::timestamptz is null or p.actualizado_en >= $4)`
  const filtros = [marca, numero, etapa, desde]
  const [{ total }] = await q(db, `select count(*)::int as total from pedido_mayorista p where ${where}`, filtros)
  const filas = await q(db, `select p.*, c.nombre as cliente, w.nombre as persona, vta.prueba as venta_prueba, c.gn_client_id as cliente_gn_id, c.whatsapp as cliente_whatsapp, c.email as cliente_email, w.whatsapp as persona_whatsapp from pedido_mayorista p
      left join cliente c on c.id = p.cliente_id left join cliente_whatsapp w on w.id = p.persona_id left join venta vta on vta.id = p.venta_id
    where ${where} order by p.numero desc limit $5 offset $6`, [...filtros, limit, offset])
  return { total, pedidos: await armarParaLogistica(db, filas, marca, { sensibles }) }
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
