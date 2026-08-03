/**
 * El calendario editorial, del lado del cliente (`/api/datos?recurso=calendario`).
 *
 * Sólo viaja lo que una persona decide: los hitos propios y la confirmación de una fecha comercial
 * anunciada. Las comerciales se calculan en `lib/calendario/fechas.core.js` y **no se piden al
 * servidor** — el tercer domingo de octubre no es un dato que haya que guardar, y guardarlo sería
 * garantizar que algún año quede desactualizado.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { FechaFijada, Hito } from './tipos'

const API = '/api/datos?recurso=calendario'

/** Id de hito. Se genera en el cliente, como en `disenos`, para pintar la fila sin ida y vuelta. */
export function nuevoIdHito(): string {
  return `h${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function leerCalendario(store: Marca): Promise<{ hitos: Hito[]; fijadas: FechaFijada[]; puede: { admin: boolean } }> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el calendario.')
  return { hitos: (d.hitos || []) as Hito[], fijadas: (d.fijadas || []) as FechaFijada[], puede: d.puede || { admin: false } }
}

async function postear(body: Record<string, unknown>, siFalla: string) {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d
}

export async function guardarHito(store: Marca, hito: Partial<Hito> & { id: string; titulo: string; fecha: string }): Promise<Hito> {
  const d = await postear({ store, hito }, 'No se pudo guardar el hito.')
  return d.hito as Hito
}

export async function borrarHito(store: Marca, id: string): Promise<void> {
  await postear({ store, id, action: 'borrar' }, 'No se pudo borrar el hito.')
}

/**
 * Confirma la fecha real de una comercial anunciada, para ese año.
 *
 * Es la acción que apaga el chip ámbar de "fecha estimada". Se guarda **por año** a propósito: el
 * Hot Sale del año que viene lo vuelve a decidir la cámara, así que confirmarlo una vez no puede
 * darlo por confirmado para siempre.
 */
export async function fijarFecha(store: Marca, clave: string, anio: number, fecha: string): Promise<void> {
  await postear({ store, action: 'fijar', clave, anio, fecha }, 'No se pudo confirmar la fecha.')
}

/** Vuelve a la fecha estimada del catálogo (para cuando se confirmó mal). */
export async function desfijarFecha(store: Marca, clave: string, anio: number): Promise<void> {
  await postear({ store, action: 'desfijar', clave, anio }, 'No se pudo volver a la fecha estimada.')
}
