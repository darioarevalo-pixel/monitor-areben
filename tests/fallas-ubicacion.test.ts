/**
 * De dónde sale la unidad que se carga como falla.
 *
 * El oráculo ⛔ no es inventado: son **las seis fallas reales de Zattia** al 21-sep-2026 y el stock
 * partido de sus variantes, leído del espejo. Las tres que descontaron de depósito son las tres que
 * dejaron el depósito en negativo.
 */

import { describe, expect, it } from 'vitest'
import { frasePorQue, ubicacionDeFalla } from '@/lib/postventa/fallas/core'
import { ladoDeTienda, partirStock } from '@/lib/sesionfotos/core'

describe('ladoDeTienda — las dos marcas escriben distinto', () => {
  it('Zattia escribe `Deposito ` con espacio al final', () => {
    expect(ladoDeTienda('Deposito ')).toBe('deposito')
    expect(ladoDeTienda('Local')).toBe('local')
  })

  it('BDI parte el depósito en dos, y el Mayorista NO es un lado del que se descuente', () => {
    expect(ladoDeTienda('Deposito Minorista')).toBe('deposito')
    expect(ladoDeTienda('Deposito Mayorista')).toBe(null)
  })

  it('lo que no reconoce contesta null, y ⛔ no lo manda al depósito por descarte', () => {
    expect(ladoDeTienda(null)).toBe(null)
    expect(ladoDeTienda('')).toBe(null)
    expect(ladoDeTienda('Showroom')).toBe(null)
  })

  it('partirStock deja el mayorista aparte, para no mentir el total', () => {
    const p = partirStock([
      { store_name: 'Local', available_quantity: 3 },
      { store_name: 'Deposito Minorista', available_quantity: 5 },
      { store_name: 'Deposito Mayorista', available_quantity: 40 },
    ])
    expect(p).toEqual({ local: 3, deposito: 5, otros: 40 })
  })
})

describe('ubicacionDeFalla — el caso que lo trajo', () => {
  // TOP ALAIA CELESTE, falla #21: Local 2, Depósito 0. La cargó Depósito y descontó de depósito.
  const topAlaia = { local: 2, deposito: 0 }

  it('🔴 cargada desde DEPÓSITO, con el stock sólo en el Local, sale del LOCAL', () => {
    const d = ubicacionDeFalla(topAlaia, 1, 'deposito')
    expect(d.origen).toBe('local')
    expect(d.porQue).toBe('stock')
  })

  it('🔴 y Administración eligiendo «Depósito» a mano tampoco lo descuenta de ahí', () => {
    expect(ubicacionDeFalla(topAlaia, 1, 'admin', 'deposito').origen).toBe('local')
  })

  it('el mismo caso al revés: sólo en depósito, cargada desde el Local, sale del DEPÓSITO', () => {
    expect(ubicacionDeFalla({ local: 0, deposito: 4 }, 1, 'local').origen).toBe('deposito')
  })

  it('con stock en los DOS lados manda la sección, que es la preferencia', () => {
    const stock = { local: 3, deposito: 3 }
    expect(ubicacionDeFalla(stock, 1, 'deposito').porQue).toBe('seccion')
    expect(ubicacionDeFalla(stock, 1, 'deposito').origen).toBe('deposito')
    expect(ubicacionDeFalla(stock, 1, 'local').origen).toBe('local')
    expect(ubicacionDeFalla(stock, 1, 'admin', 'deposito').origen).toBe('deposito')
  })

  it('sin stock en ninguno manda la sección: el que tiene la prenda en la mano sabe más que el espejo', () => {
    expect(ubicacionDeFalla({ local: 0, deposito: 0 }, 1, 'deposito').origen).toBe('deposito')
    expect(ubicacionDeFalla({ local: 0, deposito: 0 }, 1, 'local').origen).toBe('local')
  })

  it('un negativo ⛔ no alcanza: TOP ALAIA hoy está en Depósito −1 y sigue saliendo del Local', () => {
    expect(ubicacionDeFalla({ local: 2, deposito: -1 }, 1, 'deposito').origen).toBe('local')
  })

  it('⚠️ sin stock partido (falla libre) vuelve a ser la preferencia de siempre', () => {
    expect(ubicacionDeFalla(null, 1, 'deposito').origen).toBe('deposito')
    expect(ubicacionDeFalla(null, 1, 'admin', 'deposito').origen).toBe('deposito')
    expect(ubicacionDeFalla(null, 1, 'local').origen).toBe('local')
  })

  it('la cantidad cuenta: 2 unidades con 1 en el local y 3 en depósito salen del depósito', () => {
    expect(ubicacionDeFalla({ local: 1, deposito: 3 }, 2, 'local').origen).toBe('deposito')
  })
})

describe('frasePorQue — canta dónde cae, no qué sección estaba abierta', () => {
  it('dice el lado Y los dos números, que es lo que el buscador no mostraba', () => {
    const stock = { local: 2, deposito: 0 }
    const f = frasePorQue(ubicacionDeFalla(stock, 1, 'deposito'), stock)
    expect(f).toContain('Local')
    expect(f).toContain('Local 2 · Depósito 0')
    expect(f).not.toContain('Sale de Depósito')
  })
})

/**
 * **Ensayo contra las fallas REALES de Zattia**, antes de deployar.
 *
 * 📊 Las siete filas de `fallas_deposito` al 21-sep-2026, con el stock partido de su variante
 * **leído del espejo ese mismo día** (`inventario`, sumando por `store_name`).
 *
 * ⚠️ **Es el stock de HOY, ⛔ no el del momento en que se cargó cada falla** —el de TOP ALAIA ya
 * tiene adentro el −1 que dejó— así que esto ⛔ no reconstruye el pasado: dice qué haría la regla
 * nueva **hoy**, sobre los mismos siete casos.
 */
const REALES = [
  { id: 18, producto: 'BLUSA CAMELIA', seccion: 'local', local: 2, deposito: 0 },
  { id: 19, producto: 'CORSET BERNA S-Azul', seccion: 'deposito', local: 6, deposito: 0 },
  { id: 20, producto: 'SHORT MAITE S', seccion: 'deposito', local: 1, deposito: -1 },
  { id: 21, producto: 'TOP ALAIA CELESTE', seccion: 'deposito', local: 2, deposito: -1 },
  { id: 22, producto: 'CORPIÑO AYLA M', seccion: 'local', local: 4, deposito: 6 },
  { id: 23, producto: 'TOP AMOK CHOCOLATE', seccion: 'local', local: 2, deposito: 0 },
  { id: 24, producto: 'FALDA SAGE', seccion: 'local', local: 3, deposito: 3 },
] as const

describe('ensayo sobre las 7 fallas reales de Zattia (21-sep-2026)', () => {
  it('las 4 que cargó el LOCAL ⛔ no se mueven: siguen saliendo del Local', () => {
    const delLocal = REALES.filter((f) => f.seccion === 'local')
    expect(delLocal).toHaveLength(4)
    for (const f of delLocal) {
      expect(ubicacionDeFalla({ local: f.local, deposito: f.deposito }, 1, 'local').origen, f.producto).toBe('local')
    }
  })

  it('🔴 las 3 que cargó DEPÓSITO salen del Local, que es donde está la prenda', () => {
    const delDeposito = REALES.filter((f) => f.seccion === 'deposito')
    expect(delDeposito).toHaveLength(3)
    for (const f of delDeposito) {
      const d = ubicacionDeFalla({ local: f.local, deposito: f.deposito }, 1, 'deposito')
      expect(d.origen, f.producto).toBe('local')
      expect(d.porQue, f.producto).toBe('stock')
    }
  })

  it('📊 y ninguna de las 7 sale de un lado que ⛔ no tiene la unidad', () => {
    const quedanNegativas = REALES.filter((f) => {
      const d = ubicacionDeFalla({ local: f.local, deposito: f.deposito }, 1, f.seccion)
      return (d.origen === 'local' ? f.local : f.deposito) < 1
    })
    expect(quedanNegativas).toEqual([])
  })
})
