/**
 * El buzón, del lado del navegador (`/api/datos?recurso=buzon`).
 */

import { apiFetch } from '@/lib/api-fetch'
import type { MensajeBuzon, MensajeNuevo } from './tipos'

const API = '/api/datos?recurso=buzon'

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él, Vercel no parsea el cuerpo, el
 * handler recibe un `req.body` vacío y contesta "falta id" — que suena a un error del que llama y
 * en realidad es esto.
 */
async function postear<T = void>(body: Record<string, unknown>, siFalla: string): Promise<T> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'buzon', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d as T
}

/**
 * Los mensajes. `soloAbiertos` es lo que pide Envíos: la hoja del día no necesita el histórico y
 * traerlo entero en cada carga de la pantalla que se abre veinte veces por día no se paga.
 */
export async function leerMensajes(soloAbiertos = false): Promise<MensajeBuzon[]> {
  const r = await apiFetch(`${API}${soloAbiertos ? '&abiertos=1' : ''}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los mensajes.')
  return (d.mensajes || []) as MensajeBuzon[]
}

export function guardarMensaje(mensaje: MensajeNuevo): Promise<{ id: string }> {
  return postear<{ id: string }>({ action: 'guardar', mensaje }, 'No se pudo guardar el mensaje.')
}

/** Cerrarlo. `accion` es obligatoria: un tilde sin decir qué se hizo no le sirve a quien lo lee después. */
export function resolverMensaje(id: string, accion: string): Promise<void> {
  return postear({ action: 'resolver', id, accion }, 'No se pudo marcar como resuelto.')
}

export function reabrirMensaje(id: string): Promise<void> {
  return postear({ action: 'reabrir', id }, 'No se pudo reabrir.')
}

export function borrarMensaje(id: string): Promise<void> {
  return postear({ action: 'borrar', id }, 'No se pudo borrar.')
}

/** Atar un mensaje suelto a una orden: es el verbo que enciende el freno en Envíos. */
export function atarAOrden(id: string, orden_numero: string | null): Promise<{ orden_numero: string | null }> {
  return postear<{ orden_numero: string | null }>({ action: 'atar', id, orden_numero }, 'No se pudo atar a la orden.')
}
