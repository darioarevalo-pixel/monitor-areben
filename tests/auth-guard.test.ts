import { describe, it, expect, vi, afterEach } from 'vitest'
import { credenciales, usuarioValido, exigirUsuario, soloMismoOrigen } from '@/api/_auth.js'

/**
 * `api/_auth.js` es la puerta de TODO lo que escribe: ventas, canjes, precios de liquidación,
 * pausas de campañas de Meta. Su propio docblock cuenta por qué existe — tres endpoints estaban
 * *"abiertos a internet con CORS `*` y sin validar nada, usando tokens de GN con permiso de
 * escritura y la service key de Supabase"*.
 *
 * **No tenía un solo test.** Y no era una excepción: en los 136 archivos de `tests/` no había
 * **ninguna** llamada a un `handler(req, res)`. Todo lo que se probaba eran funciones puras
 * exportadas al costado, así que el parseo del body, los códigos de estado y —lo que importa acá—
 * el 403 nunca los ejercía nadie. Este archivo es el primero que invoca handlers de verdad.
 *
 * Los handlers de `api/` son `(req, res)` de Node: se prueban con un par de dobles, sin levantar
 * HTTP ni tocar la red.
 */

/** Un `res` de Vercel, mínimo: encadena `.status().json()` y guarda lo que le mandaron. */
function resFalso() {
  const r = {
    code: 0 as number,
    body: null as unknown,
    ended: false,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b; return r },
    end() { r.ended = true; return r },
  }
  return r
}

/** El sobre que arma el navegador en `lib/api-fetch.ts:70`: base64(JSON) en UTF-8. */
const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

const PERFIL = { name: 'Bruno', admin: true, acceso: {}, funcion: [] }

/** Responde como bdi-catalogo/api/usuarios y deja ver con qué se lo llamó. */
function kvResponde(payload: unknown, ok = true) {
  const espia = vi.fn(async (_url: string, _init: { body: string }) => ({ ok, json: async () => payload }))
  vi.stubGlobal('fetch', espia)
  return espia
}

/** El cuerpo JSON con el que se llamó al KV en la llamada `i`. */
const cuerpoDeLaLlamada = (espia: ReturnType<typeof kvResponde>, i = 0) =>
  JSON.parse(espia.mock.calls[i]![1].body)

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('credenciales: de dónde sale la identidad', () => {
  it('lee el sobre base64 del header con user y pass', () => {
    const c = credenciales({ headers: { 'x-monitor-auth': sobre({ user: ' Bruno ', pass: 'secreta' }) } })
    expect(c).toEqual({ user: 'Bruno', pass: 'secreta', token: '' })
  })

  it('el sobre con token gana y NO arrastra user/pass', () => {
    // Los dos caminos del SSO no se mezclan: si vino token, es sesión de Google.
    const c = credenciales({ headers: { 'x-monitor-auth': sobre({ token: 'jwt-de-google', user: 'x', pass: 'y' }) } })
    expect(c).toEqual({ user: '', pass: '', token: 'jwt-de-google' })
  })

  it('la contraseña con ñ y acentos sobrevive al viaje', () => {
    // La razón de que el sobre vaya en base64 y no en headers de texto plano: los valores de
    // header son latin-1 y una contraseña con "ñ" haría que `fetch` tire TypeError del lado del
    // cliente, antes de salir. Si alguien "simplifica" esto a texto plano, acá se rompe.
    const c = credenciales({ headers: { 'x-monitor-auth': sobre({ user: 'niña', pass: 'contraseña-ácida' }) } })
    expect(c.user).toBe('niña')
    expect(c.pass).toBe('contraseña-ácida')
  })

  it('un sobre roto no explota: devuelve vacío', () => {
    expect(credenciales({ headers: { 'x-monitor-auth': 'no-es-base64-valido!!' } }))
      .toEqual({ user: '', pass: '', token: '' })
  })

  it('acepta user/pass en el body — el contrato viejo de crear-venta', () => {
    expect(credenciales({ body: { user: 'Local', pass: 'p' } }))
      .toEqual({ user: 'Local', pass: 'p', token: '' })
    expect(credenciales({ body: { adminUser: 'Local', adminPass: 'p' } }))
      .toEqual({ user: 'Local', pass: 'p', token: '' })
  })

  it('el header le gana al body', () => {
    const c = credenciales({
      headers: { 'x-monitor-auth': sobre({ user: 'delHeader', pass: 'h' }) },
      body: { user: 'delBody', pass: 'b' },
    })
    expect(c.user).toBe('delHeader')
  })

  it('sin nada, no inventa una identidad', () => {
    expect(credenciales({})).toEqual({ user: '', pass: '', token: '' })
  })
})

describe('usuarioValido: se le pregunta al KV, no se decide acá', () => {
  it('con user/pass manda action:login', async () => {
    const espia = kvResponde({ ok: true, perfil: PERFIL })
    await expect(usuarioValido('Bruno', 'secreta', '')).resolves.toEqual(PERFIL)
    expect(cuerpoDeLaLlamada(espia)).toEqual({ action: 'login', user: 'Bruno', pass: 'secreta' })
  })

  it('con token manda action:login-google', async () => {
    const espia = kvResponde({ ok: true, perfil: PERFIL })
    await expect(usuarioValido('', '', 'jwt')).resolves.toEqual(PERFIL)
    expect(cuerpoDeLaLlamada(espia)).toEqual({ action: 'login-google', token: 'jwt' })
  })

  it('sin credenciales ni sale a la red', async () => {
    const espia = kvResponde({ ok: true, perfil: PERFIL })
    await expect(usuarioValido('', '', '')).resolves.toBeNull()
    await expect(usuarioValido('Bruno', '', '')).resolves.toBeNull()
    expect(espia).not.toHaveBeenCalled()
  })

  it('si el KV dice que no, es null', async () => {
    kvResponde({ ok: false })
    await expect(usuarioValido('Bruno', 'mala', '')).resolves.toBeNull()
  })

  it('un ok sin perfil tampoco alcanza', async () => {
    kvResponde({ ok: true })
    await expect(usuarioValido('Bruno', 'secreta', '')).resolves.toBeNull()
  })

  it('si bdi-catalogo se cae, es null y no una excepción', async () => {
    // El modo de falla que este archivo agrega, y está documentado: si el KV se cae, estos
    // endpoints devuelven 403 y Conteo depósito deja de andar. Lo que NO puede pasar es que
    // reviente hacia arriba, ni que deje pasar a alguien.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    await expect(usuarioValido('Bruno', 'secreta', '')).resolves.toBeNull()
  })
})

describe('exigirUsuario: el guard que usan todos los handlers', () => {
  it('devuelve el perfil y no toca el res', async () => {
    kvResponde({ ok: true, perfil: PERFIL })
    const res = resFalso()
    await expect(exigirUsuario({ headers: { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'secreta' }) } }, res))
      .resolves.toEqual(PERFIL)
    expect(res.code).toBe(0)
  })

  it('sin credenciales contesta 403 y devuelve null', async () => {
    kvResponde({ ok: false })
    const res = resFalso()
    await expect(exigirUsuario({ headers: {} }, res)).resolves.toBeNull()
    expect(res.code).toBe(403)
  })

  it('no se puede suplantar a nadie por parámetro', async () => {
    // El perfil NUNCA sale del request: sale de lo que contesta el KV. Mandar un perfil, un
    // email o un admin:true en el body no cambia quién sos. Si alguien algún día "optimiza"
    // esto leyendo algo del request, este test se cae.
    kvResponde({ ok: true, perfil: { name: 'Local', admin: false } })
    const res = resFalso()
    const perfil = await exigirUsuario(
      { headers: { 'x-monitor-auth': sobre({ user: 'Local', pass: 'p' }) },
        body: { perfil: { admin: true }, admin: true, email: 'bruno@arebensrl.com' } },
      res,
    )
    expect(perfil).toEqual({ name: 'Local', admin: false })
  })
})

describe('soloMismoOrigen: la ausencia de CORS es la defensa', () => {
  it('NO emite Access-Control-Allow-Origin', () => {
    // Esto no es un olvido y por eso se prueba: el Monitor llama a sus endpoints con rutas
    // relativas, o sea same-origin, y una request same-origin no necesita CORS. El `*` que
    // había no habilitaba ningún uso legítimo — sólo dejaba que cualquier sitio que visitara
    // alguien del equipo disparara estas llamadas desde su browser.
    //
    // Como no hay cookies de sesión, el sobre `x-monitor-auth` es un header custom que obliga
    // al preflight, y sin ACAO el preflight falla. Ahí muere el CSRF. Un `setHeader` de más
    // acá lo revive sin que se rompa ninguna pantalla, que es justo lo que un test tiene que
    // atajar.
    const res = resFalso()
    soloMismoOrigen({ method: 'POST' }, res, 'POST, OPTIONS')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('la respuesta no se cachea', () => {
    const res = resFalso()
    soloMismoOrigen({ method: 'POST' }, res, 'POST, OPTIONS')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['vary']).toBe('Origin')
  })

  it('contesta el preflight con 204 y le dice al handler que corte', () => {
    const res = resFalso()
    expect(soloMismoOrigen({ method: 'OPTIONS' }, res, 'GET, POST, OPTIONS')).toBe(true)
    expect(res.code).toBe(204)
    expect(res.ended).toBe(true)
    expect(res.headers['allow']).toBe('GET, POST, OPTIONS')
  })

  it('con cualquier otro método deja seguir', () => {
    expect(soloMismoOrigen({ method: 'POST' }, resFalso(), 'POST, OPTIONS')).toBe(false)
  })
})
