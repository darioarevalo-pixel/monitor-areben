/**
 * Los mensajes que se le mandan al cliente, armados por el sistema.
 *
 * **Por qué no los escribe la empleada:** cada versión distinta del mismo mensaje es una promesa
 * distinta, y después el cliente reclama sobre lo que le dijeron. Acá el texto sale con los datos
 * ya puestos —número, productos, monto, link— y queda registrado qué se le dijo y cuándo.
 *
 * Precedente en el repo: `detalleCambioTexto` (en `./tipos`) ya hace esto para el ticket del cambio.
 * Esto lo generaliza a los tres momentos del reclamo.
 *
 * Archivo PURO y con tests: son textos que salen a un cliente, no se improvisan.
 */

import {
  MOTIVO_LABEL, VIA_LABEL,
  type Compensacion, type Expectativa, type ReclamoRow, type ItemReclamo, type ViaRetorno,
} from './tipos'


/**
 * `$ 15.283`.
 *
 * El `replace` no es cosmético: `toLocaleString('es-AR')` separa el símbolo con un **espacio duro**
 * (U+00A0), no con uno común. En un panel da igual, pero esto es texto que se pega en WhatsApp y
 * que alguien puede querer buscar o copiar — un carácter invisible distinto es la clase de detalle
 * que después nadie entiende. Se normaliza a un espacio de los de siempre.
 */
const money = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).replace(/ /g, ' ')

/** "2× Remera negra (M)" — cómo se nombra un producto de cara al cliente. */
function linea(i: ItemReclamo): string {
  const cant = Number(i.cantidad) || 1
  return `${cant}× ${i.producto}${i.variante ? ` (${i.variante})` : ''}`
}

const lista = (items: ItemReclamo[]) => items.map((i) => `• ${linea(i)}`).join('\n')

/** El nombre de pila alcanza y suena mejor que el nombre completo del comprobante. */
function nombrePila(cliente?: string | null): string {
  const n = (cliente || '').trim().split(/\s+/)[0] || ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ''
}

const saludo = (cliente?: string | null) => {
  const n = nombrePila(cliente)
  return n ? `¡Hola ${n}!` : '¡Hola!'
}

/**
 * 1) Al abrir el reclamo: se le pide la evidencia.
 *
 * El link es el corazón del mensaje, así que va solo en su renglón: pegado a otro texto, WhatsApp
 * a veces se lo come dentro del enlace anterior.
 */
export function mensajeApertura(d: Pick<ReclamoRow, 'cliente' | 'orden_tn' | 'motivo' | 'items'>, numero: string, link: string): string {
  const items = d.items || []
  const queEs = d.motivo === 'falla' ? 'la falla' : 'el producto'
  return [
    saludo(d.cliente),
    '',
    `Abrimos el reclamo ${numero}${d.orden_tn ? ` por tu pedido #${d.orden_tn}` : ''}:`,
    lista(items),
    '',
    `Para poder resolverlo rápido necesitamos ver ${queEs}. Entrá a este link y subí unas fotos:`,
    link,
    '',
    'Apenas las veamos te confirmamos cómo seguimos. ¡Gracias!',
  ].join('\n')
}

/**
 * **Qué pasa si NO acepta la propuesta**, dicho en criollo.
 *
 * 🔑 **La alternativa ⛔ no se inventa: es lo que ya está guardado.** Cuando el reclamo está
 * decidido, la resolución que hay en la fila **es** la salida "por si dice que no" —se decide antes
 * de mandar la oferta, y por eso la oferta puede quedar esperando sin trabar nada—. Recién si
 * todavía no se decidió se cae en lo que el cliente PIDIÓ, que es el único otro dato registrado.
 *
 * ⚠️ Las dos son listas cerradas y las dos tienen salida genérica: nombrar mal la alternativa en un
 * texto que sale a un cliente es prometerle algo distinto de lo que va a pasar.
 */
const ALTERNATIVA_POR_RESOLUCION: Partial<Record<Compensacion, string>> = {
  plata_total: 'la devolución',
  otro_producto: 'el cambio',
  otra_unidad: 'el envío de otra unidad',
  reenvio: 'el envío de lo que falta',
}

const ALTERNATIVA_POR_EXPECTATIVA: Partial<Record<Expectativa, string>> = {
  plata: 'la devolución',
  otro_producto: 'el cambio',
  mismo_producto: 'el envío de otra unidad',
  completar: 'el envío de lo que falta',
}

function laAlternativa(d: Pick<ReclamoRow, 'compensacion' | 'expectativa'>): string {
  return (
    (d.compensacion ? ALTERNATIVA_POR_RESOLUCION[d.compensacion as Compensacion] : null) ||
    (d.expectativa ? ALTERNATIVA_POR_EXPECTATIVA[d.expectativa as Expectativa] : null) ||
    'el cambio o la devolución'
  )
}

/**
 * 4) **La propuesta: que se lo quede a cambio de una parte de la plata o de un cupón.**
 *
 * Es el momento en el que el reclamo pasa la mayor parte del tiempo —Administración arma la
 * propuesta, el local la manda, la respuesta llega al día siguiente— y hasta hoy era el único de
 * los cuatro **sin mensaje**: el de la clienta de `R-0022` hubo que escribirlo a mano. Eso es
 * exactamente lo que este archivo existe para evitar: cada versión escrita a mano de la misma
 * oferta es una promesa distinta, y el cliente después reclama sobre la que le dijeron.
 *
 * 🔑 **La forma se lee con la MISMA regla que `salidaAlAceptarRetencion`** —`cupon` o, cualquier
 * otra cosa, plata—, ⛔ no con una condición propia. Es la regla que decide en qué termina el
 * reclamo si acepta, y el texto tiene que prometer eso mismo: un cupón que se cobra como plata, o
 * al revés, es la clase de diferencia que se descubre en la caja.
 *
 * ⚠️ **Dice el monto y ⛔ no la cuenta de la que sale.** Lo que se negocia es el número, y explicar
 * de dónde salió invita a discutirlo.
 *
 * 🔑 **Termina en una PREGUNTA**, y es el único de los cuatro que lo hace: los otros tres avisan
 * algo ya decidido. Sin la pregunta explícita, el cliente contesta cualquier cosa y el local no
 * sabe si eso fue un sí.
 */
export function mensajePropuesta(
  d: Pick<ReclamoRow, 'cliente' | 'orden_tn' | 'items' | 'retencion_monto' | 'retencion_forma' | 'compensacion' | 'expectativa'>,
  numero: string,
): string {
  const items = d.items || []
  const monto = Number(d.retencion_monto) || 0
  const esCupon = d.retencion_forma === 'cupon'
  const queEs = items.length === 1 ? 'el producto' : 'los productos'

  const oferta = esCupon
    ? `te damos un cupón de ${money(monto)} para tu próxima compra y te quedás con ${queEs}.`
    : `te devolvemos ${money(monto)} y te quedás con ${queEs}.`

  return [
    saludo(d.cliente),
    '',
    `Sobre el reclamo ${numero}${d.orden_tn ? ` (pedido #${d.orden_tn})` : ''}:`,
    lista(items),
    '',
    `Te proponemos algo: ${oferta}`,
    '',
    `Si preferís, seguimos con ${laAlternativa(d)} como estaba.`,
    '',
    '¿Cómo preferís que lo resolvamos? Con tu respuesta lo dejamos listo. ¡Gracias!',
  ].join('\n')
}

/** 2) La resolución, tal como la decidió Administración. Es el mensaje que más importa. */
export function mensajeResolucion(
  d: Pick<ReclamoRow, 'cliente' | 'orden_tn' | 'items' | 'compensacion' | 'monto_total' | 'cupon_codigo' | 'via_retorno' | 'destino_prenda'>,
  numero: string,
): string {
  const items = d.items || []
  const monto = Number(d.monto_total) || 0
  // 🔑 `regalada` es el caso más literal de los tres: la unidad está sana y se la dejamos. Antes
  // caía en `falla`, así que el mensaje salía igual — pero por el destino equivocado.
  const seLaQueda = d.destino_prenda === 'falla' || d.destino_prenda === 'regalada' || d.destino_prenda === 'perdida'

  const cuerpo: string[] = []
  const pasos: string[] = []

  switch (d.compensacion as Compensacion) {
    case 'plata_total':
      cuerpo.push(`Te devolvemos ${money(monto)}, que es lo que pagaste por ${items.length === 1 ? 'el producto' : 'los productos'}.`)
      break
    case 'plata_parcial':
      cuerpo.push(`Te devolvemos ${money(monto)} y te quedás con ${items.length === 1 ? 'el producto' : 'los productos'}.`)
      break
    case 'otra_unidad':
      cuerpo.push('Te enviamos otra unidad del mismo producto, sin costo.')
      break
    case 'reenvio':
      cuerpo.push('Te enviamos lo que falta, sin costo.')
      break
    case 'cupon':
      cuerpo.push(`Te dejamos un cupón de descuento${d.cupon_codigo ? ` (código ${d.cupon_codigo})` : ''} para tu próxima compra.`)
      break
    default:
      cuerpo.push('Ya lo revisamos y te contamos cómo seguimos.')
  }

  // Lo que tiene que hacer el cliente. Si no vuelve nada, se dice explícitamente: es la duda
  // número uno y la que genera el "¿y yo qué hago con esto?".
  if (d.via_retorno === 'presencial') {
    pasos.push('Acercate al local con el producto cuando puedas y lo resolvemos ahí mismo.')
  } else if (d.via_retorno) {
    pasos.push(`Te mandamos la etiqueta de ${VIA_LABEL[d.via_retorno as ViaRetorno]} para que nos lo envíes. **El envío lo pagamos nosotros.**`)
  } else if (seLaQueda) {
    pasos.push('No hace falta que nos devuelvas nada: quedátelo.')
  }

  if ((d.compensacion === 'plata_total' || d.compensacion === 'plata_parcial') && monto > 0) {
    pasos.push('La devolución sale por el mismo medio con el que pagaste y puede tardar unos días en verse acreditada.')
  }

  return [
    saludo(d.cliente),
    '',
    `Sobre el reclamo ${numero}${d.orden_tn ? ` (pedido #${d.orden_tn})` : ''}:`,
    lista(items),
    '',
    ...cuerpo,
    ...(pasos.length ? ['', ...pasos] : []),
    '',
    'Cualquier duda escribinos por acá. ¡Gracias por la paciencia!',
  ].join('\n')
}

/**
 * 5) **La etiqueta todavía no existe, y el cliente ⛔ no lo sabe.**
 *
 * Pedido de Bruno, 28-ago-2026: *«le mandamos que apenas tengamos la etiqueta se la estamos
 * enviando para que pueda despachar el paquete»*. Es el hueco que dejaba el circuito cuando el
 * cliente **no acepta** la oferta y se sigue con la devolución: la resolución ya se le contó, la
 * etiqueta tarda, y del otro lado hay alguien esperando sin saber si tiene que hacer algo.
 *
 * 🔑 **Dice explícitamente que ⛔ no tiene que hacer nada todavía.** Sin eso el cliente vuelve a
 * escribir para preguntar, que es el costo que este mensaje ahorra — y el que se paga cuando no
 * existe es peor: el paquete no sale, y el reloj de «hace N días que no llega» empieza a correr
 * sobre una espera que ⛔ nunca fue del cliente.
 *
 * ⚠️ **⛔ No promete una fecha.** La etiqueta la emite el transporte y prometer «mañana» es la
 * clase de promesa que este archivo existe para no dejar improvisar.
 */
export function mensajeEtiquetaEnCamino(
  d: Pick<ReclamoRow, 'cliente' | 'via_retorno'>,
  numero: string,
): string {
  const via = d.via_retorno ? VIA_LABEL[d.via_retorno as ViaRetorno] : null
  return [
    saludo(d.cliente),
    '',
    `Ya está todo listo con el reclamo ${numero}.`,
    '',
    `Estamos generando la etiqueta${via ? ` de ${via}` : ''} para que nos devuelvas el producto y te la mandamos por acá apenas la tengamos. **El envío lo pagamos nosotros.**`,
    '',
    'Hasta entonces no tenés que hacer nada: cuando te llegue, la imprimís o la mostrás en la sucursal y despachás el paquete.',
    '',
    '¡Gracias por la paciencia!',
  ].join('\n')
}

/** 3) El seguimiento: la etiqueta despachada, o la plata acreditada. */
export function mensajeSeguimiento(
  d: Pick<ReclamoRow, 'cliente' | 'via_retorno' | 'seguimiento_vuelta' | 'seguimiento_ida' | 'monto_total'>,
  numero: string,
  que: 'etiqueta' | 'reenvio' | 'plata',
): string {
  const partes: string[] = [saludo(d.cliente), '']

  if (que === 'etiqueta') {
    partes.push(`Ya tenés la etiqueta para devolvernos el producto del reclamo ${numero}.`)
    if (d.seguimiento_vuelta) partes.push(`Código de seguimiento: ${d.seguimiento_vuelta}`)
    partes.push('Acercalo a la sucursal cuando puedas. El envío corre por nuestra cuenta.')
  } else if (que === 'reenvio') {
    partes.push(`Ya despachamos tu reposición del reclamo ${numero}.`)
    if (d.seguimiento_ida) partes.push(`Código de seguimiento: ${d.seguimiento_ida}`)
  } else {
    partes.push(`Ya hicimos la devolución del reclamo ${numero}${d.monto_total ? ` por ${money(Number(d.monto_total))}` : ''}.`)
    partes.push('Puede tardar unos días en verse acreditada según el medio de pago.')
  }

  partes.push('', '¡Gracias!')
  return partes.join('\n')
}

/** Para el historial: qué mensaje se le mandó y cuándo. */
export type MensajeEnviado = { tipo: 'apertura' | 'propuesta' | 'resolucion' | 'seguimiento'; at: string; por?: string | null; texto: string }

/** Etiqueta corta de un reclamo para listados y avisos: "R-0007 · Falla · Carla". */
export function resumenCorto(d: Pick<ReclamoRow, 'motivo' | 'cliente'>, numero: string): string {
  return [numero, MOTIVO_LABEL[d.motivo] || d.motivo, nombrePila(d.cliente)].filter(Boolean).join(' · ')
}
