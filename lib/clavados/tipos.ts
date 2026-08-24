/**
 * La cara TypeScript de `lib/clavados/core.js`.
 *
 * El core es `.js` plano porque lo importan `api/_clavados.js` y `api/_memo.js`, que corren en Node
 * sin pasar por el compilador de Next. Acá se le pone tipo una sola vez.
 */

import {
  capitalParado as capitalParadoJs,
  renglonClavado as renglonClavadoJs,
  resumirClavados as resumirClavadosJs,
} from './core.js'

/** Una fila de la tabla `clavados`, ya cruzada con el espejo por el handler. */
export type Clavado = {
  id: string
  store: string
  producto_id: number
  sku: string | null
  nombre: string | null
  marcado_en: string
  marcado_por: string | null
  /** ⚠️ Cuándo el sistema **vio** el cero, ⛔ nunca cuándo llegó a cero: nadie guarda historial. */
  visto_en_cero: string | null
  nota: string | null
  stock: number
  /** `null` cuando el sync no lo pudo leer. ⛔ No es 0 — ver `capitalParado`. */
  unit_cost: number | null
}

/** El renglón que dibuja el memo: cuánto volvió en el rango y cuánto sigue parado. */
export type RenglonClavado = {
  producto_id: string
  sku: string | null
  nombre: string | null
  marcado_en: string | null
  agotado: boolean
  stock: number
  unidades: number
  /** Mercadería del rango. ⛔ No lleva descuento ni envío: son de la venta, no del producto. */
  recuperado: number
  /** `null` = no medible (sin costo, o con costo 0). ⛔ Nunca 0 por defecto. */
  parado: number | null
  pct: number | null
  store?: string
  /** Mercadería del mes que contiene el fin de la semana. */
  mes?: number
  mesIni?: string
}

export type ResumenClavados = {
  productos: number
  agotados: number
  recuperado: number
  parado: number
  /** Cuántos productos no tienen costo legible. El `parado` de arriba **no los incluye**. */
  sinCosto: number
  pct: number | null
}

export const capitalParado = capitalParadoJs as (a: { stock: number; costo: number | null }) => number | null
export const renglonClavado = renglonClavadoJs as (a: {
  clavado: { producto_id: number | string; sku?: string | null; nombre?: string | null; marcado_en?: string | null }
  venta?: { mercaderia: number; unidades: number }
  stock: number
  costo: number | null
}) => RenglonClavado
export const resumirClavados = resumirClavadosJs as (r: RenglonClavado[] | undefined) => ResumenClavados
