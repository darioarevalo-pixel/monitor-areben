/**
 * **El ticket del chequeo** en el rollo de 80 mm (Darío, 11-oct-2026): se imprime desde la
 * computadora y la empleada sale con él en la mano a colgar lo pendiente y retirar lo duplicado.
 *
 * Dos listas, por SKU —el depósito del local está ordenado así—, y en cada renglón dos casillas:
 * - **Pendiente de exhibición**: «Exhibido» o «No encontrado».
 * - **Variantes duplicadas**: «Retirado» o «Exhibición frontal» (los frontales repiten a propósito y
 *   la app ⛔ los conoce: lo marca quien está parada delante del perchero).
 * Al final, en negrita, el aviso de los frontales.
 *
 * ⛔ Sin stock ni ventas: al papel va sólo lo que se hace (misma regla que la Reposición).
 */

import { abrirRollo, COLA, M, MIN, W, type Medidor, type OpBase } from '../rollo80'
import { imprimirPdf } from '../etiquetas/pdf'
import { selloDeImpresion } from '../envios/recibo'
import type { Duplicada, Pendiente } from './reporte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

export type OpCasilla = { k: 'casilla'; x: number; y: number }
/** Un texto centrado en una columna: el título de cada casilla. */
export type OpColumna = { k: 'col'; x: number; y: number; txt: string; tam: number; bold: boolean; gris?: number }
/** «PRODUCTO - variante» en un renglón: el producto en negrita, la variante no. */
export type OpProducto = { k: 'prod'; y: number; nombre: string; variante: string; tam: number }
export type Op = OpBase | OpCasilla | OpColumna | OpProducto

/**
 * Casillas de 4,5 mm. ⚠️ La segunda ⛔ va pegada al margen: su título («encontrado», «frontal») es
 * más ancho que la casilla y, centrado, se salía del papel.
 */
const CASILLA = 4.5
const X_CAS2 = W - M - 9
const X_CAS1 = X_CAS2 - 17
/** El centro de cada casilla, para centrar su título. */
const C1 = X_CAS1 + CASILLA / 2
const C2 = X_CAS2 + CASILLA / 2

export const AVISO_FRONTAL = 'Antes de reponer, verificar los productos en exhibición frontal. Si figuran en esta lista, marcar Exhibición frontal'

/** La variante tal como se lee en el papel: «Variante Única» ⛔ dice nada. */
function varianteDe(v: string): string {
  return v && v !== 'Variante Única' ? v : ''
}

/** Dónde va cada cosa y cuánto mide el papel, sin jsPDF (testeable). */
export function armarTicket(pendientes: Pendiente[], duplicadas: Duplicada[], ahoraMs: number, partir: Medidor): { ops: Op[]; alto: number } {
  const ops: Op[] = []
  let y = M

  const escribir = (txt: string, tam: number, bold: boolean, gris?: number) => {
    for (const l of partir(txt, tam, bold)) {
      ops.push({ k: 'txt', txt: l, y, tam, bold, align: 'izq', gris })
      y += tam * 0.38
    }
  }
  const regla = () => {
    y += 1.5
    ops.push({ k: 'regla', y })
    y += 2.5
  }
  /** El título de la lista en su renglón y abajo los de las columnas: el de cada casilla, en dos renglones. */
  const titulos = (titulo: string, cas1: [string, string], cas2: [string, string]) => {
    escribir(titulo, 11, true)
    y += 0.8
    ops.push({ k: 'txt', txt: 'SKU · Producto', y: y + 2.4, tam: 7, bold: true, align: 'izq', gris: 90 })
    for (const [x, [a, b]] of [[C1, cas1], [C2, cas2]] as const) {
      // Un título de un solo renglón va abajo, a la altura del segundo de al lado.
      ops.push({ k: 'col', x, y: b ? y : y + 2.6, txt: a, tam: 7, bold: true, gris: 90 })
      if (b) ops.push({ k: 'col', x, y: y + 2.6, txt: b, tam: 7, bold: true, gris: 90 })
    }
    y += 6.2
  }
  /** Un renglón: arriba el SKU (y lo que haga falta al lado) con las dos casillas; abajo el producto. */
  const renglon = (i: number, sku: string, extra: string, nombre: string, variante: string) => {
    if (i > 0) {
      y += 0.8
      ops.push({ k: 'regla', y })
      y += 2.4
    }
    ops.push({ k: 'txt', txt: (sku || '(sin SKU)') + (extra ? `  ${extra}` : ''), y, tam: 10, bold: true, align: 'izq', gris: sku ? undefined : 120 })
    // La casilla termina antes del renglón del producto, que usa el ancho entero.
    ops.push({ k: 'casilla', x: X_CAS1, y: y - 0.3 })
    ops.push({ k: 'casilla', x: X_CAS2, y: y - 0.3 })
    y += 4.6
    if (variante && partir(`${nombre} - ${variante}`, 9, true).length === 1) {
      ops.push({ k: 'prod', y, nombre, variante, tam: 9 })
      y += 9 * 0.38
    } else {
      escribir(nombre, 9, true)
      if (variante) escribir(variante, 9, false)
    }
  }

  escribir('CHEQUEO DE EXHIBICIÓN', 13, true)
  escribir(selloDeImpresion(ahoraMs), 9, false, 90)
  y += 0.5
  escribir(`${pendientes.length} pendientes · ${duplicadas.length} duplicadas`, 10, true)
  regla()

  titulos(`Pendiente de exhibición (${pendientes.length})`, ['Exhibido', ''], ['No', 'encontrado'])
  if (!pendientes.length) escribir('No hay variantes pendientes.', 9, false, 90)
  pendientes.forEach((p, i) => renglon(i, p.sku, '', p.nombre, p.unaCualquiera ? 'una cualquiera' : varianteDe(p.variante)))
  regla()

  titulos(`Variantes duplicadas (${duplicadas.length})`, ['Retirado', ''], ['Exhibición', 'frontal'])
  if (!duplicadas.length) escribir('No hay variantes duplicadas.', 9, false, 90)
  duplicadas.forEach((d, i) => renglon(i, d.sku, `× ${d.veces}`, d.nombre, varianteDe(d.variante)))
  regla()

  escribir(AVISO_FRONTAL, 10, true)
  y += 4
  escribir('Hizo: ______________________', 10, false)

  return { ops, alto: Math.max(MIN, y + COLA) }
}

export function pintarTicket(pdf: Pdf, op: OpCasilla | OpColumna | OpProducto): boolean {
  if (op.k === 'casilla') {
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.3)
    pdf.rect(op.x, op.y, CASILLA, CASILLA)
    return true
  }
  if (op.k === 'col') {
    if (!op.txt) return true
    pdf.setFont('helvetica', op.bold ? 'bold' : 'normal')
    pdf.setFontSize(op.tam)
    if (op.gris != null) pdf.setTextColor(op.gris, op.gris, op.gris)
    pdf.text(op.txt, op.x, op.y, { baseline: 'top', align: 'center' })
    if (op.gris != null) pdf.setTextColor(0, 0, 0)
    return true
  }
  if (op.k === 'prod') {
    pdf.setFontSize(op.tam)
    pdf.setFont('helvetica', 'bold')
    pdf.text(op.nombre, M, op.y, { baseline: 'top' })
    // El espacio va como distancia y no como carácter: jsPDF se come el espacio del principio.
    const ancho = pdf.getTextWidth(op.nombre)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`- ${op.variante}`, M + ancho + 1.5, op.y, { baseline: 'top' })
    return true
  }
  return false
}

/** Arma el PDF del ticket (para mirarlo o imprimirlo). */
export async function pdfTicket(pendientes: Pendiente[], duplicadas: Duplicada[], ahoraMs = Date.now()): Promise<Pdf> {
  const rollo = await abrirRollo()
  return rollo.documento<OpCasilla | OpColumna | OpProducto>([armarTicket(pendientes, duplicadas, ahoraMs, rollo.medir)], pintarTicket)
}

export async function imprimirTicket(pendientes: Pendiente[], duplicadas: Duplicada[], ahoraMs = Date.now()): Promise<void> {
  imprimirPdf(await pdfTicket(pendientes, duplicadas, ahoraMs))
}
