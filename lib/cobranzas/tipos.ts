/**
 * Cobranzas — la cara tipada. La regla vive en `lib/cobranzas/core.core.js` (JS plano, porque la
 * usa `api/_cobranzas.js`).
 */

import {
  ESTADOS as ESTADOS_JS,
  MEDIOS as MEDIOS_JS,
  diasDesde as diasDesdeJs,
  esPagoManual as esPagoManualJs,
  estadoDeCobro as estadoJs,
  filasDeCobranzas as filasJs,
  lineaDeNota as lineaJs,
  validarCobro as validarJs,
} from './core.core.js'

export type EstadoCobro = 'pendiente' | 'falta-tn' | 'revisar' | 'cerrado'
export type Medio = 'transferencia' | 'efectivo'
/** Cómo quedó la línea en la nota interna de la orden de TN. */
export type NotaTn = 'pendiente' | 'ok' | 'sin-verificar' | 'sin-permiso' | 'error'

/** Una orden de TN tal como la manda el catálogo (`?cobros=1`, `mapOrdenTN`). */
export interface OrdenCobro {
  id: number
  number: number
  cliente: string | null
  total: string | number
  fecha: string | null
  pago_gateway: string | null
  pago_metodo: string | null
  estado_pago: string | null
  estado_orden: string | null
  pagado_en: string | null
}

/** Una fila de `tn_cobros`. */
export interface Cobro {
  id: string
  store: string
  order_id: string
  numero: string
  monto: number | string
  medio: Medio
  operacion: string | null
  quien: string | null
  cuando: string
  nota_tn: NotaTn
  anulado_en: string | null
  anulado_por: string | null
}

export interface FilaCobranza {
  orden: OrdenCobro
  cobro: Cobro | null
  estado: EstadoCobro
  /** Pagada en TN sin que nadie la cobrara en el Monitor (la marcaron directo en el admin). */
  sinCobro: boolean
}

export const ESTADOS = ESTADOS_JS as EstadoCobro[]
export const MEDIOS = MEDIOS_JS as Medio[]
export const esPagoManual = esPagoManualJs as (o: OrdenCobro | null | undefined) => boolean
export const estadoDeCobro = estadoJs as (o: OrdenCobro, c: Cobro | null) => EstadoCobro | null
export const filasDeCobranzas = filasJs as (
  ordenes: OrdenCobro[],
  cobros: Cobro[],
) => { filas: FilaCobranza[]; cuenta: Record<EstadoCobro, number> }
export const validarCobro = validarJs as (c: Partial<Cobro> & { order_id?: string }) => string | null
export const lineaDeNota = lineaJs as (c: Cobro, o?: { anulado?: boolean }) => string
export const diasDesde = diasDesdeJs as (iso: string | null | undefined, ahora?: Date) => number | null
