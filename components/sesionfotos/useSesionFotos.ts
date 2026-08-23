'use client'

import type { Linea } from '@/lib/lineas'
import { crearVentas, idsParaCerrar } from '@/lib/sesionfotos/ventas'
import type { EstadoSolicitud, Origen, Solicitud, VentaGN } from '@/lib/sesionfotos/tipos'
import { useHistorialSolicitudes, type HistorialSolicitudes } from '@/components/solicitudes/useHistorialSolicitudes'
import type { Credencial } from '@/lib/sesion'

/**
 * Carga y persistencia del historial de Sesión de fotos. Desde la Fase A de la
 * convergencia es un wrapper fino de `useHistorialSolicitudes` (el motor compartido
 * con Solicitudes internas); acá solo se fijan el kind del KV, el estado post-venta
 * (`cargada`) y el módulo de ventas de fotos. La API pública (EstadoSF/ResultadoCrear)
 * no cambió, así que el componente no se toca.
 *
 * Desde el 22-ago-2026 el eje es la **línea**, no la marca: la sesión de fotos de Stunned es una
 * lista aparte (filas `store='stunned'` de la misma tabla, misma base de Zattia). El porqué —y por
 * qué la venta de GN igual sale como Zattia— está en el docblock del motor.
 */

export type ResultadoCrear =
  | { tipo: 'ya-tenia'; ventas: Partial<Record<Origen, VentaGN>>; estadoSol: EstadoSolicitud }
  | { tipo: 'hecho'; ventas: Partial<Record<Origen, VentaGN>>; errores: string[] }
  | { tipo: 'no-leido' }

export type EstadoSF = HistorialSolicitudes<Solicitud> & {
  crearVentasDe: (s: Solicitud, cred: Credencial) => Promise<ResultadoCrear>
}

export function useSesionFotos(linea: Linea): EstadoSF {
  return useHistorialSolicitudes<Solicitud>(linea, {
    kind: 'sesionfotos',
    etiqueta: 'Sesión de fotos',
    estadoTrasVenta: 'cargada',
    crearVentas,
    idsParaCerrar,
  }) as EstadoSF
}
