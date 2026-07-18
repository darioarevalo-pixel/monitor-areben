/**
 * Selección de productos para SALE / Outlet y el armado del reporte. Port puro de
 * outletReporte / _precioMasBarato (index.html:2789-2833). Read-only: Bruno confirmó
 * que NO escribe a Gestión Nube (18-jul) — el flujo es local: se elige, se define el
 * precio (el más barato entre GN y promo TN) y se exporta el PDF. El dibujo del PDF
 * (jsPDF) vive en `components/productos/reporteSale.ts`; acá sólo el cálculo de filas.
 */

import { formatLifespan } from './etl/helpers'
import type { Producto } from './etl/tipos'
import { lifespanDaysByMode, type ModoVidaUtil } from './productos'
import { matchTn, type IndiceTn } from './tn'

/**
 * Precio para el reporte: el MÁS BARATO entre el minorista de GN y la promo de TN
 * (si la tiene). 0 si no hay ninguno. Port de _precioMasBarato (index.html:2789).
 */
export function precioMasBarato(p: Producto, promoIdx: IndiceTn): number {
  const tn = matchTn(p, promoIdx)
  const promo = tn && (tn.promo_price ?? 0) > 0 ? tn.promo_price! : null
  const gn = p.retailer_price > 0 ? p.retailer_price : null
  const vals = [gn, promo].filter((v): v is number => !!v && v > 0)
  return vals.length ? Math.min(...vals) : 0
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** `YYYY-MM` → `Mmm YY` (año de 2 dígitos), como _mesLabel del PDF (index.html:9273). */
export function mesLabelCorto(yyyymm: string): string {
  const [y, mo] = yyyymm.split('-')
  return MONTH_NAMES[parseInt(mo) - 1] + ' ' + y.slice(2)
}

export type FilaSale = {
  name: string
  sku: string
  stock: string
  vidaUtil: string
  ingreso: string
  precio: string
}

/**
 * Las filas del PDF para los productos seleccionados, ordenadas por nombre. Port de
 * outletReporte (index.html:2807-2830): stock/vida útil según el modo, ingreso con
 * año corto y precio formateado ($ o —).
 */
export function filasSale(seleccionados: Producto[], promoIdx: IndiceTn, modoVU: ModoVidaUtil): FilaSale[] {
  return [...seleccionados]
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
    .map((p) => {
      const pr = precioMasBarato(p, promoIdx)
      return {
        name: p.name || '—',
        sku: (p.sku || '—').slice(0, 18),
        stock: String(p.stock),
        vidaUtil: formatLifespan(lifespanDaysByMode(p, modoVU), p.stock),
        ingreso: p.ingresoMes ? mesLabelCorto(p.ingresoMes) : '—',
        precio: pr ? '$' + Math.round(pr).toLocaleString('es-AR') : '—',
      }
    })
}
