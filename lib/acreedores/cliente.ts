/**
 * "A quién le debemos", del lado del navegador (`/api/datos?recurso=acreedores`).
 *
 * ⛔ Sólo lee, y ni siquiera de una base del monitor: el saldo lo calcula **el dashboard** y acá
 * se lo muestra. No hay alta, ni edición, ni borrado. Las cuentas bancarias se cargan en el
 * dashboard (Finanzas → Acreedores), que es donde vive la ficha.
 */

import { apiFetch } from '@/lib/api-fetch'

export type ConceptoAcreedor = {
  id: string
  concepto: string
  mes: string
  fecha: string
  monto: number
  pagado: number
  saldo: number
  disponible: number
}

export type CuentaBancaria = {
  id: string
  alias: string | null
  cbu: string | null
  banco: string | null
  titular: string | null
  /** La que el dashboard tiene marcada como "la que se usa". Viene primera. */
  sugerida: boolean
}

export type Acreedor = {
  id: string
  nombre: string
  /** Lo que se le debe hoy. */
  saldo: number
  /** Cuánto se le puede pedir a un cliente que le transfiera. */
  disponible: number
  /**
   * Plata que ya se le mandó y el banco no debitó todavía (un cheque entregado). 🔑 Es la
   * diferencia entre las dos de arriba, y está para que nadie le mande la plata dos veces.
   */
  yaPagadoSinDebitar: number
  ultimoMovimiento: string | null
  conceptos: ConceptoAcreedor[]
  cuentas: CuentaBancaria[]
}

export type Respuesta = {
  acreedores: Acreedor[]
  /**
   * `null` = salió todo bien. Si el dashboard no contestó, viene el motivo escrito para leer y la
   * lista llega vacía: la sección se queda **sin los montos, no sin pantalla**.
   */
  aviso: string | null
}

export async function leerAcreedores(): Promise<Respuesta> {
  const r = await apiFetch(`/api/datos?recurso=acreedores&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error((d && d.error) || 'No se pudo leer a quién le debemos.')
  return { acreedores: (d?.acreedores || []) as Acreedor[], aviso: (d?.aviso ?? null) as string | null }
}
