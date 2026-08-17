/**
 * El recibo de un movimiento de la cuenta del cadete, en el rollo de 80 mm.
 *
 * # Para qué existe este papel
 *
 * El cadete rinde plata en el mostrador y se va. Hasta hoy lo único que quedaba de eso era una fila
 * en una pantalla que él no ve: si mañana no coinciden los números, ninguno de los dos tiene con qué
 * discutir. El recibo es **el comprobante que se lleva él**, y por eso es una sola copia — el local
 * ya tiene la fila.
 *
 * Sin firma, lo decidió Bruno: es un comprobante, no un documento que alguien tenga que sellar.
 *
 * # 🔑 El saldo va FECHADO al instante de impresión, y ésa es toda la idea
 *
 * El saldo se arrastra y **no se guarda ningún total** (ver `cuentaDelCadete`): cambia solo cada vez
 * que se entrega o se corrige un envío de cualquier día anterior. Un papel que diga «Saldo: $47.000»
 * a secas queda mintiendo apenas alguien toca un precio, y peor: **dos reimpresiones del mismo
 * movimiento se contradicen entre sí** sin que ninguna esté mal. Con «Saldo al imprimir, 17-ago
 * 19:04» las dos son ciertas y hablan de momentos distintos. El invariante de no guardar totales
 * queda intacto: el papel es una foto, y dice de cuándo.
 *
 * # Lo que este papel no puede equivocar
 *
 * 🔴 **El sentido del movimiento.** «Rindió $10.000» y «Le pagamos $10.000» son lo contrario y el
 * número es el mismo. En el papel nunca va un negativo: va el **verbo** y el monto en positivo, los
 * dos derivados del signo por `claseDelMovimiento` — la misma función que usa la pantalla, para que
 * no puedan decir cosas distintas del mismo dato.
 */

import { abrirRollo, COLA, M, MIN, W, type Medidor, type OpBase } from '../rollo80'
import { imprimirPdf } from '../etiquetas/pdf'
import { rotuloFecha } from '../fechas/semana'
import { OFFSET_AR_MS } from './portal.core.js'
import { claseDelMovimiento, MOVIMIENTO_LABEL, num, rotuloDeSaldo } from './reglas.core.js'
import type { MovimientoCuenta } from './tipos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/** El recuadro del saldo al pie. El `sub` es un renglón que a veces no está (saldo en cero). */
export type OpSaldo = {
  k: 'saldo'
  y: number
  alto: number
  sello: string
  titulo: string
  monto: string
  sub: string
}

export type Op = OpBase | OpSaldo

const altoSaldo = (sub: string) => (sub ? 30 : 25)

/**
 * El sello de impresión: día y hora de Argentina, como función pura de un número.
 *
 * 🔑 **Offset fijo, y el MISMO que el portal** (`OFFSET_AR_MS`, con su porqué escrito allá): así es
 * función pura de un número y el test prueba exactamente lo que corre. Con la hora del navegador,
 * una máquina mal configurada le pone al papel una hora que no es la del local, y no hay con qué
 * darse cuenta después. Y `hour12` ni se pregunta: acá la hora se lee «19:04», no «7:04 p. m.».
 */
export function selloDeImpresion(ahoraMs: number): string {
  const ar = new Date(ahoraMs + OFFSET_AR_MS).toISOString()
  return `${rotuloFecha(ar.slice(0, 10))} ${ar.slice(11, 16)}`
}

/**
 * Dónde va cada cosa y cuánto mide el papel, sin tocar jsPDF.
 *
 * `saldo` es el acumulado de toda la cuenta al momento de imprimir —el mismo número que muestra el
 * KPI—, no el del día: es el que se habla con el cadete.
 */
export function armarRecibo(
  mov: MovimientoCuenta,
  saldo: number,
  ahoraMs: number,
  partir: Medidor,
): { ops: Op[]; alto: number } {
  const ops: Op[] = []
  let y = M

  const escribir = (txt: string, tam: number, bold: boolean, gris?: number) => {
    for (const linea of partir(txt, tam, bold)) {
      ops.push({ k: 'txt', txt: linea, y, tam, bold, align: 'izq', gris })
      y += tam * 0.38
    }
  }
  const regla = () => {
    y += 2
    ops.push({ k: 'regla', y })
    y += 2.5
  }

  ops.push({ k: 'txt', txt: 'RECIBO', y, tam: 9, bold: true, align: 'izq', gris: 110 })
  ops.push({ k: 'txt', txt: 'Cuenta del cadete', y, tam: 9, bold: false, align: 'der', gris: 110 })
  y += 4.5
  regla()

  // El hecho, y en este orden: cuándo pasó, qué pasó, cuánto. El verbo arriba del número porque es
  // lo que lo vuelve legible — el monto solo no dice para qué lado fue la plata.
  escribir(rotuloFecha(mov.fecha), 12, false, 60)
  y += 1
  escribir(MOVIMIENTO_LABEL[claseDelMovimiento(mov.monto)], 15, true)
  y += 0.5
  escribir(plata(Math.abs(num(mov.monto))), 26, true)

  if (mov.nota) {
    y += 1.5
    escribir(mov.nota, 11, false, 70)
  }

  // Quién lo anotó, chico: sirve para volver a preguntarle a alguien, no para leerlo de lejos.
  // El aire de arriba es más que el del resto porque abajo de una nota de tres renglones el autor
  // se leía como el cuarto renglón de la nota — se vio mirando el PDF, no en ningún assert.
  if (mov.autor) {
    y += 2.5
    escribir(`Anotado por ${mov.autor}`, 9, false, 110)
  }

  regla()
  const r = rotuloDeSaldo(saldo)
  const alto = altoSaldo(r.sub)
  ops.push({
    k: 'saldo',
    y,
    alto,
    sello: `Saldo al imprimir · ${selloDeImpresion(ahoraMs)}`,
    titulo: r.titulo,
    monto: plata(r.monto),
    sub: r.sub,
  })
  y += alto

  return { ops, alto: Math.max(MIN, y + COLA) }
}

/**
 * El recuadro del saldo.
 *
 * Borde fino y no el rectángulo negro del ticket: allá el negro **significa** «no cobres nada», y
 * repetir esa marca en otro papel para decir otra cosa le saca justamente lo que la hace útil.
 */
function pintarSaldo(pdf: Pdf, op: OpSaldo) {
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.rect(M, op.y, W - M * 2, op.alto)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(90, 90, 90)
  pdf.text(op.sello, M + 3, op.y + 4, { baseline: 'middle' })

  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(10)
  pdf.text(op.titulo, M + 3, op.y + 10, { baseline: 'middle' })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text(op.monto, M + 3, op.y + 17.5, { baseline: 'middle' })

  if (op.sub) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(90, 90, 90)
    pdf.text(op.sub, M + 3, op.y + op.alto - 3, { baseline: 'bottom' })
    pdf.setTextColor(0, 0, 0)
  }
}

/** Arma el PDF de un recibo. Una página, una copia: el papel se lo lleva el cadete. */
export async function buildReciboPdf(mov: MovimientoCuenta, saldo: number, ahoraMs: number): Promise<Pdf> {
  const rollo = await abrirRollo()
  const recibo = armarRecibo(mov, saldo, ahoraMs, rollo.medir)
  return rollo.documento<OpSaldo>([recibo], (pdf, op) => {
    pintarSaldo(pdf, op)
    return true
  })
}

/** Arma e imprime, en un paso. */
export async function imprimirRecibo(mov: MovimientoCuenta, saldo: number, ahoraMs: number): Promise<void> {
  imprimirPdf(await buildReciboPdf(mov, saldo, ahoraMs))
}
