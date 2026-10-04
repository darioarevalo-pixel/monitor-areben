/**
 * Caja, del lado del navegador (`/api/datos?recurso=caja`).
 *
 * El dinero lo calcula `lib/caja/core.core.js` en las DOS puntas: la pantalla para mostrarlo y el
 * servidor otra vez al confirmar. Acá ⛔ hay reglas: sólo el camino a la API y sus tipos.
 */

import { apiFetch } from '@/lib/api-fetch'

export type ReglaCuenta = { nombre: string; descuento: number; efectivo?: boolean; esperaPago?: boolean }
export type Medio = 'efectivo' | 'transferencia' | 'debito' | 'credito'
export type Medios = {
  efectivo: { normal: number; feria: number }
  transferencia: { opciones: number[]; feria: number }
  debito: { normal: number }
  credito: { normal: number; promo: number; seisCuotas: number; minSeisCuotas: number }
}
/** `medios` ⛔ está hasta que se corre `sql/migrate-caja-medios.sql`. */
export type Reglas = { redondeo: number; cuentas: Record<number, ReglaCuenta>; medios?: Medios; transferenciaA?: number; feria?: boolean }
/** Un descuento a mano, a una prenda o a toda la venta. */
export type Rebaja = { tipo: 'pct' | 'pesos'; valor: number }
export type Config = { reglas: Reglas; politica_cambio: string | null }

/** Una cuenta de cobro de GN. `regla` en null ⇒ la Caja ⛔ la cobra (sin %, o con recargo). */
export type CuentaGN = { id: number; nombre: string; regla: ReglaCuenta | null }

export type Variante = { product_id: number; size_id: number; product_name: string; size_name: string; sku: string | null; barcode: string | null }
/** `vivo` = leído de GN recién; `espejo` = el de anoche, porque GN ⛔ contestó (`motivo`). */
/** `atras`: los estantes del depósito de atrás donde está el producto (Ubicaciones depósito); vacío = todo en percha. */
export type Stock = { local: number; deposito: number; fuente: 'vivo' | 'espejo'; motivo?: string; atras?: string[] }
/** `candidatos`: el código es de varias prendas, o se buscó por nombre. `local` = stock del local de anoche; `mas` = las que no entraron. */
export type Candidato = Variante & { local?: number }
export type Producto = { variante: Variante; stock: Stock } | { candidatos: Candidato[]; mas?: number }

/** `esperando_pago`: cobrada por transferencia, el pago todavía ⛔ apareció en MP (F5). `cancelada`: ⛔ llegó y la cajera la canceló. */
export type EstadoVenta = 'borrador' | 'enviando' | 'en_gn' | 'error' | 'esperando_pago' | 'cancelada'
/** Un renglón como quedó guardado: con lo que necesita el ticket. */
export type RenglonGuardado = { product_id: number; size_id: number; cantidad: number; precio: number; importe?: number; nombre: string | null; talle: string | null }
export type PagoGuardado = { cuenta: number; base: number; rebaja?: number; porcentaje: number; descuento: number; redondeo: number; monto: number }
export type Venta = {
  id: string
  estado: EstadoVenta
  pagos: PagoGuardado[]
  subtotal: number
  total: number
  paga_con: number | null
  email: string | null
  gn_number: number | null
  /** Cómo quedó el ticket por mail: `encolado`, `ya estaba`, `sin automation`, `error: …`, o null. */
  ticket_mail?: string | null
  usuario: string | null
  intentos: number
  ultimo_error: string | null
  reintentable: boolean | null
  creada_en: string
  renglones?: RenglonGuardado[]
  /** Lo que tiene que llegar por transferencia; null si la venta ⛔ espera. */
  espera_monto?: number | null
  mp_pago_id?: string | null
  mp_cruce?: 'solo' | 'cajera' | null
}

async function leer<T>(r: Response, fallo: string): Promise<T> {
  const j = await r.json().catch(() => null)
  if (!r.ok) {
    const e = new Error((j && j.error) || fallo) as Error & { status?: number; datos?: unknown }
    e.status = r.status
    e.datos = j
    throw e
  }
  return j as T
}

const get = <T>(q: string, fallo: string) => apiFetch(`/api/datos?recurso=caja&store=zattia&${q}&nc=${Date.now()}`).then((r) => leer<T>(r, fallo))

const post = <T>(body: Record<string, unknown>, fallo: string) =>
  apiFetch('/api/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'caja', store: 'zattia', ...body }),
  }).then((r) => leer<T>(r, fallo))

export const leerConfig = () => get<Config>('action=config', 'No se pudo leer la configuración de la Caja.')
export const leerCuentas = () => get<{ cuentas: CuentaGN[] }>('action=referencias', 'No se pudieron leer las cuentas de cobro.')
export const buscarProducto = (codigo: string) => get<Producto>(`action=producto&codigo=${encodeURIComponent(codigo)}`, 'No se pudo buscar la prenda.')
/** La lista mientras se escribe: con stock en el local, y aparte las que ⛔ tienen (el botón «Mostrar sin stock»). */
export type ListaNombre = { conStock: Candidato[]; sinStock: Candidato[]; masCon: number; masSin: number }
export const buscarNombre = (q: string) => get<ListaNombre>(`action=buscar&q=${encodeURIComponent(q)}`, 'No se pudo buscar la prenda.')
export const elegirVariante = (v: Variante) =>
  get<Producto>(`action=producto&product_id=${v.product_id}&size_id=${v.size_id}`, 'No se pudo traer la prenda.')
export const leerPendientes = () => get<{ ventas: Venta[] }>('action=pendientes', 'No se pudieron leer las ventas pendientes.')

/** Un pedido de Tienda Nube por empaquetar (v2, W1). `sinPagar`: «a convenir», paga al retirar. `horas` desde que se pagó (o se hizo). */
export type PedidoWeb = {
  numero: number
  sinPagar: boolean
  desde: string | null
  horas: number | null
  envioTipo: string | null
  envio: string | null
  prendas: Array<{ sku: string; nombre: string; cantidad: number }>
  sinSku: number
}
/** `porSku`: qué pedidos llevan cada variante. `noLeidas`: órdenes del rango que TN ⛔ devolvió. `guardada`: la del aparato, mientras llega la nueva. */
export type PedidosWeb = { pedidos: PedidoWeb[]; porSku: Record<string, Array<{ numero: number; cantidad: number; sinPagar: boolean }>>; noLeidas: number; leidoEn: string; guardada?: boolean }
export const leerPedidosWeb = () => get<PedidosWeb>('action=pedidos-web', 'No se pudieron leer los pedidos web.')

export type ItemConfirmar = { product_id: number; size_id: number; cantidad: number; precio: number; rebaja?: Rebaja | null; nombre?: string; talle?: string; foto?: string | null }
export type PagoConfirmar = { cuenta: number; base?: number }

/** `reintentable` sólo importa si la venta quedó en `error`. */
export type Resultado = { venta: Venta; reintentable?: boolean }

export const confirmarVenta = (v: { id: string; items: ItemConfirmar[]; pagos: PagoConfirmar[]; total: number; descuentoVenta: Rebaja | null; email: string | null; pagaCon: number | null }) =>
  post<Resultado>({ action: 'confirmar', ...v }, 'No se pudo confirmar la venta.')

/** Un pago de MP que puede ser el de la venta. ⛔ Trae datos de quien pagó. */
export type PagoMP = { id: string; monto: number; cuando: string; origen: 'mp' | 'banco' | 'tarjeta' | 'otro' }
export type Cruce =
  | { estado: 'esperando' }
  | { estado: 'llego'; por: 'solo' | 'cajera'; pago: PagoMP }
  | { estado: 'elegir'; candidatos: PagoMP[]; motivo: string }
  | { estado: 'invalido' | 'sin_cuenta'; motivo: string }
  | { estado: 'ya' | 'cancelada' }

/** ¿Llegó la transferencia? Con `pago`, la cajera eligió cuál es. Si llegó, la venta ya salió a GN. */
export const cruzarVenta = (id: string, pago?: string) =>
  post<Resultado & { cruce: Cruce }>({ action: 'cruzar', id, ...(pago ? { pago } : {}) }, 'No se pudo mirar Mercado Pago.')

export const cancelarVenta = (id: string) => post<{ venta: Venta }>({ action: 'cancelar', id }, 'No se pudo cancelar la venta.')

export const reintentarVenta = (id: string) => post<Resultado>({ action: 'reintentar', id }, 'No se pudo reintentar la venta.')

export const guardarPolitica = (texto: string) => post<{ politica_cambio: string | null }>({ action: 'politica', texto }, 'No se pudo guardar la política de cambio.')

/** Sólo admin: a qué cuenta van las transferencias y el modo feria (bajadas de línea). */
export const guardarBajadas = (b: { transferenciaA?: number; feria?: boolean }) =>
  post<{ reglas: Reglas }>({ action: 'bajadas', ...b }, 'No se pudo guardar.')
