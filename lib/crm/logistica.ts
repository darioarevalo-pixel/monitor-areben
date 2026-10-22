import { apiFetch } from '../api-fetch'

/**
 * Los pedidos mayoristas de BDI que están en Logística (logistica.arebensrl.com), en el panel de
 * WhatsApp (Darío, 22-oct-2026). Primera tanda: SÓLO mirar — los pedidos en curso del cliente del
 * chat y los pendientes del día en «Hoy».
 *
 * 🔑 **Un pedido entra a Logística recién cuando Darío lo pasa a «Compra pendiente» en GN.** Antes
 * es «Pedido Catálogo» y no está: que el cliente no tenga nada acá no quiere decir que no pidió.
 *
 * 🔑 **Se busca por el cliente de GN, no por la venta**: las ventas llegan al Monitor una vez por
 * día y el pedido de hoy no estaría. El teléfono es el plan B (número nuevo, prospecto).
 *
 * El servidor es `api/_logistica.js`: el navegador nunca ve el token.
 */
const API = '/api/datos?recurso=logistica'

type CodigoTexto = { code: number; label: string }

export type PedidoLogistica = {
  id: number
  gn_number: string | null
  gn_client_id: string | null
  client_name: string
  client_phone: string | null
  sold_at: string | null
  status: CodigoTexto & { since?: string | null }
  dispatch_option: CodigoTexto | null
  label_state: { code: string; label: string }
  missing: string[]
  has_label: boolean
  em: number | string | null
  carrier: { slug: string; label: string } | null
  tracking_number: string | null
  tracking_url: string | null
  tracking_source: string | null
  tracking_needs_manual: boolean
  units: { scanned: number; total: number; complete: boolean }
  dispatched_at: string | null
  url: string
  updated_at: string
}

/** Un pedido de la lista de pendientes: lo mismo + el primer paso que falta y la sugerencia. */
export type PendienteLogistica = PedidoLogistica & {
  next_step: { code: string; label: string } | null
  suggestion: {
    dispatch_option: CodigoTexto
    carrier: { slug: string; label: string } | null
    from_gn_number: string | null
    from_date: string | null
  } | null
}

export type Resultado<T> = { t: 'ok'; datos: T } | { t: 'sin-permiso' } | { t: 'error'; motivo: string }

/** Una carga: además del error, el 409 —alguien cambió ese dato en el medio— trae el pedido como quedó. */
export type ResultadoCarga = { t: 'ok'; pedido: PedidoLogistica } | { t: 'cambio'; motivo: string; pedido: PedidoLogistica | null } | { t: 'error'; motivo: string }

export type Catalogos = { dispatch_options: CodigoTexto[]; carriers: { slug: string; label: string }[] }

async function pedir<T>(cuerpo: Record<string, unknown>): Promise<Resultado<T>> {
  try {
    const r = await apiFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const d = (await r.json().catch(() => ({}))) as T & { error?: string; detail?: string }
    // El 403 del Monitor (sin acceso a Clientes) esconde el bloque. El de Logística trae `detail`
    // —al token le falta un permiso— y se tiene que ver.
    if (r.status === 403 && !d.detail) return { t: 'sin-permiso' }
    if (!r.ok) return { t: 'error', motivo: d.error || `Error ${r.status} con Logística.` }
    return { t: 'ok', datos: d }
  } catch (e) {
    return { t: 'error', motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Los pedidos en curso de un cliente: por su número de GN y, si ahí no hay nada, por teléfono (un
 * pedido de un cliente duplicado en GN cuelga del otro número de cliente).
 */
export async function pedidosDelCliente(clienteId: number | null, tel: string | null): Promise<Resultado<PedidoLogistica[]>> {
  if (clienteId) {
    const r = await pedir<{ orders?: PedidoLogistica[] }>({ action: 'cliente', clienteId })
    if (r.t !== 'ok') return r
    if (r.datos.orders?.length || !tel) return { t: 'ok', datos: r.datos.orders || [] }
  }
  if (!tel) return { t: 'ok', datos: [] }
  const r = await pedir<{ orders?: PedidoLogistica[] }>({ action: 'telefono', tel })
  return r.t === 'ok' ? { t: 'ok', datos: r.datos.orders || [] } : r
}

export async function pendientesLogistica(): Promise<Resultado<{ count: number; by_step: Record<string, number>; orders: PendienteLogistica[] }>> {
  const r = await pedir<{ count?: number; by_step?: Record<string, number>; orders?: PendienteLogistica[] }>({ action: 'pendientes' })
  return r.t === 'ok' ? { t: 'ok', datos: { count: r.datos.count || 0, by_step: r.datos.by_step || {}, orders: r.datos.orders || [] } } : r
}

let catalogosCache: Promise<Resultado<Catalogos>> | null = null

/** Las formas de entrega y los transportes de Logística. Se piden una vez; un error se vuelve a pedir. */
export function catalogosLogistica(): Promise<Resultado<Catalogos>> {
  if (!catalogosCache) {
    catalogosCache = pedir<Partial<Catalogos>>({ action: 'catalogos' }).then((r) =>
      r.t === 'ok' ? { t: 'ok', datos: { dispatch_options: r.datos.dispatch_options || [], carriers: r.datos.carriers || [] } } : r,
    )
    catalogosCache.then((r) => {
      if (r.t !== 'ok') catalogosCache = null
    })
  }
  return catalogosCache
}

/** El código de la forma «Transporte»: es la única que pide elegir cuál. */
export const TRANSPORTE = 3

/**
 * Guardar la forma de entrega de un pedido. Va con lo que el panel VIO (`expected`): si alguien la
 * cambió en el medio, Logística no guarda y devuelve el pedido como quedó. ⛔ No se reintenta solo.
 */
export async function guardarEntrega(p: PedidoLogistica, codigo: number, carrier: string | null): Promise<ResultadoCarga> {
  const cuerpo: Record<string, unknown> = {
    action: 'entrega',
    id: p.id,
    dispatch_option: codigo,
    expected: { dispatch_option: p.dispatch_option?.code ?? null, ...(codigo === TRANSPORTE ? { carrier: p.carrier?.slug ?? null } : {}) },
  }
  if (codigo === TRANSPORTE) cuerpo.carrier = carrier
  try {
    const r = await apiFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const d = (await r.json().catch(() => ({}))) as Partial<PedidoLogistica> & { error?: string; order?: PedidoLogistica }
    if (r.status === 409) return { t: 'cambio', motivo: d.error || 'El pedido cambió mientras tanto.', pedido: d.order || null }
    if (!r.ok) return { t: 'error', motivo: d.error || `Error ${r.status} con Logística.` }
    return { t: 'ok', pedido: d as PedidoLogistica }
  } catch (e) {
    return { t: 'error', motivo: e instanceof Error ? e.message : String(e) }
  }
}

const LISTO = 3

/**
 * Lo que hay que hacer con un pedido, en el orden del circuito. Es lo que se pinta en amarillo: lo
 * que está bien no se anuncia.
 */
export function avisosDe(p: PedidoLogistica): string[] {
  const avisos: string[] = []
  if (!p.dispatch_option) avisos.push('Falta elegir la forma de entrega')
  else if (p.dispatch_option.code === 1 && !p.em) avisos.push('Falta cargar el EM')
  if (p.label_state.code === 'falta_datos') avisos.push(p.missing.length ? `Faltan datos: ${p.missing.join(', ')}` : 'Faltan datos para la etiqueta')
  if (p.tracking_needs_manual) avisos.push('No se pudo leer el seguimiento del PDF: cargalo en Logística')
  if (p.status.code === LISTO && !p.units.complete) avisos.push(`Se cerró con ${p.units.scanned} de ${p.units.total} unidades: puede faltar un producto`)
  return avisos
}

/** «Transporte · Via Cargo», «EM 12345», o null si falta elegirla. */
export function entregaDe(p: PedidoLogistica): string | null {
  if (!p.dispatch_option) return null
  const partes = [p.dispatch_option.label]
  if (p.carrier) partes.push(p.carrier.label)
  if (p.dispatch_option.code === 1 && p.em) partes.push(`EM ${p.em}`)
  return partes.join(' · ')
}

/** Lo que usó la vez anterior, para la lista de pendientes: «La vez pasada: Transporte · Via Cargo». */
export function sugerenciaDe(p: PendienteLogistica): string | null {
  if (!p.suggestion) return null
  const partes = [p.suggestion.dispatch_option.label]
  if (p.suggestion.carrier) partes.push(p.suggestion.carrier.label)
  return `La vez pasada: ${partes.join(' · ')}`
}
