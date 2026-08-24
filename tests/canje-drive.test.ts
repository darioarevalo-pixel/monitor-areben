import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **Archivar en Drive el contenido de un canje** (tanda 2, 21-ago-2026).
 *
 * Los bytes no pasan por el servidor: del buzón a Drive va el browser, con la cuenta de Google de
 * quien apreta. Lo único que hace el servidor —y lo que se prueba acá— es el paso que **destruye**:
 * anotar dónde quedó el archivo y **borrarlo del Blob**. Después de eso el link de Drive es la única
 * forma de llegar al material, así que lo que se fija es:
 *
 *  1. **Se anota ANTES de borrar.** Al revés, un borrado que sale bien seguido de un update que
 *     falla deja la fila apuntando a una URL muerta: el material existe en Drive y nadie lo sabe.
 *  2. **La URL que se borra sale de LA FILA, nunca del body.** Si viniera de afuera, esta acción
 *     sería un borrado del Blob a pedido con sólo saber un id de evidencia.
 *  3. **Sólo se borra de `canjes/`.** La lista de carpetas la decide el llamador, no la URL: el
 *     mismo verbo puede vaciar la galería de Ingresos o las piezas de Meta.
 *  4. **El link tiene que ser de Drive.** Termina siendo un `<a href>` en la ficha del equipo.
 *  5. **La subcarpeta se guarda una sola vez.** Google da el permiso por archivo y por persona: la
 *     que creó una sesión no la ve la app de otra, y un segundo archivado que pisara la columna
 *     dejaría el canje partido en dos carpetas gemelas.
 */

import { idDeCarpetaDrive } from '@/lib/drive/archivos'
import { nombreArchivoDrive, nombreCarpetaCanje, nombreOriginal } from '@/lib/canjes/drive'

// ── Las reglas puras ───────────────────────────────────────────────────────────

describe('el link de la carpeta que se pega en Ajustes', () => {
  it('lee el id de las tres formas en que Google reparte el mismo link', () => {
    const ID = '1jMbK5_6S3tHRJzP_2gEVogUQmuhS6AQA'
    expect(idDeCarpetaDrive(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID)
    expect(idDeCarpetaDrive(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`)).toBe(ID)
    expect(idDeCarpetaDrive(`https://drive.google.com/open?id=${ID}`)).toBe(ID)
    expect(idDeCarpetaDrive(`  ${ID}  `)).toBe(ID)
  })

  it('⛔ no acepta el link de un ARCHIVO ni cualquier cosa pegada de un chat', () => {
    for (const malo of [
      'https://drive.google.com/file/d/1jMbK5_6S3tHRJzP_2gEVogUQmuhS6AQA/view',
      'https://docs.google.com/document/d/1jMbK5_6S3tHRJzP_2gEVogUQmuhS6AQA/edit',
      'https://malo.io/open?id=1jMbK5_6S3tHRJzP_2gEVogUQmuhS6AQA',
      'la carpeta de las creadoras', '', null, undefined,
    ]) {
      expect(idDeCarpetaDrive(malo), String(malo)).toBeNull()
    }
  })
})

describe('cómo se llama lo que queda en Drive', () => {
  it('la subcarpeta arranca por el nombre, después la fecha y después el canje', () => {
    expect(nombreCarpetaCanje('2026-08-21', 'lucia.mendez', 'C-0064'))
      .toBe('@lucia.mendez · 2026-08-21 · C-0064')
    // El @ que alguien haya dejado tipeado no se duplica.
    expect(nombreCarpetaCanje('2026-08-21', '@lucia.mendez', 'C-0064'))
      .toBe('@lucia.mendez · 2026-08-21 · C-0064')
  })

  it('sin Instagram no queda un separador colgando adelante', () => {
    expect(nombreCarpetaCanje('2026-08-21', '', 'C-0064')).toBe('2026-08-21 · C-0064')
  })

  it('🔴 una barra en el nombre no crea una carpeta fantasma', () => {
    expect(nombreCarpetaCanje('2026-08-21', 'lu/cia', 'C-0064')).not.toContain('/')
    expect(nombreArchivoDrive(1, 'https://x.public.blob.vercel-storage.com/canjes/64/a%2Fb.jpg')).not.toContain('/')
  })

  it('le saca al nombre el sufijo al azar que le pega el buzón', () => {
    // Medido contra la galería de Ingresos: 30 caracteres pegados con un guion antes de la extensión.
    expect(nombreOriginal('https://x.public.blob.vercel-storage.com/canjes/64/IMG_4821-01C9Y95YVuIyutw6CcOLf6NeTTqHQr.jpg'))
      .toBe('IMG_4821.jpg')
    expect(nombreArchivoDrive(3, 'https://x.public.blob.vercel-storage.com/canjes/64/IMG_4821-01C9Y95YVuIyutw6CcOLf6NeTTqHQr.jpg'))
      .toBe('03-IMG_4821.jpg')
  })

  it('⚠️ un nombre que sólo SE PARECE al sufijo se deja entero', () => {
    // 29 caracteres, no 30: mejor un nombre largo que uno cortado a mitad de palabra.
    expect(nombreOriginal('https://x.public.blob.vercel-storage.com/canjes/64/reel-01C9Y95YVuIyutw6CcOLf6NeTTqH.mp4'))
      .toBe('reel-01C9Y95YVuIyutw6CcOLf6NeTTqH.mp4')
    expect(nombreOriginal('https://x.public.blob.vercel-storage.com/canjes/64/mi-video-de-agosto.mp4'))
      .toBe('mi-video-de-agosto.mp4')
  })
})

// ── El verbo que borra ─────────────────────────────────────────────────────────

const BLOB = 'https://abc123.public.blob.vercel-storage.com/canjes/12/reel-01C9Y95YVuIyutw6CcOLf6NeTTqHQr.mp4'
const DRIVE = 'https://drive.google.com/file/d/1Z-SQT1VOXDFFK_RNxpqM8-LmZkbX7wYm/view'

type Mundo = {
  canje: Record<string, unknown>
  evidencia: Record<string, unknown> | null
  /** Cada `update` en orden, con la tabla. El ORDEN contra el borrado es la mitad del test. */
  pasos: string[]
  updates: { tabla: string; campos: Record<string, unknown> }[]
  borrados: { url: string; carpetas: string[] }[]
  fallaElUpdate: boolean
  fallaElBlob: boolean
}

let mundo: Mundo

function nuevoMundo(): Mundo {
  return {
    canje: { id: 12, store: 'bdi', estado: 'en_curso', retiro_local: false, drive_carpeta_id: null },
    evidencia: { id: 99, archivo_url: BLOB, drive_url: null },
    pasos: [],
    updates: [],
    borrados: [],
    fallaElUpdate: false,
    fallaElBlob: false,
  }
}

function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: { tabla: string; update: Record<string, unknown> | null; borra: boolean } =
      { tabla, update: null, borra: false }

    const resolver = async () => {
      if (ctx.borra) {
        mundo.pasos.push(`borrarFila:${ctx.tabla}`)
        return { data: null, error: null }
      }
      if (ctx.update) {
        if (mundo.fallaElUpdate && ctx.tabla === 'canje_evidencias') {
          return { data: null, error: { message: 'se cayó la base' } }
        }
        mundo.pasos.push(`update:${ctx.tabla}`)
        mundo.updates.push({ tabla: ctx.tabla, campos: ctx.update })
        return { data: null, error: null }
      }
      if (ctx.tabla === 'canjes') return { data: mundo.canje, error: null }
      if (ctx.tabla === 'canje_evidencias') return { data: mundo.evidencia, error: null }
      if (ctx.tabla === 'canje_config') return { data: { tope_evidencias_por_canje: 30 }, error: null }
      return { data: null, error: null }
    }

    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      is: () => api,
      order: () => api,
      update: (row: Record<string, unknown>) => { ctx.update = row; return api },
      delete: () => { ctx.borra = true; return api },
      maybeSingle: () => resolver(),
      single: () => resolver(),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => resolver().then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))

// La sesión no es lo que se prueba acá: quien archiva es alguien que ya entró al monitor y ve la
// marca. El gate de marca es el mismo que el de borrar una evidencia, y lo cubre `canjes-flujo`.
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => ({ name: 'Bruno', email: 'bruno@arebensrl.com', admin: true }),
}))

vi.mock('@/api/_blob.js', () => ({
  borrarBlob: async (url: string, carpetas: string[]) => {
    mundo.pasos.push('borrarBlob')
    mundo.borrados.push({ url, carpetas })
    return mundo.fallaElBlob ? { ok: false, status: 500, error: 'se cayó' } : { ok: true }
  },
  // El de verdad mira el host además del camino. Acá alcanza con eso: lo que este archivo prueba es
  // **cuándo** se llama al borrado, no cómo se parsea una URL (eso vive en su propio test).
  pathnameDeBlob: (url: string) => {
    try {
      const u = new URL(String(url))
      return /\.blob\.vercel-storage\.com$/i.test(u.hostname) ? u.pathname.replace(/^\/+/, '') : null
    } catch { return null }
  },
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() { return r },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

async function archivar(body: Record<string, unknown>) {
  const mod = await import('@/api/_canjes.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', headers: {}, query: {}, body: { store: 'bdi', action: 'evidencia-archivada', id: 12, ...body } },
    res,
  )
  return res
}

beforeEach(() => {
  vi.resetModules()
  mundo = nuevoMundo()
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('evidencia-archivada — anotar dónde quedó y sacarlo del buzón', () => {
  it('anota el link de Drive y borra el archivo del Blob, EN ESE ORDEN', async () => {
    const res = await archivar({ evidencia_id: 99, drive_url: DRIVE })
    expect(res.code).toBe(200)
    expect(res.body?.buzon).toBe('borrado')

    // 🔴 El orden es la regla: primero se anota, después se destruye.
    expect(mundo.pasos).toEqual(['update:canje_evidencias', 'borrarBlob'])
    expect(mundo.updates[0].campos.drive_url).toBe(DRIVE)
    expect(mundo.updates[0].campos.drive_por).toBe('Bruno')
    expect(mundo.updates[0].campos.drive_at).toBeTruthy()
  })

  it('🔴 borra LA URL DE LA FILA, no la que venga en el pedido', async () => {
    await archivar({ evidencia_id: 99, drive_url: DRIVE, archivo_url: 'https://abc123.public.blob.vercel-storage.com/ingresos/foto.jpg' })
    expect(mundo.borrados).toHaveLength(1)
    expect(mundo.borrados[0].url).toBe(BLOB)
  })

  it('🔴 sólo deja tocar la carpeta `canjes`', async () => {
    await archivar({ evidencia_id: 99, drive_url: DRIVE })
    expect(mundo.borrados[0].carpetas).toEqual(['canjes'])
  })

  it('si el update falla, NO se borra nada del buzón', async () => {
    mundo.fallaElUpdate = true
    const res = await archivar({ evidencia_id: 99, drive_url: DRIVE })
    expect(res.code).toBe(500)
    expect(mundo.borrados).toHaveLength(0)
  })

  it('un link que no es de Drive no entra, y no borra nada', async () => {
    for (const malo of ['https://malo.io/file/d/x/view', 'javascript:alert(1)', 'drive.google.com/file/d/x', '']) {
      const res = await archivar({ evidencia_id: 99, drive_url: malo })
      expect(res.code, malo).toBe(400)
    }
    expect(mundo.borrados).toHaveLength(0)
    expect(mundo.updates).toHaveLength(0)
  })

  it('una evidencia que no es de este canje da 404 y no borra nada', async () => {
    mundo.evidencia = null
    const res = await archivar({ evidencia_id: 99, drive_url: DRIVE })
    expect(res.code).toBe(404)
    expect(mundo.borrados).toHaveLength(0)
  })

  it('guarda la subcarpeta del canje, y NO la pisa si ya tenía una', async () => {
    await archivar({ evidencia_id: 99, drive_url: DRIVE, carpeta_id: '1CarpetaNueva_-abcdefghij' })
    const guardado = mundo.updates.find((u) => u.tabla === 'canjes')
    expect(guardado?.campos.drive_carpeta_id).toBe('1CarpetaNueva_-abcdefghij')

    // La misma acción con el canje ya apuntado: no se vuelve a escribir la columna.
    mundo = nuevoMundo()
    mundo.canje.drive_carpeta_id = '1LaQueYaEstaba_-abcdefg'
    await archivar({ evidencia_id: 99, drive_url: DRIVE, carpeta_id: '1CarpetaNueva_-abcdefghij' })
    expect(mundo.updates.some((u) => u.tabla === 'canjes')).toBe(false)
  })

  it('un id de carpeta con forma rara no se guarda (termina siendo un `parents` de Drive)', async () => {
    await archivar({ evidencia_id: 99, drive_url: DRIVE, carpeta_id: "' or 1=1 --" })
    expect(mundo.updates.some((u) => u.tabla === 'canjes')).toBe(false)
  })

  it('una evidencia sin archivo se anota igual, sin inventar un borrado', async () => {
    mundo.evidencia = { id: 99, archivo_url: null, drive_url: null }
    const res = await archivar({ evidencia_id: 99, drive_url: DRIVE })
    expect(res.code).toBe(200)
    expect(res.body?.buzon).toBe('sin archivo')
    expect(mundo.borrados).toHaveLength(0)
  })
})

/**
 * **Borrar una evidencia desde el panel.** Hasta el 24-ago-2026 esto sacaba la fila y dejaba el
 * archivo arriba: por eso el bloque del contenido de ella no ofrecía borrar, y por eso lo que se
 * arregló primero fue el verbo y no el botón.
 *
 * Es el mismo par de operaciones que archivar, **en el orden inverso**, y esa inversión es
 * deliberada: allá lo caro es perder el material (la fila es lo único que dice dónde quedó), acá lo
 * caro es dejarlo arriba sin ninguna fila que lo nombre.
 */
describe('evidencia-borrar — sacar la fila Y el archivo', () => {
  async function borrar(body: Record<string, unknown> = {}) {
    const mod = await import('@/api/_canjes.js')
    const res = resFalso()
    await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
      { method: 'POST', headers: {}, query: {}, body: { store: 'bdi', action: 'evidencia-borrar', id: 12, evidencia_id: 99, ...body } },
      res,
    )
    return res
  }

  it('borra el Blob primero y la fila después', async () => {
    const res = await borrar()
    expect(res.code).toBe(200)
    expect(mundo.pasos).toEqual(['borrarBlob', 'borrarFila:canje_evidencias'])
    // Y sólo se toca la carpeta de canjes, nunca la de Ingresos ni la de Meta.
    expect(mundo.borrados[0]).toEqual({ url: BLOB, carpetas: ['canjes'] })
  })

  it('🔴 si el Blob no se pudo borrar, la fila se queda: un huérfano no se puede volver a encontrar', async () => {
    mundo.fallaElBlob = true
    const res = await borrar()
    expect(res.code).toBe(500)
    expect(mundo.pasos).toEqual(['borrarBlob'])
  })

  it('lo que ya está en Drive sólo pierde el registro: el Blob ya se vació al archivar', async () => {
    mundo.evidencia = { id: 99, archivo_url: BLOB, drive_url: DRIVE }
    const res = await borrar()
    expect(res.code).toBe(200)
    expect(mundo.pasos).toEqual(['borrarFila:canje_evidencias'])
  })

  it('una evidencia que es un LINK y no un archivo no manda a borrar nada', async () => {
    mundo.evidencia = { id: 99, archivo_url: 'https://instagram.com/p/abc', drive_url: null }
    const res = await borrar()
    expect(res.code).toBe(200)
    expect(mundo.pasos).toEqual(['borrarFila:canje_evidencias'])
  })

  it('⛔ tampoco borra de otra carpeta del Blob, aunque la fila la nombre', async () => {
    mundo.evidencia = {
      id: 99,
      archivo_url: 'https://abc123.public.blob.vercel-storage.com/ingresos/foto.jpg',
      drive_url: null,
    }
    const res = await borrar()
    expect(res.code).toBe(200)
    expect(mundo.pasos).toEqual(['borrarFila:canje_evidencias'])
  })

  it('una evidencia de otro canje no se borra', async () => {
    mundo.evidencia = null
    const res = await borrar()
    expect(res.code).toBe(404)
    expect(mundo.pasos).toEqual([])
  })
})
