/**
 * PDF del reporte de diferencias del conteo de local. Cliente-only (jsPDF por import
 * dinámico). Port de conteoExportPDF (index.html:11444).
 */

import { compartirODescargarPDF } from '../pdf'
import { difsReporte } from './core'
import type { ConteoCount, ConteoVar } from './tipos'

export async function reporteDiferenciasPDF(vars: ConteoVar[], count: ConteoCount, cuenta: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const difs = difsReporte(vars, count)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 12, RIGHT = 198
  let y = 16
  const fecha = new Date().toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Conteo de local — diferencias — ' + cuenta.toUpperCase(), M, y)
  const totalEsp = vars.reduce((s, v) => s + v.esperado, 0)
  const totalCon = vars.reduce((s, v) => s + (count[v.vid] || 0), 0)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  y += 5
  pdf.text(`${fecha} · contado ${totalCon}/${totalEsp} · ${difs.length} con diferencia`, M, y)
  pdf.setTextColor(0)
  y += 8
  const nombre = `conteo-${cuenta}-${new Date().toISOString().slice(0, 10)}.pdf`
  if (!difs.length) {
    pdf.setFontSize(11)
    pdf.text('Sin diferencias: el conteo coincide con el sistema.', M, y)
    await compartirODescargarPDF(pdf, nombre, 'Conteo de local')
    return
  }
  const X = { prod: M, sis: 122, con: 144, dif: 168 }
  const header = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(120)
    pdf.text('Producto · Variante', X.prod, y)
    pdf.text('Sistema', X.sis, y)
    pdf.text('Contado', X.con, y)
    pdf.text('Dif', X.dif, y)
    pdf.setTextColor(0)
    pdf.setDrawColor(200)
    pdf.line(M, y + 1.5, RIGHT, y + 1.5)
    y += 5.5
  }
  header()
  difs.forEach((x, i) => {
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
    pdf.text(pdf.splitTextToSize(`${x.v.name} · ${x.v.size || '—'}`, X.sis - X.prod - 3)[0], X.prod, y)
    pdf.setTextColor(120)
    pdf.text(String(x.v.esperado), X.sis, y)
    pdf.setTextColor(20)
    pdf.text(String(x.con), X.con, y)
    const col = x.dif < 0 ? [185, 28, 28] : [180, 83, 9]
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(col[0], col[1], col[2])
    pdf.text((x.dif > 0 ? '+' : '') + x.dif, X.dif, y)
    pdf.setTextColor(20)
    pdf.setFont('helvetica', 'normal')
    y += 6.6
  })
  await compartirODescargarPDF(pdf, nombre, 'Conteo de local')
}
