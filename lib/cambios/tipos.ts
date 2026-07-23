/**
 * Tipos de Cambios (tabla `cambios`, ver sql/migrate-cambios.sql). Local inicia + Admin motor.
 * El reingreso del producto devuelto es MANUAL (GN no acepta venta negativa por API): se traza como
 * `reingreso_estado='pendiente'` hasta que el admin lo carga a mano en GN.
 */

import type { Marca } from '@/lib/nav.generated'

// El cambio nace como 'borrador' (solicitud incompleta) y se completa después. Al PROCESAR (pagado +
// envío confirmado) se genera la venta REAL en GN → 'confirmado' → 'en_transito' → 'recibido' → 'cerrado'.
export type CambioEstado = 'borrador' | 'iniciado' | 'confirmado' | 'en_transito' | 'recibido' | 'cerrado' | 'anulado'
// Cambios SOLO por envío (el físico se resuelve presencial sin tool). El quilombo es el envío.
export type CambioVia = 'andreani' | 'correo' | 'cadete'
export type DiferenciaEstado = 'parejo' | 'a_cobrar' | 'a_devolver' | 'saldado'
export type ReingresoEstado = 'pendiente' | 'hecho'
// Solo 2 formas (Bruno): tarjeta paga la diferencia completa; transferencia lleva 10% de descuento.
export type FormaPago = 'tarjeta' | 'transferencia'
export type EnvioPaga = 'nosotros' | 'cliente'
export type CobroEstado = 'no_aplica' | 'pendiente' | 'cobrado'

/** Una línea del cambio (producto devuelto o nuevo). */
export type CambioItem = {
  sku?: string | null
  product_id?: string | null
  size_id?: string | null
  producto: string
  precio?: number | null
  cantidad: number
}

export type CambioEvento = { estado: CambioEstado; at: string; usuario?: string | null; nota?: string | null }

export type CambioRow = {
  id: number
  store: Marca
  orden_tn?: string | null
  cliente?: string | null
  via: CambioVia
  estado: CambioEstado
  items_devueltos: CambioItem[]
  items_nuevos: CambioItem[]
  diferencia?: number | null
  diferencia_estado?: DiferenciaEstado | null
  reingreso_estado: ReingresoEstado
  seguimiento?: string | null
  gn_venta_ida_id?: string | null
  gn_venta_ida_number?: string | null
  // Fase B.4 — envío + forma de pago + venta real
  envio_costo?: number | null
  envio_paga?: EnvioPaga | null
  forma_pago?: FormaPago | null
  descuento_forma?: number | null
  pagado?: boolean | null
  cobro_estado?: CobroEstado | null
  total?: number | null
  gn_venta_id?: string | null
  gn_venta_number?: string | null
  usuario?: string | null
  historial?: CambioEvento[]
  created_at?: string
  updated_at?: string
}

/** Lo que carga el Local al iniciar el cambio (borrador; todo lo de B.4 es opcional y se completa después). */
export type CambioInput = {
  orden_tn?: string | null
  cliente?: string | null
  via?: CambioVia
  seguimiento?: string | null
  items_devueltos: CambioItem[]
  items_nuevos: CambioItem[]
  envio_costo?: number | null
  envio_paga?: EnvioPaga | null
  forma_pago?: FormaPago | null
  pagado?: boolean | null
}

// ── Orden de Tienda Nube (la lee bdi-catalogo, ver lib/cambios/cliente.ts) ──────────────
export type OrdenTNLinea = {
  product_id?: number | string | null
  variant_id?: number | string | null
  name?: string | null
  sku?: string | null
  quantity?: number | null
  price?: number | string | null
}
export type OrdenTN = {
  id?: number | string
  number?: number | string
  cliente?: string | null
  total?: number | string | null
  envio?: string | null // shipping_option / método
  fecha?: string | null // created_at (para la ventana de 30 días)
  products: OrdenTNLinea[]
}

export const ESTADO_LABEL: Record<CambioEstado, string> = {
  borrador: 'Borrador',
  iniciado: 'Iniciado',
  confirmado: 'Confirmado',
  en_transito: 'En tránsito',
  recibido: 'Recibido',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
}
export const VIA_LABEL: Record<CambioVia, string> = { andreani: 'Andreani', correo: 'Correo', cadete: 'Cadete' }

// Formas de pago: solo 2 (Bruno). El descuento aplica SOLO sobre la diferencia de productos, NO sobre el envío.
export const FORMA_PAGO_DEF: Record<FormaPago, { label: string; descuento: number }> = {
  tarjeta: { label: 'Tarjeta', descuento: 0 },
  transferencia: { label: 'Transferencia', descuento: 10 },
}

/** Días que el cliente tiene para cambiar desde la compra (regla del negocio). */
export const DIAS_CAMBIO = 30

/** Suma de una lista de ítems (precio × cantidad). */
export function sumarItems(its: CambioItem[]): number {
  return its.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 1), 0)
}

/** Diferencia = Σ(nuevos) − Σ(devueltos). Positiva = el cliente paga; negativa = se le devuelve. */
export function calcularDiferencia(devueltos: CambioItem[], nuevos: CambioItem[]): { diferencia: number; estado: DiferenciaEstado; totalDevueltos: number; totalNuevos: number } {
  const totalDevueltos = sumarItems(devueltos)
  const totalNuevos = sumarItems(nuevos)
  const diferencia = totalNuevos - totalDevueltos
  const estado: DiferenciaEstado = diferencia === 0 ? 'parejo' : diferencia > 0 ? 'a_cobrar' : 'a_devolver'
  return { diferencia, estado, totalDevueltos, totalNuevos }
}

/**
 * Total del cambio, desglosado (Fase B.4). El descuento por forma de pago aplica SOLO sobre la diferencia
 * de productos (nunca sobre el envío), y solo cuando hay diferencia a cobrar (>0). El envío se suma solo si
 * lo paga el cliente. `total = (diferencia − descuento) + envío_a_cobrar`.
 */
export function calcularTotalCambio(input: {
  devueltos: CambioItem[]
  nuevos: CambioItem[]
  forma?: FormaPago | null
  envioCosto?: number | null
  envioPaga?: EnvioPaga | null
}): { diferencia: number; estado: DiferenciaEstado; descuento: number; envioACobrar: number; total: number } {
  const { diferencia, estado } = calcularDiferencia(input.devueltos, input.nuevos)
  const pct = input.forma ? FORMA_PAGO_DEF[input.forma].descuento : 0
  // Solo descontamos sobre una diferencia a cobrar (positiva); si al cliente se le devuelve, no hay descuento.
  const descuento = diferencia > 0 ? Math.round((diferencia * pct) / 100) : 0
  const envioACobrar = input.envioPaga === 'cliente' ? Number(input.envioCosto) || 0 : 0
  const total = diferencia - descuento + envioACobrar
  return { diferencia, estado, descuento, envioACobrar, total }
}
