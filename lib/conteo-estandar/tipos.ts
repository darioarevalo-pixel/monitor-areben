/**
 * Tipos del Conteo estándar del Local. Reusa la maquinaria del Conteo de Depósito,
 * pero: lee el LOCAL, separa líneas por SKU (STUNNED = empieza con STU), y cada
 * talle tiene DOS cargas que se SUMAN — exhibido (escaneo) + depósito (a mano). El
 * ajuste es `nuevo = vivo + dif` con `dif = (exhibido+deposito) − sistema`. Port de
 * index.html:12023-12402.
 */

import type { EstadoProd, FilaAjuste, ResumenAjuste } from '../conteo-deposito/tipos'

export type Linea = 'zattia' | 'stunned'

export type CeVariante = {
  vid: string
  sid: number | string
  size: string
  barcode?: string
  sku?: string
  inventory_id: number | string | null
  esperado: number
}
export type CeProducto = { pid: string; name: string; linea: Linea; variants: CeVariante[] }

export type CeEstadoProd = {
  estado: EstadoProd
  exhibido: Record<string, number>
  deposito: Record<string, number>
  snap: Record<string, number>
  dif: Record<string, number>
  terminadoAt?: number
}
export type CeState = Record<string, CeEstadoProd>

/** Fila del ajuste: la del depósito + el desglose exhibido/depósito (para el historial). */
export type CeFilaAjuste = FilaAjuste & { exhibido: number; deposito: number }

export type CeResumen = ResumenAjuste & { modo: 'estandar'; linea: Linea }

export type CePreview = {
  rows: CeFilaAjuste[]
  resumen: CeResumen
  missing: { prod: string; size: string }[]
  ubicacion: string
  store: string
}
