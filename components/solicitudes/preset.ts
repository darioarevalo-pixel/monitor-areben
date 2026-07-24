import type { KindLista } from '@/lib/kv/cliente'
import type { EstadoSolicitud, TipoSol } from '@/lib/sesionfotos/tipos'

/**
 * Una solicitud tiene DOS ejes independientes, y ese es el cambio de modelo de la Fase 2:
 *
 *   MOTIVO  = para qué sale (sesión de fotos, video, muestra, moldería…)
 *   DESTINO = si vuelve o no (retornable / consumo)
 *
 * Antes estaban mezclados: "Sesión de fotos" era una SECCIÓN aparte que asumía que todo
 * volvía, y lo que no volvía había que pedirlo por "Solicitudes internas". Pero la foto de
 * un vidrio templado no vuelve (se pega) y la de una remera sí: mismo motivo, distinto
 * destino. Ahora el motivo es un dato más y el DESTINO es el que gobierna el comportamiento
 * (si se espera la devolución y si necesita aprobación).
 */
export const MOTIVOS = ['Sesión de fotos', 'Video/contenido', 'Muestra', 'Moldería', 'Uso interno', 'Otro'] as const

/** El motivo con el que nace un borrador. */
export const MOTIVO_DEFAULT: string = MOTIVOS[0]

/** El destino con el que nace un borrador: la mayoría de los retiros vuelven. */
export const DESTINO_DEFAULT: TipoSol = 'retornable'

/**
 * Qué significa cada destino, en la palabra del negocio. Vive acá y no inline en la UI
 * porque no es un rótulo: es la diferencia entre que el sistema espere la devolución (y
 * haya que anular la venta en GN) o que la unidad salga para siempre.
 */
export const AYUDA_DESTINO: Record<TipoSol, string> = {
  retornable:
    'El producto vuelve a la venta. Sale del stock mientras se usa y, cuando lo devolvés, hay que anular la venta en Gestión Nube para que la unidad vuelva a estar disponible.',
  consumo:
    'El producto no vuelve a la venta. Ejemplo: un vidrio templado que se pega para la foto o el video: se usa y ya no se puede vender. La unidad sale del stock de forma definitiva, por eso necesita aprobación.',
}

/**
 * Lo que todavía depende de por dónde entró la solicitud: en qué fila se guarda (`kind`),
 * con qué permiso se gatea y qué estado toma al crear la venta en GN.
 *
 * Ya NO define si pide aprobación ni si se pregunta el motivo: eso pasó a ser del destino y
 * del motivo, que viajan en la solicitud.
 */
export type PresetSolicitud = {
  kind: KindLista
  /** Nombre para títulos/mensajes. */
  etiqueta: string
  /** Sección de permisos (`puedeSub(perfil, marca, seccionKey, sub)`). */
  seccionKey: string
  /** Estado que toma la solicitud al crear la venta GN (optimista en la UI). */
  estadoTrasVenta: EstadoSolicitud
}

export const PRESET_FOTOS: PresetSolicitud = {
  kind: 'sesionfotos',
  etiqueta: 'Sesión de fotos',
  seccionKey: 'sesion-fotos',
  estadoTrasVenta: 'cargada',
}

export const PRESET_INTERNAS: PresetSolicitud = {
  kind: 'solicitudesinternas',
  etiqueta: 'Solicitudes internas',
  seccionKey: 'solicitudes-internas',
  estadoTrasVenta: 'retirada',
}

/**
 * El motivo elige el preset (y con él la fila donde se guarda). Es lo que deja que "Sesión
 * de fotos" sea un motivo más sin volver a migrar datos: las de fotos siguen comportándose
 * como siempre y el resto como las internas.
 */
export function presetPorMotivo(motivo?: string): PresetSolicitud {
  return !motivo || motivo === 'Sesión de fotos' ? PRESET_FOTOS : PRESET_INTERNAS
}

/** ¿Necesita que alguien la apruebe? Lo decide el DESTINO, no la sección por la que entró. */
export function necesitaAprobacion(s: { tipo?: TipoSol }): boolean {
  return s.tipo === 'consumo'
}

/**
 * Los motivos que se pueden elegir sin cambiar de cajón. El motivo se elige ANTES (en
 * Solicitudes, que rutea con `ponerAltaSolicitud`); adentro del borrador se puede corregir,
 * pero solo entre los del mismo cajón: la venta en GN sale con el cliente del preset, así
 * que mover el motivo al otro grupo cambiaría a nombre de quién queda la venta.
 */
export function motivosDe(preset: PresetSolicitud): string[] {
  return MOTIVOS.filter((m) => presetPorMotivo(m).kind === preset.kind)
}
