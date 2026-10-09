/**
 * El PDF de la hoja para la pizarra (A4 apaisado). Cliente-only: jsPDF entra por import dinámico y
 * las fotos —que viven en Vercel Blob o embebidas como data URL— se precargan antes de dibujar,
 * porque `addImage` es sincrónico (ver `lib/pdf.ts`). Qué va en cada hoja lo decide `./hoja.ts`.
 *
 * ⛔ Sin flechas ni emojis en el texto: la Helvetica de jsPDF no los tiene y salen como basura.
 */

import { agregarImagenFit, compartirODescargarPDF, precargarImagenes } from '../pdf'
import { COLUMNAS, FILAS, fechaCorta, paginasHoja, type Pagina, type Tarjeta } from './hoja'
import type { Ingreso } from './tipos'

const W = 297
const H = 210
const M = 10
const GAP = 5
const CAB = 22 // alto del encabezado de la hoja
const PIE = 6

const num = (n: number) => n.toLocaleString('es-AR')

/** Baja el PDF (o abre compartir en el celular). Devuelve false si no había ningún diseño. */
export async function descargarHojaIngresos(ingresos: Ingreso[], nombreArchivo: string): Promise<boolean> {
  const pdf = await armarHojaIngresos(ingresos)
  if (!pdf) return false
  await compartirODescargarPDF(pdf, nombreArchivo, 'Importaciones por llegar')
  return true
}

/** El jsPDF armado, o null si no hay ningún diseño. Separado de la descarga para poder mirarlo. */
export async function armarHojaIngresos(ingresos: Ingreso[]) {
  const paginas = paginasHoja(ingresos)
  if (!paginas.length) return null
  const { jsPDF } = await import('jspdf')
  const fotos = await precargarImagenes(paginas.flatMap((p) => p.tarjetas.map((t) => t.img)))
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const impreso = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  paginas.forEach((p, i) => {
    if (i > 0) pdf.addPage('a4', 'landscape')
    encabezado(pdf, p)
    const cellW = (W - 2 * M - (COLUMNAS - 1) * GAP) / COLUMNAS
    const cellH = (H - M - CAB - PIE - M / 2 - (FILAS - 1) * GAP) / FILAS
    p.tarjetas.forEach((t, k) => {
      const x = M + (k % COLUMNAS) * (cellW + GAP)
      const y = M + CAB + Math.floor(k / COLUMNAS) * (cellH + GAP)
      tarjeta(pdf, t, x, y, cellW, cellH, fotos.get(t.img) ?? '', p.marcaModelos)
    })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(150)
    pdf.text(`Monitor · Importaciones · impreso ${impreso}`, M, H - M / 2)
    pdf.text(`${i + 1} / ${paginas.length}`, W - M, H - M / 2, { align: 'right' })
  })

  return pdf
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function encabezado(pdf: any, p: Pagina) {
  pdf.setTextColor(20)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(p.material.toUpperCase(), M, M + 7)
  const anchoMat = pdf.getTextWidth(p.material.toUpperCase())
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.setTextColor(110)
  const parte = p.partes > 1 ? `   (hoja ${p.parte} de ${p.partes})` : ''
  pdf.text(`${num(p.unidadesMaterial)} u${parte}`, M + anchoMat + 4, M + 7)

  const llega = fechaCorta(p.fecha)
  // La fecha va grande a la derecha; acá sólo se avisa cuando falta.
  const datos = [p.titulo, p.proveedor, p.estado, llega ? '' : 'sin fecha estimada'].filter(Boolean).join('  ·  ')
  pdf.setFontSize(11)
  pdf.setTextColor(60)
  pdf.text(datos, M, M + 14)

  if (llega) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(18)
    pdf.setTextColor(20)
    pdf.text(llega, W - M, M + 7, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(120)
    pdf.text('LLEGADA ESTIMADA', W - M, M + 12, { align: 'right' })
  }
  pdf.setDrawColor(200)
  pdf.line(M, M + 17, W - M, M + 17)
}

function tarjeta(pdf: any, t: Tarjeta, x: number, y: number, w: number, h: number, foto: string, marca: string) {
  pdf.setDrawColor(215)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(x, y, w, h, 2, 2)

  const filas = Math.ceil(t.modelos.length / 2)
  const ALTO_RENGLON = 3.9
  const altoLista = filas * ALTO_RENGLON + (marca ? 3.6 : 0)
  const altoFoto = Math.max(30, h - 14 - altoLista - 3)
  const pad = 2

  pdf.setFillColor(246, 247, 249)
  pdf.rect(x + pad, y + pad, w - 2 * pad, altoFoto, 'F')
  if (foto) agregarImagenFit(pdf, foto, x + pad, y + pad, w - 2 * pad, altoFoto)
  else {
    pdf.setFontSize(8)
    pdf.setTextColor(160)
    pdf.text('sin foto', x + w / 2, y + pad + altoFoto / 2, { align: 'center' })
  }

  // El número en un círculo arriba a la izquierda, encima de la foto.
  pdf.setFillColor(20, 20, 20)
  pdf.circle(x + pad + 4, y + pad + 4, 3.2, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(255)
  pdf.text(String(t.numero), x + pad + 4, y + pad + 5.1, { align: 'center' })

  let ty = y + pad + altoFoto + 5
  pdf.setFontSize(10.5)
  pdf.setFont('helvetica', t.sinNombre ? 'italic' : 'bold')
  pdf.setTextColor(t.sinNombre ? 140 : 20)
  const totalTxt = `${num(t.total)} u`
  pdf.setFont('helvetica', 'bold')
  const anchoTotal = pdf.getTextWidth(totalTxt)
  pdf.setFont('helvetica', t.sinNombre ? 'italic' : 'bold')
  const nombre = pdf.splitTextToSize(t.sinNombre ? `${t.nombre} (sin nombre)` : t.nombre, w - 2 * pad - anchoTotal - 3)[0]
  pdf.text(nombre, x + pad + 0.5, ty)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(20)
  pdf.text(totalTxt, x + w - pad - 0.5, ty, { align: 'right' })

  ty += 2
  pdf.setDrawColor(230)
  pdf.line(x + pad, ty, x + w - pad, ty)
  ty += 3.2
  if (marca) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)
    pdf.setTextColor(140)
    pdf.text(marca.toUpperCase(), x + pad + 0.5, ty)
    ty += 3.6
  }
  // Dos columnas, de arriba hacia abajo: la primera mitad de los modelos a la izquierda.
  const colW = (w - 2 * pad) / 2
  pdf.setFontSize(8.5)
  t.modelos.forEach((l, i) => {
    const c = i < filas ? 0 : 1
    const r = i < filas ? i : i - filas
    const cx = x + pad + 0.5 + c * colW
    const cy = ty + r * ALTO_RENGLON
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(60)
    pdf.text(pdf.splitTextToSize(l.modelo, colW - 9)[0], cx, cy)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(20)
    pdf.text(num(l.cantidad), cx + colW - 3, cy, { align: 'right' })
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
