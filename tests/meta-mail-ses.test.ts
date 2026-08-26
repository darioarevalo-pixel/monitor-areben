import { describe, expect, it } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
// El firmador vive en `scripts/` porque lo usa el cron y ⛔ no la app: no hay `.ts` que lo envuelva.
import { firmar } from '../scripts/lib/ses.mjs'

/**
 * La firma SigV4 de SES.
 *
 * 🔴 **Una firma no se puede «revisar leyéndola»**: sale bien o sale un 403 que dice «signature does
 * not match» y ⛔ no dice cuál de los diez pasos falló. Así que se ancla contra un **cálculo
 * independiente**, escrito acá de cero siguiendo la especificación de AWS. Si los dos coinciden, o
 * los dos están bien, o los dos están mal del mismo modo — y por eso además **se ejerció contra el
 * SES real**: la lectura de identidades contestó 200 y el mail salió con su `MessageId`.
 *
 * ⚠️ El `ahora` es parámetro justamente para esto: con un `new Date()` adentro, lo único que se
 * podría probar es que no explota.
 */

const AHORA = new Date('2026-08-26T18:30:00.000Z')
const BASE = {
  region: 'us-east-1',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  metodo: 'POST',
  ruta: '/v2/email/outbound-emails',
  payload: '{"a":1}',
  ahora: AHORA,
}

/** El mismo algoritmo, escrito aparte a partir de la especificación. Es el oráculo. */
function firmaEsperada(o: typeof BASE) {
  const sha = (x: string) => createHash('sha256').update(x, 'utf8').digest('hex')
  const mac = (k: Buffer | string, x: string) => createHmac('sha256', k).update(x, 'utf8').digest()
  const host = `email.${o.region}.amazonaws.com`
  const amz = '20260826T183000Z'
  const dia = '20260826'
  const hp = sha(o.payload)
  const canon = `${o.metodo}\n${o.ruta}\n\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${hp}\nx-amz-date:${amz}\n\ncontent-type;host;x-amz-content-sha256;x-amz-date\n${hp}`
  const alcance = `${dia}/${o.region}/ses/aws4_request`
  const aFirmar = `AWS4-HMAC-SHA256\n${amz}\n${alcance}\n${sha(canon)}`
  const k = mac(mac(mac(mac(`AWS4${o.secretAccessKey}`, dia), o.region), 'ses'), 'aws4_request')
  return createHmac('sha256', k).update(aFirmar, 'utf8').digest('hex')
}

describe('la firma SigV4 de SES', () => {
  it('coincide con el algoritmo calculado aparte desde la especificación', () => {
    expect(firmar(BASE).firma).toBe(firmaEsperada(BASE))
  })

  it('la fecha viaja en el formato que AWS exige (sin guiones, sin dos puntos, sin milisegundos)', () => {
    expect(firmar(BASE).headers['x-amz-date']).toBe('20260826T183000Z')
  })

  it('el alcance lleva el día, la región y el servicio `ses`', () => {
    expect(firmar(BASE).alcance).toBe('20260826/us-east-1/ses/aws4_request')
  })

  it('🔴 los headers firmados van en orden ALFABÉTICO: uno fuera de orden es un 403 que no dice cuál', () => {
    expect(firmar(BASE).firmados).toEqual(['content-type', 'host', 'x-amz-content-sha256', 'x-amz-date'])
  })

  it('el host sale de la región: firmar contra otra región es firmar contra otro servidor', () => {
    expect(firmar({ ...BASE, region: 'sa-east-1' }).host).toBe('email.sa-east-1.amazonaws.com')
  })

  it('el hash del cuerpo va en un header FIRMADO: si no, alguien podría cambiar el mail en el camino', () => {
    const h = firmar(BASE).headers
    expect(h['x-amz-content-sha256']).toBe(createHash('sha256').update('{"a":1}', 'utf8').digest('hex'))
    expect(firmar(BASE).firmados).toContain('x-amz-content-sha256')
  })

  it('cambiar CUALQUIER cosa cambia la firma: el cuerpo, la ruta, el método, la hora, la región', () => {
    const base = firmar(BASE).firma
    expect(firmar({ ...BASE, payload: '{"a":2}' }).firma).not.toBe(base)
    expect(firmar({ ...BASE, ruta: '/v2/email/identities' }).firma).not.toBe(base)
    expect(firmar({ ...BASE, metodo: 'GET' }).firma).not.toBe(base)
    expect(firmar({ ...BASE, region: 'sa-east-1' }).firma).not.toBe(base)
    expect(firmar({ ...BASE, ahora: new Date('2026-08-27T18:30:00.000Z') }).firma).not.toBe(base)
    expect(firmar({ ...BASE, secretAccessKey: 'otra' }).firma).not.toBe(base)
  })

  it('un cuerpo vacío firma el hash del string vacío, ⛔ no se saltea el header', () => {
    const h = firmar({ ...BASE, metodo: 'GET', payload: '' }).headers
    expect(h['x-amz-content-sha256']).toBe(createHash('sha256').update('', 'utf8').digest('hex'))
  })
})
