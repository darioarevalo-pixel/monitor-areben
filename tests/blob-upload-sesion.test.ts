import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { credenciales, sobreDeCredenciales } from '@/api/_auth.js'

/**
 * 🔴 **Cómo viaja la sesión cuando NO puede viajar en un header.**
 *
 * `upload()` de `@vercel/blob/client` le pide el permiso de subida a `/api/blob-upload` con su
 * propio `fetch`, y a ese fetch no se le pueden agregar cabeceras: el único canal que ofrece es
 * `clientPayload`. Mientras el handler exigía la sesión por `x-monitor-auth`, **la subida de piezas
 * contestaba 403 a un usuario perfectamente logueado** y el SDK lo traducía a «Failed to retrieve
 * the client token», un cartel que no menciona la sesión por ningún lado.
 *
 * Llegó a producción con los 34 tests de la tanda D en verde, porque todos prueban el núcleo puro
 * —qué copy se hereda, qué modelos se rechazan— y ninguno la conversación con el SDK. **Lo cazó
 * arrastrar un archivo**, igual que la poda la cazó abrir la pantalla.
 *
 * Este archivo cubre las dos mitades del arreglo: que el sobre se abra igual venga de donde venga,
 * y que las dos puntas sigan de acuerdo sobre por dónde viaja.
 */

const raiz = join(__dirname, '..')
const puerta = readFileSync(join(raiz, 'api/blob-upload.js'), 'utf8')
const hook = readFileSync(join(raiz, 'components/meta-ads/piezas/useSubirPiezas.ts'), 'utf8')

/** El sobre tal como lo arma el browser en `lib/api-fetch.ts`: base64 de un JSON en UTF-8. */
const sobre = (cred: Record<string, string>) => Buffer.from(JSON.stringify(cred), 'utf8').toString('base64')

describe('sobreDeCredenciales — el mismo sobre, venga del header o del cuerpo', () => {
  it('abre una sesión de contraseña', () => {
    expect(sobreDeCredenciales(sobre({ user: 'bruno', pass: 'secreta' })))
      .toEqual({ user: 'bruno', pass: 'secreta', token: '' })
  })

  it('abre una sesión de Google, que no tiene contraseña que mandar', () => {
    expect(sobreDeCredenciales(sobre({ token: 'ey.token.google' })))
      .toEqual({ user: '', pass: '', token: 'ey.token.google' })
  })

  it('🔑 sobrevive a la eñe y a los acentos, que es para lo que existe el base64', () => {
    // Los valores de header son latin-1: una contraseña con ñ hace que `fetch` tire TypeError
    // ANTES de salir del browser. Por eso el sobre va codificado y no en texto plano.
    expect(sobreDeCredenciales(sobre({ user: 'muñoz', pass: 'contraseña-ácida' })))
      .toEqual({ user: 'muñoz', pass: 'contraseña-ácida', token: '' })
  })

  it('un sobre roto o vacío no autentica a nadie, en vez de romper el handler', () => {
    for (const malo of ['', null, undefined, 'no-es-base64!!', Buffer.from('{roto').toString('base64')]) {
      expect(sobreDeCredenciales(malo as string)).toEqual({ user: '', pass: '', token: '' })
    }
  })

  it('🔑 el header y el cuerpo dan EXACTAMENTE lo mismo', () => {
    // Si se decodificaran distinto, una sesión válida entraría por un lado y no por el otro: el
    // peor modo de falla posible para lo que decide quién puede escribir.
    const s = sobre({ user: 'bruno', pass: 'secreta' })
    expect(credenciales({ headers: { 'x-monitor-auth': s } })).toEqual(sobreDeCredenciales(s))
  })
})

/**
 * El espejo entre las dos puntas. No prueba comportamiento —el handler corre en Node sin pasar por
 * el compilador y el SDK no se puede simular desde acá—: prueba que **sigan de acuerdo**, que es
 * justo lo que se rompió.
 */
describe('blob-upload — el camino de cliente autentica por el cuerpo, no por el header', () => {
  it('el cliente manda el sobre como `clientPayload`', () => {
    expect(hook).toContain('clientPayload')
    expect(hook, 'el sobre tiene que salir de la misma función que usa apiFetch').toContain('sobreDeAuth')
  })

  it('🔴 el guard del header NO puede correr antes de la rama del SDK', () => {
    // Ésta es la aserción que habría matado el defecto: con `exigirUsuario` arriba, TODA subida de
    // pieza moría en 403 sin importar quién estuviera logueado.
    const rama = puerta.indexOf("body.type.startsWith('blob.')")
    const guard = puerta.indexOf('exigirUsuario(req, res)')
    expect(rama, 'no encontré la rama del SDK: la extracción se rompió').toBeGreaterThan(-1)
    expect(guard, 'no encontré el guard del header: la extracción se rompió').toBeGreaterThan(-1)
    expect(guard, 'exigirUsuario corre antes de la rama del SDK y le contesta 403').toBeGreaterThan(rama)
  })

  it('la rama del SDK igual exige sesión, adentro del callback', () => {
    // Que no la exija arriba no puede leerse como que no la exige: firmar un permiso de subida es
    // tan sensible como subir.
    const cb = puerta.indexOf('onBeforeGenerateToken')
    expect(puerta.slice(cb)).toContain('usuarioValido')
    expect(puerta.slice(cb)).toContain('sobreDeCredenciales')
  })
})
