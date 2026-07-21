import type { KindLista } from '@/lib/kv/cliente'
import type { EstadoSolicitud } from '@/lib/sesionfotos/tipos'

/**
 * Preset que distingue las dos entradas al MISMO motor de solicitudes (convergencia
 * Fase B): Sesión de fotos vs Solicitudes internas. Todo el flujo (preparado,
 * separado/retirado, ticket, reportes, sector, quitar-ítem…) es idéntico; solo cambian
 * el KV, la sección para permisos, el estado post-venta y la capa propia de internas
 * (picker de motivo/tipo + aprobación de consumos).
 */
export type PresetSolicitud = {
  kind: KindLista
  /** Nombre para títulos/mensajes. */
  etiqueta: string
  /** Sección de permisos (`puedeSub(perfil, marca, seccionKey, sub)`). */
  seccionKey: string
  /** Estado que toma la solicitud al crear la venta GN (optimista en la UI). */
  estadoTrasVenta: EstadoSolicitud
  /** Internas: muestra el picker de motivo + tipo (retornable/consumo) en el borrador. */
  pickerMotivoTipo: boolean
  /** Internas: capa de aprobación de consumos (banner + aprobar/rechazar). */
  conAprobacion: boolean
  /** Fotos: motivo fijo (no se pide). */
  motivoFijo?: string
}

export const PRESET_FOTOS: PresetSolicitud = {
  kind: 'sesionfotos',
  etiqueta: 'Sesión de fotos',
  seccionKey: 'sesion-fotos',
  estadoTrasVenta: 'cargada',
  pickerMotivoTipo: false,
  conAprobacion: false,
  motivoFijo: 'Sesión de fotos',
}

export const PRESET_INTERNAS: PresetSolicitud = {
  kind: 'solicitudesinternas',
  etiqueta: 'Solicitudes internas',
  seccionKey: 'solicitudes-internas',
  estadoTrasVenta: 'retirada',
  pickerMotivoTipo: true,
  conAprobacion: true,
}
