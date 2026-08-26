import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { esDeArriba, veLoDeArriba } from '@/lib/agenda'
import type { Funcion, Perfil } from '@/lib/permisos'

/**
 * **El techo: Dirección arriba, el resto abajo** (26-ago-2026).
 *
 * `agenda.cargar` es todo o nada: quien lo tiene ve la agenda entera. Mientras el único que lo tuvo
 * fue el admin eso no molestó; el día que lo tiene Administración empieza a ver las rutinas de los
 * socios. Bruno: *«que puedan asignar para abajo, o no poder asignar para arriba ni ver para
 * arriba»*.
 *
 * Lo que hay que amarrar son tres cosas, y las tres se rompen distinto:
 *
 *  1. **La regla pura**, que tiene una trampa: alcanza con UN destinatario de arriba. Si bastara con
 *     que hubiera alguien de abajo, escribir dos nombres sería la forma de saltear el techo.
 *  2. **El corte del listado**, que tiene que estar en el SERVIDOR. Filtrando en la pantalla el ítem
 *     igual viaja en el JSON y enciende el badge.
 *  3. **El guard de escritura**, que mira DOS destinos: el que llega y el que la fila ya tiene.
 *     `guardar-item` es un upsert por id y `borrar-item` un delete por id: sin el segundo, alguien
 *     de abajo pisa la reunión de los socios mandando su id.
 */

// ── 1. La regla pura ────────────────────────────────────────────────────────────

const EQUIPO = [
  { name: 'Bruno Arevalo', funcion: ['direccion' as const] },
  { name: 'Dario Arevalo', funcion: ['direccion' as const] },
  { name: 'Lorena Reyes', funcion: ['administracion' as const] },
  { name: 'Sofia Facello', funcion: ['marketing' as const] },
  { name: 'Local', funcion: [] },
]

describe('esDeArriba — qué es «de Dirección»', () => {
  it('el rol lo dice solo, sin mirar el padrón', () => {
    // Es el caso barato: el destino ya trae la respuesta, así que no hace falta ir a bdi-catalogo.
    expect(esDeArriba({ tipo: 'roles', roles: ['direccion'] }, [])).toBe(true)
    expect(esDeArriba({ tipo: 'roles', roles: ['marketing', 'local'] }, [])).toBe(false)
  })

  it('🔴 alcanza con UNO: mezclar un rol de abajo no lo baja', () => {
    // Sin esto, «Marketing y Dirección» sería la forma de que Administración vea lo de arriba.
    expect(esDeArriba({ tipo: 'roles', roles: ['marketing', 'direccion'] }, [])).toBe(true)
    expect(esDeArriba({ tipo: 'personas', personas: ['Sofia Facello', 'Bruno Arevalo'] }, EQUIPO)).toBe(true)
  })

  it('por nombre, la función sale del padrón', () => {
    expect(esDeArriba({ tipo: 'personas', personas: ['Bruno Arevalo'] }, EQUIPO)).toBe(true)
    expect(esDeArriba({ tipo: 'personas', personas: ['Lorena Reyes'] }, EQUIPO)).toBe(false)
    // Un puesto compartido no es de nadie de arriba, y se le puede asignar igual.
    expect(esDeArriba({ tipo: 'personas', personas: ['Local'] }, EQUIPO)).toBe(false)
  })

  it('⛔ lo que es para todos, o para quien usa una pantalla, NUNCA es de arriba', () => {
    // Es la mitad de la regla que evita el desastre: si «todos» contara como de arriba, esconder lo
    // de Dirección escondería también lo que más se comparte.
    expect(esDeArriba({ tipo: 'todos' }, EQUIPO)).toBe(false)
    expect(esDeArriba({ tipo: 'seccion', key: 'atencion' }, EQUIPO)).toBe(false)
    expect(esDeArriba(null, EQUIPO)).toBe(false)
  })

  it('sin padrón, un destino por nombre da false: el que cierra es el guard de escritura', () => {
    // Es el default seguro del lado correcto: una caída de bdi-catalogo deja ver de más por un rato,
    // ⛔ no deja al equipo entero sin agenda. Escribir, en cambio, se cierra (ver el 503 de abajo).
    expect(esDeArriba({ tipo: 'personas', personas: ['Bruno Arevalo'] }, [])).toBe(false)
  })
})

describe('veLoDeArriba — a quién no le aplica el techo', () => {
  /** Lo mínimo que `Perfil` exige; lo que se mira acá son `admin` y `funcion`. */
  const perfil = (admin: boolean, funcion: Funcion[]): Perfil =>
    ({ name: 'x', admin, funcion, cuenta: null, acceso: {} })

  it('el admin y Dirección', () => {
    expect(veLoDeArriba(perfil(true, []))).toBe(true)
    expect(veLoDeArriba(perfil(false, ['direccion']))).toBe(true)
  })
  it('Administración no, aunque cargue la agenda', () => {
    expect(veLoDeArriba(perfil(false, ['administracion']))).toBe(false)
    expect(veLoDeArriba(null)).toBe(false)
  })
})

// ── 2 y 3. El servidor ──────────────────────────────────────────────────────────

type Fila = Record<string, unknown>
type Mundo = {
  items: Fila[]
  perfil: Fila
  /** El padrón tal como lo devuelve `equipoDelPadron`. Vacío = no se pudo leer. */
  equipo: { name: string; funcion: string[] }[]
  escritos: Fila[]
  borrados: boolean
}
let mundo: Mundo

function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: { tabla: string; insert: Fila[] | null; id?: string; borra: boolean } =
      { tabla, insert: null, borra: false }
    const resolver = async () => {
      if (ctx.borra) { mundo.borrados = true; return { data: null, error: null } }
      if (ctx.insert) { mundo.escritos.push(...ctx.insert); return { data: null, error: null } }
      if (ctx.tabla === 'agenda_items') {
        // `maybeSingle` sobre un id concreto es lo que usa `destinoGuardado`.
        if (ctx.id) return { data: mundo.items.find((i) => i.id === ctx.id) || null, error: null }
        return { data: mundo.items, error: null }
      }
      return { data: [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: string) => { if (c === 'id') ctx.id = v; return api },
      order: () => api, gte: () => api, lt: () => api, in: () => api,
      insert: (f: Fila[]) => { ctx.insert = f; return api },
      upsert: (f: Fila[]) => { ctx.insert = f; return api },
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
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => mundo.perfil,
  equipoDelPadron: async () => mundo.equipo,
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

async function llamar(method: 'GET' | 'POST', body: unknown = {}) {
  const mod = await import('@/api/_agenda.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method, headers: {}, query: {}, body }, res,
  )
  return res
}

const item = (over: Partial<Fila> = {}): Fila => ({
  id: 'x1', clase: 'pendiente', titulo: 'Reponer la vidriera', cuerpo: null,
  regla: { tipo: 'semanal', dias: [2] }, destino: { tipo: 'todos' }, marcas: [],
  manual_id: null, activo: true, datos: {}, autor: 'Bruno', created_at: '2026-01-05T10:00:00.000Z',
  ...over,
})

/** Lorena: carga la agenda pero NO es Dirección ni admin. Es el perfil del pedido. */
const ADMINISTRACION = {
  name: 'Lorena Reyes', admin: false, funcion: ['administracion'],
  acceso: { bdi: { 'agenda.cargar': true } }, cuenta: null,
}
/** Bruno: admin, y arriba del techo. */
const DIRECCION = { name: 'Bruno Arevalo', admin: true, funcion: ['direccion'], acceso: {}, cuenta: null }

const titulos = (r: ReturnType<typeof resFalso>) =>
  ((r.body?.items || []) as Fila[]).map((i) => i.titulo)

beforeEach(() => {
  vi.resetModules()
  mundo = {
    items: [
      item({ id: 'equipo', titulo: 'Reponer la vidriera', destino: { tipo: 'todos' } }),
      item({ id: 'rol', titulo: 'Semanal de gerencia', destino: { tipo: 'roles', roles: ['direccion'] } }),
      item({ id: 'nombre', titulo: 'Revisar la pauta con Darío', destino: { tipo: 'personas', personas: ['Bruno Arevalo'] } }),
    ],
    perfil: ADMINISTRACION,
    equipo: EQUIPO.map((u) => ({ name: u.name, funcion: [...u.funcion] })),
    escritos: [],
    borrados: false,
  }
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('el listado: Administración no ve para arriba', () => {
  it('le llega lo del equipo y ⛔ NO lo de Dirección, ni por rol ni por nombre', async () => {
    // 🔴 Es el corte que sostiene las TRES pestañas: Cargar, Cumplimiento y el Mes salen de esta
    // misma lista. Y tiene que ser acá y no en la pantalla: filtrando al dibujar, el ítem viaja
    // igual en el JSON y sigue contando para el badge del menú.
    const res = await llamar('GET')
    expect(res.code).toBe(200)
    expect(titulos(res)).toEqual(['Reponer la vidriera'])
  })

  it('a Dirección le llegan los tres', async () => {
    mundo.perfil = DIRECCION
    const res = await llamar('GET')
    expect(titulos(res)).toHaveLength(3)
  })

  it('si el padrón no se pudo leer, el de ROL sigue escondido', async () => {
    // La mitad barata de la regla no depende de bdi-catalogo, y es la que cubre el caso que Bruno
    // nombró primero: la reunión semanal de los socios.
    mundo.equipo = []
    const res = await llamar('GET')
    expect(titulos(res)).toEqual(['Reponer la vidriera', 'Revisar la pauta con Darío'])
  })
})

describe('la escritura: Administración no asigna para arriba', () => {
  const guardar = (destino: unknown, id = 'nuevo') =>
    llamar('POST', { action: 'guardar-item', item: { ...item({ id, destino }), arrastra: false } })

  it('403 al asignarle algo a Dirección por ROL', async () => {
    const res = await guardar({ tipo: 'roles', roles: ['direccion'] })
    expect(res.code).toBe(403)
    expect(mundo.escritos).toHaveLength(0)
  })

  it('403 al asignárselo por NOMBRE', async () => {
    const res = await guardar({ tipo: 'personas', personas: ['Bruno Arevalo'] })
    expect(res.code).toBe(403)
    expect(mundo.escritos).toHaveLength(0)
  })

  it('🔴 403 al PISAR uno de arriba mandando su id, aunque el destino nuevo sea inofensivo', async () => {
    // `guardar-item` es un upsert por id: sin mirar el destino que la fila YA tiene, cambiarle el
    // destinatario a la reunión de los socios sería mandar su id con `{tipo:'todos'}`.
    const res = await guardar({ tipo: 'todos' }, 'rol')
    expect(res.code).toBe(403)
    expect(mundo.escritos).toHaveLength(0)
  })

  it('lo del equipo se guarda normalmente', async () => {
    const res = await guardar({ tipo: 'roles', roles: ['marketing'] })
    expect(res.code).toBe(200)
    expect(mundo.escritos).toHaveLength(1)
  })

  it('🔴 503 —no 200— si el padrón no se pudo leer y se está asignando por nombre', async () => {
    // Lo que falta CIERRA. En el listado la caída deja ver de más y se pasa sola; acá dejaría
    // escribir de más, y eso no se deshace.
    mundo.equipo = []
    const res = await guardar({ tipo: 'personas', personas: ['Sofia Facello'] })
    expect(res.code).toBe(503)
    expect(mundo.escritos).toHaveLength(0)
  })

  it('pero sin padrón se puede seguir asignando por rol y a todos', async () => {
    // El 503 es sólo donde el padrón hace falta: si cerrara todo, una caída de bdi-catalogo dejaría
    // a Administración sin poder cargar nada.
    mundo.equipo = []
    expect((await guardar({ tipo: 'roles', roles: ['local'] })).code).toBe(200)
  })

  it('Dirección puede asignarse a sí misma', async () => {
    mundo.perfil = DIRECCION
    const res = await guardar({ tipo: 'roles', roles: ['direccion'] })
    expect(res.code).toBe(200)
  })
})

describe('borrar: tampoco por id', () => {
  it('403 al borrar uno de Dirección', async () => {
    const res = await llamar('POST', { action: 'borrar-item', id: 'nombre' })
    expect(res.code).toBe(403)
    expect(mundo.borrados).toBe(false)
  })

  it('lo del equipo se borra', async () => {
    const res = await llamar('POST', { action: 'borrar-item', id: 'equipo' })
    expect(res.code).toBe(200)
    expect(mundo.borrados).toBe(true)
  })
})
