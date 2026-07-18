/**
 * Config compartida de Comisiones en su propio endpoint (`/api/comisiones`, NO el
 * `/ingresos` del seam). Los admins la persisten (con adminUser+adminPass, que el
 * server valida); todos la leen. Port de comCargarCompartida/comGuardarCompartida
 * (index.html:6032/6043).
 */

import type { Marca } from '../nav.generated'
import type { ComCfg } from './tipos'

const COM_API = 'https://bdi-catalogo.vercel.app/api/comisiones'

/** Lee la config compartida; null si no hay o falla (el llamador cae a la local). */
export async function leerConfigCompartida(marca: Marca): Promise<ComCfg | null> {
  try {
    const r = await fetch(`${COM_API}?store=${marca}`)
    const d = await r.json()
    if (d && d.ok && d.config && d.config.imp) return d.config as ComCfg
  } catch {
    /* sin conexión → queda la config local */
  }
  return null
}

/** Persiste la config compartida (solo admins). El server valida adminUser/adminPass. */
export async function guardarConfigCompartida(marca: Marca, config: ComCfg, adminUser: string, adminPass: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(COM_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: marca, config, adminUser, adminPass }),
    })
    const d = await r.json()
    return { ok: !!d.ok, error: d.error }
  } catch {
    return { ok: false, error: 'error de conexión' }
  }
}
