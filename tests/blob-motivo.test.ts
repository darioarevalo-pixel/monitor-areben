import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { motivoDeSubida, RUTA_PERMISO } from '@/lib/blob-motivo'

/**
 * 🔴 **El cartel que ve la persona cuando la subida no sale.**
 *
 * `upload()` de `@vercel/blob/client` descarta el cuerpo de la respuesta cuando el permiso se
 * deniega y tira siempre «Failed to retrieve the client token». Por eso el motivo que el servidor
 * escribe —«Ya subiste todo lo que entra», «pesa más de la cuenta», «No encuentro tu sesión»— no
 * llegaba nunca a la pantalla, y los tests del handler seguían en verde porque del lado del
 * servidor el mensaje **sí** estaba bien.
 *
 * Lo cazó una creadora de BDI el 7-sep-2026: llegó al tope de 30 evidencias, sus dos videos
 * fallaron con el cartel del token y lo que entendió —lo único que ese cartel deja entender— fue
 * «no se pueden subir videos».
 *
 * Este archivo prueba las dos mitades: que el motivo real llegue, y que **no** se pregunte nada
 * cuando el error ya se explica solo.
 */

/** Lo que tira el SDK cuando el permiso se deniega. El doble espacio es de él, no una errata. */
const CARTEL_DEL_SDK = new Error('Failed to  retrieve the client token')

type Llamada = { url: string; opts: { method?: string; headers?: Record<string, string>; body?: string } }

let llamadas: Llamada[]

/** Deja al `fetch` global contestando lo que le digas, y anotando con qué lo llamaron. */
function servidorQueContesta(status: number, cuerpo: unknown) {
  llamadas = []
  const falso = vi.fn(async (url: string, opts: Llamada['opts']) => {
    llamadas.push({ url, opts })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (cuerpo === undefined) throw new Error('no es JSON')
        return cuerpo
      },
    } as unknown as Response
  })
  globalThis.fetch = falso as unknown as typeof fetch
  return falso
}

const pedido = {
  pathname: 'canjes/71/reel.mp4',
  clientPayload: 'canje:' + 'a'.repeat(64),
  multipart: true,
}

beforeEach(() => { llamadas = [] })
afterEach(() => { vi.restoreAllMocks() })

describe('motivoDeSubida — el motivo del servidor llega a la pantalla', () => {
  it('🔴 el tope de un canje se lee como el tope, no como «Failed to retrieve the client token»', async () => {
    servidorQueContesta(409, { error: 'Ya subiste todo lo que entra. Si falta algo, escribinos.' })
    const motivo = await motivoDeSubida(CARTEL_DEL_SDK, pedido)
    expect(motivo).toBe('Ya subiste todo lo que entra. Si falta algo, escribinos.')
    expect(motivo).not.toMatch(/client token/i)
  })

  it('el 403 de sesión dice que falta la sesión (el que en agosto mató las piezas una semana)', async () => {
    servidorQueContesta(403, { error: 'Credenciales inválidas' })
    expect(await motivoDeSubida(CARTEL_DEL_SDK, pedido)).toBe('Credenciales inválidas')
  })

  it('🔑 vuelve a pedir EL MISMO permiso: otro pedido devolvería el motivo de otra cosa', async () => {
    servidorQueContesta(409, { error: 'no entra' })
    await motivoDeSubida(CARTEL_DEL_SDK, { ...pedido, headers: { 'x-monitor-auth': 'sobre' } })
    expect(llamadas).toHaveLength(1)
    const [{ url, opts }] = llamadas
    expect(url).toBe(RUTA_PERMISO)
    expect(opts.method).toBe('POST')
    expect(opts.headers?.['x-monitor-auth'], 'sin la sesión, el reintento come 403 y miente el motivo').toBe('sobre')
    expect(JSON.parse(String(opts.body))).toEqual({
      type: 'blob.generate-client-token',
      payload: { pathname: pedido.pathname, clientPayload: pedido.clientPayload, multipart: true },
    })
  })

  it('⛔ un error que ya se explica solo NO se va a preguntar a ningún lado', async () => {
    const falso = servidorQueContesta(409, { error: 'ya subiste todo' })
    const motivo = await motivoDeSubida(new Error('Load failed'), pedido)
    expect(motivo).toBe('Load failed')
    expect(falso, 'preguntar de más es una llamada por cada archivo de una tanda que se cortó').not.toHaveBeenCalled()
  })

  it('si al preguntar el permiso SÍ sale, el que falló fue el envío: no se inventa un motivo de firma', async () => {
    servidorQueContesta(200, { clientToken: 'vercel_blob_client_x' })
    const motivo = await motivoDeSubida(CARTEL_DEL_SDK, pedido)
    expect(motivo).not.toMatch(/client token/i)
    expect(motivo).toMatch(/Probá de nuevo/)
  })

  it('el servidor que contesta un error sin texto —o algo que no es JSON— deja el cartel genérico', async () => {
    servidorQueContesta(500, undefined)
    expect(await motivoDeSubida(CARTEL_DEL_SDK, pedido)).toMatch(/No se pudo subir el archivo/)
  })

  it('⚠️ preguntar el motivo no puede romper el cartel que lo estaba armando', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('sin red') }) as unknown as typeof fetch
    await expect(motivoDeSubida(CARTEL_DEL_SDK, pedido)).resolves.toMatch(/No se pudo subir el archivo/)
  })
})

/**
 * La otra punta: que los tres hooks que suben al Blob pasen por acá. Es texto contra texto, como
 * `blob-upload-sesion.test.ts`, porque lo que se rompe no es la lógica del helper sino que alguien
 * escriba el cuarto hook copiando el `catch` de los anteriores.
 */
describe('los que suben al Blob muestran el motivo, no el cartel del SDK', () => {
  const raiz = join(__dirname, '..')
  const hooks = [
    'components/canjes/useSubirContenido.ts',
    'components/ingresos/useSubirGaleria.ts',
    'components/meta-ads/piezas/useSubirPiezas.ts',
  ]

  it.each(hooks)('%s traduce el error antes de mostrarlo', (ruta) => {
    const src = readFileSync(join(raiz, ruta), 'utf8')
    expect(src).toContain('motivoDeSubida(e, pedido)')
    expect(src, 'el `message` crudo del SDK es exactamente el cartel que no dice nada')
      .not.toContain("motivo: (e as Error)?.message")
  })

  it('🔑 la ruta del permiso es una sola: la que se firma es la que se vuelve a preguntar', () => {
    for (const ruta of hooks) {
      const src = readFileSync(join(raiz, ruta), 'utf8')
      expect(src).toContain('handleUploadUrl: RUTA_PERMISO')
      expect(src, 'una copia del string y el cartel termina preguntándole a una ruta que no existe')
        .not.toContain("handleUploadUrl: '/api/blob-upload'")
    }
  })
})
