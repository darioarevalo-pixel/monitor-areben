/**
 * **Lo que falta colgar**: los hermanos de lo que el recorrido ya tocó.
 *
 * 🔑 **Por qué existe.** Lo trajo Bruno el 19-sep-2026 mirando el reporte: *«de la alerta para
 * reponer exhibición me falta un TOP UNIT, porque son 3 colores, sólo se escanearon dos y me dice
 * que no pasa nada»*. El recorrido contestaba por **prenda escaneada** y ⛔ no por **variante que
 * quedó sin colgar**, así que una prenda con dos de sus tres colores en el perchero salía como
 * exhibida y el tercero seguía en el guardado, invisible.
 *
 * 📊 **Medido sobre el primer recorrido real** (`ex1789825143664_abbjt3`, lugar «Tops», 97
 * escaneos): de los **66 productos tocados**, **32 tenían algún color sin colgar** ⇒ **46 variantes
 * · 143 unidades · 32 productos**, y **39 de esas 46 salían «EXHIBIDO CORRECTAMENTE» en el PDF**.
 * ⇒ el caso normal ⛔ no es «falta un color raro»: es **se cuelga un color y el resto queda en el
 * guardado**.
 *
 * 🔴 **EL ALCANCE ES LA REGLA ENTERA, y es lo que hace que la lista ⛔ no mienta.** Sólo entran
 * variantes de productos que **este recorrido tocó**. Un mueble que nadie caminó ⛔ no puede generar
 * una línea — Bruno, el mismo día: *«todas las camisas, blusas y tops hizo; corsets no»*—, y por no
 * tener esa regla el reporte por categoría daba **20 corsets faltantes falsos**: no faltaban, nadie
 * los había caminado. ⛔ **No se afirma nada sobre lo que el recorrido nunca vio**: la primera vez
 * que el local vaya a buscar algo que estaba colgado, deja de creerle a la lista entera.
 *
 * Todo lo de acá es puro: la misma función alimenta la pantalla del teléfono mientras se camina, el
 * cierre del recorrido y lo que se mira después desde otra máquina.
 */

import type { Filas } from '../excel'
import { exhibId, normCode } from './core'
import type { EscaneoLibre } from './libre'
import type { ExhibItem } from './tipos'

/** Una variante que hay que ir a colgar, y dónde están sus hermanas. */
export type Colgar = {
  it: ExhibItem
  /** El mueble donde apareció el **primer** hermano escaneado: es a dónde hay que ir. */
  lugar: string
  /** Cuándo se escaneó ese primer hermano (ISO). Ordena la lista como se caminó. */
  cuando: string
  /**
   * ⚠️ Comparte SKU con otra variante con stock ⇒ si alguien **tipeó el SKU a mano** en vez de
   * pasar el lector, pudo haber enganchado a la hermana y ésta quedaría marcada como no escaneada
   * sin estarlo. Medido: **8 grupos / 20 variantes** con stock (`4008` son TOP MIA BLANCO y
   * CHOCOLATE; `areben`, 6 variantes de AYLA), **2 de las 46 faltantes** del recorrido real.
   *
   * 🔑 **Aclara, ⛔ no excluye.** Las 20 tienen **barcode distinto** y ninguna variante con stock
   * está sin barcode, así que **el lector las distingue** —de los 97 escaneos reales, 0 engancharon
   * por otra cosa que el barcode exacto—. Sacarlas de la lista sería esconder una prenda que casi
   * seguro falta de verdad.
   */
  skuAmbiguo?: boolean
}

/**
 * Las variantes que hay que colgar, en orden de caminata.
 *
 * ⚠️ `conStock` es el inventario del Local **con stock**, ⛔ no los escaneos: desde el 19-sep-2026
 * un escaneo puede venir con `qty` en 0 —la prenda estaba colgada y el sistema la tiene en cero— y
 * **una variante en cero ⛔ no se puede colgar**: no hay nada en el guardado que traer.
 */
export function paraColgar(escaneos: EscaneoLibre[], conStock: ExhibItem[]): Colgar[] {
  const cruzados = escaneos.filter((e) => e.encontrado && e.product_id)
  if (!cruzados.length) return []

  // 🔑 **El orden de caminata lo dice el RELOJ del escaneo, ⛔ no el orden del array.** Los dos
  // coinciden en el teléfono, donde cada escaneo se agrega al final; ⛔ no coinciden cuando la lista
  // se lee de la base o cuando la cola se juntó sin señal y subió toda junta. De acá salen las dos
  // cosas que ordenan la lista: el primer hermano de cada prenda y el orden de los muebles.
  const ordenados = [...cruzados].sort((a, b) => a.escaneado_en.localeCompare(b.escaneado_en))
  const primero = new Map<string, { lugar: string; cuando: string }>()
  const ordenLugar = new Map<string, number>()
  for (const e of ordenados) {
    const pid = String(e.product_id)
    if (!primero.has(pid)) primero.set(pid, { lugar: e.lugar, cuando: e.escaneado_en })
    if (!ordenLugar.has(e.lugar)) ordenLugar.set(e.lugar, ordenLugar.size)
  }

  // 🔴 Las escaneadas se miran del recorrido ENTERO y ⛔ no del lugar: la misma prenda puede estar
  // colgada en otro mueble, y ahí ⛔ no falta nada. Si no, la lista pediría colgar algo que está
  // colgado, que es el error que hace que se le deje de creer.
  const escaneadas = new Set(escaneos.map((e) => e.variante_id))

  const cuantasConEseSku = new Map<string, number>()
  for (const it of conStock) {
    if (it.qty <= 0 || !it.sku) continue
    const k = normCode(it.sku)
    if (k) cuantasConEseSku.set(k, (cuantasConEseSku.get(k) || 0) + 1)
  }

  return conStock
    .filter((it) => it.qty > 0 && primero.has(it.productId) && !escaneadas.has(exhibId(it)))
    .map((it) => {
      const p = primero.get(it.productId)!
      const amb = !!it.sku && (cuantasConEseSku.get(normCode(it.sku)) || 0) > 1
      return amb ? { it, lugar: p.lugar, cuando: p.cuando, skuAmbiguo: true } : { it, lugar: p.lugar, cuando: p.cuando }
    })
    .sort(
      (a, b) =>
        (ordenLugar.get(a.lugar) ?? 0) - (ordenLugar.get(b.lugar) ?? 0) ||
        // Lo que más vale primero: 9 unidades en el guardado ⛔ no son lo mismo que 1.
        b.it.qty - a.it.qty ||
        a.it.name.localeCompare(b.it.name, 'es'),
    )
}

/** Lo de un solo mueble: lo que la pantalla muestra al terminar de caminarlo. */
export function colgarEnLugar(lista: Colgar[], lugar: string): Colgar[] {
  const l = lugar.trim()
  return lista.filter((c) => c.lugar === l)
}

/** El titular: variantes, unidades y prendas. Las tres se dicen, porque contestan cosas distintas. */
export function resumenColgar(lista: Colgar[]): { variantes: number; unidades: number; productos: number } {
  return {
    variantes: lista.length,
    unidades: lista.reduce((a, c) => a + c.it.qty, 0),
    productos: new Set(lista.map((c) => c.it.productId)).size,
  }
}

/** Grupo de una prenda: se manda a colgar **por prenda**, ⛔ no variante por variante. */
export type GrupoColgar = { productId: string; name: string; lugar: string; unidades: number; variantes: Colgar[] }

export function agruparColgarPorProducto(lista: Colgar[]): GrupoColgar[] {
  const grupos = new Map<string, GrupoColgar>()
  for (const c of lista) {
    const g = grupos.get(c.it.productId)
    if (g) {
      g.variantes.push(c)
      g.unidades += c.it.qty
    } else {
      grupos.set(c.it.productId, { productId: c.it.productId, name: c.it.name, lugar: c.lugar, unidades: c.it.qty, variantes: [c] })
    }
  }
  return [...grupos.values()]
}

export const HEADER_COLGAR = ['Lugar', 'Prenda', 'Color / talle', 'SKU', 'Código de barras', 'Unidades en el Local', 'Aviso'] as const

/** Anchos de columna del `.xlsx`, en caracteres. */
export const ANCHOS_COLGAR = [22, 40, 16, 16, 18, 20, 34]

/** La planilla que se le pasa a quien va a colgar. Un renglón por variante, en orden de caminata. */
export function filasColgar(lista: Colgar[]): Filas {
  const filas: Filas = [[...HEADER_COLGAR]]
  for (const c of lista) {
    filas.push([
      c.lugar,
      c.it.name,
      c.it.size,
      c.it.sku || '',
      c.it.barcode || '',
      c.it.qty,
      c.skuAmbiguo ? 'Comparte SKU con otra variante: chequear con el lector' : '',
    ])
  }
  return filas
}
