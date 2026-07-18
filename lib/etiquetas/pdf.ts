/**
 * Dibujo e impresión de los PDF de etiquetas. Cliente-only: usa jsPDF + JsBarcode
 * (canvas). Port BYTE-FIEL de _etiBuildPdf/_etiDrawFP/_etiPrint/_libreBuildPdf
 * (index.html:6826-7208) — la geometría de la etiqueta (5×2,5 cm, Code 128) sale en
 * una Zebra real, así que las medidas se copian tal cual, no se "mejoran".
 *
 * jsPDF y JsBarcode entran por import dinámico (como el resto de los PDF del proyecto,
 * ver lib/sesionfotos/pdf.ts): son de cliente y el bundle no los sube hasta imprimir.
 */

import type { LabelItem, LineaEtiqueta, ModoEtiqueta, Promo, VarianteEti } from './tipos'

const FP_FS: Record<string, number> = { titulo: 11, subtitulo: 9, normal: 8, chico: 6.5 }

export type CtxEtiqueta = {
  precioDe: (v: VarianteEti) => number
  promoDe: (v: VarianteEti) => Promo | null
  fpLines: LineaEtiqueta[]
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

/** Dibuja la etiqueta de formas de pago centrada. Port de _etiDrawFP. */
function drawFP(pdf: Pdf, W: number, Hh: number, M: number, CX: number, fpLines: LineaEtiqueta[]) {
  const lines = fpLines.filter((l) => (l.texto || '').trim())
  if (!lines.length) return
  const gap = 0.8
  const ops = lines.map((l, idx) => {
    pdf.setFont('helvetica', l.bold ? 'bold' : 'normal')
    const fs = FP_FS[l.tam] || FP_FS.normal
    pdf.setFontSize(fs)
    const w = pdf.splitTextToSize(l.texto, W - M * 2)
    return { w, fs, bold: l.bold, h: w.length * (fs * 0.42), gap: idx ? gap : 0 }
  })
  const total = ops.reduce((s: number, o: { gap: number; h: number }) => s + o.gap + o.h, 0)
  let y = Math.max(1.2, (Hh - total) / 2)
  ops.forEach((o: { w: string[]; fs: number; bold: boolean; h: number; gap: number }) => {
    y += o.gap
    pdf.setFont('helvetica', o.bold ? 'bold' : 'normal')
    pdf.setFontSize(o.fs)
    pdf.text(o.w, CX, y, { align: 'center', baseline: 'top' })
    y += o.h
  })
}

/** Construye el PDF de etiquetas (5×2,5 cm) según el modo. Port de _etiBuildPdf. */
export async function buildEtiquetasPdf(labels: LabelItem[], modo: ModoEtiqueta, ctx: CtxEtiqueta): Promise<Pdf> {
  const { jsPDF } = await import('jspdf')
  const JsBarcode = (await import('jsbarcode')).default
  const W = 50, Hh = 25, M = 2, CX = W / 2
  const pdf = new jsPDF({ unit: 'mm', format: [W, Hh], orientation: 'landscape' })
  const bw = 44

  labels.forEach((v, i) => {
    if (i > 0) pdf.addPage([W, Hh], 'landscape')
    if (!v) {
      pdf.setFillColor(90, 90, 90)
      pdf.circle(CX, Hh / 2, 0.4, 'F')
      return
    }
    pdf.setTextColor(0)
    if ('__fp' in v) {
      drawFP(pdf, W, Hh, M, CX, ctx.fpLines)
      return
    }
    const margin = 1.3
    const barras = (y: number, h: number) => {
      try {
        const canvas = document.createElement('canvas')
        JsBarcode(canvas, String(v.barcode), { format: 'CODE128', displayValue: false, width: 2, height: 60, margin: 0 })
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', CX - bw / 2, y, bw, h)
      } catch {
        pdf.setFontSize(8)
        pdf.text(String(v.barcode), CX, y + h / 2, { align: 'center', baseline: 'middle' })
      }
    }

    if (modo === 'sku') {
      const txt = v.sku || ''
      pdf.setFont('helvetica', 'bold')
      let fs = 28
      pdf.setFontSize(fs)
      while (fs > 8 && pdf.getTextWidth(txt) > W - M * 2) {
        fs -= 1
        pdf.setFontSize(fs)
      }
      pdf.text(txt, CX, Hh / 2, { align: 'center', baseline: 'middle' })
      return
    }

    if (modo === 'promo') {
      const pr = ctx.promoDe(v) || { normal: ctx.precioDe(v), promo: ctx.precioDe(v) }
      const nameFS = 8, varFS = 7.5, skuFS = 7.5
      const nameLineH = 2.9, varLineH = 2.7, skuLineH = 2.8
      const priceRowH = 5.0, gPriceName = 2.0, gNameVar = 0.4, gVarBar = 1.2, gBarSku = 1.0
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(nameFS)
      const nom = pdf.splitTextToSize((v.name || '—').toUpperCase(), W - M * 2).slice(0, 2)
      const nameH = nom.length * nameLineH
      const skuBlock = v.sku ? gBarSku + skuLineH : 0
      const nonBar = priceRowH + gPriceName + nameH + gNameVar + varLineH + gVarBar + skuBlock
      let barH = 5.5
      if (nonBar + barH > Hh - 2 * margin) barH = Math.max(4.5, Hh - 2 * margin - nonBar)
      let y = Math.max(margin, (Hh - (nonBar + barH)) / 2)
      const oldX = W * 0.3, newX = W * 0.7, midY = y + priceRowH / 2
      const oldTxt = fmt(pr.normal)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(120)
      pdf.text(oldTxt, oldX, midY, { align: 'center', baseline: 'middle' })
      const ow = pdf.getTextWidth(oldTxt)
      pdf.setDrawColor(120)
      pdf.setLineWidth(0.35)
      pdf.line(oldX - ow / 2 - 0.4, midY, oldX + ow / 2 + 0.4, midY)
      pdf.setTextColor(0)
      pdf.setDrawColor(0)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13.5)
      pdf.text(fmt(pr.promo), newX, midY, { align: 'center', baseline: 'middle' })
      y += priceRowH + gPriceName
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(nameFS)
      pdf.text(nom, CX, y, { align: 'center', baseline: 'top' })
      y += nameH + gNameVar
      pdf.setFontSize(varFS)
      pdf.text(pdf.splitTextToSize(v.size || '—', W - M * 2).slice(0, 1), CX, y, { align: 'center', baseline: 'top' })
      y += varLineH + gVarBar
      barras(y, barH)
      y += barH
      if (v.sku) {
        y += gBarSku
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(skuFS)
        pdf.text(v.sku, CX, y, { align: 'center', baseline: 'top' })
      }
      return
    }

    const conPrecio = modo === 'loc'
    const precio = conPrecio ? ctx.precioDe(v) : 0
    const hasPrecio = conPrecio && precio > 0
    if (hasPrecio) {
      const priceFS = 14, nameFS = 8, varFS = 7.5, skuFS = 7.5
      const priceLineH = 4.6, nameLineH = 2.9, varLineH = 2.7, skuLineH = 2.8
      const gPriceName = 2.0, gNameVar = 0.4, gVarBar = 1.2, gBarSku = 1.0
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(nameFS)
      const nom = pdf.splitTextToSize((v.name || '—').toUpperCase(), W - M * 2).slice(0, 2)
      const nameH = nom.length * nameLineH
      const skuBlock = v.sku ? gBarSku + skuLineH : 0
      const nonBar = priceLineH + gPriceName + nameH + gNameVar + varLineH + gVarBar + skuBlock
      let barH = 5.5
      if (nonBar + barH > Hh - 2 * margin) barH = Math.max(4.5, Hh - 2 * margin - nonBar)
      let y = Math.max(margin, (Hh - (nonBar + barH)) / 2)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(priceFS)
      pdf.text('$ ' + Math.round(precio).toLocaleString('es-AR'), CX, y, { align: 'center', baseline: 'top' })
      y += priceLineH + gPriceName
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(nameFS)
      pdf.text(nom, CX, y, { align: 'center', baseline: 'top' })
      y += nameH + gNameVar
      pdf.setFontSize(varFS)
      pdf.text(pdf.splitTextToSize(v.size || '—', W - M * 2).slice(0, 1), CX, y, { align: 'center', baseline: 'top' })
      y += varLineH + gVarBar
      barras(y, barH)
      y += barH
      if (v.sku) {
        y += gBarSku
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(skuFS)
        pdf.text(v.sku, CX, y, { align: 'center', baseline: 'top' })
      }
    } else {
      const nameFS = 9.5, varFS = 8.5, skuFS = 9
      const nameLineH = 3.6, varLineH = 3.2, skuLineH = 3.4
      const gNameVar = 0.7, gVarBar = 1.8, gBarSku = 1.2
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(nameFS)
      const nom = pdf.splitTextToSize((v.name || '—').toUpperCase(), W - M * 2).slice(0, 2)
      const nameH = nom.length * nameLineH
      const skuBlock = v.sku ? gBarSku + skuLineH : 0
      const nonBar = nameH + gNameVar + varLineH + gVarBar + skuBlock
      let barH = 7
      if (nonBar + barH > Hh - 2 * margin) barH = Math.max(4.5, Hh - 2 * margin - nonBar)
      let y = Math.max(margin, (Hh - (nonBar + barH)) / 2)
      pdf.text(nom, CX, y, { align: 'center', baseline: 'top' })
      y += nameH + gNameVar
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(varFS)
      pdf.text(pdf.splitTextToSize(v.size || '—', W - M * 2).slice(0, 1), CX, y, { align: 'center', baseline: 'top' })
      y += varLineH + gVarBar
      barras(y, barH)
      y += barH
      if (v.sku) {
        y += gBarSku
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(skuFS)
        pdf.text(v.sku, CX, y, { align: 'center', baseline: 'top' })
      }
    }
  })
  return pdf
}

/** Etiqueta libre (5×2,5 cm o 10×15 cm) con texto, código de barras y/o precio. Port de _libreBuildPdf. */
export async function buildLibrePdf(cfg: { grande: boolean; copias: number; barcode: string; precio: number | null; lineas: LineaEtiqueta[] }): Promise<Pdf | null> {
  const { jsPDF } = await import('jspdf')
  const JsBarcode = (await import('jsbarcode')).default
  const { grande } = cfg
  const W = grande ? 100 : 50, Hh = grande ? 150 : 25
  const M = grande ? 7 : 2.5, CX = W / 2
  const FS = grande
    ? { titulo: 26, subtitulo: 19, normal: 14, chico: 11, precio: 44 }
    : { titulo: 12, subtitulo: 10, normal: 8.5, chico: 7, precio: 15 }
  const barH = grande ? 20 : 7, barW = grande ? 80 : 44
  const copias = Math.max(1, cfg.copias || 1)
  const barcode = (cfg.barcode || '').trim()
  const precio = cfg.precio
  const lineas = cfg.lineas.filter((l) => (l.texto || '').trim())
  if (!lineas.length && !barcode && precio == null) return null

  const orient = grande ? 'portrait' : 'landscape'
  const pdf = new jsPDF({ unit: 'mm', format: [W, Hh], orientation: orient })
  const textGap = grande ? 2 : 0.8
  const ops: { type: 'text' | 'barcode' | 'precio'; wrapped?: string[]; fs?: number; bold?: boolean; h: number; gap: number }[] = []
  lineas.forEach((l) => {
    pdf.setFont('helvetica', l.bold ? 'bold' : 'normal')
    const fs = (FS as Record<string, number>)[l.tam] || FS.normal
    pdf.setFontSize(fs)
    const wrapped = pdf.splitTextToSize(l.texto, W - M * 2)
    ops.push({ type: 'text', wrapped, fs, bold: l.bold, h: wrapped.length * (fs * 0.42), gap: ops.length ? textGap : 0 })
  })
  if (barcode) ops.push({ type: 'barcode', h: barH, gap: ops.length ? (grande ? 4 : 1.2) : 0 })
  if (precio != null && !isNaN(precio)) ops.push({ type: 'precio', h: FS.precio * 0.42, gap: ops.length ? (grande ? 5 : 1.0) : 0 })
  const totalH = ops.reduce((s, o) => s + o.gap + o.h, 0)

  for (let c = 0; c < copias; c++) {
    if (c > 0) pdf.addPage([W, Hh], orient)
    pdf.setTextColor(0)
    let y = Math.max(M, (Hh - totalH) / 2)
    ops.forEach((o) => {
      y += o.gap
      if (o.type === 'text') {
        pdf.setFont('helvetica', o.bold ? 'bold' : 'normal')
        pdf.setFontSize(o.fs!)
        pdf.text(o.wrapped!, CX, y, { align: 'center', baseline: 'top' })
      } else if (o.type === 'barcode') {
        try {
          const canvas = document.createElement('canvas')
          JsBarcode(canvas, barcode, { format: 'CODE128', displayValue: true, fontSize: 26, width: 2, height: 60, margin: 0 })
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', CX - barW / 2, y, barW, barH)
        } catch {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(FS.normal)
          pdf.text(barcode, CX, y, { align: 'center', baseline: 'top' })
        }
      } else if (o.type === 'precio') {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(FS.precio)
        pdf.text('$ ' + (precio as number).toLocaleString('es-AR'), CX, y, { align: 'center', baseline: 'top' })
      }
      y += o.h
    })
  }
  return pdf
}

/**
 * Manda el PDF a imprimir sin abrir pestaña: lo carga en un iframe oculto y dispara
 * el diálogo de impresión (autoPrint). Port de _etiPrint.
 */
export function imprimirPdf(pdf: Pdf) {
  pdf.autoPrint()
  const url = pdf.output('bloburl')
  let f = document.getElementById('eti-print-frame') as HTMLIFrameElement | null
  if (!f) {
    f = document.createElement('iframe')
    f.id = 'eti-print-frame'
    Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(f)
  }
  f.src = url
}
