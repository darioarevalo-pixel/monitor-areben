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

import { corto, cuandoAviso, cuerpoTarea } from '../lib/agenda/aviso-texto.core.js'
describe('Avisos del celular: texto corto', () => {
  it('corta en una línea con «…»', () => {
    expect(corto('hola\n  mundo')).toBe('hola mundo')
    expect(corto('a'.repeat(100))).toHaveLength(60)
    expect(corto('a'.repeat(100)).endsWith('…')).toBe(true)
  })
  it('dice para cuándo es si no es de hoy', () => {
    expect(cuandoAviso('2026-10-25', '2026-10-25')).toBe('')
    expect(cuandoAviso('2026-10-26', '2026-10-25')).toBe('mañana')
    expect(cuandoAviso('2026-10-28', '2026-10-25')).toBe('28/10')
    expect(cuerpoTarea('Contar B3', '2026-10-26', '2026-10-25')).toBe('Contar B3 · mañana')
    expect(cuerpoTarea('Contar B3', '2026-10-25', '2026-10-25')).toBe('Contar B3')
  })
})
