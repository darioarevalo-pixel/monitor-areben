/**
 * Las cuentas manuales, del lado del navegador (`/api/datos?recurso=cuentas`).
 *
 * Una cuenta manual es un lugar a dónde pedirle a un cliente que transfiera para algo que el
 * dashboard no conoce: la cuota del crédito, las bolsas, el alquiler. La ficha dura años; lo que se
 * prende y se apaga es el **objetivo** — cuánto hay que juntar esta vez.
 *
 * ⛔ Acá no se anota ni se confirma un compromiso: eso es `lib/compromisos/cliente.ts`, el mismo
 * circuito que usan los acreedores. Lo único distinto de una cuenta manual es de dónde sale el
 * techo de lo que se puede pedir.
 */

import { apiFetch } from '@/lib/api-fetch'
import {
  resumenObjetivo as resumenJS,
  seExcede as seExcedeJS,
  estadoCuenta as estadoJS,
} from './core.core.js'

const API = '/api/datos?recurso=cuentas'

/** Qué puede hacer quien está mirando. Lo decide el servidor, no la pantalla. */
export type PuedeCuentas = { ver: boolean; administrar: boolean }

/** La plata de una vuelta. La calcula `core.core.js`, que es la misma que aplica el servidor. */
export type PlataObjetivo = {
  /** Cuánto hay que juntar. */
  objetivo: number
  /** Lo que entró de verdad (la suma de lo confirmado). */
  juntado: number
  /** Lo que prometieron y todavía no entró. */
  comprometido: number
  /** objetivo − juntado. Lo que falta conseguir. */
  falta: number
  /** falta − comprometido. 🔑 Es el techo de un compromiso nuevo, y el número que decide. */
  sePuedePedir: number
  completo: boolean
  cuantos: number
  cuantosEnCamino: number
}

export type Objetivo = PlataObjetivo & {
  id: string
  cuenta_id: string
  monto: number
  /** "Cuota de septiembre". Para reconocer la vuelta en el historial. */
  nota: string | null
  estado: 'juntando' | 'completo' | 'cancelado'
  abierto_en: string
  abierto_por: string | null
  cerrado_en: string | null
  cerrado_por: string | null
}

export type CuentaManual = {
  id: string
  nombre: string
  para_que: string | null
  cuenta_alias: string | null
  cuenta_cbu: string | null
  cuenta_banco: string | null
  cuenta_titular: string | null
  archivada: boolean
  creado_en: string
  creado_por: string | null
  /** Lo que se está juntando ahora. `null` = la cuenta está dormida, y es un estado normal. */
  objetivo: Objetivo | null
  /** Las vueltas anteriores, de la más nueva a la más vieja. */
  historial: Objetivo[]
}

export type DatosCuenta = {
  nombre: string
  para_que?: string | null
  cuenta_alias?: string | null
  cuenta_cbu?: string | null
  cuenta_banco?: string | null
  cuenta_titular?: string | null
}

export const resumenObjetivo: (
  objetivo: { id: string; monto: number | string },
  compromisos: { objetivo_id: string | null; estado: string; monto: number; monto_confirmado: number | null }[],
) => PlataObjetivo = resumenJS

export const seExcede: (falta: number, entro: number) => number = seExcedeJS
export const estadoCuenta: (cuenta: { archivada?: boolean; objetivo?: unknown }) => string = estadoJS

async function pedir(body: Record<string, unknown>) {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'cuentas', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error((d && d.error) || 'No se pudo guardar.')
  return d
}

export async function leerCuentas(): Promise<{ cuentas: CuentaManual[]; puede: PuedeCuentas }> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error((d && d.error) || 'No se pudieron leer las cuentas.')
  return {
    cuentas: (d?.cuentas || []) as CuentaManual[],
    puede: (d?.puede || { ver: false, administrar: false }) as PuedeCuentas,
  }
}

export async function crearCuenta(cuenta: DatosCuenta): Promise<CuentaManual> {
  const d = await pedir({ action: 'crear', cuenta })
  return d.cuenta as CuentaManual
}

export async function editarCuenta(id: string, cuenta: DatosCuenta): Promise<CuentaManual> {
  const d = await pedir({ action: 'editar', id, cuenta })
  return d.cuenta as CuentaManual
}

export async function archivarCuenta(id: string, archivada: boolean): Promise<CuentaManual> {
  const d = await pedir({ action: 'archivar', id, archivada })
  return d.cuenta as CuentaManual
}

/**
 * Prende la cuenta: a partir de acá se le puede pedir plata a un cliente para esto.
 *
 * ⚠️ Una sola vuelta abierta por cuenta, y lo garantiza la base. Si ya hay una, esto tira el
 * error escrito para leer que devuelve el handler.
 */
export async function empezarAJuntar(id: string, monto: number, nota?: string | null): Promise<Objetivo> {
  const d = await pedir({ action: 'cargar', id, monto, nota: nota || null })
  return d.objetivo as Objetivo
}

/** Se movió la cuota: cambiar cuánto hay que juntar sin perder lo que ya entró. */
export async function cambiarMonto(objetivo_id: string, monto: number, nota?: string | null): Promise<Objetivo> {
  const d = await pedir({ action: 'cambiar-monto', objetivo_id, monto, ...(nota === undefined ? {} : { nota }) })
  return d.objetivo as Objetivo
}

/**
 * Apagar la cuenta a mano. Lo normal es que se apague sola al llegar al monto.
 *
 * - `completo`  ya está pagado con lo que haya entrado.
 * - `cancelado` se paga de otra forma: dejar de juntar.
 */
export async function cerrarObjetivo(
  objetivo_id: string,
  estado: 'completo' | 'cancelado',
): Promise<{ objetivo: Objetivo; abiertos: number }> {
  const d = await pedir({ action: 'cerrar', objetivo_id, estado })
  return { objetivo: d.objetivo as Objetivo, abiertos: Number(d.abiertos || 0) }
}
