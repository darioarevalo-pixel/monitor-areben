/**
 * La tienda pública de cada marca.
 *
 * Lo que amarran estos tests no es la lógica —son cuatro líneas— sino los **valores**: el dominio
 * estaba escrito a mano en cinco lugares con tres valores distintos, y el día que alguien vuelva a
 * poner `www` esto tiene que ponerse en rojo. Los cuatro hosts contestan, pero el apex es el que
 * sirve Tienda Nube sin redirección.
 */

import { describe, expect, it } from 'vitest'
import { adminBaseUrl, linkProducto, precioVigente, TIENDA_BASE, tiendaBaseUrl } from '@/lib/tienda'

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
