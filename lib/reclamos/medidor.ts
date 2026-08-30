/**
 * El medidor, del lado del navegador: lo que baja de `vista=medidor` y cómo se escribe.
 *
 * ⛔ **No vive en `cliente.ts` a propósito.** Ese archivo lo está tocando otra sesión (el `limit`
 * de 200, D12) y en este checkout ⛔ no hay merge: dos sesiones editando el mismo archivo se pisan.
 * El plan lo reparte así — ver `~/.claude/plans/…-curious-blum.md` § 3.
 *
 * La regla de **qué cuenta** —y por qué un mes puede no tener número— vive en `medidor.core.js`,
 * que también importa el servidor. Acá sólo se baja y se escribe.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import { SIN_NUMERO_LABEL } from './medidor.core.js'

const API = '/api/postventa?recurso=reclamos'

/** Un mes del medidor. `cada100` es `null` cuando `sinNumero` dice por qué ⛔ no hay cociente. */
export type MesMedido = {
  mes: string
  ventas: number
  reclamos: number
  cada100: number | null
  sinNumero: 'sin-registro' | 'sin-ventas' | null
  enCurso: boolean
}

export async function leerMedidor(marca: Marca): Promise<MesMedido[]> {
  const r = await apiFetch(`${API}&store=${marca}&vista=medidor&nc=${Date.now()}`)
  const d = await r.json().catch(() => ({}))
  if (!d || !d.ok) throw new Error(String(d?.error || 'No se pudo medir.'))
  return (d.meses || []) as MesMedido[]
}

const MES_LABEL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-08` → `ago 2026`. */
export function mesEnCriollo(mes: string): string {
  const [a, m] = String(mes).split('-').map(Number)
  return MES_LABEL[m - 1] ? `${MES_LABEL[m - 1]} ${a}` : String(mes)
}

/**
 * El número de un mes, o **por qué ⛔ no lo hay**.
 *
 * 🔑 El motivo sale de `SIN_NUMERO_LABEL`, ⛔ no de un `if` acá: si la pantalla decidiera por su
 * cuenta cuándo un mes ⛔ no tiene número, serían dos lados contestando lo mismo — y el que dibuja
 * y el que calcula ⛔ no tardan en desincronizarse.
 */
export function loQueDiceElMes(f: MesMedido): string {
  if (f.sinNumero) return SIN_NUMERO_LABEL[f.sinNumero] || 'sin número'
  return `${(f.cada100 as number).toLocaleString('es-AR', { maximumFractionDigits: 1 })} cada 100`
}
