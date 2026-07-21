'use client'

import type { Marca } from '@/lib/nav.generated'
import { crearVentas, idsParaCerrar } from '@/lib/solicitudes-internas/ventas'
import type { EstadoSI, Origen, SolicitudInterna, VentaGN } from '@/lib/solicitudes-internas/tipos'
import { useHistorialSolicitudes, type HistorialSolicitudes } from '@/components/solicitudes/useHistorialSolicitudes'

/**
 * Carga y persistencia del historial de Solicitudes internas. Desde la Fase A de la
 * convergencia es un wrapper fino de `useHistorialSolicitudes` (el mismo motor que usa
 * Sesión de fotos); acá solo cambia el kind del KV, el estado post-venta (`retirada`)
 * y el módulo de ventas de internas (distinto `comments` de GN + auto-cierre sin gate
 * de devolución). La API pública no cambió.
 */

export type ResultadoCrear =
  | { tipo: 'ya-tenia'; ventas: Partial<Record<Origen, VentaGN>>; estadoSol: EstadoSI }
  | { tipo: 'hecho'; ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }
  | { tipo: 'no-leido' }

export type EstadoSIHook = HistorialSolicitudes<SolicitudInterna> & {
  crearVentasDe: (s: SolicitudInterna, cred: { user: string; pass: string }) => Promise<ResultadoCrear>
}

export function useSolicitudesInternas(marca: Marca): EstadoSIHook {
  return useHistorialSolicitudes<SolicitudInterna>(marca, {
    kind: 'solicitudesinternas',
    etiqueta: 'Solicitudes internas',
    estadoTrasVenta: 'retirada',
    crearVentas,
    idsParaCerrar,
  }) as EstadoSIHook
}
