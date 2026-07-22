/**
 * Tipos de Cambios (tabla `cambios`, ver sql/migrate-cambios.sql). Local inicia + Admin motor.
 * El reingreso del producto devuelto es MANUAL (GN no acepta venta negativa por API): se traza como
 * `reingreso_estado='pendiente'` hasta que el admin lo carga a mano en GN.
 */

import type { Marca } from '@/lib/nav.generated'

export type CambioEstado = 'iniciado' | 'confirmado' | 'en_transito' | 'recibido' | 'cerrado' | 'anulado'
// Cambios SOLO por envío (el físico se resuelve presencial sin tool). El quilombo es el envío.
export type CambioVia = 'andreani' | 'correo' | 'cadete'
export type DiferenciaEstado = 'parejo' | 'a_cobrar' | 'a_devolver' | 'saldado'
export type ReingresoEstado = 'pendiente' | 'hecho'

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
  gn_venta_ida_id?: string | null
  gn_venta_ida_number?: string | null
  usuario?: string | null
  historial?: CambioEvento[]
  created_at?: string
  updated_at?: string
}

/** Lo que carga el Local al iniciar el cambio. */
export type CambioInput = {
  orden_tn?: string | null
  cliente?: string | null
  via?: CambioVia
  items_devueltos: CambioItem[]
  items_nuevos: CambioItem[]
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
  iniciado: 'Iniciado',
  confirmado: 'Confirmado',
  en_transito: 'En tránsito',
  recibido: 'Recibido',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
}
export const VIA_LABEL: Record<CambioVia, string> = { andreani: 'Andreani', correo: 'Correo', cadete: 'Cadete' }

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
