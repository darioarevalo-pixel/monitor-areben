/**
 * Lectura de la config de Reposición que Sesión de fotos necesita: solo
 * `prioridadRetiro` (rige el banner "Depósito/Local primero" y, en el armado, la
 * asignación de origen). Es la MISMA config compartida con Reposición
 * (`repoCfgLoad`, index.html:11310) — no se duplica: acá solo se lee.
 *
 * Read-only: si el fetch falla, cae al default 'deposito', igual que el legacy
 * (que deja `repoCfg` con su default ante error).
 */

import type { Marca } from '../nav.generated'
import type { Origen } from './tipos'

const REPO_API = 'https://bdi-catalogo.vercel.app/api/reposicion'

export async function leerPrioridadRetiro(marca: Marca): Promise<Origen> {
  try {
    const r = await fetch(`${REPO_API}?store=${marca}`)
    const d = await r.json()
    if (r.ok && d && d.ok && d.config) return d.config.prioridadRetiro === 'local' ? 'local' : 'deposito'
  } catch {
    /* default abajo */
  }
  return 'deposito'
}
