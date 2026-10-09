// La foto de Ingresos cubre el hueco de Tienda Nube, y ⛔ nunca le gana.
import { describe, it, expect } from 'vitest'
import { indexarFotosIngreso, fotosConRespaldo } from '../lib/recepciones/fotos.core.js'

const ING = 'https://ingreso2.arebensrl.com/uploads/1/principal_detail.webp'
const ING_CHICA = 'https://ingreso2.arebensrl.com/uploads/1/principal_thumb.webp'
const idx = indexarFotosIngreso([
  { nombre: 'TOP AURA', sku: 'TAU-0001-S', imagen_url: ING, imagen_thumb_url: ING_CHICA },
  { nombre: 'MINI ROMA', sku: 'MRO-0002-M', imagen_url: null, imagen_thumb_url: null },
])

describe('fotosConRespaldo', () => {
  it('con foto en Tienda Nube, gana Tienda Nube aunque Ingresos tenga', () => {
    const r = fotosConRespaldo({ name: 'TOP AURA', sku: null }, ['https://tn/1.jpg', 'https://tn/2.jpg'], idx)
    expect(r).toEqual({ origen: 'tn', imagenes: ['https://tn/1.jpg', 'https://tn/2.jpg'], miniatura: 'https://tn/1.jpg' })
  })

  it('sin foto en Tienda Nube, usa la de Ingresos: miniatura chica, grande para ampliar', () => {
    const r = fotosConRespaldo({ name: ' top aura ', sku: null }, [], idx)
    expect(r).toEqual({ origen: 'ingreso', imagenes: [ING], miniatura: ING_CHICA })
  })

  it('cruza por SKU cuando el nombre no coincide', () => {
    expect(fotosConRespaldo({ name: 'OTRO NOMBRE', sku: 'tau-0001-s' }, [], idx).origen).toBe('ingreso')
  })

  it('⛔ no cruza por palabras sueltas: una foto de otro producto es peor que ninguna', () => {
    expect(fotosConRespaldo({ name: 'TOP AURA LARGO', sku: null }, [], idx).origen).toBeNull()
  })

  it('un renglón sin foto no tapa el hueco, y sin índice todavía dice «sin foto»', () => {
    expect(fotosConRespaldo({ name: 'MINI ROMA', sku: null }, [], idx).origen).toBeNull()
    expect(fotosConRespaldo({ name: 'TOP AURA', sku: null }, [''], null)).toEqual({ origen: null, imagenes: [], miniatura: null })
  })

  it('si entró en dos OC, gana la foto de la última', () => {
    const dos = indexarFotosIngreso([
      { nombre: 'TOP AURA', imagen_url: 'vieja' },
      { nombre: 'TOP AURA', imagen_url: 'nueva' },
    ])
    expect(fotosConRespaldo({ name: 'TOP AURA', sku: null }, [], dos).imagenes).toEqual(['nueva'])
  })
})
