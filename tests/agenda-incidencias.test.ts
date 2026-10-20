import { describe, expect, it } from 'vitest'
import { incidenciaValida, mensajeValido, tituloAviso } from '../lib/agenda/incidencias.core.js'

describe('incidencias', () => {
  it('sólo las tres de Darío: algo roto, insumos u otro', () => {
    expect(incidenciaValida({ tipo: 'roto', texto: ' No anda el posnet ', urgente: 1 })).toEqual({ tipo: 'roto', texto: 'No anda el posnet', urgente: true })
    expect(() => incidenciaValida({ tipo: 'caja', texto: 'x' })).toThrow(/Algo roto/)
    expect(() => incidenciaValida({ tipo: 'otro', texto: '  ' })).toThrow(/qué pasó/)
  })
  it('el título del aviso marca lo urgente', () => {
    expect(tituloAviso({ tipo: 'roto', urgente: true }, 'Camila')).toBe('🔴 Urgente · Camila: Algo roto')
    expect(tituloAviso({ tipo: 'insumos', urgente: false }, 'Josefina')).toBe('Josefina: Insumos')
  })
  it('la respuesta no puede ir vacía', () => {
    expect(() => mensajeValido('')).toThrow()
    expect(mensajeValido(' ok ')).toBe('ok')
  })
})
