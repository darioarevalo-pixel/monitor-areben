/**
 * Lógica pura de Sesión de fotos: las derivaciones que el legacy calculaba
 * inline dentro de sus funciones de render (index.html:10167-10291). Acá viven
 * sin DOM para poder testearlas contra el comportamiento legacy (paridad) y para
 * que el render en Next sea una proyección de estos valores, no una copia de la
 * cuenta.
 *
 * Cada función es un port literal; los números de línea apuntan al original.
 */

import type { EstadoSolicitud, Fase, ItemSolicitud, Origen, Solicitud } from './tipos'

/** El mapa de conteo de la fase: `verif` para preparado, `devuelto` para la vuelta. */
export function claveConteo(fase: Fase): 'verif' | 'devuelto' {
  return fase === 'devolucion' ? 'devuelto' : 'verif'
}

/**
 * Faltantes de devolución: ítems que aún no volvieron (qty − devuelto > 0).
 * Port de sfFaltantes (index.html:10167).
 */
export function faltantes(s: Solicitud): Array<ItemSolicitud & { falta: number }> {
  const d = s.devuelto || {}
  return (s.items || [])
    .map((i) => ({ ...i, falta: i.qty - (d[i.vid] || 0) }))
    .filter((x) => x.falta > 0)
}

/**
 * ¿Ya salió físicamente? Hay venta creada, o hay ítems a mano y la solicitud
 * dejó de estar 'pendiente'. Habilita el control de devolución.
 * Port de sfSalio (index.html:10169).
 */
export function salio(s: Solicitud): boolean {
  return !!(s && s.ventas) || ((s.items || []).some((i) => i.manual) && !!s.estado && s.estado !== 'pendiente')
}

/**
 * ¿La fase está completa? Toda la solicitud preparada (o devuelta), es decir cada
 * ítem alcanzó su cantidad. Una solicitud sin ítems nunca está completa.
 * Port de sfFaseCompleta (index.html:10009).
 */
export function faseCompleta(s: Solicitud, fase: Fase): boolean {
  const m = s[claveConteo(fase)] || {}
  return (s.items || []).length > 0 && s.items.every((i) => (m[i.vid] || 0) >= i.qty)
}

/** Unidades pedidas de un origen. */
export function unidadesOrigen(s: Solicitud, origen: Origen): number {
  return (s.items || []).filter((i) => i.origen === origen).reduce((a, i) => a + i.qty, 0)
}

/** Fila del historial: los valores que el legacy computa por solicitud (index.html:10274-10284). */
export type FilaHistorial = {
  id: string
  descripcion: string
  fecha: string
  estado: string
  dep: number
  loc: number
  cerrada: boolean
  /** Unidades sin devolver que se muestran como badge ⏳; 0 si no aplica. */
  porDevolver: number
}

export function filaHistorial(s: Solicitud): FilaHistorial {
  const cerrada = s.estado === 'cerrada'
  const porDevolver =
    salio(s) && !cerrada && s.estado !== 'devuelta'
      ? faltantes(s).reduce((a, f) => a + f.falta, 0)
      : 0
  return {
    id: s.id,
    descripcion: s.descripcion || '',
    fecha: s.fecha || '',
    estado: s.estado,
    dep: unidadesOrigen(s, 'deposito'),
    loc: unidadesOrigen(s, 'local'),
    cerrada,
    porDevolver,
  }
}

/**
 * El historial visible: oculta las cerradas salvo que se pida verlas, en el mismo
 * orden en que vienen del KV (más nueva primero, como las inserta sfProcesar con
 * unshift). Port de sfHistorialHtml (index.html:10271-10273).
 */
export function historialVisible(data: Solicitud[], verCerradas: boolean): Solicitud[] {
  return (data || []).filter((s) => verCerradas || s.estado !== 'cerrada')
}

/** Cuántas cerradas hay (para el toggle "Ver cerradas (N)"). */
export function contarCerradas(data: Solicitud[]): number {
  return (data || []).filter((s) => s.estado === 'cerrada').length
}

// ── Mutaciones puras (lista → lista) ────────────────────────────────────────────
// Cada una toca UNA sola solicitud por id y deja el resto intacto. Se aplican
// tanto al estado optimista como a la lista fresca re-leída antes de guardar (el
// merge por-solicitud), así que tienen que depender solo de su entrada.

/** Cambia el estado de una solicitud. Port de sfEstado (index.html:9930). */
export function conEstado(lista: Solicitud[], id: string, estado: EstadoSolicitud): Solicitud[] {
  return lista.map((s) => (s.id === id ? { ...s, estado } : s))
}

/** Cambia la descripción de una solicitud. Port de sfSetDesc (index.html:9934). */
export function conDescripcion(lista: Solicitud[], id: string, descripcion: string): Solicitud[] {
  return lista.map((s) => (s.id === id ? { ...s, descripcion } : s))
}

/**
 * ¿Se puede borrar la solicitud? Devuelve el motivo del bloqueo o null. Port de la
 * guarda de sfBorrar (index.html:9938): un no-admin no puede borrar una solicitud
 * que ya salió y todavía tiene devoluciones pendientes.
 */
export function bloqueoBorrado(s: Solicitud, admin: boolean): string | null {
  if (!admin && salio(s) && !['devuelta', 'cerrada'].includes(s.estado)) {
    return 'Esta solicitud ya salió y todavía tiene devoluciones pendientes. Cerrá la devolución primero, o pedile a un administrador que la borre.'
  }
  return null
}

/** Quita una solicitud del historial. Port de sfBorrar. */
export function sinSolicitud(lista: Solicitud[], id: string): Solicitud[] {
  return lista.filter((s) => s.id !== id)
}

/** ¿Se puede quitar un ítem? Bloqueado si ya hay ventas creadas. Port de la guarda de sfEliminarItem. */
export function bloqueoQuitarItem(s: Solicitud): string | null {
  return s.ventas ? 'Ya se crearon las ventas de esta solicitud; no se puede quitar.' : null
}

export type DatosEliminacion = { por: string; motivo: string; fecha: string }

/**
 * Quita un ítem de la solicitud dejando rastro en `eliminados` (con quién, cuándo y
 * por qué) y borrando su conteo de verif/devuelto. Port de sfEliminarItem
 * (index.html:9943). NO crea `verif`/`devuelto` si no existían (como el legacy).
 */
export function sinItemSol(s: Solicitud, vid: string, datos: DatosEliminacion): Solicitud {
  const it = (s.items || []).find((i) => i.vid === vid)
  if (!it) return s
  const ns: Solicitud = {
    ...s,
    items: s.items.filter((i) => i.vid !== vid),
    eliminados: [
      ...(s.eliminados || []),
      { vid: it.vid, pid: it.pid, nombre: it.nombre, variante: it.variante, sku: it.sku || '', qty: it.qty, origen: it.origen, fecha: datos.fecha, por: datos.por, motivo: datos.motivo },
    ],
  }
  if (s.verif) {
    const verif = { ...s.verif }
    delete verif[vid]
    ns.verif = verif
  }
  if (s.devuelto) {
    const devuelto = { ...s.devuelto }
    delete devuelto[vid]
    ns.devuelto = devuelto
  }
  return ns
}
