/**
 * Los datos fijos del emisor que la factura impresa tiene que mostrar (RG 1415 de ARCA): razón social,
 * domicilio comercial, condición frente al IVA, CUIT, Ingresos Brutos e inicio de actividades.
 *
 * 🔴 ⛔ Se inventan ni se copian de una etiqueta de envío: salen de una factura que ya emitió GN o de la
 * constancia de inscripción de ARCA. Lo que todavía no se sabe va en `null` y el PDF ⛔ sale
 * (`faltanDelEmisor`): una factura con un dato fiscal mal impreso es peor que ninguna.
 *
 * El domicilio va por marca: cada punto de venta está dado de alta en ARCA con un domicilio.
 *
 * Copiados de la Factura A 00002-00000201 de BDI emitida por GN (07-oct-2026, captura de Bruno del 13-oct).
 * Zattia, de la Factura B 00005-00006043 (09-oct-2026): ⛔ imprime domicilio ⇒ falta.
 *
 * 🔴 GN imprime DOS inicios de actividades para el MISMO CUIT (BDI 22/07/2024, Zattia 01/04/2024). Un CUIT
 * tiene uno solo en ARCA ⇒ uno de los dos está mal en GN. Mientras no se confirme, cada marca imprime el
 * que ya imprimía GN (⛔ se elige uno a ciegas).
 */

import { CUIT_AREBEN } from './arca.core.js'

/**
 * @typedef {{ cuit: number, razonSocial: string|null, condicionIva: string|null, ingresosBrutos: string|null,
 *   marcas: Record<'bdi'|'zattia', { nombre: string, domicilio: string|null, inicioActividades: string|null }> }} Emisor
 */

/** @type {Emisor} */
export const EMISOR = {
  cuit: CUIT_AREBEN,
  razonSocial: 'AREBEN COMERCIAL SRL',
  condicionIva: 'IVA Responsable Inscripto', // emite A y B ⇒ inscripto
  ingresosBrutos: '0215303574',
  /** Por marca: el nombre que se ve arriba y el domicilio de su punto de venta. */
  marcas: {
    bdi: { nombre: 'BDI Accesorios', domicilio: 'Corrientes 763, Rosario, Santa Fe', inicioActividades: '22/07/2024' },
    zattia: { nombre: 'Zattia - Stunned', domicilio: null, inicioActividades: '01/04/2024' },
  },
}

/** Los datos del emisor que faltan para imprimir una factura de esa marca. Vacío = se puede. */
export function faltanDelEmisor(emisor, marca) {
  const m = emisor.marcas?.[marca]
  const faltan = []
  if (!emisor.cuit) faltan.push('CUIT')
  if (!emisor.razonSocial) faltan.push('razón social')
  if (!emisor.condicionIva) faltan.push('condición frente al IVA')
  if (!emisor.ingresosBrutos) faltan.push('Ingresos Brutos')
  if (!m) faltan.push(`la marca ${marca}`)
  else {
    if (!m.domicilio) faltan.push(`domicilio de ${m.nombre || marca}`)
    if (!m.inicioActividades) faltan.push(`inicio de actividades de ${m.nombre || marca}`)
  }
  return faltan
}
