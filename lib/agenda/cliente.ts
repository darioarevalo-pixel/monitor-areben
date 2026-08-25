/**
 * Agenda operativa, del lado del cliente (`/api/datos?recurso=agenda`).
 *
 * Sin `store` en ninguna llamada, igual que Novedades y a diferencia de casi todo el resto del
 * monitor: una promoción bancaria la define el banco y no es de una marca. Que valga sólo para una
 * se dice con el campo `marcas` de la promo. Ver el encabezado de `sql/migrate-agenda.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { DatosAgenda, FechaIso, ItemAgenda, Promo, Puerta } from './tipos'

const API = '/api/datos?recurso=agenda'

/** Id nuevo, generado en el cliente para pintar la fila sin esperar al servidor. */
export function nuevoIdPromo(): string {
  return `pr${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Lo mismo para un pendiente. El prefijo distinto es para reconocerlo de un vistazo en la base. */
export function nuevoIdItem(): string {
  return `it${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function leerAgenda(): Promise<DatosAgenda> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la agenda.')
  return {
    promos: d.promos || [],
    items: d.items || [],
    hechos: d.hechos || [],
    puede: d.puede || { cargar: false },
  }
}

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él, Vercel no parsea el cuerpo y el
 * handler contesta por el primer campo que le falta — o sea, señala a quien llama y no a la
 * cabecera que falta. Mismo arreglo que en `lib/novedades/cliente.ts`.
 */
async function postear(body: Record<string, unknown>, siFalla: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'agenda', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
}

/**
 * El mismo POST, pero devolviendo lo que contestó el servidor. Es aparte de `postear` para no
 * cambiarle el tipo a los seis verbos que no miran la respuesta.
 */
async function postearConRespuesta(body: Record<string, unknown>, siFalla: string): Promise<Record<string, unknown>> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'agenda', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d as Record<string, unknown>
}

/**
 * «Entró mercadería»: siembra la lista corta del ingreso clonando los moldes de esa puerta y marca.
 *
 * `puerta` y `marca` son **las dos obligatorias**: la puerta porque el nombre y la descripción
 * cambian de dueña según por dónde entró el producto, y la marca porque la descripción de una
 * compra nacional la escribe el local en Zattia y Administración en BDI. Sin alguna, el servidor
 * contesta 400 en vez de sembrar con la dueña equivocada.
 *
 * Devuelve cuántos renglones creó, o `ya: true` si ese ingreso ya estaba sembrado — el mismo aviso
 * dos veces no puede dejar veinte pendientes.
 */
export async function sembrarIngreso(nombre: string, fecha: FechaIso, puerta: Puerta, marca: Marca): Promise<{ creados: number; ya: boolean }> {
  const d = await postearConRespuesta({ action: 'ingreso', nombre, fecha, puerta, marca }, 'No se pudo sembrar el ingreso.')
  return { creados: Number(d?.creados) || 0, ya: !!d?.ya }
}

export function guardarPromo(promo: Promo): Promise<void> {
  return postear({ action: 'guardar-promo', promo }, 'No se pudo guardar la promoción.')
}

export function borrarPromo(id: string): Promise<void> {
  return postear({ action: 'borrar-promo', id }, 'No se pudo borrar la promoción.')
}

export function guardarItem(item: ItemAgenda): Promise<void> {
  return postear({ action: 'guardar-item', item }, 'No se pudo guardar el pendiente.')
}

export function borrarItem(id: string): Promise<void> {
  return postear({ action: 'borrar-item', id }, 'No se pudo borrar el pendiente.')
}

/**
 * Tildar un pendiente en un día.
 *
 * ⚠️ **La fecha va del cliente, y tiene que ir.** El servidor corre en UTC: a las 21:00 de Argentina
 * ya es mañana, así que si el día lo pusiera el handler, el último tilde de la tarde quedaría
 * anotado en el día siguiente y Cumplimiento mostraría el de hoy sin hacer. El servidor igual
 * valida que la fecha exista, que la regla caiga ese día y que no sea del futuro.
 */
export function marcarHecho(itemId: string, fecha: FechaIso, nota?: string): Promise<void> {
  return postear({ action: 'marcar', id: itemId, fecha, nota: nota ?? null }, 'No se pudo tildar.')
}

export function desmarcarHecho(itemId: string, fecha: FechaIso): Promise<void> {
  return postear({ action: 'desmarcar', id: itemId, fecha }, 'No se pudo destildar.')
}
