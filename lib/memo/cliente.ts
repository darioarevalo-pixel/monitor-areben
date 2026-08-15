/**
 * El Friday memo, del lado del cliente (`/api/datos?recurso=memo`).
 *
 * Sin `store` en ninguna llamada, igual que Novedades: el memo es de la empresa y adentro tiene las
 * tres líneas. Ver el encabezado de `sql/migrate-memo.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Bloque, Campo, Foto, MemoSemana, Semana, Senales } from './tipos'

const API = '/api/datos?recurso=memo'

export type ListaMemos = {
  semanas: { id: string; ini: string; fin: string; estado: string; cerrado_at: string | null }[]
  actual: Semana
  hoy: string
  puede: { escribir: boolean }
}

export async function leerLista(): Promise<ListaMemos> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la lista de memos.')
  return { semanas: d.semanas || [], actual: d.actual, hoy: d.hoy, puede: d.puede || { escribir: false } }
}

export type MemoCompleto = { memo: MemoSemana; campos: Campo[]; puede: { escribir: boolean }; hoy: string }

export async function leerMemo(id: string): Promise<MemoCompleto> {
  const r = await apiFetch(`${API}&id=${encodeURIComponent(id)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el memo.')
  return { memo: d.memo, campos: d.campos || [], puede: d.puede || { escribir: false }, hoy: d.hoy }
}

/**
 * La foto en vivo, para la semana que todavía está abierta. Es la consulta cara del módulo (dos
 * semanas de `venta_detalles` en las dos bases), así que se pide una vez al abrir y no en cada
 * tecleo.
 */
export async function leerFotoViva(id: string): Promise<Foto> {
  const r = await apiFetch(`${API}&vista=foto&id=${encodeURIComponent(id)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron calcular los números de la semana.')
  return d.foto
}

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él Vercel no parsea el cuerpo y el
 * handler contesta por el primer campo que le falta — o sea, señala a quien llama y no a la
 * cabecera que falta. Mismo arreglo que en `lib/novedades/cliente.ts`.
 */
async function postear<T>(body: Record<string, unknown>, siFalla: string): Promise<T> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'memo', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d as T
}

export function guardarCampo(id: string, bloque: Bloque, clave: string, texto: string) {
  return postear<{ autor: string; updated_at: string }>(
    { accion: 'guardar-campo', id, bloque, clave, texto },
    'No se pudo guardar.',
  )
}

/**
 * Manda las señales que el panel Gerencial ya computó. El servidor las sella la PRIMERA vez y no
 * las vuelve a tocar — por eso esto se puede llamar cada vez que se abre el memo sin miedo.
 */
export function sellarSenales(id: string, senales: Senales) {
  return postear<{ yaEstaba?: boolean; senales_tomadas_at?: string }>(
    { accion: 'senales', id, senales },
    'No se pudieron guardar las señales.',
  )
}

export function cerrarMemo(id: string) {
  return postear<{ foto: Foto; cerrado_por: string; cerrado_at: string }>(
    { accion: 'cerrar', id },
    'No se pudo cerrar el memo.',
  )
}
