/**
 * El ticket que va pegado al paquete y que lee el cadete en la puerta.
 *
 * # Lo único que este ticket no puede equivocar
 *
 * 🔴 **Que mande a cobrar algo que ya está pagado.** No es un caso de borde: se midió sobre dos años
 * de la planilla de reparto que en la mediana el 100% de lo que el cadete cobra es el envío —el
 * producto ya se pagó por transferencia antes de despachar—, así que "esta puerta no se cobra" es lo
 * normal. Por eso el bloque de plata no es un número más chico cuando está pago: es **otra cosa**,
 * con otro fondo y otra palabra. A un metro de distancia, arriba de una moto, dos números parecidos
 * se leen igual; un rectángulo negro que dice PAGADO y uno blanco que dice COBRAR, no.
 *
 * El monto sale de `aCobrar` y no de un campo guardado: la pantalla y el ticket tienen que decir lo
 * mismo siempre, y la única forma es que sea la misma cuenta.
 *
 * # La geometría, y por qué es un rollo y no una etiqueta
 *
 * 80 mm de ancho —el rollo de la térmica del local— y **alto variable, uno por ticket**. Reemplazó a
 * una etiqueta de 10×7 cm de hoja suelta (14-ago-2026): con el ancho fijo del rollo, lo que sobra o
 * falta es largo, y el largo es gratis. Por eso acá los cuerpos son grandes —el nombre en 18, la
 * dirección en 15— donde en la etiqueta había que achicar para que entrara.
 *
 * 🔑 **El bloque de plata va al final del texto, no anclado al pie.** En la etiqueta era al revés
 * (alto fijo ⇒ el pie está siempre en el mismo lugar y el cadete no lo busca); acá el pie **no
 * existe** hasta que se sabe cuánto midió la dirección, y dejar un hueco variable arriba de la plata
 * sería papel en blanco en cada envío.
 *
 * No se reusa `lib/etiquetas/pdf.ts` —esa es la de producto, 5×2,5 para la Zebra— pero sí
 * `imprimirPdf`, que ya resuelve mandar al diálogo de impresión sin abrir una pestaña.
 *
 * La geometría del rollo (el ancho, el alto mínimo, la cola de corte) y el dibujo de textos y reglas
 * viven en `lib/rollo80.ts`, compartidos con el recibo de la cuenta del cadete. Acá queda lo que es
 * de **este** papel: qué se escribe, en qué orden y qué tamaño tiene cada cosa.
 */

import { abrirRollo, ANCHO, M, MIN, COLA, W, type Medidor, type OpBase } from '../rollo80'
import { imprimirPdf } from '../etiquetas/pdf'
import { aCobrar, direccionCompleta, estaTodoPago, nombreDeMarca } from './core'
import type { Envio } from './tipos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any

export type { Medidor }

/** Cuánto mide el recuadro de plata. Con desglose necesita un renglón más, o el número grande y el
 *  chico se tocan. Lo devuelve el layout —y no una constante— para que un test pueda afirmar que el
 *  bloque **entero** entra en el papel, no sólo que empieza adentro. */
const altoPlata = (dice: TextoDePlata) => (dice.detalle ? 29 : 24)

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/** El bloque de plata es la única op propia de este papel; el resto las dibuja el rollo. */
export type OpPlata = { k: 'plata'; y: number; alto: number; dice: TextoDePlata }

export type Op = OpBase | OpPlata

export type TextoDePlata = {
  modo: 'pagado' | 'cobrar'
  titulo: string
  monto: number
  /** El desglose, sólo cuando la puerta cobra dos cosas distintas. `null` el resto de las veces. */
  detalle: string | null
}

/**
 * Qué dice el bloque de plata. Se separa del dibujo **para poder probarlo**: si esta decisión
 * viviera adentro del `pdf.text(...)`, el único ensayo posible sería "el PDF se generó", que da
 * verde con el defecto puesto — el ticket saldría mandando a cobrar un pedido ya pagado y el test no
 * se enteraría. Acá es una función pura y `tests/envios-core.test.ts` la muta.
 */
export function textoDePlata(e: Envio): TextoDePlata {
  if (estaTodoPago(e)) return { modo: 'pagado', titulo: 'PAGADO', monto: 0, detalle: null }
  const envio = e.envio_pagado ? 0 : Number(e.monto_envio) || 0
  const pedido = Number(e.monto_pedido_a_cobrar) || 0
  // El desglose sólo aparece cuando el total es la suma de dos cosas: con una sola, repetir el mismo
  // número en chico abajo del grande invita a leer el chico.
  const detalle = envio > 0 && pedido > 0 ? `Envío ${plata(envio)} + pedido ${plata(pedido)}` : null
  return { modo: 'cobrar', titulo: plata(aCobrar(e)), monto: aCobrar(e), detalle }
}

/**
 * Dónde va cada cosa y cuánto mide el ticket entero, sin tocar jsPDF.
 *
 * Está separado del dibujo por la misma razón que `textoDePlata`: el alto es lo que decide si el
 * ticket sale cortado, y con el layout adentro del `pdf.text(...)` la única afirmación posible sería
 * "no tiró excepción". Acá un test le pasa una dirección de cuatro renglones y verifica que el papel
 * creció.
 */
export function armarTicket(e: Envio, partir: Medidor): { ops: Op[]; alto: number } {
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

  // Encabezado. Chico a propósito: la marca sirve para armar la mochila, no en la puerta.
  ops.push({ k: 'txt', txt: nombreDeMarca(e.store), y, tam: 9, bold: false, align: 'izq', gris: 110 })
  if (e.orden_numero) ops.push({ k: 'txt', txt: `#${e.orden_numero}`, y, tam: 9, bold: true, align: 'der' })
  y += 4.5
  regla()

  // 🔑 **La dirección va primera y grande; el nombre, abajo y más chico.** Lo dijo el cadete: a él
  // el nombre no le sirve para llegar —lo usa recién en la puerta, para preguntar por alguien—, y
  // el dato que lee de reojo en la moto, con el papel en la mano, es a dónde va.
  escribir(direccionCompleta(e), 17, true)
  y += 1.5
  escribir(e.cliente || 'Sin nombre', 13, false, 60)

  // El teléfono es lo que se usa cuando nadie abre, y se marca a mano con una sola mano: va grande.
  if (e.telefono) {
    y += 1.5
    escribir(e.telefono, 15, true)
  }

  // "Tocar timbre 2", "dejar en portería": si no se lee, el cadete toca la puerta equivocada.
  if (e.anotacion) {
    regla()
    escribir(e.anotacion, 12, false, 70)
  }

  regla()
  const dice = textoDePlata(e)
  const alto = altoPlata(dice)
  ops.push({ k: 'plata', y, alto, dice })
  y += alto

  return { ops, alto: Math.max(MIN, y + COLA) }
}

/**
 * El bloque de plata: lo primero que se mira y lo único que no se puede leer mal.
 *
 * Van los dos casos por caminos separados a propósito. Si esto fuera un `pdf.text(plata(monto))` con
 * el monto en cero, un ticket pago diría "$0" — que se lee como un precio, no como "no cobres".
 */
function pintarPlata(pdf: Pdf, y: number, alto: number, dice: TextoDePlata) {
  if (dice.modo === 'pagado') {
    pdf.setFillColor(20, 20, 20)
    pdf.rect(M, y, ANCHO, alto, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(26)
    pdf.text(dice.titulo, W / 2, y + alto / 2 - 1, { align: 'center', baseline: 'middle' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('No cobrar nada', W / 2, y + alto - 3, { align: 'center', baseline: 'bottom' })
    pdf.setTextColor(0, 0, 0)
    return
  }

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.8)
  pdf.rect(M, y, ANCHO, alto)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text('COBRAR', M + 3, y + 5, { baseline: 'middle' })

  // El monto se achica hasta entrar. Un pedido de siete cifras es raro pero existe, y el número que
  // se sale del recuadro se lee cortado justo donde importa: un "$1.450.300" recortado es "$1.450".
  pdf.setFont('helvetica', 'bold')
  let tam = 30
  pdf.setFontSize(tam)
  while (tam > 14 && pdf.getTextWidth(dice.titulo) > ANCHO - 8) {
    tam -= 1
    pdf.setFontSize(tam)
  }
  pdf.text(dice.titulo, W / 2, y + (dice.detalle ? alto / 2 : alto / 2 + 2.5), { align: 'center', baseline: 'middle' })

  if (dice.detalle) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text(dice.detalle, W / 2, y + alto - 3, { align: 'center', baseline: 'bottom' })
  }
}

/** Un ticket por página, cada una con su propio alto, en el orden en que vienen. */
export async function buildTicketsCadetePdf(envios: Envio[]): Promise<Pdf | null> {
  if (!envios.length) return null
  const rollo = await abrirRollo()
  const tickets = envios.map((e) => armarTicket(e, rollo.medir))
  return rollo.documento<OpPlata>(tickets, (pdf, op) => {
    pintarPlata(pdf, op.y, op.alto, op.dice)
    return true
  })
}

/** Arma e imprime, en un paso. Devuelve `false` si no había nada para imprimir. */
export async function imprimirTicketsCadete(envios: Envio[]): Promise<boolean> {
  const pdf = await buildTicketsCadetePdf(envios)
  if (!pdf) return false
  imprimirPdf(pdf)
  return true
}
