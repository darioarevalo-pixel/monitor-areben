/**
 * Matemática pura de Comisiones (margen, break-even, piso de precio). Port
 * BYTE-FIEL de comCalcular/comAC/comBreakevenMarkup/comPisoPvp y los helpers de
 * config (index.html:5991-6548), sin DOM ni globales. Es cálculo de PLATA: las
 * fórmulas se copian tal cual y van con paridad ejecutable contra el legacy.
 */

import type { Celda, ComCfg, ItemSale, ResultadoMargen } from './tipos'

export const COM_FORMAS_DEF = ['Efectivo', 'Transferencia', 'Débito', 'Crédito 1 pago', 'Crédito 3 cuotas', 'Mercado Pago/QR']

const CELDA_DEF = (): Celda => ({ comision: 0, finan: 0, dias: 0, descuento: 0, aplicaImp: true })

/** Los canales de la cuenta. Zattia no usa el canal Mayorista. Port de comCanales. */
export function canales(esZattia: boolean): string[] {
  return esZattia ? ['Local', 'Online'] : ['Local', 'Online', 'Mayorista']
}

/** Config por defecto para los canales dados. Port de comDefault. */
export function comDefault(cans: string[]): ComCfg {
  const matriz: ComCfg['matriz'] = {}
  const costoCanal: ComCfg['costoCanal'] = {}
  cans.forEach((c) => {
    matriz[c] = {}
    COM_FORMAS_DEF.forEach((f) => (matriz[c][f] = CELDA_DEF()))
    costoCanal[c] = { valor: 0, tipo: '$' }
  })
  return { formas: [...COM_FORMAS_DEF], matriz, costoCanal, imp: { iva: 21, iibb: 3, drei: 0, ganancias: 35 }, saldoIva: true }
}

/** Rellena huecos de una config (formas/impuestos/matriz/costoCanal). Port de comNormalizar. Muta y devuelve. */
export function comNormalizar(cfg: ComCfg, cans: string[]): ComCfg {
  if (!Array.isArray(cfg.formas) || !cfg.formas.length) cfg.formas = [...COM_FORMAS_DEF]
  if (!cfg.imp) cfg.imp = { iva: 21, iibb: 3, drei: 0, ganancias: 35 }
  if (typeof cfg.saldoIva !== 'boolean') cfg.saldoIva = true
  cfg.matriz = cfg.matriz || {}
  cfg.costoCanal = cfg.costoCanal || {}
  cans.forEach((c) => {
    cfg.matriz[c] = cfg.matriz[c] || {}
    cfg.costoCanal[c] = cfg.costoCanal[c] || { valor: 0, tipo: '$' }
    cfg.formas.forEach((f) => {
      const cel = (cfg.matriz[c][f] = cfg.matriz[c][f] || CELDA_DEF())
      if (cel.descuento == null) cel.descuento = 0
      if (cel.aplicaImp == null) cel.aplicaImp = true
    })
  })
  return cfg
}

/** Cascada del margen neto final por forma × canal. Port BYTE-FIEL de comCalcular. */
export function calcular(cfg: ComCfg, costoNeto: number, pvp: number, forma: string, canal: string): ResultadoMargen {
  const iva = cfg.imp.iva / 100
  const cel = (cfg.matriz[canal] || {})[forma] || CELDA_DEF()
  const cc = cfg.costoCanal[canal] || { valor: 0, tipo: '$' as const }
  const aplicaImp = cel.aplicaImp !== false
  const pvpEf = pvp * (1 - (cel.descuento || 0) / 100)
  const precioNeto = aplicaImp ? pvpEf / (1 + iva) : pvpEf
  const ivaPagar = aplicaImp ? pvpEf - precioNeto - costoNeto * iva : 0
  const comisionM = pvpEf * (cel.comision / 100)
  const finanM = pvpEf * (cel.finan / 100)
  const iibbM = aplicaImp ? precioNeto * (cfg.imp.iibb / 100) : 0
  const dreiM = aplicaImp ? pvpEf * (cfg.imp.drei / 100) : 0
  const canalM = cc.tipo === '%' ? pvpEf * (cc.valor / 100) : cc.valor || 0
  let contrib = precioNeto - costoNeto - comisionM - finanM - iibbM - dreiM - canalM
  if (aplicaImp && !cfg.saldoIva) contrib -= ivaPagar
  const ganancias = Math.max(0, contrib) * (cfg.imp.ganancias / 100)
  const margen = contrib - ganancias
  return {
    margen,
    margenPct: pvpEf ? (margen / pvpEf) * 100 : 0,
    dias: cel.dias || 0,
    ivaRecuperado: aplicaImp && cfg.saldoIva ? ivaPagar : 0,
    pvp,
    pvpEf,
    desc: cel.descuento || 0,
    aplicaImp,
    costoNeto,
    precioNeto,
    comisionM,
    finanM,
    iibbM,
    dreiM,
    canalM,
    ivaPagar,
    contrib,
    ganancias,
    com: cel.comision || 0,
    fin: cel.finan || 0,
  }
}

/** Coeficientes lineales de la contribución: contrib = A·precioEfectivo + C. Port de comAC. */
export function coefAC(cfg: ComCfg, costoNeto: number, forma: string, canal: string): { A: number; C: number; de: number } {
  const iva = cfg.imp.iva / 100
  const cel = (cfg.matriz[canal] || {})[forma] || CELDA_DEF()
  const cc = cfg.costoCanal[canal] || { valor: 0, tipo: '$' as const }
  const aplicaImp = cel.aplicaImp !== false
  const de = 1 - (cel.descuento || 0) / 100
  let A: number
  let C: number
  if (aplicaImp) {
    A = 1 / (1 + iva) - cel.comision / 100 - cel.finan / 100 - cfg.imp.iibb / 100 / (1 + iva) - cfg.imp.drei / 100
    C = -costoNeto
    if (!cfg.saldoIva) {
      A -= iva / (1 + iva)
      C += costoNeto * iva
    }
  } else {
    A = 1 - cel.comision / 100 - cel.finan / 100
    C = -costoNeto
  }
  if (cc.tipo === '%') A -= cc.valor / 100
  else C -= cc.valor || 0
  return { A, C, de }
}

/** Markup de equilibrio: % sobre el costo con margen neto = 0. Port de comBreakevenMarkup. */
export function breakevenMarkup(cfg: ComCfg, costoNeto: number, forma: string, canal: string): number | null {
  if (!(costoNeto > 0)) return null
  const { A, C, de } = coefAC(cfg, costoNeto, forma, canal)
  if (de <= 0 || A <= 0) return null
  const pvpEf = -C / A
  if (!(pvpEf > 0)) return null
  const pvp = pvpEf / de
  return (pvp / costoNeto - 1) * 100
}

/** PVP mínimo (de lista) para un margen objetivo `m` (fracción, no %). Port de comPisoPvp. */
export function pisoPvp(cfg: ComCfg, costoNeto: number, m: number, forma: string, canal: string): number | null {
  const g = cfg.imp.ganancias / 100
  const { A, C, de } = coefAC(cfg, costoNeto, forma, canal)
  if (de <= 0) return null
  const den = A * (1 - g) - m
  if (den <= 0) return null
  const pvpEf = (-C * (1 - g)) / den
  return pvpEf / de
}

/** Formato de plata ("$1.234" / "-$1.234"). Port de _comFmt. */
export function comFmt(n: number): string {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR')
}

/** Redondea a terminar en 90 (mínimo 90). Port de _redondear90. */
export function redondear90(v: number): number {
  if (!v || v <= 0) return 0
  const r = Math.round(v / 100) * 100 - 10
  return r < 90 ? 90 : r
}

/** PVP a partir del markup: PVP = costo × (1 + markup/100). */
export function pvpDeMarkup(costo: number, markup: number): number {
  return Math.round(costo * (1 + markup / 100))
}
/** Markup a partir del PVP: (PVP/costo − 1) × 100, con 1 decimal (como el legacy). */
export function markupDePvp(costo: number, pvp: number): number {
  return Number(((pvp / costo - 1) * 100).toFixed(1))
}

/** Arma el ítem de la lista de sale. Port de la lógica de comSaleAgregar. */
export function armarItemSale(prod: { id: string; name: string; sku?: string | null }, sale: number, costo: number, actual: number): ItemSale {
  const desc = actual > 0 ? Math.round((1 - sale / actual) * 100) : 0
  const markup = costo > 0 ? (sale / costo - 1) * 100 : null
  const margin = sale > 0 ? ((sale - costo) / sale) * 100 : null
  return { pid: prod.id, name: prod.name, sku: prod.sku || '', actual, sale, desc, markup, margin }
}
