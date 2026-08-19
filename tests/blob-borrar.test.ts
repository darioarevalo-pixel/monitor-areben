import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El borrado de archivos del Blob (`POST /api/blob-upload {accion:'borrar'}`).
 *
 * Nació con la subida de videos a la galería de Ingresos proyectados: hasta entonces **nada borraba
 * nunca**, y sacar un ítem de la galería lo quitaba del KV dejando el archivo arriba para siempre.
 * Con miniaturas de 30 KB no se notaba; con un video de la proveedora, sí.
 *
 * Es la única operación de esa puerta que **destruye** algo, así que lo que se fija acá es quién
 * puede y qué puede tocar:
 *   - tener sesión no alcanza: hace falta el mismo permiso que dibuja el × de la galería;
 *   - sólo la carpeta `ingresos/` (una pieza de Meta o la foto de un reclamo no se borran de acá);
 *   - sólo URLs de nuestro Blob, mirando el **host** — lo que llega es una URL guardada en un KV
 *     cuyo GET está abierto.
 *
 * Cada caso que rechaza comprueba además que `del()` **no se haya llamado**: un 403 que contesta
 * después de borrar no protege nada.
 */

const borrados: string[] = []
vi.mock('@vercel/blob', () => ({
  del: vi.fn(async (url: string) => { borrados.push(String(url)) }),
  put: vi.fn(async () => ({ url: 'https://x.public.blob.vercel-storage.com/ingresos/foto.jpg' })),
}))

/**
 * El SDK de cliente, reducido a lo único que este archivo quiere ver: **con qué reglas se firma el
 * permiso de subida**. El mock corre el `onBeforeGenerateToken` del handler con el pathname que
 * mandaría el browser y devuelve lo que decidió (o la excepción con la que lo rechazó).
 */
vi.mock('@vercel/blob/client', () => ({
  handleUpload: vi.fn(async ({ body, onBeforeGenerateToken }: {
    body: { pathname?: string }
    onBeforeGenerateToken: (p: string) => Promise<{ allowedContentTypes: string[]; maximumSizeInBytes: number }>
  }) => ({ reglas: await onBeforeGenerateToken(String(body.pathname || '')) })),
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

/** El KV contesta que la identidad es válida, con el perfil que se le pase. El permiso es otra cosa. */
function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

const pedido = (body: unknown) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  body,
})

/** Alguien del equipo que entra al Monitor y no tiene Ingresos proyectados. */
const SIN_NADA = { name: 'Depósito', admin: false, cuenta: null, acceso: {}, funcion: [] }
/** El permiso granular que dibuja el × en la galería. */
const CON_EDITAR = { name: 'Quien Sea', admin: false, cuenta: null, acceso: { bdi: { 'ingresos.editar': true } }, funcion: [] }
/** El permiso chico de la sección: escribe el nombre de un diseño, NO borra archivos. */
const SOLO_NOMBRE = { name: 'Quien Sea', admin: false, cuenta: null, acceso: { bdi: { 'ingresos.nombre': true } }, funcion: [] }

const URL_INGRESOS = 'https://abc123.public.blob.vercel-storage.com/ingresos/video-x1y2.mp4'

async function borrar(url: string, perfil: unknown) {
  sesionDe(perfil)
  const mod = await import('@/api/blob-upload.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(pedido({ accion: 'borrar', url }), res)
  return res
}

beforeEach(() => {
  vi.resetModules()
  borrados.length = 0
  // Sin esto `hayBlob()` da false y el handler corta con 500 antes de llegar a lo que se prueba.
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'token-de-prueba')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('borrar del Blob — quién puede', () => {
  it('con el permiso de editar Ingresos, borra', async () => {
    const res = await borrar(URL_INGRESOS, CON_EDITAR)
    expect(res.code).toBe(200)
    expect(borrados).toEqual([URL_INGRESOS])
  })

  it('el admin también', async () => {
    const res = await borrar(URL_INGRESOS, { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] })
    expect(res.code).toBe(200)
    expect(borrados).toHaveLength(1)
  })

  it('🔴 tener sesión NO alcanza: sin el permiso, 403 y no se borra nada', async () => {
    const res = await borrar(URL_INGRESOS, SIN_NADA)
    expect(res.code).toBe(403)
    expect(borrados, 'contestó 403 pero ya había borrado').toHaveLength(0)
  })

  it('el permiso chico (`ingresos.nombre`) escribe nombres, no borra archivos', async () => {
    // Los dos permisos de la sección existen justamente para que "anotar el nombre de un diseño" no
    // pida el mismo poder que sacar una foto: si acá pasara, esa separación no significaría nada.
    const res = await borrar(URL_INGRESOS, SOLO_NOMBRE)
    expect(res.code).toBe(403)
    expect(borrados).toHaveLength(0)
  })
})

describe('borrar del Blob — qué se puede tocar', () => {
  it('⛔ una carpeta que no es `ingresos` se rechaza', async () => {
    const res = await borrar('https://abc123.public.blob.vercel-storage.com/piezas/reel.mp4', CON_EDITAR)
    expect(res.code).toBe(403)
    expect(borrados).toHaveLength(0)
  })

  it('⛔ una URL que no es de nuestro Blob se rechaza mirando el HOST', async () => {
    // El caso real: un ítem de la galería agregado con "+ link". No hay nada nuestro que borrar.
    const res = await borrar('https://drive.google.com/ingresos/video.mp4', CON_EDITAR)
    expect(res.code).toBe(400)
    expect(borrados).toHaveLength(0)
  })

  it('⛔ un archivo suelto en la raíz del store se rechaza', async () => {
    const res = await borrar('https://abc123.public.blob.vercel-storage.com/suelto.mp4', CON_EDITAR)
    expect(res.code).toBe(403)
    expect(borrados).toHaveLength(0)
  })

  it('una URL rota no llega al SDK', async () => {
    const res = await borrar('no-es-una-url', CON_EDITAR)
    expect(res.code).toBe(400)
    expect(borrados).toHaveLength(0)
  })
})

describe('permiso de subida — la carpeta la fija el SERVIDOR', () => {
  async function pedirPermiso(pathname: string, perfil: unknown = CON_EDITAR) {
    sesionDe(perfil)
    const mod = await import('@/api/blob-upload.js')
    const res = resFalso()
    const body = { type: 'blob.generate-client-token', pathname }
    await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(pedido(body), res)
    return res
  }

  it('`ingresos/` se firma, con su tope de 200 MB y los formatos de la tabla', async () => {
    const res = await pedirPermiso('ingresos/video-de-la-proveedora.mp4')
    expect(res.code).toBe(200)
    const reglas = (res.body as { reglas: { allowedContentTypes: string[]; maximumSizeInBytes: number } }).reglas
    expect(reglas.maximumSizeInBytes).toBe(200 * 1024 * 1024)
    expect(reglas.allowedContentTypes).toContain('video/quicktime') // el `.mov` del celular
    expect(reglas.allowedContentTypes).toContain('image/jpeg')
  })

  it('`piezas/` sigue firmándose con SU tope, que es otro', async () => {
    // La carpeta nueva entró al lado de la de Meta Ads: si moverla a una tabla le hubiera cambiado
    // el tope a las piezas, un video de 300 MB dejaría de subir sin que nadie tocara Meta.
    const res = await pedirPermiso('piezas/reel.mp4')
    expect(res.code).toBe(200)
    expect((res.body as { reglas: { maximumSizeInBytes: number } }).reglas.maximumSizeInBytes).toBe(512 * 1024 * 1024)
  })

  it('⛔ una carpeta inventada NO se firma', async () => {
    // Sin este corte, una sesión del Monitor sirve para escribir en cualquier carpeta del Blob.
    const res = await pedirPermiso('reclamos/lo-que-sea.jpg')
    expect(res.code).toBe(400)
  })

  it('⛔ un archivo en la raíz tampoco', async () => {
    const res = await pedirPermiso('suelto.mp4')
    expect(res.code).toBe(400)
  })

  it('⛔ sin sesión no se firma nada (el 403 va ANTES de mirar el pathname)', async () => {
    sesionDe(null)
    const mod = await import('@/api/blob-upload.js')
    const res = resFalso()
    await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
      { method: 'POST', headers: {}, body: { type: 'blob.generate-client-token', pathname: 'ingresos/x.mp4' } },
      res,
    )
    expect(res.code).toBe(403)
  })
})
