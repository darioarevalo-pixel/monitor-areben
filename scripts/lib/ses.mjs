/**
 * Mandar un mail por **Amazon SES**, firmando a mano con SigV4. **Sin dependencia nueva.**
 *
 * # Por qué SES y ⛔ no otro proveedor
 *
 * Lo corrigió Bruno el 26-ago-2026: *«uso ses, fijate que mailer usa ses»*. El mailer
 * (`areben-mailer`) manda por SESv2 desde `us-east-1` con el dominio ya verificado y DKIM andando.
 * ⇒ **No hay cuenta nueva, ni servicio nuevo, ni dominio que verificar**: la primera versión de
 * este archivo proponía dar de alta Resend, que era volver a pedir —en atención, no en plata— algo
 * que la empresa ya tiene funcionando. 📌 Antes de proponer algo que pida un acceso, mirar qué ya
 * está: la respuesta estaba a un repo de distancia.
 *
 * # Por qué a mano y ⛔ no con `@aws-sdk/client-sesv2`
 *
 * El SDK son ~10 MB que `npm ci` bajaría en **cada corrida de cada cron** de este repo, para usar
 * un endpoint. SigV4 son 40 líneas con el `crypto` que ya viene en Node, y se verificó contra el
 * SES real —una lectura primero, un mail después—, así que ⛔ no es criptografía sin ejercer.
 *
 * # 🔴 El `ConfigurationSet` del mailer NO se usa acá, y es a propósito
 *
 * `areben-mailer` manda todo con `ConfigurationSetName=areben-mailer`, que es lo que alimenta sus
 * eventos de SNS y sus métricas de entregabilidad —aperturas, rebotes, quejas—. Un mail interno de
 * una sola persona metido ahí adentro **le ensucia los números al producto**: sube la apertura y
 * suma un destinatario que no es un cliente. Va sin configuration set.
 *
 * ⚠️ Lo que SÍ se comparte y no se puede evitar es la **reputación del dominio**. Es un mail por día
 * a una casilla propia de Workspace, así que el riesgo es despreciable — pero el día que esto
 * mandara a terceros, va por su propio subdominio.
 */

import { createHash, createHmac } from 'node:crypto'

const sha256 = (x) => createHash('sha256').update(x, 'utf8').digest('hex')
const hmac = (key, x) => createHmac('sha256', key).update(x, 'utf8').digest()

/**
 * Lo que efectivamente se firma. Está separado del `fetch` para poder probarlo **sin red**: una
 * firma sólo se puede verificar comparándola contra otra, y con la fecha adentro de la función lo
 * único demostrable sería que no explota.
 *
 * ⚠️ El orden alfabético de los headers firmados ⛔ no es cosmético: AWS rearma esta cadena exacta
 * de su lado. Uno fuera de orden da un 403 que dice «signature does not match» y **no dice cuál**.
 */
export function firmar({ region, secretAccessKey, metodo, ruta, payload, ahora }) {
  const host = `email.${region}.amazonaws.com`
  const amzFecha = ahora.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dia = amzFecha.slice(0, 8)
  const hashPayload = sha256(payload || '')
  // ⚠️ Declarados A PROPÓSITO fuera de orden alfabético. Estaban ordenados, y así el `.sort()` de
  // abajo andaba **por casualidad**: borrarlo no cambiaba nada y ningún test podía verlo (el mutante
  // sobrevivía). Desordenados, el orden lo pone el `sort` y eso sí se puede probar — que es lo que
  // va a importar el día que alguien sume un header, porque lo va a sumar al final.
  const headers = {
    host,
    'x-amz-date': amzFecha,
    'content-type': 'application/json',
    'x-amz-content-sha256': hashPayload,
  }
  const firmados = Object.keys(headers).sort()
  const canon = [
    metodo, ruta, '',
    firmados.map((k) => `${k}:${headers[k]}\n`).join(''),
    firmados.join(';'),
    hashPayload,
  ].join('\n')

  const alcance = `${dia}/${region}/ses/aws4_request`
  const aFirmar = ['AWS4-HMAC-SHA256', amzFecha, alcance, sha256(canon)].join('\n')
  // La cadena de derivación de AWS: fecha → región → servicio → aws4_request.
  const kFecha = hmac(`AWS4${secretAccessKey}`, dia)
  const kRegion = hmac(kFecha, region)
  const kServicio = hmac(kRegion, 'ses')
  const kFirma = hmac(kServicio, 'aws4_request')
  const firma = createHmac('sha256', kFirma).update(aFirmar, 'utf8').digest('hex')

  return { headers, firmados, alcance, firma, host }
}

/** Firma y pega. Devuelve `{ status, cuerpo }` crudos: quién llama decide qué es un error. */
export async function pedirSes({ region, accessKeyId, secretAccessKey, metodo, ruta, cuerpo, ahora = new Date() }) {
  const payload = cuerpo ? JSON.stringify(cuerpo) : ''
  const { headers, firmados, alcance, firma, host } = firmar({ region, secretAccessKey, metodo, ruta, payload, ahora })
  const r = await fetch(`https://${host}${ruta}`, {
    method: metodo,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${alcance}, SignedHeaders=${firmados.join(';')}, Signature=${firma}`,
    },
    body: payload || undefined,
  })
  return { status: r.status, cuerpo: await r.json().catch(() => null) }
}
