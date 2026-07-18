/**
 * Lógica pura de Solicitudes internas: aprobación, filtros del historial y el
 * escaneo de devolución. Port de _siPendientes/siAprobar/siRechazar/siCerrar/
 * siListaRows(filtro)/siScan (index.html:10822-10993), sin DOM ni globales. Cada
 * función devuelve una copia nueva (para el estado de React).
 *
 * Reusa las primitivas de escaneo de Sesión de fotos (`resolverItem`, `normBc`):
 * el matcheo de un código contra la lista de ítems es idéntico.
 */

import { resolverItem } from '../sesionfotos/escaneo'
import type { EstadoSI, ItemSI, Origen, SolicitudInterna } from './tipos'

/** Consumos que esperan aprobación. Port de _siPendientes. */
export function pendientes(list: SolicitudInterna[]): SolicitudInterna[] {
  return (list || []).filter((s) => s.tipo === 'consumo' && s.estado === 'pendiente')
}

/** Cantidad de consumos pendientes (para el badge del aprobador). */
export function contarPendientes(list: SolicitudInterna[]): number {
  return pendientes(list).length
}

/** Aprueba un consumo. Port de siAprobar. */
export function aprobar(s: SolicitudInterna, por: string, fecha: string): SolicitudInterna {
  return { ...s, estado: 'aprobada', aprobadoPor: por || '', aprobadoFecha: fecha }
}

/** Rechaza un consumo. Port de siRechazar. */
export function rechazar(s: SolicitudInterna, motivo: string, por: string, fecha: string): SolicitudInterna {
  return { ...s, estado: 'rechazada', rechazadoMotivo: motivo, aprobadoPor: por || '', aprobadoFecha: fecha }
}

/** Archiva una solicitud (sale de "Activas"). Port de siCerrar. */
export function cerrar(s: SolicitudInterna): SolicitudInterna {
  return { ...s, estado: 'cerrada' }
}

export type FiltroSI = 'activas' | 'pendientes' | 'todas'

/**
 * Filtra el historial por pestaña y búsqueda. Port de siListaRows: `activas`
 * oculta cerradas y rechazadas; `pendientes` solo estado `pendiente`; `todas` no
 * filtra. La búsqueda cruza motivo, descripción y quién pidió.
 */
export function filtrarHistorial(list: SolicitudInterna[], filtro: FiltroSI, busqueda: string): SolicitudInterna[] {
  const q = String(busqueda || '').trim().toLowerCase()
  let lista = list || []
  if (filtro === 'pendientes') lista = lista.filter((s) => s.estado === 'pendiente')
  else if (filtro === 'activas') lista = lista.filter((s) => s.estado !== 'cerrada' && s.estado !== 'rechazada')
  if (q) {
    lista = lista.filter(
      (s) =>
        (s.motivo || '').toLowerCase().includes(q) ||
        (s.descripcion || '').toLowerCase().includes(q) ||
        (s.creadoPor || '').toLowerCase().includes(q),
    )
  }
  return lista
}

/** Unidades totales de una solicitud (para el resumen de la fila). */
export function unidades(s: SolicitudInterna): number {
  return (s.items || []).reduce((a, i) => a + (i.qty || 0), 0)
}

/** ¿Todos los ítems ya volvieron? (retornables). */
export function devolucionCompleta(s: SolicitudInterna): boolean {
  const dev = s.devuelto || {}
  return (s.items || []).length > 0 && s.items.every((i) => (dev[i.vid] || 0) >= i.qty)
}

/** ¿Se puede escanear la devolución? Retornable con venta creada, ya retirada/devuelta. Port del guard de siVerHtml. */
export function puedeDevolver(s: SolicitudInterna): boolean {
  return s.tipo === 'retornable' && !!s.ventas && (s.estado === 'retirada' || s.estado === 'devuelta')
}

export type ResultadoDevolucion =
  | { tipo: 'no-encontrado'; code: string }
  | { tipo: 'ya-completo'; nombre: string; variante: string; qty: number }
  | { tipo: 'ok'; nombre: string; variante: string; done: number; qty: number }

/**
 * Un escaneo de devolución sobre UN origen. Devuelve la solicitud (mutada si sumó)
 * y el resultado para el feedback. Al completar todos los ítems → estado
 * `devuelta`. Port de siScan.
 */
export function escanearDevolucion(
  s: SolicitudInterna,
  origen: Origen,
  code: string,
  mapa: Record<string, string>,
): { sol: SolicitudInterna; resultado: ResultadoDevolucion } {
  const arr = (s.items || []).filter((i) => i.origen === origen)
  // ItemSI es un subtipo estructural de ItemSolicitud (sólo le faltan los campos
  // opcionales nuevo/manual que acá no existen), así que resolverItem lo acepta.
  const it = resolverItem(arr, code, mapa, true) as ItemSI | null
  if (!it) return { sol: s, resultado: { tipo: 'no-encontrado', code } }
  const done = (s.devuelto || {})[it.vid] || 0
  if (done >= it.qty) {
    return { sol: s, resultado: { tipo: 'ya-completo', nombre: it.nombre, variante: it.variante, qty: it.qty } }
  }
  const devuelto = { ...(s.devuelto || {}), [it.vid]: done + 1 }
  const ns: SolicitudInterna = { ...s, devuelto }
  const estado: EstadoSI = devolucionCompleta(ns) ? 'devuelta' : ns.estado
  return { sol: { ...ns, estado }, resultado: { tipo: 'ok', nombre: it.nombre, variante: it.variante, done: done + 1, qty: it.qty } }
}
