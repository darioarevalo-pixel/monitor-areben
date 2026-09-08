import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * **La pantalla «Archivos»**, del lado del servidor: el inventario del Blob y el borrado de lo que
 * quedó sin dueño.
 *
 * Nació el 7-sep-2026, el día que el store topó el giga del plan Hobby y **frenó toda subida del
 * monitor** —el link de las creadoras, las fotos de un reclamo, las piezas de Meta— sin que se
 * pudiera ver desde el monitor qué lo estaba llenando.
 *
 * 🔴 **Lo que este archivo existe para impedir es que la limpieza se coma algo vivo**, que es el
 * único error acá que no tiene vuelta atrás:
 *
 *  1. El servidor **vuelve a decidir**: la lista de URLs llega del browser, y lo que la base nombra
 *     ⛔ no se borra por más que venga pedido.
 *  2. Lo **recién subido** no se toca: los bytes llegan al Blob antes que su fila.
 *  3. Lo que ⛔ **no se pudo verificar** no es «sin dueño». Si la pantalla no mandó las referencias
 *     de la galería de Ingresos —que viven en el KV, no en esta base—, esa carpeta no se limpia.
 *  4. Las dos acciones son **admin**, y el 403 corta ANTES de mirar el store.
 */

const HOST = 'https://abc.public.blob.vercel-storage.com'

type Mundo = {
  /** Lo que contesta `list()` del Blob. */
  arriba: { pathname: string; url: string; size: number; uploadedAt: string }[]
  /** Filas por tabla, tal como las devolvería Supabase. */
  filas: Record<string, unknown[]>
  /** Qué tablas tienen que fallar (para probar que un error ⛔ no se lee como «no lo usa nadie»). */
  fallan: Set<string>
  /** Las URLs que se borraron de verdad. */
  eliminadas: string[]
  /** Se prende si alguien llegó a listar el store: prueba que el 403 cortó antes. */
  listo: boolean
}

let mundo: Mundo

const ahora = Date.now()
const hace = (horas: number) => new Date(ahora - horas * 3600 * 1000).toISOString()

function archivo(pathname: string, size: number, horas: number) {
  return { pathname, url: `${HOST}/${pathname}`, size, uploadedAt: hace(horas) }
}

function nuevoMundo(): Mundo {
  return {
    arriba: [
      archivo('canjes/71/usado.jpg', 1_000, 300),
      archivo('canjes/71/huerfano.mov', 90_000_000, 300),
      archivo('canjes/62/subiendo.mov', 50_000_000, 2),
      archivo('ingresos/video-proveedora.mp4', 40_000_000, 300),
      archivo('piezas/ASMR.mp4', 23_000_000, 300),
      archivo('piezas/IP AZUL BROAD 25-8.mp4', 73_000_000, 300),
      archivo('piezas/UNBOXING.mov', 96_000_000, 300),
    ],
    filas: {
      canje_evidencias: [{ id: 1, archivo_url: `${HOST}/canjes/71/usado.jpg` }],
      disenos: [],
      disenos_rondas: [],
      devoluciones: [],
      meta_ads_plan_paso: [
        // Subida y hecha: Meta tiene su copia ⇒ la de acá sobra.
        { id: 8, estado: 'hecho', resultado_id: '2580772105691364', pedido: { url: `${HOST}/piezas/ASMR.mp4` } },
        // 🔴 Guardada con los espacios escritos `%20`, que es como la devuelve el Blob al subirla.
        // Si la comparación no decodifica, este video de 73 MB sale «sin dueño» y se elimina — y es
        // una pieza que está viva adentro de un aviso.
        { id: 16, estado: 'hecho', resultado_id: '1614498110073985', pedido: { url: `${HOST}/piezas/IP%20AZUL%20BROAD%2025-8.mp4` } },
        // 🔴 El caso que estaba en la base el 7-sep: el MISMO archivo colgando de dos planes, uno
        // hecho y otro sin correr. El pendiente manda: si se eliminara, el otro se queda sin nada
        // que subir.
        { id: 21, estado: 'hecho', resultado_id: '2192074178326107', pedido: { url: `${HOST}/piezas/UNBOXING.mov` } },
        { id: 11, estado: 'pendiente', resultado_id: null, pedido: { url: `${HOST}/piezas/UNBOXING.mov` } },
      ],
    },
    fallan: new Set(),
    eliminadas: [],
    listo: false,
  }
}

vi.mock('@vercel/blob', () => ({
  list: async () => {
    mundo.listo = true
    return { blobs: mundo.arriba, hasMore: false, cursor: null }
  },
  del: async (url: string) => { mundo.eliminadas.push(url) },
  put: async () => ({ url: `${HOST}/x` }),
}))

vi.mock('@vercel/blob/client', () => ({ handleUpload: async () => ({ firmado: true }) }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        limit: async () => (mundo.fallan.has(tabla)
          ? { data: null, error: { message: 'se cayó' } }
          : { data: mundo.filas[tabla] || [], error: null }),
      }),
    }),
  }),
}))

let esAdminDevuelve = true
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => ({ name: 'Bruno', email: 'bruno@arebensrl.com', admin: esAdminDevuelve }),
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

async function pedir(body: unknown) {
  const mod = await import('@/api/blob-upload.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)({ method: 'POST', headers: {}, body }, res)
  return res
}

/** Las referencias que aporta la pantalla: los `pathname` de la galería de Ingresos. */
const REFS_INGRESOS = ['ingresos/video-proveedora.mp4']

beforeEach(() => {
  vi.resetModules()
  mundo = nuevoMundo()
  esAdminDevuelve = true
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test'
  // `clienteBdi()` devuelve null sin estas dos, y entonces TODAS las carpetas salen sin verificar
  // —que es el comportamiento correcto, pero deja los tests probando otra cosa que la que dicen.
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-de-mentira'
})

describe('inventario', () => {
  it('🔴 sólo admin, y el 403 corta antes de tocar el store', async () => {
    esAdminDevuelve = false
    const res = await pedir({ accion: 'inventario' })
    expect(res.code).toBe(403)
    expect(mundo.listo, 'se listó el Blob igual: el guard no cortó').toBe(false)
  })

  it('marca cada archivo con lo que la base dice de él', async () => {
    const res = await pedir({ accion: 'inventario', refsCliente: REFS_INGRESOS })
    const porNombre = Object.fromEntries(
      ((res.body?.archivos || []) as { pathname: string; estado: string }[]).map((a) => [a.pathname, a.estado]),
    )
    expect(porNombre['canjes/71/usado.jpg']).toBe('usado')
    expect(porNombre['canjes/71/huerfano.mov']).toBe('sin-dueno')
    // 🔴 Lo que está subiendo ahora: nadie lo nombra todavía y NO se ofrece.
    expect(porNombre['canjes/62/subiendo.mov']).toBe('reciente')
    // La galería la cruza la pantalla, y con sus referencias el video figura en uso.
    expect(porNombre['ingresos/video-proveedora.mp4']).toBe('usado')
    // Meta ya la tiene: la fila del plan la nombra, pero acá sobra.
    expect(porNombre['piezas/ASMR.mp4']).toBe('copia-en-meta')
    // 🔴 El nombre con espacios: la base lo guarda con `%20` y el store lo lista con espacios.
    expect(porNombre['piezas/IP AZUL BROAD 25-8.mp4'], 'la URL escapada no se reconoció').toBe('copia-en-meta')
    // 🔴 La que también cuelga de un plan SIN correr ⛔ no se ofrece.
    expect(porNombre['piezas/UNBOXING.mov'], 'un plan pendiente todavía la necesita').toBe('usado')
  })

  it('🔴 sin las referencias del cliente, Ingresos queda SIN VERIFICAR, ⛔ no «sin dueño»', async () => {
    const res = await pedir({ accion: 'inventario' })
    const porNombre = Object.fromEntries(
      ((res.body?.archivos || []) as { pathname: string; estado: string }[]).map((a) => [a.pathname, a.estado]),
    )
    expect(porNombre['ingresos/video-proveedora.mp4']).toBe('no-verificable')
    expect(res.body?.sinVerificar).toContain('ingresos')
  })

  it('🔴 una consulta que falla deja su carpeta sin verificar', async () => {
    mundo.fallan.add('canje_evidencias')
    const res = await pedir({ accion: 'inventario', refsCliente: REFS_INGRESOS })
    const porNombre = Object.fromEntries(
      ((res.body?.archivos || []) as { pathname: string; estado: string }[]).map((a) => [a.pathname, a.estado]),
    )
    expect(res.body?.sinVerificar).toContain('canjes')
    // El que la base nombraba pasa a «no sé», ⛔ no a «sobra».
    expect(porNombre['canjes/71/huerfano.mov']).toBe('no-verificable')
  })
})

describe('eliminar lo que no usa nadie', () => {
  it('borra el que está sin dueño', async () => {
    const res = await pedir({
      accion: 'eliminar-huerfanos',
      refsCliente: REFS_INGRESOS,
      urls: [`${HOST}/canjes/71/huerfano.mov`],
    })
    expect(res.code).toBe(200)
    expect(mundo.eliminadas).toEqual([`${HOST}/canjes/71/huerfano.mov`])
    expect(res.body?.eliminados).toBe(1)
    expect(res.body?.bytes).toBe(90_000_000)
  })

  it('🔴 lo que la base nombra NO se borra, aunque venga pedido', async () => {
    const res = await pedir({
      accion: 'eliminar-huerfanos',
      refsCliente: REFS_INGRESOS,
      urls: [`${HOST}/canjes/71/usado.jpg`, `${HOST}/piezas/UNBOXING.mov`],
    })
    expect(mundo.eliminadas, 'se borró algo que estaba en uso').toEqual([])
    expect(res.body?.salteados).toBe(2)
  })

  it('la pieza que Meta ya tiene sí se elimina: acá es una copia', async () => {
    const res = await pedir({
      accion: 'eliminar-huerfanos',
      refsCliente: REFS_INGRESOS,
      urls: [`${HOST}/piezas/ASMR.mp4`],
    })
    expect(mundo.eliminadas).toEqual([`${HOST}/piezas/ASMR.mp4`])
    expect(res.body?.eliminados).toBe(1)
  })

  it('🔴 si la consulta de los planes falla, de piezas no se elimina NADA', async () => {
    mundo.fallan.add('meta_ads_plan_paso')
    const res = await pedir({
      accion: 'eliminar-huerfanos',
      refsCliente: REFS_INGRESOS,
      urls: [`${HOST}/piezas/ASMR.mp4`],
    })
    expect(mundo.eliminadas).toEqual([])
    expect(res.body?.salteados).toBe(1)
  })

  it('🔴 lo recién subido NO se borra, aunque venga pedido', async () => {
    const res = await pedir({
      accion: 'eliminar-huerfanos',
      refsCliente: REFS_INGRESOS,
      urls: [`${HOST}/canjes/62/subiendo.mov`],
    })
    expect(mundo.eliminadas).toEqual([])
    expect(res.body?.salteados).toBe(1)
  })

  it('🔴 sin las referencias de la galería, de Ingresos no se borra nada', async () => {
    const res = await pedir({
      accion: 'eliminar-huerfanos',
      urls: [`${HOST}/ingresos/video-proveedora.mp4`],
    })
    expect(mundo.eliminadas).toEqual([])
    expect(res.body?.salteados).toBe(1)
  })

  it('sólo admin', async () => {
    esAdminDevuelve = false
    const res = await pedir({ accion: 'eliminar-huerfanos', urls: [`${HOST}/canjes/71/huerfano.mov`] })
    expect(res.code).toBe(403)
    expect(mundo.eliminadas).toEqual([])
  })

  it('un pedido vacío es un 400, ⛔ no un «listo» que no hizo nada', async () => {
    const res = await pedir({ accion: 'eliminar-huerfanos', urls: [] })
    expect(res.code).toBe(400)
  })
})
