import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { destinosDe } from '@/components/solicitudes/useHistorialSolicitudes'
import { adminBaseUrl, linkProducto, tiendaBaseUrl, TIENDA_BASE, ADMIN_BASE } from '@/lib/tienda'
import { tnAdminUrl } from '@/lib/exhib/core'

/**
 * **La sesión de fotos de Stunned** (22-ago-2026): historial propio + los dos extremos del ciclo.
 *
 * Lo que este archivo defiende no es "que ande": es la única confusión que puede salir cara acá,
 * que es **mezclar los dos ejes**. Una solicitud de Stunned tiene TRES stores distintos según a
 * quién se le hable:
 *
 * | destino | store | por qué |
 * |---|---|---|
 * | la fila del cajón | `stunned` | historial propio, columna `store` de la tabla de Zattia |
 * | Gestión Nube | `zattia` | Stunned no tiene GN propio: mismo depósito, mismo local, mismo stock |
 * | Tienda Nube | `stunned` | tienda propia (7516263, `stunned.com.ar`), otro token |
 *
 * 🔴 Los dos errores posibles **no fallan solos**: mandarle `stunned` a `api/crear-venta.js` crea
 * la venta igual pero sin cliente (`SF_CFG.stunned.client_id` es `null`, existe para `tn_import`),
 * y mandarle `zattia` a la Tienda Nube sube la foto de Stunned a la tienda de Zattia.
 */

describe('los dos ejes de una solicitud de Stunned', () => {
  it('el cajón va por LÍNEA y Gestión Nube por MARCA', () => {
    expect(destinosDe('stunned')).toEqual({ cajon: 'stunned', gn: 'zattia' })
  })

  it('para las dos marcas los dos destinos coinciden — es Stunned lo que los separa', () => {
    expect(destinosDe('zattia')).toEqual({ cajon: 'zattia', gn: 'zattia' })
    expect(destinosDe('bdi')).toEqual({ cajon: 'bdi', gn: 'bdi' })
  })
})

describe('la tienda de cada línea', () => {
  it('Stunned tiene la suya, y no es la de Zattia', () => {
    expect(tiendaBaseUrl('stunned')).toBe('https://stunned.com.ar')
    expect(tiendaBaseUrl('stunned')).not.toBe(tiendaBaseUrl('zattia'))
    expect(adminBaseUrl('stunned')).toBe('https://stunned3.mitiendanube.com/admin/products')
    expect(linkProducto('stunned', 'remera-vintage')).toBe('https://stunned.com.ar/productos/remera-vintage')
  })

  it('las tres líneas están en los dos mapas, y ninguna repite dominio', () => {
    for (const mapa of [TIENDA_BASE, ADMIN_BASE]) {
      const valores = Object.values(mapa)
      expect(Object.keys(mapa).sort()).toEqual(['bdi', 'stunned', 'zattia'])
      expect(new Set(valores).size).toBe(3)
      for (const v of valores) expect(v.startsWith('https://')).toBe(true)
    }
  })

  /**
   * 🔴 El defecto que esto mata: hasta el 22-ago-2026 las dos funciones terminaban en
   * `|| TIENDA_BASE.bdi`. Una línea que el mapa no conociera —un `?store=` con typo, o Stunned el
   * día antes de agregarla— salía con un link **de BDI, bien formado y copiable**. Es el mismo
   * "por descarte" que `baseDeLinea` mató en los permisos.
   */
  it('una línea desconocida da null, NUNCA BDI', () => {
    expect(tiendaBaseUrl('stunnedd')).toBeNull()
    expect(adminBaseUrl('')).toBeNull()
    expect(linkProducto('stunnedd' as never, 'remera-vintage')).toBeNull()
  })

  it('el link de Exhibición sale del mismo mapa, no de una copia', () => {
    expect(tnAdminUrl('123', 'stunned')).toBe('https://stunned3.mitiendanube.com/admin/products/123')
    expect(tnAdminUrl('123', 'zattia')).toBe('https://zattiaco.mitiendanube.com/admin/products/123')
    expect(tnAdminUrl(null, 'stunned')).toBeNull()
  })
})

// ── La puerta del cajón, ejercida contra el handler real ──────────────────────────────
//
// Mismo molde que `tests/handlers-autorizacion.test.ts`: el `createClient` mockeado guarda con qué
// URL se lo llamó, así que el oráculo no es "no explotó" sino **a qué base fue a parar la fila**.

const creadoCon: string[] = []
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string) => {
    creadoCon.push(url)
    // Encadenable de verdad: el handler hace select→eq(store)→eq(kind)→order→limit, y un mock que
    // corta antes devuelve 500 por el catch — un verde falso al revés, pero ruido igual.
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.order = () => q
    q.limit = async () => ({ data: [], error: null })
    return { from: () => q }
  },
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
/** Admin: acá lo que se prueba es el ruteo de la store, no el permiso (eso ya lo fija otro archivo). */
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }

beforeEach(() => {
  creadoCon.length = 0
  vi.stubEnv('SUPABASE_URL', 'https://base-de-BDI.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://base-de-ZATTIA.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'k')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

async function pedir(store: string) {
  const mod = await import('@/api/_solicitudes.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'GET', headers: { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'p' }) }, query: { store, kind: 'sesionfotos' }, body: {} },
    res,
  )
  return res
}

describe('api/_solicitudes: qué store acepta y a qué base va', () => {
  it('acepta stunned y lo manda a la base de ZATTIA', async () => {
    const res = await pedir('stunned')
    expect(res.code).toBe(200)
    expect(creadoCon).toEqual(['https://base-de-ZATTIA.supabase.co'])
  })

  it('zattia va a la misma base — son la misma, y por eso alcanza la columna store', async () => {
    await pedir('zattia')
    expect(creadoCon).toEqual(['https://base-de-ZATTIA.supabase.co'])
  })

  it('bdi sigue yendo a la suya', async () => {
    await pedir('bdi')
    expect(creadoCon).toEqual(['https://base-de-BDI.supabase.co'])
  })

  /** 🔴 Y sin tocar la base: si el 400 llegara tarde, `creadoCon` ya tendría una URL adentro. */
  it('una store inventada da 400 antes de abrir ninguna base', async () => {
    const res = await pedir('stunnedd')
    expect(res.code).toBe(400)
    expect(creadoCon).toEqual([])
  })
})

// ── El aviso: por dónde el local se entera ────────────────────────────────────────────
//
// 🔴 **Éste es el defecto que casi se va a producción con todo lo de arriba en verde.** La sesión
// de fotos de Stunned podía crearse y guardarse bien, y aun así **no la veía nadie**: `useAvisos`
// pedía el cajón por MARCA, y la pantalla `/solicitudes` —de donde el local saca qué preparar— es
// exactamente esa lista. Una solicitud que no aparece ahí no se prepara nunca.
//
// El oráculo no es "no explotó": es **con qué stores se llamó al cajón** y **qué dice el chip**.

const cajonPedido: string[] = []
vi.mock('@/lib/solicitudes/cajon', () => ({
  leerCajon: async (kind: string, store: string) => {
    cajonPedido.push(`${kind}:${store}`)
    return kind === 'sesionfotos' && store === 'stunned'
      ? { ok: true, dato: [{ id: 'sf-stu-1', estado: 'pendiente', descripcion: 'Campaña Stunned', items: [{ vid: 'v1', pid: 'p1', sid: 's1', nombre: 'Remera', variante: 'M', sku: 'STU-REM-0001-M', qty: 1, origen: 'local' }] }] }
      : { ok: true, dato: [] }
  },
}))
vi.mock('@/lib/postventa/fallas/cliente', () => ({ leerFallas: async () => [] }))
vi.mock('@/lib/canjes/cliente', () => ({ leerCanjes: async () => ({ canjes: [], personas: [], vencidos: [] }), esCiego: () => false }))

describe('los avisos: una solicitud de Stunned tiene que APARECER', () => {
  it('pide el cajón de las DOS líneas de Zattia, y la de Stunned llega rotulada Stunned', async () => {
    cajonPedido.length = 0
    const { useAvisos } = await import('@/store/useAvisos')
    const perfil = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
    await useAvisos.getState().cargar(perfil as never, 'zattia')

    expect(cajonPedido).toContain('sesionfotos:zattia')
    expect(cajonPedido).toContain('sesionfotos:stunned')
    // ⛔ Y las internas NO se parten: se piden sobre la mercadería del local, que es una sola.
    expect(cajonPedido).not.toContain('solicitudesinternas:stunned')

    const r = useAvisos.getState().resumenes.find((x) => x.id === 'sf-stu-1')
    expect(r).toBeDefined()
    // Las dos mitades: el chip dice Stunned, y el salto de cuenta va a Zattia (su base).
    expect(r!.linea).toBe('stunned')
    expect(r!.marca).toBe('zattia')
  })
})
