/**
 * Lecturas y guardado de Reposición. El inventario (Local+Depósito) y las ventas del local salen DIRECTO de Areben
 * Gestión (`leerReposicionErp`, 25-nov-2026); la config se guarda en REPO_API (compartida). Read-only sobre stock.
 * `ultimaSincronizacion` queda para Exhibición, que todavía lee el espejo.
 */

import { apiFetch } from '../api-fetch'
import { CUENTAS } from '../cuentas'
import type { Marca } from '../nav.datos'
import { fetchAll } from '../supabase/rest'
import type { RepoCfg } from './tipos'
import type { FilaInvRepo } from './inventario'
import { conUbicacionDelErp } from '@/lib/ubicaciones/erp-cliente'

const REPO_API = 'https://bdi-catalogo.vercel.app/api/reposicion'

/** Lo que Reposición lee de Areben Gestión (`api/_reposicion-erp.js`). */
export type DatosRepoErp = {
  /** Local + Depósito por variante, con la ubicación del ERP en `observation`. */
  inventario: FilaInvRepo[]
  /** Unidades vendidas que descuentan del Local, por ventana de días y variante (`pid_sid`). */
  ventas: Record<number, Record<string, number>>
  /** Cuándo el servidor leyó el libro: ES la hora del stock (⛔ hay una copia de por medio). */
  leidoEn: Date
}

/**
 * El stock y las ventas del local DIRECTO de Areben Gestión (Darío, 25-nov-2026). Antes salían del espejo de GN, que desde
 * el corte se llena una vez por día y cuya hora (`sync_state`) ya ⛔ se movía: la pantalla mostraba stock de la mañana con
 * una hora vieja. Ver `lib/reposicion/erp.core.js`.
 *
 * BDI: sólo el local. Zattia: local + Tienda Nube (el online se despacha desde el local). 🔴 Si Areben Gestión ⛔ contesta,
 * TIRA: una lista vacía parecería «no hay nada que reponer».
 */
export async function leerReposicionErp(marca: Marca, dias: number[]): Promise<DatosRepoErp> {
  const r = await apiFetch(`/api/deposito?recurso=reposicion-erp&marca=${marca}&dias=${[...new Set(dias)].join(',')}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d || !Array.isArray(d.inventario)) throw new Error(d?.error || `No se pudo leer Areben Gestión (HTTP ${r.status})`)
  // La ubicación vive SÓLO en el ERP desde el corte (motor sql/066): ordena el armado y la columna «Ubic.» del PDF.
  const inventario = await conUbicacionDelErp(marca, d.inventario as FilaInvRepo[])
  return { inventario, ventas: d.ventas || {}, leidoEn: new Date(d.leidoEn) }
}

/**
 * Cuándo se escribió por última vez el espejo de inventario.
 *
 * 🔑 **Es la hora que la pantalla decía tener y no tenía.** «Actualizado: hh:mm» salía de un
 * `new Date()` en el navegador —la hora de la LECTURA—, así que un espejo del día anterior se
 * mostraba como recién traído, y esa misma hora falsa se imprimía en el PDF que se llevan al
 * depósito. El 4-sep-2026 el sync se pasó del techo de espera y el local vio «actualizado» con
 * el stock de ayer.
 *
 * Las dos claves son los dos syncs que escriben `inventario`: el rápido del botón (`inventario`)
 * y el nocturno (`diario`, que además trae ventas). Se toma la más reciente, igual que
 * `api/_ventas-diarias.js`. `null` si todavía no hay ninguna: la pantalla muestra «—», que es
 * honesto, en vez de inventar una hora.
 */
export async function ultimaSincronizacion(marca: Marca): Promise<Date | null> {
  try {
    const filas = await fetchAll<{ clave: string; updated_at: string | null }>(
      CUENTAS[marca],
      'sync_state',
      'select=clave,updated_at&clave=in.(inventario,diario)&order=clave',
    )
    const fechas = filas.map((f) => (f.updated_at ? new Date(f.updated_at).getTime() : 0)).filter((t) => t > 0)
    return fechas.length ? new Date(Math.max(...fechas)) : null
  } catch {
    // Que no se pueda leer el reloj no puede voltear la pantalla: el stock ya vino.
    return null
  }
}

/** Guarda la config compartida (mins/topes/apagados/…). Port de repoCfgSave @11314. */
export async function guardarRepoConfig(marca: Marca, config: RepoCfg): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await apiFetch(`${REPO_API}?store=${marca}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: marca, config }),
    })
    const d = await r.json()
    return { ok: !!d.ok, error: d.error }
  } catch {
    return { ok: false, error: 'error de conexión' }
  }
}
