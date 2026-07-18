/**
 * Config compartida de Reposición (REPO_API). La usan Reposición, Conteo (para
 * `catsOff` al agrupar) y Sesión de fotos / Solicitudes internas (prioridadRetiro).
 * Port de `repoCfg` (index.html:11205) y `repoCfgLoad` (11310).
 */

export type RepoCfg = {
  /** clave (subcat/modelo/cat) → mínimo. */
  mins: Record<string, number>
  /** pids apagados (no se reponen). */
  apagados: string[]
  defaultMin: number
  reservaDeposito: number
  reservaTodos: boolean
  /** pid → tope por producto. */
  topes: Record<string, number>
  /** categorías a ignorar al agrupar. */
  catsOff: string[]
  prioridadRetiro: 'deposito' | 'local'
}

export function repoCfgDefault(): RepoCfg {
  return { mins: {}, apagados: [], defaultMin: 4, reservaDeposito: 1, reservaTodos: true, topes: {}, catsOff: [], prioridadRetiro: 'deposito' }
}

/** Una variante agregada del reporte de reposición. Port de la forma de `repoInv` (index.html:11206). */
export type RepoItem = {
  vid: string
  pid: string
  sid: string
  name: string
  size: string
  sku: string
  local: number
  deposito: number
  /** Categorías candidatas (GN + TN, ya filtradas). */
  cats: string[]
  /** Categoría de respaldo (la de GN). */
  catFallback: string
  /** Categoría efectiva (subcat elegida o catFallback). */
  cat: string
  /** Subcategoría = primera candidata no ignorada (catsOff). */
  subcat: string | null
  /** Modelo de iPhone si el talle lo incluye. */
  modelo: string | null
  /** Ventas que descuentan del local, últimos 7d. */
  s7: number
  /** Ubicación física (observación de GN). */
  ubic: string
}
