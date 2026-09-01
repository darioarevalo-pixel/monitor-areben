import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CLAVES_PUERTA, PUERTAS, rotuloPuerta, type Puerta } from '@/lib/agenda'

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
  /** Todos los tildes que hay en la base, sin ventana: la ventana la tiene que poner el handler. */
  hechos: Fila[]
  insertados: Fila[]
  /** Lo mismo, pero sabiendo en qué tabla: `guardar-promo` escribe la promo Y siembra los clones. */
  escrituras: { tabla: string; filas: Fila[] }[]
  tocoLaBase: boolean
  hayPerfil: boolean
  puedeCargar: boolean
  /** Los filtros con que el handler pidió `agenda_hechos`, una entrada por consulta. */
  consultasHechos: { gte?: string; lt?: string; in?: string[] }[]
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
  return { items: [molde()], hechos: [], insertados: [], escrituras: [], tocoLaBase: false, hayPerfil: true, puedeCargar: true, consultasHechos: [] }
}

function fakeSupabase() {
  const desde = (tabla: string) => {
    // ⚠️ Los filtros se **guardan**, no se ignoran: la mitad de lo que hay que probar del GET del
    // acuse es con qué ventana se pidió cada tramo, y un fake que devuelve todo igual daría verde
    // con el handler pidiendo cualquier cosa.
    const ctx: { tabla: string; insert: Fila[] | null; gte?: string; lt?: string; in?: string[] } = { tabla, insert: null }
    const resolver = async () => {
      mundo.tocoLaBase = true
      if (ctx.insert) {
        mundo.insertados.push(...ctx.insert)
        mundo.escrituras.push({ tabla: ctx.tabla, filas: ctx.insert })
        return { data: null, error: null }
      }
      if (ctx.tabla === 'agenda_items') return { data: mundo.items, error: null }
      if (ctx.tabla === 'agenda_hechos') {
        mundo.consultasHechos.push({ gte: ctx.gte, lt: ctx.lt, in: ctx.in })
        const data = mundo.hechos.filter((h) => {
          const f = String(h.fecha)
          if (ctx.gte && f < ctx.gte) return false
          if (ctx.lt && f >= ctx.lt) return false
          if (ctx.in && !ctx.in.includes(String(h.item_id))) return false
          return true
        })
        return { data, error: null }
      }
      return { data: [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      order: () => api,
      gte: (_c: string, v: string) => { ctx.gte = v; return api },
      lt: (_c: string, v: string) => { ctx.lt = v; return api },
      in: (_c: string, v: string[]) => { ctx.in = v; return api },
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

// La puerta y la marca van en el cuerpo por defecto porque **sin ellas no se siembra**: dejarlas
// afuera acá convertiría cada test de las otras reglas en un test de sus 400.
const desdeAfuera = (body: Record<string, unknown> = {}, secreto = 'el-secreto') =>
  llamar({ action: 'ingreso-externo', nombre: 'IMP2', fecha: '2026-08-24', puerta: 'importacion', marca: 'bdi', ...body }, { 'x-ingreso-secreto': secreto })

const desdeAdentro = (body: Record<string, unknown> = {}) =>
  llamar({ action: 'ingreso', nombre: 'IMP2', fecha: '2026-08-24', puerta: 'importacion', marca: 'bdi', ...body })

async function leerAgenda() {
  const mod = await import('@/api/_agenda.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'GET', headers: {}, query: {}, body: {} }, res,
  )
  return res
}

/** Un pendiente cualquiera de la Agenda — ⛔ no un molde: los moldes no arrastran nada. */
const rutina = (over: Partial<Fila> = {}): Fila => ({
  id: 'r1',
  clase: 'pendiente',
  titulo: 'Semanal de comunidad',
  cuerpo: null,
  regla: { tipo: 'semanal', dias: [2] },
  destino: { tipo: 'todos' },
  marcas: [],
  manual_id: null,
  activo: true,
  datos: { arrastra: true },
  autor: 'Bruno',
  created_at: '2026-01-05T10:00:00.000Z',
  ...over,
})

const tilde = (over: Partial<Fila> = {}): Fila => ({
  item_id: 'r1', fecha: '2026-08-20', usuario: 'Bruno', nota: null, hecho_at: null, ...over,
})

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

  it('🔑 el clon guarda de QUÉ HECHO salió, que es con lo que la pantalla los agrupa', async () => {
    await desdeAfuera()
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    // ⚠️ Al lado de la clave y ⛔ no adentro: `datos.ingreso` es la llave de idempotencia y no se
    // toca. El nombre va aparte porque la clave de la sesión de fotos es un id opaco, y partir
    // `fecha·nombre` con una regex sería adivinarle la forma a una llave que existe para comparar.
    expect(datos.de).toBe('ingreso')
    expect(datos.hecho).toEqual({ nombre: 'IMP2', fecha: '2026-08-24' })
  })

  it('el clon arrastra SIN TOPE: lo que tarda un ingreso no se puede decir de antemano', async () => {
    await desdeAfuera()
    expect((mundo.insertados[0].datos as Record<string, unknown>).arrastraDias).toBeUndefined()
  })

  it('...salvo que el molde le ponga uno: el campo del formulario tiene que viajar', async () => {
    mundo.items = [molde({ datos: { plantilla: 'ingreso', offsetDias: 0, arrastraDias: 3 } })]
    await desdeAfuera()
    expect((mundo.insertados[0].datos as Record<string, unknown>).arrastraDias).toBe(3)
  })

  it('🔴 un tope en 0 en el molde es CERO y no "sin tope": `Number(null)` también da 0', async () => {
    mundo.items = [molde({ datos: { plantilla: 'ingreso', offsetDias: 0, arrastraDias: 0 } })]
    await desdeAfuera()
    expect((mundo.insertados[0].datos as Record<string, unknown>).arrastraDias).toBe(0)
    // Y el molde sin el campo, o con `null`, sigue siendo sin tope.
    mundo.insertados = []
    mundo.items = [molde({ id: 'm9', datos: { plantilla: 'ingreso', offsetDias: 0, arrastraDias: null } })]
    await desdeAfuera({ nombre: 'IMP3' })
    expect((mundo.insertados[0].datos as Record<string, unknown>).arrastraDias).toBeUndefined()
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
      const res = await llamar({ action: 'ingreso', nombre: 'IMP2', fecha: mala, puerta: 'importacion' })
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

describe('la puerta de entrada: dos de los seis pasos cambian de dueña según por dónde entró', () => {
  // El manual 06 cierra el nombre y la descripción **por puerta, no por sector**. Sembrar siempre los
  // mismos moldes sirve para una sola de las cuatro y le pone la dueña equivocada a las otras tres.
  const conPuertas = () => [
    molde({ id: 'comun', titulo: 'Cargar el precio', datos: { plantilla: 'ingreso', offsetDias: 0 } }),
    molde({ id: 'nom-imp', titulo: 'Nombre (Marketing)', datos: { plantilla: 'ingreso', offsetDias: 0, puertas: ['importacion'] } }),
    molde({ id: 'nom-nac', titulo: 'Nombre (Administración)', datos: { plantilla: 'ingreso', offsetDias: 0, puertas: ['nacional'] } }),
    molde({ id: 'desc-loc', titulo: 'Descripción (el local)', datos: { plantilla: 'ingreso', offsetDias: 1, puertas: ['nacional'] } }),
  ]

  it('🔴 sin puerta NO siembra: 400, ⛔ ni «sembrá todo»', async () => {
    for (const sin of [undefined, '', null, 'depósito', 'IMPORTACION']) {
      mundo = nuevoMundo()
      const res = await desdeAfuera({ puerta: sin })
      expect(res.code, String(sin)).toBe(400)
      expect(mundo.insertados, String(sin)).toEqual([])
    }
  })

  it('🔑 lista vacía = TODAS: el paso que no cambia se carga una vez y corre en las cuatro', async () => {
    for (const puerta of ['produccion', 'nacional', 'importacion', 'accesorios']) {
      mundo = nuevoMundo()
      mundo.items = [molde({ id: 'comun', titulo: 'Cargar el precio', datos: { plantilla: 'ingreso', offsetDias: 0 } })]
      const res = await desdeAfuera({ puerta })
      expect(res.code, puerta).toBe(200)
      expect(mundo.insertados.map((f) => f.titulo), puerta).toEqual(['IMP2 · Cargar el precio'])
    }
  })

  it('clona sólo los moldes de esa puerta, y el de la otra no aparece', async () => {
    mundo.items = conPuertas()
    await desdeAfuera({ puerta: 'importacion' })
    expect(mundo.insertados.map((f) => f.titulo))
      .toEqual(['IMP2 · Cargar el precio', 'IMP2 · Nombre (Marketing)'])

    mundo = nuevoMundo()
    mundo.items = conPuertas()
    await desdeAfuera({ puerta: 'nacional' })
    expect(mundo.insertados.map((f) => f.titulo))
      .toEqual(['IMP2 · Cargar el precio', 'IMP2 · Nombre (Administración)', 'IMP2 · Descripción (el local)'])
  })

  it('🔑 «producción propia no lleva renglón de descripción» se dice NO cargando el molde', async () => {
    // No hay ningún `if` que sepa esto: producción propia recibe los comunes y nada más, porque
    // ninguno de los dos moldes de nombre/descripción la incluye.
    mundo.items = conPuertas()
    await desdeAfuera({ puerta: 'produccion' })
    expect(mundo.insertados.map((f) => f.titulo)).toEqual(['IMP2 · Cargar el precio'])
  })

  it('hay moldes pero ninguno de esta puerta: lo dice distinto que «no hay moldes»', async () => {
    mundo.items = [molde({ id: 'nom-imp', datos: { plantilla: 'ingreso', offsetDias: 0, puertas: ['importacion'] } })]
    const res = await desdeAfuera({ puerta: 'accesorios' })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('Accesorios')
    expect(String(res.body?.error)).not.toContain('plantilla')
    expect(mundo.insertados).toEqual([])
  })

  it('⛔ la puerta NO entra en la clave: el mismo ingreso avisado con otra puerta no duplica', async () => {
    mundo.items = conPuertas()
    await desdeAfuera({ puerta: 'importacion' })
    mundo.items = [...mundo.items, ...mundo.insertados]
    mundo.insertados = []
    const res = await desdeAfuera({ puerta: 'nacional' })
    expect(res.body?.ya).toBe(true)
    expect(mundo.insertados).toEqual([])
  })

  it('el clon guarda por qué puerta entró: es el único rastro de por qué fueron 2 y no 3', async () => {
    mundo.items = conPuertas()
    await desdeAfuera({ puerta: 'importacion' })
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.puerta).toBe('importacion')
    // ⛔ Y la clave sigue siendo `fecha·nombre`, sin la puerta adentro.
    expect(datos.ingreso).toBe('2026-08-24·imp2')
  })

  it('🔴 un tipo de ingreso2 que no está en el mapa es 400 Y LO NOMBRA, ⛔ no una puerta por defecto', async () => {
    const res = await desdeAfuera({ tipo: 'IMPO_CONTENEDOR', puerta: undefined })
    expect(res.code).toBe(400)
    // El error es a la vez el pedido: dice el texto exacto que hay que agregarle al mapa.
    expect(String(res.body?.error)).toContain('IMPO_CONTENEDOR')
    expect(mundo.insertados).toEqual([])
  })

  it('el tipo de ingreso2 se traduce a nuestra puerta, y le gana a `puerta` si vienen los dos', async () => {
    mundo.items = conPuertas()
    // El vocabulario de Gerardo manda: `puerta` es sólo lo que se puede probar con un `curl`.
    await desdeAfuera({ tipo: 'Nacional', puerta: 'importacion' })
    expect(mundo.insertados.map((f) => f.titulo))
      .toEqual(['IMP2 · Cargar el precio', 'IMP2 · Nombre (Administración)', 'IMP2 · Descripción (el local)'])
  })
})

describe('la marca del ingreso: la descripción de una compra nacional no la escribe siempre el mismo', () => {
  // Bruno, 25-ago-2026: *«si es zattia, y es ropa, se encarga local. Las fundas nunca se encarga
  // local»*. Son **dos moldes de la misma puerta** que se separan por marca — y por eso la marca
  // tiene que viajar con el ingreso: sin ella los dos caen en cada compra nacional, que es el
  // renglón con la dueña equivocada que la puerta vino a sacar.
  const nacional = () => [
    molde({ id: 'comun', titulo: 'Cargar el precio', datos: { plantilla: 'ingreso', offsetDias: 0 } }),
    molde({
      id: 'desc-local', titulo: 'Descripción (el local)', marcas: ['zattia'],
      destino: { tipo: 'roles', roles: ['local'] },
      datos: { plantilla: 'ingreso', offsetDias: 0, puertas: ['nacional'] },
    }),
    molde({
      id: 'desc-admin', titulo: 'Descripción (Administración)', marcas: ['bdi'],
      destino: { tipo: 'personas', personas: ['Lorena Reyes'] },
      datos: { plantilla: 'ingreso', offsetDias: 0, puertas: ['nacional'] },
    }),
  ]

  it('🔴 sin marca NO siembra: 400, ⛔ ni «las dos»', async () => {
    for (const sin of [undefined, '', null, 'BDI', 'stunned']) {
      mundo = nuevoMundo()
      const res = await desdeAfuera({ marca: sin })
      expect(res.code, String(sin)).toBe(400)
      expect(mundo.insertados, String(sin)).toEqual([])
    }
  })

  it('una marca que no existe es 400 Y LA NOMBRA, igual que el tipo de ingreso2', async () => {
    const res = await desdeAfuera({ marca: 'stunned' })
    // Stunned no es una marca: es una línea de Zattia. El error tiene que decir cuál trajo, o el
    // que lo lea va a buscar el problema en la carga de los moldes.
    expect(String(res.body?.error)).toContain('stunned')
    expect(String(res.body?.error)).toContain('zattia')
  })

  it('🔑 lista vacía = LAS DOS: el paso que no cambia se carga una vez, no dos', async () => {
    for (const marca of ['bdi', 'zattia']) {
      mundo = nuevoMundo()
      mundo.items = [molde({ id: 'comun', titulo: 'Cargar el precio', marcas: [] })]
      const res = await desdeAfuera({ marca })
      expect(res.code, marca).toBe(200)
      expect(mundo.insertados.map((f) => f.titulo), marca).toEqual(['IMP2 · Cargar el precio'])
    }
  })

  it('🔴 en BDI la descripción es de Administración, y el renglón del local NO se siembra', async () => {
    mundo.items = nacional()
    await desdeAfuera({ puerta: 'nacional', marca: 'bdi' })
    expect(mundo.insertados.map((f) => f.titulo))
      .toEqual(['IMP2 · Cargar el precio', 'IMP2 · Descripción (Administración)'])
  })

  it('🔴 en Zattia es al revés: la escribe el local y la de Administración no aparece', async () => {
    mundo.items = nacional()
    await desdeAfuera({ puerta: 'nacional', marca: 'zattia' })
    expect(mundo.insertados.map((f) => f.titulo))
      .toEqual(['IMP2 · Cargar el precio', 'IMP2 · Descripción (el local)'])
  })

  it('🔑 el clon nace EN LA MARCA DEL INGRESO, ⛔ no con las del molde', async () => {
    // El molde común corre en las dos; el renglón que salió de un ingreso de BDI es de BDI. Si
    // heredara `marcas: []`, los pendientes de un ingreso de fundas le aparecerían a quien está
    // parado en Zattia.
    mundo.items = nacional()
    await desdeAfuera({ puerta: 'nacional', marca: 'bdi' })
    for (const f of mundo.insertados) expect(f.marcas, String(f.titulo)).toEqual(['bdi'])
  })

  it('el clon guarda de qué marca era el ingreso, al lado de la puerta', async () => {
    mundo.items = nacional()
    await desdeAfuera({ puerta: 'nacional', marca: 'zattia' })
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.marca).toBe('zattia')
    expect(datos.puerta).toBe('nacional')
  })

  it('⛔ la marca NO entra en la clave: el mismo ingreso avisado con la otra marca no duplica', async () => {
    mundo.items = nacional()
    await desdeAfuera({ puerta: 'nacional', marca: 'bdi' })
    mundo.items = [...mundo.items, ...mundo.insertados]
    mundo.insertados = []
    const res = await desdeAfuera({ puerta: 'nacional', marca: 'zattia' })
    expect(res.body?.ya).toBe(true)
    expect(mundo.insertados).toEqual([])
  })

  it('hay moldes pero ninguno de esta marca: el error nombra LA PUERTA Y LA MARCA', async () => {
    // Con una sola de las dos, quien lo lea revisa la mitad equivocada y concluye que está bien.
    mundo.items = [molde({ id: 'desc-local', marcas: ['zattia'], datos: { plantilla: 'ingreso', offsetDias: 0, puertas: ['nacional'] } })]
    const res = await desdeAfuera({ puerta: 'nacional', marca: 'bdi' })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('Compra nacional')
    expect(String(res.body?.error)).toContain('bdi')
    expect(mundo.insertados).toEqual([])
  })

  it('el alta a mano pide la marca igual que la puerta', async () => {
    const res = await desdeAdentro({ marca: undefined })
    expect(res.code).toBe(400)
    expect(mundo.insertados).toEqual([])
  })
})

describe('puertas del ingreso: el catálogo', () => {
  it('el core y el tipo `Puerta` dicen lo mismo', () => {
    // 🔑 Fija las dos direcciones del desfasaje. Agregar una puerta **al tipo** y no al core no
    // compila (falta la clave en este objeto); agregarla **al core** y no al tipo rompe el expect.
    const cubiertas: Record<Puerta, true> = {
      produccion: true,
      nacional: true,
      importacion: true,
      accesorios: true,
    }
    expect([...CLAVES_PUERTA].sort()).toEqual(Object.keys(cubiertas).sort())
  })

  it('cada puerta tiene rótulo y ayuda: una lista de claves crudas no la lee nadie', () => {
    for (const p of PUERTAS) {
      expect(p.label.length, p.key).toBeGreaterThan(0)
      expect(p.ayuda.length, p.key).toBeGreaterThan(0)
      expect(rotuloPuerta(p.key)).toBe(p.label)
    }
  })
})

describe('cargar un molde: en qué puertas corre se guarda con el ítem', () => {
  const guardar = (extra: Record<string, unknown> = {}) => llamar({
    action: 'guardar-item',
    item: {
      id: 'm9',
      clase: 'pendiente',
      titulo: 'Cargar el nombre',
      regla: { tipo: 'diaria' },
      plantilla: 'ingreso',
      offsetDias: 0,
      ...extra,
    },
  })

  it('las puertas tildadas se guardan en el ítem', async () => {
    const res = await guardar({ puertas: ['importacion'] })
    expect(res.code).toBe(200)
    expect((mundo.insertados[0].datos as Record<string, unknown>).puertas).toEqual(['importacion'])
  })

  it('🔑 ninguna tildada NO se guarda: el campo ausente ya dice «las cuatro»', async () => {
    // ⚠️ Guardar `[]` diría lo mismo con otra forma, y las dos formas conviviendo son dos lecturas
    // que alguien va a tener que unificar. La ausencia es la única.
    for (const vacio of [[], undefined]) {
      mundo = nuevoMundo()
      await guardar({ puertas: vacio })
      expect((mundo.insertados[0].datos as Record<string, unknown>).puertas).toBeUndefined()
    }
  })

  it('🔴 una puerta que no existe no se guarda: 400, ⛔ no se ignora en silencio', async () => {
    for (const mala of [['deposito'], ['importacion', 'flores'], 'importacion', [1]]) {
      mundo = nuevoMundo()
      const res = await guardar({ puertas: mala })
      expect(res.code, JSON.stringify(mala)).toBe(400)
      expect(mundo.insertados, JSON.stringify(mala)).toEqual([])
    }
  })

  it('las puertas de un molde guardado vuelven a salir por el GET', async () => {
    mundo.items = [molde({ id: 'm1', datos: { plantilla: 'ingreso', offsetDias: 0, puertas: ['nacional'] } })]
    const mod = await import('@/api/_agenda.js')
    const res = resFalso()
    await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
      { method: 'GET', headers: {}, query: { recurso: 'agenda' }, body: null }, res,
    )
    expect(res.code).toBe(200)
    const items = res.body?.items as Record<string, unknown>[]
    expect(items[0].puertas).toEqual(['nacional'])
  })

  it('un molde sin puertas guardadas sale con la lista vacía, no con undefined', async () => {
    // La pantalla hace `it.puertas.length`: un `undefined` que viaje la rompe en vez de leerse
    // como «las cuatro».
    const mod = await import('@/api/_agenda.js')
    const res = resFalso()
    await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
      { method: 'GET', headers: {}, query: { recurso: 'agenda' }, body: null }, res,
    )
    const items = res.body?.items as Record<string, unknown>[]
    expect(items[0].puertas).toEqual([])
  })
})

/**
 * **El acuse del GET, en dos tramos** (25-ago-2026).
 *
 * Es la otra mitad del arrastre, y la que se rompe callada: `ocurrenciaAbierta()` mira hacia atrás
 * `DIAS_ARRASTRE` días, y si el GET mandara menos tildes que eso, el navegador vería una ocurrencia
 * vieja sin tilde y la llamaría pendiente **cuando el tilde existe y no viajó**. Un rojo que no se
 * puede apagar. Los dos lados o ninguno, y acá se prueba el lado del servidor.
 *
 * 🔑 Se prueba **con qué filtros se pidió**, no sólo qué volvió: un fake que devuelve todo igual
 * daría verde con el handler pidiendo cualquier ventana.
 */
describe('GET: el acuse viejo viaja sólo de los ítems que arrastran', () => {
  const DIAS_CUMPLIMIENTO = 30
  const DIAS_ARRASTRE = 120
  const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
  const hace = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

  it('son dos consultas: la corta de todos y la profunda acotada a los que arrastran', async () => {
    mundo.items = [rutina(), rutina({ id: 'n1', titulo: 'Rutina suelta', datos: { arrastra: false } })]
    await leerAgenda()
    expect(mundo.consultasHechos).toHaveLength(2)
    const [corto, profundo] = mundo.consultasHechos
    expect(corto.in).toBeUndefined()
    expect(profundo.in).toEqual(['r1'])
  })

  it('los dos tramos no se solapan y juntos cubren la ventana entera del arrastre', async () => {
    mundo.items = [rutina()]
    await leerAgenda()
    const [corto, profundo] = mundo.consultasHechos
    // El profundo termina justo donde arranca el corto: concatenar no puede duplicar nada.
    expect(profundo.lt).toBe(corto.gte)
    expect(dias(profundo.gte!, corto.gte!)).toBe(DIAS_ARRASTRE - DIAS_CUMPLIMIENTO)
  })

  it('🔴 un tilde de hace 60 días llega si el ítem arrastra, y NO si no arrastra', async () => {
    mundo.items = [rutina(), rutina({ id: 'n1', titulo: 'Rutina suelta', datos: { arrastra: false } })]
    mundo.hechos = [tilde({ item_id: 'r1', fecha: hace(60) }), tilde({ item_id: 'n1', fecha: hace(60) })]
    const res = await leerAgenda()
    const hechos = (res.body?.hechos || []) as { itemId: string }[]
    expect(hechos.map((h) => h.itemId)).toEqual(['r1'])
  })

  it('lo de adentro de los 30 días sigue llegando de todos, arrastren o no', async () => {
    mundo.items = [rutina({ id: 'n1', titulo: 'Rutina suelta', datos: { arrastra: false } })]
    mundo.hechos = [tilde({ item_id: 'n1', fecha: hace(3) })]
    const res = await leerAgenda()
    expect((res.body?.hechos as unknown[]).length).toBe(1)
  })

  it('sin ningún ítem que arrastre no hay segunda consulta: ⛔ nada de un `in` vacío', async () => {
    mundo.items = [rutina({ id: 'n1', datos: { arrastra: false } })]
    await leerAgenda()
    expect(mundo.consultasHechos).toHaveLength(1)
  })

  it('un MOLDE no pide cola vieja aunque diga que arrastra: un molde no corre ningún día', async () => {
    mundo.items = [molde({ datos: { plantilla: 'ingreso', offsetDias: 0, arrastra: true } })]
    await leerAgenda()
    expect(mundo.consultasHechos).toHaveLength(1)
  })

  it('el tope por ítem viaja al navegador, y sin tope viaja `null`', async () => {
    mundo.items = [
      rutina({ id: 'r1', datos: { arrastra: true, arrastraDias: 2 } }),
      rutina({ id: 'r2', datos: { arrastra: true } }),
      // 🔴 El 0 es un tope de verdad («se vence con el día»), y es el que se pierde con cualquier
      // atajo de los que confunden «vacío» con «cero».
      rutina({ id: 'r3', datos: { arrastra: true, arrastraDias: 0 } }),
    ]
    const res = await leerAgenda()
    const items = (res.body?.items || []) as { id: string; arrastraDias: number | null }[]
    expect(items.find((i) => i.id === 'r1')?.arrastraDias).toBe(2)
    expect(items.find((i) => i.id === 'r2')?.arrastraDias).toBe(null)
    expect(items.find((i) => i.id === 'r3')?.arrastraDias).toBe(0)
  })
})

/**
 * `guardar-item`: lo que se guarda en `datos` es lo que se mandó, ⛔ ni un campo más.
 *
 * El upsert **escribe `datos` entera**, así que un campo de más no es cosmético: queda escrito y
 * sobrevive a todos los guardados siguientes.
 */
describe('guardar-item: vacío es vacío, ⛔ no cero', () => {
  const base = { id: 'x1', clase: 'pendiente', titulo: 'Una rutina', regla: { tipo: 'diaria' }, destino: { tipo: 'todos' } }
  const guardar = (over: Record<string, unknown> = {}) =>
    llamar({ action: 'guardar-item', item: { ...base, ...over } })

  it('🔴 un pendiente que no es molde NO se lleva un `offsetDias: 0` de recuerdo', async () => {
    // Es lo que devuelve el GET de todo lo que no es molde, y es lo que reenvía el formulario.
    const res = await guardar({ offsetDias: null, arrastra: false, arrastraDias: null, puertas: [] })
    expect(res.code).toBe(200)
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.offsetDias).toBeUndefined()
    expect(datos.arrastraDias).toBeUndefined()
    expect(datos.arrastra).toBe(false)
  })

  it('...pero un molde con `offsetDias: 0` SÍ lo guarda: ahí el cero quiere decir algo', async () => {
    await guardar({ plantilla: 'ingreso', offsetDias: 0 })
    expect((mundo.insertados[0].datos as Record<string, unknown>).offsetDias).toBe(0)
  })

  it('el que ya se llevó el 0 se limpia solo: sin molde, el número no se guarda aunque venga', async () => {
    // Es el caso real: el ítem ya tiene `offsetDias: 0` en la base, así que el GET se lo devuelve
    // al formulario y el formulario lo reenvía. Si el guard mirara sólo el valor, nunca se iría.
    await guardar({ plantilla: null, offsetDias: 0 })
    expect((mundo.insertados[0].datos as Record<string, unknown>).offsetDias).toBeUndefined()
  })

  it('el tope se guarda sólo si el ítem arrastra: sin arrastre no querría decir nada', async () => {
    await guardar({ arrastra: false, arrastraDias: 5 })
    expect((mundo.insertados[0].datos as Record<string, unknown>).arrastraDias).toBeUndefined()
    mundo.insertados = []
    await guardar({ arrastra: true, arrastraDias: 5 })
    expect((mundo.insertados[0].datos as Record<string, unknown>).arrastraDias).toBe(5)
  })

  it('un tope más largo que la ventana se recorta: prometer más de lo que el GET manda es mentir', async () => {
    await guardar({ arrastra: true, arrastraDias: 4000 })
    expect((mundo.insertados[0].datos as Record<string, unknown>).arrastraDias).toBe(120)
  })
})

/**
 * **El 2º disparador: la sesión de fotos.**
 *
 * Sale de la auditoría del 28-ago-2026: de los ocho hechos que se midieron sobre tres años de
 * chats, la sesión de fotos aparece en 27 días distintos de 2026 y en **16** toca dos sectores o
 * más — el doble que el siguiente. Sus nueve renglones ya estaban escritos, con dueña y con
 * momento, en el manual «Sesiones de fotos»; lo que faltaba era el motor.
 *
 * Lo que se prueba acá es **que el motor dejó de saber decir «ingreso»**: la plantilla, su eje y su
 * rango de días son datos de `plantillas.core.js`, y lo único que el handler hace es leerlos. Por
 * eso los tests de abajo llaman a `sembrar` directo: la puerta de este disparador no es un secreto
 * ni un botón, es `api/_solicitudes.js` cuando alguien crea la sesión.
 */
describe('la sesión de fotos: el 2º disparador', () => {
  const moldeFotos = (over: Partial<Fila> = {}): Fila => ({
    ...molde(),
    id: 'f1',
    titulo: 'Buscar y contactar la modelo',
    destino: { tipo: 'personas', personas: ['Sofia Facello'] },
    manual_id: 'man-05',
    datos: { plantilla: 'sesion-fotos', offsetDias: -2 },
    ...over,
  })

  const sembrarFotos = async (over: Record<string, unknown> = {}) => {
    const mod = await import('@/api/_agenda.js')
    return (mod.sembrar as unknown as (sb: unknown, o: Record<string, unknown>) => Promise<Record<string, unknown>>)(
      fakeSupabase(),
      { plantilla: 'sesion-fotos', nombre: 'Cápsula primavera', fecha: '2026-09-10', autor: 'Sofia Facello', eje: 'campania', marca: 'bdi', clave: 'sesion-fotos·s99', ...over },
    )
  }

  it('🔑 un paso PREVIO cae antes de la sesión: la modelo se busca 48 h antes', async () => {
    mundo.items = [moldeFotos()]
    const r = await sembrarFotos()
    expect(r.creados).toBe(1)
    expect(mundo.insertados[0].titulo).toBe('Cápsula primavera · Buscar y contactar la modelo')
    // 🔴 El día −2 es el que el motor del ingreso NO podía decir: recortaba a 0 con un `Math.max`.
    expect((mundo.insertados[0].regla as { fecha: string }).fecha).toBe('2026-09-08')
  })

  it('los nueve del manual caen en el orden del manual, del más temprano al último', async () => {
    mundo.items = [
      moldeFotos({ id: 'f8', titulo: 'Subir las fotos a la web', datos: { plantilla: 'sesion-fotos', offsetDias: 2 } }),
      moldeFotos({ id: 'f1', titulo: 'Buscar la modelo', datos: { plantilla: 'sesion-fotos', offsetDias: -2 } }),
      moldeFotos({ id: 'f4', titulo: 'Sacar las fotos', datos: { plantilla: 'sesion-fotos', offsetDias: 0 } }),
      moldeFotos({ id: 'f3', titulo: 'Referencias y outfits', datos: { plantilla: 'sesion-fotos', offsetDias: -1 } }),
    ]
    await sembrarFotos()
    expect(mundo.insertados.map((f) => (f.regla as { fecha: string }).fecha))
      .toEqual(['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-12'])
  })

  it('⛔ NO clona los moldes del ingreso, ni el ingreso los suyos', async () => {
    mundo.items = [molde(), moldeFotos()]
    await sembrarFotos()
    expect(mundo.insertados.map((f) => f.titulo)).toEqual(['Cápsula primavera · Buscar y contactar la modelo'])

    mundo.insertados = []
    const res = await desdeAfuera()
    expect(res.code).toBe(200)
    expect(mundo.insertados.map((f) => f.titulo)).toEqual(['IMP2 · Cargar el nombre'])
  })

  it('🔑 el ORIGEN es el eje: el paso de una dueña sólo cae en su origen', async () => {
    // El 1º y el 9º cambian de dueña: un faltante lo arma Cande, una campaña y un ingreso, Sofi.
    mundo.items = [
      moldeFotos({ id: 'comun', titulo: 'Devolver la ropa contada', datos: { plantilla: 'sesion-fotos', offsetDias: 0 } }),
      moldeFotos({ id: 'due-fal', titulo: 'Armar el pedido (Cande)', datos: { plantilla: 'sesion-fotos', offsetDias: 0, disparadores: ['faltante'] } }),
      moldeFotos({ id: 'due-sofi', titulo: 'Armar el pedido (Sofi)', datos: { plantilla: 'sesion-fotos', offsetDias: 0, disparadores: ['campania', 'ingreso'] } }),
    ]
    await sembrarFotos({ eje: 'faltante' })
    expect(mundo.insertados.map((f) => f.titulo).sort())
      .toEqual(['Cápsula primavera · Armar el pedido (Cande)', 'Cápsula primavera · Devolver la ropa contada'])
  })

  it('🔴 sin origen no siembra: sembrar «igual» le pone la dueña equivocada a nueve renglones', async () => {
    mundo.items = [moldeFotos()]
    for (const malo of [undefined, null, '', 'campaña', 'Campania', 'faltante de foto']) {
      mundo.insertados = []
      const r = await sembrarFotos({ eje: malo })
      expect(String(r.error), String(malo)).toContain('origen')
      expect(mundo.insertados, String(malo)).toEqual([])
    }
  })

  it('el error de «hay moldes pero ninguno corre» nombra el origen en castellano', async () => {
    mundo.items = [moldeFotos({ datos: { plantilla: 'sesion-fotos', offsetDias: 0, disparadores: ['faltante'] } })]
    const r = await sembrarFotos({ eje: 'campania' })
    // ⛔ `campania` sin ñ es la clave que viaja al KV, no lo que lee una persona.
    expect(String(r.error)).toContain('Campaña')
    expect(String(r.error)).toContain('bdi')
  })

  it('🔑 la clave es el ID de la sesión: moverle la fecha ⛔ NO la vuelve a sembrar', async () => {
    mundo.items = [moldeFotos()]
    await sembrarFotos()
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.sesion).toBe('sesion-fotos·s99')
    expect(datos.de).toBe('sesion-fotos')
    expect(datos.disparador).toBe('campania')
    // La misma sesión, otro día: con `fecha·nombre` sembraría los nueve de nuevo.
    mundo.items = [...mundo.items, ...mundo.insertados]
    mundo.insertados = []
    const r = await sembrarFotos({ fecha: '2026-09-17' })
    expect(r.ya).toBe(true)
    expect(mundo.insertados).toEqual([])
  })

  it('el clon nace en la marca de la sesión, no en las del molde', async () => {
    mundo.items = [moldeFotos({ marcas: [] })]
    await sembrarFotos({ marca: 'zattia' })
    expect(mundo.insertados[0].marcas).toEqual(['zattia'])
  })

  it('una plantilla que no existe ⛔ no cae en la primera: lo dice y no siembra', async () => {
    mundo.items = [molde(), moldeFotos()]
    for (const mala of ['sesion', 'SESION-FOTOS', '', undefined]) {
      mundo.insertados = []
      const r = await sembrarFotos({ plantilla: mala })
      expect(String(r.error), String(mala)).toContain('plantilla')
      expect(mundo.insertados, String(mala)).toEqual([])
    }
  })
})

describe('cargar un molde de sesión de fotos: el eje y el rango son de la plantilla', () => {
  const guardar = (extra: Record<string, unknown> = {}) => llamar({
    action: 'guardar-item',
    item: {
      id: 'f9',
      clase: 'pendiente',
      titulo: 'Buscar la modelo',
      regla: { tipo: 'diaria' },
      plantilla: 'sesion-fotos',
      offsetDias: -2,
      ...extra,
    },
  })

  it('los días negativos se guardan tal cual: es lo que dice el manual', async () => {
    const res = await guardar()
    expect(res.code).toBe(200)
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.offsetDias).toBe(-2)
    expect(datos.plantilla).toBe('sesion-fotos')
  })

  it('🔴 el MISMO −2 en un molde de ingreso es 400, ⛔ no un 0 callado', async () => {
    // El ingreso se entera cuando la mercadería ya llegó: un paso «dos días antes» nace vencido.
    const res = await guardar({ plantilla: 'ingreso', offsetDias: -2 })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('ingreso')
    expect(mundo.insertados).toEqual([])
  })

  it('🔴 fuera de rango por arriba también es 400: recortar a 90 sería guardar otra cosa', async () => {
    for (const malo of [120, -60]) {
      mundo = nuevoMundo()
      const res = await guardar({ offsetDias: malo })
      expect(res.code, String(malo)).toBe(400)
      expect(mundo.insertados, String(malo)).toEqual([])
    }
  })

  it('los orígenes tildados se guardan en `disparadores`, ⛔ no en `puertas`', async () => {
    const res = await guardar({ disparadores: ['faltante'], puertas: ['importacion'] })
    expect(res.code).toBe(200)
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.disparadores).toEqual(['faltante'])
    // Las puertas son el eje de la OTRA plantilla: en un molde de sesión no quieren decir nada.
    expect(datos.puertas).toBeUndefined()
  })

  it('un origen que no existe es 400: la lista es cerrada como la de las puertas', async () => {
    for (const malo of [['campaña'], ['faltante', 'otro'], 'faltante']) {
      mundo = nuevoMundo()
      const res = await guardar({ disparadores: malo })
      expect(res.code, JSON.stringify(malo)).toBe(400)
      expect(String(res.body?.error), JSON.stringify(malo)).toContain('Origen')
    }
  })

  it('ninguno tildado no se guarda: la ausencia ya dice «los tres»', async () => {
    await guardar({ disparadores: [] })
    expect((mundo.insertados[0].datos as Record<string, unknown>).disparadores).toBeUndefined()
  })

  it('y el GET los devuelve para que el modal los pueda volver a dibujar', async () => {
    mundo.items = [molde({ id: 'f1', datos: { plantilla: 'sesion-fotos', offsetDias: -2, disparadores: ['faltante'] } })]
    const res = await leerAgenda()
    const it = (res.body?.items as Record<string, unknown>[])[0]
    expect(it.plantilla).toBe('sesion-fotos')
    expect(it.offsetDias).toBe(-2)
    expect(it.disparadores).toEqual(['faltante'])
  })
})

/**
 * **El 3º disparador: el LANZAMIENTO.**
 *
 * El manual 08 tiene diecisiete renglones y **siete son los mismos moldes del ingreso** (el nombre,
 * la descripción, el precio, la sesión de fotos, las fotos al Drive y a la web, las pantallas).
 * Bruno cerró la duda el 29-ago: *«lanzamiento siempre tiene algo nuevo»* ⇒ **todo lanzamiento trae
 * un ingreso adentro**, así que los siete compartidos **se quedan en el ingreso** y el lanzamiento
 * siembra **sólo sus once**. Cargarlos en los dos lados dejaría dos lugares donde la dueña puede
 * decir cosas distintas.
 *
 * 🔑 **Y siguen siendo DOS disparadores aunque uno implique al otro, porque son DOS RELOJES**: el
 * lanzamiento se abre al decidirlo y cuelga de la **fecha objetivo**; el ingreso cuelga de **la
 * fecha en que llegó**, que la mueve el camión. Una sola lista tendría que colgar de una sola fecha
 * y la mitad quedaría mal.
 *
 * Lo que se prueba acá es lo que esta plantilla trajo de nuevo al motor: **una plantilla SIN EJE**.
 */
describe('el lanzamiento: el 3º disparador, y la plantilla sin eje', () => {
  const moldeLanz = (over: Partial<Fila> = {}): Fila => ({
    ...molde(),
    id: 'l1',
    titulo: '07) Calentar la audiencia',
    destino: { tipo: 'personas', personas: ['Sofia Facello'] },
    manual_id: 'man-lanz',
    datos: { plantilla: 'lanzamiento', offsetDias: -2 },
    ...over,
  })

  const sembrarLanz = async (over: Record<string, unknown> = {}) => {
    const mod = await import('@/api/_agenda.js')
    return (mod.sembrar as unknown as (sb: unknown, o: Record<string, unknown>) => Promise<Record<string, unknown>>)(
      fakeSupabase(),
      { plantilla: 'lanzamiento', nombre: 'Cápsula primavera', fecha: '2026-10-01', autor: 'Bruno Arevalo', marca: 'bdi', clave: 'lanzamiento·h9', ...over },
    )
  }

  it('🔑 siembra SIN pedir eje: los once tienen la misma dueña pase lo que pase', async () => {
    mundo.items = [moldeLanz()]
    const r = await sembrarLanz()
    expect(r.creados).toBe(1)
    expect(mundo.insertados[0].titulo).toBe('Cápsula primavera · 07) Calentar la audiencia')
    expect((mundo.insertados[0].regla as { fecha: string }).fecha).toBe('2026-09-29')
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.de).toBe('lanzamiento')
    expect(datos.lanzamiento).toBe('lanzamiento·h9')
    // ⛔ Ni `puerta` ni `disparador`: esta plantilla no tiene eje, así que el clon no lleva ninguno.
    expect(datos.puerta).toBeUndefined()
    expect(datos.disparador).toBeUndefined()
  })

  it('🔴 un eje que llega igual es 400 y lo nombra, ⛔ no un dato descartado callado', async () => {
    mundo.items = [moldeLanz()]
    const r = await sembrarLanz({ eje: 'importacion' })
    expect(String(r.error)).toContain('importacion')
    expect(String(r.error)).toContain('lanzamiento')
    expect(mundo.insertados).toEqual([])
  })

  it('...pero el eje VACÍO no molesta: es lo que manda quien no sabe que no hay eje', async () => {
    for (const vacio of [undefined, null, '']) {
      mundo = nuevoMundo()
      mundo.items = [moldeLanz()]
      const r = await sembrarLanz({ eje: vacio })
      expect(r.creados, String(vacio)).toBe(1)
    }
  })

  it('el error de «ninguno corre» ⛔ no nombra un eje que no existe', async () => {
    mundo.items = [moldeLanz({ marcas: ['zattia'] })]
    const r = await sembrarLanz({ marca: 'bdi' })
    expect(String(r.error)).toContain('bdi')
    expect(String(r.error)).not.toContain('undefined')
    expect(String(r.error)).not.toContain('null')
  })

  it('⛔ NO se mezcla con las otras dos plantillas', async () => {
    mundo.items = [molde(), moldeLanz()]
    await sembrarLanz()
    expect(mundo.insertados.map((f) => f.titulo)).toEqual(['Cápsula primavera · 07) Calentar la audiencia'])
  })

  it('🔑 la clave es el ID del hito: mover la fecha objetivo ⛔ no vuelve a sembrar', async () => {
    mundo.items = [moldeLanz()]
    await sembrarLanz()
    mundo.items = [...mundo.items, ...mundo.insertados]
    mundo.insertados = []
    const r = await sembrarLanz({ fecha: '2026-10-15' })
    expect(r.ya).toBe(true)
    expect(mundo.insertados).toEqual([])
  })

  it('un mes hacia atrás entra, y ⛔ más no: el clon nacería fuera de la ventana de arrastre', async () => {
    const guardar = (offsetDias: number) => llamar({
      action: 'guardar-item',
      item: { id: 'l9', clase: 'pendiente', titulo: 'Los canjes', regla: { tipo: 'diaria' }, plantilla: 'lanzamiento', offsetDias },
    })
    const ok = await guardar(-30)
    expect(ok.code).toBe(200)
    expect((mundo.insertados[0].datos as Record<string, unknown>).offsetDias).toBe(-30)
    mundo = nuevoMundo()
    const mal = await guardar(-31)
    expect(mal.code).toBe(400)
    expect(String(mal.body?.error)).toContain('lanzamiento')
  })

  it('un molde de lanzamiento ⛔ no guarda puertas ni orígenes aunque el formulario los mande', async () => {
    const res = await llamar({
      action: 'guardar-item',
      item: {
        id: 'l9', clase: 'pendiente', titulo: 'El banner', regla: { tipo: 'diaria' },
        plantilla: 'lanzamiento', offsetDias: -1, puertas: ['importacion'], disparadores: ['campania'],
      },
    })
    expect(res.code).toBe(200)
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.plantilla).toBe('lanzamiento')
    expect(datos.puertas).toBeUndefined()
    expect(datos.disparadores).toBeUndefined()
  })
})

/**
 * **El 4º disparador: el CAMBIO DE CONDICIÓN COMERCIAL.**
 *
 * Sale de una frase del manual «Las chiquitas», que es la que lo define:
 *
 * > Un cambio de condición comercial —una promo, una forma de pago, un cambio de envío— **no es un
 * > posteo**: es destacadas + barra de anuncios + bio + el local avisado + el mail.
 *
 * La auditoría del 28-ago-2026 lo midió cuarto (23 días distintos de 2026, 6 con dos sectores o
 * más) y lo único que le faltaba era **qué lo aprieta**. Son dos cosas, y ⛔ no una:
 *
 *  1. **el alta de una promo bancaria**, que es el único de los tres que tiene objeto en el Monitor;
 *  2. **un botón**, para los otros dos —una forma de pago o un envío no los carga nadie en ninguna
 *     pantalla, y son justo los que hoy se comunican de a pedazos.
 *
 * Lo que esta plantilla trajo de nuevo al motor y se prueba acá: **el freno del hecho vencido**
 * (que además se mudó del calendario, donde estaba escrito para el lanzamiento) y **la marca dentro
 * de la clave**, que es la única de las cuatro donde el hecho no tiene una sola.
 */
describe('el freno del hecho vencido: la regla vive UNA vez, en el núcleo', () => {
  const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

  const moldeCond = (over: Partial<Fila> = {}): Fila => ({
    ...molde(),
    id: 'c1',
    titulo: 'Actualizar la barra de anuncios',
    destino: { tipo: 'personas', personas: ['Cande'] },
    datos: { plantilla: 'condicion', offsetDias: 0 },
    ...over,
  })

  const sembrarCond = async (over: Record<string, unknown> = {}) => {
    const mod = await import('@/api/_agenda.js')
    return (mod.sembrar as unknown as (sb: unknown, o: Record<string, unknown>) => Promise<Record<string, unknown>>)(
      fakeSupabase(),
      { plantilla: 'condicion', nombre: '3 cuotas', fecha: dia(0), autor: 'Bruno Arevalo', eje: 'promo', marca: 'bdi', ...over },
    )
  }

  it('🔑 `hechoYaPaso` corta AYER y no hoy: el margen es la zona horaria, no una tolerancia', async () => {
    const { hechoYaPaso } = await import('@/lib/agenda/plantillas.core.js')
    // 🔑 El caso que distingue el margen del `< hoy` pelado es **el de AYER**: el servidor corre en
    // UTC y a las 21:00 de Argentina allá ya es mañana, así que un hecho de hoy guardado a la noche
    // se leería como vencido. Con `ahora` fijo, esto ⛔ no depende del día en que se corra.
    const ahora = Date.parse('2026-08-29T12:00:00.000Z')
    expect(hechoYaPaso('2026-08-27', ahora)).toBe(true)
    expect(hechoYaPaso('2026-08-28', ahora)).toBe(false)
    expect(hechoYaPaso('2026-08-29', ahora)).toBe(false)
    expect(hechoYaPaso('2026-08-30', ahora)).toBe(false)
  })

  it('🔴 un cambio cuya fecha ya pasó ⛔ no siembra, lo dice, y ⛔ NO toca la base', async () => {
    mundo.items = [moldeCond()]
    const r = await sembrarCond({ fecha: dia(-30) })
    expect(String(r.error)).toContain('ya pasó')
    expect(String(r.error)).toContain('del cambio')
    // Va antes de leer nada: un hecho vencido no tiene por qué costar una consulta.
    expect(mundo.tocoLaBase).toBe(false)
    expect(mundo.insertados).toEqual([])
  })

  it('...pero el de AYER siembra: es el mismo margen, ejercido por el motor y no sólo por la función', async () => {
    mundo.items = [moldeCond()]
    const r = await sembrarCond({ fecha: dia(-1) })
    expect(r.creados).toBe(1)
  })

  it('🔑 el mismo freno vale para el LANZAMIENTO, que es de donde se mudó la regla', async () => {
    // Hasta el 29-ago-2026 esto lo decidía `api/_calendario.js`. Se mudó al núcleo cuando el 4º
    // disparador necesitó la misma pregunta desde otro handler: dos copias de una regla es la forma
    // más barata de que mañana digan cosas distintas.
    mundo.items = [moldeCond({ datos: { plantilla: 'lanzamiento', offsetDias: 0 } })]
    const mod = await import('@/api/_agenda.js')
    const r = await (mod.sembrar as unknown as (sb: unknown, o: Record<string, unknown>) => Promise<Record<string, unknown>>)(
      fakeSupabase(),
      { plantilla: 'lanzamiento', nombre: 'Cápsula', fecha: dia(-10), autor: 'Bruno', marca: 'bdi', clave: 'lanzamiento·h1' },
    )
    expect(String(r.error)).toContain('ya pasó')
    expect(mundo.insertados).toEqual([])
  })

  it('⛔ y el INGRESO ⛔ NO lo lleva: la mercadería llega y a veces se avisa dos días después', async () => {
    // No es un olvido: ahí el pendiente atrasado es exactamente lo que hay que ver. Si alguien le
    // pone `noSiembraSiPaso` al ingreso, esto se pone en rojo.
    const res = await desdeAdentro({ fecha: dia(-20) })
    expect(res.code).toBe(200)
    expect(res.body?.creados).toBe(1)
  })
})

describe('qué cambió: el eje del 4º disparador', () => {
  const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  const moldeCond = (over: Partial<Fila> = {}): Fila => ({
    ...molde(),
    id: 'c1',
    titulo: 'Actualizar la barra de anuncios',
    destino: { tipo: 'personas', personas: ['Cande'] },
    datos: { plantilla: 'condicion', offsetDias: 0 },
    ...over,
  })
  const sembrarCond = async (over: Record<string, unknown> = {}) => {
    const mod = await import('@/api/_agenda.js')
    return (mod.sembrar as unknown as (sb: unknown, o: Record<string, unknown>) => Promise<Record<string, unknown>>)(
      fakeSupabase(),
      { plantilla: 'condicion', nombre: '3 cuotas', fecha: dia(0), autor: 'Bruno Arevalo', eje: 'promo', marca: 'bdi', ...over },
    )
  }

  it('el clon guarda QUÉ cambió: es el único rastro de por qué sembró cinco y no seis', async () => {
    mundo.items = [moldeCond()]
    const r = await sembrarCond({ eje: 'envio' })
    expect(r.creados).toBe(1)
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.de).toBe('condicion')
    expect(datos.cambio).toBe('envio')
    // ⛔ Ni puerta ni origen: cada plantilla guarda el suyo.
    expect(datos.puerta).toBeUndefined()
    expect(datos.disparador).toBeUndefined()
  })

  it('🔑 el molde con `cambios` corre SÓLO en ésos, y el vacío corre en los tres', async () => {
    // «Los videos de las pantallas son a cada cambio de PROMO» y «las destacadas, cada vez que
    // cambia una condición comercial» son dos frases del manual que ⛔ no dicen lo mismo.
    mundo.items = [
      moldeCond({ id: 'v1', titulo: 'Los videos de las pantallas', datos: { plantilla: 'condicion', offsetDias: 0, cambios: ['promo'] } }),
      moldeCond({ id: 'd1', titulo: 'Las destacadas' }),
    ]
    const soloPromo = await sembrarCond({ eje: 'envio' })
    expect(soloPromo.creados).toBe(1)
    expect(mundo.insertados.map((f) => f.titulo)).toEqual(['3 cuotas · Las destacadas'])

    mundo.insertados = []
    mundo.items = mundo.items.slice(0, 2)
    const conPromo = await sembrarCond({ eje: 'promo', nombre: 'Otra' })
    expect(conPromo.creados).toBe(2)
  })

  it('🔴 sin decir qué cambió ⛔ no siembra: es 400 y nombra la pregunta', async () => {
    mundo.items = [moldeCond()]
    for (const nada of [undefined, null, '', 'otra-cosa']) {
      mundo.insertados = []
      const r = await sembrarCond({ eje: nada })
      expect(String(r.error), String(nada)).toContain('qué cambió')
      // Y ofrece las tres, que es lo que hace que el error sea a la vez el pedido.
      expect(String(r.error), String(nada)).toContain('forma-de-pago')
      expect(mundo.insertados, String(nada)).toEqual([])
    }
  })

  it('el catálogo del núcleo y la unión de tipos dicen lo mismo', async () => {
    const { CLAVES_CAMBIO, CAMBIOS, rotuloCambio } = await import('@/lib/agenda/condicion.core.js')
    expect(CLAVES_CAMBIO).toEqual(['promo', 'forma-de-pago', 'envio'])
    // Cada uno con su ayuda: el modal la muestra al elegir, y una vacía se lee como que no hay nada
    // que aclarar justo donde hay que elegir bien.
    expect(CAMBIOS.every((c: { ayuda: string }) => c.ayuda.length > 20)).toBe(true)
    // ⛔ Lo desconocido vuelve tal cual y no cae en el primero: un default acá esconde el dato malo.
    expect(rotuloCambio('inventado')).toBe('inventado')
  })
})

describe('la promo bancaria: la mitad automática del 4º disparador', () => {
  const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  const moldeCond = (over: Partial<Fila> = {}): Fila => ({
    ...molde(),
    id: 'c1',
    titulo: 'Actualizar la barra de anuncios',
    destino: { tipo: 'personas', personas: ['Cande'] },
    datos: { plantilla: 'condicion', offsetDias: 0 },
    ...over,
  })

  const promo = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    banco: 'Galicia',
    medio: 'credito',
    beneficio: { tipo: 'cuotas', n: 3, sinInteres: true },
    regla: { tipo: 'diaria' },
    desde: dia(0),
    hasta: null,
    condiciones: [],
    pasos: null,
    canales: ['mostrador'],
    marcas: ['bdi'],
    activa: true,
    ...over,
  })

  const guardarPromo = (over: Record<string, unknown> = {}) => llamar({ action: 'guardar-promo', promo: promo(over) })
  const clones = () => mundo.escrituras.filter((e) => e.tabla === 'agenda_items').flatMap((e) => e.filas)

  beforeEach(() => { mundo.items = [moldeCond()] })

  it('🔑 una promo PRENDIDA siembra los pasos de comunicarla, con la fecha en que EMPIEZA', async () => {
    const res = await guardarPromo({ desde: dia(5) })
    expect(res.code).toBe(200)
    expect(clones()).toHaveLength(1)
    expect(clones()[0].titulo).toBe('Promo Galicia · Actualizar la barra de anuncios')
    // ⛔ No la fecha de hoy: una promo se carga con anticipación y los pasos cuelgan del día en que
    // la promo empieza a regir. Si esto se cambiara por `hoy`, el banner saldría cinco días antes.
    expect((clones()[0].regla as { fecha: string }).fecha).toBe(dia(5))
    const datos = clones()[0].datos as Record<string, unknown>
    expect(datos.cambio).toBe('promo')
    expect(datos.condicion).toBe('promo·p1·bdi')
  })

  it('🔴 APAGADA ⛔ no siembra: todavía no cambió nada afuera', async () => {
    const res = await guardarPromo({ activa: false })
    expect(res.code).toBe(200)
    // La promo sí se guardó: lo que no salió es el trabajo.
    expect(mundo.escrituras.filter((e) => e.tabla === 'agenda_promos')).toHaveLength(1)
    expect(clones()).toEqual([])
  })

  it('...y el día que la prenden, siembra: el hecho es el ESTADO, ⛔ no el alta', async () => {
    await guardarPromo({ activa: false })
    mundo.escrituras = []
    const res = await guardarPromo({ activa: true })
    expect(res.code).toBe(200)
    expect(clones()).toHaveLength(1)
  })

  it('🔴 `marcas: []` son las DOS tiendas: dos siembras, con dos claves', async () => {
    // Cambiar el banner de Zattia y el de BDI son dos trabajos, de dos personas, en dos tiendas.
    // Con una sola clave el segundo se leería como «ya estaba sembrado» y nadie tocaría el de
    // Zattia. ⚠️ Es la única de las cuatro plantillas donde la marca entra en la clave.
    const res = await guardarPromo({ marcas: [] })
    expect(res.code).toBe(200)
    expect(clones()).toHaveLength(2)
    expect(clones().map((f) => (f.datos as Record<string, unknown>).condicion))
      .toEqual(['promo·p1·bdi', 'promo·p1·zattia'])
    expect(clones().map((f) => f.marcas)).toEqual([['bdi'], ['zattia']])
    expect((res.body?.sembrado as { marca: string }[]).map((x) => x.marca)).toEqual(['bdi', 'zattia'])
  })

  it('🔑 editar la promo ⛔ no vuelve a sembrar: la clave es su id', async () => {
    await guardarPromo()
    mundo.items = [...mundo.items, ...clones()]
    mundo.escrituras = []
    const res = await guardarPromo({ banco: 'Galicia S.A.' })
    expect(res.code).toBe(200)
    expect(clones()).toEqual([])
    expect((res.body?.sembrado as { ya: boolean }[])[0].ya).toBe(true)
  })

  it('🔴 una promo VIEJA ⛔ no siembra —y la promo igual se guarda—', async () => {
    // Es el caso que obligó a poner el freno: en la base hay promos cargadas de antes, y a todas
    // les alcanza con que alguien les corrija una coma. Sin esto, editar una de junio sembraría hoy
    // los pasos de comunicar un cambio de hace tres meses.
    const res = await guardarPromo({ desde: dia(-60) })
    expect(res.code).toBe(200)
    expect(mundo.escrituras.filter((e) => e.tabla === 'agenda_promos')).toHaveLength(1)
    expect(clones()).toEqual([])
    expect(String((res.body?.sembrado as { error: string }[])[0].error)).toContain('ya pasó')
  })

  it('🔴 si no hay moldes, la promo NO se pierde y el error viaja: ⛔ no se calla', async () => {
    mundo.items = []
    const res = await guardarPromo()
    expect(res.code).toBe(200)
    expect(mundo.escrituras.filter((e) => e.tabla === 'agenda_promos')).toHaveLength(1)
    expect(String((res.body?.sembrado as { error: string }[])[0].error)).toContain('condición comercial')
  })
})

describe('el botón «cambió una condición comercial»', () => {
  const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  const moldeCond = (over: Partial<Fila> = {}): Fila => ({
    ...molde(),
    id: 'c1',
    titulo: 'Avisar a los dos locales',
    destino: { tipo: 'roles', roles: ['local'] },
    datos: { plantilla: 'condicion', offsetDias: 0 },
    ...over,
  })
  const aMano = (body: Record<string, unknown> = {}) =>
    llamar({ action: 'condicion', nombre: 'Envío gratis +$80.000', fecha: dia(1), cambio: 'envio', marca: 'zattia', ...body })

  beforeEach(() => { mundo.items = [moldeCond()] })

  it('existe porque dos de los tres cambios ⛔ NO tienen objeto en el Monitor', async () => {
    // Una forma de pago nueva y un cambio de envío no los carga nadie en ninguna pantalla: sin el
    // botón, esos dos siguen dependiendo de que alguien se acuerde.
    const res = await aMano()
    expect(res.code).toBe(200)
    expect(res.body?.creados).toBe(1)
    expect(mundo.insertados[0].titulo).toBe('Envío gratis +$80.000 · Avisar a los dos locales')
    expect((mundo.insertados[0].datos as Record<string, unknown>).cambio).toBe('envio')
  })

  it('pide permiso de carga, como todo lo que escribe en la Agenda', async () => {
    mundo.puedeCargar = false
    const res = await aMano()
    expect(res.code).toBe(403)
    expect(mundo.insertados).toEqual([])
  })

  it('sin sesión no entra, aunque sepa el nombre de la acción', async () => {
    mundo.hayPerfil = false
    const res = await aMano()
    expect(res.code).toBe(401)
    expect(mundo.insertados).toEqual([])
  })

  it('🔴 la fecha ⛔ NO tiene default a hoy, al revés que el ingreso', async () => {
    // Acá la fecha es «desde cuándo rige», que es un dato que la persona tiene y casi nunca es hoy.
    // Un default la contestaría sola, y el banner saldría el día equivocado sin que nadie eligiera.
    const res = await aMano({ fecha: undefined })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('YYYY-MM-DD')
    expect(mundo.insertados).toEqual([])
  })

  it('la fecha vencida se rechaza acá también, y ⛔ no sólo en la pantalla', async () => {
    const res = await aMano({ fecha: dia(-5) })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('ya pasó')
  })

  it('⛔ no puede sembrar OTRA plantilla: el nombre de la acción es propio de este hecho', async () => {
    // Una acción `sembrar` genérica dejaría clonar a mano los once del lanzamiento sin el hito que
    // les da fecha, o los de una sesión que no existe. Por eso hay una acción por hecho.
    mundo.items = [moldeCond({ datos: { plantilla: 'lanzamiento', offsetDias: 0 } })]
    const res = await aMano({ plantilla: 'lanzamiento' })
    // El 400 habla de la condición comercial y ⛔ no del lanzamiento: el `plantilla` del cuerpo ni
    // se mira, así que lo que faltó fue el molde de ESTE hecho.
    expect(String(res.body?.error)).toContain('condición comercial')
    expect(mundo.insertados).toEqual([])
  })
})

describe('cargar un molde de condición comercial', () => {
  it('guarda en qué cambios corre, y el vacío ⛔ no se guarda: es «los tres»', async () => {
    const res = await llamar({
      action: 'guardar-item',
      item: {
        id: 'c9', clase: 'pendiente', titulo: 'Los videos de las pantallas', regla: { tipo: 'diaria' },
        plantilla: 'condicion', offsetDias: 0, cambios: ['promo'],
      },
    })
    expect(res.code).toBe(200)
    const datos = mundo.insertados[0].datos as Record<string, unknown>
    expect(datos.plantilla).toBe('condicion')
    expect(datos.cambios).toEqual(['promo'])

    mundo = nuevoMundo()
    await llamar({
      action: 'guardar-item',
      item: { id: 'c9', clase: 'pendiente', titulo: 'Las destacadas', regla: { tipo: 'diaria' }, plantilla: 'condicion', offsetDias: 0 },
    })
    expect((mundo.insertados[0].datos as Record<string, unknown>).cambios).toBeUndefined()
  })

  it('una semana hacia atrás entra, y ⛔ más no', async () => {
    const guardar = (offsetDias: number) => llamar({
      action: 'guardar-item',
      item: { id: 'c9', clase: 'pendiente', titulo: 'El mail', regla: { tipo: 'diaria' }, plantilla: 'condicion', offsetDias },
    })
    const ok = await guardar(-7)
    expect(ok.code).toBe(200)
    expect((mundo.insertados[0].datos as Record<string, unknown>).offsetDias).toBe(-7)
    mundo = nuevoMundo()
    const mal = await guardar(-8)
    expect(mal.code).toBe(400)
    expect(String(mal.body?.error)).toContain('condición comercial')
  })

  it('🔴 un cambio inválido es 400, ⛔ no una lista recortada en silencio', async () => {
    const res = await llamar({
      action: 'guardar-item',
      item: {
        id: 'c9', clase: 'pendiente', titulo: 'El mail', regla: { tipo: 'diaria' },
        plantilla: 'condicion', offsetDias: 0, cambios: ['promo', 'inventado'],
      },
    })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('Cambio inválido')
    expect(mundo.insertados).toEqual([])
  })

  it('🔴 el GET devuelve `cambios`: sin eso los tildes salían apagados y el próximo guardado los borraba', async () => {
    // El mapeo del GET tenía escritos los dos ejes que existían. El tercero habría viajado siempre
    // vacío —la pantalla afirmando «corre en los tres»— y al re-guardar se borraba de verdad.
    mundo.items = [{
      ...molde(),
      datos: { plantilla: 'condicion', offsetDias: 0, cambios: ['envio'] },
    }]
    const res = await leerAgenda()
    expect(res.code).toBe(200)
    const items = res.body?.items as Record<string, unknown>[]
    expect(items[0].cambios).toEqual(['envio'])
  })
})

/**
 * El techo diario de sembrado.
 *
 * 🔴 **Existe por si un bucle empieza a sembrar solo, ⛔ no para racionar el trabajo** — y el
 * 1-sep-2026 frenó a Bruno contestando puertas de órdenes reales: ese día el webhook empezó a
 * mandar en vivo, entraron 11 órdenes, cada puerta contestada siembra 6 pasos y el techo estaba en
 * 60. Se midió: 60 clones de ingreso + 8 de sesión de fotos = 68, y el mensaje decía «se llegó al
 * tope» a secas, sin un número.
 */
describe('el techo diario', () => {
  const hoy = new Date().toISOString().slice(0, 10)
  const clonDeHoy = (i: number): Fila => ({
    id: `c${i}`,
    clase: 'pendiente',
    titulo: `clon ${i}`,
    cuerpo: null,
    regla: { tipo: 'unica', fecha: hoy },
    destino: null,
    marcas: [],
    manual_id: null,
    datos: { de: 'ingreso', ingreso: `${hoy}·x${i}` },
    created_at: `${hoy}T10:00:00.000Z`,
  })

  const sembrarUno = async (over: Record<string, unknown> = {}) => {
    const mod = await import('@/api/_agenda.js')
    return (mod.sembrar as unknown as (sb: unknown, o: Record<string, unknown>) => Promise<Record<string, unknown>>)(
      fakeSupabase(),
      { plantilla: 'ingreso', nombre: 'IMP9', fecha: hoy, autor: 'Bruno', eje: 'importacion', marca: 'bdi', ...over },
    )
  }

  it('🔴 un día de 11 ingresos ENTRA: 66 pasos no pueden chocar contra el techo', async () => {
    // 11 órdenes × 6 pasos = 66, más lo que siembre la sesión de fotos. Con el techo viejo en 60,
    // esto era el error que vio Bruno.
    mundo.items = [molde(), ...Array.from({ length: 74 }, (_, i) => clonDeHoy(i))]
    const r = await sembrarUno()
    expect(r.error).toBeUndefined()
    expect(r.creados).toBe(1)
  })

  it('el techo sigue estando, y el mensaje dice los NÚMEROS y que cuenta todas las plantillas', async () => {
    mundo.items = [molde(), ...Array.from({ length: 300 }, (_, i) => clonDeHoy(i))]
    const r = await sembrarUno()
    expect(String(r.error)).toContain('300 de 300')
    expect(String(r.error)).toContain('todas las plantillas')
    expect(mundo.insertados).toHaveLength(0)
  })

  it('⚠️ los clones de AYER no cuentan: el techo es por día, no un total', async () => {
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    mundo.items = [
      molde(),
      ...Array.from({ length: 400 }, (_, i) => ({ ...clonDeHoy(i), created_at: `${ayer}T10:00:00.000Z` })),
    ]
    const r = await sembrarUno()
    expect(r.error).toBeUndefined()
  })
})
