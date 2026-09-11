import { describe, expect, it } from 'vitest'
import { filtrarGrilla, mesasDe, opcionesDeGrilla, tipoDePrenda, tiposDe } from '@/lib/liquidacion/core'
import type { LiquidacionItem } from '@/lib/liquidacion/tipos'

/**
 * Agrupar los productos de una campaña para revisarlos de a tandas.
 *
 * Pedido de Bruno, 11-sep-2026: *«quiero terminar de revisar los productos de la feria, pero no
 * tengo un filtro para poder agruparlos en la pestaña de productos»* — 351 productos, 65 sin
 * revisar.
 *
 * Los mutantes que tienen que caer:
 *
 *  1. `mesasDe` contando los que ⛔ no tienen precio: inventa una mesa que ⛔ no existe.
 *  2. `opcionesDeGrilla` contando sin mirar los otros filtros: el selector promete filas que la
 *     tabla ⛔ no va a mostrar.
 *  3. `opcionesDeGrilla` contando cada selector mirando SU PROPIA elección: al elegir una mesa
 *     queda una sola opción y ⛔ no hay cómo saltar a otra.
 *  4. `filtrarGrilla` y los contadores dejando de ser la misma regla.
 */

const it_ = (pid: string, nombre: string, precio: number | null, estado = 'definido'): LiquidacionItem => ({
  pid, estado,
  foto: { nombre, sku: null, costo: 0, sinCosto: false, precioNormal: 0, promoPrevia: null,
    stock: 0, ventas7: 0, ventas30: 0, ventas90: 0, vidaUtil: null, ultimaVenta: null,
    diasSinVender: 0, imagen: null },
  decision: { precioSale: precio, pctDesc: null, markup: null, margen: null, nota: null, porQuien: null, cuando: null },
  aplicacion: { aplicadoEn: null, precioEscrito: null, variantesEscritas: null, categoriaSaleAgregada: false },
} as unknown as LiquidacionItem)

const CAMPANIA = [
  it_('1', 'SWEATER DAKOTA', 5990),
  it_('2', 'SWEATER NEVADA', 5990, 'confirmado'),
  it_('3', 'TOP WHISPER', 1990),
  it_('4', 'TOP MIST', 1990, 'confirmado'),
  it_('5', 'TOP NIXA', 8990),
  it_('6', 'SIN PRECIO TODAVIA', null, 'pendiente'),
]

describe('agrupar por precio de mesa', () => {
  it('🔴 el que ⛔ no tiene precio ⛔ no inventa una mesa', () => {
    expect(mesasDe(CAMPANIA)).toEqual([
      { precio: 1990, n: 2 }, { precio: 5990, n: 2 }, { precio: 8990, n: 1 },
    ])
  })
})

describe('agrupar por tipo de prenda', () => {
  it('es la primera palabra, y sale del dato', () => {
    expect(tipoDePrenda('SWEATER DAKOTA')).toBe('SWEATER')
    expect(tiposDe(CAMPANIA)).toEqual([
      { tipo: 'TOP', n: 3 }, { tipo: 'SIN', n: 1 }, { tipo: 'SWEATER', n: 2 },
    ].sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo)))
  })

  it('un nombre vacío ⛔ no rompe', () => {
    expect(tipoDePrenda('')).toBe('—')
    expect(tipoDePrenda('   ')).toBe('—')
  })
})

describe('🔴 los contadores ⛔ no pueden mentir', () => {
  it('miran los OTROS filtros: con «Definidos» puesto, la mesa cuenta sólo los definidos', () => {
    const { mesas } = opcionesDeGrilla(CAMPANIA, { estado: 'definido' })
    expect(mesas).toEqual([{ precio: 1990, n: 1 }, { precio: 5990, n: 1 }, { precio: 8990, n: 1 }])
  })

  it('🔴 y lo que promete el contador es EXACTAMENTE lo que muestra la tabla', () => {
    // La prueba de que las dos son la misma regla. Un mutante que las separe muere acá.
    for (const estado of ['', 'definido', 'confirmado']) {
      for (const { precio } of opcionesDeGrilla(CAMPANIA, { estado }).mesas) {
        const cortes = { estado, mesa: String(precio) }
        const prometido = opcionesDeGrilla(CAMPANIA, { estado }).mesas.find((m) => m.precio === precio)!.n
        expect(filtrarGrilla(CAMPANIA, cortes).length, `estado «${estado}», mesa ${precio}`).toBe(prometido)
      }
    }
  })

  it('🔴 cada selector IGNORA su propia elección: elegir una mesa ⛔ no deja una sola opción', () => {
    const { mesas, prendas } = opcionesDeGrilla(CAMPANIA, { mesa: '1990' })
    expect(mesas.length).toBe(3)
    // Y el OTRO selector sí la respeta: con la mesa de $1.990 puesta, sólo hay TOPs.
    expect(prendas).toEqual([{ tipo: 'TOP', n: 2 }])
  })

  it('el buscador también entra en la cuenta', () => {
    expect(opcionesDeGrilla(CAMPANIA, { q: 'sweater' }).mesas).toEqual([{ precio: 5990, n: 2 }])
  })
})
