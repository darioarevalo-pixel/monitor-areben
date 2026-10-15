/**
 * El PDF de una factura del monitor, con el QR de ARCA (RG 4892). Se arma en el navegador, de la fila
 * de `facturas` tal como quedó autorizada: lo impreso es lo que se le mandó a ARCA, ⛔ la venta.
 *
 * `armarFacturaPdf` es el dibujo, sin imports dinámicos (lo prueba `tests/arca-factura-pdf.test.ts`
 * con el jsPDF real); `descargarFactura` le pone jsPDF, el QR y el compartir/descargar.
 *
 * 🔴 ⛔ Sale sin los datos del emisor (`motor/arca/emisor.core.js`): un dato fiscal mal impreso es peor
 * que ninguna factura. 🔴 Una de homologación sale con el sello «SIN VALIDEZ FISCAL».
 */

import { CBTE, COND_IVA, DOC } from '@/motor/arca/arca.core.js'
import { datosQR, urlQR } from '@/motor/arca/qr.core.js'
import { EMISOR, faltanDelEmisor } from '@/motor/arca/emisor.core.js'
import { compartirODescargarPDF } from '@/lib/pdf'

/** Una fila de `facturas` autorizada, como la devuelve `?recurso=erp&vista=facturas`. */
export type FacturaEmitida = {
  id: string
  ambiente: 'homologacion' | 'produccion'
  marca: 'bdi' | 'zattia'
  venta_id: string
  /** El número de la venta en GN, para el renglón (null si no se encontró). */
  venta_numero: string | null
  /** Las prendas de la venta en GN (`venta_detalles`). Se imprimen sólo si suman lo facturado. */
  renglones: Renglon[]
  tipo: number
  pto_vta: number
  numero: number
  fecha: string
  total: number
  neto: number
  iva: number
  doc_tipo: number
  doc_nro: number
  cond_iva: number
  estado: 'autorizada'
  cae: string
  cae_vence: string
  /** La razón social y el domicilio del receptor, de la ficha de la clienta (factura A). null si ⛔ hay ficha. */
  receptor_nombre?: string | null
  receptor_domicilio?: string | null
}

type Emisor = import('@/motor/arca/emisor.core.js').Emisor
export type Renglon = { descripcion: string; cantidad: number; unitario: number; importe: number }

/**
 * Qué renglones lleva la factura. Las prendas de la venta, como GN, cuando suman lo facturado (el 98% en
 * sep-2026: lo cobrado en cuentas Areben = el total de la venta). Si no suman —parte se cobró en una cuenta
 * propia, o la venta tiene un ajuste—, un renglón solo por lo facturado: el detalle ⛔ puede sumar más que la factura.
 */
export function renglonesDe(f: Pick<FacturaEmitida, 'renglones' | 'total' | 'venta_numero' | 'venta_id'>): Renglon[] {
  const suma = Math.round((f.renglones || []).reduce((a, r) => a + r.importe * 100, 0))
  if (f.renglones?.length && Math.abs(suma - Math.round(f.total * 100)) <= 1) return f.renglones
  return [{ descripcion: `Prendas de vestir y accesorios — venta ${f.venta_numero || f.venta_id}`, cantidad: 1, unitario: f.total, importe: f.total }]
}

const LETRA: Record<number, { letra: string; nombre: string }> = {
  [CBTE.FACTURA_A]: { letra: 'A', nombre: 'FACTURA' },
  [CBTE.NC_A]: { letra: 'A', nombre: 'NOTA DE CRÉDITO' },
  [CBTE.FACTURA_B]: { letra: 'B', nombre: 'FACTURA' },
  [CBTE.NC_B]: { letra: 'B', nombre: 'NOTA DE CRÉDITO' },
}
const COND_IVA_TXT: Record<number, string> = {
  [COND_IVA.RESPONSABLE_INSCRIPTO]: 'IVA Responsable Inscripto',
  [COND_IVA.EXENTO]: 'IVA Sujeto Exento',
  [COND_IVA.CONSUMIDOR_FINAL]: 'Consumidor Final',
  [COND_IVA.MONOTRIBUTO]: 'Responsable Monotributo',
}
const DOC_TXT: Record<number, string> = { [DOC.CUIT]: 'CUIT', [DOC.DNI]: 'DNI' }

const pesos = (n: number) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fechaAR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const cuitTxt = (c: number | string) => { const s = String(c); return `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` }

/** «00003-00000012»: así se nombra un comprobante. */
export const numeroComprobante = (f: Pick<FacturaEmitida, 'pto_vta' | 'numero'>) =>
  `${String(f.pto_vta).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`

export const nombreArchivo = (f: Pick<FacturaEmitida, 'tipo' | 'pto_vta' | 'numero' | 'marca'>) =>
  `factura-${(LETRA[f.tipo]?.letra || f.tipo)}-${numeroComprobante(f)}-${f.marca}.pdf`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsPdfCtor = new (o: { unit: 'mm'; format: 'a4'; compress: boolean }) => any

/**
 * El dibujo. `qrDataUrl` es el PNG del QR de `urlQR(datosQR(f))`. Tira error si falta un dato del
 * emisor o la factura no está autorizada.
 */
export function armarFacturaPdf({ f, emisor, qrDataUrl, JsPDF }: { f: FacturaEmitida; emisor: Emisor; qrDataUrl: string; JsPDF: JsPdfCtor }) {
  const faltan = faltanDelEmisor(emisor, f.marca)
  if (faltan.length) throw new Error(`Faltan datos del emisor para imprimir la factura: ${faltan.join(', ')}`)
  if (f.estado !== 'autorizada' || !f.cae) throw new Error('Sólo se imprime una factura autorizada (con CAE)')
  const cbte = LETRA[f.tipo]
  if (!cbte) throw new Error(`Tipo de comprobante no soportado: ${f.tipo}`)
  const marca = emisor.marcas[f.marca]

  const pdf = new JsPDF({ unit: 'mm', format: 'a4', compress: true })
  const M = 12, R = 198, MID = 105
  pdf.setDrawColor(0)
  pdf.setLineWidth(0.3)

  // ── Cabecera: emisor a la izquierda, comprobante a la derecha, la letra en el medio ──
  const top = 12, alto = 46
  pdf.rect(M, top, R - M, alto)
  pdf.line(MID, top + 14, MID, top + alto)
  pdf.rect(MID - 8, top, 16, 14)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22)
  pdf.text(cbte.letra, MID, top + 9, { align: 'center' })
  pdf.setFontSize(6)
  pdf.text(`COD. ${String(f.tipo).padStart(3, '0')}`, MID, top + 12.5, { align: 'center' })

  pdf.setFontSize(16)
  pdf.text(marca.nombre, M + 4, top + 10)
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal')
  let y = top + 22
  for (const [k, v] of [['Razón social', emisor.razonSocial], ['Domicilio comercial', marca.domicilio], ['Condición frente al IVA', emisor.condicionIva]] as const) {
    pdf.setFont('helvetica', 'bold'); pdf.text(`${k}:`, M + 4, y)
    const w = pdf.getTextWidth(`${k}: `) // medido en negrita, que es como sale la etiqueta
    pdf.setFont('helvetica', 'normal')
    const lineas = pdf.splitTextToSize(String(v), MID - M - 10 - w)
    pdf.text(lineas, M + 4 + w, y)
    y += 5 * lineas.length + 1
  }

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16)
  pdf.text(cbte.nombre, MID + 12, top + 10)
  pdf.setFontSize(9)
  y = top + 20
  for (const [k, v] of [
    ['Punto de venta / Comp. Nro', numeroComprobante(f)],
    ['Fecha de emisión', fechaAR(f.fecha)],
    ['CUIT', cuitTxt(emisor.cuit)],
    ['Ingresos Brutos', String(emisor.ingresosBrutos)],
    ['Inicio de actividades', String(marca.inicioActividades)],
  ]) {
    pdf.setFont('helvetica', 'bold'); pdf.text(`${k}:`, MID + 6, y)
    const w = pdf.getTextWidth(`${k}: `)
    pdf.setFont('helvetica', 'normal'); pdf.text(v, MID + 6 + w, y)
    y += 5
  }

  // ── Receptor ──
  y = top + alto + 4
  // La factura A lleva el nombre (razón social) y el domicilio del receptor: salen de la ficha de la clienta.
  const extras = ([['Razón social', f.receptor_nombre], ['Domicilio', f.receptor_domicilio]] as const).filter(([, v]) => v)
  pdf.rect(M, y, R - M, 14 + 5 * extras.length)
  const doc = DOC_TXT[f.doc_tipo]
  pdf.setFont('helvetica', 'bold'); pdf.text('Condición frente al IVA:', M + 4, y + 6)
  pdf.setFont('helvetica', 'normal'); pdf.text(COND_IVA_TXT[f.cond_iva] || String(f.cond_iva), M + 46, y + 6)
  pdf.setFont('helvetica', 'bold'); pdf.text(doc ? `${doc}:` : 'Receptor:', MID + 6, y + 6)
  const wDoc = pdf.getTextWidth(doc ? `${doc}: ` : 'Receptor: ')
  pdf.setFont('helvetica', 'normal')
  pdf.text(doc ? (f.doc_tipo === DOC.CUIT ? cuitTxt(f.doc_nro) : String(f.doc_nro)) : 'Consumidor final sin identificar', MID + 6 + wDoc, y + 6)
  pdf.setFont('helvetica', 'bold'); pdf.text('Condición de venta:', M + 4, y + 11)
  pdf.setFont('helvetica', 'normal'); pdf.text('Contado', M + 38, y + 11)
  extras.forEach(([k, v], i) => {
    pdf.setFont('helvetica', 'bold'); pdf.text(`${k}:`, M + 4, y + 16 + 5 * i)
    const w = pdf.getTextWidth(`${k}: `)
    pdf.setFont('helvetica', 'normal'); pdf.text(pdf.splitTextToSize(String(v), R - M - 8 - w)[0], M + 4 + w, y + 16 + 5 * i)
  })
  y += 5 * extras.length

  // ── El renglón: el monto facturado es lo cobrado en cuentas Areben, ⛔ el total de la venta ──
  y += 20
  const X = { desc: M + 2, cant: 128, unit: 160, sub: R - 2 }
  pdf.setFillColor(235); pdf.rect(M, y, R - M, 7, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.text('Descripción', X.desc, y + 5)
  pdf.text('Cant.', X.cant, y + 5, { align: 'right' })
  pdf.text('Precio unit.', X.unit, y + 5, { align: 'right' })
  pdf.text('Subtotal', X.sub, y + 5, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  y += 7
  for (const r of renglonesDe(f)) {
    // Una venta mayorista puede traer muchas prendas: lo que no entra arriba de los totales pasa de hoja.
    if (y > 190) { pdf.addPage(); y = 16 }
    const desc = pdf.splitTextToSize(r.descripcion, X.cant - X.desc - 14)
    y += 6
    pdf.text(desc, X.desc, y)
    pdf.text(String(r.cantidad), X.cant, y, { align: 'right' })
    pdf.text(pesos(r.unitario), X.unit, y, { align: 'right' })
    pdf.text(pesos(r.importe), X.sub, y, { align: 'right' })
    y += 5 * (desc.length - 1)
  }

  // ── Totales ──
  y = 200
  pdf.line(M, y, R, y)
  y += 8
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
  pdf.text('Importe total:', 150, y, { align: 'right' })
  pdf.text(pesos(f.total), R - 2, y, { align: 'right' })
  if (cbte.letra === 'B') {
    // Ley 27.743, Régimen de Transparencia Fiscal al Consumidor: la B a consumidor final muestra el IVA contenido.
    y += 8
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
    pdf.text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', M + 2, y)
    pdf.text(`IVA contenido: ${pesos(f.iva)} · Otros Imp. Nac. Indirectos: ${pesos(0)}`, R - 2, y, { align: 'right' })
  } else {
    y += 8
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
    pdf.text(`Neto gravado: ${pesos(f.neto)}   ·   IVA 21%: ${pesos(f.iva)}`, R - 2, y, { align: 'right' })
  }

  // ── Pie: QR, CAE y su vencimiento ──
  y = 240
  pdf.addImage(qrDataUrl, 'PNG', M, y, 34, 34)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11)
  pdf.text('Comprobante autorizado', M + 40, y + 8)
  pdf.setFontSize(10)
  pdf.text(`CAE N°: ${f.cae}`, R - 2, y + 8, { align: 'right' })
  pdf.text(`Fecha de vto. de CAE: ${fechaAR(f.cae_vence)}`, R - 2, y + 14, { align: 'right' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
  pdf.text('Esta factura se puede verificar escaneando el código QR en el sitio de ARCA.', M + 40, y + 14)

  if (f.ambiente !== 'produccion') {
    pdf.setTextColor(200, 0, 0)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(30)
    pdf.text('SIN VALIDEZ FISCAL', MID, 150, { align: 'center', angle: 20 })
    pdf.setFontSize(10)
    pdf.text('Factura de PRUEBA (homologación de ARCA)', MID, 6, { align: 'center' })
    pdf.setTextColor(0)
  }
  return pdf
}

/** Arma el PDF con jsPDF y el QR de verdad, y lo comparte (teléfono) o lo descarga. */
export async function descargarFactura(f: FacturaEmitida, emisor: Emisor = EMISOR): Promise<void> {
  const faltan = faltanDelEmisor(emisor, f.marca)
  if (faltan.length) throw new Error(`Faltan datos del emisor para imprimir la factura: ${faltan.join(', ')}`)
  const [{ jsPDF }, QR] = await Promise.all([import('jspdf'), import('qrcode')])
  const qrDataUrl = await QR.toDataURL(urlQR(datosQR(f)), { errorCorrectionLevel: 'M', margin: 0, width: 400 })
  const pdf = armarFacturaPdf({ f, emisor, qrDataUrl, JsPDF: jsPDF })
  await compartirODescargarPDF(pdf, nombreArchivo(f), `Factura ${numeroComprobante(f)}`)
}
