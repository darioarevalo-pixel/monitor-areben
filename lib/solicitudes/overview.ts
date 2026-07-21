/**
 * Vista unificada (solo lectura) del ESTADO de todas las solicitudes: Sesión de
 * fotos (`kind=sesionfotos`) + Solicitudes internas (`kind=solicitudesinternas`).
 * NO migra datos: lee los dos KV y los aplana a un resumen común. La visibilidad se
 * filtra por la función del usuario (Local/Depósito solo ven lo de su origen).
 *
 * Es la Fase 1 del módulo "Solicitudes" unificado: el detalle/gestión sigue en cada
 * sección (Sesión de fotos / Solicitudes internas); acá se ve el panorama con el
 * estado real (incluida la señal GN: sin venta / con venta / falta anular).
 */

import { esAdmin, tieneFuncion, type Perfil } from '@/lib/permisos'
import type { Marca } from '@/lib/nav'
import { retiradoCompleto } from '@/lib/sesionfotos/core'
import type { Origen, Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'

export type TipoSolicitud = 'foto' | 'interna'
/** Grupo de estado para los filtros (común a los dos tipos). */
export type GrupoEstado = 'pendiente' | 'enproceso' | 'conventagn' | 'devuelta' | 'cerrada'

export type ResumenSolicitud = {
  id: string
  marca: Marca
  tipo: TipoSolicitud
  titulo: string
  subtitulo: string // motivo/tipo (internas) o descripción corta
  estadoLabel: string
  estadoTag?: string // señal secundaria (ej. "falta anular venta GN")
  color: string
  bg: string
  grupo: GrupoEstado
  creadoPor: string
  creado: number
  fecha: string
  unidades: number
  uLocal: number
  uDeposito: number
  seccion: 'sesion-fotos' | 'solicitudes-internas'
}

const AMBAR = { color: '#B45309', bg: '#FFFBEB' }
const AZUL = { color: '#1D4ED8', bg: '#EFF6FF' }
const INDIGO = { color: '#4338CA', bg: '#EEF2FF' }
const TEAL = { color: '#0F766E', bg: '#F0FDFA' }
const VERDE = { color: '#15803D', bg: '#F0FDF4' }
const GRIS = { color: '#6B7280', bg: '#F3F4F6' }
const ROJO = { color: '#B91C1C', bg: '#FEF2F2' }

const unidades = (items: { qty: number }[]) => items.reduce((a, i) => a + (Number(i.qty) || 0), 0)
const unidadesOrigen = (items: { qty: number; origen: Origen }[], o: Origen) =>
  items.reduce((a, i) => a + (i.origen === o ? Number(i.qty) || 0 : 0), 0)

/** Estado de una solicitud de FOTOS → etiqueta + color + grupo, con la señal GN. */
function estadoFoto(s: Solicitud): { label: string; tag?: string; grupo: GrupoEstado } & typeof AMBAR {
  const tieneVenta = !!s.ventas && Object.keys(s.ventas).length > 0
  switch (s.estado) {
    case 'pendiente':
      return { label: 'Pendiente', tag: 'sin venta GN', grupo: 'pendiente', ...AMBAR }
    case 'preparada':
      return { label: 'Preparada', tag: 'sin venta GN', grupo: 'enproceso', ...AZUL }
    case 'cargada':
      // Venta GN creada = SEPARADO; el retiro físico se marca aparte por origen.
      return retiradoCompleto(s)
        ? { label: 'Retirado', grupo: 'conventagn', ...TEAL }
        : { label: 'Separado', tag: 'sin retirar', grupo: 'conventagn', ...INDIGO }
    case 'devuelta':
      return { label: 'Devuelta', tag: tieneVenta ? 'falta anular venta GN' : undefined, grupo: 'devuelta', ...VERDE }
    case 'cerrada':
      return { label: 'Cerrada', grupo: 'cerrada', ...GRIS }
    default:
      return { label: String(s.estado), grupo: 'enproceso', ...GRIS }
  }
}

/** Estado de una solicitud INTERNA → etiqueta + color + grupo. */
function estadoInterna(s: SolicitudInterna): { label: string; tag?: string; grupo: GrupoEstado } & typeof AMBAR {
  const tieneVenta = !!s.ventas && Object.keys(s.ventas).length > 0
  switch (s.estado) {
    case 'pendiente':
      return { label: 'Pendiente de aprobar', grupo: 'pendiente', ...AMBAR }
    case 'aprobada':
      return { label: 'Aprobada', tag: 'sin venta GN', grupo: 'enproceso', ...AZUL }
    case 'retirada':
      return { label: 'Con venta GN', grupo: 'conventagn', ...INDIGO }
    case 'devuelta':
      return { label: 'Devuelta', tag: tieneVenta ? 'falta anular venta GN' : undefined, grupo: 'devuelta', ...VERDE }
    case 'cerrada':
      return { label: 'Cerrada', grupo: 'cerrada', ...GRIS }
    case 'rechazada':
      return { label: 'Rechazada', grupo: 'cerrada', ...ROJO }
    default:
      return { label: String(s.estado), grupo: 'enproceso', ...GRIS }
  }
}

export function resumenFoto(s: Solicitud, marca: Marca): ResumenSolicitud {
  const e = estadoFoto(s)
  const items = s.items || []
  return {
    id: String(s.id), marca, tipo: 'foto',
    titulo: s.descripcion || '(sin descripción)', subtitulo: 'Sesión de fotos',
    estadoLabel: e.label, estadoTag: e.tag, color: e.color, bg: e.bg, grupo: e.grupo,
    creadoPor: s.creadoPor || '', creado: s.creado || 0, fecha: s.fecha || '',
    unidades: unidades(items), uLocal: unidadesOrigen(items, 'local'), uDeposito: unidadesOrigen(items, 'deposito'),
    seccion: 'sesion-fotos',
  }
}

export function resumenInterna(s: SolicitudInterna, marca: Marca): ResumenSolicitud {
  const e = estadoInterna(s)
  const items = s.items || []
  return {
    id: String(s.id), marca, tipo: 'interna',
    titulo: s.descripcion || s.motivo || '(sin descripción)',
    subtitulo: `Interna · ${s.tipo === 'consumo' ? 'Consumo' : 'Retornable'}${s.motivo ? ' · ' + s.motivo : ''}`,
    estadoLabel: e.label, estadoTag: e.tag, color: e.color, bg: e.bg, grupo: e.grupo,
    creadoPor: s.creadoPor || '', creado: s.creado || 0, fecha: s.fecha || '',
    unidades: unidades(items), uLocal: unidadesOrigen(items, 'local'), uDeposito: unidadesOrigen(items, 'deposito'),
    seccion: 'solicitudes-internas',
  }
}

/** Los orígenes que le tocan a este usuario si su función es de sector (Local/Depósito). */
export function origenesFuncion(perfil: Perfil | null): Origen[] {
  const o: Origen[] = []
  if (tieneFuncion(perfil, 'local')) o.push('local')
  if (tieneFuncion(perfil, 'deposito')) o.push('deposito')
  return o
}

/**
 * ¿Este usuario ve TODO (admin/dirección/marketing/administración o sin función), o
 * solo su sector (solo Local/Depósito)?
 */
export function veTodo(perfil: Perfil | null): boolean {
  if (esAdmin(perfil) || tieneFuncion(perfil, 'direccion') || tieneFuncion(perfil, 'marketing') || tieneFuncion(perfil, 'administracion')) return true
  return origenesFuncion(perfil).length === 0 // sin función de sector → ve todo (compatibilidad)
}

/**
 * ¿Puede marcar el retiro físico de un origen? Los que ven todo (admin/dirección/
 * marketing/administración/sin función) pueden cualquiera; los de sector, solo su origen.
 */
export function puedeRetirar(perfil: Perfil | null, origen: Origen): boolean {
  if (veTodo(perfil)) return true
  return tieneFuncion(perfil, origen)
}

/** Filtra los resúmenes según la función: sector solo ve lo que tiene unidades de su origen. */
export function filtrarPorFuncion(resumenes: ResumenSolicitud[], perfil: Perfil | null): ResumenSolicitud[] {
  if (veTodo(perfil)) return resumenes
  const origenes = origenesFuncion(perfil)
  return resumenes.filter((r) => origenes.some((o) => (o === 'local' ? r.uLocal : r.uDeposito) > 0))
}

/** Ordena por fecha de creación, la más nueva primero. */
export function ordenarResumenes(r: ResumenSolicitud[]): ResumenSolicitud[] {
  return r.slice().sort((a, b) => (b.creado || 0) - (a.creado || 0))
}
