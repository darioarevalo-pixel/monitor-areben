/**
 * PDF de la reposición: hoja de trabajo de depósito, una fila por variante ordenada
 * por ubicación física (recorrido), con casilleros para tildar "pickeado" y "no se
 * encontró", y un pie de firma/cierre. Cliente-only (jsPDF dinámico). Port de repoPDF
 * (index.html:12777).
 *
 * ── Por qué está la columna "Local" ──
 * Mientras se recorre el depósito puede aparecer la necesidad de priorizar qué llevar
 * primero, y esa decisión se tomaba de memoria: el papel decía cuánto hay en el depósito
 * y cuánto reponer, pero no cuánto quedaba en el local. Sin eso no se distingue lo que
 * está en cero de lo que todavía tiene para vender. El dato ya venía adentro de
 * `RepoItem.local` —`construirInv` lo separa desde siempre— y esta función lo recibía sin
 * usarlo.
 *
 * El orden **sigue siendo por ubicación física** y no por urgencia, a propósito: la hoja se
 * usa caminando, y ordenar por faltante convierte el recorrido en un zigzag. La prioridad
 * se marca en la fila (`!`), no en el orden.
 */

import { compartirODescargarPDF } from '../pdf'
import { moverFinal, reporte, ubicCmp } from './core'
import type { RepoCfg, RepoItem } from './tipos'

/** Con esto o menos en el local, la fila se marca. Mismo criterio que la pantalla (`Reposicion.tsx`). */
const CRITICO = 1

export async function reposicionPDF(
  inv: RepoItem[],
  cfg: RepoCfg,
  marca: string,
  manual: Record<string, number>,
  /** Cuándo se leyeron los datos (el "Actualizado" de la pantalla). Un PDF de una pestaña abierta hace tres horas trae stock de hace tres horas. */
  leido?: Date | null,
): Promise<boolean> {
  const esBdi = marca === 'bdi'
  const rep = reporte(inv, cfg, esBdi).filter((it) => moverFinal(it, cfg, esBdi, manual) > 0)
  if (!rep.length) return false
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 12, RIGHT = 198
  let y = 16
  const fecha = new Date().toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const filas = rep.slice().sort((a, b) => ubicCmp(a.ubic, b.ubic) || a.name.localeCompare(b.name, 'es') || (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
  const totalMover = filas.reduce((s, it) => s + moverFinal(it, cfg, esBdi, manual), 0)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Reposición de local — ' + marca.toUpperCase(), M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  y += 5
  pdf.text(`${fecha} · ${filas.length} variantes · ${totalMover} u. a mover`, M, y)
  y += 4
  // La aclaración del "!" va en el papel: quien camina el depósito no estuvo en esta conversación.
  const cuando = leido ? leido.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null
  pdf.text(`${cuando ? `Stock leido: ${cuando}  ·  ` : ''}"!" = sin stock en el local (0 o 1): llevarlo primero`, M, y)
  pdf.setTextColor(0)
  y += 8
  const X = { ubic: M, prod: 30, loc: 104, dep: 120, rep: 138, pick: 156, nf: 178 }
  const header = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(120)
    pdf.text('Ubic.', X.ubic, y)
    pdf.text('Producto · Variante', X.prod, y)
    pdf.text('Local', X.loc, y)
    pdf.text('Depós', X.dep, y)
    pdf.text('Repone', X.rep, y)
    pdf.text('Pickeado', X.pick, y)
    pdf.text('No se encontró', X.nf, y)
    pdf.setTextColor(0)
    pdf.setDrawColor(200)
    pdf.line(M, y + 1.6, RIGHT, y + 1.6)
    y += 5.5
  }
  header()
  filas.forEach((it, i) => {
    // Nombre COMPLETO en varias líneas (antes se truncaba a la 1ª con [0] → se perdía info).
    const lineas = pdf.splitTextToSize(`${it.name} · ${it.size || '—'}`, X.loc - X.prod - 3)
    const rowH = Math.max(6.6, lineas.length * 4 + 2.6)
    if (y + rowH > 292) {
      pdf.addPage()
      y = 16
      header()
    }
    const mover = moverFinal(it, cfg, esBdi, manual)
    if (i % 2 === 1) {
      pdf.setFillColor(243, 244, 246)
      pdf.rect(M, y - 4.2, RIGHT - M, rowH, 'F')
    }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(20)
    pdf.text(it.ubic || '—', X.ubic, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(20)
    lineas.forEach((ln: string, k: number) => pdf.text(ln, X.prod, y + k * 4))
    // El local manda la prioridad: en 0 o 1 va en negrita, rojo y con "!" — el color se pierde
    // en la fotocopia en blanco y negro del depósito, el signo no.
    const critico = it.local <= CRITICO
    if (critico) {
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(185, 28, 28)
    }
    pdf.text(critico ? `${it.local} !` : String(it.local), X.loc, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(165)
    pdf.text(String(it.deposito), X.dep, y)
    pdf.setTextColor(20)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(String(mover), X.rep, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setDrawColor(110)
    pdf.rect(X.pick + 3, y - 3.2, 4, 4)
    pdf.rect(X.nf + 9, y - 3.2, 4, 4)
    y += rowH
  })
  if (y > 250) {
    pdf.addPage()
    y = 20
  }
  y += 8
  pdf.setDrawColor(150)
  pdf.line(M, y, RIGHT, y)
  y += 9
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(0)
  pdf.text('Preparó (encargada de reposición):', M, y)
  pdf.setDrawColor(120)
  pdf.line(M + 60, y + 1, M + 122, y + 1)
  pdf.text('Fecha:', M + 128, y)
  pdf.line(M + 140, y + 1, RIGHT, y + 1)
  y += 11
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Total a reponer: ${totalMover} u.`, M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text('Pickeadas:', M + 60, y)
  pdf.line(M + 78, y + 1, M + 100, y + 1)
  pdf.text('No encontradas:', M + 105, y)
  pdf.line(M + 134, y + 1, M + 156, y + 1)
  y += 13
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text('Al finalizar, entregar este reporte a administración.', M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  y += 11
  pdf.text('Recibido por administración:', M, y)
  pdf.line(M + 52, y + 1, M + 120, y + 1)
  await compartirODescargarPDF(pdf, `reposicion-${marca}-${new Date().toISOString().slice(0, 10)}.pdf`, 'Reposición de local')
  return true
}
