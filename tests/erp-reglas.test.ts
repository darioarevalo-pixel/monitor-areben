import { describe, expect, it } from 'vitest'
import { compararConCaja, leerReglaDePantalla, leerSimulacion, resumenDeRegla } from '@/lib/erp/reglas.core.js'
import { reglasDeCaja } from '@/motor/venta/reglas.mjs'

const AHORA = Date.parse('2026-10-16T21:00:00Z')
const config = {
  feriaCampanias: ['liq1'],
  cuentas: { 12921: { descuento: 15 }, 13015: { descuento: 10 }, 20595: { descuento: 10 }, 20196: { descuento: 10 }, 25172: { descuento: 10 }, 25188: { descuento: 0 }, 25173: { descuento: 0 } },
  medios: { efectivo: { normal: 12921, feria: 25867 }, transferencia: { opciones: [13015, 20595], feria: 25868 }, debito: { normal: 20196 }, credito: { normal: 25188, promo: 25172, seisCuotas: 25173, minSeisCuotas: 250000 }, tarjetaOferta: 25869 },
}

describe('leerSimulacion', () => {
  it('lee prendas, día, canal, banco, cuotas y la rebaja', () => {
    const s = leerSimulacion({ renglones: [{ producto: '571449', precio: '17.990', cantidad: 2 }, { nombre: 'Suelta', precio: 1000, campanias: ['liq1'], categorias: ['JEANS'] }], fecha: '2026-10-17', banco: ' Payway ', cuotas: '6', rebaja: { tipo: 'pct', valor: '10' } }, { marca: 'zattia', ahora: AHORA })
    expect(s.error).toBeUndefined()
    expect(s.renglones).toEqual([
      { producto: 571449, nombre: null, precio: 17990, cantidad: 2, campanias: [], categorias: [] },
      { producto: null, nombre: 'Suelta', precio: 1000, cantidad: 1, campanias: ['liq1'], categorias: ['JEANS'] },
    ])
    expect([s.canal, s.fecha, s.credito, s.rebaja]).toEqual(['local', '2026-10-17T15:00:00.000Z', { banco: 'Payway', cuotas: 6 }, { tipo: 'pct', valor: 10 }])
  })
  it('sin día es hoy; lo inválido se dice', () => {
    expect(leerSimulacion({ renglones: [{ precio: 1 }] }, { marca: 'zattia', ahora: AHORA }).fecha).toBe(new Date(AHORA).toISOString())
    const err = (b: object) => leerSimulacion(b, { marca: 'zattia', ahora: AHORA }).error
    expect(err({ renglones: [] })).toBe('Agregá al menos una prenda')
    expect(err({ renglones: [{ precio: '' }] })).toBe('Prenda 1: falta el precio')
    expect(err({ renglones: [{ precio: 1 }], canal: 'web' })).toBe('Canal inválido')
    expect(err({ renglones: [{ precio: 1 }], rebaja: { tipo: 'pct', valor: 120 } })).toBe('Descuento a la venta inválido')
  })
})

describe('leerReglaDePantalla', () => {
  it('la marca la pone el servidor y el error es el del núcleo', () => {
    const r = leerReglaDePantalla({ nombre: 'X', marca: 'bdi', canal: 'local', medios: ['efectivo'], efecto: 'descuento', pct: 20, origen: 'caja' }, { marca: 'zattia' })
    expect([r.regla?.marca, r.regla?.origen]).toEqual(['zattia', 'carga'])
    expect(leerReglaDePantalla({ nombre: 'X', medios: ['efectivo'], efecto: 'descuento', pct: 20 }, { marca: 'zattia' })).toEqual({ error: 'Elegí si es para el local o para online', campo: 'canal' })
  })
})

describe('compararConCaja', () => {
  type R = Record<string, unknown> & { nombre: string; medios: string[]; campania: string | null }
  const deCaja = reglasDeCaja(config, { marca: 'zattia' }).reglas as R[]
  const guardadas = deCaja.map((r, i) => ({ ...r, id: String(1000000000 + i), origen: 'caja' }))
  it('sin las de la Caja traídas, lo dice', () => {
    expect(compararConCaja([], deCaja)).toEqual({ sinTraer: true, faltan: [], sobran: [] })
  })
  it('traídas sin tocar: coinciden', () => {
    expect(compararConCaja(guardadas, deCaja)).toEqual({ sinTraer: false, faltan: [], sobran: [] })
  })
  it('una regla corregida, apagada o nueva se separa de la Caja y se dice', () => {
    const tocadas = guardadas.map((r) => (r.nombre === 'Efectivo siempre' ? { ...r, pct: 20 } : r.medios.includes('debito') && !r.campania ? { ...r, activa: false } : r))
    const c = compararConCaja(tocadas, deCaja)
    expect(c.faltan).toEqual(['efectivo: −15 %', 'débito: −10 %'])
    expect(c.sobran).toEqual(['efectivo: −20 %'])
  })
  it('resumenDeRegla dice la condición', () => {
    expect(resumenDeRegla({ medios: ['credito'], cuotas: 6, monto_minimo: 250000, efecto: 'final', banco: null })).toBe('crédito (6 cuotas, más de $250.000): precio final')
  })
})
