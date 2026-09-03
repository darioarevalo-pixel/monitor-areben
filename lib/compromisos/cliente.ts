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

export async function cambiarEstado(id: string, estado: EstadoCompromiso): Promise<Compromiso> {
  const d = await pedir({ action: 'estado', id, estado })
  return d.compromiso as Compromiso
}

/**
 * La plata entró: que impacte en el dashboard. `monto_real` puede ser MENOR que lo prometido —
 * cuando pasa, el servidor cierra este compromiso por lo que entró y devuelve en `nueva` la
 * promesa que anotó sola por lo que falta.
 */
export async function confirmarCompromiso(
  id: string,
  monto_real: number,
  fecha: string,
): Promise<{ compromiso: Compromiso; nueva: Compromiso | null }> {
  const d = await pedir({ action: 'confirmar', id, monto_real, fecha })
  return { compromiso: d.compromiso as Compromiso, nueva: (d.nueva ?? null) as Compromiso | null }
}
