/**
 * Export de la lista de precios de sale a Excel y PDF. Cliente-only (el Excel y jsPDF
 * entran por import dinámico). Port de saleExportXLSX/saleExportPDF (index.html:6351/6362).
 */

import { compartirODescargarPDF } from '../pdf'
import { descargarXlsx, type Filas } from '../excel'
import type { ItemSale } from './tipos'

const hoy = () => new Date().toISOString().slice(0, 10)

/** Exporta la lista a un .xlsx. Port de saleExportXLSX. */
export async function exportarSaleXLSX(saleList: ItemSale[], cuenta: string): Promise<void> {
  const rows: Filas = [['Producto', 'SKU', 'Precio actual', 'Precio sale', '% desc', 'Markup %', 'Margen %']]
  saleList.forEach((x) =>
    rows.push([x.name, x.sku || '', Math.round(x.actual), Math.round(x.sale), x.desc, x.markup != null ? Math.round(x.markup) : '', x.margin != null ? Math.round(x.margin) : '']),
  )
  await descargarXlsx(rows, { archivo: `sale-${cuenta}-${hoy()}.xlsx`, hoja: 'Sale', anchos: [34, 14, 12, 12, 8, 10, 10] })
}

/** Exporta la lista a un PDF A4. Port de saleExportPDF. */
export async function exportarSalePDF(saleList: ItemSale[], cuenta: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 12, RIGHT = 198
  let y = 16
  const fecha = new Date().toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Lista de precios de sale — ' + cuenta.toUpperCase(), M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  y += 5
  pdf.text(`${fecha} · ${saleList.length} productos`, M, y)
  pdf.setTextColor(0)
  y += 8
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(120)
  pdf.text('Producto', M, y)
  pdf.text('Actual', M + 108, y)
  pdf.text('SALE', M + 134, y)
  pdf.text('%', M + 162, y)
  pdf.text('Margen', M + 174, y)
  pdf.setTextColor(0)
  pdf.setDrawColor(220)
  pdf.line(M, y + 1.5, RIGHT, y + 1.5)
  y += 5
  pdf.setFont('helvetica', 'normal')
  saleList.forEach((x) => {
    if (y > 287) {
      pdf.addPage()
      y = 16
    }
    pdf.setFontSize(8.5)
    pdf.text(pdf.splitTextToSize(`${x.name}${x.sku ? ' (' + x.sku + ')' : ''}`, 103)[0], M, y)
    pdf.text('$' + Math.round(x.actual).toLocaleString('es-AR'), M + 108, y)
    pdf.setFont('helvetica', 'bold')
    pdf.text('$' + Math.round(x.sale).toLocaleString('es-AR'), M + 134, y)
    pdf.setFont('helvetica', 'normal')
    pdf.text(x.desc + '%', M + 162, y)
    pdf.text(x.margin != null ? Math.round(x.margin) + '%' : '—', M + 174, y)
    pdf.setDrawColor(240)
    pdf.line(M, y + 1.4, RIGHT, y + 1.4)
    y += 5
  })
  await compartirODescargarPDF(pdf, `sale-${cuenta}-${hoy()}.pdf`, 'Lista de precios de sale')
}
