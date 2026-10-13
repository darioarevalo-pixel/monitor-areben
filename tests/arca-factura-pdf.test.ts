/**
 * El PDF de la factura con el QR de ARCA (RG 4892). El QR tiene que llevar EXACTAMENTE lo que se le
 * mandó a ARCA (la fila de `facturas`), y el PDF ⛔ sale sin los datos fiscales del emisor.
 */
import { describe, it, expect } from 'vitest'
import { jsPDF } from 'jspdf'
import QR from 'qrcode'
import { URL_QR, datosQR, urlQR } from '../lib/arca/qr.core.js'
import { EMISOR, faltanDelEmisor, type Emisor } from '../lib/arca/emisor.core.js'
import { armarFacturaPdf, nombreArchivo, numeroComprobante, type FacturaEmitida } from '../lib/arca/factura-pdf'

const F: FacturaEmitida = {
  id: 'f1', ambiente: 'homologacion', marca: 'zattia', venta_id: '1519771', venta_numero: '30437',
  tipo: 6, pto_vta: 2, numero: 12, fecha: '2026-10-13', total: 12000, neto: 9917.36, iva: 2082.64,
  doc_tipo: 99, doc_nro: 0, cond_iva: 5, estado: 'autorizada', cae: '86417453677227', cae_vence: '2026-10-23',
}
const EMISOR_COMPLETO: Emisor = {
  ...EMISOR,
  razonSocial: 'RAZON SOCIAL DE PRUEBA', ingresosBrutos: '000-000000-0',
  marcas: { bdi: { nombre: 'BDI', domicilio: 'Calle 1', inicioActividades: '01/01/2020' }, zattia: { nombre: 'Zattia', domicilio: 'Calle 2', inicioActividades: '01/01/2020' } },
}
/** El PDF real sale comprimido; el de la prueba no, para poder buscar el texto adentro. */
class SinComprimir extends jsPDF { constructor(o: { unit: 'mm'; format: 'a4'; compress: boolean }) { super({ ...o, compress: false }) } }
const decodificar = (url: string) => JSON.parse(atob(url.slice(URL_QR.length)))

describe('QR de ARCA', () => {
  it('lleva los datos de la fila tal como se mandaron, en el formato de la especificación', () => {
    const url = urlQR(datosQR(F))
    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true)
    expect(decodificar(url)).toEqual({
      ver: 1, fecha: '2026-10-13', cuit: 30718508181, ptoVta: 2, tipoCmp: 6, nroCmp: 12, importe: 12000,
      moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: 86417453677227,
    })
  })
  it('el orden de los campos es el del ejemplo de ARCA', () => {
    expect(Object.keys(datosQR(F))).toEqual(['ver', 'fecha', 'cuit', 'ptoVta', 'tipoCmp', 'nroCmp', 'importe', 'moneda', 'ctz', 'tipoDocRec', 'nroDocRec', 'tipoCodAut', 'codAut'])
  })
  it('los números que vienen de la base como texto salen como números, con centavos', () => {
    const d = datosQR({ ...F, total: '1234.50', numero: '7', cae: '123', fecha: '2026-10-01T00:00:00Z' } as unknown as FacturaEmitida)
    expect(d).toMatchObject({ importe: 1234.5, nroCmp: 7, codAut: 123, fecha: '2026-10-01' })
  })
  it('sin CAE ⛔ hay QR', () => {
    expect(() => datosQR({ ...F, estado: 'reservada' } as unknown as FacturaEmitida)).toThrow(/autorizada/)
    expect(() => datosQR({ ...F, cae: '' })).toThrow(/autorizada/)
  })
})

describe('datos del emisor', () => {
  it('hoy falta sólo el domicilio de Zattia (su factura de GN ⛔ lo imprime, ⛔ se inventa)', () => {
    expect(faltanDelEmisor(EMISOR, 'zattia')).toEqual(['domicilio de Zattia - Stunned'])
    expect(faltanDelEmisor(EMISOR, 'bdi')).toEqual([])
  })
  it('un dato fiscal en null frena', () => {
    expect(faltanDelEmisor({ ...EMISOR, ingresosBrutos: null }, 'bdi')).toEqual(['Ingresos Brutos'])
    expect(faltanDelEmisor({ ...EMISOR, marcas: { ...EMISOR.marcas, bdi: { ...EMISOR.marcas.bdi, inicioActividades: null } } }, 'bdi')).toEqual(['inicio de actividades de BDI Accesorios'])
  })
  it('completos, no falta nada', () => {
    expect(faltanDelEmisor(EMISOR_COMPLETO, 'bdi')).toEqual([])
  })
})

describe('el PDF', () => {
  const armar = async (f: FacturaEmitida, emisor: Emisor = EMISOR_COMPLETO) => {
    const qrDataUrl = await QR.toDataURL(urlQR(datosQR(f)), { margin: 0 })
    return armarFacturaPdf({ f, emisor, qrDataUrl, JsPDF: SinComprimir }).output() as string
  }
  it('lleva el comprobante, el CAE, su vencimiento y el QR', async () => {
    const out = await armar({ ...F, ambiente: 'produccion' })
    expect(out).toContain('00002-00000012')
    expect(out).toContain('86417453677227')
    expect(out).toContain('23/10/2026')
    expect(out).toContain('30-71850818-1')
    expect(out).toContain('/Subtype /Image')
    expect(out).not.toContain('SIN VALIDEZ FISCAL')
  })
  it('una de homologación sale sellada SIN VALIDEZ FISCAL', async () => {
    expect(await armar(F)).toContain('SIN VALIDEZ FISCAL')
  })
  it('⛔ sale sin los datos del emisor', async () => {
    await expect(armar(F, EMISOR)).rejects.toThrow(/domicilio de Zattia - Stunned/)
  })
  it('nombra el archivo por letra, número y marca', () => {
    expect(numeroComprobante(F)).toBe('00002-00000012')
    expect(nombreArchivo(F)).toBe('factura-B-00002-00000012-zattia.pdf')
  })
})
