'use client'

/**
 * La calculadora Pedido + Envío que vivía abajo del panel (30-sep-2026) se sacó el 16-nov-2026: el envío va adentro del
 * pedido (hoja del pedido, «+ Envío») y «💬 Total» copia el total con este mismo texto. Queda sólo el mensaje.
 */

/**
 * El texto que se le pasa al cliente: «El total con el envío incluido es de $45.300.-».
 * Formato pedido por Darío el 30-sep-2026. Los centavos sólo si los hay.
 */
export function mensajeTotal(total: number): string {
  return `El total con el envío incluido es de ${pesos(total)}.-`
}

/** "$45.300", o "$45.300,50" si hay centavos. */
function pesos(n: number): string {
  const conCentavos = Math.round(Math.abs(n) * 100) % 100 !== 0
  return '$' + n.toLocaleString('es-AR', {
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })
}
