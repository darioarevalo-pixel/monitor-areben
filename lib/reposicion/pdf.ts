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
  /**
   * Cuándo Gestión Nube escribió este stock (no cuándo lo leyó la pantalla: eso era lo que decía
   * antes, y por eso una hoja impresa con el espejo de ayer llevaba la hora de recién). Quien
   * camina el depósito con el papel en la mano necesita poder ver que el stock es viejo.
   */
  sincronizado?: Date | null,
): Promise<boolean> {
  const esBdi = marca === 'bdi'
  const rep = reporte(inv, cfg, esBdi).filter((it) => moverFinal(it, cfg, esBdi, manual) > 0)
  if (!rep.length) return false
  const filas: FilaA4[] = rep
    .slice()
    .sort((a, b) => ubicCmp(a.ubic, b.ubic) || a.name.localeCompare(b.name, 'es') || (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
    .map((it) => ({ ubic: it.ubic, name: it.name, size: it.size, local: it.local, deposito: it.deposito, mover: moverFinal(it, cfg, esBdi, manual) }))
  await hojaA4(filas, marca, sincronizado)
  return true
}

/** Un renglón de la hoja A4, ya decidido: el orden es el de la lista. */
export type FilaA4 = {
  ubic: string
  name: string
  size: string
  /**
   * Stock del local y del depósito. **Sin estos dos, el papel no lleva columnas de stock**: es el de
   * Zattia, porque a quien arma no le sirven (Darío, 11-oct-2026 — el dueño los ve en pantalla).
   */
  local?: number
  deposito?: number
  mover: number
  /** Una línea chica en gris debajo del producto (Zattia: por qué esa cantidad). */
  nota?: string
}

/**
 * La lista de Zattia para Lorena («Llevar al local»): la misma hoja, con el porqué de cada cantidad.
 * El orden lo trae la lista (`listaLlevar`).
 */
export async function reposicionPDFFilas(filas: FilaA4[], marca: string, sincronizado?: Date | null): Promise<boolean> {
  const conMover = filas.filter((f) => f.mover > 0)
  if (!conMover.length) return false
  await hojaA4(conMover, marca, sincronizado)
  return true
}

/** El dibujo de la hoja. Compartido por BDI (mínimos) y Zattia (según ventas). */
async function hojaA4(filas: FilaA4[], marca: string, sincronizado?: Date | null): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 12, RIGHT = 198
  let y = 16
  const fecha = new Date().toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const totalMover = filas.reduce((s, it) => s + it.mover, 0)
  // BDI repone fundas (con stock en el papel); Zattia, prendas.
  const conStock = filas.some((f) => f.local != null)
  const unidad = conStock ? 'unidades' : 'prendas'
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Reposición del local · ' + marca.toUpperCase(), M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  y += 5
  pdf.text(`${fecha} · ${totalMover} ${unidad} · ${filas.length} variantes`, M, y)
  y += 4
  // La aclaración del "!" va en el papel: quien camina el depósito no estuvo en esta conversación.
  const cuando = sincronizado ? sincronizado.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null
  pdf.text(
    conStock
      ? `${cuando ? `Stock: ${cuando}  ·  ` : ''}"!" = local sin stock: reponer primero`
      : // Una sola casilla por renglón (Darío, 11-oct). Los signos van en palabras: Helvetica no
        // tiene ni ✓ ni ✗, y un glifo que falta sale como un cuadrado vacío en el papel.
        `${cuando ? `Stock: ${cuando}  ·  ` : ''}Casilla: tilde = completa · cruz = no encontrada · número = cantidad encontrada`,
    M,
    y,
  )
  pdf.setTextColor(0)
  y += 8
  // Sin ninguna ubicación cargada (Zattia, hoy), la columna sería una fila de rayas: se saca.
  const conUbic = conStock || filas.some((f) => f.ubic)
  const X = { ubic: M, prod: conUbic ? 30 : M, loc: 104, dep: 120, rep: 138, pick: 156, nf: 178 }
  const header = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.setTextColor(120)
    if (conUbic) pdf.text('Ubic.', X.ubic, y)
    pdf.text('Producto · Variante', X.prod, y)
    if (conStock) {
      pdf.text('Local', X.loc, y)
      pdf.text('Depósito', X.dep, y)
    }
    pdf.text('Reponer', X.rep, y)
    if (conStock) {
      pdf.text('Preparado', X.pick, y)
      pdf.text('No encontrado', X.nf, y)
    } else pdf.text('Hecho', X.pick, y)
    pdf.setTextColor(0)
    pdf.setDrawColor(200)
    pdf.line(M, y + 1.6, RIGHT, y + 1.6)
    // En el papel de Zattia el renglón está centrado sobre el texto: hace falta más aire abajo de la
    // línea del encabezado para que la primera casilla no la pise.
    y += conStock ? 5.5 : 7
  }
  header()
  filas.forEach((it, i) => {
    // Nombre COMPLETO en varias líneas (antes se truncaba a la 1ª con [0] → se perdía info).
    const anchoProd = (conStock ? X.loc : X.rep) - X.prod - 3
    // «Variante Única» no dice nada: va sólo el nombre.
    const talle = /^variante\s+[uú]nica$/i.test((it.size || '').trim()) ? '' : it.size || '—'
    const lineas = pdf.splitTextToSize(talle ? `${it.name} · ${talle}` : it.name, anchoProd)
    const notas: string[] = it.nota ? pdf.splitTextToSize(it.nota, anchoProd) : []
    const rowH = Math.max(conStock ? 6.6 : 8, lineas.length * 4 + notas.length * 3.4 + 2.6)
    if (y + rowH > 292) {
      pdf.addPage()
      y = 16
      header()
    }
    const mover = it.mover
    if (i % 2 === 1) {
      // En el papel de Zattia la franja es más oscura (Darío, 11-oct: «que sea más clara la línea»)
      // y está centrada sobre el texto, para que la casilla quede en el medio del renglón.
      if (conStock) {
        pdf.setFillColor(243, 244, 246)
        pdf.rect(M, y - 4.2, RIGHT - M, rowH, 'F')
      } else {
        pdf.setFillColor(222, 225, 230)
        pdf.rect(M, y - 1.2 - rowH / 2, RIGHT - M, rowH, 'F')
      }
    }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(20)
    if (conUbic) pdf.text(it.ubic || '—', X.ubic, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(20)
    lineas.forEach((ln: string, k: number) => pdf.text(ln, X.prod, y + k * 4))
    if (notas.length) {
      pdf.setFontSize(7)
      pdf.setTextColor(110)
      notas.forEach((ln: string, k: number) => pdf.text(ln, X.prod, y + lineas.length * 4 + k * 3.4 - 0.6))
      pdf.setFontSize(8.5)
      pdf.setTextColor(20)
    }
    // El local manda la prioridad: en 0 o 1 va en negrita, rojo y con "!" — el color se pierde
    // en la fotocopia en blanco y negro del depósito, el signo no.
    if (it.local != null) {
      const critico = it.local <= CRITICO
      if (critico) {
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(185, 28, 28)
      }
      pdf.text(critico ? `${it.local} !` : String(it.local), X.loc, y)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(165)
      pdf.text(String(it.deposito ?? ''), X.dep, y)
    }
    pdf.setTextColor(20)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(String(mover), X.rep, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setDrawColor(110)
    if (conStock) {
      pdf.rect(X.pick + 3, y - 3.2, 4, 4)
      pdf.rect(X.nf + 9, y - 3.2, 4, 4)
    } else {
      // Centrada en el renglón, más grande (puede llevar un número escrito) y blanca adentro: sobre la
      // franja gris un tilde en lápiz casi no se ve.
      pdf.setFillColor(255, 255, 255)
      pdf.rect(X.pick + 1, y - 1.2 - 3, 7, 6, 'FD')
    }
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
  pdf.text('Preparó:', M, y)
  pdf.setDrawColor(120)
  pdf.line(M + 17, y + 1, M + 122, y + 1)
  pdf.text('Fecha:', M + 128, y)
  pdf.line(M + 140, y + 1, RIGHT, y + 1)
  y += 11
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Total: ${totalMover} ${unidad}`, M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(conStock ? 'Preparadas:' : 'Repuestas:', M + 60, y)
  pdf.line(M + 82, y + 1, M + 100, y + 1)
  pdf.text('No encontradas:', M + 105, y)
  pdf.line(M + 134, y + 1, M + 156, y + 1)
  y += 13
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text('Entregar a administración al finalizar.', M, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  y += 11
  pdf.text('Recibió:', M, y)
  pdf.line(M + 17, y + 1, M + 120, y + 1)
  await compartirODescargarPDF(pdf, `reposicion-${marca}-${new Date().toISOString().slice(0, 10)}.pdf`, 'Reposición de local')
}
