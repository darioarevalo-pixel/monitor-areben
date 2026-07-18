/**
 * PDF de "Productos caducados". Port de cadExportPDF (index.html:12446), separado del
 * cálculo (lib/caducados.ts). jsPDF por import dinámico; compartir con lib/pdf.ts.
 */

import { compartirODescargarPDF } from '@/lib/pdf'
import { diasDesde, type Caducado } from '@/lib/caducados'
import type { Marca } from '@/lib/nav'

export async function generarReporteCaducados(cands: Caducado[], marca: Marca, dias: number, now: Date): Promise<void> {
  if (!cands.length) return
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 12
  const RIGHT = 198
  let y = 16
  const fecha = now.toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Productos caducados — ' + marca.toUpperCase(), M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  y += 5
  pdf.text(`${fecha} · ${cands.length} productos · sin stock y sin venta hace +${dias} días`, M, y)
  pdf.setTextColor(0)
  y += 8

  const X = { prod: M, cat: 95, last: 150, dia: 182 }
  const header = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(120)
    pdf.text('Producto', X.prod, y)
    pdf.text('Categoría', X.cat, y)
    pdf.text('Últ. venta', X.last, y)
    pdf.text('Días', X.dia, y)
    pdf.setTextColor(0)
    pdf.setDrawColor(200)
    pdf.line(M, y + 1.5, RIGHT, y + 1.5)
    y += 5.5
  }
  header()
  cands.forEach((c, i) => {
    if (y > 285) {
      pdf.addPage()
      y = 16
      header()
    }
    if (i % 2 === 1) {
      pdf.setFillColor(243, 244, 246)
      pdf.rect(M, y - 4.2, RIGHT - M, 6.6, 'F')
    }
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(20)
    pdf.text(pdf.splitTextToSize(c.name, X.cat - X.prod - 3)[0], X.prod, y)
    pdf.text(pdf.splitTextToSize(String(c.cat), X.last - X.cat - 3)[0], X.cat, y)
    pdf.text(c.last, X.last, y)
    pdf.text(String(diasDesde(c.last, now)), X.dia, y)
    y += 6.6
  })

  await compartirODescargarPDF(pdf, `caducados-${marca}-${now.toISOString().slice(0, 10)}.pdf`, 'Productos caducados')
}
