/**
 * La lista de **Devolver al depósito** en el rollo de 80 mm (la térmica del local de Zattia: ahí no
 * hay impresora A4). La arma y la lleva Camila en el carro.
 *
 * Una fila por variante, en orden de SKU y agrupada por producto: el SKU y el talle a la izquierda,
 * cuántas devolver bien grande a la derecha y una casilla para tildar al cargarla en el carro. Arriba el
 * total; al pie, la firma.
 *
 * 🔴 Una lista larga sale en **partes** de hasta `ALTO_MAX` (19-oct-2026: la Epson imprimía sólo el
 * principio, lo mismo que le pasó al chequeo de exhibición el 14-oct).
 */

import { abrirRollo, ALTO_MAX, COLA, M, MIN, W, type Medidor, type OpBase, type Pagina } from '../rollo80'
import { imprimirPdf } from '../etiquetas/pdf'
import { selloDeImpresion } from '../envios/recibo'
import type { FilaVentas } from './porVentas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

/** La casilla para tildar, pegada al borde derecho. */
export type OpCasilla = { k: 'casilla'; y: number }
/** Un texto en una columna (x fija), centrado: la cantidad y su título. */
export type OpColumna = { k: 'col'; x: number; y: number; txt: string; tam: number; bold: boolean; gris?: number }
/** «PRODUCTO - variante» en un renglón: el producto en negrita, la variante no. */
export type OpProducto = { k: 'prod'; y: number; nombre: string; variante: string; tam: number }
export type Op = OpBase | OpCasilla | OpColumna | OpProducto

/** Casilla de 5 mm contra el margen derecho; la cantidad, centrada a su izquierda. */
const CASILLA = 5
const X_CASILLA = W - M - CASILLA
const X_CANT = X_CASILLA - 9

export type FilaDevolver = FilaVentas & { devolverHoy: number }

/** Lo más alto que puede ocupar un renglón (SKU + nombre en dos renglones + variante): no se parte. */
const RENGLON_MAX = 20

/**
 * Dónde va cada cosa y cuánto mide el papel, sin jsPDF (testeable).
 *
 * Cada renglón (Darío, 11-oct): arriba el **SKU** —el depósito del local está ordenado por SKU— con
 * la **cantidad** en su columna «Cant.» y la **casilla** a la derecha; abajo «PRODUCTO - variante».
 * ⛔ Sin stock ni ventas: al papel va sólo lo que se hace.
 */
export function armarDevolucion(
  filas: FilaDevolver[],
  ahoraMs: number,
  partir: Medidor,
  /** «Zattia» o «Stunned»: cada línea sale en su papel. */
  linea = '',
): Pagina<OpCasilla | OpColumna | OpProducto>[] {
  const paginas: { ops: Op[]; alto: number }[] = []
  let ops: Op[] = []
  let y = M
  const total = filas.reduce((s, f) => s + f.devolverHoy, 0)
  /** El renglón «Parte N de T» de cada parte: el total se sabe al final. */
  const partes: { txt: string }[] = []

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
  const encabezadoParte = () => {
    const op = { k: 'txt' as const, txt: '', y, tam: 9, bold: true, align: 'izq' as const }
    ops.push(op)
    partes.push(op)
    y += 9 * 0.38
  }
  // Los títulos de las columnas, arriba de cada parte.
  const columnas = () => {
    ops.push({ k: 'txt', txt: 'SKU · Producto', y, tam: 8, bold: true, align: 'izq', gris: 90 })
    ops.push({ k: 'col', x: X_CANT, y, txt: 'Cant.', tam: 8, bold: true, gris: 90 })
    ops.push({ k: 'txt', txt: 'Listo', y, tam: 8, bold: true, align: 'der', gris: 90 })
    y += 3.5
  }
  /** Si lo que viene (`mm`) no entra en lo que queda de esta parte, la cierra y abre la siguiente. */
  const lugar = (mm: number) => {
    // 5 mm de reserva para el «Sigue en el próximo papel.»
    if (y + mm <= ALTO_MAX - COLA - 5) return false
    y += 1.5
    escribir('Sigue en el próximo papel.', 9, true, 90)
    paginas.push({ ops, alto: Math.max(MIN, y + COLA) })
    ops = []
    y = M
    escribir('DEVOLUCIÓN AL DEPÓSITO (sigue)', 11, true)
    encabezadoParte()
    regla()
    columnas()
    return true
  }

  escribir('DEVOLUCIÓN AL DEPÓSITO', 13, true)
  if (linea) escribir(linea.toUpperCase(), 11, true)
  escribir(selloDeImpresion(ahoraMs), 9, false, 90)
  encabezadoParte()
  y += 0.5
  escribir(`${total} prendas`, 10, true)
  regla()
  columnas()

  filas.forEach((f, i) => {
    // El primero de una parte nueva no lleva regla arriba: ya tiene los títulos encima.
    if (!lugar(RENGLON_MAX) && i > 0) {
      y += 0.8
      ops.push({ k: 'regla', y })
      y += 2.4
    }
    // Arriba: el SKU, la cantidad y la casilla, en la misma altura.
    ops.push({ k: 'txt', txt: f.it.sku || '(sin SKU)', y, tam: 10, bold: true, align: 'izq', gris: f.it.sku ? undefined : 120 })
    ops.push({ k: 'col', x: X_CANT, y: y - 0.6, txt: String(f.devolverHoy), tam: 14, bold: true })
    ops.push({ k: 'casilla', y: y + 0.2 })
    y += 4.6
    // Abajo: «PRODUCTO - variante», el producto en negrita y la variante no. Si no entra en un
    // renglón, la variante baja al siguiente.
    const variante = f.it.size && f.it.size !== 'Variante Única' ? f.it.size : ''
    if (variante && partir(`${f.it.name} - ${variante}`, 9, true).length === 1) {
      ops.push({ k: 'prod', y, nombre: f.it.name, variante, tam: 9 })
      y += 9 * 0.38
    } else {
      escribir(f.it.name, 9, true)
      if (variante) escribir(variante, 9, false)
    }
  })

  lugar(15)
  regla()
  // El total ya va arriba: al pie, sólo la firma (Darío, 12-oct: «muy repetitivo»).
  y += 2
  escribir('Preparó: ______________________', 10, false)

  paginas.push({ ops, alto: Math.max(MIN, y + COLA) })
  // Con una sola parte el renglón queda vacío (no se dibuja nada); con más, dice cuál es.
  if (paginas.length > 1) partes.forEach((p, i) => (p.txt = `Parte ${i + 1} de ${paginas.length}`))
  for (const pag of paginas) pag.ops = pag.ops.filter((o) => !(o.k === 'txt' && !o.txt))
  return paginas
}

export function pintarDevolucion(pdf: Pdf, op: OpCasilla | OpColumna | OpProducto): boolean {
  if (op.k === 'casilla') {
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.3)
    pdf.rect(X_CASILLA, op.y, CASILLA, CASILLA)
    return true
  }
  if (op.k === 'col') {
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
    pdf.text(`- ${op.variante}`, M + ancho + 1.2, op.y, { baseline: 'top' })
    return true
  }
  return false
}

export async function imprimirDevolucion(filas: FilaDevolver[], linea = '', ahoraMs = Date.now()): Promise<void> {
  const rollo = await abrirRollo()
  imprimirPdf(rollo.documento<OpCasilla | OpColumna | OpProducto>(armarDevolucion(filas, ahoraMs, rollo.medir, linea), pintarDevolucion))
}
