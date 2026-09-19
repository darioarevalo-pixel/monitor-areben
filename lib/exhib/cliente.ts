/**
 * El chequeo de exhibición **libre**, del lado del navegador (`/api/datos?recurso=exhib`).
 *
 * Es la mitad que hasta el 19-sep-2026 ⛔ no existía: el recorrido vivía entero en el
 * `localStorage` del teléfono que escaneaba y lo que se marcaba en el local moría ahí.
 *
 * ⚠️ El modo **por categoría** ⛔ no pasa por acá y sigue siendo local (`useExhib.ts`). Son dos
 * recorridos distintos a propósito, y este archivo es sólo del libre.
 */
import { apiFetch } from '@/lib/api-fetch'
import type { EscaneoLibre, RecorridoLibre } from './libre'

const API = '/api/datos?recurso=exhib'

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo hablar con el servidor.')
  return d as T
}

const q = (marca: string) => `${API}&store=${encodeURIComponent(marca)}`

async function escribir<T = { ok: true }>(marca: string, action: string, datos: Record<string, unknown>): Promise<T> {
  return pedir<T>(q(marca), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, store: marca, ...datos }),
  })
}

/** Los recorridos de la marca, del más nuevo al más viejo, cada uno con cuántos escaneos tiene. */
export async function leerRecorridos(marca: string, limit = 50): Promise<RecorridoLibre[]> {
  const d = await pedir<{ recorridos: RecorridoLibre[] }>(`${q(marca)}&action=recorridos&limit=${limit}&nc=${Date.now()}`)
  return d.recorridos || []
}

/**
 * Un recorrido entero: cabecera + **todos** sus escaneos, en UN pedido.
 *
 * Misma razón que en Recorridas: quien lo abre puede estar en el local con media señal, y sobre
 * todo es lo que hace que el recorrido se pueda mirar y exportar desde otra máquina.
 */
export async function leerRecorrido(marca: string, id: string): Promise<{ recorrido: RecorridoLibre; escaneos: EscaneoLibre[] }> {
  return pedir<{ recorrido: RecorridoLibre; escaneos: EscaneoLibre[] }>(
    `${q(marca)}&action=recorrido&id=${encodeURIComponent(id)}&nc=${Date.now()}`,
  )
}

/** Los lugares ya usados en esta marca, para sugerir en el campo «Lugar». */
export async function leerLugares(marca: string): Promise<string[]> {
  const d = await pedir<{ lugares: string[] }>(`${q(marca)}&action=lugares&nc=${Date.now()}`)
  return d.lugares || []
}

/**
 * Abre el recorrido. El `id` lo genera el teléfono (`nuevoRecorridoId`) y ⛔ no la base: tiene que
 * poder arrancar y juntar escaneos sin haber hablado con el servidor todavía.
 *
 * ⚠️ La **persona** ⛔ no viaja: la pone el servidor desde el perfil logueado.
 */
export async function abrirRecorrido(marca: string, id: string, nota?: string): Promise<void> {
  await escribir(marca, 'abrir', { id, nota: nota ?? null })
}

/**
 * Sube una tanda de escaneos. **Entra un array** para que la cola juntada sin señal se vacíe en un
 * viaje, y reintentarla es inofensivo: el único de la base es (recorrido, lugar, variante).
 */
export async function subirEscaneos(marca: string, recorridoId: string, escaneos: EscaneoLibre[]): Promise<void> {
  await escribir(marca, 'escanear', { recorrido_id: recorridoId, escaneos })
}

export async function cerrarRecorrido(marca: string, id: string, nota?: string): Promise<void> {
  await escribir(marca, 'cerrar', { id, nota: nota ?? null })
}

/** Saca un escaneo (te equivocaste de lugar). Se borra por su clave, la misma que el único. */
export async function sacarEscaneo(marca: string, recorridoId: string, lugar: string, varianteId: string): Promise<void> {
  await escribir(marca, 'sacar-escaneo', { recorrido_id: recorridoId, lugar, variante_id: varianteId })
}
