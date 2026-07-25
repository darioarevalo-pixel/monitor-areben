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

import type { ProductoCat } from './tipos'

const ids = (p: ProductoCat): string[] => (p.category_ids || []).map(String)

/** ¿El producto está en esa categoría? */
export function tieneCategoria(p: ProductoCat, catId: string): boolean {
  return ids(p).includes(String(catId))
}

/** Los productos que HOY están en la categoría (lo que se ve en la tienda al entrar a ella). */
export function enCategoria(productos: ProductoCat[], catId: string): ProductoCat[] {
  return productos.filter((p) => tieneCategoria(p, catId)).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Búsqueda por nombre o SKU, para sumar productos que todavía no están en la categoría. */
export function buscar(productos: ProductoCat[], q: string, catId?: string): ProductoCat[] {
  const t = q.trim().toLowerCase()
  if (!t) return []
  return productos
    .filter((p) => !catId || !tieneCategoria(p, catId))
    .filter((p) => p.name.toLowerCase().includes(t) || (p.sku || '').toLowerCase().includes(t))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
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
