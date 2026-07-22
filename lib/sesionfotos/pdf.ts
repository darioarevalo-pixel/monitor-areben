/**
 * Salidas en PDF de Sesión de fotos: reporte de retiro por origen
 * (sfReportePDF, index.html:10413), reporte de faltantes (sfReporteFaltantesPDF,
 * 10178) y etiqueta de bolsa 5×2,5 cm (sfEtiquetaBolsa, 10389). Más el texto del
 * reporte de faltantes para el portapapeles (sfReporteFaltantesCopiar, 10170).
 *
 * Cliente-only. `jspdf` se carga por import dinámico (como lib/fundas/export.ts):
 * solo pesa en el bundle de quien genera un PDF. El legacy lo traía por CDN y
 * chequeaba `window.jspdf`; acá es npm y el import no puede faltar.
 *
 * Donde el legacy usaba `setFont(undefined, …)` acá va `setFont('helvetica', …)`:
 * es el mismo tipo (helvetica es el default de jsPDF), explícito para no depender
 * de un default implícito.
 */

import { bolsasDe, faltantes as calcFaltantes } from './core'
import type { Origen, Solicitud } from './tipos'

/** Tag corto de bolsa para las columnas de los reportes ("B3" / "" si no tiene). */
function tagBolsa(bolsa?: number): string {
  return typeof bolsa === 'number' ? 'B' + bolsa : ''
}

/** Ítems de un origen ordenados por SKU asc (sin SKU al final), como el depósito. */
function itemsOrdenados(s: Solicitud, origen: Origen) {
  return s.items
    .filter((i) => i.origen === origen)
    .sort((a, b) => {
      const ka = String(a.sku || '').trim()
      const kb = String(b.sku || '').trim()
      if (!ka && kb) return 1
      if (ka && !kb) return -1
      return ka.localeCompare(kb, 'es', { numeric: true, sensitivity: 'base' })
    })
}

/** Reporte de retiro (depósito o local) para tildar físicamente. Lanza si no hay ítems. */
export async function reportePDF(s: Solicitud, origen: Origen): Promise<void> {
  const arr = itemsOrdenados(s, origen)
  if (!arr.length) throw new Error('No hay ítems para ese origen.')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 40
  let y = M
  const titulo = origen === 'deposito' ? 'Retiro de Deposito' : 'Retiro de Local'
  const tot = arr.reduce((a, i) => a + i.qty, 0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.setTextColor(0)
  pdf.text('Sesion de fotos - ' + titulo, M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text(new Date().toLocaleDateString('es-AR') + '  -  ' + arr.length + ' items, ' + tot + ' u.', W - M, y, { align: 'right' })
  y += 16
  if (s.descripcion) {
    pdf.setFontSize(9)
    pdf.setTextColor(90)
    pdf.text(String(s.descripcion).slice(0, 90), M, y)
    y += 12
  }
  pdf.setDrawColor(210)
  pdf.line(M, y, W - M, y)
  y += 18
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text('OK', M, y)
  pdf.text('Producto', M + 26, y)
  pdf.text('Variante', M + 240, y)
  pdf.text('SKU', M + 340, y)
  pdf.text('Bolsa', M + 430, y)
  pdf.text('Cant.', W - M, y, { align: 'right' })
  y += 6
  pdf.setDrawColor(225)
  pdf.line(M, y, W - M, y)
  y += 14
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  arr.forEach((i, idx) => {
    if (y > H - M) {
      pdf.addPage()
      y = M
    }
    if (idx % 2 === 1) {
      pdf.setFillColor(219, 234, 254)
      pdf.rect(M - 6, y - 11, W - 2 * M + 12, 18, 'F')
    }
    pdf.setDrawColor(120)
    pdf.rect(M, y - 8, 10, 10)
    pdf.setTextColor(0)
    pdf.text(String(i.nombre || '').slice(0, 40), M + 26, y)
    pdf.text(String(i.variante || '').slice(0, 18), M + 240, y)
    pdf.setTextColor(110)
    pdf.text(String(i.sku || '—').slice(0, 16), M + 340, y)
    pdf.setTextColor(i.bolsa ? 0 : 180)
    pdf.text(tagBolsa(i.bolsa) || '—', M + 430, y)
    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'bold')
    pdf.text(String(i.qty), W - M, y, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    y += 18
  })
  pdf.save('sesion-fotos-' + origen + '.pdf')
}

/** Reporte de lo que falta devolver. Lanza si volvió todo. */
export async function reporteFaltantesPDF(s: Solicitud): Promise<void> {
  const f = calcFaltantes(s)
  if (!f.length) throw new Error('No hay faltantes: volvió todo.')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 18
  pdf.setFontSize(15)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Faltantes — Sesión de fotos', 14, y)
  y += 7
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`${s.descripcion || 'Solicitud'}   ·   ${s.fecha}`, 14, y)
  y += 8
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Producto', 14, y)
  pdf.text('Variante', 80, y)
  pdf.text('SKU', 130, y)
  pdf.text('Faltan', 196, y, { align: 'right' })
  y += 2
  pdf.setLineWidth(0.2)
  pdf.line(14, y, 196, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  f.forEach((x) => {
    if (y > 282) {
      pdf.addPage()
      y = 18
    }
    pdf.text(String(x.nombre || '').slice(0, 40), 14, y)
    pdf.text(String(x.variante || '').slice(0, 26), 80, y)
    pdf.text(String(x.sku || '—').slice(0, 22), 130, y)
    pdf.text(`${x.falta}/${x.qty}`, 196, y, { align: 'right' })
    y += 6
  })
  y += 3
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Total sin devolver: ${f.reduce((a, x) => a + x.falta, 0)} u.`, 14, y)
  pdf.save(`faltantes-${String(s.descripcion || 'sesion').replace(/[^\w]+/g, '-').slice(0, 30)}.pdf`)
}

/** Etiqueta 5×2,5 cm para la bolsa: encabezado + descripción autoajustada + fecha. */
export async function etiquetaBolsa(s: Solicitud): Promise<void> {
  const desc = (s.descripcion || '').trim() || 'Sesión de fotos'
  const { jsPDF } = await import('jspdf')
  const W = 50
  const Hh = 25
  const M = 2.5
  const pdf = new jsPDF({ unit: 'mm', format: [W, Hh], orientation: 'landscape' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(120)
  pdf.text('SESIÓN DE FOTOS', W / 2, 4.5, { align: 'center' })
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0)
  const top = 6.5
  const bottom = Hh - 4
  const avail = bottom - top
  let fs = 16
  let lines: string[] = []
  for (; fs >= 7; fs--) {
    pdf.setFontSize(fs)
    lines = pdf.splitTextToSize(desc, W - M * 2)
    if (lines.length * (fs * 0.42) <= avail) break
  }
  pdf.setFontSize(fs)
  const blockH = lines.length * (fs * 0.42)
  let y = top + (avail - blockH) / 2 + fs * 0.35
  lines.forEach((l) => {
    pdf.text(l, W / 2, y, { align: 'center' })
    y += fs * 0.42
  })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(120)
  pdf.text(String(s.fecha || ''), W / 2, Hh - 1.6, { align: 'center' })
  pdf.save('etiqueta-bolsa.pdf')
}

/**
 * Una etiqueta 5×2,5 cm por bolsa numerada (multipágina): "BOLSA n/N" grande, la
 * descripción de la solicitud y las unidades. Para pegar en cada bolsa del armado.
 * Lanza si no hay ninguna bolsa asignada.
 */
export async function etiquetasBolsas(s: Solicitud): Promise<void> {
  const grupos = bolsasDe(s).filter((g) => g.n != null)
  if (!grupos.length) throw new Error('No hay bolsas asignadas: asigná ítems a bolsas primero.')
  const desc = (s.descripcion || '').trim() || 'Sesión de fotos'
  const total = grupos.length
  const { jsPDF } = await import('jspdf')
  const W = 50
  const Hh = 25
  const M = 2.5
  const pdf = new jsPDF({ unit: 'mm', format: [W, Hh], orientation: 'landscape' })
  grupos.forEach((g, idx) => {
    if (idx > 0) pdf.addPage([W, Hh], 'landscape')
    // Descripción arriba (chica, autoajustada a una línea).
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    pdf.setTextColor(120)
    const dl = pdf.splitTextToSize(desc, W - M * 2)[0] || ''
    pdf.text(String(dl), W / 2, 4.5, { align: 'center' })
    // "BOLSA n/N" grande y centrado.
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0)
    pdf.setFontSize(15)
    pdf.text(`BOLSA ${g.n}/${total}`, W / 2, 14, { align: 'center' })
    // Unidades + fecha abajo.
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    pdf.setTextColor(120)
    pdf.text(`${g.totalU} u.   ·   ${s.fecha || ''}`, W / 2, Hh - 2, { align: 'center' })
  })
  pdf.save('etiquetas-bolsas.pdf')
}

/**
 * Reporte A4 agrupado por bolsa: cada bolsa con sus ítems (producto/variante/sku/cant/
 * origen). Los sin asignar van al final. Para el armado/packing. Lanza si no hay ítems.
 */
export async function reporteBolsasPDF(s: Solicitud): Promise<void> {
  const grupos = bolsasDe(s)
  if (!grupos.length) throw new Error('No hay ítems en la solicitud.')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 40
  let y = M
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.setTextColor(0)
  pdf.text('Sesion de fotos - Bolsas', M, y)
  const totU = grupos.reduce((a, g) => a + g.totalU, 0)
  const nB = grupos.filter((g) => g.n != null).length
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text(new Date().toLocaleDateString('es-AR') + '  -  ' + nB + ' bolsas, ' + totU + ' u.', W - M, y, { align: 'right' })
  y += 16
  if (s.descripcion) {
    pdf.setFontSize(9)
    pdf.setTextColor(90)
    pdf.text(String(s.descripcion).slice(0, 90), M, y)
    y += 12
  }
  y += 6
  for (const g of grupos) {
    if (y > H - M - 40) {
      pdf.addPage()
      y = M
    }
    pdf.setFillColor(g.n != null ? 224 : 245, g.n != null ? 231 : 245, g.n != null ? 255 : 245)
    pdf.rect(M - 6, y - 12, W - 2 * M + 12, 20, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(g.n != null ? 30 : 120)
    pdf.text(g.n != null ? `Bolsa ${g.n}` : 'Sin bolsa', M, y + 2)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(120)
    pdf.text(`${g.items.length} items · ${g.totalU} u.`, W - M, y + 2, { align: 'right' })
    y += 22
    pdf.setFontSize(10)
    for (const i of g.items) {
      if (y > H - M) {
        pdf.addPage()
        y = M
      }
      pdf.setTextColor(0)
      pdf.text(String(i.nombre || '').slice(0, 40), M + 12, y)
      pdf.text(String(i.variante || '').slice(0, 18), M + 250, y)
      pdf.setTextColor(110)
      pdf.text(String(i.sku || '—').slice(0, 16), M + 350, y)
      pdf.text(i.origen === 'local' ? 'Local' : 'Depósito', M + 440, y)
      pdf.setTextColor(0)
      pdf.setFont('helvetica', 'bold')
      pdf.text('x' + String(i.qty), W - M, y, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      y += 16
    }
    y += 8
  }
  pdf.save('sesion-fotos-bolsas.pdf')
}

/** El texto del reporte de faltantes para copiar a WhatsApp. Lanza si volvió todo. */
export function textoReporteFaltantes(s: Solicitud): string {
  const f = calcFaltantes(s)
  if (!f.length) throw new Error('No hay faltantes: volvió todo.')
  const lineas = f
    .map((x) => `• ${x.nombre} · ${x.variante}${x.sku ? ' (' + x.sku + ')' : ''} — faltan ${x.falta} de ${x.qty}`)
    .join('\n')
  return `⚠ PRODUCTOS NO DEVUELTOS\n${s.descripcion || 'Solicitud'} · ${s.fecha}\n\n${lineas}\n\nTotal sin devolver: ${f.reduce((a, x) => a + x.falta, 0)} u.\nPor favor, ubicar y devolver para cerrar el proceso.`
}
