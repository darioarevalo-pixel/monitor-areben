/**
 * Tipos del depósito de fallas (tabla fallas_deposito, ver sql/migrate-fallas.sql).
 * Ledger interno valorizado de prendas con falla: no toca stock oficial ni GN/TN.
 */

import type { Marca } from '@/lib/nav.generated'

export type FallaEstado = 'en_deposito' | 'vendida_feria' | 'descartada'

/** Un evento del historial de una falla (alta y cada cambio de estado). */
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
  cantidad: number
  motivo?: string | null
  valuacion_costo?: number | null
  valuacion_pvp_feria?: number | null
  estado: FallaEstado
  usuario?: string | null
  historial?: FallaEvento[]
  created_at?: string
  updated_at?: string
}

/** Campos que el usuario carga/edita (el resto lo pone el backend). */
export type FallaInput = {
  producto: string
  sku?: string | null
  cantidad?: number
  motivo?: string | null
  valuacion_costo?: number | null
  valuacion_pvp_feria?: number | null
}

export const ESTADO_LABEL: Record<FallaEstado, string> = {
  en_deposito: 'En depósito',
  vendida_feria: 'Vendida en feria',
  descartada: 'Descartada',
}
