/**
 * Acceso REST a Supabase. Port de sbFetch / sbFetchWithCount / fetchAll
 * (index.html:1943-1985).
 *
 * Dos cambios de forma respecto del legacy, ninguno de comportamiento:
 *
 *  - La cuenta viaja por parámetro en vez de leerse del global `currentCuenta`.
 *    Era el acoplamiento principal de toda la capa de datos: con esto, cambiar de
 *    marca deja de ser mutar una variable que medio archivo lee de refilón.
 *  - `fetchAll` no llama a setStatus (que tocaba el DOM). Reporta por callback.
 *
 * **Va contra Supabase desde el cliente, con la anon key, a propósito.** Moverlo a
 * un route handler hoy no agrega seguridad — la anon key ya es pública (ver
 * lib/cuentas.ts) — y rompería el caché compartido con el iframe. Tiene sentido
 * recién después de RLS (Fase S).
 */

import type { Cuenta } from '../cuentas'

function headers(cuenta: Cuenta, conCount = false): HeadersInit {
  const h: Record<string, string> = {
    apikey: cuenta.key,
    Authorization: 'Bearer ' + cuenta.key,
  }
  if (conCount) h['Prefer'] = 'count=exact'
  return h
}

export async function sbFetch<T = unknown>(cuenta: Cuenta, table: string, params: string): Promise<T[]> {
  const res = await fetch(`${cuenta.url}/rest/v1/${table}?${params}`, { headers: headers(cuenta) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status} en ${table}: ${text.substring(0, 150)}`)
  }
  return res.json()
}

export async function sbFetchWithCount<T = unknown>(
  cuenta: Cuenta,
  table: string,
  params: string,
): Promise<{ data: T[]; total: number }> {
  const res = await fetch(`${cuenta.url}/rest/v1/${table}?${params}`, { headers: headers(cuenta, true) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status} en ${table}: ${text.substring(0, 150)}`)
  }
  const range = res.headers.get('Content-Range') || ''
  const total = parseInt(range.split('/')[1] || '0', 10)
  const data = await res.json()
  return { data, total }
}

const BATCH_SIZE = 1000

/**
 * Trae una tabla entera paginando de a 1000.
 *
 * Pide la primera página con `count=exact` para saber el total y, si hace falta
 * más de una, dispara el resto **en paralelo sin límite de concurrencia** — igual
 * que el legacy. Con los volúmenes de hoy son pocas páginas; si algún día son
 * cientos, acá va el límite. Port literal: no es el commit para cambiarlo.
 */
export async function fetchAll<T = unknown>(
  cuenta: Cuenta,
  table: string,
  baseParams: string,
  onProgress?: (label: string) => void,
  label?: string,
): Promise<T[]> {
  const { data: first, total } = await sbFetchWithCount<T>(cuenta, table, `${baseParams}&limit=${BATCH_SIZE}&offset=0`)
  if (onProgress && label) onProgress(label)
  if (first.length >= total || first.length < BATCH_SIZE) return first

  const offsets: number[] = []
  for (let off = BATCH_SIZE; off < total; off += BATCH_SIZE) offsets.push(off)

  const pages = await Promise.all(
    offsets.map((off) => sbFetch<T>(cuenta, table, `${baseParams}&limit=${BATCH_SIZE}&offset=${off}`)),
  )
  return first.concat(...pages)
}
