/**
 * Caja — EL PRECIO DE UNA PRENDA, según su línea (Bruno, 16-oct-2026).
 *
 * 🔑 **Zattia**: el de la etiqueta (`construirPrecios`: su Tienda Nube con la oferta vigente, si no
 * `retailer_price`), y la prenda de feria al precio de SU campaña de Liquidación (`precioDeFeria`).
 *
 * 🔑 **Stunned: SÓLO su Tienda Nube** (store 7516263, ⛔ la de Zattia), con la oferta vigente. ⛔ la lista
 * de GN, ⛔ la feria. Sin la prenda en su tienda ⇒ sin precio: el renglón pide que se escriba.
 *
 * 🔴 Por qué existe (16-oct): el POS le pasaba a Stunned el índice de ZATTIA ⇒ `matchTn` ⛔ enganchaba y
 * caía a `retailer_price`. La REMERA S-MAIL GREY se cobraba $31.490 con la etiqueta en $22.090: 25 de
 * los 40 productos de Stunned tienen oferta en su tienda. Es el mismo pozo que `useTnImages.ts` cuenta
 * para Márgenes (23-ago).
 */
import { construirPrecios } from '@/lib/etiquetas/core'
import { esStunned } from '@/lib/lineas'
import { ofertaVigente } from '@/lib/tienda'
import { imagenDe, matchTn, type IndiceTn } from '@/lib/tn'
import { precioDeFeria } from './core.core.js'

type ProductoCaja = Parameters<typeof construirPrecios>[0][number]

/** `oferta`: la prenda de Stunned está en oferta en su tienda ⇒ paga la oferta de su línea (`PCT_OFERTA_DE_LINEA`, 26-oct). */
export type PrecioDeCaja = { precio: number | null; fueraDeTn: boolean; foto: string | null; categorias: string[]; oferta: boolean }

/**
 * ¿La prenda es de Stunned? Sólo en Zattia (en BDI el prefijo `STU` ⛔ significa nada). Mira el SKU del
 * producto y, si viene, el de la variante: hay productos de GN sin SKU propio.
 */
export const esDeStunned = (store: string, producto: { sku?: string | null }, skuVariante?: string | null): boolean =>
  store === 'zattia' && (esStunned(producto.sku) || esStunned(skuVariante))

/**
 * El precio, la foto y las categorías de Tienda Nube de una prenda en la Caja. `idx` es el índice de la
 * marca, `idxStunned` el de la tienda de Stunned (null mientras carga, como `idx`).
 */
export function precioDeCaja(
  producto: ProductoCaja,
  o: { store: string; skuVariante?: string | null; idx: IndiceTn; idxStunned: IndiceTn | null; reglas: Parameters<typeof precioDeFeria>[0] },
): PrecioDeCaja {
  if (esDeStunned(o.store, producto, o.skuVariante)) {
    if (!o.idxStunned) return { precio: null, fueraDeTn: false, foto: null, categorias: [], oferta: false }
    const tn = matchTn(producto, o.idxStunned)
    const vigente = ofertaVigente(tn?.price, tn?.promo_price)
    const precio = vigente.aCobrar
    return { precio: precio && precio > 0 ? precio : null, fueraDeTn: false, foto: imagenDe(producto, o.idxStunned), categorias: tn?.categories ?? [], oferta: vigente.enOferta }
  }
  const { precios, fueraDeTn } = construirPrecios([producto], o.idx)
  // 🔑 La prenda de feria va al precio de SU campaña (13-oct): el de TN puede ser el de la «Feria Online».
  const precio = precioDeFeria(o.reglas, Number(producto.id)) ?? (precios[producto.id] || null)
  return { precio, fueraDeTn: fueraDeTn.has(producto.id), foto: imagenDe(producto, o.idx), categorias: matchTn(producto, o.idx)?.categories ?? [], oferta: false }
}
