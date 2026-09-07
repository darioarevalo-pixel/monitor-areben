/**
 * Recorrer la tienda POR categoría, para agregar y sacar productos de ellas.
 *
 * Lo que faltaba: la asignación por Excel solo sabía AGREGAR y a ciegas (subís nombres y
 * confiás en el match). Para categorías vivas —Best sellers, Ofertas— el movimiento real es
 * el otro: ver qué hay adentro hoy y sacar lo que ya no va. Sin eso, esas categorías solo
 * crecen y terminan mostrando en la tienda cosas que dejaron de ser ofertas.
 *
 * TiendaNube no tiene "quitar categoría": se manda el conjunto COMPLETO de categorías del
 * producto. Por eso todo se resuelve calculando el array resultante y mandándolo con el
 * mismo endpoint que ya usaba el Excel (`accion:'asignar'`, modo items) — no hace falta
 * tocar nada del lado del servidor.
 */

import { diasDesde } from './dias'
import type { ProductoCat } from './tipos'

const ids = (p: ProductoCat): string[] => (p.category_ids || []).map(String)

/**
 * Cómo se ordena lo que hay adentro de la categoría.
 *
 * `antiguos` existe porque el gesto de esta pantalla es SACAR, y lo que hay que sacar de una
 * categoría viva —NEW IN sobre todo— es lo que hace más que entró. Alfabético sirve para
 * encontrar uno que ya se sabe cuál es; para eso está el buscador.
 */
export type OrdenCat = 'antiguos' | 'nuevos' | 'nombre'

/**
 * Qué mitad de la categoría se mira. Existe porque el trabajo grande de NEW IN es **sacar lo que
 * ya no está a la venta**: medido el 7-sep-2026, de los 272 productos de NEW IN **91 están
 * ocultos** — la tienda no los muestra y la categoría los sigue contando.
 */
export type EstadoCat = 'todos' | 'ocultos' | 'visibles'

/** Oculto en la tienda. `published` sin definir es publicado: es el default de TiendaNube. */
export const estaOculto = (p: ProductoCat): boolean => p.published === false

/**
 * Los del lote que quedarían **sin ninguna categoría**.
 *
 * 🔴 Un producto sin categoría ⛔ no aparece en la navegación de la tienda: se llega por el buscador
 * o por link directo. Sacar de a uno eso casi no pasa; sacar 91 de una, sí — medido el 7-sep, **7
 * de los 91 ocultos de NEW IN no tienen otra categoría**. Por eso se cuentan ANTES de escribir, con
 * nombre y todo, igual que hace el flujo del Excel (`quedanSinCategoria` de `AsigPreview`).
 */
export function quedarianSinCategoria(items: { nombre: string; nuevas: string[] }[]): string[] {
  return items.filter((i) => i.nuevas.length === 0).map((i) => i.nombre)
}

/** ¿El texto matchea el nombre o el SKU? Es el MISMO criterio en los dos lados de la pantalla. */
export function coincide(p: ProductoCat, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return p.name.toLowerCase().includes(t) || (p.sku || '').toLowerCase().includes(t)
}

const porNombre = (a: ProductoCat, b: ProductoCat) => a.name.localeCompare(b.name, 'es')

/**
 * Ordena por antigüedad del alta en TiendaNube. **Lo que no tiene fecha va al final en los dos
 * sentidos**: no se sabe cuándo entró, y ponerlo primero en «más viejos» lo haría pasar por lo
 * que más tiempo lleva ahí — que es justo lo que se está por sacar de la tienda.
 */
function porFecha(orden: 'antiguos' | 'nuevos', ahora: number) {
  return (a: ProductoCat, b: ProductoCat) => {
    const da = diasDesde(a.created_at, ahora)
    const db = diasDesde(b.created_at, ahora)
    if (da === null || db === null) return da === db ? porNombre(a, b) : da === null ? 1 : -1
    if (da === db) return porNombre(a, b)
    return orden === 'antiguos' ? db - da : da - db
  }
}

/**
 * Lo que dice la fila sobre la antigüedad. Es texto, pero la regla es cuál de los tres casos
 * cae —hoy, hace N días, no se sabe— y ⛔ «no se sabe» no puede salir como 0.
 */
export function etiquetaAntiguedad(created_at: string | null | undefined, ahora: number): string {
  const d = diasDesde(created_at, ahora)
  if (d === null) return 'sin fecha'
  return d === 0 ? 'entró hoy' : `hace ${d} d`
}

/** Aplica el orden elegido. Público porque el orden es regla, no pintura de la pantalla. */
export function ordenar(productos: ProductoCat[], orden: OrdenCat, ahora: number = Date.now()): ProductoCat[] {
  return productos.slice().sort(orden === 'nombre' ? porNombre : porFecha(orden, ahora))
}

/** ¿El producto está en esa categoría? */
export function tieneCategoria(p: ProductoCat, catId: string): boolean {
  return ids(p).includes(String(catId))
}

/**
 * Los productos que HOY están en la categoría (lo que se ve en la tienda al entrar a ella).
 *
 * `q` filtra por nombre o SKU — NEW IN de Zattia tiene 498 productos, y sin buscador la única
 * forma de llegar a uno era scrollear. 🔴 **Lo filtrado NO es lo que se aplica**: quien tilda,
 * cambia el texto y aprieta tiene que sacar los que tildó antes, no sólo los que está viendo, así
 * que la card guarda la lista sin filtrar para armar el lote.
 */
export function enCategoria(
  productos: ProductoCat[],
  catId: string,
  opts: { q?: string; orden?: OrdenCat; estado?: EstadoCat; ahora?: number } = {},
): ProductoCat[] {
  const estado = opts.estado ?? 'todos'
  const dentro = productos.filter(
    (p) =>
      tieneCategoria(p, catId) &&
      coincide(p, opts.q || '') &&
      (estado === 'todos' || (estado === 'ocultos' ? estaOculto(p) : !estaOculto(p))),
  )
  return ordenar(dentro, opts.orden ?? 'nombre', opts.ahora)
}

/** Búsqueda por nombre o SKU, para sumar productos que todavía no están en la categoría. */
export function buscar(productos: ProductoCat[], q: string, catId?: string): ProductoCat[] {
  if (!q.trim()) return []
  return productos
    .filter((p) => !catId || !tieneCategoria(p, catId))
    .filter((p) => coincide(p, q))
    .sort(porNombre)
    .slice(0, 40)
}

/**
 * El conjunto de categorías que hay que MANDAR para agregar o quitar una.
 *
 * Devuelve `null` si no hay nada que cambiar (ya está como se quiere): así no se escribe en
 * la tienda al pedo ni se cuenta como "aplicado" algo que no cambió.
 */
export function nuevasCategorias(p: ProductoCat, catId: string, accion: 'agregar' | 'quitar'): string[] | null {
  const actuales = ids(p)
  const esta = actuales.includes(String(catId))
  if (accion === 'agregar') return esta ? null : [...actuales, String(catId)]
  return esta ? actuales.filter((c) => c !== String(catId)) : null
}

/** Los ítems para `aplicarAsignarLote` (id + nombre + el array completo de categorías). */
export function itemsParaAplicar(
  productos: ProductoCat[],
  catId: string,
  accion: 'agregar' | 'quitar',
): { id: string | number; nombre: string; nuevas: string[] }[] {
  return productos
    .map((p) => {
      const nuevas = nuevasCategorias(p, catId, accion)
      return nuevas ? { id: p.id, nombre: p.name, nuevas } : null
    })
    .filter((x): x is { id: string | number; nombre: string; nuevas: string[] } => x !== null)
}
