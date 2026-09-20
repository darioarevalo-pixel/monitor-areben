// `api/_exhib.js`: **qué queda escrito en la base** cuando el teléfono manda una tanda de escaneos.
//
// 🔴 **Por qué existe este archivo.** El handler del chequeo de exhibición ⛔ no tenía un solo test:
// los 88 de la sección prueban `lib/exhib/*` —lo puro— y `filaDeEscaneo`, que es el ÚNICO lugar
// donde se decide qué de lo que manda el aparato entra a la tabla, quedaba afuera. Se descubrió el
// 19-sep-2026 ejerciendo el API contra producción: una fila sin hora contesta 500 **y se lleva
// puesta la tanda entera**.
//
// El `createClient` está mockeado con una base falsa que ANOTA lo que se le pide: el oráculo es la
// fila que se le mandó a la base, ⛔ no lo que contestó el handler.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Fila = Record<string, unknown>

const base = {
  tablas: {} as Record<string, Fila[]>,
  escrituras: [] as { tabla: string; verbo: string; filas?: Fila[] }[],
}

function consulta(tabla: string) {
  const q: Record<string, unknown> = {}
  const filtros: ((f: Fila) => boolean)[] = []
  const filas = () => (base.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
  for (const m of ['select', 'order', 'limit'] as const) q[m] = () => q
  q.eq = (col: string, val: unknown) => {
    filtros.push((f) => f[col] === val)
    return q
  }
  q.then = (resolve: (v: { data: Fila[]; error: null }) => unknown) => resolve({ data: filas(), error: null })
  q.range = async () => ({ data: filas(), error: null })
  q.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null })
  q.upsert = async (f: Fila | Fila[]) => {
    base.escrituras.push({ tabla, verbo: 'upsert', filas: Array.isArray(f) ? f : [f] })
    return { error: null }
  }
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
const CAMILA = { name: 'camilaquintana', admin: false, cuenta: null, acceso: { zattia: { exhib: true } }, funcion: [] }

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

async function correr(req: Record<string, unknown>) {
  const { default: handler } = await import('../api/_exhib.js')
  const res = resFalso()
  await (handler as (q: unknown, s: unknown) => Promise<void>)(req, res)
  return res
}

const REC = 'ex_test_1'
const postear = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'camilaquintana', pass: 'p' }) },
  query: { store: 'zattia' },
  body,
})

/** Un escaneo como el que arma el teléfono. */
const escaneo = (extra: Record<string, unknown> = {}) => ({
  lugar: 'Tops',
  variante_id: 'v1',
  barcode: '7790001234567',
  sku: 'RTO-0150-NG',
  product_name: 'TOP ZOE',
  size: 'U',
  cats: ['TOPS Y BODIES'],
  qty: 3,
  escaneado_en: '2026-09-19T13:40:00.000Z',
  ...extra,
})

const subidas = () => base.escrituras.filter((e) => e.tabla === 'exhib_escaneo').flatMap((e) => e.filas ?? [])

beforeEach(() => {
  base.tablas = { exhib_recorrido: [{ id: REC, store: 'zattia', modo: 'libre', estado: 'en_curso' }] }
  base.escrituras = []
  // La sección es `brands: ['zattia']` ⇒ el handler pide la base de Zattia, ⛔ no la del monitor.
  process.env.ZATTIA_SUPABASE_URL = 'https://x.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'
  sesionDe(CAMILA)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('la hora del escaneo', () => {
  /**
   * 🔴 **El caso que trabó el salón.** `escaneado_en` es `not null default now()`, pero un `null`
   * explícito ⛔ NO cae al default: la base rechaza la fila. Y como la tanda es **un solo insert de
   * N filas**, la mala se lleva a las buenas — la cola deja todo en «sin subir», reintenta contra
   * el mismo error para siempre, y **cerrar con pendientes está prohibido** ⇒ el recorrido ⛔ no se
   * puede cerrar. Medido contra producción: 4 buenas + 1 sin hora = **0 guardadas**.
   *
   * ⚠️ **La base falsa ⛔ no tiene el `not null`**, así que acá el oráculo ⛔ no puede ser el 500: es
   * **la forma de la fila** —que ninguna salga con la hora en null—. El 500 se midió contra
   * producción y es el que da sentido a esta forma.
   */
  it('🔴 una fila sin hora ⛔ NO se lleva puesta la tanda: entran las cinco', async () => {
    const res = await correr(postear({
      action: 'escanear',
      recorrido_id: REC,
      escaneos: [
        escaneo({ variante_id: 'v1' }),
        escaneo({ variante_id: 'v2' }),
        escaneo({ variante_id: 'v3' }),
        escaneo({ variante_id: 'v4' }),
        escaneo({ variante_id: 'v5', escaneado_en: null }),
      ],
    }))
    expect(res.code).toBe(200)
    expect(subidas()).toHaveLength(5)
    // ⛔ Ninguna fila puede salir de `filaDeEscaneo` con algo que la columna `not null` rechace.
    expect(subidas().every((f) => typeof f.escaneado_en === 'string' && f.escaneado_en)).toBe(true)
  })

  it('🔴 una hora ilegible se reemplaza en vez de reventar la tanda', async () => {
    await correr(postear({
      action: 'escanear',
      recorrido_id: REC,
      escaneos: [escaneo({ escaneado_en: 'ayer a la tarde' })],
    }))
    const f = subidas()[0]
    expect(Number.isNaN(Date.parse(String(f.escaneado_en)))).toBe(false)
  })

  it('la hora buena del teléfono se respeta tal cual (⛔ no la pisa el reloj del servidor)', async () => {
    await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo()] }))
    expect(subidas()[0].escaneado_en).toBe('2026-09-19T13:40:00.000Z')
  })

  it('la reparación se puede CONTAR: la respuesta dice cuántas venían sin hora', async () => {
    const res = await correr(postear({
      action: 'escanear',
      recorrido_id: REC,
      escaneos: [escaneo({ variante_id: 'v1' }), escaneo({ variante_id: 'v2', escaneado_en: '' })],
    }))
    expect(res.body).toMatchObject({ ok: true, recibidos: 2, sinHora: 1 })
  })

  it('sin reparaciones ⛔ no aparece el campo: un 0 en pantalla es ruido', async () => {
    const res = await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo()] }))
    expect(res.body).not.toHaveProperty('sinHora')
  })

  it('`ultimo_en` ilegible entra null, que la columna sí admite', async () => {
    await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo({ ultimo_en: '--' })] }))
    expect(subidas()[0].ultimo_en).toBe(null)
  })
})

describe('el contador de unidades', () => {
  it('sin `veces` la fila vale una', async () => {
    await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo()] }))
    expect(subidas()[0].veces).toBe(1)
  })

  it('🔴 un número absurdo se corta en 99, y la basura entra como 1', async () => {
    await correr(postear({
      action: 'escanear',
      recorrido_id: REC,
      escaneos: [
        escaneo({ variante_id: 'v1', veces: 500 }),
        escaneo({ variante_id: 'v2', veces: 'dos' }),
        escaneo({ variante_id: 'v3', veces: 0 }),
        escaneo({ variante_id: 'v4', veces: -3 }),
        escaneo({ variante_id: 'v5', veces: 2.7 }),
      ],
    }))
    expect(subidas().map((f) => f.veces)).toEqual([99, 1, 1, 1, 2])
  })
})

describe('el triage del modo por categoría', () => {
  it('un estado inventado entra null (= escaneo del modo libre) y uno de la lista pasa', async () => {
    await correr(postear({
      action: 'escanear',
      recorrido_id: REC,
      escaneos: [escaneo({ variante_id: 'v1', estado: 'inventado' }), escaneo({ variante_id: 'v2', estado: 'no-encuentra' })],
    }))
    expect(subidas().map((f) => f.estado)).toEqual([null, 'no-encuentra'])
  })
})

describe('lo que ⛔ no entra', () => {
  it('sin lugar o sin variante la fila se descarta, y la tanda sigue', async () => {
    const res = await correr(postear({
      action: 'escanear',
      recorrido_id: REC,
      escaneos: [escaneo({ variante_id: 'v1' }), escaneo({ variante_id: '' }), escaneo({ variante_id: 'v3', lugar: '  ' })],
    }))
    expect(res.code).toBe(200)
    expect(subidas().map((f) => f.variante_id)).toEqual(['v1'])
  })

  it('🔴 el `recorrido_id` de OTRA marca ⛔ no se escribe', async () => {
    base.tablas.exhib_recorrido = [{ id: REC, store: 'bdi', modo: 'libre', estado: 'en_curso' }]
    const res = await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo()] }))
    expect(res.code).toBe(404)
    expect(subidas()).toHaveLength(0)
  })

  it('🔴 la firma sale del perfil y NUNCA del body', async () => {
    await correr(postear({ action: 'abrir', id: 'ex_nuevo', modo: 'libre', persona: 'Otro' }))
    const cab = base.escrituras.find((e) => e.tabla === 'exhib_recorrido')?.filas?.[0]
    expect(cab?.persona).toBe('camilaquintana')
  })

  it('🔴 un `modo` inventado entra como libre, y la categoría ⛔ no viaja en el libre', async () => {
    await correr(postear({ action: 'abrir', id: 'ex_nuevo', modo: 'raro', categoria: 'TOPS Y BODIES' }))
    const cab = base.escrituras.find((e) => e.tabla === 'exhib_recorrido')?.filas?.[0]
    expect(cab?.modo).toBe('libre')
    expect(cab?.categoria).toBe(null)
  })
})
