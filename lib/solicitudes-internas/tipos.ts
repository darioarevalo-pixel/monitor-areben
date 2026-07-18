/**
 * Tipos de Solicitudes internas, escritos contra la forma REAL que guarda el
 * legacy en el KV (`kind=solicitudesinternas`, index.html:10911-10922), no
 * idealizados.
 *
 * Una solicitud interna es un retiro de productos para uso interno (moldería,
 * video, muestra, consumo). Es el **gemelo de Sesión de fotos** —comparte el
 * ciclo retiro→venta GN→devolución y la forma `{list}` del KV— con dos capas
 * propias:
 *
 * 1. **Motivo + tipo.** `retornable` (vuelve y se repone, igual que Sesión de
 *    fotos) o `consumo` (no vuelve; baja definitiva de stock).
 * 2. **Aprobación.** Los consumos nacen `pendiente` y necesitan que un
 *    aprobador (admin o permiso `solicitudes-internas.aprobar`) los apruebe antes
 *    de poder descontar stock. Los retornables nacen ya `aprobada`.
 *
 * Por eso reusa el escaneo, la venta GN y la config de prioridad de
 * `lib/sesionfotos/`, pero tiene su propio ciclo de estados (más chico: no hay
 * fase de "preparado", el retiro es directo).
 */

import type { Origen, VentaGN } from '../sesionfotos/tipos'

export type { Origen, VentaGN }

/** Retornable (vuelve, se repone) o consumo (no vuelve, baja definitiva). */
export type TipoSol = 'retornable' | 'consumo'

/**
 * El ciclo de vida. Un consumo arranca `pendiente` → `aprobada`/`rechazada`; un
 * retornable arranca `aprobada`. Al crear la venta en GN → `retirada`. Al
 * completar la devolución (solo retornables) → `devuelta`. Cuando GN confirma que
 * la venta se anuló → `cerrada` (o, en un consumo `retirada`, se archiva a mano).
 */
export type EstadoSI = 'pendiente' | 'aprobada' | 'retirada' | 'devuelta' | 'cerrada' | 'rechazada'

/** Los motivos ofrecidos al armar (SI_MOTIVOS, index.html:10812). */
export const SI_MOTIVOS = ['Moldería', 'Video/contenido', 'Muestra', 'Consumo', 'Prueba', 'Otro'] as const

export type ItemSI = {
  vid: string
  pid: string | null
  sid: string | null
  nombre: string
  variante: string
  sku: string
  qty: number
  origen: Origen
  /** Stock de sistema al momento de armar (informativo). */
  stockDep?: number
  stockLoc?: number
  /** Código de barras del ítem (para el fallback del escaneo de devolución). */
  barcode?: string
}

export type SolicitudInterna = {
  id: string
  /** YYYY-MM-DD. */
  fecha: string
  /** Date.now() al crearla. */
  creado: number
  creadoPor: string
  motivo: string
  tipo: TipoSol
  descripcion: string
  estado: EstadoSI
  items: ItemSI[]
  /** Ventas creadas en GN, por origen. Su presencia marca "ya salió". */
  ventas?: Partial<Record<Origen, VentaGN>>
  /** Conteo de devolución por vid (solo retornables). */
  devuelto?: Record<string, number>
  /** Sólo consumos: quién y cuándo aprobó/rechazó, y el motivo del rechazo. */
  aprobadoPor?: string
  aprobadoFecha?: string
  rechazadoMotivo?: string
}
