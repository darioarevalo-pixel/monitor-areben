/**
 * Facturación con ARCA — el núcleo puro y la firma.
 *
 * Lo que se testea es lo que ARCA ⛔ avisa o lo que no se deshace:
 *  - neto + IVA = total al centavo (si no, rechaza el comprobante);
 *  - el ORDEN de los elementos del detalle (el servicio .NET ignora callado uno fuera de orden);
 *  - que una factura mal armada no salga (una con CAE sólo se corrige con nota de crédito);
 *  - que un corte sin respuesta no se reintente a ciegas (duplica la factura).
 * El oráculo de verdad es un CAE en homologación: esto no lo reemplaza.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CBTE, COND_IVA, DOC, cuitValido, desglosarIVA, detalleXml, fechaArca, leerCAE, leerConsulta,
  leerTA, leerUltimo, loteXml, numeroVisible, problemasDe, reconciliar, tags, taVigente, traXml, urlQR,
} from '../lib/arca/arca.core.js'
import { firmarTRA } from '../api/_arca.js'

const CF = { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL }
const REGLAS = { umbralIdentificar: 10_000_000, hoy: '2026-10-12' }
const facturaB = (total: number, extra = {}) => ({ tipo: CBTE.FACTURA_B, fecha: '2026-10-12', total, receptor: CF, ...extra })

describe('desglosarIVA', () => {
  it('neto + IVA da el total exacto, en todos los montos de un mes', () => {
    for (let c = 1; c < 3_000_000; c += 997) {
      const { total, neto, iva } = desglosarIVA(c / 100)
      expect(Math.round(neto * 100) + Math.round(iva * 100)).toBe(c)
      expect(Math.abs(neto * 0.21 - iva)).toBeLessThanOrEqual(0.01)
      expect(total).toBe(c / 100)
    }
  })
  it('el caso mediano de septiembre', () => {
    expect(desglosarIVA(27000)).toEqual({ total: 27000, neto: 22314.05, iva: 4685.95 })
  })
  it('rechaza cero y negativos', () => {
    expect(() => desglosarIVA(0)).toThrow()
    expect(() => desglosarIVA(-5)).toThrow()
  })
})

describe('cuitValido', () => {
  it('el de Areben', () => expect(cuitValido(30718508181)).toBe(true))
  it('un dígito cambiado', () => expect(cuitValido(30718508182)).toBe(false))
  it('con guiones', () => expect(cuitValido('30-71850818-1')).toBe(true))
})

describe('problemasDe', () => {
  it('una B a consumidor final sale', () => expect(problemasDe(facturaB(27000), REGLAS)).toEqual([]))
  it('el umbral es obligatorio', () => {
    expect(() => problemasDe(facturaB(1), { hoy: '2026-10-12' } as never)).toThrow('umbralIdentificar')
  })
  it('desde el umbral, sin identificar no sale', () => {
    expect(problemasDe(facturaB(10_000_000), REGLAS).join()).toMatch(/DNI o CUIT/)
    expect(problemasDe(facturaB(10_000_000, { receptor: { docTipo: DOC.DNI, docNro: '30111222', condicionIva: COND_IVA.CONSUMIDOR_FINAL } }), REGLAS)).toEqual([])
  })
  it('la A pide CUIT válido y responsable inscripto o monotributo', () => {
    const a = { tipo: CBTE.FACTURA_A, fecha: '2026-10-12', total: 100 }
    expect(problemasDe({ ...a, receptor: CF }, REGLAS).length).toBeGreaterThan(0)
    expect(problemasDe({ ...a, receptor: { docTipo: DOC.CUIT, docNro: 30718508181, condicionIva: COND_IVA.RESPONSABLE_INSCRIPTO } }, REGLAS)).toEqual([])
  })
  it('a un responsable inscripto no se le hace B', () => {
    expect(problemasDe(facturaB(100, { receptor: { docTipo: DOC.CUIT, docNro: 30718508181, condicionIva: COND_IVA.RESPONSABLE_INSCRIPTO } }), REGLAS).join()).toMatch(/factura A/)
  })
  it('más de 5 días de distancia no sale', () => {
    expect(problemasDe(facturaB(100, { fecha: '2026-10-01' }), REGLAS).join()).toMatch(/5 días/)
  })
  it('la nota de crédito tiene que decir qué anula, y de su misma clase', () => {
    const nc = { tipo: CBTE.NC_B, fecha: '2026-10-12', total: 100, receptor: CF }
    expect(problemasDe(nc, REGLAS).join()).toMatch(/qué factura/)
    expect(problemasDe({ ...nc, asociado: { tipo: CBTE.FACTURA_A, ptoVta: 12, numero: 3, fecha: '2026-10-10' } }, REGLAS).join()).toMatch(/misma clase/)
    expect(problemasDe({ ...nc, asociado: { tipo: CBTE.FACTURA_B, ptoVta: 12, numero: 3, fecha: '2026-10-10' } }, REGLAS)).toEqual([])
  })
})

describe('el XML', () => {
  // El orden del WSDL de producción, bajado el 12-oct-2026 (sólo los que mandamos).
  const ORDEN = ['Concepto', 'DocTipo', 'DocNro', 'CbteDesde', 'CbteHasta', 'CbteFch', 'ImpTotal', 'ImpTotConc',
    'ImpNeto', 'ImpOpEx', 'ImpTrib', 'ImpIVA', 'MonId', 'MonCotiz', 'CondicionIVAReceptorId', 'CbtesAsoc', 'Iva']

  it('el detalle respeta el orden del WSDL', () => {
    const xml = detalleXml({ ...facturaB(100), tipo: CBTE.NC_B, asociado: { tipo: CBTE.FACTURA_B, ptoVta: 12, numero: 7, fecha: '2026-10-10' } }, 9)
    const hijos = [...xml.replace(/^<ar:FECAEDetRequest>|<\/ar:FECAEDetRequest>$/g, '').matchAll(/<ar:(\w+)>(?:[^<]*<\/ar:\1>|[\s\S]*?<\/ar:\1>)/g)].map((m) => m[1])
    expect(hijos).toEqual(ORDEN)
  })
  it('los importes salen con dos decimales y la fecha como ARCA', () => {
    const xml = detalleXml(facturaB(27000), 1)
    expect(xml).toContain('<ar:ImpTotal>27000.00</ar:ImpTotal>')
    expect(xml).toContain('<ar:ImpNeto>22314.05</ar:ImpNeto>')
    expect(xml).toContain('<ar:ImpIVA>4685.95</ar:ImpIVA>')
    expect(xml).toContain('<ar:CbteFch>20261012</ar:CbteFch>')
  })
  it('el lote numera correlativo desde el último + 1', () => {
    const xml = loteXml({ ptoVta: 12, tipo: CBTE.FACTURA_B, desde: 41, comprobantes: [facturaB(1), facturaB(2), facturaB(3)] })
    expect(xml).toContain('<ar:CantReg>3</ar:CantReg>')
    expect(tags(xml, 'CbteDesde')).toEqual(['41', '42', '43'])
  })
  it('un lote no mezcla tipos', () => {
    expect(() => loteXml({ ptoVta: 12, tipo: CBTE.FACTURA_B, desde: 1, comprobantes: [facturaB(1), { ...facturaB(1), tipo: CBTE.FACTURA_A }] })).toThrow()
  })
  it('el TRA cubre 10 minutos para cada lado', () => {
    const xml = traXml({ servicio: 'wsfe', ahora: new Date('2026-10-12T15:00:00Z') })
    expect(xml).toContain('<generationTime>2026-10-12T14:50:00Z</generationTime>')
    expect(xml).toContain('<expirationTime>2026-10-12T15:10:00Z</expirationTime>')
    expect(xml).toContain('<service>wsfe</service>')
  })
  it('fechaArca rechaza lo que no es una fecha', () => expect(() => fechaArca('12/10/2026')).toThrow())
})

describe('leer las respuestas', () => {
  it('el TA viene escapado adentro de loginCmsReturn', () => {
    const ta = '<?xml version="1.0"?><loginTicketResponse><header><expirationTime>2026-10-13T03:00:00.000-03:00</expirationTime></header><credentials><token>TOK</token><sign>SIG</sign></credentials></loginTicketResponse>'
    const xml = `<soapenv:Envelope><soapenv:Body><loginCmsResponse><loginCmsReturn>${ta.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`
    expect(leerTA(xml)).toEqual({ token: 'TOK', sign: 'SIG', vence: '2026-10-13T06:00:00.000Z' })
  })
  it('el login repetido es un Fault y se dice', () => {
    expect(() => leerTA('<soapenv:Fault><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soapenv:Fault>')).toThrow(/TA valido/)
  })
  it('taVigente deja 10 minutos de margen', () => {
    const ahora = new Date('2026-10-12T15:00:00Z')
    expect(taVigente({ vence: '2026-10-12T15:30:00Z' }, ahora)).toBe(true)
    expect(taVigente({ vence: '2026-10-12T15:05:00Z' }, ahora)).toBe(false)
    expect(taVigente(null, ahora)).toBe(false)
  })
  it('último autorizado', () => {
    expect(leerUltimo('<FECompUltimoAutorizadoResult><PtoVta>12</PtoVta><CbteTipo>6</CbteTipo><CbteNro>40</CbteNro></FECompUltimoAutorizadoResult>')).toBe(40)
    expect(() => leerUltimo('<Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No aparecio CUIT</Msg></Err></Errors>')).toThrow(/600/)
  })
  it('un lote parcial: cada detalle con lo suyo', () => {
    const xml = '<FECAESolicitarResult><FeCabResp><Cuit>30718508181</Cuit><PtoVta>12</PtoVta><CbteTipo>6</CbteTipo><Resultado>P</Resultado></FeCabResp><FeDetResp>'
      + '<FECAEDetResponse><CbteDesde>41</CbteDesde><Resultado>A</Resultado><CAE>76123456789012</CAE><CAEFchVto>20261022</CAEFchVto></FECAEDetResponse>'
      + '<FECAEDetResponse><CbteDesde>42</CbteDesde><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>DocNro invalido</Msg></Obs></Observaciones><CAE></CAE></FECAEDetResponse>'
      + '</FeDetResp></FECAESolicitarResult>'
    const r = leerCAE(xml)
    expect(r.resultado).toBe('P')
    expect(r.detalles[0]).toMatchObject({ numero: 41, resultado: 'A', cae: '76123456789012', caeVence: '2026-10-22' })
    expect(r.detalles[1]).toMatchObject({ numero: 42, resultado: 'R', cae: null, observaciones: [{ codigo: 10015, mensaje: 'DocNro invalido' }] })
  })
  it('consultar un número que no existe es null, no error', () => {
    expect(leerConsulta('<FECompConsultarResult><Errors><Err><Code>602</Code><Msg>No existen datos</Msg></Err></Errors></FECompConsultarResult>')).toBeNull()
  })
})

describe('reconciliar (se cortó antes de la respuesta)', () => {
  const r = (numero: number, total: number) => ({ numero, total, fecha: '2026-10-12', docTipo: 99, docNro: 0 })
  const reg = (numero: number, total: number) => ({ numero, total, fecha: '2026-10-12', docTipo: 99, docNro: 0, resultado: 'A', cae: 'C' + numero, caeVence: '2026-10-22' })
  it('separa lo que salió, lo que no, y lo que es de otro', () => {
    const out = reconciliar([r(41, 100), r(42, 200), r(43, 300)], new Map([[41, reg(41, 100)], [42, reg(42, 999)]]))
    expect(out.autorizados.map((x) => x.numero)).toEqual([41])
    expect(out.autorizados[0].cae).toBe('C41')
    expect(out.ajenos.map((x) => x.reservado.numero)).toEqual([42])
    expect(out.faltan.map((x) => x.numero)).toEqual([43])
  })
})

describe('QR y número', () => {
  it('el QR lleva los datos que pide la RG 4892', () => {
    const url = urlQR({ fecha: '2026-10-12', cuit: 30718508181, ptoVta: 12, tipo: 6, numero: 41, total: 27000, docTipo: 99, docNro: 0, cae: '76123456789012' })
    const datos = JSON.parse(Buffer.from(url.split('?p=')[1], 'base64').toString())
    expect(datos).toEqual({ ver: 1, fecha: '2026-10-12', cuit: 30718508181, ptoVta: 12, tipoCmp: 6, nroCmp: 41, importe: 27000, moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: 76123456789012 })
  })
  it('el número como lo muestra GN', () => expect(numeroVisible(6, 2, 12132)).toBe('B 00002-00012132'))
})

describe('firmarTRA', () => {
  // El oráculo es openssl, ⛔ node-forge: el que firma no puede ser el que verifica.
  const hayOpenssl = (() => { try { execFileSync('openssl', ['version']); return true } catch { return false } })()
  it.skipIf(!hayOpenssl)('openssl verifica la firma y saca el TRA intacto', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arca-'))
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'),
      '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=monitor-test'], { stdio: 'ignore' })
    const tra = traXml({ servicio: 'wsfe', ahora: new Date('2026-10-12T15:00:00Z') })
    const b64 = firmarTRA(tra, readFileSync(join(dir, 'c.pem'), 'utf8'), readFileSync(join(dir, 'k.pem'), 'utf8'))
    writeFileSync(join(dir, 'cms.der'), Buffer.from(b64, 'base64'))
    const salida = execFileSync('openssl', ['cms', '-verify', '-inform', 'DER', '-in', join(dir, 'cms.der'),
      '-CAfile', join(dir, 'c.pem')], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    expect(salida).toBe(tra)
  })
})
