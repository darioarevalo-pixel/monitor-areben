/**
 * Agenda operativa, del lado del cliente (`/api/datos?recurso=agenda`).
 *
 * Sin `store` en ninguna llamada, igual que Novedades y a diferencia de casi todo el resto del
 * monitor: una promoción bancaria la define el banco y no es de una marca. Que valga sólo para una
 * se dice con el campo `marcas` de la promo. Ver el encabezado de `sql/migrate-agenda.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { Plantilla } from './index'
import type { DatosAgenda, FechaIso, ItemAgenda, Promo } from './tipos'

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
 * Sembrar a mano **la plantilla que tenga botón**, sea cual sea.
 *
 * 🔑 **El modal es uno solo y ⛔ no sabe de puertas ni de promos**: la acción, el nombre del campo
 * del eje y toda la copia salen del catálogo (`plantillas.core.js`). El día que entre el 5º
 * disparador con botón, acá ⛔ no se toca nada.
 *
 * ⚠️ `valorDelEje` viaja con el nombre que dice la plantilla —`puerta`, `cambio`— porque cada
 * handler pide el suyo: el 400 que contesta cuando falta es el que nombra la pregunta.
 */
export async function sembrarAMano(
  plantilla: Plantilla,
  { nombre, fecha, eje, marca }: { nombre: string; fecha: FechaIso; eje: string; marca: Marca },
): Promise<{ creados: number; ya: boolean }> {
  if (!plantilla.pantalla) throw new Error(`«${plantilla.evento}» no se siembra a mano.`)
  const cuerpo: Record<string, unknown> = { action: plantilla.pantalla.action, nombre, fecha, marca }
  if (plantilla.eje) cuerpo[plantilla.eje.campoClon] = eje
  const d = await postearConRespuesta(cuerpo, 'No se pudieron cargar los pendientes.')
  return { creados: Number(d?.creados) || 0, ya: !!d?.ya }
}

/**
 * **Contestar la pregunta de la puerta**: elegir por dónde entró la OC y sembrar los seis pasos.
 *
 * ⚠️ Manda **el id de la pregunta y la puerta, y nada más**. El nombre, la fecha y la marca los
 * saca el servidor de la fila: si viajaran desde acá, esto sería un segundo «sembrá lo que quieras»
 * con otro nombre.
 */
export async function contestarPuerta(id: string, puerta: string): Promise<{ creados: number; ya: boolean; aviso?: string }> {
  const d = await postearConRespuesta({ action: 'ingreso-puerta', id, puerta }, 'No se pudieron cargar los pasos del ingreso.')
  return { creados: Number(d?.creados) || 0, ya: !!d?.ya, aviso: typeof d?.aviso === 'string' ? d.aviso : undefined }
}

/**
 * Lo que una promo sembró al guardarse, **una entrada por marca**: la promo la define el banco y
 * `marcas: []` quiere decir las dos tiendas, que son dos trabajos distintos.
 */
export type SiembraDeLaPromo = { marca: Marca; creados?: number; ya?: boolean; error?: string }

/**
 * Guardar una promo bancaria — y, si queda **prendida**, sembrar los pasos de comunicarla.
 *
 * 🔑 **Devuelve lo que sembró y ⛔ no `void`**: si los pendientes cayeran callados, quien cargó la
 * promo no tendría cómo saber que el trabajo salió, y una lista nueva que nadie ve es una lista que
 * nadie hace. La pantalla lo cuenta en el toast.
 */
export async function guardarPromo(promo: Promo): Promise<{ sembrado: SiembraDeLaPromo[] }> {
  const d = await postearConRespuesta({ action: 'guardar-promo', promo }, 'No se pudo guardar la promoción.')
  return { sembrado: Array.isArray(d?.sembrado) ? (d.sembrado as SiembraDeLaPromo[]) : [] }
}

export function borrarPromo(id: string): Promise<void> {
  return postear({ action: 'borrar-promo', id }, 'No se pudo eliminar la promoción.')
}

export function guardarItem(item: ItemAgenda): Promise<void> {
  return postear({ action: 'guardar-item', item }, 'No se pudo guardar el pendiente.')
}

export function borrarItem(id: string): Promise<void> {
  return postear({ action: 'borrar-item', id }, 'No se pudo eliminar el pendiente.')
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
