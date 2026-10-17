/**
 * Hablar con ARCA (ex AFIP): el permiso (WSAA) y la factura electrónica (WSFE).
 *
 * Lo que se arma y se lee vive en `lib/arca/arca.core.js` (puro, testeado). Acá sólo está lo que
 * necesita red o la clave privada.
 *
 * ⚠️ No es una función de Vercel: el prefijo `_` lo garantiza (el plan Hobby admite 12).
 *
 * 🔑 **El permiso (TA) se GUARDA y se reusa 12 horas.** WSAA rechaza un login nuevo mientras haya
 * uno vigente («El CEE ya posee un TA valido»), así que pedirlo en cada llamada funciona la primera
 * vez y después falla. Dónde se guarda lo decide quien llama (`almacenTA`).
 *
 * 🔴 **Un solo lote por punto de venta a la vez.** La numeración es «el último + 1»: dos lotes en
 * paralelo piden el mismo número y el segundo rebota. El candado lo pone quien llama.
 */
import https from 'node:https'
import forge from 'node-forge'
import {
  AMBIENTES, authXml, leerCAE, leerConsulta, leerTA, leerUltimo, loteXml, reconciliar,
  sobreWsaa, sobreWsfe, taVigente, tag, traXml,
} from './arca.core.js'

const ESPERA_MS = 25_000

/** Firma el TRA en CMS (PKCS#7 con el contenido adentro), base64 — lo que pide `loginCms`. */
export function firmarTRA(tra, certPem, keyPem) {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, 'utf8')
  const cert = forge.pki.certificateFromPem(certPem)
  p7.addCertificate(cert)
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign()
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
}

/**
 * 🔴 ARCA de PRODUCCIÓN (`servicios1.afip.gov.ar`, la factura) negocia TLS con una clave Diffie-Hellman CHICA que
 * OpenSSL 3 rechaza por defecto: `fetch` falla con «fetch failed» (`ERR_SSL_DH_KEY_TOO_SMALL`), medido 17-oct en la
 * primera factura real. Homologación ⛔ tiene el problema. Este agente baja el nivel a SECLEVEL=1 (⛔ 0) y es SÓLO para
 * hablar con ARCA: el resto del motor sigue con el default.
 */
export const AGENTE_ARCA = new https.Agent({ keepAlive: true, ciphers: 'DEFAULT@SECLEVEL=1' })

/** Un error de red con la forma que `esCorte` reconoce (antes era el `TypeError` de `fetch`). */
const deRed = (e) => new TypeError(`No se pudo hablar con ARCA (${e.code || e.message})`)

async function soap(url, accion, cuerpo) {
  const { status, texto } = await new Promise((ok, mal) => {
    const req = https.request(url, {
      method: 'POST', agent: AGENTE_ARCA,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: accion, 'Content-Length': Buffer.byteLength(cuerpo) },
    }, (r) => {
      let t = ''
      r.setEncoding('utf8')
      r.on('data', (c) => { t += c })
      r.on('end', () => { clearTimeout(reloj); ok({ status: r.statusCode, texto: t }) })
      r.on('error', (e) => { clearTimeout(reloj); mal(deRed(e)) })
    })
    const reloj = setTimeout(() => req.destroy(Object.assign(new Error(`ARCA no contestó en ${ESPERA_MS / 1000} s`), { name: 'TimeoutError' })), ESPERA_MS)
    req.on('error', (e) => { clearTimeout(reloj); mal(e.name === 'TimeoutError' ? e : deRed(e)) })
    req.end(cuerpo)
  })
  // Un SOAP Fault viene con 500 y el detalle en el cuerpo: se lee igual.
  if (!(status >= 200 && status < 300) && !tag(texto, 'Fault')) throw new Error(`ARCA respondió ${status}`)
  return texto
}

/**
 * @param {{ ambiente: 'homologacion'|'produccion', cuit: number, cert: string, key: string,
 *           almacenTA: { leer: () => Promise<any>, guardar: (ta: any) => Promise<void> },
 *           ahora?: () => Date }} cfg
 */
export function crearClienteArca({ ambiente, cuit, cert, key, almacenTA, ahora = () => new Date() }) {
  const urls = AMBIENTES[ambiente]
  if (!urls) throw new Error(`Ambiente de ARCA inválido: ${ambiente}`)
  if (!cert || !key) throw new Error('Falta el certificado o la clave de ARCA')
  if (!almacenTA) throw new Error('Falta dónde guardar el permiso de ARCA')

  async function permiso() {
    const guardado = await almacenTA.leer()
    if (taVigente(guardado, ahora())) return guardado
    const cms = firmarTRA(traXml({ servicio: 'wsfe', ahora: ahora() }), cert, key)
    const ta = leerTA(await soap(urls.wsaa, '', sobreWsaa(cms)))
    await almacenTA.guardar(ta)
    return ta
  }

  async function wsfe(operacion, cuerpo) {
    const ta = await permiso()
    return soap(urls.wsfe, `http://ar.gov.afip.dif.FEV1/${operacion}`,
      sobreWsfe(operacion, authXml({ ...ta, cuit }) + cuerpo))
  }

  const cliente = {
    /** Si los tres servidores de ARCA están arriba. No pide permiso. */
    async dummy() {
      const xml = await soap(urls.wsfe, 'http://ar.gov.afip.dif.FEV1/FEDummy', sobreWsfe('FEDummy', ''))
      return { app: tag(xml, 'AppServer'), base: tag(xml, 'DbServer'), auth: tag(xml, 'AuthServer') }
    },

    async ultimo(ptoVta, tipo) {
      return leerUltimo(await wsfe('FECompUltimoAutorizado', `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`))
    },

    async consultar(ptoVta, tipo, numero) {
      return leerConsulta(await wsfe('FECompConsultar',
        `<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq>`))
    },

    /**
     * Pide el CAE de un lote ya numerado (`desde` = último autorizado + 1). Devuelve `leerCAE`.
     * Si se corta antes de la respuesta, el error lleva `corte: true`: ⛔ se reintenta, se consulta
     * (eso lo hace `lib/arca/lote.core.js`, que además reservó los números en la base).
     */
    async solicitar({ ptoVta, tipo, desde, comprobantes }) {
      try {
        return leerCAE(await wsfe('FECAESolicitar', loteXml({ ptoVta, tipo, desde, comprobantes })))
      } catch (e) {
        if (esCorte(e)) throw Object.assign(new Error(`Se cortó la conexión con ARCA: ${e.message}`), { corte: true })
        throw e
      }
    },

    /** Versión sin base, para el script de prueba: numera, pide y, si se corta, reconcilia. */
    async facturarLote({ ptoVta, tipo, comprobantes }) {
      const desde = (await cliente.ultimo(ptoVta, tipo)) + 1
      const reservados = comprobantes.map((c, i) => ({
        ...c, numero: desde + i, docTipo: c.receptor.docTipo, docNro: Number(c.receptor.docNro),
      }))
      let resp
      try {
        resp = await cliente.solicitar({ ptoVta, tipo, desde, comprobantes })
      } catch (e) {
        if (!e.corte) throw e
        const consultados = new Map()
        for (const r of reservados) consultados.set(r.numero, await cliente.consultar(ptoVta, tipo, r.numero))
        return { ...reconciliar(reservados, consultados), rechazados: [], cortado: true }
      }
      const porNumero = new Map(resp.detalles.map((d) => [d.numero, d]))
      const autorizados = [], rechazados = []
      for (const r of reservados) {
        const d = porNumero.get(r.numero)
        if (d?.resultado === 'A' && d.cae) autorizados.push({ ...r, cae: d.cae, caeVence: d.caeVence, observaciones: d.observaciones })
        else rechazados.push({ ...r, observaciones: d?.observaciones || [], errores: resp.errores })
      }
      return { autorizados, rechazados, faltan: [], ajenos: [], cortado: false }
    },
  }
  return cliente
}

/** Se cortó antes de saber la respuesta (≠ ARCA contestó que no). */
function esCorte(e) {
  return e?.name === 'TimeoutError' || e?.name === 'AbortError' || e instanceof TypeError || /respondió 5\d\d/.test(e?.message || '')
}
