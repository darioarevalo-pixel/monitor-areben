'use client'

import { useSesion } from '@/components/SesionProvider'
import { SolicitudesInner } from '@/components/sesionfotos/SesionFotos'
import { PRESET_INTERNAS } from '@/components/solicitudes/preset'
import type { HistorialSolicitudes } from '@/components/solicitudes/useHistorialSolicitudes'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import { useSolicitudesInternas as useHistorial } from './useSolicitudesInternas'

/**
 * Solicitudes internas: desde la convergencia Fase B es un wrapper fino del MISMO
 * componente que Sesión de fotos (`SolicitudesInner`), con `PRESET_INTERNAS` (KV
 * propio, motivo/tipo en el borrador, aprobación de consumos, estado post-venta
 * `retirada`). Todo el flujo —preparado, separado/retirado, sector, ticket, reportes,
 * quitar-ítem— es idéntico al de fotos.
 *
 * El `sf` se castea a `HistorialSolicitudes<Solicitud>`: `SolicitudInterna` es
 * estructuralmente un `Solicitud` (superset), pero el genérico `HistorialSolicitudes<T>`
 * es invariante en T por tener T en posición de entrada y salida (persistir), así que
 * TS no lo infiere solo. El cast es seguro en runtime (mismas formas).
 */
export function SolicitudesInternas() {
  const { marca } = useSesion()
  const sf = useHistorial(marca)
  return <SolicitudesInner sf={sf as unknown as HistorialSolicitudes<Solicitud>} preset={PRESET_INTERNAS} />
}
