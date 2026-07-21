/**
 * Tipos del Conteo de Fundas de BDI (Local). 100% escaneo, agrupado por MODELO de
 * celular (el modelo es el talle/variante de la funda). Reusa la persistencia y el
 * Excel del Conteo de Depósito, y el vivo del Local. Un conteo = un modelo.
 */

import type { FilaAjuste, ResumenAjuste } from '../conteo-deposito/tipos'

/** Una variante de funda (aplanada del vivo del Local). */
export type FundaVar = {
  vid: string // product_id + '_' + size_id
  pid: string
  producto: string // product_name
  talle: string // size_name (incluye el modelo + color)
  modelo: string // matchModelo(talle) || talle crudo
  barcode?: string
  inventory_id: number | string | null
  esperado: number // available_quantity del vivo al traer el stock
}

/** Un modelo de celular con sus variantes de funda (a lo largo de varios productos). */
export type ModeloGrupo = { modelo: string; variants: FundaVar[] }

/** Conteo en progreso: vid → unidades escaneadas. Solo aparecen las escaneadas. */
export type FundasState = Record<string, number>

/** Una línea del registro del conteo (todo lo del modelo, no solo diferencias). */
export type LbDetalleConteo = {
  inventory_id: number | string | null
  barcode: string
  producto: string
  variante: string
  sistema: number | null
  contado: number | null
  diferencia: number
  vivo_aplicado: number | null
  nuevo_stock: number | null
}

/** Resumen del conteo de un modelo (se sella `modo` + `modelo` para separar el historial). */
export type LbResumen = ResumenAjuste & { modo: 'local-bdi'; modelo: string }

/** Lo que devuelve el cierre de un modelo. `rows` = solo diferencias (Excel); `registro` = todo. */
export type LbPreview = {
  modelo: string
  rows: FilaAjuste[]
  registro: LbDetalleConteo[]
  resumen: LbResumen
  missing: { prod: string; size: string }[]
  ubicacion: string
  store: string
}
