/**
 * Caja, del lado del navegador (`/api/datos?recurso=caja`).
 *
 * El dinero lo calcula `lib/caja/core.core.js` en las DOS puntas: la pantalla para mostrarlo y el
 * servidor otra vez al confirmar. Acá ⛔ hay reglas: sólo el camino a la API y sus tipos.
 */

import { apiFetch } from '@/lib/api-fetch'

export type ReglaCuenta = { nombre: string; descuento: number; efectivo?: boolean }
export type Reglas = { redondeo: number; cuentas: Record<number, ReglaCuenta> }
export type Config = { reglas: Reglas; politica_cambio: string | null }

/** Una cuenta de cobro de GN. `regla` en null ⇒ la Caja ⛔ la cobra (sin %, o con recargo). */
export type CuentaGN = { id: number; nombre: string; regla: ReglaCuenta | null }

export type Variante = { product_id: number; size_id: number; product_name: string; size_name: string; sku: string | null; barcode: string | null }
/** `vivo` = leído de GN recién; `espejo` = el de anoche, porque GN ⛔ contestó (`motivo`). */
export type Stock = { local: number; deposito: number; fuente: 'vivo' | 'espejo'; motivo?: string }
export type Producto = { variante: Variante; stock: Stock } | { candidatos: Variante[] }

export type EstadoVenta = 'borrador' | 'enviando' | 'en_gn' | 'error'
export type PagoGuardado = { cuenta: number; base: number; porcentaje: number; descuento: number; redondeo: number; monto: number }
export type Venta = {
  id: string
  estado: EstadoVenta
  pagos: PagoGuardado[]
  subtotal: number
  total: number
  paga_con: number | null
  email: string | null
  gn_number: number | null
  usuario: string | null
  intentos: number
  ultimo_error: string | null
  reintentable: boolean | null
  creada_en: string
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
export const buscarProducto = (codigo: string) => get<Producto>(`action=producto&codigo=${encodeURIComponent(codigo)}`, 'No se pudo buscar el código.')
export const leerPendientes = () => get<{ ventas: Venta[] }>('action=pendientes', 'No se pudieron leer las ventas pendientes.')

export type ItemConfirmar = { product_id: number; size_id: number; cantidad: number; precio: number }
export type PagoConfirmar = { cuenta: number; base?: number }

/** `reintentable` sólo importa si la venta quedó en `error`. */
export type Resultado = { venta: Venta; reintentable?: boolean }

export const confirmarVenta = (v: { id: string; items: ItemConfirmar[]; pagos: PagoConfirmar[]; total: number; email: string | null; pagaCon: number | null }) =>
  post<Resultado>({ action: 'confirmar', ...v }, 'No se pudo confirmar la venta.')

export const reintentarVenta = (id: string) => post<Resultado>({ action: 'reintentar', id }, 'No se pudo reintentar la venta.')

export const guardarPolitica = (texto: string) => post<{ politica_cambio: string | null }>({ action: 'politica', texto }, 'No se pudo guardar la política de cambio.')
