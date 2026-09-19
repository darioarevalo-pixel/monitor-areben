/**
 * Lógica pura del chequeo de exhibición: limpiar categorías TN, armar los ítems,
 * buscar por código (barcode/SKU normalizado), filtrar por categoría y agrupar para
 * el reporte. Port de _exhibCleanCats/exhibCargarDatos(map)/exhibMarcarPorCodigo
 * (lookup)/_exhibFiltrados/exhibGenerarPDF(grupos) (index.html:7574-7909).
 */

import { CATS_GENERICAS, esFundaCat, esModeloCat, esPromo } from '../reposicion/grupos'
import { indexarTn, matchTn, type ClaveGN, type TnProducto } from '../tn'
import { adminBaseUrl, ofertaVigente, type OfertaVigente } from '../tienda'
import type { Linea } from '../lineas'
import { SIN_CATEGORIA, type ExhibErrores, type ExhibEstado, type ExhibEstados, type ExhibItem } from './tipos'

/** Id estable de una variante: barcode si hay, si no productId|talle. Port de _exhibId. */
export function exhibId(it: Pick<ExhibItem, 'barcode' | 'productId' | 'size'>): string {
  return it.barcode || it.productId + '|' + it.size
}

/** Categorías TN reales (sin genéricas/promos/modelo/funda), en orden. Port de _exhibCleanCats. */
export function limpiarCats(tnCats: string[] | undefined | null): string[] {
  return (tnCats || []).filter((c) => {
    const l = String(c).toLowerCase().trim()
    return !!l && !CATS_GENERICAS.has(l) && !esPromo(c) && !esModeloCat(c) && !esFundaCat(c)
  })
}

/** Fila de inventario del Local (Supabase). */
export type FilaInvExhib = { product_id: number | string; product_name?: string | null; size_name?: string | null; sku?: string | null; barcode?: number | string | null; available_quantity?: number | null }
/** Datos TN por productId GN: imagen, categorías crudas, tnId y los dos precios. */
export type ProdMap = Record<string, { img: string | null; tnCats: string[]; tnId: string | number | null; precio?: number | null; promo?: number | null }>

/**
 * El cruce catálogo GN ↔ catálogo TN: por cada producto del espejo, su foto, sus categorías, su
 * id de TN y los dos precios.
 *
 * 🔑 **Es puro y se recalcula, no se congela.** Vivía adentro de la bajada, y ahí quedaba clavado
 * al valor que `productos` tuviera en el momento del `fetch` — que al montar la pantalla es `[]`,
 * porque el ETL publica después. Con la lista vacía el mapa sale vacío, y un mapa vacío ⛔ no da un
 * error: da 870 prendas en «(Sin categoría)», sin foto y sin precio de góndola, que es exactamente
 * el número que el recorrido va a comparar contra la etiqueta de papel.
 *
 * 🔑 **Los precios ya venían en el mismo payload de `tiendanube-audit`** (`price` / `promo_price`),
 * que es lo que Márgenes ya usa: no hace falta ni una consulta nueva, ni una columna en el espejo.
 *
 * ⚠️ Pide **la forma que usa** —id, SKU y nombre— y ⛔ no el `Producto` entero del ETL: es lo único
 * que mira, y así el caso se puede escribir en un test sin inventar veinte campos que no importan.
 */
export function armarProdMap(productos: Array<ClaveGN & { id: string | number }>, tnProducts: TnProducto[]): ProdMap {
  const idx = indexarTn(tnProducts)
  const prodMap: ProdMap = {}
  productos.forEach((p) => {
    const tn = matchTn(p, idx)
    prodMap[String(p.id)] = {
      img: (tn && tn.images && tn.images[0]) || null,
      tnCats: (tn && tn.categories) || [],
      tnId: (tn && tn.id) || null,
      precio: (tn && tn.price) ?? null,
      promo: (tn && tn.promo_price) ?? null,
    }
  })
  return prodMap
}

/**
 * Arma los ítems del recorrido cruzando inventario ↔ TN, aplicando los errores de
 * categoría ya marcados (reasignan la categoría). Port de exhibItems=inv.map(...) @7610.
 */
export function construirItems(inv: FilaInvExhib[], prodMap: ProdMap, errores: ExhibErrores): ExhibItem[] {
  return inv.map((r) => {
    const pid = String(r.product_id)
    const pm = prodMap[pid] || { img: null, tnCats: [], tnId: null }
    const cleanCats = limpiarCats(pm.tnCats)
    let cat = cleanCats[0] || SIN_CATEGORIA
    const err = errores[pid]
    if (err) {
      cat = err.catCorrecta
      if (!cleanCats.includes(cat)) cleanCats.push(cat)
    }
    return {
      barcode: r.barcode ? String(r.barcode) : '',
      sku: r.sku || '',
      productId: pid,
      name: r.product_name || '—',
      size: r.size_name || '',
      qty: r.available_quantity || 0,
      img: pm.img,
      cat,
      cleanCats,
      tnId: pm.tnId,
      precio: pm.precio ?? null,
      promo: pm.promo ?? null,
    }
  })
}

/**
 * Qué precio tendría que tener la etiqueta de esta prenda hoy.
 *
 * Es la pregunta entera del recorrido: quien camina el local tiene la prenda en la mano y el
 * cartelito colgando, y necesita un número contra el cual compararlo. Por eso `aCobrar` es **uno
 * solo** —el que el cliente paga— y `lista` viaja al lado nada más que para explicar la diferencia
 * cuando hay oferta.
 *
 * 🔑 **La regla se mudó a `lib/tienda.core.js` (`ofertaVigente`) y acá quedó el nombre.** No es
 * cosmético: **Etiquetas imprime el mismo número** que esta pantalla controla, y hasta el
 * 16-ago-2026 cada una lo calculaba por su cuenta con reglas distintas — Etiquetas dejaba ganar a
 * una promo que fuera MAYOR que el precio de lista y esta pantalla no. Dos reglas para el mismo
 * cartelito terminan en «reimprimí» sobre una etiqueta que estaba bien.
 */
export function precioDeGondola(it: Pick<ExhibItem, 'precio' | 'promo'>): OfertaVigente {
  return ofertaVigente(it.precio, it.promo)
}

/**
 * La categoría, comparable: sin mayúsculas y sin espacios de más.
 *
 * 🔑 **En el catálogo conviven las dos grafías del mismo nombre.** Medido el 19-sep-2026:
 * `SHORTS, MINIS y FALDAS` (41 variantes) y `SHORTS, MINIS Y FALDAS` (23) son categorías distintas
 * por ID en Tienda Nube y **la misma categoría a los ojos de quien camina el local**. Comparando
 * letra por letra, elegir una lista 41 de 64 y escanear cualquiera de las otras 23 da **cruce
 * falso**: la pantalla acusa a una prenda que está bien colgada.
 */
const normCat = (c: string) => String(c || '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * En qué categorías vive esta prenda **para el recorrido**: TODAS las suyas, ⛔ no la primera.
 *
 * 🔴 **Ésta es la corrección del 19-sep-2026, y era una lista que venía corta y callada.** El
 * recorrido armaba la lista con `cat` —que es `cleanCats[0]`— así que una prenda existía sólo en su
 * primera categoría. Medido con la app: TN tiene **291 productos en «TOPS Y BODIES» y el recorrido
 * pedía 274**; los otros 17 quedaban enganchados bajo BLUSAS Y CAMISAS, BEST SELLERS, CORSETS,
 * CAMPERAS y SWEATERS, **5 de ellos con stock en el Local**, y nadie los chequeó. Peor todavía:
 * BLUSAS, SHORTS y BERMUDAS —que nunca son primeras— mostraban **CERO**, que se lee como «no hay
 * nada que chequear».
 *
 * ⚠️ Sin categorías es `(Sin categoría)` y ⛔ no una lista vacía: esa prenda tiene que poder
 * elegirse y recorrerse igual, que es lo que hace visible a las 413 que ⛔ no cruzan con TN.
 */
export function catsDeItem(it: Pick<ExhibItem, 'cleanCats'>): string[] {
  return it.cleanCats.length ? it.cleanCats : [SIN_CATEGORIA]
}

/**
 * ¿Esta prenda es de esta categoría? **La regla vive acá sola**: la usan la lista del recorrido
 * (`filtrarPorCat`) y el aviso de cruce (`esCruce`), que son las dos puntas de la misma pregunta.
 * Escritas por separado, una dice que la prenda no es de la categoría que la otra le acaba de dar.
 */
export function perteneceA(it: Pick<ExhibItem, 'cleanCats'>, cat: string): boolean {
  const n = normCat(cat)
  return catsDeItem(it).some((c) => normCat(c) === n)
}

/** Categorías presentes, alfabético con "(Sin categoría)" siempre al final. Port de catsOrden @7624. */
export function ordenarCats(items: ExhibItem[]): string[] {
  // Map y ⛔ no Set: la clave es la comparable y el valor la grafía que se muestra, así que las dos
  // formas de escribir la misma categoría son UNA opción del desplegable (gana la primera vista).
  const cats = new Map<string, string>()
  items.forEach((it) => catsDeItem(it).forEach((c) => cats.has(normCat(c)) || cats.set(normCat(c), c)))
  return [...cats.values()].sort((a, b) => Number(a === SIN_CATEGORIA) - Number(b === SIN_CATEGORIA) || a.localeCompare(b, 'es'))
}

/** Ítems de una categoría (o todos si vacío). Port de _exhibFiltrados. */
export function filtrarPorCat(items: ExhibItem[], cat: string): ExhibItem[] {
  return cat ? items.filter((it) => perteneceA(it, cat)) : items
}

/** Normaliza un código: saca espacios/guiones, ceros a la izquierda, a minúscula. Port de norm() @7747. */
export function normCode(s: string | number | null | undefined): string {
  return String(s || '')
    .replace(/[\s-]/g, '')
    .replace(/^0+/, '')
    .toLowerCase()
}

/** Busca la variante por código: barcode exacto → barcode normalizado → SKU normalizado. Port @7750. */
export function buscarItem(items: ExhibItem[], code: string): ExhibItem | null {
  const nc = normCode(code)
  return (
    items.find((x) => x.barcode === code) ||
    items.find((x) => !!x.barcode && normCode(x.barcode) === nc) ||
    items.find((x) => !!x.sku && normCode(x.sku) === nc) ||
    null
  )
}

/** ¿El ítem escaneado NO pertenece a la categoría recorrida (según TN)? Port de `cruce` @7759. */
export function esCruce(it: ExhibItem, catSel: string): boolean {
  return !!catSel && normCat(catSel) !== normCat(SIN_CATEGORIA) && !perteneceA(it, catSel)
}

/**
 * Mínimo de código para animarse a proponer candidatos.
 *
 * Medido sobre las 2.188 variantes del Local (19-sep-2026): `NG` devuelve **440**. Dos caracteres
 * ⛔ no preguntan nada — ofrecer media tienda es la misma nada que no ofrecer, con más ruido.
 */
export const MIN_PARCIAL = 3
/** Cuántos candidatos se pueden mirar de parado con la prenda en la mano. Arriba de esto, se pide de nuevo. */
export const TOPE_CANDIDATOS = 8

/**
 * Las prendas cuyo código **contiene** el pedazo tipeado. Se pregunta SÓLO cuando `buscarItem`
 * ⛔ no encontró nada exacto.
 *
 * 🔴 **Esto ⛔ NO afloja `buscarItem`, y la diferencia es todo.** Con gente usándolo, enganchar la
 * prenda equivocada en silencio es peor que no enganchar: un match parcial mudo marca exhibida una
 * prenda que nadie vio. Acá ⛔ no se elige nada — se muestran los candidatos y **confirma la
 * persona**, que tiene la prenda en la mano.
 *
 * El caso que lo trajo (primer día de uso, 2 de 97 escaneos): `0150NG` es `RTO-0150-NG` sin el
 * prefijo ni los guiones —TOP ZOE, 1 candidato— y `698` es un pedazo de código de barras —2
 * candidatos, CORPIÑO AYLA `1296698` y TOP HADES `1123698`—. Los dos quedaban anotados como «no
 * está en el Local», que se lee como un problema de stock y ⛔ no como lo que es: una lectura a
 * medias.
 *
 * ⚠️ Devuelve **todos** los que matchean, ⛔ no los primeros ocho: el tope lo aplica la pantalla,
 * que es la que tiene que poder decir «hay 47 parecidos, escaneá de nuevo» en vez de mostrar ocho
 * al azar como si fueran la respuesta.
 */
export function candidatosPorCodigo(items: ExhibItem[], code: string): ExhibItem[] {
  const nc = normCode(code)
  if (nc.length < MIN_PARCIAL) return []
  const codigoDe = (x: ExhibItem) => (x.barcode && normCode(x.barcode).includes(nc) ? normCode(x.barcode) : normCode(x.sku))
  return items
    .filter((x) => (!!x.barcode && normCode(x.barcode).includes(nc)) || (!!x.sku && normCode(x.sku).includes(nc)))
    // El código más corto es el más parecido: `150` contra `RTO0150NG` sobra en 6 caracteres y
    // contra un barcode de 13 sobra en 10. Empatados, por nombre, para que la lista no baile.
    .sort((a, b) => codigoDe(a).length - codigoDe(b).length || a.name.localeCompare(b.name, 'es'))
}

/** Faltantes de la categoría: los que no están 'exhibido'. Port @7821/7850. */
export function faltantes(items: ExhibItem[], estados: ExhibEstados): ExhibItem[] {
  return items.filter((it) => estados[exhibId(it)] !== 'exhibido')
}

/** Cuántos faltantes todavía no tienen estado de triage. Port de sinMarcar @7853. */
export function contarSinMarcar(items: ExhibItem[], estados: ExhibEstados): number {
  return items.filter((it) => !['solucionado', 'una-unidad', 'no-encuentra'].includes(estados[exhibId(it)])).length
}

export type GrupoPDF = ExhibEstado | 'sin-marcar'

/** Agrupa la lista por estado para el reporte. Port de `grupos` @7908-7909. */
export function agruparPDF(items: ExhibItem[], estados: ExhibEstados): Record<GrupoPDF, ExhibItem[]> {
  const grupos: Record<GrupoPDF, ExhibItem[]> = { 'no-encuentra': [], solucionado: [], 'una-unidad': [], exhibido: [], 'sin-marcar': [] }
  items.forEach((it) => {
    const e = (estados[exhibId(it)] || 'sin-marcar') as GrupoPDF
    ;(grupos[e] || (grupos[e] = [])).push(it)
  })
  return grupos
}

/**
 * Link al producto en el admin de TN para corregir la categoría. Port de _tnAdminUrl.
 *
 * 🔑 **El dominio sale de `lib/tienda.core.js`, no de un ternario acá.** Ésta era la sexta copia de
 * "cuál es el admin de cada tienda" —la que se le escapó a la consolidación— y con Stunned adentro
 * del mapa una copia más es una tienda menos que aparece el día que se la agrega.
 */
export function tnAdminUrl(tnId: string | number | null, linea: Linea): string | null {
  if (!tnId) return null
  const base = adminBaseUrl(linea)
  return base ? base + '/' + tnId : null
}

/**
 * Las prendas que la cola de reetiquetado sospecha **no exhibidas**.
 *
 * 🔑 **Lo dio vuelta Bruno el 16-ago-2026**: *«si está en depósito y no se etiqueta, puede levantar
 * un problema de no exhibido»*. Una prenda con stock a la que nadie le hizo la etiqueta días
 * después de cambiarle el precio no es un olvido administrativo — es una prenda que probablemente
 * no está colgada en el salón. Por eso la cola **no descarta ese resto: lo deriva acá**, que es la
 * pantalla que ya sabe preguntar «¿está en el local?».
 *
 * 🔑 **La sospecha se cruza con lo que el recorrido ya sabe.** Un producto sin etiquetar que el
 * recorrido encontró colgado no acusa nada: la etiqueta vieja es un problema de Etiquetas, no de
 * exhibición. El que suma información es el que **además** no apareció.
 *
 * ⚠️ Va por `productId`: la cola es por producto y el recorrido por variante, así que un producto
 * sospechoso marca todas sus variantes faltantes. Es lo correcto — la prenda que no está en el
 * salón no está en ningún talle.
 */
export function sospechososNoExhibidos(faltantesDeLaCat: ExhibItem[], pidsSinEtiquetar: Iterable<string>): ExhibItem[] {
  const pids = new Set(Array.from(pidsSinEtiquetar, (p) => String(p)))
  return pids.size ? faltantesDeLaCat.filter((it) => pids.has(String(it.productId))) : []
}
