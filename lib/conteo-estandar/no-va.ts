/**
 * «No va» del reporte «Para colgar», recordado entre conteos (27-sep-2026, lo pidió Bruno).
 * Se guarda por variante en el servidor (`api/_conteo-no-va.js`, tabla `conteo_no_va`) para que
 * lo vea cualquier teléfono. Mientras la tabla no exista, cae al `localStorage` de este teléfono
 * — el reporte ⛔ no se frena por eso — y la pantalla lo avisa.
 */

import { apiFetch } from '../api-fetch'
import type { Marca } from '../nav.datos'

const LS = (m: Marca) => `monitor_colgar_nova_${m}`
function leerLs(m: Marca): string[] {
  try {
    const x = JSON.parse(localStorage.getItem(LS(m)) || '[]')
    return Array.isArray(x) ? x.map(String) : []
  } catch {
    return []
  }
}
function guardarLs(m: Marca, claves: string[]) {
  try {
    localStorage.setItem(LS(m), JSON.stringify(claves))
  } catch {
    /* sin almacenamiento */
  }
}

export type NoVa = { claves: Set<string>; enServidor: boolean }

async function postNoVa(marca: Marca, dato: DatoNoVa, activo: boolean): Promise<boolean> {
  try {
    const r = await apiFetch('/api/deposito?recurso=no-va', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: marca, ...dato, ...(activo ? {} : { action: 'quitar' }) }),
    })
    const d = await r.json()
    return !!(d && d.ok)
  } catch {
    return false
  }
}

/**
 * Con el servidor andando, manda el servidor. Lo que se marcó en el teléfono antes de que
 * existiera la tabla se sube una vez y se limpia del teléfono (si no, desmarcar desde otro
 * teléfono no serviría: este lo volvería a traer).
 */
export async function leerNoVa(marca: Marca): Promise<NoVa> {
  const locales = leerLs(marca)
  try {
    const r = await apiFetch(`/api/deposito?recurso=no-va&store=${marca}&nc=${Date.now()}`)
    const d = await r.json()
    if (d && d.ok) {
      const claves = new Set<string>((d.claves || []).map(String))
      const pendientes = locales.filter((k) => !claves.has(k))
      const subidas = await Promise.all(pendientes.map((clave) => postNoVa(marca, { clave }, true)))
      pendientes.forEach((k, i) => subidas[i] && claves.add(k))
      guardarLs(marca, pendientes.filter((_, i) => !subidas[i]))
      return { claves, enServidor: true }
    }
  } catch {
    /* sin red o sin tabla: lo del teléfono */
  }
  return { claves: new Set(locales), enServidor: false }
}

export type DatoNoVa = { clave: string; producto?: string; variante?: string; sku?: string }

/** Marca o desmarca. Si el servidor no lo toma, queda en el teléfono. Devuelve si fue al servidor. */
export async function marcarNoVa(marca: Marca, dato: DatoNoVa, activo: boolean): Promise<boolean> {
  const ok = await postNoVa(marca, dato, activo)
  const locales = new Set(leerLs(marca))
  if (activo && !ok) locales.add(dato.clave)
  else locales.delete(dato.clave)
  guardarLs(marca, [...locales])
  return ok
}
