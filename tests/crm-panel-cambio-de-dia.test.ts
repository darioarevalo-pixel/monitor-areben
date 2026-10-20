import { describe, expect, it } from 'vitest'
import { alDia } from '@/components/panel/useHoy'

// Darío, 20-oct-2026: WhatsApp Web quedó abierto desde el día anterior y el panel decía «Para hoy 0»
// con 17 agendados, porque la fecha se fijaba al abrirlo.
describe('panel: la fecha de hoy pasa sola de día', () => {
  it('mismo día → el MISMO Date (no redispara los efectos)', () => {
    const t = new Date(2026, 9, 19, 9, 0)
    expect(alDia(t, new Date(2026, 9, 19, 23, 59))).toBe(t)
  })
  it('pasó la medianoche → la fecha nueva', () => {
    const t = new Date(2026, 9, 19, 18, 0)
    const ahora = new Date(2026, 9, 20, 8, 30)
    expect(alDia(t, ahora)).toBe(ahora)
  })
})
