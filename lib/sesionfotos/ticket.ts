/**
 * Ticket de 80 mm (impresora térmica) con el detalle de los productos pedidos de una
 * solicitud, agrupado por origen (Depósito / Local) para preparar/retirar. Texto plano
 * (sin código de barras: la mayoría de los ítems no guardan `barcode`, solo SKU).
 *
 * Cliente-only. `jspdf` por import dinámico (como el resto de los PDF). El alto del
 * rollo se calcula en una pasada de medición y después se dibuja, así el ticket sale
 * justo (sin cola en blanco). Se imprime con `imprimirPdf` (iframe oculto + autoPrint).
 */

import { imprimirPdf } from '@/lib/etiquetas/pdf'
import type { Origen, Solicitud } from './tipos'

const W = 80 // ancho del rollo (mm)
const M = 4 // margen (mm)
const CW = W - M * 2 // ancho útil
const LH = 0.42 // alto de línea por punto de fuente (mm), mismo factor que las etiquetas

/** Ítems de un origen ordenados por SKU (sin SKU al final). */
function itemsOrden(s: Solicitud, o: Origen) {
  return s.items
    .filter((i) => i.origen === o)
    .sort((a, b) => {
      const ka = String(a.sku || '').trim()
      const kb = String(b.sku || '').trim()
      if (!ka && kb) return 1
      if (ka && !kb) return -1
      return ka.localeCompare(kb, 'es', { numeric: true, sensitivity: 'base' })
    })
}

type Op = { t: 'text'; lines: string[]; fs: number; bold: boolean; gray: boolean; gap: number; h: number } | { t: 'rule'; gap: number; h: number }

/** Arma e imprime el ticket 80 mm de una solicitud. */
export async function imprimirTicket80(s: Solicitud): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const medidor = new jsPDF({ unit: 'mm', format: [W, 400] })
  const ops: Op[] = []

  const push = (text: string, fs: number, bold: boolean, gray: boolean, gap: number) => {
    medidor.setFont('helvetica', bold ? 'bold' : 'normal')
    medidor.setFontSize(fs)
    const lines = medidor.splitTextToSize(String(text), CW) as string[]
    ops.push({ t: 'text', lines, fs, bold, gray, gap: ops.length ? gap : 0, h: lines.length * fs * LH })
  }
  const rule = () => ops.push({ t: 'rule', gap: 1.6, h: 0.1 })

  const tot = s.items.reduce((a, i) => a + i.qty, 0)
  push('SOLICITUD', 13, true, false, 0)
  if (s.descripcion) push(String(s.descripcion), 9, false, false, 1)
  push(`${s.fecha || ''}   ${s.creadoPor || ''}   ·   ${tot} u. · ${s.items.length} items`, 7.5, false, true, 0.8)
  rule()

  for (const o of ['deposito', 'local'] as Origen[]) {
    const arr = itemsOrden(s, o)
    if (!arr.length) continue
    push(o === 'deposito' ? 'DEPOSITO' : 'LOCAL', 10.5, true, false, 2.4)
    for (const it of arr) {
      const bt = typeof it.bolsa === 'number' ? `[B${it.bolsa}]  ` : ''
      push(`x${it.qty}   ${bt}${it.nombre}`, 9, true, false, 1.6)
      const sub = [it.variante, it.sku].map((x) => String(x || '').trim()).filter(Boolean).join('   ·   ')
      if (sub) push(sub, 7.5, false, true, 0.3)
    }
  }
  rule()
  push(`TOTAL: ${tot} u.`, 11, true, false, 1.6)
  push(new Date().toLocaleString('es-AR'), 6.5, false, true, 1.2)

  const totalH = ops.reduce((a, o) => a + o.gap + o.h, 0) + M * 2
  const pdf = new jsPDF({ unit: 'mm', format: [W, Math.max(30, totalH)] })
  let y = M
  for (const o of ops) {
    y += o.gap
    if (o.t === 'rule') {
      pdf.setDrawColor(170)
      pdf.line(M, y, W - M, y)
      y += o.h
      continue
    }
    pdf.setFont('helvetica', o.bold ? 'bold' : 'normal')
    pdf.setFontSize(o.fs)
    pdf.setTextColor(o.gray ? 120 : 0)
    pdf.text(o.lines, M, y, { baseline: 'top' })
    y += o.h
  }
  imprimirPdf(pdf)
}
