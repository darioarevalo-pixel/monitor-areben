/**
 * Las rondas de votación del tablero de diseños, del lado del navegador.
 *
 * Dos puertas distintas y hay que saberlo:
 *   - `/api/datos?recurso=disenos-rondas` — con sesión y permiso. Lo usa la sección.
 *   - `/api/datos?recurso=votacion` — **abierto**, con el token del link. Lo usa el portal, que
 *     corre sin sesión y por eso pega con `fetch` pelado y no con `apiFetch`.
 *
 * La aritmética (promedios, ranking, saneado) NO está acá: vive en `votacion.core.js`, que es `.js`
 * plano porque lo comparten los dos handlers de `api/`, que corren en Node sin compilar TypeScript.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'

const API = '/api/datos?recurso=disenos-rondas'
const API_PUB = '/api/datos?recurso=votacion'

/** Un diseño tal como viaja a la ronda: tres campos y ninguno más (ver `votacion.core.js`). */
export type DisenoDeRonda = { id: string; name: string; url: string }

export type Ronda = {
  id: string
  store: Marca
  titulo: string
  token_vence: string
  cerrada_at: string | null
  creada_por: string | null
  disenos: DisenoDeRonda[]
  created_at: string
  /** Cuántas personas votaron. Lo calcula el servidor en una sola consulta. */
  votantes: number
}

export type Boleta = { votante_id: string; nombre: string; puntajes: Record<string, number>; updated_at: string }

/** Una ronda abierta es la que todavía suma votos: ni cerrada a mano ni con el token vencido. */
export function estaAbierta(r: Pick<Ronda, 'cerrada_at' | 'token_vence'>): boolean {
  if (r.cerrada_at) return false
  return new Date(r.token_vence).getTime() > Date.now()
}

/**
 * El link que se le pasa al equipo por WhatsApp.
 *
 * ⚠️ El token es obligatorio y tiene que ser el de verdad: con `undefined` armaba `/votacion/undefined`,
 * y el portal exige 32+ hex, o sea 404 garantizado. Ya rompió una vez en Reclamos.
 */
export function linkDeVotacion(token: string): string {
  if (!/^[a-f0-9]{32,128}$/i.test(token || '')) throw new Error('Token inválido: no se puede armar el link.')
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://monitor.arebensrl.com'
  return `${base}/votacion/${token}`
}

async function pedir(url: string, opts?: RequestInit) {
  const r = await apiFetch(url, opts)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo hablar con las rondas de votación.')
  return d
}

export async function leerRondas(store: Marca): Promise<Ronda[]> {
  const d = await pedir(`${API}&store=${store}&nc=${Date.now()}`)
  return (d.rondas || []) as Ronda[]
}

/** El token no viaja en el listado: se pide aparte, de a uno. */
export async function leerToken(store: Marca, id: string): Promise<string> {
  const d = await pedir(`${API}&store=${store}&id=${encodeURIComponent(id)}&vista=token`)
  return d.token as string
}

export async function leerResultados(store: Marca, id: string): Promise<{ ronda: Ronda; boletas: Boleta[] }> {
  const d = await pedir(`${API}&store=${store}&id=${encodeURIComponent(id)}&vista=resultados&nc=${Date.now()}`)
  return { ronda: d.ronda as Ronda, boletas: (d.boletas || []) as Boleta[] }
}

/**
 * Crea la ronda y devuelve el link ya armado. El servidor recorta el snapshot a `{id,name,url}`:
 * lo que se manda de más (la nota, el estado, los 👍/👎) no llega a la base.
 */
export async function crearRonda(
  store: Marca,
  titulo: string,
  disenos: { id: string; name: string; url: string }[],
  ids: string[],
): Promise<{ id: string; link: string }> {
  const d = await pedir(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'crear', titulo, disenos, ids }),
  })
  return { id: d.id as string, link: linkDeVotacion(d.token as string) }
}

/** Cierra la ronda: el link deja de abrir. Los votos quedan y el resultado se sigue viendo. */
export async function cerrarRonda(store: Marca, id: string): Promise<void> {
  await pedir(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store, action: 'cerrar', id }) })
}

/** Borra la ronda **y sus votos** (`on delete cascade`). Es el único verbo que pierde votos. */
export async function borrarRonda(store: Marca, id: string): Promise<void> {
  await pedir(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store, action: 'borrar', id }) })
}

// ── El portal, sin sesión ──────────────────────────────────────────────────────────────────────
// `fetch` pelado a propósito: `apiFetch` adjunta el sobre de credenciales del monitor, y quien abre
// el link no tiene ninguna. La llave es el token.

export type VistaDelVotante = { titulo: string; disenos: DisenoDeRonda[] }

/** `null` cuando el link no sirve (inválido, vencido o ronda cerrada): las tres dan 404 iguales. */
export async function leerVotacion(token: string, votanteId: string): Promise<{ votacion: VistaDelVotante; miBoleta: { nombre: string; puntajes: Record<string, number> } | null } | null> {
  const r = await fetch(`${API_PUB}&token=${encodeURIComponent(token)}&votanteId=${encodeURIComponent(votanteId)}&nc=${Date.now()}`)
  if (r.status === 404) return null
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo abrir la votación.')
  return { votacion: d.votacion as VistaDelVotante, miBoleta: d.miBoleta }
}

export async function guardarBoleta(token: string, votanteId: string, nombre: string, puntajes: Record<string, number>): Promise<void> {
  const r = await fetch(API_PUB, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'votacion', token, votanteId, nombre, puntajes }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar tu voto.')
}
