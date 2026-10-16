import { describe, it, expect } from 'vitest'
import { indexarEscritos, leEscribisteHoy } from '@/lib/crm/escritos'

/**
 * «Le escribiste hoy» (16-oct-2026): la extensión manda los teléfonos de los chats con un mensaje
 * tuyo de hoy, y el panel los cruza con la lista y la ficha por los últimos 8 dígitos.
 */
describe('leEscribisteHoy', () => {
  const escritos = indexarEscritos(['5492477512620', '51970616406'])

  it('cruza aunque el CRM guarde el número de otra forma', () => {
    expect(leEscribisteHoy(escritos, ['2477 51-2620'])).toBe(true)
    expect(leEscribisteHoy(escritos, ['+51 970 616 406'])).toBe(true)
  })
  it('alcanza con que coincida uno de los números de la persona', () => {
    expect(leEscribisteHoy(escritos, [null, '', '0247715122620', '5492477512620'])).toBe(true)
  })
  it('a quien no le escribiste, no', () => {
    expect(leEscribisteHoy(escritos, ['5493834270554'])).toBe(false)
    expect(leEscribisteHoy(new Set(), ['5492477512620'])).toBe(false)
  })
})
