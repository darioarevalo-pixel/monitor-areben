/**
 * Dibuja y comparte el PDF "Productos para SALE / Outlet". Port de outletReporte
 * (index.html:2810-2833), separado del cálculo de filas (`lib/productos-sale.ts`,
 * puro) porque acá se toca jsPDF y el DOM. `jspdf` entra por import dinámico, como
 * en Fundas. Read-only: no escribe nada, sólo genera el PDF.
 */

import { compartirODescargarPDF } from '@/lib/pdf'
import type { Producto } from '@/lib/etl/tipos'
import type { ModoVidaUtil } from '@/lib/productos'
import { filasSale } from '@/lib/productos-sale'
import type { IndiceTn } from '@/lib/tn'

export async function generarReporteSale(
  seleccionados: Producto[],
  promoIdx: IndiceTn,
  modoVU: ModoVidaUtil,
): Promise<void> {
  const filas = filasSale(seleccionados, promoIdx, modoVU)
  if (!filas.length) return

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 12
  const RIGHT = 198
  let y = 16
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Productos para SALE / Outlet', M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  y += 5
  pdf.text(`${fecha} · ${filas.length} productos · precio = el más bajo entre GN y promo TN`, M, y)
  pdf.setTextColor(0)
  y += 8

  const cols = [
    { t: 'Producto', x: M },
    { t: 'SKU', x: M + 84 },
    { t: 'Stock', x: M + 116 },
    { t: 'Vida útil', x: M + 132 },
    { t: 'Ingreso', x: M + 158 },
    { t: 'Precio', x: M + 178 },
  ]
  const head = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(130)
    cols.forEach((c) => pdf.text(c.t, c.x, y))
    pdf.setTextColor(0)
    pdf.setDrawColor(210)
    pdf.line(M, y + 1.5, RIGHT, y + 1.5)
    y += 5
  }
  head()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  filas.forEach((f) => {
    if (y > 286) {
      pdf.addPage()
      y = 16
      head()
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.5)
    }
    pdf.text(pdf.splitTextToSize(f.name, 80)[0], cols[0].x, y)
    pdf.text(f.sku, cols[1].x, y)
    pdf.text(f.stock, cols[2].x, y)
    pdf.text(f.vidaUtil, cols[3].x, y)
    pdf.text(f.ingreso, cols[4].x, y)
    pdf.text(f.precio, cols[5].x, y)
    pdf.setDrawColor(238)
    pdf.line(M, y + 1.5, RIGHT, y + 1.5)
    y += 5.5
  })

  await compartirODescargarPDF(pdf, `sale-outlet-${new Date().toISOString().slice(0, 10)}.pdf`, 'Productos para Sale')
}
