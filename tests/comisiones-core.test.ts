import { describe, it, expect } from 'vitest'
import {
  armarItemSale,
  breakevenMarkup,
  calcular,
  canales,
  coefAC,
  comDefault,
  comNormalizar,
  markupDePvp,
  pisoPvp,
  pvpDeMarkup,
  redondear90,
} from '@/lib/comisiones/core'
import type { ComCfg } from '@/lib/comisiones/tipos'
import { cargarComisionesLegacy } from './legacy-comisiones'

/** Config realista con valores variados por celda para ejercitar todas las ramas. */
function cfg(): ComCfg {
  const c = comDefault(['Local', 'Online', 'Mayorista'])
  c.imp = { iva: 21, iibb: 3, drei: 1.5, ganancias: 35 }
  c.saldoIva = true
  c.costoCanal = {
    Local: { valor: 500, tipo: '$' },
    Online: { valor: 4, tipo: '%' },
    Mayorista: { valor: 0, tipo: '$' },
  }
  c.matriz.Local['Efectivo'] = { comision: 0, finan: 0, dias: 0, descuento: 10, aplicaImp: true }
  c.matriz.Local['Crédito 3 cuotas'] = { comision: 3.5, finan: 12, dias: 18, descuento: 0, aplicaImp: true }
  c.matriz.Online['Mercado Pago/QR'] = { comision: 6.29, finan: 0, dias: 2, descuento: 0, aplicaImp: true }
  c.matriz.Mayorista['Transferencia'] = { comision: 0, finan: 0, dias: 0, descuento: 5, aplicaImp: false } // sin impuestos
  return c
}

const COMBOS: [string, string][] = [
  ['Efectivo', 'Local'],
  ['Crédito 3 cuotas', 'Local'],
  ['Mercado Pago/QR', 'Online'],
  ['Transferencia', 'Mayorista'], // aplicaImp false
  ['Débito', 'Online'],
]

describe('calcular · paridad byte con comCalcular (cálculo de plata)', () => {
  for (const saldo of [true, false]) {
    describe(`saldoIva ${saldo}`, () => {
      const c = cfg()
      c.saldoIva = saldo
      const legacy = cargarComisionesLegacy(c)
      for (const [forma, canal] of COMBOS) {
        it(`${forma} · ${canal}`, () => {
          const port = calcular(c, 8000, 25000, forma, canal)
          const leg = legacy.comCalcular(8000, 25000, forma, canal)
          // Comparar todos los campos numéricos del resultado.
          for (const k of Object.keys(port) as (keyof typeof port)[]) {
            expect(port[k], `campo ${k}`).toBeCloseTo(leg[k] as number, 8)
          }
        })
      }
    })
  }
})

describe('coefAC / breakevenMarkup / pisoPvp · paridad con el legacy', () => {
  const c = cfg()
  const legacy = cargarComisionesLegacy(c)
  for (const [forma, canal] of COMBOS) {
    it(`coefAC ${forma} · ${canal}`, () => {
      const port = coefAC(c, 8000, forma, canal)
      const leg = legacy.comAC(8000, forma, canal)
      expect(port.A).toBeCloseTo(leg.A, 10)
      expect(port.C).toBeCloseTo(leg.C, 10)
      expect(port.de).toBeCloseTo(leg.de, 10)
    })
    it(`breakevenMarkup ${forma} · ${canal}`, () => {
      const port = breakevenMarkup(c, 8000, forma, canal)
      const leg = legacy.comBreakevenMarkup(8000, forma, canal)
      if (leg == null) expect(port).toBeNull()
      else expect(port!).toBeCloseTo(leg, 8)
    })
    it(`pisoPvp ${forma} · ${canal} (objetivo 40%)`, () => {
      const port = pisoPvp(c, 8000, 0.4, forma, canal)
      const leg = legacy.comPisoPvp(8000, 0.4, forma, canal)
      if (leg == null) expect(port).toBeNull()
      else expect(port!).toBeCloseTo(leg, 8)
    })
  }

  it('pisoPvp devuelve null si el margen objetivo es inalcanzable', () => {
    expect(pisoPvp(c, 8000, 0.99, 'Crédito 3 cuotas', 'Local')).toBeNull()
  })
})

describe('helpers', () => {
  it('canales: Zattia sin Mayorista', () => {
    expect(canales(true)).toEqual(['Local', 'Online'])
    expect(canales(false)).toEqual(['Local', 'Online', 'Mayorista'])
  })
  it('redondear90: termina en 90, mínimo 90', () => {
    expect(redondear90(0)).toBe(0)
    expect(redondear90(19990)).toBe(19990)
    expect(redondear90(20000)).toBe(19990)
    expect(redondear90(150)).toBe(190)
    expect(redondear90(50)).toBe(90)
  })
  it('markup ⇄ pvp intercambiables', () => {
    expect(pvpDeMarkup(10000, 130)).toBe(23000)
    expect(markupDePvp(10000, 23000)).toBe(130)
  })
  it('armarItemSale: desc, markup y margen', () => {
    const it1 = armarItemSale({ id: '1', name: 'Remera', sku: 'R' }, 8000, 5000, 12000)
    expect(it1).toMatchObject({ pid: '1', name: 'Remera', sku: 'R', actual: 12000, sale: 8000 })
    expect(it1.desc).toBe(33) // (1 - 8000/12000)*100 ≈ 33
    expect(it1.markup).toBeCloseTo(60, 6) // 8000/5000 - 1 = 60%
    expect(it1.margin).toBeCloseTo(37.5, 6) // (8000-5000)/8000
  })
})

describe('comNormalizar', () => {
  it('rellena formas/impuestos/matriz/costoCanal faltantes', () => {
    const parcial = { formas: ['Efectivo'], matriz: {}, costoCanal: {}, imp: { iva: 21, iibb: 3, drei: 0, ganancias: 35 }, saldoIva: true } as ComCfg
    const c = comNormalizar(parcial, ['Local', 'Online'])
    expect(c.matriz.Local.Efectivo).toEqual({ comision: 0, finan: 0, dias: 0, descuento: 0, aplicaImp: true })
    expect(c.costoCanal.Online).toEqual({ valor: 0, tipo: '$' })
  })
})
