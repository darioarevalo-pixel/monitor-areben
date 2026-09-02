import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **El handler del PRM** (30-ago-2026).
 *
 * Lo que se prueba acá no es el CRUD: son las dos decisiones que no las guarda ninguna otra cosa.
 *
 *  1. 🔴 **El permiso se parte por ACCIÓN, y son dos secciones de dos áreas distintas.** `recorridas`
 *     (Compras) escribe lo que pasa en la calle y `prm` (Proveedores) tilda el enganche con el
 *     proveedor del sistema de Ingresos. El enganche hace aparecer en la ficha las OCs y el
 *     cumplimiento de otro, así que ⛔ no se toca con el celular parado en una galería. Un solo
 *     handler para las dos secciones significa que **este archivo es el único lugar donde eso se
 *     decide**: sin test, alcanza con mover una constante para que se borre la separación.
 *  2. 🔴 **`recepciones` distingue `null` de `[]`.** `null` = no hay enganche · `[]` = enganchado y
 *     sin ninguna OC. Devolver `[]` para los dos casos haría que la ficha afirmara «este proveedor
 *     nunca nos entregó nada» cuando lo que pasa es que nadie lo enganchó. El cero afirma.
 */

type Mundo = {
  local: Record<string, unknown> | null
  ocs: Record<string, unknown>[]
  inserts: { tabla: string; filas: unknown }[]
  updates: { tabla: string; patch: Record<string, unknown> }[]
}

let mundo: Mundo
let perfil: Record<string, unknown> | null

function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: { update: Record<string, unknown> | null; insert: unknown } = { update: null, insert: undefined }
    const resolver = async () => {
      if (ctx.insert !== undefined) {
        mundo.inserts.push({ tabla, filas: ctx.insert })
        return { data: null, error: null }
      }
      if (ctx.update) {
        mundo.updates.push({ tabla, patch: ctx.update })
        return { data: null, error: null }
      }
      if (tabla === 'proveedor_local') return { data: mundo.local, error: null }
      if (tabla === 'recepcion_oc') return { data: mundo.ocs, error: null }
      return { data: [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      in: () => api,
      is: () => api,
      not: () => api,
      order: () => api,
      limit: () => api,
      update: (row: Record<string, unknown>) => { ctx.update = row; return api },
      insert: (filas: unknown) => { ctx.insert = filas; return api },
      maybeSingle: () => resolver(),
      single: () => resolver(),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => resolver().then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => perfil,
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

async function llamar(req: Record<string, unknown>) {
  const mod = await import('@/api/_prm.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { headers: {}, query: {}, ...req },
    res,
  )
  return res
}

const postear = (body: Record<string, unknown>) =>
  llamar({ method: 'POST', query: { recurso: 'prm' }, body: { store: 'bdi', ...body } })

/** Un perfil que tiene tildada UNA sola de las dos secciones, en BDI. */
const soloCon = (key: string) => ({
  name: 'Quien Sea',
  admin: false,
  cuenta: null,
  acceso: { bdi: { [key]: true } },
  funcion: [],
})

beforeEach(() => {
  vi.resetModules()
  mundo = { local: null, ocs: [], inserts: [], updates: [] }
  perfil = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('el permiso se parte por acción entre las dos secciones', () => {
  const visita = { action: 'visita.crear', id: 'pv1', local_id: 'pl1', fecha: '2026-08-30' }
  const enganche = { action: 'local.enganchar', id: 'pl1', proveedor_id_ingresos: 77 }

  it('con Recorridas se anota una visita, pero NO se toca el enganche', async () => {
    perfil = soloCon('recorridas')
    expect((await postear(visita)).code).toBe(200)

    const r = await postear(enganche)
    expect(r.code).toBe(403)
    expect(String(r.body?.error)).toContain('PRM')
  })

  it('con PRM se tilda el enganche, pero NO se anota una visita', async () => {
    perfil = soloCon('prm')
    expect((await postear(enganche)).code).toBe(200)
    expect((await postear(visita)).code).toBe(403)
  })

  it('🔴 el MOVIMIENTO es del PRM: con Recorridas la ficha se lee y las ventas NO', async () => {
    // Ahí viajan las ventas del catálogo, que ⛔ no son un dato de la calle. Mismo criterio que el
    // enganche: es una decisión de escritorio, no un gesto parado en una galería.
    perfil = soloCon('recorridas')
    mundo.local = { id: 'pl1', nombre: 'Un local', proveedor_id_ingresos: null }
    expect((await llamar({ method: 'GET', query: { recurso: 'prm', store: 'bdi', action: 'local', id: 'pl1' } })).code).toBe(200)
    const r = await llamar({ method: 'GET', query: { recurso: 'prm', store: 'bdi', action: 'movimiento', id: 'pl1' } })
    expect(r.code).toBe(403)
    expect(String(r.body?.error)).toContain('PRM')
  })

  it('y con PRM sí se lee', async () => {
    perfil = soloCon('prm')
    mundo.local = { id: 'pl1', nombre: 'Un local', proveedor_id_ingresos: null }
    const r = await llamar({ method: 'GET', query: { recurso: 'prm', store: 'bdi', action: 'movimiento', id: 'pl1' } })
    expect(r.code).toBe(200)
    // Sin enganche ⛔ no contesta ceros: dice que nadie lo ató a un proveedor de Ingresos.
    expect(r.body?.sinEnganche).toBe(true)
  })

  it('sin ninguna de las dos no se lee nada', async () => {
    perfil = soloCon('recepciones')
    const r = await llamar({ method: 'GET', query: { recurso: 'prm', store: 'bdi' } })
    expect(r.code).toBe(403)
  })

  // 🔴 `puedeVerAlguna` niega ante una store desconocida, y ése es EL gate del servidor: la store la
  // elige el request, así que una inventada no puede abrir la puerta por el costado.
  it('una marca inventada no abre nada, ni siendo admin', async () => {
    const r = await llamar({ method: 'GET', query: { recurso: 'prm', store: 'la-que-sea' } })
    expect(r.code).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('la ficha distingue "sin enganche" de "enganchado y sin nada"', () => {
  const abrir = () => llamar({ method: 'GET', query: { recurso: 'prm', store: 'bdi', action: 'local', id: 'pl1' } })

  it('sin enganche devuelve null, ⛔ no una lista vacía', async () => {
    mundo.local = { id: 'pl1', nombre: 'Los Tres Hermanos', proveedor_id_ingresos: null }
    const r = await abrir()
    expect(r.code).toBe(200)
    expect(r.body?.recepciones).toBeNull()
  })

  it('enganchado y sin OCs devuelve la lista vacía, que dice otra cosa', async () => {
    mundo.local = { id: 'pl1', nombre: 'Los Tres Hermanos', proveedor_id_ingresos: 77 }
    mundo.ocs = []
    const r = await abrir()
    expect(r.body?.recepciones).toEqual([])
  })

  it('un local que no está da 404 y no una ficha vacía', async () => {
    mundo.local = null
    expect((await abrir()).code).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('lo que la visita NO guarda', () => {
  // 🔴 La decisión de Bruno: la compra se manda al sistema de Ingresos y vuelve CONTADA por la OC.
  // Un monto tipeado acá sería el segundo número del mismo hecho, y el que está más a mano.
  it('un monto mandado a mano no se guarda: la fila no tiene dónde ponerlo', async () => {
    await postear({
      action: 'visita.crear', id: 'pv1', local_id: 'pl1', fecha: '2026-08-30',
      compre: true, que_compre: '3 docenas', monto: 480000, unidades: 36,
    })
    const fila = mundo.inserts.find((i) => i.tabla === 'proveedor_visita')?.filas as Record<string, unknown>
    expect(fila.compre).toBe(true)
    expect(fila.que_compre).toBe('3 docenas')
    expect(fila).not.toHaveProperty('monto')
    expect(fila).not.toHaveProperty('unidades')
  })

  it('el puntaje fuera de 1..5 se rechaza antes de escribir', async () => {
    const r = await postear({ action: 'visita.crear', id: 'pv1', local_id: 'pl1', fecha: '2026-08-30', puntaje: 9 })
    expect(r.code).toBe(400)
    expect(mundo.inserts).toHaveLength(0)
  })

  // Haber ido es una observación; 'compro' y 'descartado' son decisiones y ⛔ no se pisan solas.
  it('la visita empuja el local de "por visitar" a "visitado", y a "le compro" si compré', async () => {
    await postear({ action: 'visita.crear', id: 'pv1', local_id: 'pl1', fecha: '2026-08-30' })
    expect(mundo.updates.find((u) => u.tabla === 'proveedor_local')?.patch.estado).toBe('visitado')

    mundo.updates = []
    await postear({ action: 'visita.crear', id: 'pv2', local_id: 'pl1', fecha: '2026-08-30', compre: true })
    expect(mundo.updates.find((u) => u.tabla === 'proveedor_local')?.patch.estado).toBe('compro')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('la importación en tanda cuenta lo que se cayó', () => {
  // 🔴 Un importador que contesta "listo" sobre 2 de 3 se descubre parado en una galería que no
  // está en la lista.
  it('lo que no traía nombre se cuenta aparte, ⛔ no se saltea callado', async () => {
    const r = await postear({
      action: 'local.importar',
      locales: [
        { id: 'pl1', nombre: 'Uno' },
        { id: 'pl2', nombre: '   ' },
        { id: 'pl3', nombre: 'Tres' },
      ],
    })
    expect(r.body?.guardados).toBe(2)
    expect(r.body?.sinNombre).toBe(1)
  })

  it('el punto que ya trae Google Maps se guarda, y dice de dónde salió', async () => {
    await postear({
      action: 'local.importar',
      locales: [{ id: 'pl1', nombre: 'Uno', lat: -34.6295, lng: -58.4635 }],
    })
    const filas = mundo.inserts.find((i) => i.tabla === 'proveedor_local')?.filas as Record<string, unknown>[]
    expect(filas[0].lat).toBeCloseTo(-34.6295, 4)
    expect(filas[0].geo_usada).toBe('Google Maps')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('editar la dirección invalida el punto guardado', () => {
  // 🔑 Un punto viejo al lado de una dirección nueva es exactamente el error que `api/_georef.js`
  // evita no cacheando nada. Acá SÍ se cachea, así que hace falta el corte a mano.
  it('cambiar la dirección borra lat/lng para que se vuelva a preguntar', async () => {
    await postear({ action: 'local.editar', id: 'pl1', direccion: 'Nazca 1300' })
    const patch = mundo.updates.find((u) => u.tabla === 'proveedor_local')?.patch
    expect(patch?.lat).toBeNull()
    expect(patch?.geo_en).toBeNull()
  })

  it('cambiar sólo el rubro NO toca el punto', async () => {
    await postear({ action: 'local.editar', id: 'pl1', rubro: 'jeans' })
    const patch = mundo.updates.find((u) => u.tabla === 'proveedor_local')?.patch
    expect(patch).not.toHaveProperty('lat')
  })
})
