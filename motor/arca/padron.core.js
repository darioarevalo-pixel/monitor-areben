/**
 * El PADRÓN de ARCA: CUIT ⇒ razón social, condición frente al IVA y domicilio fiscal — el dominio puro.
 * Servicio «Consulta de constancia de inscripción» (A5, `getPersona_v2`). La red y la firma viven en `cliente.js`.
 *
 * Habilitado por Bruno el 31-oct-2026 (F. 3283/E) para el computador fiscal `monitor-produccion` (el cert de
 * PRODUCCIÓN). 🔴 El cert de HOMOLOGACIÓN ⛔ llega («Computador no autorizado», medido 31-oct).
 *
 * La forma de la respuesta sale del WSDL bajado el 31-oct-2026 (`aws.afip.gov.ar/sr-padron/webservices/
 * personaServiceA5?WSDL`): elementos SIN namespace adentro de `personaReturn`, `soapAction` vacío.
 * 🔴 Los tests van contra respuestas ARMADAS con esa forma, ⛔ grabadas: el oráculo es la 1ª consulta real
 * (el CUIT de Areben tiene que decir AREBEN COMERCIAL S.R.L., Corrientes 763, Responsable Inscripto).
 */
import { COND_IVA, cuitValido, falla, tag, tags } from './arca.core.js'

export const PADRON = Object.freeze({
  servicio: 'ws_sr_constancia_inscripcion',
  urls: Object.freeze({
    homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
    produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  }),
})

/** Los impuestos del padrón que deciden la condición frente al IVA (tabla de impuestos de ARCA). */
export const IMPUESTO = Object.freeze({ IVA: 30, IVA_EXENTO: 32, MONOTRIBUTO: 20 })

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const desescapar = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const texto = (xml, nombre) => { const t = tag(xml || '', nombre); return t == null ? null : desescapar(t).trim() || null }
const soloDigitos = (c) => String(c ?? '').replace(/\D/g, '')

/** El sobre SOAP de `getPersona_v2`. Valida el CUIT ANTES: uno mal tipeado ⛔ gasta una consulta. */
export function sobrePadron({ token, sign, cuitRepresentada, idPersona }) {
  const id = soloDigitos(idPersona)
  if (!cuitValido(id)) throw new Error(`CUIT inválido: ${idPersona}`)
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">'
    + '<soapenv:Header/><soapenv:Body><a5:getPersona_v2>'
    + `<token>${x(token)}</token><sign>${x(sign)}</sign>`
    + `<cuitRepresentada>${Number(cuitRepresentada)}</cuitRepresentada><idPersona>${Number(id)}</idPersona>`
    + '</a5:getPersona_v2></soapenv:Body></soapenv:Envelope>'
}

/** Los impuestos ACTIVOS de un bloque (`datosRegimenGeneral` o `datosMonotributo`). Sin estado ⇒ se toma como activo. */
function impuestosActivos(bloque) {
  return tags(bloque || '', 'impuesto')
    .filter((i) => { const e = texto(i, 'estadoImpuesto'); return !e || e === 'AC' })
    .map((i) => Number(texto(i, 'idImpuesto')))
}

/**
 * La condición frente al IVA, con el código de `COND_IVA` (el que va en la factura).
 * Monotributo gana si está (un monotributista ⛔ tiene IVA); después IVA ⇒ RI, IVA exento ⇒ exento; nada ⇒ consumidor final.
 */
export function condicionDe({ regimenGeneral, monotributo }) {
  const rg = impuestosActivos(regimenGeneral)
  const mono = impuestosActivos(monotributo)
  if (mono.includes(IMPUESTO.MONOTRIBUTO) || tag(monotributo || '', 'categoriaMonotributo')) {
    return { condicion: 'monotributo', condicionIva: COND_IVA.MONOTRIBUTO }
  }
  if (rg.includes(IMPUESTO.IVA)) return { condicion: 'responsable_inscripto', condicionIva: COND_IVA.RESPONSABLE_INSCRIPTO }
  if (rg.includes(IMPUESTO.IVA_EXENTO)) return { condicion: 'exento', condicionIva: COND_IVA.EXENTO }
  return { condicion: 'consumidor_final', condicionIva: COND_IVA.CONSUMIDOR_FINAL }
}

/**
 * La respuesta de `getPersona_v2` ⇒ los datos fiscales. Tira error si ARCA no conoce el CUIT (o no autorizó al
 * computador); con datos pero con errores de constancia, los devuelve en `avisos` (la razón social igual sirve).
 */
export function leerPersona(xml) {
  const f = falla(xml)
  if (f) throw new Error(`Padrón de ARCA: ${f}`)
  const r = tag(xml, 'personaReturn')
  if (r == null) throw new Error('El padrón de ARCA respondió sin persona')
  const generales = tag(r, 'datosGenerales')
  const errores = ['errorConstancia', 'errorRegimenGeneral', 'errorMonotributo']
    .flatMap((b) => tags(tag(r, b) || '', 'error').map((e) => desescapar(e).trim()))
    .filter(Boolean)
  if (!generales) throw new Error(`Padrón de ARCA: ${errores.join(' · ') || 'el CUIT no tiene datos'}`)

  const apellidoNombre = [texto(generales, 'apellido'), texto(generales, 'nombre')].filter(Boolean).join(' ')
  const razonSocial = texto(generales, 'razonSocial') || apellidoNombre || null
  const dom = tag(generales, 'domicilioFiscal')
  const domicilio = dom == null ? null : {
    direccion: texto(dom, 'direccion'),
    localidad: texto(dom, 'localidad'),
    codPostal: texto(dom, 'codPostal'),
    provincia: texto(dom, 'descripcionProvincia'),
  }
  const linea = domicilio
    ? [domicilio.direccion, domicilio.localidad, domicilio.codPostal && `(${domicilio.codPostal})`, domicilio.provincia]
      .filter(Boolean).join(', ').replace(/, \(/, ' (')
    : null
  return {
    cuit: soloDigitos(texto(generales, 'idPersona')) || null,
    razonSocial,
    tipoPersona: texto(generales, 'tipoPersona'),
    estadoClave: texto(generales, 'estadoClave'),
    ...condicionDe({ regimenGeneral: tag(r, 'datosRegimenGeneral'), monotributo: tag(r, 'datosMonotributo') }),
    domicilio,
    domicilioTexto: linea || null,
    avisos: errores,
  }
}
