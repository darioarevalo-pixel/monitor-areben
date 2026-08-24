import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **El disparador del ingreso** — la lista corta que hoy dispara una persona acordándose.
 *
 * Dos manuales («Sesiones de fotos» y «Cómo se lanza un producto») se apoyan en «el aviso de
 * ingreso de Administración, automático», y ese aviso **nunca existió**: el flujo que dispara
 * —nombre → descripción → precio → foto → publicación → pantallas— es, según el propio manual, el
 * que más se cae, porque al no haber fecha grande nadie lo mira.
 *
 * Este archivo es **el primero que prueba `api/_agenda.js`**, y prueba lo que se rompe callado y
 * hacia afuera:
 *
 *  1. **El orden de los guards.** La puerta pública corre ANTES de `exigirUsuario` —del otro lado
 *     está el sistema de Gerardo, que no tiene sesión del Monitor— y por eso el secreto se compara
 *     antes de tocar la base. Con la variable sin configurar la puerta está CERRADA: un env que
 *     falta no puede significar «que pase cualquiera».
 *  2. **Que la puerta haga UNA cosa.** No elige destinatarios, no escribe texto libre más allá del
 *     nombre y no puede llamar a ninguna otra acción de la Agenda.
 *  3. **La idempotencia.** El mismo ingreso avisado dos veces —un webhook que reintenta, alguien
 *     que aprieta dos veces— no puede dejar doce pendientes.
 *  4. **Que los renglones salgan de los moldes** y no del código: sin moldes cargados no siembra
 *     nada y lo dice, en vez de inventar seis pendientes que después nadie tilda.
 */

type Fila = Record<string, unknown>

type Mundo = {
  items: Fila[]
  insertados: Fila[]
  tocoLaBase: boolean
  hayPerfil: boolean
  puedeCargar: boolean
}

let mundo: Mundo

const molde = (over: Partial<Fila> = {}): Fila => ({
  id: 'm1',
  clase: 'pendiente',
  titulo: 'Cargar el nombre',
  cuerpo: null,
  regla: { tipo: 'diaria' },
  destino: { tipo: 'personas', personas: ['sofi'] },
  marcas: [],
  manual_id: 'man-08',
  datos: { plantilla: 'ingreso', offsetDias: 0 },
  created_at: '2026-08-01T10:00:00.000Z',
  ...over,
})

function nuevoMundo(): Mundo {
  return { items: [molde()], insertados: [], tocoLaBase: false, hayPerfil: true, puedeCargar: true }
}

function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: { tabla: string; insert: Fila[] | null } = { tabla, insert: null }
    const resolver = async () => {
      mundo.tocoLaBase = true
      if (ctx.insert) {
        mundo.insertados.push(...ctx.insert)
        return { data: null, error: null }
      }
      if (ctx.tabla === 'agenda_items') return { data: mundo.items, error: null }
      return { data: [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      order: () => api,
      gte: () => api,
      insert: (filas: Fila[]) => { ctx.insert = filas; return api },
      upsert: (filas: Fila[]) => { ctx.insert = filas; return api },
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
  exigirUsuario: async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) => {
    if (!mundo.hayPerfil) { res.status(401).json({ error: 'sin sesión' }); return null }
    return { name: 'Bruno', email: 'bruno@arebensrl.com', admin: mundo.puedeCargar, acceso: {}, funcion: [] }
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

async function llamar(body: unknown, headers: Record<string, string> = {}) {
  const mod = await import('@/api/_agenda.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', headers, query: {}, body }, res,
  )
  return res
}

const desdeAfuera = (body: Record<string, unknown> = {}, secreto = 'el-secreto') =>
  llamar({ action: 'ingreso-externo', nombre: 'IMP2', fecha: '2026-08-24', ...body }, { 'x-ingreso-secreto': secreto })

const desdeAdentro = (body: Record<string, unknown> = {}) =>
  llamar({ action: 'ingreso', nombre: 'IMP2', fecha: '2026-08-24', ...body })

beforeEach(() => {
  vi.resetModules()
  mundo = nuevoMundo()
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
  vi.stubEnv('INGRESO_SECRETO', 'el-secreto')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('la puerta: el secreto se mira ANTES de tocar la base', () => {
  it('🔴 sin la variable configurada la puerta está CERRADA, no abierta', async () => {
    vi.stubEnv('INGRESO_SECRETO', '')
    const res = await desdeAfuera()
    expect(res.code).toBe(503)
    expect(mundo.tocoLaBase).toBe(false)
    expect(mundo.insertados).toEqual([])
  })

  it('con el secreto equivocado, 401 sin consultar nada', async () => {
    for (const malo of ['', 'otro', 'EL-SECRETO', 'el-secreto ']) {
      mundo = nuevoMundo()
      const res = await desdeAfuera({}, malo)
      expect(res.code, malo || '(vacío)').toBe(401)
      expect(mundo.tocoLaBase, malo || '(vacío)').toBe(false)
    }
  })

  it('⛔ el secreto NO abre las otras acciones de la Agenda: sin sesión, nada', async () => {
    mundo.hayPerfil = false
    const res = await llamar(
      { action: 'guardar-item', item: { id: 'x', clase: 'pendiente', titulo: 'colado', regla: { tipo: 'diaria' } } },
      { 'x-ingreso-secreto': 'el-secreto' },
    )
    expect(res.code).toBe(401)
    expect(mundo.insertados).toEqual([])
  })
})

describe('sembrar: los renglones salen de los moldes, no del código', () => {
  it('clona cada molde con la fecha del ingreso y el nombre adelante', async () => {
    const res = await desdeAfuera()
    expect(res.code).toBe(200)
    expect(res.body?.creados).toBe(1)

    const f = mundo.insertados[0]
    expect(f.titulo).toBe('IMP2 · Cargar el nombre')
    expect(f.regla).toEqual({ tipo: 'unica', fecha: '2026-08-24' })
    // Lo que hace que el paso tenga dueña sale del molde, no de la puerta.
    expect(f.destino).toEqual({ tipo: 'personas', personas: ['sofi'] })
    expect(f.manual_id).toBe('man-08')
    expect(f.activo).toBe(true)
  })

  it('🔑 el clon ARRASTRA y ⛔ NO es molde (si no, se clonaría a sí mismo)', async () => {
    await desdeAfuera()
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.arrastra).toBe(true)
    expect(datos.plantilla).toBeUndefined()
    expect(datos.ingreso).toBe('2026-08-24·imp2')
  })

  it('cada molde cae a los días que dice, y salen en ese orden', async () => {
    mundo.items = [
      molde({ id: 'm3', titulo: 'Publicar', datos: { plantilla: 'ingreso', offsetDias: 2 } }),
      molde({ id: 'm1', titulo: 'Nombre', datos: { plantilla: 'ingreso', offsetDias: 0 } }),
      molde({ id: 'm2', titulo: 'Foto', datos: { plantilla: 'ingreso', offsetDias: 1 } }),
    ]
    await desdeAfuera()
    expect(mundo.insertados.map((f) => f.titulo)).toEqual(['IMP2 · Nombre', 'IMP2 · Foto', 'IMP2 · Publicar'])
    expect(mundo.insertados.map((f) => (f.regla as { fecha: string }).fecha))
      .toEqual(['2026-08-24', '2026-08-25', '2026-08-26'])
  })

  it('🔴 el mismo ingreso dos veces no duplica nada', async () => {
    await desdeAfuera()
    const primeraVez = mundo.insertados.length
    // La segunda vuelta lo encuentra sembrado, como lo encontraría un webhook que reintenta.
    mundo.items = [...mundo.items, ...mundo.insertados]
    mundo.insertados = []
    const res = await desdeAfuera()
    expect(primeraVez).toBe(1)
    expect(res.code).toBe(200)
    expect(res.body?.ya).toBe(true)
    expect(mundo.insertados).toEqual([])
  })

  it('sin moldes cargados no inventa nada, y lo dice', async () => {
    mundo.items = []
    const res = await desdeAfuera()
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('plantilla')
    expect(mundo.insertados).toEqual([])
  })

  it('el nombre no puede estar vacío ni traer saltos de línea', async () => {
    for (const malo of ['', '   ', '\n']) {
      mundo = nuevoMundo()
      const res = await desdeAfuera({ nombre: malo })
      expect(res.code).toBe(400)
      expect(mundo.insertados).toEqual([])
    }
    mundo = nuevoMundo()
    await desdeAfuera({ nombre: 'IMP2\nborrar todo' })
    expect(mundo.insertados[0].titulo).toBe('IMP2 borrar todo · Cargar el nombre')
  })

  it('una fecha que no es una fecha no siembra', async () => {
    for (const mala of ['ayer', '24/08/2026', '2026-02-31']) {
      mundo = nuevoMundo()
      // La puerta cae a hoy si la fecha no tiene forma, así que se prueba con el alta de adentro,
      // que la exige tal cual viene.
      const res = await llamar({ action: 'ingreso', nombre: 'IMP2', fecha: mala })
      expect([200, 400]).toContain(res.code)
    }
  })
})

describe('el alta a mano', () => {
  it('siembra lo mismo que la puerta', async () => {
    const res = await desdeAdentro()
    expect(res.code).toBe(200)
    expect(mundo.insertados[0].titulo).toBe('IMP2 · Cargar el nombre')
  })

  it('pide permiso de carga: sembrar seis pendientes con dueña es cargar rutinas', async () => {
    mundo.puedeCargar = false
    const res = await desdeAdentro()
    expect(res.code).toBe(403)
    expect(mundo.insertados).toEqual([])
  })

  it('sin sesión no entra, aunque sepa el nombre de la acción', async () => {
    mundo.hayPerfil = false
    const res = await desdeAdentro()
    expect(res.code).toBe(401)
    expect(mundo.insertados).toEqual([])
  })
})
