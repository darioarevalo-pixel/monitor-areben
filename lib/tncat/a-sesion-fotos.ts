/**
 * De la cola de fotos al borrador de una sesión: el cruce que faltaba.
 *
 * La pantalla de auditoría habla en **ids de Tienda Nube** y el borrador de Sesión de fotos habla
 * en **`pid`/`vid` de Gestión Nube**. Hasta ahora esa pared se cruzaba a mano: la cola
 * «Esto es lo que hay que fotografiar» exportaba un Excel y alguien buscaba los productos de nuevo,
 * uno por uno, en el buscador del borrador.
 *
 * 🔴 **El cruce NO es total, y eso es lo primero que hay que mostrar.** El único criterio confiable
 * para llegar a la variante es el código exacto —SKU y, si no, código de barras (el mismo de
 * `stockDeVariante`)— y la cobertura medida es **BDI 89,5 % / Zattia 73,3 %**: una de cada diez no
 * cruza. Esconderla haría que la sesión salga con menos productos de los que se pidieron y **nadie
 * se entere**; por eso todo lo que queda afuera sale con su motivo.
 *
 * 🔑 **Se cruza contra las MISMAS variantes que va a usar el borrador** (`allVariantes`), no contra
 * un índice propio. Es lo que garantiza que lo que esta función promete, `expandirProductos` lo
 * pueda cumplir: si acá se contara una variante que allá no existe, el producto se caería en
 * silencio (`expandirProductos` hace `continue` cuando no le quedan variantes con stock).
 */

import type { Variante } from '@/lib/etl/tipos'
import type { ProductoFchk, VarianteFchk } from './tipos'

/** Un producto que sí se puede pedir, con las variantes a tildar ya elegidas. */
export type PedidoFoto = {
  /** Id de producto de Gestión Nube. */
  pid: string
  /** Nombre de Gestión Nube (el que va a ver quien arma la sesión). */
  nombre: string
  /** Nombre en Tienda Nube, para poder reconocerlo si los dos catálogos no lo llaman igual. */
  nombreTn: string
  /** Las variantes sin foto que cruzaron Y tienen stock: las que el borrador va a abrir tildadas. */
  vids: string[]
}

/**
 * Por qué un producto de la cola no llegó al borrador. No son excusas: cada motivo es una acción
 * distinta de quien lo mira.
 */
export type MotivoExcluido =
  /** Ninguna de sus variantes sin foto cruzó por código con Gestión Nube. ⇒ falta mapear el SKU. */
  | 'sin-cruce'
  /** Cruzó, pero su producto todavía no está en Gestión Nube (variante huérfana). ⇒ cargarlo. */
  | 'sin-producto-gn'
  /** Cruzó y no hay una sola unidad: no se puede fotografiar lo que no está. ⇒ esperar el ingreso. */
  | 'sin-stock'
  /** El mismo código lleva a productos DISTINTOS de GN: elegir uno sería adivinar. ⇒ despegarlos. */
  | 'ambiguo'

export type Excluido = {
  /** Id de producto de Tienda Nube. */
  tnId: string
  nombre: string
  motivo: MotivoExcluido
}

export type CruceSesion = {
  pedir: PedidoFoto[]
  excluidos: Excluido[]
}

export const MOTIVO_EXCLUIDO_LABEL: Record<MotivoExcluido, string> = {
  'sin-cruce': 'no cruza por código con Gestión Nube',
  'sin-producto-gn': 'su producto todavía no está cargado en Gestión Nube',
  'sin-stock': 'no queda ninguna unidad para fotografiar',
  ambiguo: 'su código lleva a dos productos distintos de Gestión Nube',
}

const norm = (s: string | null | undefined): string => String(s ?? '').toLowerCase().trim()

type Indice = { bySku: Map<string, Variante[]>; byBarcode: Map<string, Variante[]> }

/**
 * Índice código → variantes de GN. Guarda **todas** las que comparten un código en vez de pisar:
 * dos variantes pueden compartirlo (pasa cuando se duplica un producto en GN) y quedarse con la
 * última elegiría un producto a ciegas. Con la lista entera, el caso se puede NOMBRAR.
 */
function indexar(variantes: Variante[]): Indice {
  const bySku = new Map<string, Variante[]>()
  const byBarcode = new Map<string, Variante[]>()
  for (const v of variantes) {
    const sku = norm(v.sku)
    // En el ETL los códigos faltantes son `''`, no null: sin este filtro el vacío matchearía todo.
    if (sku) bySku.set(sku, [...(bySku.get(sku) ?? []), v])
    const bc = norm(v.barcode)
    if (bc) byBarcode.set(bc, [...(byBarcode.get(bc) ?? []), v])
  }
  return { bySku, byBarcode }
}

/**
 * Las variantes de GN de una variante de TN. **SKU primero y barcode después**, igual que
 * `stockDeVariante`: si los dos criterios se contestaran distinto, el stock que muestra la cola y
 * el producto que abre el borrador serían de dos productos diferentes.
 */
function variantesGnDe(v: VarianteFchk, idx: Indice): Variante[] {
  // Sin guard del código vacío: el índice ya no tiene la clave `''` (lo filtra `indexar`), así que
  // buscarla devuelve undefined y cae al criterio siguiente. Repetir el guard acá lo volvía
  // INALCANZABLE — un mutante que lo sacaba del índice sobrevivía, tapado por esta copia.
  const s = idx.bySku.get(norm(v.sku))
  if (s) return s
  const b = idx.byBarcode.get(norm(v.barcode))
  if (b) return b
  return []
}

/** Las variantes de TN que esperan una foto: con color y sin foto propia. */
export function variantesSinFoto(p: ProductoFchk): VarianteFchk[] {
  return (p.variantes || []).filter((v) => !!v.color && !v.image_url)
}

const conStock = (v: Variante) => (v.local || 0) + (v.deposito || 0) > 0

/**
 * Cruza la cola de fotos con Gestión Nube y arma el pedido para el borrador.
 *
 * `variantesGn` son las que el borrador va a expandir (`allVariantes`). `huerfanas` es opcional y
 * sirve **sólo para distinguir el motivo**: una variante huérfana existe en GN pero su producto no,
 * así que no se puede pedir todavía — y decirlo («cargalo en GN») es una acción distinta de decir
 * «no cruza por código» («mapeá el SKU»).
 *
 * Un producto de TN sin ninguna variante sin foto no se pide ni se excluye: no tiene nada que hacer
 * en una sesión de fotos.
 */
export function cruzarParaSesion(
  productos: ProductoFchk[],
  variantesGn: Variante[],
  huerfanas: Variante[] = [],
): CruceSesion {
  const idx = indexar(variantesGn)
  const idxHuerfanas = indexar(huerfanas)
  const pedir: PedidoFoto[] = []
  const excluidos: Excluido[] = []

  for (const p of productos) {
    const pendientes = variantesSinFoto(p)
    if (!pendientes.length) continue
    const tnId = String(p.id)
    const nombreTn = p.name || '—'

    // Todas las variantes de GN a las que llega este producto, por cualquiera de sus pendientes.
    const encontradas = pendientes.flatMap((v) => variantesGnDe(v, idx))
    if (!encontradas.length) {
      const enHuerfanas = pendientes.some((v) => variantesGnDe(v, idxHuerfanas).length > 0)
      excluidos.push({ tnId, nombre: nombreTn, motivo: enHuerfanas ? 'sin-producto-gn' : 'sin-cruce' })
      continue
    }

    // 🔴 Un mismo código que lleva a DOS productos de GN no se resuelve eligiendo: el borrador
    // abriría el producto equivocado y la sesión saldría con la mercadería de otro.
    const pids = [...new Set(encontradas.map((v) => String(v.pid)))]
    if (pids.length > 1) {
      excluidos.push({ tnId, nombre: nombreTn, motivo: 'ambiguo' })
      continue
    }

    // Sólo las que el borrador va a poder expandir: `expandirProductos` deja afuera las que no
    // tienen stock, así que tildar una sin stock sería un tilde que se pierde sin aviso.
    const vids = [...new Set(encontradas.filter(conStock).map((v) => v.id))]
    if (!vids.length) {
      excluidos.push({ tnId, nombre: nombreTn, motivo: 'sin-stock' })
      continue
    }

    pedir.push({ pid: pids[0], nombre: encontradas[0].name || nombreTn, nombreTn, vids })
  }

  return { pedir, excluidos }
}

/** Cuántos productos quedaron afuera por cada motivo, en el orden fijo de la lista. */
export function porMotivo(excluidos: Excluido[]): { motivo: MotivoExcluido; n: number }[] {
  const orden: MotivoExcluido[] = ['sin-cruce', 'sin-producto-gn', 'sin-stock', 'ambiguo']
  return orden
    .map((motivo) => ({ motivo, n: excluidos.filter((e) => e.motivo === motivo).length }))
    .filter((x) => x.n > 0)
}
