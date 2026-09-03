/**
 * Lógica pura de Etiquetas: variantes etiquetables, mapa de precios (reusando el
 * matcheo TN), resolución del escaneo y armado de la secuencia de impresión. Port
 * de _etiVariantes/_etiBuildPrecios/etiScan/etiImprimir (index.html:6702-7015), sin
 * DOM ni globales. El dibujo del PDF (no puro, usa jsPDF+JsBarcode) vive en pdf.ts.
 */

import { ofertaVigente } from '../tienda'
import { matchTn, type IndiceTn } from '../tn'
import type { Cantidades, MapaPrecios, MapaPromo, ModoEtiqueta, VarianteEti } from './tipos'

/** El producto GN mínimo para el mapa de precios. */
export type ProductoPrecio = { id: string; sku?: string | null; name?: string | null; retailer_price?: number }

/** Variantes etiquetables: con código de barras, ordenadas por producto y variante. Port de _etiVariantes. */
export function variantesEtiquetables(variantes: VarianteEti[]): VarianteEti[] {
  return (variantes || [])
    .filter((v) => v.barcode)
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es') || (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
}

/** Activos con stock pero SIN código de barras (no etiquetables; se avisan). Port del filtro de _etiAvisoSinCodigo. */
export function variantesSinCodigo(variantes: VarianteEti[]): VarianteEti[] {
  return (variantes || [])
    .filter((v) => !v.barcode && (v.stock || 0) > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
}

/**
 * Las variantes cuyo producto entra en una campaña de liquidación.
 *
 * 🔑 **La campaña aporta *cuáles*, no *cuánto*.** El precio de la etiqueta sigue saliendo de Tienda
 * Nube (`construirPrecios`), que es lo que el cliente paga; la lista de pid sólo acota qué prendas
 * hay que etiquetar. Sin esto el local ve las 418 promos vivas de la marca en vez de las 260 del
 * sale, que es exactamente el problema que la pestaña vino a resolver.
 */
export function variantesDeCampania(lista: VarianteEti[], pids: Set<string>): VarianteEti[] {
  return (lista || []).filter((v) => pids.has(v.pid))
}

/**
 * Las variantes que **lista** una pestaña de Etiquetas.
 *
 * 🔴 **Una lista acotada por pid NO se filtra además por promoción vigente.** La pestaña de la cola
 * de reetiquetado se dibuja con el modo `promo` —la mayoría de sus prendas entran a una oferta— y
 * eso le aplicaba el filtro «sólo lo que hoy está rebajado en Tienda Nube». Justo la mitad de la
 * cola es lo contrario: la prenda a la que **se le sacó** la oferta y volvió a precio de lista, que
 * ya no tiene promo y desaparecía de la tabla. Resultado medido en prod el 3-sep-2026: el
 * encabezado decía «30 prendas para reetiquetar» (Zattia) y «18» (BDI) y la lista de abajo estaba
 * VACÍA en las dos ⇒ el local no tenía cómo saber cuáles buscar.
 *
 * 🔑 **Cuál etiqueta le toca a cada prenda se decide después, prenda por prenda** (`ctx.modoDe` en
 * la pantalla): con el tachado si sigue en oferta, con un número solo si volvió a lista. Por eso el
 * filtro de la lista no tiene por qué mirar la promo.
 *
 * @param campania La lista acotada (la cola, una liquidación), o `null` si la pestaña es el catálogo
 *   entero. Obligatorio: es la única diferencia entre «acotada» y «todo», y omitirlo por descuido es
 *   exactamente el defecto de arriba.
 */
export function variantesAListar(
  vars: VarianteEti[],
  modo: ModoEtiqueta,
  campania: { pids: Set<string> } | null,
  tienePromo: (v: VarianteEti) => boolean,
): VarianteEti[] {
  if (campania) return variantesDeCampania(vars, campania.pids)
  return modo === 'promo' ? (vars || []).filter((v) => tienePromo(v)) : vars || []
}

/**
 * Mapa de precios por producto: el que la tienda cobra hoy, con respaldo al minorista de GN si el
 * producto no está en Tienda Nube. Además el mapa de promo (sólo descuentos reales) y el conjunto de
 * los que **no** salieron de Tienda Nube. Port de _etiBuildPrecios, reusando `matchTn`
 * (= _mktFindTN).
 *
 * 🔴 **Diverge del legacy a propósito desde el 16-ago-2026, y es la única divergencia.** El legacy
 * dejaba ganar a `promo_price` **siempre**, incluso si era MAYOR que el precio de lista ⇒ cuando sube
 * la lista y queda una promo vieja arriba, esto imprimía un precio más caro que el de lista mientras
 * el chequeo de exhibición decía que la etiqueta estaba bien. Ahora las dos pantallas leen la misma
 * regla, `ofertaVigente` de `lib/tienda.core.js`. 📌 Medido antes de cambiarlo: **cero productos** en
 * los tres catálogos caían en el caso, así que no hay etiquetas mal impresas para rehacer.
 *
 * 🔑 **`fueraDeTn` existe porque el respaldo era SILENCIOSO.** Un producto que no cruza con Tienda
 * Nube se etiqueta igual —hay que poder etiquetarlo— pero con un precio del espejo de Supabase, que
 * se refresca una vez por día: la fila lo tiene que decir, o se cuelga un precio de ayer sin que
 * nadie se entere.
 */
export function construirPrecios(
  productos: ProductoPrecio[],
  idx: IndiceTn,
): { precios: MapaPrecios; promos: MapaPromo; fueraDeTn: Set<string> } {
  const precios: MapaPrecios = {}
  const promos: MapaPromo = {}
  const fueraDeTn = new Set<string>()
  for (const p of productos || []) {
    const tn = matchTn(p, idx)
    const oferta = ofertaVigente(tn?.price, tn?.promo_price)
    const respaldo = (p.retailer_price || 0) > 0 ? (p.retailer_price as number) : 0
    const precio = oferta.aCobrar ?? respaldo
    precios[p.id] = precio || 0
    if (precio > 0 && oferta.aCobrar == null) fueraDeTn.add(p.id)
    if (oferta.enOferta) {
      promos[p.id] = { normal: oferta.lista as number, promo: oferta.aCobrar as number }
    } else if (tn && (tn.promo_price || 0) > 0 && oferta.lista == null && respaldo > (tn.promo_price as number)) {
      // Producto en promo al que Tienda Nube no le da precio de lista: el tachado sale del espejo.
      // Nunca se vio en los tres catálogos (medido 16-ago-2026), pero si aparece es mejor una
      // etiqueta con el «antes» del espejo que una sin oferta.
      promos[p.id] = { normal: respaldo, promo: tn.promo_price as number }
      fueraDeTn.add(p.id)
    }
  }
  return { precios, promos, fueraDeTn }
}

/** Filtra la tabla por texto (nombre, SKU o código). Port del filtro de etiRenderTabla. */
export function filtrarVariantes(lista: VarianteEti[], q: string): VarianteEti[] {
  const qq = (q || '').toLowerCase().trim()
  if (!qq) return lista
  return lista.filter((v) => (v.name || '').toLowerCase().includes(qq) || (v.sku || '').toLowerCase().includes(qq) || (v.barcode || '').includes(qq))
}

/** Resuelve un código escaneado a una variante: por código exacto, sin ceros a la izquierda, o por SKU. Port de etiScan. */
export function resolverScan(vars: VarianteEti[], code: string): VarianteEti | null {
  const c = (code || '').trim()
  if (!c) return null
  const norm = (s: unknown) => String(s || '').replace(/^0+/, '')
  return (
    vars.find((x) => String(x.barcode) === c) ||
    vars.find((x) => norm(x.barcode) === norm(c)) ||
    vars.find((x) => (x.sku || '').toLowerCase() === c.toLowerCase()) ||
    null
  )
}

export type Grupo = { v: VarianteEti; cant: number }

/**
 * Agrupa las cantidades cargadas en (variante, cantidad), salteando ids sin
 * variante y —en modo SKU— las variantes sin SKU. Port del armado de `grupos` en
 * etiImprimir.
 */
export function agruparCantidades(cant: Cantidades, varsById: Record<string, VarianteEti>, modo: ModoEtiqueta): Grupo[] {
  const grupos: Grupo[] = []
  for (const [id, c] of Object.entries(cant || {})) {
    const v = varsById[id]
    if (!v) continue
    if (modo === 'sku' && !v.sku) continue
    grupos.push({ v, cant: c })
  }
  return grupos
}

/**
 * Parte los grupos en los que se pueden imprimir y los que **no tienen precio**.
 *
 * 🔴 **Existe porque la degradación era SILENCIOSA.** El dibujo de la etiqueta de precio decide con
 * `precio > 0`: con precio en cero se cae a la rama de la etiqueta de información y sale una etiqueta
 * **sin precio**, bien impresa, sin un solo aviso. Quien la cuelga no tiene cómo notarlo —la etiqueta
 * existe y se ve bien— y la prenda queda en la percha sin precio.
 *
 * 🔑 **Sólo parte el modo `loc`.** En `promo` el escaneo ya frena antes (sin promo no hay antes/ahora
 * que mostrar) y `dep` y `sku` no llevan precio: ahí un cero no es una falta.
 */
export function partirPorPrecio(
  grupos: Grupo[],
  modo: ModoEtiqueta,
  precioDe: (v: VarianteEti) => number,
): { imprimibles: Grupo[]; sinPrecio: Grupo[] } {
  if (modo !== 'loc') return { imprimibles: grupos, sinPrecio: [] }
  const imprimibles: Grupo[] = []
  const sinPrecio: Grupo[] = []
  for (const g of grupos) ((precioDe(g.v) || 0) > 0 ? imprimibles : sinPrecio).push(g)
  return { imprimibles, sinPrecio }
}

/**
 * Cómo nombrar las prendas que no se pudieron etiquetar.
 *
 * 🔑 **Se NOMBRAN, no se cuentan.** «3 de 40 no salieron» obliga a revisar las 40 a mano para
 * encontrar cuáles. Se corta en diez y se dice cuántas quedaron: una lista de cuarenta nombres en un
 * cartel no se lee tampoco.
 */
export function nombrarSinPrecio(sinPrecio: Grupo[], tope = 10): string {
  const nombres = sinPrecio.map((g) => [g.v.name || '—', g.v.size].filter(Boolean).join(' · '))
  const visibles = nombres.slice(0, tope)
  const resto = nombres.length - visibles.length
  return visibles.join(', ') + (resto > 0 ? ` y ${resto} más` : '')
}

/**
 * La secuencia de labels a imprimir: cada grupo expande sus copias; `sep` intercala
 * un separador en blanco (null) entre variantes (depósito); `conFP` intercala la
 * etiqueta de formas de pago después de cada copia (local). Port de la construcción
 * de `labels` en etiImprimir.
 */
export function secuenciaLabels(grupos: Grupo[], opts: { sep: boolean; conFP: boolean }): (VarianteEti | null | { __fp: true })[] {
  const labels: (VarianteEti | null | { __fp: true })[] = []
  grupos.forEach((g, gi) => {
    if (opts.sep && gi > 0) labels.push(null)
    for (let k = 0; k < g.cant; k++) {
      labels.push(g.v)
      if (opts.conFP) labels.push({ __fp: true })
    }
  })
  return labels
}

/** Total de etiquetas cargadas (suma de cantidades). */
export function totalEtiquetas(cant: Cantidades): number {
  return Object.values(cant || {}).reduce((a, b) => a + b, 0)
}

/**
 * Las variantes del MISMO producto que la escaneada, ella incluida.
 *
 * 🔑 **Es lo que convierte un escaneo en las cuatro bolsas del producto.** El depósito guarda una
 * bolsa por color y cada una lleva su etiqueta de SKU: escanear las cuatro para imprimir cuatro
 * etiquetas es el trabajo que esta función saca del medio (lo pidió Bruno el 3-sep-2026).
 *
 * ⚠️ **Pide SKU, no código de barras.** La etiqueta de SKU no dibuja barras, así que una variante
 * sin código —que no se puede escanear, pero cuya bolsa existe igual— tiene que entrar. La lista de
 * entrada por eso NO es `variantesEtiquetables`, que filtra por barras.
 */
export function hermanasDe(vars: VarianteEti[], v: VarianteEti): VarianteEti[] {
  return (vars || [])
    .filter((x) => x.pid === v.pid && x.sku)
    .sort((a, b) => (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
}

/**
 * Cuáles de las hermanas se imprimen sin que nadie tilde nada: **las que tienen stock**.
 *
 * 🔑 **La bolsa existe porque hay mercadería.** Un color en cero no tiene bolsa en el depósito y su
 * etiqueta se tira, así que el tilde arranca apagado — se puede prender a mano en la lista.
 *
 * 🔴 **Salvo que no haya ninguna con stock, y ahí manda la escaneada.** Si no, escanear una bolsa de
 * algo que el espejo todavía cuenta en cero no imprimía NADA y la pantalla decía que estaba todo
 * bien: quien tiene la bolsa en la mano se queda esperando una etiqueta que no va a venir.
 */
export function conStock(hermanas: VarianteEti[], escaneada: VarianteEti): VarianteEti[] {
  const con = (hermanas || []).filter((x) => (x.stock || 0) > 0)
  return con.length ? con : (hermanas || []).filter((x) => x.id === escaneada.id)
}
