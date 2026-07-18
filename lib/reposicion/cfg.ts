/**
 * Lectura de la config compartida de Reposición (REPO_API). Port de repoCfgLoad
 * (index.html:11310): GET `?store=<marca>`, con defaults ante error/falta. Es la
 * MISMA config que `lib/sesionfotos/cfg.ts` lee para `prioridadRetiro`; acá se
 * expone entera (Conteo necesita `catsOff`; Reposición, todo).
 */

import type { Marca } from '../nav.generated'
import { repoCfgDefault, type RepoCfg } from './tipos'

const REPO_API = 'https://bdi-catalogo.vercel.app/api/reposicion'

export async function leerRepoConfig(marca: Marca): Promise<RepoCfg> {
  try {
    const r = await fetch(`${REPO_API}?store=${marca}`)
    const d = await r.json()
    if (d && d.ok && d.config) {
      const c = d.config
      return {
        mins: c.mins || {},
        apagados: (c.apagados || []).map(String),
        defaultMin: c.defaultMin ?? 4,
        reservaDeposito: c.reservaDeposito ?? 1,
        reservaTodos: c.reservaTodos ?? true,
        topes: c.topes || {},
        catsOff: c.catsOff || [],
        prioridadRetiro: c.prioridadRetiro === 'local' ? 'local' : 'deposito',
      }
    }
  } catch {
    /* default abajo */
  }
  return repoCfgDefault()
}
