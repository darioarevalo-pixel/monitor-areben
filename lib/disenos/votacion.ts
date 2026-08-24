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
  created_at: string
  /** Cuántas personas votaron. Lo calcula el servidor en una sola consulta. */
  votantes: number
  /**
   * Cuántos diseños entraron a la ronda.
   *
   * 🔑 Es un número y no la lista: el snapshot congela la `url` de cada diseño y los viejos la
   * tienen en base64, así que el listado —hasta 50 rondas— mandaba megas de fotos para que la
   * pantalla usara `.length`. La lista completa sigue viniendo en `vista=resultados`, que es la
   * única que pinta miniaturas.
   */
  nDisenos: number
}

/** Lo que la ronda dice de UN diseño. `promedio: null` = no lo votó nadie, ⛔ nunca 0. */
export type PuntajeDiseno = { n: number; promedio: number | null }

/** El resumen de una ronda, por id de diseño. Es lo que pinta el ★ de cada tarjeta. */
export type PuntajesDeRonda = Record<string, PuntajeDiseno>

/** La cabecera de la ronda que se está mirando, sin su snapshot. */
export type CabeceraDeRonda = Pick<Ronda, 'id' | 'titulo' | 'token_vence' | 'cerrada_at' | 'created_at' | 'nDisenos'>

export type ResumenDeRonda = {
  /** `null` cuando la marca todavía no tuvo ninguna ronda. */
  ronda: CabeceraDeRonda | null
  votantes: number
  /** El promedio de TODOS los puntajes de la ronda. `null` si no votó nadie. */
  general: number | null
  puntajes: PuntajesDeRonda
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

/** La ronda tal como vuelve de `vista=resultados`: con el snapshot, porque ahí se pintan las fotos. */
export type RondaConDisenos = Ronda & { disenos: DisenoDeRonda[] }

export async function leerResultados(store: Marca, id: string): Promise<{ ronda: RondaConDisenos; boletas: Boleta[] }> {
  const d = await pedir(`${API}&store=${store}&id=${encodeURIComponent(id)}&vista=resultados&nc=${Date.now()}`)
  return { ronda: d.ronda as RondaConDisenos, boletas: (d.boletas || []) as Boleta[] }
}

/**
 * El resumen de una ronda: la cabecera y `{n, promedio}` por diseño. **Nada de fotos.**
 *
 * 🔑 Es la puerta que hace posible el ★ en cada tarjeta del tablero, que es donde Bruno lo pidió.
 * Pedirlo por `vista=resultados` habría costado el snapshot entero —con las fotos en base64 de los
 * diseños viejos— en cada entrada a la sección. Esta vista pesa ~1 KB tenga o no base64.
 *
 * Sin `id` devuelve **la última ronda creada**. Es una regla explícita y no "la abierta": con dos
 * rondas, "la última" es predecible y no cambia sola el día que una vence.
 */
export async function leerResumenRonda(store: Marca, id?: string): Promise<ResumenDeRonda> {
  const d = await pedir(`${API}&store=${store}&vista=resumen${id ? `&id=${encodeURIComponent(id)}` : ''}&nc=${Date.now()}`)
  return {
    ronda: (d.ronda || null) as CabeceraDeRonda | null,
    votantes: Number(d.votantes) || 0,
    general: d.general == null ? null : Number(d.general),
    puntajes: (d.puntajes || {}) as PuntajesDeRonda,
  }
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
