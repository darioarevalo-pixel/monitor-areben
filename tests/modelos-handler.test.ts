// El handler de Modelos, entero: qué deja pasar, qué frena y **qué queda escrito**.
//
// El `createClient` está mockeado con una base falsa que ANOTA lo que se le pide: el oráculo es la
// fila que se escribió, ⛔ no lo que contestó el handler. Es lo que hace que este test pueda decir
// que la normalización pasa **antes** del upsert y no en la pantalla — que es la única forma de que
// un segundo llamador (la sesión de fotos, un script de alta) no meta el talle torcido.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Fila = Record<string, unknown>

const base = {
  tablas: {} as Record<string, Fila[]>,
  escrituras: [] as { tabla: string; verbo: string; filas?: Fila[]; filtro?: [string, unknown] }[],
}

function consulta(tabla: string) {
  const q: Record<string, unknown> = {}
  const filtros: ((f: Fila) => boolean)[] = []
  const filas = () => (base.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))

  for (const m of ['select', 'order'] as const) q[m] = () => q
  q.eq = (col: string, val: unknown) => {
    filtros.push((f) => f[col] === val)
    return q
  }
  q.then = (resolve: (v: { data: Fila[]; error: null }) => unknown) => resolve({ data: filas(), error: null })
  q.range = async () => ({ data: filas(), error: null })
  q.upsert = async (f: Fila | Fila[]) => {
    base.escrituras.push({ tabla, verbo: 'upsert', filas: Array.isArray(f) ? f : [f] })
    return { error: null }
  }
  q.delete = () => ({
    eq: async (col: string, val: unknown) => {
      base.escrituras.push({ tabla, verbo: 'delete', filtro: [col, val] })
      return { error: null }
    },
  })
  return q
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => consulta(t) }) }))

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

/** Alguien de Marketing con la sección tildada en BDI. */
const CON_MODELOS = { name: 'Cami', admin: false, cuenta: null, acceso: { bdi: { modelos: true } }, funcion: [] }
/** La misma persona sin la sección: es el control del gate. */
const SIN_MODELOS = { name: 'Cami', admin: false, cuenta: null, acceso: { bdi: { insumos: true } }, funcion: [] }

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

const pedir = (extra: Record<string, unknown> = {}) => ({
  method: 'GET',
  headers: { 'x-monitor-auth': sobre({ user: 'Cami', pass: 'p' }) },
  query: { store: 'bdi' },
  body: {},
  ...extra,
})

const guardar = (modelo: Record<string, unknown>) =>
  pedir({ method: 'POST', body: { recurso: 'modelos', store: 'bdi', action: 'guardar', modelo } })

async function correr(req: Record<string, unknown>) {
  const { default: handler } = await import('../api/_modelos.js')
  const res = resFalso()
  await (handler as (q: unknown, s: unknown) => Promise<void>)(req, res)
  return res
}

/** La fila que quedó escrita en `modelo`, que es el oráculo de casi todo este archivo. */
const escrita = () => base.escrituras.find((e) => e.tabla === 'modelo' && e.verbo === 'upsert')?.filas?.[0]

beforeEach(() => {
  base.tablas = {}
  base.escrituras = []
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
  sesionDe(CON_MODELOS)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('el candado', () => {
  it('🔴 sin el permiso de la sección contesta 403 y ⛔ NO escribe nada', async () => {
    sesionDe(SIN_MODELOS)
    const res = await correr(guardar({ nombre: 'Juana' }))
    expect(res.code).toBe(403)
    expect(base.escrituras).toEqual([])
  })

  it('con el permiso, la misma llamada entra', async () => {
    const res = await correr(guardar({ nombre: 'Juana' }))
    expect(res.code).toBe(200)
  })
})

describe('lo que el GET manda', () => {
  it('traduce las columnas y ⛔ no inventa: lo no cargado viaja null, las medidas vacías {}', async () => {
    base.tablas.modelo = [{
      id: 'mo1', nombre: 'Juana Pérez', instagram: 'juanap', telefono: null, mail: null,
      agencia: null, booker: null, booker_contacto: null, talle: null, altura: null,
      medidas: null, estado: 'activa', marcas: [], nota: null, autor: 'Cami',
      created_at: 'c', updated_at: 'u',
    }]
    const res = await correr(pedir())
    expect(res.code).toBe(200)
    const m = (res.body?.modelos as Record<string, unknown>[])[0]
    expect(m.bookerContacto).toBeNull()
    expect(m.talle).toBeNull()
    expect(m.medidas).toEqual({})
    expect(m.marcas).toEqual([])
  })
})

describe('lo que queda escrito al guardar', () => {
  it('🔴 el talle, la altura y el Instagram se normalizan ANTES del upsert', async () => {
    await correr(guardar({
      nombre: '  Juana   Pérez ',
      talle: 'talle m',
      altura: '170',
      instagram: 'https://instagram.com/juanap?igshid=x',
    }))
    expect(escrita()).toMatchObject({
      nombre: 'Juana Pérez',
      talle: 'M',
      altura: '1,70 m',
      instagram: 'juanap',
    })
  })

  it('🔴 lo que se dejó vacío se escribe NULL, ⛔ no cadena vacía ni 0', async () => {
    await correr(guardar({ nombre: 'Juana', talle: '', altura: '', mail: '   ', medidas: { cintura: '' } }))
    const f = escrita()!
    expect(f.talle).toBeNull()
    expect(f.altura).toBeNull()
    expect(f.mail).toBeNull()
    expect(f.medidas).toEqual({})
  })

  it('una altura que no parsea ⛔ no se guarda cruda: la frena la validación', async () => {
    const res = await correr(guardar({ nombre: 'Juana', altura: '95' }))
    expect(res.code).toBe(400)
    expect(base.escrituras).toEqual([])
  })

  it('sin nombre ⛔ no escribe', async () => {
    const res = await correr(guardar({ nombre: '  ' }))
    expect(res.code).toBe(400)
    expect(base.escrituras).toEqual([])
  })

  it('un estado inventado ⛔ no entra', async () => {
    const res = await correr(guardar({ nombre: 'Juana', estado: 'de gira' }))
    expect(res.code).toBe(400)
    expect(base.escrituras).toEqual([])
  })

  it('sin id se genera uno nuevo; con id se pisa esa ficha y ⛔ no otra', async () => {
    await correr(guardar({ nombre: 'Juana' }))
    expect(String(escrita()!.id)).toMatch(/^mo\d+_/)
    base.escrituras = []
    await correr(guardar({ id: 'mo9', nombre: 'Juana' }))
    expect(escrita()!.id).toBe('mo9')
  })

  it('el autor es quien tiene la sesión, ⛔ no lo que mande el cuerpo', async () => {
    await correr(guardar({ nombre: 'Juana', autor: 'Otra' }))
    expect(escrita()!.autor).toBe('Cami')
  })

  it('archivar es un guardar con el estado cambiado, ⛔ no un verbo aparte', async () => {
    await correr(guardar({ id: 'mo1', nombre: 'Juana', estado: 'archivada' }))
    expect(escrita()).toMatchObject({ id: 'mo1', estado: 'archivada' })
  })
})

describe('eliminar', () => {
  it('elimina esa ficha y sólo esa', async () => {
    const res = await correr(pedir({ method: 'POST', body: { action: 'eliminar', id: 'mo1', store: 'bdi' } }))
    expect(res.code).toBe(200)
    expect(base.escrituras).toEqual([{ tabla: 'modelo', verbo: 'delete', filtro: ['id', 'mo1'] }])
  })

  it('sin id ⛔ no borra nada', async () => {
    const res = await correr(pedir({ method: 'POST', body: { action: 'eliminar', store: 'bdi' } }))
    expect(res.code).toBe(400)
    expect(base.escrituras).toEqual([])
  })
})

describe('una acción que no existe', () => {
  it('⛔ no escribe y lo dice', async () => {
    const res = await correr(pedir({ method: 'POST', body: { action: 'publicar', store: 'bdi' } }))
    expect(res.code).toBe(400)
    expect(base.escrituras).toEqual([])
  })
})
