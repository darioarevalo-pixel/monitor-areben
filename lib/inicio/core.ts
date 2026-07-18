/**
 * Lógica pura de Inicio (novedades: solicitudes de Sesión de fotos pendientes de
 * armar, multimarca). Port de las funciones `_inicio*` del legacy
 * (index.html:9717-9746).
 */

import { CUENTAS } from '@/lib/cuentas'
import { esAdmin, puedeVer, type Perfil } from '@/lib/permisos'
import type { Marca } from '@/lib/nav'
import type { Solicitud } from '@/lib/sesionfotos/tipos'

/** Una solicitud pendiente, aplanada para el listado de Inicio. */
export type PendienteFoto = {
  id: string
  marca: Marca
  descripcion: string
  creadoPor: string
  creado: number
  fecha: string
  unidades: number
}

/**
 * Marcas a las que este usuario puede ver Sesión de fotos (respeta la cuenta fija).
 * Port de _inicioMarcasVisibles: si tiene cuenta fija, solo esa; si no, las que
 * pueda ver (admin ve todas).
 */
export function marcasVisibles(perfil: Perfil | null): Marca[] {
  if (!perfil) return []
  const todas = perfil.cuenta ? [perfil.cuenta] : (Object.keys(CUENTAS) as Marca[])
  return todas.filter((m) => esAdmin(perfil) || puedeVer(perfil, m, 'sesion-fotos'))
}

/** Suma las unidades de los ítems de una solicitud. */
export function unidadesDe(s: Solicitud): number {
  return (s.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0)
}

/** Aplana una solicitud a PendienteFoto (con su marca). */
export function aPendiente(s: Solicitud, marca: Marca): PendienteFoto {
  return {
    id: String(s.id),
    marca,
    descripcion: s.descripcion || '',
    creadoPor: s.creadoPor || '',
    creado: s.creado || 0,
    fecha: s.fecha || '',
    unidades: unidadesDe(s),
  }
}

/**
 * De la lista de una marca, las 'pendiente' aplanadas. La lista puede venir de
 * `leerLista('sesionfotos', marca)`.
 */
export function pendientesDeMarca(lista: Solicitud[], marca: Marca): PendienteFoto[] {
  return lista.filter((s) => s.estado === 'pendiente').map((s) => aPendiente(s, marca))
}

/** Ordena las pendientes: la más nueva primero. Port del sort de inicioCargarPendientes. */
export function ordenar(pend: PendienteFoto[]): PendienteFoto[] {
  return pend.slice().sort((a, b) => (b.creado || 0) - (a.creado || 0))
}

/**
 * Etiqueta de hora relativa ("hoy 14:30" / "ayer 09:00" / "12/7/2026 …"). Port de
 * _inicioHora, con `hoy` por parámetro (el legacy usaba `new Date()`) para testear.
 */
export function horaLabel(creado: number, fecha: string, hoy: Date = new Date()): string {
  if (!creado) return fecha || ''
  const d = new Date(creado)
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const dia = d.toDateString() === hoy.toDateString() ? 'hoy' : d.toDateString() === ayer.toDateString() ? 'ayer' : d.toLocaleDateString('es-AR')
  return `${dia} ${hh}:${mm}`
}
