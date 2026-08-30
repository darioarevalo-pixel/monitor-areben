'use client'

import { color, font, weight } from '@/components/ui'

/**
 * El título de un bloque adentro de una pantalla de la Agenda.
 *
 * Vive en su propio archivo desde que la sección se partió en seis pantallas (29-ago-2026): lo usan
 * Hoy y Rutinas, y la alternativa —una copia de tres líneas en cada una— es exactamente cómo dos
 * bloques de la misma sección terminan con distinto peso sin que nadie lo decida.
 */
export function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink, margin: 0 }}>{children}</h2>
  )
}
