/**
 * Los tres reportes PDF del tablero de diseños: decisiones (por estado), galería (grilla) y limpio
 * (solo imágenes). Cliente-only (jsPDF dinámico). Los tres salen del mismo diálogo
 * (`components/disenos/ReportePDF.tsx`): eran tres botones sueltos en la barra para tres variantes
 * del mismo papel.
 *
 * 🔑 **El puntaje entra por parámetro, no sale del diseño.** El resultado de la ronda es derivado y
 * ⛔ nunca se escribe en el documento del diseño (`docs/secciones/disenos.md`). Hasta ago-2026 estos
 * reportes imprimían "A favor / En contra" desde los 👍/👎 del tablero — que sobre los 37 diseños de
 * BDI valían **0 y 0**: el papel con el que se decidía la compra no decía nada.
 */

import { agregarImagenFit, compartirODescargarPDF, precargarImagenes } from '../pdf'
import { etiquetaPuntaje, ordenar } from './core'
import { DB_ESTADOS, type Diseno, type EstadoDiseno, type OrdenDiseno } from './tipos'
import type { PuntajesDeRonda } from './votacion'

/** El pie de cada foto: lo que dijo la ronda, o "sin votos" con todas las letras. */
const puntajeDe = (puntajes: PuntajesDeRonda | null | undefined, d: Diseno) => etiquetaPuntaje(puntajes?.[d.id])

/**
 * Las fotos de los diseños viven en Vercel Blob, o sea que `d.url` es una URL remota y jsPDF
 * —que dibuja sincrónico— no sabe ir a buscarla. Por eso los tres reportes precargan primero
 * y después dibujan. Los diseños viejos, con la foto embebida en data URL, pasan derecho.
 */
const dibujable = (fotos: Map<string, string>, d: Diseno) => fotos.get(d.url) ?? d.url

const fechaLarga = () => new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
const hoy = () => new Date().toISOString().slice(0, 10)

/** Reporte de decisiones: confirmados → duda → rechazados → por revisar, con el puntaje de la ronda. */
export async function reporteDecisiones(disenos: Diseno[], puntajes?: PuntajesDeRonda | null, tituloRonda?: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const fotos = await precargarImagenes(disenos.map((d) => d.url))
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
  pdf.text(`${fechaLarga()}  ·  ${disenos.length} diseños evaluados${tituloRonda ? '  ·  votación: ' + tituloRonda : ''}`, M, y)
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
      agregarImagenFit(pdf, dibujable(fotos, d), M, y, IMG, IMG)
      const tx = M + IMG + 5
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      pdf.text(String(d.name || '(sin nombre)').slice(0, 60), tx, y + 5)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(90)
      pdf.text(puntajeDe(puntajes, d), tx, y + 11)
      pdf.setTextColor(0)
      pdf.setDrawColor(228)
      pdf.line(M, y + ROW - 3, W - M, y + ROW - 3)
      y += ROW
    })
    y += 3
  })
  await compartirODescargarPDF(pdf, `seleccion-disenos-${hoy()}.pdf`, 'Selección de diseños')
}

/** Reporte galería: grilla 3 columnas con foto, nombre, puntaje y barra de estado. */
export async function reporteGaleria(disenos: Diseno[], orden: OrdenDiseno, puntajes?: PuntajesDeRonda | null, tituloRonda?: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const fotos = await precargarImagenes(disenos.map((d) => d.url))
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 10, cols = 3, gap = 5
  const cellW = (W - 2 * M - (cols - 1) * gap) / cols
  const imgH = 74, cellH = imgH + 16
  const items = ordenar(disenos, orden, puntajes)
  const ordLbl = ({ puntaje: 'puntaje de la ronda', carga: 'orden de carga', nombre: 'nombre' } as Record<OrdenDiseno, string>)[orden] || ''
  const estadoColor: Record<EstadoDiseno, [number, number, number]> = { revisar: [107, 114, 128], confirmado: [22, 163, 74], duda: [217, 119, 6], rechazado: [220, 38, 38] }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Selección de diseños — galería', M, 14)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text(`${fechaLarga()} · ${items.length} diseños${ordLbl ? ' · orden: ' + ordLbl : ''}${tituloRonda ? ' · votación: ' + tituloRonda : ''}`, M, 19)
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
    agregarImagenFit(pdf, dibujable(fotos, d), x, y, cellW, imgH)
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
    pdf.text(puntajeDe(puntajes, d), x, y + imgH + 10)
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
export async function reporteLimpio(disenos: Diseno[], orden: OrdenDiseno, filtro: EstadoDiseno | 'todos', puntajes?: PuntajesDeRonda | null): Promise<boolean> {
  const items = ordenar(filtro === 'todos' ? disenos : disenos.filter((d) => d.estado === filtro), orden, puntajes)
  if (!items.length) return false
  const { jsPDF } = await import('jspdf')
  const fotos = await precargarImagenes(items.map((d) => d.url))
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
    agregarImagenFit(pdf, dibujable(fotos, d), x, y, cellW, imgH)
    col++
    if (col >= cols) {
      col = 0
      y += cellH
    }
  })
  await compartirODescargarPDF(pdf, `disenos-${filtro}-${hoy()}.pdf`, 'Diseños' + (filtro !== 'todos' ? ' ' + labels[filtro] : ''))
  return true
}
