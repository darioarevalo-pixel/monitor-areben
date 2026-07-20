/**
 * Detector operativo: pendientes que frenan el flujo del equipo (fotos por armar,
 * consumos internos por aprobar) y el estado del sync de datos. Reusa las funciones
 * puras que ya existen (`pendientesDeMarca`, `contarPendientes`, `estadoSync`).
 */

import type { DatosETL } from '@/lib/etl/tipos'
import type { Marca } from '@/lib/nav.generated'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import { pendientesDeMarca } from '@/lib/inicio/core'
import { contarPendientes } from '@/lib/solicitudes-internas/core'
import { estadoSync } from '@/lib/resumen'
import type { Accionable } from '../tipos'
import type { Umbrales } from '../umbrales'

export function detectarOperativo(
  marca: Marca,
  fotos: Solicitud[],
  internas: SolicitudInterna[],
  etl: DatosETL | null,
  u: Umbrales,
  now: Date,
): Accionable[] {
  const out: Accionable[] = []

  // 1. Solicitudes de fotos pendientes de armar.
  const fp = pendientesDeMarca(fotos, marca)
  if (fp.length) {
    out.push({
      id: `operativo:fotos:${marca}`,
      area: 'operativo',
      severidad: fp.length >= u.fotosAtencion ? 'atencion' : 'oportunidad',
      marca,
      titulo: `${fp.length} solicitud(es) de fotos para armar`,
      detalle: 'Retiros pedidos para la sesión de fotos, todavía sin preparar.',
      recomendacion: 'Armar los retiros para no frenar la producción de contenido.',
      valor: fp.length,
      acciones: [{ tipo: 'link', seccion: 'sesion-fotos', label: 'Ir a Sesión de fotos' }],
    })
  }

  // 2. Consumos internos esperando aprobación (no descuentan stock hasta aprobarse).
  const nAprob = contarPendientes(internas)
  if (nAprob) {
    out.push({
      id: `operativo:aprobaciones:${marca}`,
      area: 'operativo',
      severidad: 'atencion',
      marca,
      titulo: `${nAprob} consumo(s) interno(s) para aprobar`,
      detalle: 'Retiros de uso interno frenados hasta la aprobación de un responsable.',
      recomendacion: 'Aprobar o rechazar para destrabar el retiro.',
      valor: nAprob,
      acciones: [{ tipo: 'link', seccion: 'solicitudes-internas', label: 'Ir a Solicitudes internas' }],
    })
  }

  // 3. Sync de datos caído o muy atrasado: se estaría decidiendo sobre datos viejos.
  if (etl) {
    const s = estadoSync(etl.syncMeta, now)
    const caido = s.tipo === 'fallando' || (s.tipo === 'ok' && s.dot === '🔴')
    if (caido) {
      out.push({
        id: `operativo:sync:${marca}`,
        area: 'operativo',
        severidad: 'critico',
        marca,
        titulo: 'Los datos no se están actualizando',
        detalle:
          s.tipo === 'ok'
            ? `Última actualización ${s.hace}.${s.nota}`
            : 'La última corrida del sync falló y no hay una lectura reciente.',
        recomendacion: 'Revisar el workflow de sincronización antes de tomar decisiones con estos números.',
        valor: 1,
        acciones: [{ tipo: 'link', seccion: 'resumen', label: 'Ver estado' }],
      })
    }
  }

  return out
}
