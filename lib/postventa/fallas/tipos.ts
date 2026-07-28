/**
 * Tipos del depósito de fallas (tabla fallas_deposito, ver sql/migrate-fallas.sql + migrate-fallas-2.sql).
 *
 * Flujo por roles: Local carga ('cargada', ubicación 'local'), Administración recibe ('recibida',
 * ubicación 'deposito') y confirma ('confirmada'). Después la unidad sigue su vida interna:
 * 'vendida_feria' | 'descartada'. NO vuelve al stock oficial.
 *
 * ⚠️ **La venta $0 en GN sale AL CARGAR la falla, no al confirmarla.** El stock hay que descontarlo
 * apenas se identifica la unidad fallada: si esperara a la confirmación, entre una cosa y la otra
 * GN seguiría ofreciendo para la venta algo que ya no se puede vender.
 *
 * **"Confirmar" valida el MOTIVO y los datos de la carga. No toca GN ni el stock.** Este docblock
 * decía lo contrario y describía un flujo que ya no existe.
 */

import type { Marca } from '@/lib/nav.datos'

// 'en_deposito' se conserva de la v1 (filas viejas). El flujo nuevo usa cargada→recibida→confirmada.
export type FallaEstado = 'cargada' | 'recibida' | 'confirmada' | 'en_deposito' | 'vendida_feria' | 'descartada'
export type FallaUbicacion = 'local' | 'deposito'

/** Un evento del historial de una falla (alta y cada transición). */
export type FallaEvento = {
  estado: FallaEstado
  at: string
  usuario?: string | null
  nota?: string | null
}

export type FallaRow = {
  id: number
  store: Marca
  sku?: string | null
  producto: string
  /** Talle/color de la unidad. Se guarda para que la etiqueta lo diga sin ir a buscarlo por SKU. */
  variante?: string | null
  cantidad: number
  motivo?: string | null
  valuacion_costo?: number | null
  valuacion_pvp_feria?: number | null
  precio_lista?: number | null // retailer_price de GN — la venta técnica se arma a este precio + 100% off
  estado: FallaEstado
  ubicacion?: FallaUbicacion | null
  // Link a la variante de GN (para descontar stock al confirmar):
  product_id?: string | null
  size_id?: string | null
  barcode?: string | null
  // Venta creada en GN al confirmar:
  gn_integration_id?: string | null
  gn_venta_id?: string | null
  gn_venta_number?: string | null
  usuario?: string | null
  historial?: FallaEvento[]
  created_at?: string
  updated_at?: string
}

/** Campos que carga el Local al dar de alta (el resto lo pone el motor de Administración). */
export type FallaInput = {
  producto: string
  sku?: string | null
  variante?: string | null
  cantidad?: number
  motivo?: string | null
  valuacion_costo?: number | null
  valuacion_pvp_feria?: number | null
  precio_lista?: number | null
  ubicacion?: FallaUbicacion
  // Del picker de artículo GN (si se cargó eligiendo un artículo):
  product_id?: string | null
  size_id?: string | null
}

export const ESTADO_LABEL: Record<FallaEstado, string> = {
  cargada: 'Pendiente de envío',
  recibida: 'Recibida (depósito)',
  confirmada: 'Confirmada',
  en_deposito: 'En depósito',
  vendida_feria: 'Vendida en feria',
  descartada: 'Descartada',
}

export const UBICACION_LABEL: Record<FallaUbicacion, string> = {
  local: 'Local',
  deposito: 'Depósito',
}
