/**
 * Pagos recibidos, del lado del navegador (`/api/datos?recurso=pagos-recibidos`).
 *
 * Qué pagos cuentan lo decide el SERVIDOR (`lib/pagos-recibidos/core.core.js`): acá ⛔ se filtra
 * de nuevo, se muestra lo que llega. El total y `devueltos` sólo vienen si quien pide es admin.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'

export type Origen = 'mp' | 'banco' | 'tarjeta' | 'otro'

export type Pago = { id: string; monto: number; cuando: string; origen: Origen }

/** Una cuenta de MP cargada para la marca. ⛔ La llave no viaja nunca: sólo el nombre. */
export type Cuenta = { cuenta_id: number; nombre: string; enUso: boolean; ultimaVez: string | null }

export type Respuesta = {
  conectada: boolean
  dia: string
  hoy: string
  admin: boolean
  pagos?: Pago[]
  leidoEn?: string
  total?: number
  cantidad?: number
  devueltos?: Pago[]
  /** Sólo admin. */
  cuentas?: Cuenta[]
}

export const TEXTO_ORIGEN: Record<Origen, string> = {
  mp: 'desde Mercado Pago',
  banco: 'desde otro banco',
  tarjeta: 'con tarjeta',
  otro: 'otro medio',
}

export async function leerPagos(store: Marca, dia?: string): Promise<Respuesta> {
  const d = dia ? `&dia=${dia}` : ''
  const r = await apiFetch(`/api/datos?recurso=pagos-recibidos&store=${store}${d}&nc=${Date.now()}`)
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || 'No se pudieron leer los pagos.')
  return j as Respuesta
}

async function post<T>(body: Record<string, unknown>, fallo: string): Promise<T> {
  const r = await apiFetch('/api/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'pagos-recibidos', ...body }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || fallo)
  return j as T
}

/** De quién es la llave, según Mercado Pago. No guarda nada. */
export function verificarLlave(store: Marca, token: string) {
  return post<{ cuenta_id: number; nombre: string }>({ store, action: 'verificar', token }, 'No se pudo verificar la llave.')
}

/** Guarda la llave y pone esa cuenta en uso desde ahora. */
export function cargarLlave(store: Marca, token: string) {
  return post<{ cuentas: Cuenta[] }>({ store, action: 'cargar', token }, 'No se pudo guardar la cuenta.')
}

/** Vuelve a una cuenta ya cargada, desde ahora. */
export function usarCuenta(store: Marca, cuentaId: number) {
  return post<{ cuentas: Cuenta[] }>({ store, action: 'usar', cuenta_id: cuentaId }, 'No se pudo cambiar la cuenta.')
}
