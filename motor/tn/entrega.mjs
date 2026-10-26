/**
 * LA ENTREGA DE UN PEDIDO DE TIENDA NUBE (paso 4; pedido a Ger, punto 5, 20-oct; tablas: sql/039). Logística entrega y, si
 * el pedido no está pagado, aprieta EFECTIVO o TRANSFERENCIA: eso es el COBRO. Se registra ACÁ, ⛔ en Tienda Nube; el
 * «marcar entregado» en Tienda Nube lo hace Logística por su cuenta.
 *
 *   - Logística dice CÓMO se pagó (`efectivo` | `transferencia` | `ya_pagado`), ⛔ a qué cuenta: la cuenta sale de
 *     `cuentaDeGateway` (la del medio de la marca) y, con rutas puestas, `registrarVenta` le suma la cuenta real.
 *   - El MONTO es el del pedido (Bruno, 20-oct: ⛔ se tipea). Si Logística manda otro, se anota el aviso y vale el del pedido.
 *   - La venta nace AL COBRO (opción A, Darío 26-oct) con la MISMA regla que el pedido pagado en TN (`planVentasTN`), así
 *     que una venta con esa clave ⛔ se duplica: si después alguien marca «pagado» en TN, `planDe` la encuentra (`ya`).
 *   - 🔑 La entrega ⛔ se frena NUNCA por el cobro: ya se hizo en el mostrador. Si la venta ⛔ se puede crear (la marca no
 *     tiene la cuenta de ese medio, falta una variante…) la entrega queda registrada con el cobro PENDIENTE y su motivo, y
 *     `reintentarEntregas` lo vuelve a intentar cuando alguien lo arregla.
 *   - Lo que sí se rechaza: un aviso mal armado, un pedido cancelado o devuelto, y un pedido que el ERP todavía ⛔ tiene
 *     (Logística reintenta: el aviso de TN lo trae en segundos).
 *
 * Todo en PRUEBA (`prueba: true`, como el resto de las ventas de TN) hasta que Bruno pida otra cosa.
 */
import { DEVUELTA, PAGADA } from './cruce.mjs'
import { TIENDAS } from './orden.mjs'
import { cargarOrdenesPorId } from './guardar.mjs'
import { planDe } from './aplicar.mjs'
import { registrarVenta } from '../venta/registrar.mjs'

export const FORMAS = ['efectivo', 'transferencia', 'ya_pagado']
const GATEWAY = { efectivo: 'Efectivo', transferencia: 'Transferencia' }
const DIA_MS = 24 * 3600 * 1000
const pesos = (x) => Math.round(Number(x) * 100) / 100
const falla = (codigo, mensaje, campo) => ({ ok: false, error: { codigo, mensaje, ...(campo ? { campo } : {}) } })

/**
 * Lee el aviso de Logística (⛔ se confía en él). Puro.
 * @returns {{ ok: true, entrega: { id, tienda, pedido, forma_pago, monto: number|null, entrego, fecha: string } } | { ok: false, error: object }}
 */
export function leerEntrega(c, ahoraMs = Date.now()) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return falla('ENTRADA_INVALIDA', 'El aviso viene mal armado')
  const id = typeof c.id === 'string' ? c.id.trim() : typeof c.id === 'number' ? String(c.id) : ''
  if (!id || id.length > 100) return falla('ENTRADA_INVALIDA', 'Falta el id de la entrega', 'id')
  if (!TIENDAS[c.tienda]) return falla('ENTRADA_INVALIDA', 'Tienda inválida', 'tienda')
  const pedido = Number(c.pedido)
  if (!Number.isSafeInteger(pedido) || pedido <= 0) return falla('ENTRADA_INVALIDA', 'Falta el número de pedido', 'pedido')
  if (!FORMAS.includes(c.forma_pago)) return falla('ENTRADA_INVALIDA', 'La forma de pago es efectivo, transferencia o ya_pagado', 'forma_pago')
  let monto = null
  if (c.monto != null && c.monto !== '') {
    monto = Number(c.monto)
    if (!Number.isFinite(monto) || monto < 0) return falla('ENTRADA_INVALIDA', 'El monto no es un número', 'monto')
  }
  const entrego = typeof c.entrego === 'string' ? c.entrego.trim() : ''
  if (!entrego || entrego.length > 100) return falla('ENTRADA_INVALIDA', 'Falta quién entregó', 'entrego')
  const t = Date.parse(c.fecha)
  if (!Number.isFinite(t)) return falla('ENTRADA_INVALIDA', 'La fecha no es válida', 'fecha')
  if (t > ahoraMs + DIA_MS) return falla('ENTRADA_INVALIDA', 'La fecha es del futuro', 'fecha')
  return { ok: true, entrega: { id, tienda: c.tienda, pedido, forma_pago: c.forma_pago, monto, entrego, fecha: new Date(t).toISOString() } }
}

/**
 * Qué hacer con la entrega de ESTE pedido. Puro.
 * @param {{ orden: object|null, entrega: ReturnType<typeof leerEntrega> extends infer R ? any : never, venta: { id: string, estado: string }|null }} p
 * @returns {{ rechazo: { codigo: string, mensaje: string } } | { cobrar: boolean, ordenCobrada?: object, resultado: string, avisos: string[] }}
 */
export function planEntrega({ orden, entrega, venta }) {
  if (!orden) return { rechazo: { codigo: 'PEDIDO_DESCONOCIDO', mensaje: `El ERP todavía no tiene el pedido #${entrega.pedido}` } }
  if (orden.status === 'cancelled' || DEVUELTA.has(orden.payment_status)) return { rechazo: { codigo: 'PEDIDO_CANCELADO', mensaje: `El pedido #${entrega.pedido} está cancelado o devuelto` } }
  const avisos = []
  if (entrega.monto != null && Math.abs(pesos(entrega.monto) - pesos(orden.total)) > 1 && entrega.forma_pago !== 'ya_pagado') avisos.push('MONTO_DISTINTO')
  const pagaTN = PAGADA.has(orden.payment_status) && !!orden.pagada_en
  if (venta) {
    if (entrega.forma_pago !== 'ya_pagado') avisos.push('YA_TENIA_COBRO')
    return { cobrar: false, resultado: 'ya_tenia', avisos }
  }
  if (entrega.forma_pago === 'ya_pagado') {
    if (!pagaTN) avisos.push('YA_PAGADO_SIN_PAGO_EN_TN')
    return { cobrar: false, resultado: 'no_corresponde', avisos }
  }
  if (pagaTN) return { cobrar: false, resultado: 'no_corresponde', avisos: [...avisos, 'PAGADO_EN_TN'] } // la venta la crea el camino de TN, con el medio de TN
  // Sin pagar y cobrado al entregar: la venta nace AHORA, con el medio que apretaron.
  const ordenCobrada = { ...orden, payment_status: 'paid', pagada_en: entrega.fecha, gateway: GATEWAY[entrega.forma_pago], medio: entrega.forma_pago }
  return { cobrar: true, ordenCobrada, resultado: 'registrada', avisos }
}

const q = async (conexion, sql, p = []) => (await conexion.query(sql, p)).rows
const dbDe = (conexion) => ({ q: (s, p = []) => q(conexion, s, p), run: async (s, p = []) => (await conexion.query(s, p)).rowCount })

async function cargarOrden(conexion, tienda, numero) {
  const db = dbDe(conexion)
  const [f] = await db.q('select tn_id from tn_orden where tienda = $1 and numero = $2', [tienda, numero])
  if (!f) return null
  return (await cargarOrdenesPorId(db, tienda, [Number(f.tn_id)]))[0] ?? null
}

async function ventaDe(conexion, tienda, tnId) {
  const [v] = await q(conexion, `select id, estado from venta where origen = 'tn' and origen_ref = $1`, [`${tienda}:${tnId}`])
  return v && v.estado !== 'anulada' ? v : null
}

/** Crea la venta del cobro. @returns {Promise<{ resultado: 'registrada'|'pendiente', venta_id?: string, motivo?: string }>} */
async function cobrar(conexion, entrega, ordenCobrada) {
  const plan = await planDe(dbDe(conexion), entrega.tienda, [ordenCobrada])
  const salto = Object.keys(plan.saltadas).find((k) => plan.saltadas[k].length)
  if (salto) return { resultado: 'pendiente', motivo: salto }
  const e = plan.registrar[0]
  if (!e) return { resultado: 'pendiente', motivo: 'sin_venta' } // otra con esa clave ya está: ⛔ se duplica
  e.usuario = `logistica:${entrega.entrego}`
  e.detalle = { ...e.detalle, tn: { ...e.detalle.tn, cobro_en: 'logistica' }, entrega: { id: entrega.id, forma_pago: entrega.forma_pago, entrego: entrega.entrego, fecha: entrega.fecha, ...(entrega.forma_pago === 'transferencia' ? { por_verificar: true } : {}) } }
  const r = await registrarVenta(conexion, e)
  if (!r.ok) return { resultado: 'pendiente', motivo: `${r.error.codigo}: ${r.error.mensaje}`.slice(0, 300) }
  return { resultado: 'registrada', venta_id: r.venta?.id ?? r.venta_id ?? null }
}

/**
 * Una entrega de Logística: la anota y, si corresponde, crea la venta del cobro. Idempotente por `id`.
 * @param {{ conexion: import('pg').Client, entrega: any }} p  `conexion` SIN transacción abierta; `entrega` ya pasó por `leerEntrega`
 * @returns {Promise<{ ok: true, ya: boolean, resultado: string, venta_id: string|null, motivo: string|null, avisos: string[] } | { ok: false, error: object }>}
 */
export async function procesarEntrega({ conexion, entrega }) {
  const [m] = await q(conexion, 'select empresa_id from marca where id = $1', [entrega.tienda])
  if (!m) return falla('ENTRADA_INVALIDA', 'Tienda sin marca en esta base', 'tienda')
  const [prev] = await q(conexion, 'select avisos from entrega where empresa_id = $1 and id = $2', [m.empresa_id, entrega.id])
  if (prev) {
    const [c] = await q(conexion, 'select resultado, venta_id, motivo from entrega_cobro where empresa_id = $1 and entrega_id = $2 order by creada_en desc limit 1', [m.empresa_id, entrega.id])
    return { ok: true, ya: true, resultado: c?.resultado ?? 'no_corresponde', venta_id: c?.venta_id ?? null, motivo: c?.motivo ?? null, avisos: prev.avisos ?? [] }
  }
  const orden = await cargarOrden(conexion, entrega.tienda, entrega.pedido)
  const venta = orden ? await ventaDe(conexion, entrega.tienda, orden.tn_id) : null
  const plan = planEntrega({ orden, entrega, venta })
  if (plan.rechazo) return { ok: false, error: plan.rechazo }
  let cobro = { resultado: plan.resultado, venta_id: venta?.id ?? null, motivo: null }
  if (plan.cobrar) cobro = { motivo: null, venta_id: null, ...(await cobrar(conexion, entrega, plan.ordenCobrada)) }
  const insertada = (await conexion.query(
    `insert into entrega (empresa_id, id, marca, tn_id, numero, forma_pago, monto, entrego, entregada_en, avisos)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (empresa_id, id) do nothing`,
    [m.empresa_id, entrega.id, entrega.tienda, orden.tn_id, entrega.pedido, entrega.forma_pago, entrega.monto, entrega.entrego, entrega.fecha, JSON.stringify(plan.avisos)],
  )).rowCount
  if (insertada) {
    await conexion.query(
      `insert into entrega_cobro (empresa_id, entrega_id, venta_id, resultado, motivo) values ($1, $2, $3, $4, $5)`,
      [m.empresa_id, entrega.id, cobro.venta_id, cobro.resultado, cobro.motivo],
    )
  }
  return { ok: true, ya: !insertada, resultado: cobro.resultado, venta_id: cobro.venta_id, motivo: cobro.motivo, avisos: plan.avisos }
}

/**
 * Vuelve a intentar el cobro de las entregas que quedaron PENDIENTES (se arregló la cuenta, la rutas, la variante…).
 * @returns {Promise<{ revisadas: number, registradas: number, siguen: Array<{ id: string, motivo: string|null }> }>}
 */
export async function reintentarEntregas({ conexion, tienda }) {
  const pend = await q(
    conexion,
    `select e.empresa_id, e.id, e.marca as tienda, e.numero, e.forma_pago, e.monto::float as monto, e.entrego, e.entregada_en
       from entrega e join marca m on m.id = e.marca
      where e.marca = $1 and e.forma_pago <> 'ya_pagado'
        and (select resultado from entrega_cobro c where c.empresa_id = e.empresa_id and c.entrega_id = e.id order by creada_en desc limit 1) = 'pendiente'
      order by e.entregada_en`,
    [tienda],
  )
  let registradas = 0
  const siguen = []
  for (const p of pend) {
    const entrega = { id: p.id, tienda: p.tienda, pedido: Number(p.numero), forma_pago: p.forma_pago, monto: p.monto, entrego: p.entrego, fecha: new Date(p.entregada_en).toISOString() }
    const orden = await cargarOrden(conexion, tienda, entrega.pedido)
    const venta = orden ? await ventaDe(conexion, tienda, orden.tn_id) : null
    const plan = planEntrega({ orden, entrega, venta })
    if (plan.rechazo) { siguen.push({ id: p.id, motivo: plan.rechazo.codigo }); continue }
    const cobro = plan.cobrar ? await cobrar(conexion, entrega, plan.ordenCobrada) : { resultado: plan.resultado, venta_id: venta?.id ?? null, motivo: null }
    if (cobro.resultado === 'pendiente') { siguen.push({ id: p.id, motivo: cobro.motivo ?? null }); continue }
    await conexion.query(
      `insert into entrega_cobro (empresa_id, entrega_id, venta_id, resultado, motivo) values ($1, $2, $3, $4, $5)`,
      [p.empresa_id, p.id, cobro.venta_id ?? null, cobro.resultado, null],
    )
    if (cobro.resultado === 'registrada') registradas++
  }
  return { revisadas: pend.length, registradas, siguen }
}
