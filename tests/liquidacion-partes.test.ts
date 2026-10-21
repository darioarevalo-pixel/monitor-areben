import { describe, expect, it } from 'vitest'
import { agruparPorPrenda, conParte, filtrarGrilla, opcionesDeGrilla, parteDe, partesDe, SIN_PARTE } from '@/lib/liquidacion/core'
import type { LiquidacionItem } from '@/lib/liquidacion/tipos'

/**
 * Las partes de una campaña. Pedido de Bruno, 21-oct-2026, armando el CYBER MONDAY: *«que se pueda
 * separar los precios dentro de una liquidación en varias partes […] si hubiese alguna feria
 * preexistente, se analiza solo esos productos en concreto»* — sin partes, en la misma lista se
 * pasa de un producto en feria a uno de lista.
 *
 * Los mutantes que tienen que caer:
 *  1. Un nombre en blanco contado como una parte más: aparece un chip vacío.
 *  2. «Sin parte» filtrando igual que «todas»: el chip promete los que faltan ordenar y muestra todo.
 *  3. El contador de partes mirando su propia elección: al elegir una, ⛔ se puede saltar a otra.
 *  4. Agrupar por prenda desordenando adentro del grupo: lo pendiente deja de estar arriba.
 */

const it_ = (pid: string, nombre: string, parte: string | null, costo = 100, stock = 1): LiquidacionItem => ({
  pid, estado: 'definido', parte,
  foto: { nombre, sku: null, costo, sinCosto: false, precioNormal: 0, promoPrevia: null,
    stock, ventas7: 0, ventas30: 0, ventas90: 0, vidaUtil: null, ultimaVenta: null,
    diasSinVender: 0, imagen: null },
  decision: { precioSale: 1990, pctDesc: null, markup: null, margen: null, nota: null, porQuien: null, cuando: null },
  aplicacion: { aplicadoEn: null, precioEscrito: null, variantesEscritas: null, categoriaSaleAgregada: false },
} as unknown as LiquidacionItem)

const C = [
  it_('1', 'TOP A', 'Feria'),
  it_('2', 'TOP B', 'Feria'),
  it_('3', 'JEAN C', 'Temporada nueva'),
  it_('4', 'TOP D', null),
  it_('5', 'TOP E', '   '),
]

describe('partes de una campaña', () => {
  it('un nombre en blanco es «sin parte», ⛔ una parte más', () => {
    expect(parteDe(C[4])).toBeNull()
    expect(partesDe(C)).toEqual([
      { parte: 'Feria', n: 2 },
      { parte: 'Temporada nueva', n: 1 },
      { parte: null, n: 2 },
    ])
  })

  it('«sin parte» muestra sólo los que no tienen; una parte, sólo los suyos', () => {
    expect(filtrarGrilla(C, { parte: SIN_PARTE }).map((i) => i.pid)).toEqual(['4', '5'])
    expect(filtrarGrilla(C, { parte: 'Feria' }).map((i) => i.pid)).toEqual(['1', '2'])
    expect(filtrarGrilla(C, {}).length).toBe(5)
  })

  it('el contador de partes ignora su propia elección y respeta las demás', () => {
    const o = opcionesDeGrilla(C, { parte: 'Feria', prenda: 'TOP' })
    expect(o.partes).toEqual([{ parte: 'Feria', n: 2 }, { parte: null, n: 2 }])
    // y la prenda se cuenta dentro de la parte elegida
    expect(o.prendas).toEqual([{ tipo: 'TOP', n: 2 }])
  })

  it('conParte mueve sin mutar, y en blanco saca de la parte', () => {
    const m = conParte([C[0]], '  Cyber  ')
    expect(m[0].parte).toBe('Cyber')
    expect(C[0].parte).toBe('Feria')
    expect(conParte([C[0]], ' ')[0].parte).toBeNull()
  })
})

describe('agrupar por tipo de prenda', () => {
  it('los grupos van por plata parada y adentro se respeta el orden que trae', () => {
    const lista = [it_('1', 'TOP A', null, 10, 1), it_('2', 'JEAN B', null, 100, 5), it_('3', 'TOP C', null, 10, 9)]
    const g = agruparPorPrenda(lista)
    expect(g.map((x) => x.tipo)).toEqual(['JEAN', 'TOP'])
    expect(g[1].items.map((i) => i.pid)).toEqual(['1', '3'])
    expect(g[1].plata).toBe(100)
  })
})

describe('🔴 la parte sobrevive a la lista blanca del servidor', async () => {
  // `aplicar` y `revisar` rearman `datos` con `itemDelBody`: un campo que no esté ahí se borra al
  // escribir el precio, y la campaña pierde sus partes justo el día que se aplica.
  const { itemDelBody } = await import('../api/_liquidacion.js')
  it('pasa, recortada; en blanco queda null', () => {
    expect(itemDelBody({ pid: 1, parte: '  Venía de feria  ' })!.parte).toBe('Venía de feria')
    expect(itemDelBody({ pid: 1, parte: 'x'.repeat(60) })!.parte).toHaveLength(40)
    expect(itemDelBody({ pid: 1, parte: '  ' })!.parte).toBeNull()
    expect(itemDelBody({ pid: 1 })!.parte).toBeNull()
  })
})
