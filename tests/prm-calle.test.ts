import { describe, it, expect } from 'vitest'
import { leerPrecio, usuarioDeInstagram } from '@/lib/prm/core'

describe('leerPrecio', () => {
  // 🔴 El caso que motiva la función: `Number('12.500')` da 12,5 — mil veces más barato y plausible.
  it('el punto que agrupa de a tres son miles', () => {
    expect(leerPrecio('12.500')).toBe(12500)
    expect(leerPrecio('1.250.000')).toBe(1250000)
    expect(leerPrecio('$ 12.500')).toBe(12500)
  })
  it('la coma es decimal', () => {
    expect(leerPrecio('12.500,50')).toBe(12500.5)
    expect(leerPrecio('9900,5')).toBe(9900.5)
  })
  it('sin separadores, tal cual', () => {
    expect(leerPrecio('12500')).toBe(12500)
    expect(leerPrecio('12.5')).toBe(12.5)
  })
  it('vacío es null y lo que no se entiende es undefined (⛔ no un 0)', () => {
    expect(leerPrecio('')).toBeNull()
    expect(leerPrecio('  ')).toBeNull()
    expect(leerPrecio(null)).toBeNull()
    expect(leerPrecio('doce mil')).toBeUndefined()
    expect(leerPrecio('12-500')).toBeUndefined()
  })
})

describe('usuarioDeInstagram', () => {
  it('saca la @ y el link', () => {
    expect(usuarioDeInstagram('@luma.studio')).toBe('luma.studio')
    expect(usuarioDeInstagram('luma.studio')).toBe('luma.studio')
    expect(usuarioDeInstagram('https://www.instagram.com/luma.studio/?hl=es')).toBe('luma.studio')
  })
  it('vacío es null', () => {
    expect(usuarioDeInstagram('')).toBeNull()
    expect(usuarioDeInstagram(' @ ')).toBeNull()
  })
})
