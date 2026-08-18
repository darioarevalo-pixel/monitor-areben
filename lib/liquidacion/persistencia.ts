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
import type { EventoBitacora } from './bitacora'
import type { Colgadas } from './colgadas'
import type { EstadoCampania, EstadoItem, Liquidacion, LiquidacionItem, TipoCampania } from './tipos'

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

/**
 * Las campañas de la marca, la más nueva arriba, con sus conteos. Sin los ítems.
 *
 * `colgadas` viaja en la misma respuesta y no en una consulta aparte: es un aviso de la portada, se
 * lee siempre que se lee la lista, y pedirlo por separado sería un segundo viaje para dibujar la
 * misma pantalla. 🔑 **`null` quiere decir «no se pudo saber», y no «no hay»** — el handler lo
 * devuelve así si la consulta falla, para que un aviso roto no se lleve puesta la lista de campañas.
 */
export async function leerCampanias(store: Marca): Promise<{
  campanias: Liquidacion[]
  colgadas: Colgadas | null
  puede: Permisos
}> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las campañas de liquidación.')
  return {
    campanias: (d.campanias || []) as Liquidacion[],
    colgadas: (d.colgadas || null) as Colgadas | null,
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

/**
 * Lo mismo que `leerCampanias` + `leerItems`, pero por la **llave de Ventas de Marketing**
 * (`?resultado=1`): el servidor contesta los ítems **sin `foto.costo`, `foto.sinCosto`,
 * `decision.margen` ni `decision.markup`**.
 *
 * 🔑 **Devuelve `LiquidacionItem` igual, y no un tipo recortado.** Los cuatro campos que faltan no
 * los lee nadie en el camino del Resultado (medido con grep en `resultado.ts` y en `Resultado.tsx`
 * antes de escribir esto), así que un tipo aparte obligaría a duplicar `resultadoCampania` para que
 * lo acepte — o sea, dos implementaciones de la cuenta que importa, para proteger cuatro campos que
 * ya protege el servidor. ⚠️ Si alguna vez el Resultado necesita el costo, esto se cae en el
 * typecheck y no en la pantalla.
 */
export async function leerCampaniasParaResultado(store: Marca): Promise<Liquidacion[]> {
  const r = await apiFetch(`${API}&store=${store}&resultado=1&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las campañas de liquidación.')
  return (d.campanias || []) as Liquidacion[]
}

export async function leerItemsParaResultado(store: Marca, liqId: string): Promise<LiquidacionItem[]> {
  const r = await apiFetch(`${API}&store=${store}&liq=${encodeURIComponent(liqId)}&resultado=1&nc=${Date.now()}`)
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

/**
 * La bitácora de la campaña: cada precio que se escribió en Gestión Nube y cada uno que se sacó.
 *
 * Se pide aparte de los ítems y sólo cuando se abre la pestaña. Es una tabla que crece con cada
 * escritura —los 260 de agosto son 260 renglones de ida y van a ser otros 260 de vuelta—, así que
 * bajarla junto con las fotos congeladas pagaría el doble por una pantalla que casi no se mira.
 */
export async function leerBitacora(store: Marca, liqId: string): Promise<EventoBitacora[]> {
  const r = await apiFetch(`${API}&store=${store}&liq=${encodeURIComponent(liqId)}&bitacora=1&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la bitácora de la campaña.')
  return (d.eventos || []) as EventoBitacora[]
}

export async function crearCampania(
  store: Marca,
  campania: { id: string; nombre: string; tipo?: TipoCampania; desde?: string | null; hasta?: string | null; nota?: string | null },
): Promise<Liquidacion> {
  const d = await postear({ store, action: 'crear', campania }, 'No se pudo crear la campaña.')
  return d.campania as Liquidacion
}

/** Cambia nombre, tipo, fechas o nota. Lo que no venga queda como estaba. */
export async function renombrarCampania(
  store: Marca,
  id: string,
  cambios: { nombre?: string; tipo?: TipoCampania; desde?: string | null; hasta?: string | null; nota?: string | null },
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

/**
 * Guarda muchos ítems de una. Es `guardarItem` en lote, para el cambio de precio masivo.
 *
 * 🔑 **Acá el precio SÍ sale del cliente**, al revés que en `aplicarPrecios`: esto guarda una
 * decisión en nuestra base —lo mismo que hace cada "Definir"— y no le escribe nada a la tienda. La
 * cuenta la hace `decidirItem`, que es donde vive la regla de redondeo.
 */
export async function decidirMasivo(store: Marca, liqId: string, items: LiquidacionItem[]): Promise<number> {
  const d = await postear({ store, action: 'decidir-masivo', id: liqId, items }, 'No se pudieron guardar los precios.')
  return d.guardados || 0
}

/** Cómo le fue a cada producto contra Gestión Nube. El que falla se nombra; no se cuenta. */
export interface ResultadoAplicar {
  pid: string
  ok: boolean
  error?: string
  precio?: number | null
  /**
   * El precio se escribió y el ítem quedó bien, pero el evento no entró a la bitácora. No invalida
   * la operación; se avisa porque el registro es lo que después contesta "¿qué pasó con este
   * producto?", y un hueco silencioso ahí no se detecta nunca.
   */
  avisoBitacora?: string
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
  destino: 'lista' | 'previa' = 'lista',
): Promise<ResultadoAplicar[]> {
  const d = await postear(
    { store, action: 'aplicar', id: liqId, pids, modo, destino },
    modo === 'poner' ? 'No se pudieron escribir los precios en Gestión Nube.' : 'No se pudieron sacar las ofertas en Gestión Nube.',
  )
  return (d.resultados || []) as ResultadoAplicar[]
}

/** Lo que devolvió una sincronizada de ventas. */
export interface SyncVentas {
  /** ISO del momento en que se sincronizó. Si se salteó, es el de la sincronizada anterior. */
  ventasSync: string
  ventas: number
  detalles: number
  /** El pedido se salteó porque hace menos de un minuto que se había traído. No es un error. */
  salteado?: boolean
  /** Se llegó al tope de páginas: pueden faltar ventas. */
  truncado?: boolean
}

/**
 * Trae al espejo las ventas de ayer y hoy de la marca.
 *
 * 🔑 **Existe porque Resultado no lee Gestión Nube, lee el espejo**, y el espejo lo llena un sync
 * que corre una vez por día a las 3 de la mañana. Sin esto, una campaña que arrancó hoy se mira
 * contra los datos de ayer y contesta «no vendió» de todo.
 *
 * Pide admin, y **el día lo decide Argentina, no el reloj del servidor** (ver `ventanaVentasHoy` en
 * `api/_liquidacion.js`).
 */
export async function sincronizarVentas(store: Marca, liqId: string): Promise<SyncVentas> {
  const d = await postear(
    { store, action: 'sincronizar-ventas', id: liqId },
    'No se pudieron traer las ventas de hoy.',
  )
  return {
    ventasSync: String(d.ventasSync || ''),
    ventas: Number(d.ventas || 0),
    detalles: Number(d.detalles || 0),
    salteado: !!d.salteado,
    truncado: !!d.truncado,
  }
}

export async function borrarCampania(store: Marca, id: string): Promise<void> {
  await postear({ store, action: 'borrar', id }, 'No se pudo borrar la campaña.')
}
