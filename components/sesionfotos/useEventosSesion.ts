'use client'

import { useHistorialSolicitudes, type HistorialSolicitudes } from '@/components/solicitudes/useHistorialSolicitudes'
import type { Linea } from '@/lib/lineas'
import type { SesionEvento } from '@/lib/sesionfotos/evento'

/**
 * El cajón de los EVENTOS de sesión de fotos (la sesión como padre, Fase 2 del octavo).
 *
 * 🔑 **Reusa el motor compartido y ⛔ no copia su disciplina.** Lo que ese motor sostiene —
 * `cargado` hacia afuera y re-leer fresco antes de guardar— es lo que impide que un GET fallido
 * termine borrando el historial, y volver a escribirlo acá sería la tercera copia de la misma
 * regla (ya se de-duplicó una vez, en la Fase A de la convergencia).
 *
 * Lo único que cambia es el `kind`: `sesion-evento`, filas nuevas de la MISMA tabla `solicitudes`.
 *
 * ⛔ **Un evento ⛔ no crea ventas en Gestión Nube ni se anula**: eso lo hacen sus hijas, que son
 * solicitudes de verdad. Por eso `crearVentas` e `idsParaCerrar` van vacíos — 🔑 y van vacíos **a
 * propósito y con nombre**, ⛔ no por olvido: el evento es cuándo y con quién se hace la sesión,
 * ⛔ no un retiro de mercadería.
 */
export function useEventosSesion(linea: Linea): HistorialSolicitudes<SesionEvento> {
  return useHistorialSolicitudes<SesionEvento>(linea, {
    kind: 'sesion-evento',
    etiqueta: 'Sesiones de fotos',
    // Un evento ⛔ nunca pasa por acá: no hay venta que lo mueva de estado.
    estadoTrasVenta: 'planificado',
    crearVentas: async () => ({ ventas: {}, errores: [] }),
    idsParaCerrar: async () => [],
  })
}
