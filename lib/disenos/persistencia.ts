/**
 * El tablero de diseños, compartido (`/api/datos?recurso=disenos`).
 *
 * Antes vivía en el `localStorage` de cada navegador, y eso lo dejaba a mitad de camino de ser un
 * tablero de equipo: lo que cargaba una persona no lo veía nadie más, limpiar el navegador borraba
 * todo, y como las fotos van embebidas el almacenamiento se llenaba y la app tenía que avisar que
 * ya no podía guardar.
 *
 * # Por qué el array local NO sale de este módulo
 *
 * La mudanza terminó en ago-2026, pero la clave vieja del navegador nunca se borró: la sección
 * ofrecía "subir lo que quedó acá" y comparaba esa lista contra los diseños de **la marca actual**.
 * 🔴 Y ahí estaba el agujero: el tablero viejo era **uno solo, sin marca**. Parado en Zattia —que
 * no tiene ni un diseño— la comparación daba "quedaron todos sin subir", el aviso volvía en cada
 * recarga por más que se lo cerrara, y apretar "Subirlos" **habría duplicado el tablero de BDI
 * adentro de Zattia**.
 *
 * Por eso acá afuera sólo salen **un número** (`contarLocales`) y **un borrado**
 * (`olvidarLocales`). Sin un array que subir, la duplicación no es un bug arreglado: es un bug que
 * no se puede escribir. `tests/disenos-persistencia.test.ts` lo fija afirmando que este módulo no
 * exporta `leerLocales` ni `localesParaImportar`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import { normalizarDiseno } from './core'
import type { Diseno } from './tipos'

const API = '/api/datos?recurso=disenos'

/** La clave vieja del navegador. Se lee para contar y se borra; ⛔ nunca para mandar. */
export const KEY_LOCAL = 'monitor_designboard_v1'
/** Que alguien ya dijo "no me lo muestres más" en ESTA computadora. */
export const KEY_LOCAL_OCULTO = 'monitor_designboard_v1_oculto'

let seqId = 0
const idDeRespaldo = () => 'd' + Date.now() + '_' + seqId++

export async function leerDisenos(store: Marca): Promise<Diseno[]> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el tablero de diseños.')
  // 🔴 Cada fila pasa por `normalizarDiseno`: las viejas todavía traen `up`/`down`/`nota` adentro
  // de `datos`, y si entraran al estado el diff los vería como cambio y devolvería el tablero
  // entero —con las fotos— a la base en cada entrada. Ver el docblock de `normalizarDiseno`.
  return ((d.disenos || []) as unknown[]).flatMap((f) => {
    const x = normalizarDiseno(f, idDeRespaldo)
    return x ? [x] : []
  })
}

/** Guarda uno o varios (upsert por id). Se llama con lo que cambió, no con el tablero entero. */
export async function guardarDisenos(store: Marca, disenos: Diseno[]): Promise<void> {
  if (!disenos.length) return
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, disenos }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar el diseño.')
}

export async function borrarDiseno(store: Marca, id: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, id, action: 'borrar' }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo borrar el diseño.')
}

/** Cuántos diseños quedaron guardados en ESTE navegador, del tablero viejo. */
export function contarLocales(): number {
  try {
    const raw = localStorage.getItem(KEY_LOCAL)
    if (!raw) return 0
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((d) => d && d.id).length : 0
  } catch {
    return 0
  }
}

/** Borra el tablero viejo de ESTE navegador. Devuelve cuántos se perdieron. */
export function olvidarLocales(): number {
  const n = contarLocales()
  try {
    localStorage.removeItem(KEY_LOCAL)
  } catch {
    /* modo privado: no hay nada que borrar */
  }
  return n
}

export function avisoLocalOculto(): boolean {
  try {
    return localStorage.getItem(KEY_LOCAL_OCULTO) === '1'
  } catch {
    return false
  }
}

export function ocultarAvisoLocal(): void {
  try {
    localStorage.setItem(KEY_LOCAL_OCULTO, '1')
  } catch {
    /* si no se puede guardar, el aviso vuelve: es lo menos malo */
  }
}
