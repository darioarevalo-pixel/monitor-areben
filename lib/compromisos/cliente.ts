/**
 * Las promesas de pago, del lado del navegador (`/api/datos?recurso=compromisos`).
 *
 * ⚠️ `confirmar` es el único de estos verbos que mueve plata: escribe el pago en el ledger del
 * dashboard. Los otros dos sólo tocan la tabla del monitor.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Compromiso, EstadoCompromiso } from './core'

const API = '/api/datos?recurso=compromisos'

/** Qué puede hacer quien está mirando. Lo decide el servidor, no la pantalla. */
export type PuedeCompromisos = { ver: boolean; prometer: boolean; confirmar: boolean }

export type NuevoCompromiso = {
  acreedor_id: string
  acreedor_nombre: string
  cuenta_alias?: string | null
  cuenta_cbu?: string | null
  cuenta_banco?: string | null
  cuenta_titular?: string | null
  cliente_id?: string | null
  cliente_store?: string
  cliente_nombre: string
  /** El teléfono del chat, ya normalizado. Va cuando el cliente todavía no existe en Gestión Nube. */
  cliente_telefono?: string | null
  /**
   * ⚠️ Casi nunca va: a nombre de quién viene la transferencia se pregunta al CONFIRMAR, mirando el
   * extracto. Sólo se manda cuando el cliente lo dijo en la charla ("te transfiere mi socio").
   */
  titular_real?: string | null
  monto: number
  fecha_prometida?: string | null
  notas?: string | null
  viene_de?: string | null
}

async function pedir(body: Record<string, unknown>) {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'compromisos', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error((d && d.error) || 'No se pudo guardar.')
  return d
}

export async function leerCompromisos(): Promise<{ compromisos: Compromiso[]; puede: PuedeCompromisos }> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error((d && d.error) || 'No se pudieron leer las promesas.')
  return {
    compromisos: (d?.compromisos || []) as Compromiso[],
    puede: (d?.puede || { ver: false, prometer: false, confirmar: false }) as PuedeCompromisos,
  }
}

export async function crearCompromiso(compromiso: NuevoCompromiso): Promise<Compromiso> {
  const d = await pedir({ action: 'crear', compromiso })
  return d.compromiso as Compromiso
}

/**
 * El cliente por fin existe en Gestión Nube: colgarle la promesa que se había anotado a mano.
 *
 * ⛔ Sólo sirve para las que todavía no se confirmaron. Una confirmada ya le mandó el pagador al
 * dashboard, y vincularla acá dejaría al pago del ledger apuntando a otro lado.
 */
export async function vincularCompromiso(
  id: string,
  cliente: { id: string; nombre: string; store?: string },
): Promise<Compromiso> {
  const d = await pedir({
    action: 'vincular',
    id,
    cliente_id: cliente.id,
    cliente_nombre: cliente.nombre,
    cliente_store: cliente.store || 'bdi',
  })
  return d.compromiso as Compromiso
}

export async function cambiarEstado(id: string, estado: EstadoCompromiso): Promise<Compromiso> {
  const d = await pedir({ action: 'estado', id, estado })
  return d.compromiso as Compromiso
}

/**
 * La plata entró: que impacte en el dashboard. `monto_real` puede ser MENOR que lo prometido —
 * cuando pasa, el servidor cierra este compromiso por lo que entró y devuelve en `nueva` la
 * promesa que anotó sola por lo que falta.
 *
 * 🔑 `titular_real` es **a nombre de quién vino la transferencia**, y se pasa acá y no al prometer:
 * es un dato que se lee del extracto, no que se adivina en la charla. Vacío = transfirió el
 * cliente, que es el caso más común.
 */
export async function confirmarCompromiso(
  id: string,
  monto_real: number,
  fecha: string,
  titular_real?: string | null,
): Promise<{ compromiso: Compromiso; nueva: Compromiso | null }> {
  const d = await pedir({ action: 'confirmar', id, monto_real, fecha, titular_real: titular_real || null })
  return { compromiso: d.compromiso as Compromiso, nueva: (d.nueva ?? null) as Compromiso | null }
}
