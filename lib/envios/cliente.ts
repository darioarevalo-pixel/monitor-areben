/**
 * Envíos del día, del lado del cliente (`/api/datos?recurso=envios`).
 *
 * Sin `store` en ninguna llamada, igual que la Agenda y a diferencia de casi todo el resto del
 * monitor: el cadete sale con paquetes de las dos marcas en la misma mochila, así que la hoja es
 * una sola. La marca viaja **por envío**, no por pantalla. Ver `sql/migrate-envios.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav'
import type { CierreTurno, Envio, OrdenTN, Turno } from './tipos'

const API = '/api/datos?recurso=envios'
const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export type DatosDia = { fecha: string; envios: Envio[]; cierres: CierreTurno[] }

export async function leerDia(fecha: string): Promise<DatosDia> {
  const r = await apiFetch(`${API}&fecha=${fecha}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los envíos del día.')
  return { fecha, envios: d.envios || [], cierres: d.cierres || [] }
}

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él, Vercel no parsea el cuerpo y el
 * handler contesta por el primer campo que le falta — o sea, señala a quien llama y no a la cabecera
 * que falta. Es el mismo error que dio "store inválido" en Atención al cliente.
 */
async function postear<T = void>(body: Record<string, unknown>, siFalla: string): Promise<T> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'envios', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d as T
}

export async function guardarEnvio(envio: Partial<Envio>): Promise<void> {
  await postear({ action: 'guardar', envio }, 'No se pudo guardar el envío.')
}

/** La bandeja: los que ya se cotizaron y todavía no tienen día. */
export async function leerPendientes(): Promise<Envio[]> {
  const r = await apiFetch(`${API}&pendientes=1&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los envíos pendientes.')
  return (d.envios || []) as Envio[]
}

/**
 * Mandar un pendiente a un día y turno.
 *
 * Va como acción propia y no como un `guardar` con la fila entera porque es **el momento en que el
 * paquete entra a la calle**: es un solo hecho, viaja con dos campos, y así el handler puede exigir
 * que vayan juntos sin depender de que el cliente haya mandado el resto de la fila igual que estaba.
 */
export async function agendar(id: string, fecha: string, turno: Turno): Promise<void> {
  await postear({ action: 'agendar', id, fecha, turno }, 'No se pudo mandar el envío a ese día.')
}

/** Sacarlo del día y devolverlo a la bandeja: el cliente pospuso. */
export async function desagendar(id: string): Promise<void> {
  await postear({ action: 'desagendar', id }, 'No se pudo sacar el envío del día.')
}

/** El tilde de «ya lo pagó»: el cadete no lo cobra en la puerta, pero nos lo cobra a nosotros. */
export async function marcarPagado(id: string, pagado: boolean): Promise<void> {
  await postear({ action: 'pagado', id, envio_pagado: pagado }, 'No se pudo marcar el envío como pagado.')
}

/** Cotizar: el precio del envío, sin abrir la ficha. Sale del mapa de zonas. */
export async function guardarCosto(id: string, monto: number): Promise<void> {
  await postear({ action: 'costo', id, monto_envio: monto }, 'No se pudo guardar el precio del envío.')
}

export async function cambiarEstado(id: string, estado: string, cadete?: string | null): Promise<void> {
  await postear({ action: 'estado', id, estado, ...(cadete !== undefined ? { cadete } : {}) }, 'No se pudo cambiar el estado.')
}

export async function borrarEnvio(id: string): Promise<void> {
  await postear({ action: 'borrar', id }, 'No se pudo borrar el envío.')
}

export async function cerrarTurno(fecha: string, turno: Turno, pagado_al_cadete: number | null, rendido: number | null): Promise<void> {
  await postear({ action: 'cerrar-turno', fecha, turno, pagado_al_cadete, rendido }, 'No se pudo cerrar el turno.')
}

// ── Lo que viene de Tienda Nube ──────────────────────────────────────────────────────────────

/** Lo que devuelve el endpoint, más el resumen de cobertura que sirve para saber qué se puede medir. */
export type OrdenesDelDia = {
  ordenes: OrdenTN[]
  /** Cuántas órdenes del rango traen cada campo de envío lleno. Ver `coberturaEnvio` en el endpoint. */
  cobertura: Record<string, unknown> | null
}

/**
 * Las órdenes de Tienda Nube de un rango, para una marca.
 *
 * Va en modo `detalle` (el default del endpoint) a propósito: es el único camino correcto por
 * construcción. 🔴 **El rango tiene que ser corto**: el detalle pide una orden por vez y con nueve
 * días seguidos Tienda Nube corta por rate limit —se midió: 15 órdenes de 77, con 62 fallidas y un
 * `ok: true` igual—. El modo `lista`, que existía para barrer un mes, **hoy devuelve cero órdenes**
 * (lo canta `?probe=1`), así que no es una salida.
 */
export async function leerOrdenesTN(marca: Marca, desde: string, hasta: string): Promise<OrdenesDelDia> {
  const qs = new URLSearchParams({ ordenes: '1', store: marca, from: desde, to: hasta, limite: '200', nc: String(Date.now()) })
  const r = await apiFetch(`${AUDIT}?${qs.toString()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || `No se pudieron leer las órdenes de ${marca}.`)
  return { ordenes: (d.ordenes || []) as OrdenTN[], cobertura: d.envio_cobertura || null }
}
