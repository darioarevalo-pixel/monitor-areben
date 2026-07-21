'use client'

import type { Marca } from '@/lib/nav.generated'
import { crearVentas, idsParaCerrar } from '@/lib/sesionfotos/ventas'
import type { EstadoSolicitud, Origen, Solicitud, VentaGN } from '@/lib/sesionfotos/tipos'
import { useHistorialSolicitudes, type HistorialSolicitudes } from '@/components/solicitudes/useHistorialSolicitudes'

/**
 * Carga y persistencia del historial de Sesión de fotos. Desde la Fase A de la
 * convergencia es un wrapper fino de `useHistorialSolicitudes` (el motor compartido
 * con Solicitudes internas); acá solo se fijan el kind del KV, el estado post-venta
 * (`cargada`) y el módulo de ventas de fotos. La API pública (EstadoSF/ResultadoCrear)
 * no cambió, así que el componente no se toca.
 */

export type ResultadoCrear =
  | { tipo: 'ya-tenia'; ventas: Partial<Record<Origen, VentaGN>>; estadoSol: EstadoSolicitud }
  | { tipo: 'hecho'; ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }
  | { tipo: 'no-leido' }

export type EstadoSF = HistorialSolicitudes<Solicitud> & {
  crearVentasDe: (s: Solicitud, cred: { user: string; pass: string }) => Promise<ResultadoCrear>
}

export function useSesionFotos(marca: Marca): EstadoSF {
  return useHistorialSolicitudes<Solicitud>(marca, {
    kind: 'sesionfotos',
    etiqueta: 'Sesión de fotos',
    estadoTrasVenta: 'cargada',
    crearVentas,
    idsParaCerrar,
  }) as EstadoSF
}
