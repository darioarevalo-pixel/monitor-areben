/**
 * Facturación electrónica con ARCA (ex AFIP) — el dominio puro: arma lo que se manda y lee lo que
 * vuelve. Sin red ni certificado: eso vive en `api/_arca.js`.
 *
 * Es `.js` plano por lo mismo que `lib/permisos.core.js`: lo importa un handler de `api/` que corre
 * en Node sin pasar por el compilador de Next.
 *
 * Cómo se factura hoy (medido 12-oct-2026, `~/Documents/erp-monitor/mediciones/2026-10-12-facturacion.md`):
 * ~650 por mes, 97% B, un CUIT (Areben) y un punto de venta por marca. Se factura un LOTE ELEGIDO
 * hasta el techo de lo cobrado en cuentas Areben — no «toda venta».
 *
 * 🔴 Una factura con CAE ⛔ se borra: sólo se corrige con nota de crédito. Por eso todo lo que
 * puede salir mal se valida ACÁ, antes de que salga el pedido.
 */

export const AMBIENTES = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
}

export const CUIT_AREBEN = 30718508181

/**
 * 🔴 EL FRENO: contra qué ARCA se factura. Por defecto, homologación (facturas de prueba, sin valor).
 * Producción emite facturas REALES y pide DOS variables a propósito: `ARCA_AMBIENTE=produccion` y
 * `ARCA_PRODUCCION_HABILITADA=si`, que la carga Bruno cuando lo decida. Pedir producción sin la
 * segunda ⛔ cae callado a homologación: tira error, porque quien la pidió creería que facturó.
 */
export function ambienteDeEntorno(env) {
  const pedido = env.ARCA_AMBIENTE || 'homologacion'
  if (pedido === 'homologacion') return 'homologacion'
  if (pedido !== 'produccion') throw new Error(`ARCA_AMBIENTE inválido: ${pedido}`)
  if (env.ARCA_PRODUCCION_HABILITADA !== 'si') {
    throw new Error('Facturación real APAGADA: falta ARCA_PRODUCCION_HABILITADA=si (la habilita Bruno)')
  }
  return 'produccion'
}

/** Tipos de comprobante (`FEParamGetTiposCbte`). */
export const CBTE = { FACTURA_A: 1, NC_A: 3, FACTURA_B: 6, NC_B: 8 }
const CLASE = { 1: 'A', 3: 'A', 6: 'B', 8: 'B' }
const ES_NC = { 3: true, 8: true }

/** Tipos de documento del receptor (`FEParamGetTiposDoc`). */
export const DOC = { CUIT: 80, DNI: 96, SIN_IDENTIFICAR: 99 }

/** Condición frente al IVA del receptor (`FEParamGetCondicionIvaReceptor`, obligatoria desde la RG 5616). */
export const COND_IVA = { RESPONSABLE_INSCRIPTO: 1, EXENTO: 4, CONSUMIDOR_FINAL: 5, MONOTRIBUTO: 6 }
const COND_IVA_CLASE_A = new Set([COND_IVA.RESPONSABLE_INSCRIPTO, COND_IVA.MONOTRIBUTO])

const IVA_21 = 5 // Id de alícuota 21% (`FEParamGetTiposIva`)

// ─── Fechas ────────────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → 'YYYYMMDD', que es como ARCA escribe las fechas. */
export function fechaArca(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Fecha inválida: ${iso}`)
  return iso.replaceAll('-', '')
}

/** 'YYYYMMDD' → 'YYYY-MM-DD'. */
export function fechaIso(arca) {
  const s = String(arca || '')
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null
}

// ─── Importes ──────────────────────────────────────────────────────────────────────────────

const aCentavos = (n) => Math.round(Number(n) * 100)
const aPesos = (c) => c / 100

/**
 * Del total con IVA incluido, el neto y el IVA al 21%. En centavos enteros, para que
 * neto + iva = total EXACTO: ARCA rechaza el comprobante si la suma no da al centavo.
 */
export function desglosarIVA(total) {
  const t = aCentavos(total)
  if (!Number.isFinite(t) || t <= 0) throw new Error(`Total inválido: ${total}`)
  const neto = Math.round(t / 1.21)
  return { total: aPesos(t), neto: aPesos(neto), iva: aPesos(t - neto) }
}

// ─── El comprobante ────────────────────────────────────────────────────────────────────────

/**
 * Valida un comprobante antes de pedirle el CAE. Devuelve la lista de problemas (vacía = sale).
 *
 * `umbralIdentificar` es OBLIGATORIO y no tiene default: es el monto desde el que una factura B a
 * consumidor final tiene que llevar DNI, lo fija ARCA y cambia. Que lo diga quien llama.
 *
 * @param {{ tipo: number, fecha: string, total: number,
 *           receptor: { docTipo: number, docNro: number|string, condicionIva: number },
 *           asociado?: { tipo: number, ptoVta: number, numero: number, fecha: string } }} c
 * @param {{ umbralIdentificar: number, hoy: string }} reglas
 */
export function problemasDe(c, { umbralIdentificar, hoy }) {
  if (!(umbralIdentificar > 0)) throw new Error('Falta umbralIdentificar')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy || '')) throw new Error('Falta hoy (YYYY-MM-DD)')
  const p = []
  const clase = CLASE[c.tipo]
  if (!clase) return [`Tipo de comprobante no soportado: ${c.tipo}`]
  if (!(Number(c.total) > 0)) p.push('El total tiene que ser mayor a 0')
  const r = c.receptor || {}
  if (!Object.values(COND_IVA).includes(r.condicionIva)) p.push('Falta la condición de IVA del receptor')

  if (clase === 'A') {
    if (r.docTipo !== DOC.CUIT || !cuitValido(r.docNro)) p.push('La factura A necesita el CUIT del cliente (válido)')
    if (!COND_IVA_CLASE_A.has(r.condicionIva)) p.push('La factura A es para responsable inscripto o monotributista')
  } else {
    if (COND_IVA_CLASE_A.has(r.condicionIva)) p.push('Un responsable inscripto o monotributista lleva factura A, no B')
    if (r.docTipo === DOC.SIN_IDENTIFICAR) {
      if (Number(r.docNro) !== 0) p.push('Sin identificar va con documento 0')
      if (Number(c.total) >= umbralIdentificar) p.push(`Desde $${umbralIdentificar} la factura B necesita el DNI o CUIT del cliente`)
    } else if (r.docTipo === DOC.CUIT) {
      if (!cuitValido(r.docNro)) p.push('CUIT inválido')
    } else if (r.docTipo === DOC.DNI) {
      if (!/^\d{7,8}$/.test(String(r.docNro))) p.push('DNI inválido')
    } else p.push(`Tipo de documento no soportado: ${r.docTipo}`)
  }

  // Concepto 1 (productos): ARCA acepta hasta 5 días antes o después de hoy.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha || '')) p.push('Fecha inválida')
  else if (Math.abs(Date.parse(c.fecha) - Date.parse(hoy)) / 86_400_000 > 5) {
    p.push('La fecha del comprobante tiene que estar a 5 días de hoy como mucho')
  }

  if (ES_NC[c.tipo]) {
    const a = c.asociado
    if (!a) p.push('La nota de crédito tiene que decir qué factura anula')
    else if (CLASE[a.tipo] !== clase || ES_NC[a.tipo]) p.push('La nota de crédito anula una factura de su misma clase')
  }
  return p
}

/** Dígito verificador del CUIT. */
export function cuitValido(cuit) {
  const s = String(cuit ?? '').replace(/\D/g, '')
  if (s.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, w, i) => acc + w * Number(s[i]), 0)
  let dv = 11 - (suma % 11)
  if (dv === 11) dv = 0
  if (dv === 10) return false
  return dv === Number(s[10])
}

// ─── El XML ────────────────────────────────────────────────────────────────────────────────

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const monto = (n) => Number(n).toFixed(2)

/**
 * Un `FECAEDetRequest`. 🔴 El ORDEN de los elementos es el del WSDL (bajado el 12-oct-2026):
 * el servicio es .NET y un elemento fuera de orden se IGNORA callado, no da error.
 */
export function detalleXml(c, numero) {
  const { total, neto, iva } = desglosarIVA(c.total)
  const r = c.receptor
  const a = c.asociado
  return '<ar:FECAEDetRequest>'
    + '<ar:Concepto>1</ar:Concepto>'
    + `<ar:DocTipo>${r.docTipo}</ar:DocTipo>`
    + `<ar:DocNro>${Number(r.docNro)}</ar:DocNro>`
    + `<ar:CbteDesde>${numero}</ar:CbteDesde>`
    + `<ar:CbteHasta>${numero}</ar:CbteHasta>`
    + `<ar:CbteFch>${fechaArca(c.fecha)}</ar:CbteFch>`
    + `<ar:ImpTotal>${monto(total)}</ar:ImpTotal>`
    + '<ar:ImpTotConc>0.00</ar:ImpTotConc>'
    + `<ar:ImpNeto>${monto(neto)}</ar:ImpNeto>`
    + '<ar:ImpOpEx>0.00</ar:ImpOpEx>'
    + '<ar:ImpTrib>0.00</ar:ImpTrib>'
    + `<ar:ImpIVA>${monto(iva)}</ar:ImpIVA>`
    + '<ar:MonId>PES</ar:MonId>'
    + '<ar:MonCotiz>1</ar:MonCotiz>'
    + `<ar:CondicionIVAReceptorId>${r.condicionIva}</ar:CondicionIVAReceptorId>`
    + (a
      ? '<ar:CbtesAsoc><ar:CbteAsoc>'
        + `<ar:Tipo>${a.tipo}</ar:Tipo><ar:PtoVta>${a.ptoVta}</ar:PtoVta><ar:Nro>${a.numero}</ar:Nro>`
        + `<ar:CbteFch>${fechaArca(a.fecha)}</ar:CbteFch>`
        + '</ar:CbteAsoc></ar:CbtesAsoc>'
      : '')
    + `<ar:Iva><ar:AlicIva><ar:Id>${IVA_21}</ar:Id><ar:BaseImp>${monto(neto)}</ar:BaseImp><ar:Importe>${monto(iva)}</ar:Importe></ar:AlicIva></ar:Iva>`
    + '</ar:FECAEDetRequest>'
}

/**
 * El `FeCAEReq` de un lote: mismo tipo y punto de venta, números CORRELATIVOS desde `desde`
 * (que es el último autorizado + 1: la numeración la lleva ARCA y no admite huecos).
 */
export function loteXml({ ptoVta, tipo, desde, comprobantes }) {
  if (!comprobantes.length) throw new Error('Lote vacío')
  if (comprobantes.some((c) => c.tipo !== tipo)) throw new Error('Un lote lleva un solo tipo de comprobante')
  return '<ar:FeCAEReq>'
    + `<ar:FeCabReq><ar:CantReg>${comprobantes.length}</ar:CantReg><ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo></ar:FeCabReq>`
    + `<ar:FeDetReq>${comprobantes.map((c, i) => detalleXml(c, desde + i)).join('')}</ar:FeDetReq>`
    + '</ar:FeCAEReq>'
}

export function authXml({ token, sign, cuit }) {
  return `<ar:Auth><ar:Token>${x(token)}</ar:Token><ar:Sign>${x(sign)}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`
}

/** El sobre SOAP de una operación de WSFE. */
export function sobreWsfe(operacion, cuerpo) {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">'
    + `<soapenv:Header/><soapenv:Body><ar:${operacion}>${cuerpo}</ar:${operacion}></soapenv:Body></soapenv:Envelope>`
}

/**
 * El pedido de acceso (TRA) que se firma para WSAA. Vale 10 minutos para atrás y adelante:
 * el reloj de Vercel y el de ARCA no son el mismo.
 */
export function traXml({ servicio, ahora }) {
  const t = ahora.getTime()
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<loginTicketRequest version="1.0"><header>'
    + `<uniqueId>${Math.floor(t / 1000)}</uniqueId>`
    + `<generationTime>${iso(t - 10 * 60_000)}</generationTime>`
    + `<expirationTime>${iso(t + 10 * 60_000)}</expirationTime>`
    + `</header><service>${servicio}</service></loginTicketRequest>`
}

export function sobreWsaa(cmsBase64) {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">'
    + `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cmsBase64}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`
}

// ─── Leer lo que vuelve ────────────────────────────────────────────────────────────────────

const desescapar = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Todos los `<nombre>…</nombre>` (con o sin prefijo de namespace). */
export function tags(xml, nombre) {
  const re = new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, 'g')
  return [...String(xml).matchAll(re)].map((m) => m[1])
}
export const tag = (xml, nombre) => tags(xml, nombre)[0] ?? null

const codigos = (xml, cont, item) =>
  tags(tag(xml, cont) || '', item).map((b) => ({ codigo: Number(tag(b, 'Code')), mensaje: desescapar(tag(b, 'Msg') || '') }))

/** El SOAP Fault, si vino uno. */
export function falla(xml) {
  const f = tag(xml, 'Fault')
  return f ? desescapar(tag(f, 'faultstring') || 'Falla SOAP') : null
}

/** La respuesta de WSAA → el ticket de acceso. */
export function leerTA(xml) {
  const f = falla(xml)
  if (f) throw new Error(`WSAA: ${f}`)
  const ta = desescapar(tag(xml, 'loginCmsReturn') || '')
  const token = tag(ta, 'token'), sign = tag(ta, 'sign'), vence = tag(ta, 'expirationTime')
  if (!token || !sign || !vence) throw new Error('WSAA respondió sin token')
  return { token, sign, vence: new Date(vence).toISOString() }
}

/** El TA sirve si le quedan más de 10 minutos. */
export const taVigente = (ta, ahora) => !!ta && Date.parse(ta.vence) - ahora.getTime() > 10 * 60_000

export function leerUltimo(xml) {
  const f = falla(xml)
  if (f) throw new Error(`WSFE: ${f}`)
  const errores = codigos(xml, 'Errors', 'Err')
  if (errores.length) throw new Error(`WSFE: ${errores.map((e) => `${e.codigo} ${e.mensaje}`).join(' · ')}`)
  return Number(tag(xml, 'CbteNro'))
}

/**
 * La respuesta de `FECAESolicitar`. `resultado`: A (aprobado), R (rechazado), P (parcial: en un
 * lote, algunos sí y otros no — cada detalle trae el suyo).
 */
export function leerCAE(xml) {
  const f = falla(xml)
  if (f) throw new Error(`WSFE: ${f}`)
  const cab = tag(xml, 'FeCabResp') || ''
  return {
    resultado: tag(cab, 'Resultado'),
    errores: codigos(xml, 'Errors', 'Err'),
    eventos: codigos(xml, 'Events', 'Evt'),
    detalles: tags(tag(xml, 'FeDetResp') || '', 'FECAEDetResponse').map((d) => ({
      numero: Number(tag(d, 'CbteDesde')),
      resultado: tag(d, 'Resultado'),
      cae: tag(d, 'CAE') || null,
      caeVence: fechaIso(tag(d, 'CAEFchVto')),
      observaciones: codigos(d, 'Observaciones', 'Obs'),
    })),
  }
}

/** La respuesta de `FECompConsultar`: lo que ARCA tiene registrado con ese número, o null. */
export function leerConsulta(xml) {
  const f = falla(xml)
  if (f) throw new Error(`WSFE: ${f}`)
  const r = tag(xml, 'ResultGet')
  if (!r) {
    const errores = codigos(xml, 'Errors', 'Err')
    // 602: «No existen datos en nuestros registros para los parámetros ingresados».
    if (errores.some((e) => e.codigo === 602)) return null
    throw new Error(`WSFE: ${errores.map((e) => `${e.codigo} ${e.mensaje}`).join(' · ') || 'respuesta vacía'}`)
  }
  return {
    numero: Number(tag(r, 'CbteDesde')),
    fecha: fechaIso(tag(r, 'CbteFch')),
    total: Number(tag(r, 'ImpTotal')),
    docTipo: Number(tag(r, 'DocTipo')),
    docNro: Number(tag(r, 'DocNro')),
    resultado: tag(r, 'Resultado'),
    cae: tag(r, 'CodAutorizacion'),
    caeVence: fechaIso(tag(r, 'FchVto')),
  }
}

// ─── Cuando no se sabe si salió ────────────────────────────────────────────────────────────

/**
 * Se mandó un lote y se cortó antes de la respuesta: ¿ARCA lo autorizó o no?
 * 🔴 Reintentar a ciegas DUPLICA la factura (sale con el número siguiente). Se consulta cada número
 * reservado y se compara con lo que se pidió: si coincide total, fecha y documento, es nuestro.
 *
 * @param {Array<{ numero: number, total: number, fecha: string, docTipo: number, docNro: number }>} reservados
 * @param {Map<number, ReturnType<typeof leerConsulta>>} consultados por número
 * @returns {{ autorizados: Array, faltan: Array, ajenos: Array }}
 *   `ajenos` = el número existe pero con OTRO contenido: alguien más facturó en ese punto de
 *   venta. Frena todo: hay que mirarlo a mano.
 */
export function reconciliar(reservados, consultados) {
  const autorizados = [], faltan = [], ajenos = []
  for (const r of reservados) {
    const c = consultados.get(r.numero)
    if (!c) faltan.push(r)
    else if (c.resultado === 'A' && aCentavos(c.total) === aCentavos(r.total) && c.fecha === r.fecha
      && c.docTipo === r.docTipo && c.docNro === Number(r.docNro)) autorizados.push({ ...r, cae: c.cae, caeVence: c.caeVence })
    else ajenos.push({ reservado: r, registrado: c })
  }
  return { autorizados, faltan, ajenos }
}

// ─── El QR (RG 4892) ───────────────────────────────────────────────────────────────────────

/** La URL que va en el QR del comprobante impreso. */
export function urlQR({ fecha, cuit, ptoVta, tipo, numero, total, docTipo, docNro, cae }) {
  const datos = {
    ver: 1, fecha, cuit: Number(cuit), ptoVta, tipoCmp: tipo, nroCmp: numero,
    importe: Number(monto(total)), moneda: 'PES', ctz: 1,
    tipoDocRec: docTipo, nroDocRec: Number(docNro), tipoCodAut: 'E', codAut: Number(cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString('base64')}`
}

/** «B 00012-00000045», como lo muestra GN; la nota de crédito, «NC B …» (numera aparte de la factura). */
export function numeroVisible(tipo, ptoVta, numero) {
  return `${ES_NC[tipo] ? 'NC ' : ''}${CLASE[tipo] || '?'} ${String(ptoVta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`
}
