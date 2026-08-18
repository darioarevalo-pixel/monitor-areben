import { describe, expect, it } from 'vitest'
import { sanearCostos } from '../lib/norte/costos'
import { estadoDeCompra } from '../lib/norte/core'
import type { ImportacionProyectada } from '../lib/norte/tipos'

/**
 * 🔴 **Es el verbo que ESCRIBE la deuda**, y en este repo es el que más veces falló. Por eso el
 * saneado vive fuera del handler: acá se puede ejercer contra los casos raros de verdad, en vez de
 * comprobar que el archivo contenga una línea.
 */
describe('sanearCostos', () => {
  it('deja pasar un costo por bloque, con su nombre y sus unidades', () => {
    expect(sanearCostos([{ bloqueId: 'i', nombre: 'IMD', costo: 1.08, unidades: null }])).toEqual([
      { bloqueId: 'i', nombre: 'IMD', costo: 1.08, unidades: null },
    ])
  })

  it('un costo negativo NO entra: no hay material que devuelva plata', () => {
    expect(sanearCostos([{ bloqueId: 'i', costo: -1 }])).toEqual([])
  })

  it('🔑 un CERO sí entra, y el motor lo lee como «falta el costo»', () => {
    // El umbral de «costeado» se decide en un solo lugar. Si el saneador también lo aplicara,
    // serían dos reglas que pueden discrepar el día que una cambie.
    expect(sanearCostos([{ bloqueId: 'i', costo: 0 }])[0].costo).toBe(0)
    const imp: ImportacionProyectada = {
      id: 'x',
      desc: 'X',
      llega: '2026-09-01',
      unidades: 100,
      arribada: false,
      bloques: [{ id: 'i', nombre: 'IMD', unidades: 100 }],
      condiciones: {
        ingresoId: 'x',
        fechaFactura: '',
        costos: sanearCostos([{ bloqueId: 'i', nombre: 'IMD', costo: 0 }]),
        moneda: 'USD',
        cuotas: [{ dias: 30, pct: 100 }],
        nota: '',
        confirmado: false,
        fechaIngreso: '',
      },
    }
    expect(estadoDeCompra(imp).peldano).toBe('incompleta')
  })

  it('sin bloque no entra: un costo que no cuelga de nada no se puede ni sumar ni nombrar', () => {
    expect(sanearCostos([{ nombre: 'IMD', costo: 1.08 }])).toEqual([])
  })

  it('⚠️ unidades en cero se respeta, y «no vino» queda en null', () => {
    const [cero, vacio] = sanearCostos([
      { bloqueId: 'a', costo: 1, unidades: 0 },
      { bloqueId: 'b', costo: 1, unidades: '' },
    ])
    expect(cero.unidades).toBe(0)
    expect(vacio.unidades).toBeNull()
  })

  it('dos filas del mismo bloque: gana la primera, la segunda no pisa en silencio', () => {
    const out = sanearCostos([
      { bloqueId: 'i', costo: 1.08 },
      { bloqueId: 'i', costo: 9.99 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].costo).toBe(1.08)
  })

  it('lo que no es una lista, o trae basura, no rompe el guardado', () => {
    expect(sanearCostos(null)).toEqual([])
    expect(sanearCostos([null, 'x', { bloqueId: 'i', costo: 'no-es-numero' }])).toEqual([])
  })

  it('los números en texto se aceptan: el formulario manda strings', () => {
    expect(sanearCostos([{ bloqueId: 'i', costo: '1.35', unidades: '6480' }])[0]).toEqual({
      bloqueId: 'i',
      nombre: '',
      costo: 1.35,
      unidades: 6480,
    })
  })
})
