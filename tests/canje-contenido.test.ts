import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **La subida del contenido de un canje**, que desde el 21-ago-2026 es lo único de `blob-upload.js`
 * que corre **sin sesión del Monitor**: la creadora sube sus fotos y sus videos desde el link que
 * le mandamos por WhatsApp, con su token por toda llave.
 *
 * Lo que fija este archivo es lo que ninguna pantalla muestra y lo que, si se rompe, se rompe
 * callado y hacia afuera:
 *
 *  1. **El orden de los guards.** La rama pública va ANTES de `exigirUsuario`. Si alguien la mueve
 *     abajo, un pedido legítimo sin sesión contesta 403 y el SDK lo traduce a «Failed to retrieve
 *     the client token» — el cartel que ya costó una semana de subidas muertas en Meta Ads.
 *  2. **Que el token decida la carpeta.** Un token del canje 5 no firma nada de `canjes/6/`, ni de
 *     `ingresos/`, ni de `fundas/`. Sin esto, un link filtrado es permiso de escritura en todo el
 *     Blob, incluidas las fotos de los reclamos.
 *  3. **Que el tope se cuente ANTES de firmar.** Firmar y dejar que falle al registrar le regala a
 *     cualquiera con el link una escritura gratis por intento.
 *  4. **Que la URL que se registra sea del Blob y de ESE canje.** No hay `onUploadCompleted`: la
 *     URL la manda el browser, o sea que llega de afuera. Sin el chequeo, el link público sirve
 *     para dejar cualquier URL de internet colgada adentro de la ficha que mira el equipo.
 *  5. **Que lo que sube nazca sin verificar.** Una evidencia sin verificar no cuenta para el
 *     cumplimiento: subir diez fotos no puede cerrarle un reel sola.
 */

// ── El mundo de mentira ────────────────────────────────────────────────────────
// Un canje, su config y sus evidencias. Cada test lo mueve y mira qué contesta el handler.
type Mundo = {
  canje: Record<string, unknown> | null
  config: Record<string, unknown> | null
  evidencias: number
  insertado: Record<string, unknown> | null
  /** La fila que devuelve un `maybeSingle()` sobre `canje_evidencias`: la que se va a borrar. */
  evidencia: Record<string, unknown> | null
  /** Qué pasó, en orden: es lo que prueba que el Blob se borra ANTES que la fila. */
  pasos: string[]
  /** Si el `del()` del Blob tiene que fallar. */
  blobFalla: boolean
  /** Se prende si alguien consulta la base. Es lo que prueba que un gate cortó ANTES. */
  tocoLaBase: boolean
}

let mundo: Mundo

function nuevoMundo(): Mundo {
  return {
    canje: { id: 12, store: 'bdi', estado: 'en_curso', token_vence: null, persona_id: 1, retiro_local: false },
    config: { drive_url: null, tope_evidencias_por_canje: 30 },
    evidencias: 0,
    insertado: null,
    evidencia: {
      id: 99, archivo_url: 'https://abc.public.blob.vercel-storage.com/canjes/12/reel-x9.mp4',
      subido_por: 'persona', verificada: false, rechazada_motivo: null, entregable_id: null, drive_url: null,
    },
    pasos: [],
    blobFalla: false,
    tocoLaBase: false,
  }
}

/**
 * El mínimo de supabase-js que estos dos handlers usan. Es una cadena que se puede esperar en dos
 * puntos: `.maybeSingle()`/`.single()` y el `.eq()` final del `count` (que se awaitea derecho).
 */
function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: {
      tabla: string; head: boolean; insert: Record<string, unknown> | null; uno: boolean; borra: boolean
    } = { tabla, head: false, insert: null, uno: false, borra: false }

    const resolver = async () => {
      mundo.tocoLaBase = true
      if (ctx.insert) {
        mundo.insertado = ctx.insert
        return { data: { id: 99, ...ctx.insert, created_at: '2026-08-21T00:00:00Z' }, error: null }
      }
      if (ctx.borra) {
        mundo.pasos.push(`fila:${ctx.tabla}`)
        return { data: null, error: null }
      }
      if (ctx.tabla === 'canjes') return { data: mundo.canje, error: null }
      if (ctx.tabla === 'canje_config') return { data: mundo.config, error: null }
      if (ctx.tabla === 'canje_evidencias') {
        if (ctx.head) return { data: null, count: mundo.evidencias, error: null }
        return ctx.uno ? { data: mundo.evidencia, error: null } : { data: [], error: null }
      }
      return { data: null, error: null }
    }

    const api: Record<string, unknown> = {
      select: (_cols: string, opts?: { head?: boolean }) => { ctx.head = !!opts?.head; return api },
      eq: () => api,
      order: () => api,
      insert: (row: Record<string, unknown>) => { ctx.insert = row; return api },
      delete: () => { ctx.borra = true; return api },
      maybeSingle: () => { ctx.uno = true; return resolver() },
      single: () => { ctx.uno = true; return resolver() },
      // El `count` se espera sin `.maybeSingle()`: la cadena tiene que ser esperable ella misma.
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => resolver().then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))

/**
 * El SDK del Blob del lado del servidor. Lo único que se le pide acá es `del()`, y lo que el test
 * mira es **cuándo** se llamó: el borrado del archivo tiene que pasar ANTES del de la fila.
 */
vi.mock('@vercel/blob', () => ({
  del: async (url: string) => {
    if (mundo.blobFalla) throw new Error('el Blob se cayó')
    mundo.pasos.push(`blob:${url}`)
  },
  put: async () => ({ url: 'https://abc.public.blob.vercel-storage.com/x' }),
}))

/**
 * El SDK del Blob, reducido a lo único que este handler le pide: correr `onBeforeGenerateToken` con
 * el `pathname` que mandó el browser. Lo que devuelve es lo que el test mira para saber **con qué
 * reglas se firmó**; lo que tira es lo que el test mira para saber que NO se firmó.
 */
vi.mock('@vercel/blob/client', () => ({
  handleUpload: async ({ body, onBeforeGenerateToken }: {
    body: { payload?: { pathname?: string; clientPayload?: string } }
    onBeforeGenerateToken: (p: string, c?: string) => Promise<Record<string, unknown>>
  }) => {
    const reglas = await onBeforeGenerateToken(body.payload?.pathname || '', body.payload?.clientPayload)
    return { firmado: true, reglas }
  },
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const TOKEN = 'a'.repeat(64)

/** Un pedido de permiso de subida, tal como lo arma `upload()` de `@vercel/blob/client`. */
function pedidoDeFirma(pathname: string, clientPayload: string | null = `canje:${TOKEN}`) {
  return {
    method: 'POST',
    headers: {},
    body: { type: 'blob.generate-client-token', payload: { pathname, clientPayload: clientPayload ?? undefined } },
  }
}

async function firmar(req: unknown) {
  const mod = await import('@/api/blob-upload.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

async function portal(body: unknown) {
  const mod = await import('@/api/_canje-portal.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)({ method: 'POST', headers: {}, body }, res)
  return res
}

beforeEach(() => {
  vi.resetModules()
  mundo = nuevoMundo()
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
  // Sin esto `hayBlob()` es false y el handler corta en 500 antes de llegar a lo que se prueba.
  vi.stubEnv('BLOB_STORE_ID', 'store_test')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

// ── Las reglas puras ───────────────────────────────────────────────────────────

describe('_canje-token — las reglas que no hablan con nada', () => {
  it('sólo tiene forma de token lo que es hex y largo', async () => {
    const { esTokenDeCanje } = await import('@/api/_canje-token.js')
    expect(esTokenDeCanje(TOKEN)).toBe(true)
    for (const malo of ['', '12', 'z'.repeat(64), '../../etc/passwd', "' or 1=1 --", TOKEN + '!', null, { id: 1 }, true]) {
      expect(esTokenDeCanje(malo as string)).toBe(false)
    }
  })

  it('`en_curso` está abierto — es el estado en que ella tiene que entregar el contenido', async () => {
    const { ABIERTO } = await import('@/api/_canje-token.js')
    expect(ABIERTO).toContain('en_curso')
    // Y los terminales NO: `cerrar` revoca el token, y esta lista es la segunda vuelta de llave.
    for (const t of ['cerrado', 'cancelado', 'rechazado', 'no_acepto']) expect(ABIERTO).not.toContain(t)
  })

  it('una URL es del contenido sólo si es del Blob Y de la carpeta de ESE canje', async () => {
    const { esUrlDeContenido } = await import('@/api/_canje-token.js')
    expect(esUrlDeContenido('https://abc123.public.blob.vercel-storage.com/canjes/12/reel-x9.mp4', 12)).toBe(true)

    const rechazadas: [string, string][] = [
      ['la carpeta del canje de al lado', 'https://abc.public.blob.vercel-storage.com/canjes/13/reel.mp4'],
      ['un canje con el mismo prefijo de dígitos', 'https://abc.public.blob.vercel-storage.com/canjes/120/reel.mp4'],
      ['otra carpeta del mismo Blob', 'https://abc.public.blob.vercel-storage.com/ingresos/reel.mp4'],
      ['un host que TERMINA parecido', 'https://malopublic.blob.vercel-storage.com/canjes/12/reel.mp4'],
      ['un host que arranca igual', 'https://abc.public.blob.vercel-storage.com.malo.io/canjes/12/reel.mp4'],
      ['cualquier lugar de internet', 'https://malo.io/canjes/12/reel.mp4'],
      ['sin TLS', 'http://abc.public.blob.vercel-storage.com/canjes/12/reel.mp4'],
      ['la carpeta pelada, sin archivo', 'https://abc.public.blob.vercel-storage.com/canjes/12'],
      ['ni siquiera una URL', 'reel.mp4'],
      ['vacío', ''],
    ]
    for (const [porQue, url] of rechazadas) {
      expect(esUrlDeContenido(url, 12), porQue).toBe(false)
    }
  })
})

// ── El permiso de subida ───────────────────────────────────────────────────────

describe('blob-upload — la rama de la creadora', () => {
  it('🔴 firma SIN sesión del Monitor: si esto se cae, la rama quedó debajo de `exigirUsuario`', async () => {
    const res = await firmar(pedidoDeFirma('canjes/12/reel.mp4'))
    expect(res.code).toBe(200)
    expect(res.body?.firmado).toBe(true)
  })

  it('firma con los formatos de media y sin achicar: el archivo va original', async () => {
    const res = await firmar(pedidoDeFirma('canjes/12/foto.jpg'))
    const reglas = (res.body?.reglas || {}) as Record<string, unknown>
    expect(reglas.allowedContentTypes).toContain('video/quicktime')  // el .mov del iPhone
    expect(reglas.allowedContentTypes).toContain('image/jpeg')
    expect(reglas.maximumSizeInBytes).toBe(200 * 1024 * 1024)
    // Dos creadoras suben `reel.mp4` y ninguna pisa a la otra.
    expect(reglas.addRandomSuffix).toBe(true)
  })

  it('🔴 el token del canje 12 NO firma la carpeta de otro canje ni la de otra sección', async () => {
    for (const pathname of [
      'canjes/13/reel.mp4', 'ingresos/reel.mp4', 'fundas/foto.jpg', 'reclamos/foto.jpg', 'reel.mp4', 'canjes/12',
      // La carpeta tiene que estar al PRINCIPIO. Si alcanzara con que aparezca, este pathname
      // escribiría adentro de `fundas/` con el token de un canje.
      'fundas/canjes/12/reel.mp4',
      'reclamos/../canjes/12/reel.mp4',
    ]) {
      const res = await firmar(pedidoDeFirma(pathname))
      expect(res.code, pathname).toBe(400)
      expect(res.body?.firmado, pathname).toBeUndefined()
    }
  })

  it('un token con forma inválida muere en 404 sin consultar la base', async () => {
    const res = await firmar(pedidoDeFirma('canjes/12/reel.mp4', 'canje:noesuntoken'))
    expect(res.code).toBe(404)
    expect(mundo.tocoLaBase).toBe(false)
  })

  it('un canje que ya cerró no firma nada, y contesta lo mismo que uno que no existe', async () => {
    mundo.canje = { ...(mundo.canje as object), estado: 'cerrado' }
    const cerrado = await firmar(pedidoDeFirma('canjes/12/reel.mp4'))
    mundo.canje = null
    const inexistente = await firmar(pedidoDeFirma('canjes/12/reel.mp4'))
    expect(cerrado.code).toBe(404)
    expect(cerrado.body).toEqual({ error: 'no encontrado' })
    // Desde afuera «se cerró» y «no existe» tienen que ser indistinguibles.
    expect(inexistente.body).toEqual(cerrado.body)
  })

  it('un token vencido tampoco firma', async () => {
    mundo.canje = { ...(mundo.canje as object), token_vence: '2020-01-01T00:00:00Z' }
    expect((await firmar(pedidoDeFirma('canjes/12/reel.mp4'))).code).toBe(404)
  })

  it('🔴 con el canje en el tope NO se firma — el tope se cuenta ANTES, no al registrar', async () => {
    mundo.evidencias = 30
    const res = await firmar(pedidoDeFirma('canjes/12/reel.mp4'))
    expect(res.code).toBe(409)
    expect(res.body?.firmado).toBeUndefined()
  })

  it('el tope sale de la config de la marca, no de una constante', async () => {
    mundo.config = { tope_evidencias_por_canje: 2 }
    mundo.evidencias = 2
    expect((await firmar(pedidoDeFirma('canjes/12/reel.mp4'))).code).toBe(409)
    mundo.evidencias = 1
    expect((await firmar(pedidoDeFirma('canjes/12/reel.mp4'))).code).toBe(200)
  })

  it('sin el sobre `canje:` la llamada NO es de ella y cae al camino con sesión (403, no 200)', async () => {
    // El sobre es lo que elige la rama. Sin él, el pedido pasa por `exigirUsuario` y muere ahí.
    const res = await firmar(pedidoDeFirma('canjes/12/reel.mp4', null))
    expect(res.code).not.toBe(200)
    expect(res.body?.firmado).toBeUndefined()
  })
})

// ── El registro de la URL ──────────────────────────────────────────────────────

const URL_OK = 'https://abc123.public.blob.vercel-storage.com/canjes/12/reel-x9.mp4'

describe('el portal registra el archivo que ya subió', () => {
  it('lo guarda como evidencia de ELLA, suelta y SIN verificar', async () => {
    const res = await portal({ token: TOKEN, accion: 'contenido', url: URL_OK, tipo: 'video' })
    expect(res.code).toBe(200)
    expect(mundo.insertado).toMatchObject({
      canje_id: 12,
      archivo_url: URL_OK,
      archivo_tipo: 'video',
      subido_por: 'persona',
      // 🔴 Los dos que impiden que subir material cierre un entregable solo.
      verificada: false,
      entregable_id: null,
    })
  })

  it('🔴 una URL que no es del Blob de este canje se rechaza y NO escribe nada', async () => {
    for (const url of [
      'https://malo.io/canjes/12/reel.mp4',
      'https://abc.public.blob.vercel-storage.com/canjes/13/reel.mp4',
      'https://abc.public.blob.vercel-storage.com/ingresos/reel.mp4',
      'javascript:alert(1)',
      '',
    ]) {
      mundo.insertado = null
      const res = await portal({ token: TOKEN, accion: 'contenido', url, tipo: 'imagen' })
      expect(res.code, url).toBe(400)
      expect(mundo.insertado, url).toBe(null)
    }
  })

  it('un `tipo` inventado cae a imagen en vez de entrar crudo a la base', async () => {
    await portal({ token: TOKEN, accion: 'contenido', url: URL_OK, tipo: '<script>' })
    expect(mundo.insertado?.archivo_tipo).toBe('imagen')
  })

  it('en el tope no escribe, aunque el permiso se haya firmado antes', async () => {
    // Entre firmar y registrar pasa la subida entera: el tope lo puede haber cruzado otra tanda.
    mundo.evidencias = 30
    const res = await portal({ token: TOKEN, accion: 'contenido', url: URL_OK, tipo: 'video' })
    expect(res.code).toBe(409)
    expect(mundo.insertado).toBe(null)
  })

  it('un canje cerrado no registra nada: el token ya no abre', async () => {
    mundo.canje = { ...(mundo.canje as object), estado: 'cerrado' }
    const res = await portal({ token: TOKEN, accion: 'contenido', url: URL_OK, tipo: 'video' })
    expect(res.code).toBe(404)
    expect(mundo.insertado).toBe(null)
  })

  it('una acción que no existe sigue muriendo en 400 — abrir `contenido` no abrió el portal entero', async () => {
    const res = await portal({ token: TOKEN, accion: 'borrar-todo', url: URL_OK })
    expect(res.code).toBe(400)
    expect(mundo.insertado).toBe(null)
  })
})

/**
 * **Borrar lo que subió mal.** Es el único verbo del portal que destruye, y el único del módulo que
 * borra sin que quede nada en Drive, así que lo que se fija acá es de dónde sale la URL, en qué
 * orden pasan las dos cosas, y cuándo el servidor dice que no.
 */
describe('contenido-borrar — sacar del buzón lo que subió mal', () => {
  const borrar = (evidenciaId: unknown = 99) =>
    portal({ token: TOKEN, accion: 'contenido-borrar', evidencia_id: evidenciaId })

  it('borra el archivo del Blob PRIMERO y la fila después', async () => {
    const res = await borrar()
    expect(res.code).toBe(200)
    expect(mundo.pasos).toEqual([
      'blob:https://abc.public.blob.vercel-storage.com/canjes/12/reel-x9.mp4',
      'fila:canje_evidencias',
    ])
  })

  it('🔴 si el Blob falla NO se borra la fila: un archivo huérfano no se puede volver a encontrar', async () => {
    mundo.blobFalla = true
    const res = await borrar()
    expect(res.code).toBe(500)
    expect(mundo.pasos).toEqual([])
  })

  it('lo que ya tocó el equipo no se cae solo', async () => {
    const tocados: [string, Record<string, unknown>][] = [
      ['ya está en Drive', { drive_url: 'https://drive.google.com/file/d/1' }],
      ['ya la verificaron', { verificada: true }],
      ['ya la rechazaron con un motivo', { rechazada_motivo: 'está movida' }],
      ['ya la ataron a un entregable', { entregable_id: 3 }],
    ]
    for (const [porQue, campos] of tocados) {
      mundo = nuevoMundo()
      mundo.evidencia = { ...mundo.evidencia, ...campos }
      const res = await borrar()
      expect(res.code, porQue).toBe(409)
      expect(mundo.pasos, porQue).toEqual([])
    }
  })

  it('🔴 no borra lo que subió el EQUIPO, aunque sea de este canje', async () => {
    mundo.evidencia = { ...mundo.evidencia, subido_por: 'equipo' }
    const res = await borrar()
    expect(res.code).toBe(404)
    expect(mundo.pasos).toEqual([])
  })

  it('una evidencia que no es de este canje no existe — mismo 404, no dice nada de más', async () => {
    // El `.eq('canje_id')` del handler la filtra: la base no devuelve fila.
    mundo.evidencia = null
    const res = await borrar()
    expect(res.code).toBe(404)
    expect(mundo.pasos).toEqual([])
  })

  it('sin evidencia_id no se toca nada', async () => {
    // Sin el campo, y con las formas de basura que un cliente roto puede mandar.
    const sinCampo = await portal({ token: TOKEN, accion: 'contenido-borrar' })
    expect(sinCampo.code).toBe(400)
    for (const malo of [null, '', 'abc', 0]) {
      mundo = nuevoMundo()
      const res = await borrar(malo)
      expect(res.code, String(malo)).toBe(400)
      expect(mundo.pasos, String(malo)).toEqual([])
    }
  })

  it('⛔ la URL sale de la FILA, nunca del body: mandar otra no borra otra cosa', async () => {
    const res = await portal({
      token: TOKEN,
      accion: 'contenido-borrar',
      evidencia_id: 99,
      url: 'https://abc.public.blob.vercel-storage.com/ingresos/foto.jpg',
    })
    expect(res.code).toBe(200)
    expect(mundo.pasos[0]).toBe('blob:https://abc.public.blob.vercel-storage.com/canjes/12/reel-x9.mp4')
  })
})

/**
 * **Desde cuándo tiene buzón.** Es la regla que comparten el portal (dibuja o no dibuja) y el
 * servidor, y la que cambió el 24-ago-2026: con retiro en el local se abre desde que aceptó.
 */
describe('buzonAbierto — dos cortes, no uno', () => {
  it('con envío, recién cuando el pedido llegó', async () => {
    const { buzonAbierto } = await import('@/lib/canjes/reglas.core.js')
    expect(buzonAbierto({ retiro_local: false, entregado_at: null })).toBe(false)
    expect(buzonAbierto({ retiro_local: false, entregado_at: '2026-08-21T10:00:00Z' })).toBe(true)
  })

  it('con retiro en el local, desde que aceptó: no hay tránsito que esperar', async () => {
    const { buzonAbierto } = await import('@/lib/canjes/reglas.core.js')
    expect(buzonAbierto({ retiro_local: true, entregado_at: null })).toBe(true)
  })

  it('sin canje no se dibuja nada', async () => {
    const { buzonAbierto } = await import('@/lib/canjes/reglas.core.js')
    expect(buzonAbierto(null)).toBe(false)
  })
})
