/**
 * El rollo de 80 mm de la térmica del local: la geometría y el dibujo, sin saber qué se imprime.
 *
 * # Por qué esto es un archivo y no cinco constantes copiadas
 *
 * Sobre este papel salen cosas distintas —el ticket que va pegado al paquete, el recibo de una
 * rendición— y todas comparten exactamente una cosa: **el ancho del rollo**. Un `ANCHO` que no
 * coincida con el `W` del `format` del PDF no rompe nada: el texto se parte más ancho que el papel y
 * el renglón sale cortado por el costado, en la calle, en el único ejemplar que se imprimió. Por eso
 * las medidas viven una sola vez.
 *
 * # Lo que este archivo NO decide
 *
 * Ni el contenido ni el orden ni los cuerpos de letra. Cada consumidor arma su lista de `Op` con su
 * propio cursor y sus propias jerarquías: en el ticket la dirección es lo más grande porque es lo
 * que el cadete lee arriba de la moto; en el recibo lo más grande es el monto. Eso es diseño de cada
 * papel y no se generaliza.
 *
 * ⚠️ **Deuda anotada, a propósito**: `lib/sesionfotos/ticket.ts` es otro papel de 80 mm y **no está
 * migrado**. No es olvido — su interlineado es 0.42 por punto de fuente contra 0.38 de acá, y unificar
 * los factores le cambia el alto a un ticket que ya se imprime todos los días en el local. Se migra
 * el día que haya un motivo mejor que la simetría; mientras tanto, lo que no puede pasar es una
 * **tercera** copia de `W`/`M`/`ANCHO`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

/** El ancho del rollo. */
export const W = 80
/** El margen a cada lado. */
export const M = 4
/** Lo que queda para escribir: 72 mm. */
export const ANCHO = W - M * 2
/**
 * Alto mínimo de página. Existe por jsPDF, no por diseño: con `orientation: 'portrait'` y un formato
 * más ancho que alto, da vuelta el papel solo y el papel saldría acostado. Por eso es apenas más que
 * los 80 del ancho y no un número redondo — cada milímetro de más es papel en blanco que la térmica
 * escupe en **cada** impresión.
 */
export const MIN = 82
/** Papel de más al final, para que el corte no se lleve el último renglón. */
export const COLA = 10

/** Corta un texto en líneas de `ANCHO` mm. Lo inyecta el PDF; los layouts no saben de fuentes. */
export type Medidor = (txt: string, tam: number, bold: boolean) => string[]

export type OpTexto = {
  k: 'txt'
  txt: string
  y: number
  tam: number
  bold: boolean
  align: 'izq' | 'der' | 'centro'
  gris?: number
}
export type OpRegla = { k: 'regla'; y: number }

/** Lo que este archivo sabe dibujar solo. Cada papel puede agregar las suyas. */
export type OpBase = OpTexto | OpRegla

/** Una página del rollo: dónde va cada cosa y cuánto mide el papel. */
export type Pagina<T> = { ops: (OpBase | T)[]; alto: number }

/**
 * Dibuja una lista de operaciones.
 *
 * 🔴 **Una `op` que nadie sabe pintar TIRA.** El modo de falla de un `continue` silencioso acá es un
 * bloque que desaparece del papel sin que falle nada: el PDF se genera, tiene el alto reservado para
 * ese bloque, y sale con un hueco en blanco justo donde iba el monto. Que reviente en la pantalla de
 * quien imprime es infinitamente mejor que un recibo mudo en la mano del cadete.
 */
export function pintar<T extends { k: string }>(
  pdf: Pdf,
  ops: (OpBase | T)[],
  pintarPropia?: (pdf: Pdf, op: T) => boolean,
) {
  for (const op of ops) {
    if (op.k === 'regla') {
      pdf.setDrawColor(150, 150, 150)
      pdf.setLineWidth(0.2)
      pdf.line(M, (op as OpRegla).y, W - M, (op as OpRegla).y)
      continue
    }
    if (op.k === 'txt') {
      const t = op as OpTexto
      pdf.setFont('helvetica', t.bold ? 'bold' : 'normal')
      pdf.setFontSize(t.tam)
      if (t.gris != null) pdf.setTextColor(t.gris, t.gris, t.gris)
      const x = t.align === 'der' ? W - M : t.align === 'centro' ? W / 2 : M
      pdf.text(t.txt, x, t.y, {
        baseline: 'top',
        align: t.align === 'der' ? 'right' : t.align === 'centro' ? 'center' : 'left',
      })
      if (t.gris != null) pdf.setTextColor(0, 0, 0)
      continue
    }
    if (pintarPropia && pintarPropia(pdf, op as T)) continue
    throw new Error(`El rollo no sabe dibujar una op «${op.k}»`)
  }
}

/** Lo que hace falta para armar un papel: medir primero, dibujar después. */
export type Rollo = {
  medir: Medidor
  /**
   * Un documento con una página por elemento, cada una con **su** alto. `pintarPropia` maneja las
   * `op` que este archivo no conoce.
   */
  documento<T extends { k: string }>(paginas: Pagina<T>[], pintarPropia?: (pdf: Pdf, op: T) => boolean): Pdf
}

/**
 * Carga jsPDF y devuelve con qué medir y con qué dibujar.
 *
 * 🔑 **La "regla descartable" existe porque el orden es al revés de lo que parece**: hay que saber
 * cuánto mide cada página **antes** de crearla —el alto es el formato— y medir texto necesita un
 * documento con la fuente ya puesta. Así que se abre uno de mentira sólo para preguntarle anchos, y
 * se tira. Vivía copiado en cada papel; es el detalle que más fácil se implementa mal.
 *
 * Import dinámico como el resto de los PDF del proyecto: es de cliente y el bundle no lo sube hasta
 * que alguien imprime.
 */
export async function abrirRollo(): Promise<Rollo> {
  const { jsPDF } = await import('jspdf')

  const regla = new jsPDF({ unit: 'mm', format: [W, MIN], orientation: 'portrait' })
  const medir: Medidor = (txt, tam, bold) => {
    regla.setFont('helvetica', bold ? 'bold' : 'normal')
    regla.setFontSize(tam)
    return regla.splitTextToSize(txt, ANCHO)
  }

  return {
    medir,
    documento(paginas, pintarPropia) {
      const pdf = new jsPDF({ unit: 'mm', format: [W, paginas[0].alto], orientation: 'portrait' })
      paginas.forEach((p, i) => {
        if (i > 0) pdf.addPage([W, p.alto], 'portrait')
        pintar(pdf, p.ops, pintarPropia)
      })
      return pdf
    },
  }
}
