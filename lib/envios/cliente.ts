/**
 * Envíos del día, del lado del cliente (`/api/datos?recurso=envios`).
 *
 * Sin `store` en ninguna llamada, igual que la Agenda y a diferencia de casi todo el resto del
 * monitor: el cadete sale con paquetes de las dos marcas en la misma mochila, así que la hoja es
 * una sola. La marca viaja **por envío**, no por pantalla. Ver `sql/migrate-envios.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav'
import type { CierreTurno, Envio, Turno } from './tipos'

const API = '/api/datos?recurso=envios'
const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

/** Id nuevo, generado en el cliente para pintar la fila sin esperar al servidor. */
export function nuevoIdEnvio(): string {
  return `en${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

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

/** Una orden de TN, con el bloque de envío que `mapOrdenTN` empezó a mandar el 13-ago-2026. */
type OrdenTN = {
  number: number | string
  cliente: string | null
  envio: string | null
  fecha: string | null
  envio_costo_cliente: number | null
  envio_tipo: string | null
  estado_pago: string | null
  estado_orden: string | null
  cancelada?: boolean
  envio_direccion: {
    nombre: string | null
    telefono: string | null
    calle: string | null
    numero: string | null
    piso: string | null
    localidad: string | null
    provincia: string | null
    cp: string | null
  } | null
}

/** Lo que devuelve el endpoint, más el resumen de cobertura que sirve para saber qué se puede medir. */
export type OrdenesDelDia = {
  ordenes: OrdenTN[]
  /** Cuántas órdenes del rango traen cada campo de envío lleno. Ver `coberturaEnvio` en el endpoint. */
  cobertura: Record<string, unknown> | null
}

/**
 * Las órdenes de Tienda Nube de un día, para una marca.
 *
 * Va en modo `detalle` (el default del endpoint) a propósito: es el único camino correcto por
 * construcción, y con ~2 envíos por día el modo rápido no compra nada. El modo `lista` existe para
 * cuando hay que barrer un mes entero, y antes de confiar en él hay que correrle el `?probe=1`.
 */
export async function leerOrdenesTN(marca: Marca, fecha: string): Promise<OrdenesDelDia> {
  const qs = new URLSearchParams({ ordenes: '1', store: marca, from: fecha, to: fecha, limite: '200', nc: String(Date.now()) })
  const r = await apiFetch(`${AUDIT}?${qs.toString()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || `No se pudieron leer las órdenes de ${marca}.`)
  return { ordenes: (d.ordenes || []) as OrdenTN[], cobertura: d.envio_cobertura || null }
}

/**
 * Una orden de TN convertida en una fila de la hoja del cadete.
 *
 * 🔑 **`envio_pagado` sale del estado de pago de la orden, no de un default.** En Tienda Nube el
 * envío se cobra dentro del total: si la orden está `paid`, el envío ya entró y en la puerta no se
 * cobra nada. Poner `false` "por las dudas" haría que cada etiqueta salga pidiendo plata que el
 * cliente ya pagó — y se midió que ése es el caso mayoritario, no el raro.
 */
export function ordenAEnvio(o: OrdenTN, marca: Marca, fecha: string, turno: Turno): Partial<Envio> {
  const d = o.envio_direccion || null
  const calle = [d?.calle, d?.numero].filter(Boolean).join(' ').trim()
  return {
    id: nuevoIdEnvio(),
    store: marca,
    fecha,
    turno,
    origen: 'tn',
    orden_numero: String(o.number),
    cliente: o.cliente || d?.nombre || null,
    telefono: d?.telefono || null,
    direccion: calle || '(sin dirección en la orden)',
    piso_depto: d?.piso || null,
    localidad: d?.localidad || null,
    anotacion: null,
    monto_envio: o.envio_costo_cliente ?? 0,
    envio_pagado: o.estado_pago === 'paid',
    monto_pedido_a_cobrar: 0,
    estado: 'pendiente',
    // La foto congelada: si el cliente cambia su dirección en TN mañana, la etiqueta ya salió con
    // la de hoy. Lo que se guardó es lo que el cadete tiene en la mano.
    datos: { tn: o as unknown as Record<string, unknown> },
  }
}

/** Las que no van a la calle: canceladas, o retiro en sucursal. */
export function vaAlReparto(o: OrdenTN): boolean {
  if (o.cancelada || o.estado_orden === 'cancelled') return false
  if (o.envio_tipo === 'pickup') return false
  return true
}
