/**
 * El tótem verificador de precios (`/pos/totem`, rediseño fase 4 = V2 del plan v3): la clienta escanea
 * una prenda y ve el precio de lista, el precio en efectivo y los talles que hay en el local.
 *
 * # 🔑 El precio en efectivo sale del MISMO cobro que la Caja
 *
 * ⛔ «precio × (1 − 15 %)» a mano: es `cobro()` del núcleo con los pagos de `pagosDeMedio('efectivo')`,
 * o sea con el % de la cuenta, el redondeo y la traba de feria (una prenda de feria va a la cuenta de
 * feria, sin descuento: su precio es final). Si el tótem dijera otro número que la caja, la clienta
 * llega al mostrador con un precio que no es.
 */

import { cobro, idsDeFeria, pagosDeMedio, renglones } from '@/lib/caja/core.core.js'
import type { Reglas } from '@/lib/caja/cliente'

export type PrecioTotem =
  | { feria: true; lista: number; final: number }
  | { feria: false; lista: number; efectivo: number; ahorro: number }

/** El precio de una prenda para el tótem; `null` si no tiene precio o la Caja no tiene formas de pago. */
export function precioTotem(a: { product_id: number; size_id: number; precio: number | null; reglas: Reglas | null }): PrecioTotem | null {
  if (a.precio == null || !(a.precio > 0) || !a.reglas?.medios) return null
  const filas = renglones([{ product_id: a.product_id, size_id: a.size_id, cantidad: 1, precio: a.precio }])
  const pagos = pagosDeMedio('efectivo', { filas, reglas: a.reglas, total: a.precio, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false })
  const total = cobro({ filas, pagos, reglas: a.reglas, descuentoVenta: null }).total
  if (idsDeFeria(a.reglas).has(a.product_id)) return { feria: true, lista: a.precio, final: total }
  return { feria: false, lista: a.precio, efectivo: total, ahorro: Math.round((a.precio - total) * 100) / 100 }
}

/** Los talles del producto en el local (stock de anoche): sin repetir, en el orden de la lista. */
export function tallesDelLocal(variantes: { size_name: string; local?: number }[]): { talle: string; hay: boolean }[] {
  const m = new Map<string, boolean>()
  for (const v of variantes) {
    const t = (v.size_name || '').trim()
    if (!t) continue
    m.set(t, (m.get(t) ?? false) || (v.local ?? 0) > 0)
  }
  return [...m].map(([talle, hay]) => ({ talle, hay }))
}

/** Cuánto queda a la vista una prenda escaneada antes de volver a «Escaneá una prenda». */
export const TOTEM_MS = { encontrada: 10_000, noEncontrada: 5_000 } as const
