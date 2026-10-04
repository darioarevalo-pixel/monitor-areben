/**
 * Ubicaciones depósito, del lado del cliente (`/api/datos?recurso=ubicaciones-local`).
 * ⚠️ El `Content-Type: application/json` de los POST NO es opcional. Ver `lib/agenda/cliente.ts`.
 */

import { apiFetch } from '@/lib/api-fetch'

const API = '/api/datos?recurso=ubicaciones-local&store=zattia'

export type ProductoEstante = { clave: string; nombre: string | null; bolsas: number }
export type Estante = { estante: string; escaneadoEn: string | null; escaneadoPor: string | null; productos: ProductoEstante[] }
export type Foto = { estantes: Estante[]; puede: { escanear: boolean } }

export type Controles = {
  bolsaSinStock: { clave: string; nombre: string | null; estantes: string[] }[]
  stockSinBolsa: { clave: string; nombre: string | null; enLocal: number; maxVariante: number }[]
}

async function leer<T>(r: Response, porDefecto: string): Promise<T> {
  const d = await r.json().catch(() => null)
  if (!r.ok || !d) throw new Error((d && d.error) || porDefecto)
  return d as T
}

export async function leerFoto(): Promise<Foto> {
  const d = await leer<Foto>(await apiFetch(`${API}&action=foto&nc=${Date.now()}`), 'No se pudieron leer los estantes.')
  return { estantes: d.estantes || [], puede: d.puede || { escanear: false } }
}

export async function leerControles(): Promise<Controles> {
  const d = await leer<Controles>(await apiFetch(`${API}&action=controles&nc=${Date.now()}`), 'No se pudieron leer los controles.')
  return { bolsaSinStock: d.bolsaSinStock || [], stockSinBolsa: d.stockSinBolsa || [] }
}

/** Lo que el Local del teléfono ⛔ reconoció: el servidor mira el inventario entero. `null` = no es ningún producto. */
export async function resolverEnServidor(codigo: string): Promise<{ clave: string; nombre: string | null; enLocal: number } | null> {
  const r = await apiFetch(`${API}&action=resolver&codigo=${encodeURIComponent(codigo)}`)
  if (r.status === 404) return null
  const d = await leer<{ tipo: string; clave: string; nombre: string | null; enLocal: number }>(r, 'No se pudo reconocer el código.')
  return d.tipo === 'bolsa' ? { clave: d.clave, nombre: d.nombre, enLocal: d.enLocal } : null
}

const post = (body: Record<string, unknown>) =>
  apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'ubicaciones-local', store: 'zattia', ...body }),
  })

/** Guarda el estante: REEMPLAZA lo que tenía. Los códigos que el servidor ⛔ reconoce vuelven en `sinResolver`. */
export async function guardarEstante(estante: string, lecturas: string[]): Promise<{ productos: ProductoEstante[]; sinResolver: string[] }> {
  const d = await leer<{ productos: ProductoEstante[]; sinResolver: string[] }>(await post({ action: 'guardar-estante', estante, lecturas }), 'No se pudo guardar el estante.')
  return { productos: d.productos || [], sinResolver: d.sinResolver || [] }
}

export async function eliminarEstante(estante: string): Promise<void> {
  await leer(await post({ action: 'eliminar-estante', estante }), 'No se pudo eliminar el estante.')
}
