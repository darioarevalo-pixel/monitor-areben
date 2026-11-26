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
import { aplicarPromos, entra, promosVigentes } from '@/lib/caja/promos.core.js'
import { conjuntosConPieza, parteDe, type ConjuntoCaja } from '@/lib/caja/conjuntos.core.js'
import { talleVisible } from '@/lib/caja/ticket-mail.core.js'
import { porTalle } from '@/lib/caja/buscar.core.js'
import { normCode } from '@/lib/caja/gn.core.js'
import type { Candidato, Reglas, Variante } from '@/lib/caja/cliente'

/**
 * Las tres formas de pago van IGUALES (diseño aprobado por Bruno, 26-nov: ⛔ priorizar el efectivo): tarjeta en 3 cuotas sin
 * interés, transferencia y efectivo. Cada monto es el `cobro()` de la Caja con la cuenta de esa forma de pago; el % del chip sale
 * de comparar ese total con el de tarjeta, ⛔ de la regla escrita (una prenda de campaña puede pagar otro % en efectivo).
 * `null`: la Caja ⛔ tiene esa cuenta configurada.
 */
export type PagosTotem = {
  tarjeta: number | null
  /** Una de las 3 cuotas sin interés (Bruno, 26-nov). */
  cuota: number | null
  transferencia: number | null
  pctTransferencia: number | null
  efectivo: number
  pctEfectivo: number | null
}

/**
 * `precio`: lo que paga la prenda con las promos de la Caja (el precio grande). `antes`: el precio de antes, para tacharlo (la
 * lista de Tienda Nube cuando está en oferta, o el de la prenda antes de la promo de la Caja); `null` si ⛔ hay rebaja.
 * `promo`: el nombre de la promo del local que le toca a la prenda sola (W5), o null.
 */
export type PrecioTotem =
  | { feria: true; lista: number; final: number }
  | ({ feria: false; lista: number; precio: number; antes: number | null; pctOferta: number | null; promo: string | null } & PagosTotem)

const pctDe = (menor: number, mayor: number) => (mayor > 0 && menor < mayor ? Math.round((1 - menor / mayor) * 100) : null)
const CUOTAS = 3

/**
 * El precio de una prenda (o de UNA bikini) para el tótem; `null` si no tiene precio o la Caja no tiene formas de pago.
 * 🔑 Robustez (auditoría, 11-oct): con las PROMOS del local, como el POS (`aplicarPromos`, el MISMO núcleo).
 * 🩱 `bikini` (26-nov): se vende SÓLO la bikini completa ⇒ el precio es el de la bikini (el de Tienda Nube, con su oferta), con
 * sus partes marcadas como en la Caja: la promo la cuenta como UNA unidad. `antes` = la lista de TN de la prenda o de la bikini.
 */
export function precioTotem(a: { product_id: number; size_id: number; precio: number | null; antes?: number | null; reglas: Reglas | null; hoy: string; categorias: string[]; bikini?: ConjuntoCaja | null }): PrecioTotem | null {
  if (!a.reglas?.medios) return null
  const reglas = a.reglas
  const kit = a.bikini && a.bikini.piezas.length && a.bikini.precio > 0 ? a.bikini : null
  // La prenda de feria, al precio de SU campaña, como en el POS (13-oct).
  const precio = kit ? kit.precio : (precioDeFeria(reglas, a.product_id) ?? a.precio)
  if (precio == null || !(precio > 0)) return null
  const items = kit
    ? kit.piezas.map((p) => ({ product_id: p.product_id, size_id: p.size_id, cantidad: 1, precio: p.precio, categorias: a.categorias, conjunto: { variant_id: kit.variant_id, n: p.n } }))
    : [{ product_id: a.product_id, size_id: a.size_id, cantidad: 1, precio, categorias: a.categorias }]
  const conPromo = aplicarPromos({ items, promos: reglas.promos, feriaIds: idsDeFeria(reglas), hoy: a.hoy })
  const filas = renglones(conPromo.items)
  const descuentoVenta = conPromo.venta ? { tipo: 'pesos' as const, valor: conPromo.venta.pesos, sinFeria: true } : null
  const nombres = [...new Set([...conPromo.items.flatMap((it: { promos?: string[] }) => it.promos ?? []), ...(conPromo.venta ? [conPromo.venta.nombre] : [])])]
  const totalCon = (medio: 'efectivo' | 'transferencia' | 'credito') => {
    const pagos = pagosDeMedio(medio, { filas, reglas, total: precio, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false })
    return cobro({ filas, pagos, reglas, descuentoVenta }).total
  }
  const efectivo = totalCon('efectivo')
  if (!kit && idsDeFeria(reglas).has(a.product_id)) return { feria: true, lista: precio, final: efectivo }
  const intentar = (medio: 'transferencia' | 'credito') => {
    try {
      return totalCon(medio)
    } catch {
      return null /* sin esa cuenta configurada */
    }
  }
  const tarjeta = intentar('credito')
  const transferencia = intentar('transferencia')
  // El precio grande: el de la prenda con sus promos, el MISMO de la etiqueta. ⛔ el de tarjeta: la Caja redondea a $100 también
  // con tarjeta (medido 26-nov: la bikini de $49.990 se cobra $50.000) y ése va en su cuadro.
  const grande = Math.round(filas.reduce((s: number, f: { importe: number }) => s + f.importe, 0) - (conPromo.venta?.pesos ?? 0))
  const antesDe = Math.max(a.antes ?? 0, precio)
  const antes = antesDe > grande ? antesDe : null
  return {
    feria: false, lista: precio, precio: grande, antes, pctOferta: antes ? pctDe(grande, antes) : null, promo: nombres.length ? nombres.join(' + ') : null,
    tarjeta, cuota: tarjeta != null ? Math.round(tarjeta / CUOTAS) : null,
    transferencia, pctTransferencia: transferencia != null ? pctDe(transferencia, grande) : null,
    efectivo, pctEfectivo: pctDe(efectivo, grande),
  }
}

/**
 * 🩱 La bikini de una parte escaneada (Bruno, 26-nov: se vende SÓLO la bikini completa ⇒ escanear el corpiño muestra SU bikini,
 * como Etiquetas `2bfe783d`). Todas las bikinis con esa parte son del mismo modelo y color, al mismo precio: la primera.
 */
export function bikiniDeLaParte(conjuntos: ConjuntoCaja[] | null | undefined, product_id: number, size_id: number): ConjuntoCaja | null {
  return conjuntosConPieza(conjuntos, product_id, size_id)[0] ?? null
}

/** Las partes de la bikini, sin repetir producto: «Corpiño» y «Bombacha», con su producto (para los talles). */
export function partesDeLaBikini(kit: ConjuntoCaja): { rotulo: string; product_id: number }[] {
  const vistos = new Set<number>()
  return [...kit.piezas]
    .sort((x, y) => x.n - y.n)
    .filter((p) => !vistos.has(p.product_id) && vistos.add(p.product_id))
    .map((p) => ({ rotulo: parteDe(p.producto ?? p.nombre) || `Parte ${p.n}`, product_id: p.product_id }))
}

/**
 * El descuento por cantidad que la Caja cobra HOY a esta prenda (la promo `cantidad`, «escalera»): los escalones de la primera
 * vigente que la alcanza, o null. Sale de las promos de la Caja, ⛔ escrito: el tótem promete lo que el mostrador cobra.
 * `ids`: los productos de la prenda (las dos partes de una bikini).
 */
export function escaleraDeHoy(reglas: Reglas | null, hoy: string, ids: number[], categorias: string[]): { desde: number; pct: number }[] | null {
  const vigentes = promosVigentes(reglas?.promos ?? [], hoy) as { tipo: string; alcance: unknown; escalones?: { desde: number; pct: number }[] }[]
  const p = vigentes.find((x) => x.tipo === 'cantidad' && x.escalones?.length && entra(x.alcance as never, { product_id: ids[0], ids, categorias } as never))
  return p?.escalones ? [...p.escalones].sort((x, y) => x.desde - y.desde) : null
}

/**
 * 🖤 BLACK FRIDAY 2026 (Bruno: jue 26-nov 20 h → lun 30 inclusive). Sólo cambia lo que se VE (la cinta, la etiqueta «Black
 * Friday» sobre una prenda con rebaja, el aviso de las bikinis); ⛔ el precio: ése sale de Tienda Nube y de la Caja, que se
 * cambian al apretar «Aplicar» en las campañas.
 */
export const BLACK_FRIDAY = {
  desde: Date.parse('2026-11-26T20:00:00-03:00'),
  hasta: Date.parse('2026-12-01T00:00:00-03:00'),
  cinta: 'BLACK FRIDAY · HASTA EL LUNES 30',
  vuelveCantidad: 'El descuento por cantidad vuelve el lunes 30.',
} as const
export const enBlackFriday = (ahora: number) => ahora >= BLACK_FRIDAY.desde && ahora < BLACK_FRIDAY.hasta

/**
 * 🔑 Cada cuánto se recarga el tótem en espera para tomar los precios nuevos. Alrededor del arranque del BF (jue 26 de 19:50 a
 * 23 h, cuando se aprietan los «Aplicar») y de su cierre (lun 30 desde las 20 h), cada 15 minutos y pidiéndole a Tienda Nube el
 * catálogo fresco (`refrescar`); el resto de los días del BF, cada hora; fuera, el vencimiento del caché (`TTL_MS`). `null`: lo de siempre.
 */
export function recargaDelTotem(ahora: number): { cadaMs: number; refrescar: boolean } | null {
  const h = (iso: string) => Date.parse(iso)
  const cambio = (ahora >= h('2026-11-26T19:50:00-03:00') && ahora < h('2026-11-26T23:00:00-03:00')) || (ahora >= h('2026-11-30T20:00:00-03:00') && ahora < h('2026-12-01T12:00:00-03:00'))
  if (cambio) return { cadaMs: 15 * 60_000, refrescar: true }
  if (ahora >= BLACK_FRIDAY.desde && ahora < BLACK_FRIDAY.hasta) return { cadaMs: 60 * 60_000, refrescar: false }
  return null
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
export const TOTEM_MS = { encontrada: 14_000, noEncontrada: 5_000, encargada: 30_000, reintentoStock: 1_500 } as const
