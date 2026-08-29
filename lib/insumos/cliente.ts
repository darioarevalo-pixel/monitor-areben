/**
 * Insumos, del lado del navegador (`/api/datos?recurso=insumos`).
 *
 * ⛔ **Ninguna regla vive acá.** Esto trae y manda; qué significa lo que trae lo decide
 * `lib/insumos/core.ts`, que es el mismo que mira el derivador de avisos. Dos lugares que
 * contestaran «¿hay que reponer?» es exactamente donde se contestan distinto.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { DiaCompras, Insumo, Movimiento, Pedido, Ubicacion } from './tipos'

const API = '/api/datos?recurso=insumos'

export type DatosInsumos = {
  insumos: Insumo[]
  movimientos: Movimiento[]
  /** Los pedidos al proveedor, cancelados incluidos: la ficha muestra el historial. */
  pedidos: Pedido[]
  /** Las compras por día de cada marca que hizo falta medir. */
  comprasPorMarca: Record<string, DiaCompras[]>
  /** Las marcas cuyo ritmo NO se pudo medir. Va a la pantalla: callarse también miente. */
  sinRitmo: string[]
}

export async function leerInsumos(store: string): Promise<DatosInsumos> {
  const r = await apiFetch(`${API}&store=${encodeURIComponent(store)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los insumos.')
  return {
    insumos: (d.insumos || []) as Insumo[],
    movimientos: (d.movimientos || []) as Movimiento[],
    pedidos: (d.pedidos || []) as Pedido[],
    comprasPorMarca: (d.comprasPorMarca || {}) as Record<string, DiaCompras[]>,
    sinRitmo: (d.sinRitmo || []) as string[],
  }
}

async function escribir(store: string, cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recurso: 'insumos', store, ...cuerpo }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar.')
  return d as Record<string, unknown>
}

export const guardarInsumo = (store: string, insumo: Partial<Insumo>) =>
  escribir(store, { action: 'guardar-insumo', insumo })

export const borrarInsumo = (store: string, id: string) => escribir(store, { action: 'eliminar-insumo', id })

export const guardarPedido = (store: string, pedido: Partial<Pedido>) =>
  escribir(store, { action: 'guardar-pedido', pedido })

/** 🔑 Cancelar ⛔ no es borrar: el cancelado se queda y por eso la demora medida sobrevive. */
export const cancelarPedido = (store: string, id: string) => escribir(store, { action: 'cancelar-pedido', id })

export const borrarPedido = (store: string, id: string) => escribir(store, { action: 'eliminar-pedido', id })

export const guardarMovimiento = (store: string, movimiento: Partial<Movimiento>) =>
  escribir(store, { action: 'guardar-movimiento', movimiento })

export const borrarMovimiento = (store: string, id: string) => escribir(store, { action: 'eliminar-movimiento', id })

/**
 * 🔑 Un traslado es UN gesto acá y DOS filas allá. La pantalla no arma las dos patas: si lo
 * hiciera, un script que mueva mercadería tendría que volver a saber que son dos.
 */
export const trasladar = (
  store: string,
  x: { insumoId: string; origen: Ubicacion; destino: Ubicacion; cantidad: number; fecha: string; nota?: string | null },
) => escribir(store, { action: 'trasladar', ...x })
