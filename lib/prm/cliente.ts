/**
 * PRM y Recorridas, del lado del navegador (`/api/datos?recurso=prm`).
 *
 * 🔑 **Un solo endpoint para las dos secciones**, con el permiso separado adentro por acción: leer
 * el padrón lo puede cualquiera de las dos, escribir lo de la calle es de Recorridas, y el enganche
 * con el proveedor del sistema de Ingresos es del PRM.
 */
import { apiFetch } from '@/lib/api-fetch'
import type { Recepcion } from '@/lib/recepciones/core'
import type { Compromiso, Interes, ProveedorLocal, Recorrida, Parada, Visita } from './tipos'

const API = '/api/datos?recurso=prm'

export type LocalConResumen = ProveedorLocal & {
  ultimaVisita: Pick<Visita, 'id' | 'local_id' | 'fecha' | 'opinion' | 'puntaje' | 'compre'> | null
  interesesAbiertos: number
  compromisosAbiertos: Compromiso[]
}

export type Ficha = {
  local: ProveedorLocal
  visitas: Visita[]
  intereses: Interes[]
  compromisos: Compromiso[]
  /**
   * Las OCs crudas del proveedor enganchado. 🔴 `null` = **no hay enganche**, que ⛔ no es lo mismo
   * que `[]` = enganchado y sin ninguna OC. La ficha tiene que decir cosas distintas en cada caso:
   * un cero afirma que no le compramos nunca, y sin enganche eso no se sabe.
   */
  recepciones: Recepcion[] | null
}

export type ParadaViva = Parada & {
  local: ProveedorLocal | null
  intereses: Interes[]
  compromisos: Compromiso[]
  ultimaVisita: Visita | null
}

export type Opciones = {
  deIngresos: { id: number; nombre: string }[]
  deGn: string[]
  /** 🔴 `false` = no se pudo preguntar. La columna `productos.proveedor` existe SÓLO en Zattia. */
  gnDisponible: boolean
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo hablar con el servidor.')
  return d as T
}

const q = (marca: string) => `${API}&store=${encodeURIComponent(marca)}`

export async function leerPadron(marca: string): Promise<LocalConResumen[]> {
  const d = await pedir<{ locales: LocalConResumen[] }>(`${q(marca)}&nc=${Date.now()}`)
  return d.locales || []
}

export async function leerFicha(marca: string, id: string): Promise<Ficha> {
  return pedir<Ficha>(`${q(marca)}&action=local&id=${encodeURIComponent(id)}&nc=${Date.now()}`)
}

export async function leerOpciones(marca: string): Promise<Opciones> {
  return pedir<Opciones>(`${q(marca)}&action=opciones&nc=${Date.now()}`)
}

export async function leerRecorridas(marca: string): Promise<Recorrida[]> {
  const d = await pedir<{ recorridas: Recorrida[] }>(`${q(marca)}&action=recorridas&nc=${Date.now()}`)
  return d.recorridas || []
}

/**
 * 🔴 **Todo el viaje en UN pedido.** En las galerías de Avellaneda no hay señal: moverse entre
 * paradas no puede pedir red. Por eso cada parada ya viene con sus intereses abiertos, sus
 * compromisos abiertos y la última visita.
 */
export async function leerRecorrida(marca: string, id: string): Promise<{ recorrida: Recorrida; paradas: ParadaViva[] }> {
  return pedir<{ recorrida: Recorrida; paradas: ParadaViva[] }>(
    `${q(marca)}&action=recorrida&id=${encodeURIComponent(id)}&nc=${Date.now()}`,
  )
}

export async function escribir<T = { ok: true }>(marca: string, action: string, datos: Record<string, unknown>): Promise<T> {
  return pedir<T>(q(marca), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, store: marca, ...datos }),
  })
}
