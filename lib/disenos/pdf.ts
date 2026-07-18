/**
 * Los tres reportes PDF del tablero de diseños: decisiones (por estado), galería
 * (grilla con votos) y limpio (solo imágenes). Cliente-only (jsPDF dinámico). Port de
 * dbReporte/dbReporteGaleria/dbReporteLimpioGen (index.html:3760/3808/3873).
 */

import { agregarImagenFit, compartirODescargarPDF } from '../pdf'
import { ordenar } from './core'
import { DB_ESTADOS, type Diseno, type EstadoDiseno, type OrdenDiseno } from './tipos'

const fechaLarga = () => new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
const hoy = () => new Date().toISOString().slice(0, 10)

/** Reporte de decisiones: confirmados → duda → rechazados → por revisar, con votos y notas. */
export async function reporteDecisiones(disenos: Diseno[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 14
  let y = 18
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Selección de diseños', M, y)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(120)
  y += 6
  pdf.text(`${fechaLarga()}  ·  ${disenos.length} diseños evaluados`, M, y)
  pdf.setTextColor(0)
  y += 8
  const orden: EstadoDiseno[] = ['confirmado', 'duda', 'rechazado', 'revisar']
  const IMG = 30, ROW = 34
  orden.forEach((k) => {
    const e = DB_ESTADOS.find((x) => x.k === k)!
    const items = disenos.filter((d) => d.estado === k)
    if (!items.length) return
    if (y > 268) {
      pdf.addPage()
      y = 18
    }
    pdf.setFillColor(e.rgb[0], e.rgb[1], e.rgb[2])
    pdf.rect(M, y - 4, W - 2 * M, 7, 'F')
    pdf.setTextColor(255)
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${e.lbl.toUpperCase()}  (${items.length})`, M + 2, y + 1.2)
    pdf.setTextColor(0)
    pdf.setFont('helvetica', 'normal')
    y += 9
    items.forEach((d) => {
      if (y + ROW > 286) {
        pdf.addPage()
        y = 18
      }
      agregarImagenFit(pdf, d.url, M, y, IMG, IMG)
      const tx = M + IMG + 5
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text(String(d.name || '(sin nombre)').slice(0, 60), tx, y + 5)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(90)
      pdf.text(`A favor: ${d.up}     En contra: ${d.down}`, tx, y + 11)
      if (d.nota) {
        pdf.setTextColor(60)
        pdf.text(pdf.splitTextToSize(d.nota, W - M - tx - 2).slice(0, 3), tx, y + 17)
      }
      pdf.setTextColor(0)
      pdf.setDrawColor(228)
      pdf.line(M, y + ROW - 3, W - M, y + ROW - 3)
      y += ROW
    })
    y += 3
  })
  await compartirODescargarPDF(pdf, `seleccion-disenos-${hoy()}.pdf`, 'Selección de diseños')
}

/** Reporte galería: grilla 3 columnas con foto, nombre, votos y barra de estado. */
export async function reporteGaleria(disenos: Diseno[], orden: OrdenDiseno): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 10, cols = 3, gap = 5
  const cellW = (W - 2 * M - (cols - 1) * gap) / cols
  const imgH = 74, cellH = imgH + 16
  const items = ordenar(disenos, orden)
  const ordLbl = ({ carga: 'orden de carga', tildes: 'más votos a favor', cruces: 'más en contra', saldo: 'mejor saldo' } as Record<OrdenDiseno, string>)[orden] || ''
  const estadoColor: Record<EstadoDiseno, [number, number, number]> = { revisar: [107, 114, 128], confirmado: [22, 163, 74], duda: [217, 119, 6], rechazado: [220, 38, 38] }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Selección de diseños — galería', M, 14)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text(`${fechaLarga()} · ${items.length} diseños${ordLbl ? ' · orden: ' + ordLbl : ''}`, M, 19)
  pdf.setTextColor(0)
  let col = 0
  let y = 24
  items.forEach((d) => {
    if (col === 0 && y + cellH > 292) {
      pdf.addPage()
      y = 16
    }
    const x = M + col * (cellW + gap)
    pdf.setFillColor(247, 248, 250)
    pdf.rect(x, y, cellW, imgH, 'F')
    agregarImagenFit(pdf, d.url, x, y, cellW, imgH)
    const c = estadoColor[d.estado] || estadoColor.revisar
    pdf.setFillColor(c[0], c[1], c[2])
    pdf.rect(x, y, cellW, 2.4, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(20)
    pdf.text(pdf.splitTextToSize(String(d.name || '—'), cellW)[0], x, y + imgH + 5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(80)
    pdf.text(`A favor ${d.up || 0}    En contra ${d.down || 0}`, x, y + imgH + 10)
    pdf.setTextColor(0)
    col++
    if (col >= cols) {
      col = 0
      y += cellH
    }
  })
  await compartirODescargarPDF(pdf, `disenos-galeria-${hoy()}.pdf`, 'Selección de diseños (galería)')
}

/** Reporte limpio: solo imágenes (filtrado por estado o todos). */
export async function reporteLimpio(disenos: Diseno[], orden: OrdenDiseno, filtro: EstadoDiseno | 'todos'): Promise<boolean> {
  const items = ordenar(filtro === 'todos' ? disenos : disenos.filter((d) => d.estado === filtro), orden)
  if (!items.length) return false
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 10, cols = 3, gap = 6
  const cellW = (W - 2 * M - (cols - 1) * gap) / cols
  const imgH = cellW * 1.4, cellH = imgH + 6
  const labels: Record<string, string> = { confirmado: 'Confirmados', duda: 'En duda', rechazado: 'Rechazados', todos: 'Todos' }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Diseños' + (filtro !== 'todos' ? ' — ' + labels[filtro] : ''), M, 14)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text(`${fechaLarga()} · ${items.length} diseños`, M, 19)
  pdf.setTextColor(0)
  let col = 0
  let y = 24
  items.forEach((d) => {
    if (col === 0 && y + cellH > 292) {
      pdf.addPage()
      y = 14
    }
    const x = M + col * (cellW + gap)
    pdf.setFillColor(247, 248, 250)
    pdf.rect(x, y, cellW, imgH, 'F')
    agregarImagenFit(pdf, d.url, x, y, cellW, imgH)
    col++
    if (col >= cols) {
      col = 0
      y += cellH
    }
  })
  await compartirODescargarPDF(pdf, `disenos-${filtro}-${hoy()}.pdf`, 'Diseños' + (filtro !== 'todos' ? ' ' + labels[filtro] : ''))
  return true
}
