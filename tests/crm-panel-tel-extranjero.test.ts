import { describe, it, expect } from 'vitest'
import { telDelChat } from '@/components/panel/PanelWhatsApp'

/**
 * 16-oct-2026: un chat de Perú (+51 970 616 406) dejaba el panel en «Abrí el chat de una persona»
 * con la conversación abierta — `normalizeArgPhone` devuelve '' para lo que no es argentino.
 */
describe('telDelChat · el número del chat, sea de donde sea', () => {
  it('un argentino sale normalizado, como siempre', () => {
    expect(telDelChat('+54 9 2477 51-2620')).toBe('5492477512620')
  })
  it('🔴 uno de otro país NO queda vacío', () => {
    expect(telDelChat('+51 970 616 406')).toBe('51970616406')
  })
  it('lo que no es un teléfono sigue vacío', () => {
    expect(telDelChat('')).toBe('')
    expect(telDelChat('12345')).toBe('')
  })
})
