// Un producto que está en la tienda SIN foto ⛔ le pide prestada la foto a otro de nombre parecido.
import { describe, it, expect } from 'vitest'
import { indexarTn, imagenesDe } from '../lib/tn-match.core.js'

const DARK = { name: 'BERMUDA DARK CAMO', sku: 'RBE-0016-36', images: ['https://tn/dark.jpg'] }
const CAM = { name: 'BERMUDA CAM', sku: 'RBE-0023-M', images: [] }

describe('el índice de fotos y los productos sin foto (9-oct-2026)', () => {
  const idx = indexarTn([DARK, CAM], { soloConImagenes: true })

  it('🔴 BERMUDA CAM está en la tienda sin foto ⇒ sin foto, ⛔ la de BERMUDA DARK CAMO', () => {
    expect(imagenesDe({ name: 'BERMUDA CAM', sku: null }, idx)).toEqual([])
    expect(imagenesDe({ name: 'OTRO NOMBRE', sku: 'RBE-0023-M' }, idx)).toEqual([])
  })

  it('un nombre que la tienda no conoce sigue cruzando por palabras, como siempre', () => {
    expect(imagenesDe({ name: 'BERMUDA DARK', sku: null }, idx)).toEqual(['https://tn/dark.jpg'])
  })

  it('con foto, el exacto gana como siempre', () => {
    expect(imagenesDe({ name: 'BERMUDA DARK CAMO', sku: null }, idx)).toEqual(['https://tn/dark.jpg'])
  })
})
