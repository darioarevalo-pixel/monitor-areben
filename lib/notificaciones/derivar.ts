/**
 * Los cuatro derivadores de avisos. Cada uno es puro: recibe datos y el perfil, y devuelve los
 * avisos que le corresponden a esa persona. Ver `tipos.ts` para por qué se derivan y no se
 * registran.
 *
 * Todos respetan la misma regla de visibilidad que ya usa el resto de Solicitudes: nadie ve un
 * aviso de algo que no vería entrando a la sección.
 */

import { esAdmin, puedeSub, tieneFuncion, type Perfil } from '@/lib/permisos'
import { faltantes, salio } from '@/lib/sesionfotos/core'
import { veTodo, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { pendientesDeTrabajo } from '@/lib/inicio/core'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { Marca } from '@/lib/nav'
import type { Aviso } from './tipos'

/** ¿Puede aprobar consumos internos en alguna de las dos marcas? */
export function esAprobador(perfil: Perfil | null, marca: Marca): boolean {
  return esAdmin(perfil) || puedeSub(perfil, marca, 'solicitudes-internas', 'aprobar') || puedeSub(perfil, marca, 'solicitudes', 'aprobar')
}

const rutaDe = (r: ResumenSolicitud) => (r.seccion === 'sesion-fotos' ? '/sesion-fotos' : '/solicitudes-internas')

/** Consumos internos esperando el OK de un gerente. Es lo que más traba el flujo: sin aprobar, no se retira. */
export function avisosDeAprobacion(resumenes: ResumenSolicitud[], perfil: Perfil | null, marca: Marca): Aviso[] {
  if (!esAprobador(perfil, marca)) return []
  return resumenes
    .filter((r) => r.estadoLabel === 'Pendiente de aprobar')
    .map((r) => ({
      id: `aprobacion:${r.marca}:${r.id}`,
      tipo: 'aprobacion' as const,
      marca: r.marca,
      titulo: r.titulo || 'Consumo interno',
      detalle: `${r.unidades} u. · ${r.creadoPor || 'sin responsable'}`,
      ruta: '/solicitudes',
      ts: r.creado || 0,
      tono: 'warning' as const,
    }))
}

/**
 * Solicitudes que esperan trabajo de TU sector. Solo para Local y Depósito: quien ve todo no
 * necesita un aviso por cada solicitud abierta de la empresa, le llenaría el contador de ruido.
 */
export function avisosDeSolicitud(resumenes: ResumenSolicitud[], perfil: Perfil | null): Aviso[] {
  if (veTodo(perfil)) return []
  if (!tieneFuncion(perfil, 'local') && !tieneFuncion(perfil, 'deposito')) return []
  return pendientesDeTrabajo(resumenes).map((r) => ({
    id: `solicitud:${r.marca}:${r.id}`,
    tipo: 'solicitud' as const,
    marca: r.marca,
    titulo: r.titulo || 'Solicitud',
    detalle: `${r.unidades} u. · ${r.estadoLabel}`,
    ruta: rutaDe(r),
    ts: r.creado || 0,
    tono: 'brand' as const,
  }))
}

/**
 * Mercadería que salió y no volvió. El reporte ya existía adentro del detalle de cada solicitud,
 * pero había que entrar a mirarlo una por una — o sea que nadie lo perseguía. Es plata parada,
 * así que sube a aviso.
 *
 * Lo ve quien coordina (marketing, administración, dirección), no el sector que prepara.
 */
export function avisosDeNoDevueltos(sols: Solicitud[], marca: Marca, perfil: Perfil | null): Aviso[] {
  if (!veTodo(perfil)) return []
  return sols
    .filter((s) => salio(s) && s.estado !== 'cerrada' && s.estado !== 'devuelta')
    .map((s) => ({ s, falta: faltantes(s).reduce((a, f) => a + f.falta, 0) }))
    .filter((x) => x.falta > 0)
    .map(({ s, falta }) => ({
      id: `no-devuelto:${marca}:${s.id}`,
      tipo: 'no-devuelto' as const,
      marca,
      titulo: s.descripcion || 'Solicitud',
      detalle: `${falta} ${falta === 1 ? 'unidad sin devolver' : 'unidades sin devolver'}`,
      ruta: '/solicitudes',
      // La antigüedad es del pedido: cuanto más viejo, peor.
      ts: s.creado || 0,
      tono: 'danger' as const,
    }))
}

/**
 * Fallas cargadas en el local que todavía no se llevaron al depósito (estado `cargada` con
 * ubicación `local` — la etiqueta ya las llama "Pendiente de envío"). Las ve el local, que las
 * tiene que mandar, y administración, que las espera para recibirlas.
 */
export function avisosDeFallas(fallas: FallaRow[], marca: Marca, perfil: Perfil | null): Aviso[] {
  const leInteresa = esAdmin(perfil) || tieneFuncion(perfil, 'local') || tieneFuncion(perfil, 'administracion') || tieneFuncion(perfil, 'direccion')
  if (!leInteresa) return []
  const pendientes = fallas.filter((f) => f.estado === 'cargada' && (f.ubicacion || 'local') === 'local')
  if (!pendientes.length) return []
  // Una sola línea para todas: son del mismo montón físico y se llevan juntas, así que N avisos
  // separados serían N veces el mismo recordatorio.
  const u = pendientes.reduce((a, f) => a + (Number(f.cantidad) || 1), 0)
  const masVieja = Math.min(...pendientes.map((f) => (f.created_at ? Date.parse(f.created_at) || 0 : 0)).filter(Boolean))
  return [
    {
      id: `falla-por-enviar:${marca}`,
      tipo: 'falla-por-enviar' as const,
      marca,
      titulo: pendientes.length === 1 ? '1 falla para llevar al depósito' : `${pendientes.length} fallas para llevar al depósito`,
      detalle: `${u} ${u === 1 ? 'unidad' : 'unidades'} esperando en el local`,
      ruta: '/postventa-local',
      ts: Number.isFinite(masVieja) ? masVieja : 0,
      tono: 'warning' as const,
    },
  ]
}

/** Orden de lectura: lo más nuevo arriba. */
export function ordenarAvisos(avisos: Aviso[]): Aviso[] {
  return avisos.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))
}

/** Cuántos de estos avisos aparecieron después de la última vez que la persona miró. */
export function contarNuevos(avisos: Aviso[], vistoHasta: number): number {
  return avisos.filter((a) => (a.ts || 0) > vistoHasta).length
}
