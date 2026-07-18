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
