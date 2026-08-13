/**
 * Liquidación, del lado del cliente (`/api/datos?recurso=liquidacion`).
 *
 * 🔑 **Las campañas y sus ítems se piden por separado, y es a propósito.** La lista de campañas
 * trae sólo los conteos que arma el servidor; los ítems se bajan cuando se abre una. Una campaña de
 * cuarenta productos son cuarenta fotos congeladas con ventas, stock y costo — bajar todas las de
 * todas las campañas para dibujar una lista de cinco renglones sería pagar el payload entero para
 * mostrar un número.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { EstadoCampania, EstadoItem, Liquidacion, LiquidacionItem } from './tipos'

const API = '/api/datos?recurso=liquidacion'

export interface Permisos {
  /** Puede escribirle el precio a Gestión Nube (sub-permiso `liquidacion.aplicar`, tanda 3). */
  aplicar: boolean
  admin: boolean
}

async function postear(body: Record<string, unknown>, siFalla: string) {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d
}

/** Las campañas de la marca, la más nueva arriba, con sus conteos. Sin los ítems. */
export async function leerCampanias(store: Marca): Promise<{ campanias: Liquidacion[]; puede: Permisos }> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las campañas de liquidación.')
  return {
    campanias: (d.campanias || []) as Liquidacion[],
    puede: d.puede || { aplicar: false, admin: false },
  }
}

/** Los ítems de una campaña, con la foto congelada de cada producto. */
export async function leerItems(store: Marca, liqId: string): Promise<LiquidacionItem[]> {
  const r = await apiFetch(`${API}&store=${store}&liq=${encodeURIComponent(liqId)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los productos de la campaña.')
  return (d.items || []) as LiquidacionItem[]
}

/** Lo que la campaña tiene, en dos columnas: qué pid ya está y en qué estado quedó. */
export interface PidsCampania {
  campania: { id: string; nombre: string; estado: EstadoCampania }
  pids: Record<string, EstadoItem>
}

/**
 * Lo mismo que `leerItems` pero sin las fotos congeladas, para la tabla de Análisis.
 *
 * Análisis no pregunta "¿qué decidí?" sino "¿cuáles ya mandé?": con el pid y el estado alcanza para
 * atenuar la fila. Bajar el ítem entero sería traer cuarenta fotos con ventas, stock y costo para
 * dibujar un chip.
 */
export async function leerPidsCampania(store: Marca, liqId: string): Promise<PidsCampania> {
  const r = await apiFetch(`${API}&store=${store}&liq=${encodeURIComponent(liqId)}&solo=pids&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer qué productos ya están en la campaña.')
  return { campania: d.campania, pids: (d.pids || {}) as Record<string, EstadoItem> }
}

export async function crearCampania(
  store: Marca,
  campania: { id: string; nombre: string; desde?: string | null; hasta?: string | null; nota?: string | null },
): Promise<Liquidacion> {
  const d = await postear({ store, action: 'crear', campania }, 'No se pudo crear la campaña.')
  return d.campania as Liquidacion
}

/** Cambia nombre, fechas o nota. Lo que no venga queda como estaba. */
export async function renombrarCampania(
  store: Marca,
  id: string,
  cambios: { nombre?: string; desde?: string | null; hasta?: string | null; nota?: string | null },
): Promise<Liquidacion> {
  const d = await postear({ store, action: 'renombrar', id, ...cambios }, 'No se pudo guardar la campaña.')
  return d.campania as Liquidacion
}

export async function cambiarEstadoCampania(store: Marca, id: string, estado: EstadoCampania): Promise<void> {
  await postear({ store, action: 'estado', id, estado }, 'No se pudo cambiar el estado de la campaña.')
}

/**
 * Suma productos a una campaña. Los que ya estaban **no se pisan**.
 *
 * Es lo que hace "Mandar a liquidación" desde Análisis, y mandar dos veces el mismo producto es lo
 * normal: la selección de allá sobrevive a filtros y páginas, así que nadie se acuerda de a quién
 * ya mandó. Pisarlo le borraría el precio que alguien ya decidió; por eso el servidor inserta sólo
 * los nuevos y devuelve cuántos entraron de verdad.
 */
export async function sumarItems(
  store: Marca,
  liqId: string,
  items: LiquidacionItem[],
): Promise<{ sumados: number; yaEstaban: number }> {
  const d = await postear({ store, action: 'sumar-items', id: liqId, items }, 'No se pudieron sumar los productos.')
  return { sumados: d.sumados || 0, yaEstaban: d.yaEstaban || 0 }
}

/** Guarda un ítem entero (una fila). Es lo que toca cada "Definir". */
export async function guardarItem(store: Marca, liqId: string, item: LiquidacionItem): Promise<LiquidacionItem> {
  const d = await postear({ store, action: 'guardar-item', id: liqId, item }, 'No se pudo guardar el producto.')
  return d.item as LiquidacionItem
}

/**
 * La segunda mirada. Va por su propia acción y no por `guardarItem` porque **pide admin**: si el
 * estado `confirmado` pudiera viajar en un guardado común, quien pone el precio se confirmaría solo.
 */
export async function revisarItem(store: Marca, liqId: string, item: LiquidacionItem): Promise<LiquidacionItem> {
  const d = await postear({ store, action: 'revisar', id: liqId, item }, 'No se pudo guardar la revisión.')
  return d.item as LiquidacionItem
}

/** Cambia sólo el estado de un ítem (descartar, volver a pendiente). */
export async function estadoItem(store: Marca, liqId: string, pid: string, estado: EstadoItem): Promise<void> {
  await postear({ store, action: 'estado-item', id: liqId, pid, estado }, 'No se pudo cambiar el estado del producto.')
}

/** Saca el producto de la campaña. ⚠️ Distinto de descartarlo: descartar deja la huella. */
export async function quitarItem(store: Marca, liqId: string, pid: string): Promise<void> {
  await postear({ store, action: 'quitar-item', id: liqId, pid }, 'No se pudo quitar el producto.')
}

/** Cómo le fue a cada producto contra Gestión Nube. El que falla se nombra; no se cuenta. */
export interface ResultadoAplicar {
  pid: string
  ok: boolean
  error?: string
  precio?: number | null
}

/**
 * Escribe (o borra) el precio de sale de una tanda de productos en Gestión Nube.
 *
 * 🔑 **Van los pid, no los precios.** El handler los relee de la base: un precio que viaje desde el
 * navegador es un precio que se puede alterar, y del otro lado hay una tienda de verdad.
 *
 * 🔑 **De a `TOPE_APLICAR`, con el bucle afuera.** Contra el tope de Gestión Nube una campaña de 260
 * son unos 6 minutos, que no entran en el tiempo de una función. El que llama itera y muestra el
 * progreso; lo aplicado sale solo de la lista, así que cortar y retomar no reescribe nada.
 */
export async function aplicarPrecios(
  store: Marca,
  liqId: string,
  pids: string[],
  modo: 'poner' | 'sacar',
): Promise<ResultadoAplicar[]> {
  const d = await postear(
    { store, action: 'aplicar', id: liqId, pids, modo },
    modo === 'poner' ? 'No se pudieron escribir los precios en Gestión Nube.' : 'No se pudieron sacar las ofertas en Gestión Nube.',
  )
  return (d.resultados || []) as ResultadoAplicar[]
}

export async function borrarCampania(store: Marca, id: string): Promise<void> {
  await postear({ store, action: 'borrar', id }, 'No se pudo borrar la campaña.')
}
