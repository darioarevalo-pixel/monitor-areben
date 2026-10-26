import { describe, expect, it } from 'vitest'
import { MAX_DESCRIPCION, descripcionLimpia, respuestaLimpia } from '../lib/agenda/mejorar.core.js'

describe('Ordenar con IA', () => {
  it('limpia y acota lo que llega', () => {
    expect(descripcionLimpia('  hola \r\n')).toBe('hola')
    expect(descripcionLimpia('a'.repeat(MAX_DESCRIPCION + 50))).toHaveLength(MAX_DESCRIPCION)
    expect(descripcionLimpia(null)).toBe('')
  })
  it('saca comillas y vallas de la respuesta', () => {
    expect(respuestaLimpia('"Contar el estante B3"')).toBe('Contar el estante B3')
    expect(respuestaLimpia('```\n- Paso 1\n```')).toBe('- Paso 1')
  })
})
