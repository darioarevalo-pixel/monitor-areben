/**
 * Cuántas prendas de cada renglón del armado son de un pedido web y van a la bolsa (Bruno y Darío,
 * 1-nov-2026, al sumar el Depósito a Tienda Nube). Puro.
 *
 * 🔑 **La regla son las DOS cosas, y manda la menor**: el Local en negativo (lo que el depósito le debe
 * al local) y un pedido sin armar que lleve la prenda.
 * - Pedido con stock en el Local: se saca de ahí, no va nada a la bolsa.
 * - Negativo sin pedido (error de stock, venta de la Caja): va al perchero, la bolsa quedaría sin dueño.
 *
 * 🔴 **El cruce es por SKU, y en Zattia hay SKU repetidos**: el corpiño y la bombacha Tayra de un color
 * y talle comparten el suyo (medido el 1-nov: 17 SKU). Con un SKU repetido el nombre y el talle
 * desempatan; si no coinciden, no hay alerta: mejor perchero que la prenda de otro pedido en la bolsa.
 */

import type { RepoItem } from './tipos'

/** Una prenda de un pedido sin armar, como la manda `action=pedidos-web` de `repo-armado`. */
export type PrendaPedido = { sku: string; nombre: string; cantidad: number }

type Variante = Pick<RepoItem, 'vid' | 'sku' | 'name' | 'size' | 'local'>

const clave = (sku: string | null | undefined) => String(sku ?? '').trim().toUpperCase()
const plano = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** TN nombra la línea «CORPIÑO TAYRA - VIOLETA (S)»: producto y, entre paréntesis, la variante. */
function esLaMismaPrenda(v: Pick<Variante, 'name' | 'size'>, nombre: string): boolean {
  const n = plano(nombre)
  const producto = plano(v.name)
  if (!n.startsWith(producto)) return false
  const variante = n.slice(producto.length)
  return plano(v.size)
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .every((palabra) => variante.split(/[^A-Z0-9]+/).includes(palabra))
}

/** `{ vid: unidades de esa variante en pedidos sin armar }`. `todas` es el inventario de la línea, para ver qué SKU se repiten. */
export function unidadesEnPedidos(todas: Variante[], prendas: PrendaPedido[]): Record<string, number> {
  const porSku = new Map<string, Variante[]>()
  for (const v of todas) {
    const k = clave(v.sku)
    if (k) porSku.set(k, [...(porSku.get(k) ?? []), v])
  }
  const out: Record<string, number> = {}
  for (const p of prendas) {
    const candidatas = porSku.get(clave(p.sku))
    if (!candidatas) continue
    const v = candidatas.length === 1 ? candidatas[0] : candidatas.find((c) => esLaMismaPrenda(c, p.nombre))
    if (v) out[v.vid] = (out[v.vid] || 0) + p.cantidad
  }
  return out
}

/** La menor entre lo que debe el Local y lo que hay en pedidos, sin pasarse de lo que se lleva. */
export function paraPedidoDe(local: number, enPedidos: number, cant: number): number {
  return Math.max(0, Math.min(-local, enPedidos, cant))
}
