/**
 * La tienda pública de cada LÍNEA — la cara tipada. Stunned tiene tienda propia aunque comparta
 * la base de Zattia: por eso la clave acá es `Linea` y no `Marca`.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/tienda.core.js`**, en JS plano, porque `api/_atencion.js`
 * necesita el dominio de la tienda y los handlers de `api/*.js` no pueden importar TypeScript. El
 * porqué está en el docblock del core. Misma forma que `lib/permisos.ts` sobre `lib/permisos.core.js`.
 */

import type { Linea } from './lineas'
import {
  ADMIN_BASE as ADMIN_BASE_JS,
  adminBaseUrl as adminBaseUrlJs,
  linkProducto as linkProductoJs,
  ofertaVigente as ofertaVigenteJs,
  precioVigente as precioVigenteJs,
  TIENDA_BASE as TIENDA_BASE_JS,
  tiendaBaseUrl as tiendaBaseUrlJs,
} from './tienda.core.js'

export const TIENDA_BASE = TIENDA_BASE_JS as Record<Linea, string>
export const ADMIN_BASE = ADMIN_BASE_JS as Record<Linea, string>

/**
 * El dominio público de la tienda, sin barra al final.
 *
 * Con una `Linea` es total; con un `string` cualquiera puede ser `null` (ver el core: ya no cae a
 * BDI por descarte). Misma sobrecarga que `baseDeLinea`, y por la misma razón.
 */
export const tiendaBaseUrl = tiendaBaseUrlJs as { (linea: Linea): string; (linea: string): string | null }

/** El admin de Tienda Nube, hasta `/products`. */
export const adminBaseUrl = adminBaseUrlJs as { (linea: Linea): string; (linea: string): string | null }

/** El link público del producto, o `null` si no hay handle (nunca `/productos/undefined`). */
export const linkProducto = linkProductoJs as (linea: Linea, handle?: string | null) => string | null

/**
 * Lo que la tienda cobra hoy: la promo si existe. `null` es "sin precio", nunca cero.
 *
 * El índice abierto es a propósito: lo que le llega es un producto entero de `tiendanube-audit` —
 * de la vitrina, del buscador de Atención, del que sea— y sólo mira dos campos. Tiparlo cerrado
 * hacía que un literal con `id` y `name` no compilara.
 */
export const precioVigente = precioVigenteJs as (p: PrecioDe | null | undefined) => number | null

type PrecioDe = { price?: number | null; promo_price?: number | null; [otros: string]: unknown }

/** Lo que dice la etiqueta: un número solo, con el de lista al lado sólo si hay oferta de verdad. */
export interface OfertaVigente {
  /** El que paga el cliente. `null` es **no se sabe**, nunca cero. */
  aCobrar: number | null
  /** El de lista, para tacharlo. `null` si el producto no tiene uno válido. */
  lista: number | null
  /** Sólo si la promo es **menor** que la lista. */
  enOferta: boolean
  /** El descuento redondeado, o `null` si no hay oferta. */
  pct: number | null
}

/**
 * El precio de la etiqueta y del cartelito de góndola. Los argumentos van sueltos a propósito: los
 * dos llamadores nombran los campos distinto (`price`/`promo_price` en el audit de Tienda Nube,
 * `precio`/`promo` en el ítem de exhibición) y el que manda es el número, no la forma del objeto.
 */
export const ofertaVigente = ofertaVigenteJs as (
  precioLista: number | null | undefined,
  precioPromo: number | null | undefined,
) => OfertaVigente
