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
 * Falta el domicilio del punto de venta de Zattia (PV 00005): sale de una factura de Zattia.
 */

import { CUIT_AREBEN } from './arca.core.js'

/**
 * @typedef {{ cuit: number, razonSocial: string|null, condicionIva: string|null, ingresosBrutos: string|null,
 *   inicioActividades: string|null, marcas: Record<'bdi'|'zattia', { nombre: string, domicilio: string|null }> }} Emisor
 */

/** @type {Emisor} */
export const EMISOR = {
  cuit: CUIT_AREBEN,
  razonSocial: 'AREBEN COMERCIAL SRL',
  condicionIva: 'IVA Responsable Inscripto', // emite A y B ⇒ inscripto
  ingresosBrutos: '0215303574',
  inicioActividades: '22/07/2024',
  /** Por marca: el nombre que se ve arriba y el domicilio de su punto de venta. */
  marcas: {
    bdi: { nombre: 'BDI Accesorios', domicilio: 'Corrientes 763, Rosario, Santa Fe' },
    zattia: { nombre: 'Zattia', domicilio: null },
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
  if (!emisor.inicioActividades) faltan.push('inicio de actividades')
  if (!m) faltan.push(`la marca ${marca}`)
  else if (!m.domicilio) faltan.push(`domicilio de ${m.nombre || marca}`)
  return faltan
}
