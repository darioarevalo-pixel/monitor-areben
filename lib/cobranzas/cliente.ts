/**
 * Cobranzas, del lado del navegador (`/api/datos?recurso=cobranzas`).
 *
 * El estado de cada orden lo decide el SERVIDOR con `lib/cobranzas/core.core.js`: acá ⛔ se vuelve
 * a calcular, se muestra lo que llega.
 */

import { apiFetch } from '@/lib/api-fetch'
import { adminBaseUrl } from '@/lib/tienda'
import type { Marca } from '@/lib/nav.datos'
import type { Cobro, EstadoCobro, FilaCobranza, Medio, NotaTn, OrdenCobro } from './tipos'

export type Respuesta = {
  filas: FilaCobranza[]
  cuenta: Record<EstadoCobro, number>
  /** Desde qué día se le pidieron las órdenes a TN. */
  desde: string
  puedeCobrar: boolean
}

async function leer<T>(r: Response, fallo: string): Promise<T> {
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error((d && d.error) || fallo)
  return d as T
}

export async function leerCobranzas(store: Marca): Promise<Respuesta> {
  const r = await apiFetch(`/api/datos?recurso=cobranzas&store=${store}&nc=${Date.now()}`)
  return leer<Respuesta>(r, 'No se pudieron leer las cobranzas.')
}

function post(body: Record<string, unknown>) {
  return apiFetch('/api/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'cobranzas', ...body }),
  })
}

export async function cobrar(
  store: Marca,
  orden: OrdenCobro,
  datos: { medio: Medio; monto: number; operacion: string },
  idem: string,
): Promise<Cobro> {
  const r = await post({
    store,
    action: 'cobrar',
    order_id: String(orden.id),
    numero: String(orden.number),
    orden_fecha: orden.fecha,
    medio: datos.medio,
    monto: datos.monto,
    operacion: datos.operacion.trim() || null,
    idem,
  })
  return (await leer<{ cobro: Cobro }>(r, 'No se pudo registrar el cobro.')).cobro
}

export async function anularCobro(store: Marca, id: string): Promise<Cobro> {
  const r = await post({ store, action: 'anular', id })
  return (await leer<{ cobro: Cobro }>(r, 'No se pudo anular el cobro.')).cobro
}

export async function reintentarNota(store: Marca, id: string): Promise<NotaTn> {
  const r = await post({ store, action: 'nota', id })
  return (await leer<{ nota_tn: NotaTn }>(r, 'No se pudo escribir la nota en Tienda Nube.')).nota_tn
}

/**
 * El link al pedido en el admin de Tienda Nube, donde se aprieta «pagado». Sale del mismo
 * `ADMIN_BASE` que los links de producto (`lib/tienda.core.js`), cambiando `/products` por
 * `/orders/<id>`. `null` si la marca no tiene admin conocido: ⛔ nunca un link de otra tienda.
 */
export function linkAdminTn(store: Marca, orderId: number | string): string | null {
  const base = adminBaseUrl(store)
  return base ? base.replace(/\/products$/, `/orders/${orderId}`) : null
}
