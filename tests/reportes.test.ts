import { describe, expect, it } from 'vitest'
import { reporteValido } from '@/lib/reportes/core.core.js'

/** «Ayuda / problemas» (Bruno, 12-oct): lo que acepta el servidor. El autor ⛔ viaja en el body. */
describe('reporteValido', () => {
  it('limpia el texto y corta sección y URL; el autor del body se ignora', () => {
    const r = reporteValido({ tipo: 'problema', texto: '  se rompe el ticket  ', seccion: 'caja', url: '/caja', autor: 'otro' })
    expect(r).toEqual({ tipo: 'problema', texto: 'se rompe el ticket', seccion: 'caja', url: '/caja' })
    expect(reporteValido({ tipo: 'falta', texto: 'x', seccion: 'a'.repeat(200) }).seccion).toHaveLength(80)
  })
  it('🔴 sin tipo válido, sin texto o con texto de más ⇒ error con el motivo', () => {
    expect(() => reporteValido({ tipo: 'otro', texto: 'x' })).toThrow(/problema o una mejora/)
    expect(() => reporteValido({ tipo: 'falta', texto: '   ' })).toThrow(/Contá/)
    expect(() => reporteValido({ tipo: 'falta', texto: 'x'.repeat(4001) })).toThrow(/4000/)
    expect(() => reporteValido(null)).toThrow()
  })
})
