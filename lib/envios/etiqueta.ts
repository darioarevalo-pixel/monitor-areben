/**
 * La etiqueta que va pegada al paquete y que lee el cadete en la puerta.
 *
 * # Lo único que esta etiqueta no puede equivocar
 *
 * 🔴 **Que mande a cobrar algo que ya está pagado.** No es un caso de borde: se midió sobre dos años
 * de la planilla de reparto que en la mediana el 100% de lo que el cadete cobra es el envío —el
 * producto ya se pagó por transferencia antes de despachar—, así que "esta puerta no se cobra" es lo
 * normal. Por eso el bloque de plata no es un número más chico cuando está pago: es **otra cosa**,
 * con otro fondo y otra palabra. A un metro de distancia, arriba de una moto, dos números parecidos
 * se leen igual; un rectángulo negro que dice PAGADO y uno blanco que dice COBRAR, no.
 *
 * El monto sale de `aCobrar` y no de un campo guardado: la pantalla y la etiqueta tienen que decir
 * lo mismo siempre, y la única forma es que sea la misma cuenta.
 *
 * # La geometría
 *
 * 10×7 cm, media hoja A6 apaisada: entra la dirección completa en cuerpo grande y se puede pegar en
 * una bolsa de correo. No se reusa la de 5×2,5 de `lib/etiquetas/pdf.ts` —esa es de producto, para
 * la Zebra, y ahí no entra una dirección— pero sí se reusa `imprimirPdf`, que ya resuelve mandar al
 * diálogo de impresión sin abrir una pestaña.
 */

import { imprimirPdf } from '../etiquetas/pdf'
import { aCobrar, direccionCompleta, estaTodoPago } from './core'
import type { Envio } from './tipos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

const W = 100
const H = 70
const M = 6

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

const NOMBRE_MARCA: Record<string, string> = { bdi: 'BDI Accesorios', zattia: 'Zattia' }

/** Escribe un texto cortándolo en varias líneas y devuelve dónde quedó el cursor. */
function bloque(pdf: Pdf, txt: string, x: number, y: number, ancho: number, tam: number, bold: boolean): number {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal')
  pdf.setFontSize(tam)
  const lineas = pdf.splitTextToSize(txt, ancho)
  pdf.text(lineas, x, y, { baseline: 'top' })
  return y + lineas.length * tam * 0.38
}

/**
 * Qué dice el bloque de plata. Se separa del dibujo **para poder probarlo**: si esta decisión
 * viviera adentro del `pdf.text(...)`, el único ensayo posible sería "el PDF se generó", que da
 * verde con el defecto puesto — la etiqueta saldría mandando a cobrar un pedido ya pagado y el
 * test no se enteraría. Acá es una función pura y `tests/envios-core.test.ts` la muta.
 */
export function textoDePlata(e: Envio): { modo: 'pagado' | 'cobrar'; titulo: string; monto: number } {
  return estaTodoPago(e)
    ? { modo: 'pagado', titulo: 'PAGADO', monto: 0 }
    : { modo: 'cobrar', titulo: plata(aCobrar(e)), monto: aCobrar(e) }
}

/**
 * El bloque de plata: lo primero que se mira y lo único que no se puede leer mal.
 *
 * Van los dos casos por caminos separados a propósito. Si esto fuera un `pdf.text(plata(monto))` con
 * el monto en cero, una etiqueta paga diría "$0" — que se lee como un precio, no como "no cobres".
 */
function bloquePlata(pdf: Pdf, e: Envio, y: number) {
  const alto = 18
  const dice = textoDePlata(e)
  if (dice.modo === 'pagado') {
    pdf.setFillColor(20, 20, 20)
    pdf.rect(M, y, W - M * 2, alto, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(22)
    pdf.text(dice.titulo, W / 2, y + alto / 2, { align: 'center', baseline: 'middle' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text('No cobrar nada', W / 2, y + alto - 2.5, { align: 'center', baseline: 'bottom' })
    pdf.setTextColor(0, 0, 0)
    return y + alto
  }

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.8)
  pdf.rect(M, y, W - M * 2, alto)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text('COBRAR', M + 3, y + 5, { baseline: 'middle' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(24)
  pdf.text(dice.titulo, W / 2, y + alto / 2 + 2, { align: 'center', baseline: 'middle' })
  return y + alto
}

/** Una etiqueta por página, en el orden en que vienen. */
export async function buildEtiquetasCadetePdf(envios: Envio[]): Promise<Pdf | null> {
  if (!envios.length) return null
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' })

  envios.forEach((e, i) => {
    if (i > 0) pdf.addPage([W, H], 'landscape')
    let y = M

    // Encabezado: marca y orden. Chico, arriba, para que no compita con la dirección.
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(110, 110, 110)
    pdf.text(NOMBRE_MARCA[e.store] || e.store, M, y, { baseline: 'top' })
    if (e.orden_numero) pdf.text(`#${e.orden_numero}`, W - M, y, { align: 'right', baseline: 'top' })
    pdf.setTextColor(0, 0, 0)
    y += 5

    y = bloque(pdf, e.cliente || 'Sin nombre', M, y, W - M * 2, 14, true) + 1.5
    y = bloque(pdf, direccionCompleta(e), M, y, W - M * 2, 12, false) + 1

    if (e.telefono) y = bloque(pdf, e.telefono, M, y, W - M * 2, 10, false) + 1
    // La anotación es "tocar timbre 2" o "dejar en portería": si no entra, el cadete toca la puerta
    // equivocada. Va antes que la plata en el orden de lectura, pero después en importancia.
    if (e.anotacion) {
      pdf.setTextColor(70, 70, 70)
      y = bloque(pdf, e.anotacion, M, y, W - M * 2, 9, false)
      pdf.setTextColor(0, 0, 0)
    }

    // El bloque de plata va anclado al pie, no después del texto: así está SIEMPRE en el mismo lugar
    // de la etiqueta, y el cadete no tiene que buscarlo en un sitio distinto según cuán larga sea la
    // dirección.
    bloquePlata(pdf, e, H - M - 18)
  })

  return pdf
}

/** Arma e imprime, en un paso. Devuelve `false` si no había nada para imprimir. */
export async function imprimirEtiquetasCadete(envios: Envio[]): Promise<boolean> {
  const pdf = await buildEtiquetasCadetePdf(envios)
  if (!pdf) return false
  imprimirPdf(pdf)
  return true
}
