import { describe, expect, it } from 'vitest'
import { estadoContacto, plazosConSugerido, textoEstado } from '@/lib/crm/proximo'

describe('estadoContacto', () => {
  const hoy = '2026-10-19'
  it('sin fecha', () => {
    expect(estadoContacto(null, hoy)).toEqual({ estado: 'sin-fecha', dias: null })
    expect(estadoContacto('', hoy).estado).toBe('sin-fecha')
  })
  it('atrasado, hoy y agendado', () => {
    expect(estadoContacto('2026-10-15', hoy)).toEqual({ estado: 'atrasado', dias: -4 })
    expect(estadoContacto('2026-10-19', hoy)).toEqual({ estado: 'hoy', dias: 0 })
    expect(estadoContacto('2026-10-24', hoy)).toEqual({ estado: 'agendado', dias: 5 })
  })
  it('cruza el cambio de mes', () => {
    expect(estadoContacto('2026-11-02', '2026-10-30').dias).toBe(3)
  })
  it('texto', () => {
    expect(textoEstado({ estado: 'atrasado', dias: -1 })).toBe('Atrasado 1 día')
    expect(textoEstado({ estado: 'atrasado', dias: -4 })).toBe('Atrasado 4 días')
    expect(textoEstado({ estado: 'agendado', dias: 3 })).toBe('Agendado')
  })
})

describe('plazosConSugerido', () => {
  it('sin sugerido: los siete de siempre, ordenados', () => {
    expect(plazosConSugerido(null).map((p) => p.dias)).toEqual([1, 2, 3, 7, 15, 21, 30])
    expect(plazosConSugerido(null).some((p) => p.sugerido)).toBe(false)
  })
  it('el sugerido cae en su lugar', () => {
    const p = plazosConSugerido(5)
    expect(p.map((x) => x.dias)).toEqual([1, 2, 3, 5, 7, 15, 21, 30])
    expect(p.find((x) => x.sugerido)?.dias).toBe(5)
  })
  it('si coincide con uno fijo no se repite', () => {
    const p = plazosConSugerido(7)
    expect(p.map((x) => x.dias)).toEqual([1, 2, 3, 7, 15, 21, 30])
    expect(p.filter((x) => x.sugerido).map((x) => x.dias)).toEqual([7])
  })
  it('más largo que 30 va al final', () => {
    expect(plazosConSugerido(45).map((x) => x.dias).at(-1)).toBe(45)
  })
})
