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

/**
 * `conTransferencia`: el MISMO cobro por transferencia da el mismo total ⇒ el rótulo dice «En efectivo o
 * transferencia». Se pregunta al núcleo, ⛔ se supone: con las reglas iniciales efectivo es 15 % y
 * transferencia 10 %, y decir «o transferencia» ahí sería prometer un precio que la caja ⛔ cobra.
 */
export type PrecioTotem =
  | { feria: true; lista: number; final: number }
  | { feria: false; lista: number; efectivo: number; ahorro: number; conTransferencia: boolean }

/** El precio de una prenda para el tótem; `null` si no tiene precio o la Caja no tiene formas de pago. */
export function precioTotem(a: { product_id: number; size_id: number; precio: number | null; reglas: Reglas | null }): PrecioTotem | null {
  if (a.precio == null || !(a.precio > 0) || !a.reglas?.medios) return null
  const filas = renglones([{ product_id: a.product_id, size_id: a.size_id, cantidad: 1, precio: a.precio }])
  const reglas = a.reglas
  const precio = a.precio
  const totalCon = (medio: 'efectivo' | 'transferencia') => {
    const pagos = pagosDeMedio(medio, { filas, reglas, total: precio, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false })
    return cobro({ filas, pagos, reglas, descuentoVenta: null }).total
  }
  const total = totalCon('efectivo')
  if (idsDeFeria(reglas).has(a.product_id)) return { feria: true, lista: a.precio, final: total }
  let transferencia: number | null = null
  try {
    transferencia = totalCon('transferencia')
  } catch {
    /* sin cuenta de transferencia configurada: el rótulo dice sólo «En efectivo» */
  }
  return { feria: false, lista: a.precio, efectivo: total, ahorro: Math.round((a.precio - total) * 100) / 100, conTransferencia: transferencia === total }
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

/**
 * Los colores del producto escaneado, del audit de Tienda Nube: el producto es el que tiene una variante
 * con el SKU escaneado (TN y GN usan el mismo). Cada color con la foto de su primera variante con foto
 * (TN ⛔ trae el hex del color: es un nombre libre, «CHOCOLATE»). `foto` = la del color escaneado.
 */
export function coloresDelProducto(
  ps: { variantes?: { sku?: string | null; image_url?: string | null; color?: string | null }[] }[],
  sku: string | null,
): { colores: { nombre: string; foto: string | null }[]; actual: string | null; foto: string | null } {
  const k = sku?.toLowerCase().trim()
  const nada = { colores: [], actual: null, foto: null }
  if (!k) return nada
  for (const p of ps) {
    const vs = p.variantes ?? []
    const propia = vs.find((v) => v.sku?.toLowerCase().trim() === k)
    if (!propia) continue
    const m = new Map<string, string | null>()
    for (const v of vs) {
      const c = v.color?.trim()
      if (!c) continue
      if (!m.get(c)) m.set(c, v.image_url || null)
    }
    return { colores: [...m].map(([nombre, foto]) => ({ nombre, foto })), actual: propia.color?.trim() || null, foto: propia.image_url || null }
  }
  return nada
}

/** Cuánto queda a la vista una prenda escaneada antes de volver a «Escaneá una prenda». */
export const TOTEM_MS = { encontrada: 10_000, noEncontrada: 5_000 } as const
