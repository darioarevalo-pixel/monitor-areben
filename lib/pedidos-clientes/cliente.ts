/**
 * Faltantes, del lado del navegador (`/api/datos?recurso=pedidos-clientes`).
 */

import { apiFetch } from '@/lib/api-fetch'
import type { EstadoPedido, PedidoCliente, PedidoNuevo } from './tipos'

const API = '/api/datos?recurso=pedidos-clientes'

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él, Vercel no parsea el cuerpo, el
 * handler recibe un `req.body` vacío y contesta «falta id» — que suena a un error del que llama y
 * en realidad es esto. Mismo tropiezo que ya costó una vez en `lib/buzon/cliente.ts`.
 */
async function postear<T = void>(store: string, body: Record<string, unknown>, siFalla: string): Promise<T> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'pedidos-clientes', store, ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d as T
}

/**
 * Todo lo anotado de esa marca.
 *
 * ⚠️ **Se trae la lista entera y la ventana la aplica el núcleo**, al revés que el buzón. Es a
 * propósito: la pantalla cambia de ventana (30 / 90 / 365) con un clic y, sobre todo, para poder
 * decir «hay 12 anotados de antes» cuando la ventana sale vacía hace falta tener esos 12. Un
 * recorte en el servidor haría que ese cartel —el que separa «nadie pide» de «nadie carga»— sea
 * imposible de escribir. El tope de 2.000 es el volumen de varios años de esta lista.
 */
export async function leerPedidos(store: string): Promise<{ pedidos: PedidoCliente[]; decidir: boolean }> {
  const r = await apiFetch(`${API}&store=${encodeURIComponent(store)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los faltantes.')
  // `decidir` lo contesta el servidor y no se deduce del perfil en el navegador: es el MISMO gate
  // que decide el 403, así que la pantalla no puede mostrar un botón que después rebota.
  return { pedidos: (d.pedidos || []) as PedidoCliente[], decidir: !!d.puede?.decidir }
}

export function guardarPedido(pedido: PedidoNuevo): Promise<{ id: string }> {
  return postear<{ id: string }>(pedido.store, { action: 'guardar', pedido }, 'No se pudo anotar.')
}

/**
 * Mover el estado: conseguido / descartado / de vuelta a pedido.
 *
 * 🔑 Pide el permiso de la sección y no alcanza con `atencion`, al revés que anotar: quien atiende
 * anota lo que le piden, pero decir «esto no lo vamos a traer» es la decisión de compra. Con el
 * mismo permiso, un descarte apurado en el mostrador borra la demanda de la vista del que compra.
 */
export function cambiarEstado(store: string, id: string, estado: EstadoPedido): Promise<void> {
  return postear(store, { action: 'estado', id, estado }, 'No se pudo cambiar el estado.')
}

export function borrarPedido(store: string, id: string): Promise<void> {
  return postear(store, { action: 'borrar', id }, 'No se pudo borrar.')
}
