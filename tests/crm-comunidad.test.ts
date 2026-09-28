import { describe, expect, it } from 'vitest'
import { antiguedadFoto, estaEnComunidad, fotoDistinta, indexarComunidad } from '@/lib/crm/comunidad'

describe('comunidad de WhatsApp', () => {
  // Como vienen de WhatsApp: forma 549 + característica + abonado.
  const indice = indexarComunidad(['5493834270554', '5491170157094'])

  it('reconoce el número del chat tal cual', () => {
    expect(estaEnComunidad(indice, '5493834270554')).toBe(true)
  })

  it('reconoce el número como está cargado en Gestión Nube', () => {
    expect(estaEnComunidad(indice, '0383 4270554')).toBe(true)
    expect(estaEnComunidad(indice, '11 7015-7094')).toBe(true)
  })

  it('dice que no cuando no está', () => {
    expect(estaEnComunidad(indice, '3834999999')).toBe(false)
  })

  it('no opina sin un teléfono que sirva', () => {
    expect(estaEnComunidad(indice, '')).toBe(null)
    expect(estaEnComunidad(indice, null)).toBe(null)
    expect(estaEnComunidad(indice, '1234')).toBe(null)
  })

  it('guarda sólo si cambió quién está o si la foto es vieja', () => {
    const ahora = new Date('2026-09-28T12:00:00Z')
    const g = { tels: ['1', '2'], grupo: 'x', participantes: 2, actualizado: '2026-09-28T08:00:00Z' }
    expect(fotoDistinta(null, ['1'], ahora)).toBe(true)
    expect(fotoDistinta(g, ['2', '1'], ahora)).toBe(false)
    expect(fotoDistinta(g, ['1', '3'], ahora)).toBe(true)
    expect(fotoDistinta(g, ['1'], ahora)).toBe(true)
    expect(fotoDistinta({ ...g, actualizado: '2026-09-27T08:00:00Z' }, ['1', '2'], ahora)).toBe(true)
  })

  it('dice cuánto tiene la lista', () => {
    const hoy = new Date('2026-09-28T12:00:00Z')
    expect(antiguedadFoto('2026-09-28T01:00:00Z', hoy)).toBe('hoy')
    expect(antiguedadFoto('2026-09-27T10:00:00Z', hoy)).toBe('ayer')
    expect(antiguedadFoto('2026-09-23T10:00:00Z', hoy)).toBe('hace 5 días')
  })
})
