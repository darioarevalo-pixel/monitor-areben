/**
 * El QR de una factura electrónica (RG 4892 de ARCA, ex AFIP). Puro: arma el texto que va adentro
 * del QR; el dibujo lo hace `lib/arca/factura-pdf.ts`.
 *
 * El QR es una URL de ARCA con los datos del comprobante en JSON y base64. Quien lo escanea ve en la
 * página de ARCA si el CAE es de verdad de ese comprobante ⇒ cada dato tiene que ser EL QUE SE LE
 * MANDÓ a ARCA: sale de la fila de `facturas`, ⛔ de la venta.
 *
 * Especificación: https://www.afip.gob.ar/fe/qr/especificaciones.asp (versión 1). El orden y los
 * nombres de los campos son los del ejemplo de ARCA.
 */

import { CUIT_AREBEN } from './arca.core.js'

export const URL_QR = 'https://www.afip.gob.ar/fe/qr/?p='

/**
 * Los datos del QR de una factura autorizada (una fila de `facturas`).
 * Sin CAE ⛔ hay QR: una factura reservada o rechazada no es un comprobante.
 */
export function datosQR(f, cuit = CUIT_AREBEN) {
  if (f.estado !== 'autorizada' || !f.cae || f.numero == null) throw new Error('Sólo una factura autorizada (con CAE) lleva QR')
  const fecha = typeof f.fecha === 'string' ? f.fecha.slice(0, 10) : new Date(f.fecha).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: ${f.fecha}`)
  return {
    ver: 1,
    fecha,
    cuit: Number(cuit),
    ptoVta: Number(f.pto_vta),
    tipoCmp: Number(f.tipo),
    nroCmp: Number(f.numero),
    importe: Math.round(Number(f.total) * 100) / 100,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: Number(f.doc_tipo),
    nroDocRec: Number(f.doc_nro),
    tipoCodAut: 'E', // E = CAE (A sería CAEA)
    codAut: Number(f.cae),
  }
}

/** La URL que va adentro del QR. `btoa` existe en el navegador y en Node ≥16; el JSON es ASCII. */
export function urlQR(datos) {
  return URL_QR + btoa(JSON.stringify(datos))
}
