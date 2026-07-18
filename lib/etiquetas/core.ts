/**
 * Lógica pura de Etiquetas: variantes etiquetables, mapa de precios (reusando el
 * matcheo TN), resolución del escaneo y armado de la secuencia de impresión. Port
 * de _etiVariantes/_etiBuildPrecios/etiScan/etiImprimir (index.html:6702-7015), sin
 * DOM ni globales. El dibujo del PDF (no puro, usa jsPDF+JsBarcode) vive en pdf.ts.
 */

import { matchTn, type IndiceTn } from '../tn'
import type { Cantidades, MapaPrecios, MapaPromo, ModoEtiqueta, VarianteEti } from './tipos'

/** El producto GN mínimo para el mapa de precios. */
export type ProductoPrecio = { id: string; sku?: string | null; name?: string | null; retailer_price?: number }

/** Variantes etiquetables: con código de barras, ordenadas por producto y variante. Port de _etiVariantes. */
export function variantesEtiquetables(variantes: VarianteEti[]): VarianteEti[] {
  return (variantes || [])
    .filter((v) => v.barcode)
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es') || (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
}

/** Activos con stock pero SIN código de barras (no etiquetables; se avisan). Port del filtro de _etiAvisoSinCodigo. */
export function variantesSinCodigo(variantes: VarianteEti[]): VarianteEti[] {
  return (variantes || [])
    .filter((v) => !v.barcode && (v.stock || 0) > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
}

/**
 * Mapa de precios por producto: el de TN (promocional si está activo, si no el
 * normal), con respaldo al minorista de GN si el producto no está en TN. Además el
 * mapa de promo (solo descuentos reales: promo < normal). Port de _etiBuildPrecios,
 * reusando `matchTn` (= _mktFindTN).
 */
export function construirPrecios(productos: ProductoPrecio[], idx: IndiceTn): { precios: MapaPrecios; promos: MapaPromo } {
  const precios: MapaPrecios = {}
  const promos: MapaPromo = {}
  for (const p of productos || []) {
    const tn = matchTn(p, idx)
    let precio = 0
    if (tn) precio = (tn.promo_price || 0) > 0 ? (tn.promo_price as number) : (tn.price || 0) > 0 ? (tn.price as number) : 0
    if (!precio && (p.retailer_price || 0) > 0) precio = p.retailer_price as number
    precios[p.id] = precio || 0
    if (tn && (tn.promo_price || 0) > 0) {
      const normal = (tn.price || 0) > 0 ? (tn.price as number) : (p.retailer_price || 0) > 0 ? (p.retailer_price as number) : 0
      if (normal > (tn.promo_price as number)) promos[p.id] = { normal, promo: tn.promo_price as number }
    }
  }
  return { precios, promos }
}

/** Filtra la tabla por texto (nombre, SKU o código). Port del filtro de etiRenderTabla. */
export function filtrarVariantes(lista: VarianteEti[], q: string): VarianteEti[] {
  const qq = (q || '').toLowerCase().trim()
  if (!qq) return lista
  return lista.filter((v) => (v.name || '').toLowerCase().includes(qq) || (v.sku || '').toLowerCase().includes(qq) || (v.barcode || '').includes(qq))
}

/** Resuelve un código escaneado a una variante: por código exacto, sin ceros a la izquierda, o por SKU. Port de etiScan. */
export function resolverScan(vars: VarianteEti[], code: string): VarianteEti | null {
  const c = (code || '').trim()
  if (!c) return null
  const norm = (s: unknown) => String(s || '').replace(/^0+/, '')
  return (
    vars.find((x) => String(x.barcode) === c) ||
    vars.find((x) => norm(x.barcode) === norm(c)) ||
    vars.find((x) => (x.sku || '').toLowerCase() === c.toLowerCase()) ||
    null
  )
}

export type Grupo = { v: VarianteEti; cant: number }

/**
 * Agrupa las cantidades cargadas en (variante, cantidad), salteando ids sin
 * variante y —en modo SKU— las variantes sin SKU. Port del armado de `grupos` en
 * etiImprimir.
 */
export function agruparCantidades(cant: Cantidades, varsById: Record<string, VarianteEti>, modo: ModoEtiqueta): Grupo[] {
  const grupos: Grupo[] = []
  for (const [id, c] of Object.entries(cant || {})) {
    const v = varsById[id]
    if (!v) continue
    if (modo === 'sku' && !v.sku) continue
    grupos.push({ v, cant: c })
  }
  return grupos
}

/**
 * La secuencia de labels a imprimir: cada grupo expande sus copias; `sep` intercala
 * un separador en blanco (null) entre variantes (depósito); `conFP` intercala la
 * etiqueta de formas de pago después de cada copia (local). Port de la construcción
 * de `labels` en etiImprimir.
 */
export function secuenciaLabels(grupos: Grupo[], opts: { sep: boolean; conFP: boolean }): (VarianteEti | null | { __fp: true })[] {
  const labels: (VarianteEti | null | { __fp: true })[] = []
  grupos.forEach((g, gi) => {
    if (opts.sep && gi > 0) labels.push(null)
    for (let k = 0; k < g.cant; k++) {
      labels.push(g.v)
      if (opts.conFP) labels.push({ __fp: true })
    }
  })
  return labels
}

/** Total de etiquetas cargadas (suma de cantidades). */
export function totalEtiquetas(cant: Cantidades): number {
  return Object.values(cant || {}).reduce((a, b) => a + b, 0)
}
