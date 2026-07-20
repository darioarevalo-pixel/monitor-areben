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

/**
 * Una línea del REGISTRO del conteo (todo lo contado, no solo las diferencias).
 * Mismas claves que produce `detalleHistorial`, así el historial renderiza igual
 * las filas nuevas (balance completo) y las viejas (solo diferencias).
 */
export type CeDetalleConteo = {
  inventory_id: number | string | null
  barcode: string
  producto: string
  variante: string
  sistema: number | null
  exhibido: number
  deposito: number
  contado: number | null
  diferencia: number
  vivo_aplicado: number | null
  nuevo_stock: number | null
}

export type CeResumen = ResumenAjuste & { modo: 'estandar'; linea: Linea }

export type CePreview = {
  rows: CeFilaAjuste[]
  /** Todo lo contado (incluye talles sin diferencia y en 0). Se guarda como `detalle`. */
  registro: CeDetalleConteo[]
  resumen: CeResumen
  missing: { prod: string; size: string }[]
  ubicacion: string
  store: string
}
