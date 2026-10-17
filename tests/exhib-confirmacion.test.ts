// La confirmación del ticket con el lector (Darío, 17-oct-2026): qué es cada prenda escaneada.
import { describe, it, expect } from 'vitest'
import { anotar, juntarMarcas, listaDelTicket, resolverEscaneo, resumenConfirmacion, type Confirmacion } from '../lib/exhib/confirmacion'
import { resumenDeConfirmacion } from '../lib/exhib/correo.core.js'

const conf = (): Confirmacion => ({
  lista: {
    pendientes: [{ clave: 'B1', sku: 'RTO-1', nombre: 'TOP IVORY', variante: 'BLANCO' }, { clave: '99|*', sku: 'RTO-2', nombre: 'TOP JADE', variante: '' }],
    duplicadas: [{ clave: 'B3', sku: 'RTO-3', nombre: 'TOP WREN', variante: 'GRIS' }],
  },
  impreso_en: 'i',
  impreso_por: 'Darío',
  exhibidos: {},
  retirados: {},
})
const prenda = (barcode: string, productId = '1', size = 'X') => ({ barcode, productId, size })

describe('resolverEscaneo', () => {
  it('lo pendiente se exhibe, lo duplicado se retira, lo demás ⛔ está en el ticket', () => {
    expect(resolverEscaneo(conf(), prenda('B1'))).toMatchObject({ que: 'exhibido' })
    expect(resolverEscaneo(conf(), prenda('B3'))).toMatchObject({ que: 'retirado' })
    expect(resolverEscaneo(conf(), prenda('ZZ'))).toEqual({ que: 'fuera' })
  })
  it('🔑 «una cualquiera» se cumple con cualquier variante del modelo', () => {
    expect(resolverEscaneo(conf(), prenda('OTRO', '99', 'NEGRO'))).toMatchObject({ que: 'exhibido', renglon: { clave: '99|*' } })
  })
  it('la segunda vez dice «ya» y ⛔ cambia nada', () => {
    const c = anotar(conf(), resolverEscaneo(conf(), prenda('B1')), 'h1')
    const r = resolverEscaneo(c, prenda('B1'))
    expect(r).toMatchObject({ que: 'ya', lista: 'exhibidos' })
    expect(anotar(c, r, 'h2').exhibidos).toEqual({ B1: 'h1' })
  })
})

describe('resumen', () => {
  it('cuenta lo hecho y lista lo que faltó; el del correo da lo mismo', () => {
    const c = { ...conf(), exhibidos: { B1: 'h' }, retirados: { B3: 'h' } }
    const r = resumenConfirmacion(c)
    expect(r).toMatchObject({ exhibidos: 1, pendientes: 2, retirados: 1, duplicadas: 1 })
    expect(r.sinExhibir.map((x) => x.clave)).toEqual(['99|*'])
    expect(resumenDeConfirmacion(c)).toEqual(r)
  })
  it('juntarMarcas se queda con todas y con la hora más temprana', () => {
    expect(juntarMarcas({ a: '2', b: '1' }, { a: '1', c: '3' })).toEqual({ a: '1', b: '1', c: '3' })
  })
  it('la lista del ticket lleva lo justo de cada renglón', () => {
    const l = listaDelTicket([{ clave: 'B1', sku: 's', productId: '1', nombre: 'n', variante: 'v', enLocal: 3, unaCualquiera: false, nuevo: null }], [])
    expect(l.pendientes[0]).toEqual({ clave: 'B1', sku: 's', nombre: 'n', variante: 'v' })
  })
})
