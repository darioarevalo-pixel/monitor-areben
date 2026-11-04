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

import { cobro, idsDeFeria, pagosDeMedio, precioDeFeria, renglones } from '@/lib/caja/core.core.js'
import { aplicarPromos } from '@/lib/caja/promos.core.js'
import { talleVisible } from '@/lib/caja/ticket-mail.core.js'
import { porTalle } from '@/lib/caja/buscar.core.js'
import { normCode } from '@/lib/caja/gn.core.js'
import type { Candidato, Reglas, Variante } from '@/lib/caja/cliente'

/**
 * `conTransferencia`: el MISMO cobro por transferencia da el mismo total ⇒ el rótulo dice «En efectivo o
 * transferencia». Se pregunta al núcleo, ⛔ se supone: con las reglas iniciales efectivo es 15 % y
 * transferencia 10 %, y decir «o transferencia» ahí sería prometer un precio que la caja ⛔ cobra.
 */
/** `promo`: el nombre de la promo del local que le toca a la prenda sola (W5), o null. */
export type PrecioTotem =
  | { feria: true; lista: number; final: number }
  | { feria: false; lista: number; efectivo: number; /** `null`: sin cuenta de transferencia configurada. */ transferencia: number | null; ahorro: number; conTransferencia: boolean; promo: string | null }

/**
 * El precio de una prenda para el tótem; `null` si no tiene precio o la Caja no tiene formas de pago.
 * 🔑 Robustez (auditoría, 11-oct): con las PROMOS del local, como el POS (`aplicarPromos`, el MISMO núcleo):
 * antes el tótem decía un precio más alto que el que cobraba la caja. `hoy` y `categorias` (las de Tienda
 * Nube) son los mismos datos que usa el POS.
 */
export function precioTotem(a: { product_id: number; size_id: number; precio: number | null; reglas: Reglas | null; hoy: string; categorias: string[] }): PrecioTotem | null {
  if (!a.reglas?.medios) return null
  const reglas = a.reglas
  // La prenda de feria, al precio de SU campaña, como en el POS (13-oct).
  const precio = precioDeFeria(reglas, a.product_id) ?? a.precio
  if (precio == null || !(precio > 0)) return null
  const conPromo = aplicarPromos({ items: [{ product_id: a.product_id, size_id: a.size_id, cantidad: 1, precio, categorias: a.categorias }], promos: reglas.promos, feriaIds: idsDeFeria(reglas), hoy: a.hoy })
  const filas = renglones(conPromo.items)
  const descuentoVenta = conPromo.venta ? { tipo: 'pesos' as const, valor: conPromo.venta.pesos, sinFeria: true } : null
  const nombres = [...(conPromo.items[0].promos ?? []), ...(conPromo.venta ? [conPromo.venta.nombre] : [])]
  const totalCon = (medio: 'efectivo' | 'transferencia') => {
    const pagos = pagosDeMedio(medio, { filas, reglas, total: precio, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false })
    return cobro({ filas, pagos, reglas, descuentoVenta }).total
  }
  const total = totalCon('efectivo')
  if (idsDeFeria(reglas).has(a.product_id)) return { feria: true, lista: precio, final: total }
  let transferencia: number | null = null
  try {
    transferencia = totalCon('transferencia')
  } catch {
    /* sin cuenta de transferencia configurada: el rótulo dice sólo «En efectivo» */
  }
  return { feria: false, lista: precio, efectivo: total, transferencia, ahorro: Math.round((precio - total) * 100) / 100, conTransferencia: transferencia === total, promo: nombres.length ? nombres.join(' + ') : null }
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
  ps: { imagenes?: { src: string }[]; variantes?: { sku?: string | null; image_url?: string | null; color?: string | null }[] }[],
  sku: string | null,
): { colores: { nombre: string; foto: string | null }[]; actual: string | null; foto: string | null; fotos: string[] } {
  const k = sku?.toLowerCase().trim()
  const nada = { colores: [], actual: null, foto: null, fotos: [] }
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
    return { colores: [...m].map(([nombre, foto]) => ({ nombre, foto })), actual: propia.color?.trim() || null, foto: propia.image_url || null, fotos: (p.imagenes ?? []).map((i) => i.src).filter(Boolean) }
  }
  return nada
}

const ES_TALLE = /^(XXS|XS|S|M|L|XL|XXL|XXXL|U|UNICO|ÚNICO|TU|T\.U\.|\d{1,3}|[SMLX]+\/[SMLX]+)$/i

/** `hay: null`: sin el stock del local (la lista por nombre ⛔ contestó): se muestra el color, ⛔ se afirma si hay. */
export type ColorTotem = { nombre: string; foto: string | null; hay: boolean | null }

/**
 * Colores y talles para la ficha. 🔴 En Zattia la variante de Gestión Nube suele SER el color (`size_name`
 * «NEGRO»: 257 de 383 productos medidos el 4-nov, y ninguno mezclaba colores con talles): ahí el stock va
 * en la fila de colores y ⛔ hay fila de talles. Si la variante es el talle, los colores salen de Tienda Nube.
 */
export function opcionesDelLocal(
  variantes: { size_name: string; local?: number }[],
  colores: { nombre: string; foto: string | null }[],
): { colores: ColorTotem[]; talles: { talle: string; hay: boolean }[] } {
  const delLocal = tallesDelLocal(variantes).filter((t) => talleVisible(t.talle))
  const sinStockDeColor = colores.map((c) => ({ ...c, hay: null }))
  if (!delLocal.length || delLocal.every((t) => ES_TALLE.test(t.talle))) return { colores: sinStockDeColor, talles: delLocal }
  const clave = (c: string) => c.trim().toLowerCase()
  const fotoDe = new Map(colores.map((c) => [clave(c.nombre), c.foto]))
  return { colores: delLocal.map((t) => ({ nombre: t.talle, foto: fotoDe.get(clave(t.talle)) ?? null, hay: t.hay })), talles: [] }
}

/** Una variante como la trae el monitor al cargar (`allVariantes`). */
type VarianteCargada = { pid: string; sid: string; name: string; size: string; local: number; sku: string; barcode: string }
export type IndiceTotem = { porBarcode: Map<string, Candidato[]>; porSku: Map<string, Candidato[]>; porProducto: Map<number, Candidato[]> }

/**
 * 🔑 El escaneo sin ir al servidor: las variantes ya están en el tótem, con el mismo stock del local que
 * contesta `action=buscar`. Las de cada producto, en el orden del servidor (`productosPorStock`).
 */
export function indiceDelTotem(variantes: VarianteCargada[]): IndiceTotem {
  const sumar = <K>(m: Map<K, Candidato[]>, k: K, v: Candidato) => {
    const lista = m.get(k)
    if (lista) lista.push(v)
    else m.set(k, [v])
  }
  const indice: IndiceTotem = { porBarcode: new Map(), porSku: new Map(), porProducto: new Map() }
  for (const x of variantes) {
    const v: Candidato = { product_id: Number(x.pid), size_id: Number(x.sid), product_name: x.name, size_name: x.size, sku: x.sku || null, barcode: x.barcode || null, local: x.local }
    if (x.barcode) sumar(indice.porBarcode, x.barcode, v)
    if (x.sku) sumar(indice.porSku, x.sku.trim().toLowerCase(), v)
    sumar(indice.porProducto, v.product_id, v)
  }
  for (const lista of indice.porProducto.values()) lista.sort(primeroLosDelLocal)
  return indice
}

/** Primero lo que hay en el local, como `productosPorStock`. */
export const primeroLosDelLocal = (a: Candidato, b: Candidato) => Number((b.local ?? 0) > 0) - Number((a.local ?? 0) > 0) || porTalle(a, b)

/**
 * La variante del código, en el orden de `variantesDelCodigo` (`api/_caja.js`): barcode y después SKU, tal cual
 * y normalizado. `null` si ⛔ está o lo comparten varias: ahí decide el servidor.
 */
export function varianteDelCodigo(indice: IndiceTotem, codigo: string): Variante | null {
  const crudo = codigo.trim()
  const nc = normCode(crudo)
  const lista = indice.porBarcode.get(crudo) ?? indice.porBarcode.get(nc) ?? indice.porSku.get(crudo.toLowerCase()) ?? indice.porSku.get(nc)
  return lista?.length === 1 ? lista[0] : null
}

/** El código de la tarjeta de la encargada: sólo letras, porque un lector con teclado en castellano cambia el guion. */
export const TARJETA_ENCARGADA = 'ENCARGADA'
export const esTarjetaEncargada = (codigo: string) => codigo.trim().toUpperCase() === TARJETA_ENCARGADA

/** Las fotos de la galería: primero la del color escaneado, después las del producto, sin repetir. */
export function fotosDeLaPrenda(...grupos: (string | null | undefined | (string | null | undefined)[])[]): string[] {
  const todas = grupos.flat().filter((f): f is string => !!f)
  return [...new Set(todas)]
}

/** Cuánto queda a la vista una prenda escaneada antes de volver a «Escaneá una prenda». */
export const TOTEM_MS = { encontrada: 10_000, noEncontrada: 5_000, encargada: 30_000, reintentoStock: 1_500 } as const
