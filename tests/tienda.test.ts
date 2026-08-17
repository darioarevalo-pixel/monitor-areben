/**
 * La tienda pública de cada marca.
 *
 * Lo que amarran estos tests no es la lógica —son cuatro líneas— sino los **valores**: el dominio
 * estaba escrito a mano en cinco lugares con tres valores distintos, y el día que alguien vuelva a
 * poner `www` esto tiene que ponerse en rojo. Los cuatro hosts contestan, pero el apex es el que
 * sirve Tienda Nube sin redirección.
 */

import { describe, expect, it } from 'vitest'
import { precioDeGondola } from '@/lib/exhib/core'
import { adminBaseUrl, linkProducto, ofertaVigente, precioVigente, TIENDA_BASE, tiendaBaseUrl } from '@/lib/tienda'

describe('dominios', () => {
  it('son el apex, sin www y sin barra al final', () => {
    expect(TIENDA_BASE.bdi).toBe('https://bdiaccesorios.com.ar')
    expect(TIENDA_BASE.zattia).toBe('https://zattia.com.ar')
    for (const base of Object.values(TIENDA_BASE)) {
      expect(base).not.toContain('//www.')
      expect(base.endsWith('/')).toBe(false)
    }
  })

  it('tiendaBaseUrl y adminBaseUrl distinguen la marca', () => {
    expect(tiendaBaseUrl('zattia')).toBe('https://zattia.com.ar')
    expect(adminBaseUrl('zattia')).toContain('zattiaco.mitiendanube.com')
    expect(adminBaseUrl('bdi')).toContain('bdiaccesorios4.mitiendanube.com')
  })
})

describe('linkProducto', () => {
  it('arma el link público', () => {
    expect(linkProducto('bdi', 'funda-clear-case')).toBe('https://bdiaccesorios.com.ar/productos/funda-clear-case')
    expect(linkProducto('zattia', 'corset-negro')).toBe('https://zattia.com.ar/productos/corset-negro')
  })

  it('sin handle devuelve null, nunca una URL a medias', () => {
    // El modo de falla que esto evita: `/productos/undefined` es una URL que existe, abre un 404 y
    // se puede copiar y mandar a un cliente sin que nadie lo note.
    expect(linkProducto('bdi', undefined)).toBeNull()
    expect(linkProducto('bdi', null)).toBeNull()
    expect(linkProducto('bdi', '')).toBeNull()
    expect(linkProducto('bdi', '   ')).toBeNull()
  })
})

describe('precioVigente', () => {
  it('la promo le gana al precio de lista', () => {
    expect(precioVigente({ price: 10000, promo_price: 6390 })).toBe(6390)
  })

  it('sin promo, el de lista', () => {
    expect(precioVigente({ price: 39990, promo_price: null })).toBe(39990)
    expect(precioVigente({ price: 39990, promo_price: 0 })).toBe(39990)
  })

  it('sin precio válido devuelve null, que NO es cero', () => {
    // `$0` en un WhatsApp es un problema comercial, no un detalle de formato.
    expect(precioVigente({ price: 0, promo_price: 0 })).toBeNull()
    expect(precioVigente({})).toBeNull()
    expect(precioVigente(null)).toBeNull()
    expect(precioVigente({ price: Number.NaN })).toBeNull()
  })
})

describe('ofertaVigente · lo que tiene que decir la etiqueta', () => {
  it('la promo que BAJA es una oferta, con el tachado y el porcentaje', () => {
    expect(ofertaVigente(20490, 12290)).toEqual({ aCobrar: 12290, lista: 20490, enOferta: true, pct: 40 })
  })

  it('sin promo se cobra la lista y no hay tachado', () => {
    expect(ofertaVigente(20490, null)).toEqual({ aCobrar: 20490, lista: 20490, enOferta: false, pct: null })
    expect(ofertaVigente(20490, 0)).toMatchObject({ aCobrar: 20490, enOferta: false })
  })

  it('🔑 una promo que NO baja no es oferta: se cobra la lista', () => {
    // Sube el precio de lista y queda la promo vieja arriba. Tratarla como oferta imprimiría un
    // precio más caro que el de lista y mandaría a reimprimir una etiqueta que está bien.
    expect(ofertaVigente(20490, 24990)).toMatchObject({ aCobrar: 20490, enOferta: false, pct: null })
    expect(ofertaVigente(20490, 20490)).toMatchObject({ aCobrar: 20490, enOferta: false })
  })

  it('sin precio de lista, una promo suelta es el único número que hay', () => {
    expect(ofertaVigente(null, 12290)).toMatchObject({ aCobrar: 12290, lista: null, enOferta: false })
  })

  it('sin ningún precio dice «no se sabe», nunca cero', () => {
    expect(ofertaVigente(null, null)).toEqual({ aCobrar: null, lista: null, enOferta: false, pct: null })
    expect(ofertaVigente(0, 0)).toMatchObject({ aCobrar: null })
    expect(ofertaVigente(Number.NaN, undefined)).toMatchObject({ aCobrar: null })
  })

  it('Etiquetas y Exhibición contestan lo MISMO — es el motivo de que la regla viva acá', () => {
    for (const [lista, promo] of [[20490, 12290], [20490, 24990], [20490, null], [null, 9990]] as const) {
      expect(precioDeGondola({ precio: lista, promo })).toEqual(ofertaVigente(lista, promo))
    }
  })
})
