import { NAV_CATS, PERM_CAT, type Marca, type NavCat, type PermCat } from './nav.generated'

export { NAV_CATS, PERM_CAT }
export type { Marca, NavCat, PermCat }

/**
 * El interruptor del strangler. Una key acá = esa sección la sirve el shell Next.
 * Cualquier otra se sigue sirviendo del legacy, embebida.
 *
 * Rollback: si una sección migrada sale mal, se saca la key de acá, push, y vuelve
 * la versión legacy. Sin revertir código.
 */
export const SECCIONES_MIGRADAS: ReadonlySet<string> = new Set([
  // Todavía ninguna: el shell arranca sirviendo todo del legacy.
])

export function estaMigrada(key: string): boolean {
  return SECCIONES_MIGRADAS.has(key)
}

/** 'usuarios' es caso especial: vive en NAV_CATS (adminOnly) pero no en PERM_CAT. */
export const KEYS_SIN_PERMISO = new Set(['usuarios', 'inicio', 'resumen'])

const PERM_POR_KEY = new Map<string, PermCat>(PERM_CAT.map((p) => [p.key, p]))

export function permDe(key: string): PermCat | undefined {
  return PERM_POR_KEY.get(key)
}

export function labelDe(key: string): string {
  return PERM_POR_KEY.get(key)?.label ?? key
}

/** Una sección existe para una marca si PERM_CAT la lista en `brands`. */
export function esDeMarca(key: string, marca: Marca): boolean {
  if (KEYS_SIN_PERMISO.has(key)) return true
  const p = PERM_POR_KEY.get(key)
  return !p ? false : p.brands.includes(marca)
}

/**
 * Conteo estándar: `conteo-estandar-zattia` y `conteo-estandar-stunned` son DOS
 * entradas de nav que apuntan a UNA sola sección del legacy (switchTab, index.html:6540).
 * La línea viaja como parte de la key y el legacy la resuelve con ceInit(linea).
 */
export const KEYS_CONTEO_ESTANDAR = ['conteo-estandar-zattia', 'conteo-estandar-stunned'] as const

export function esKeyValida(key: string): boolean {
  return PERM_POR_KEY.has(key) || KEYS_SIN_PERMISO.has(key)
}

/** Todas las keys que el router debe aceptar. */
export function todasLasKeys(): string[] {
  return [...PERM_CAT.map((p) => p.key), ...KEYS_SIN_PERMISO]
}
