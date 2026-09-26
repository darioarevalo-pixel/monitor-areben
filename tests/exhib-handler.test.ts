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
  /**
   * 🔑 **La base falsa acepta cualquier columna, así que hay que enseñarle a rechazar una.** Es la
   * única forma de ejercer la ventana entre el deploy y la migración corrida a mano, que es cuando
   * `horas` todavía ⛔ no existe — y es el único modo de falla de esto que llega al salón.
   */
  rechazarHoras: false,
  /** Un error cualquiera del upsert, para comprobar que ⛔ no se lo confunde con el de la columna. */
  romperUpsert: '' as string,
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
  q.in = (col: string, vals: unknown[]) => {
    filtros.push((f) => vals.includes(f[col]))
    return q
  }
  q.then = (resolve: (v: { data: Fila[]; error: null }) => unknown) => resolve({ data: filas(), error: null })
  q.range = async () => ({ data: filas(), error: null })
  q.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null })
  q.update = (f: Fila) => {
    base.escrituras.push({ tabla, verbo: 'update', filas: [f] })
    return q
  }
  q.upsert = async (f: Fila | Fila[]) => {
    const filas = Array.isArray(f) ? f : [f]
    if (base.romperUpsert) return { error: { code: '42501', message: base.romperUpsert } }
    if (base.rechazarHoras && filas.some((x) => 'horas' in x)) {
      // El error tal cual lo contesta PostgREST cuando la columna ⛔ no está en el esquema.
      return { error: { code: 'PGRST204', message: "Could not find the 'horas' column of 'exhib_escaneo' in the schema cache" } }
    }
    base.escrituras.push({ tabla, verbo: 'upsert', filas })
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
  base.rechazarHoras = false
  base.romperUpsert = ''
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

/**
 * **El balance del sector**: la declaración de que un recorrido cubrió estas categorías enteras.
 *
 * 🔴 Es lo que manda a alguien a mover mercadería del depósito del local, así que lo que importa
 * probar ⛔ no es que se guarde: es **quién queda firmando** y que las categorías entren limpias.
 */
describe('el balance del sector', () => {
  const guardar = (body: Record<string, unknown>) => correr(postear({ action: 'cobertura', id: REC, ...body }))
  const guardada = () => base.escrituras.find((e) => e.tabla === 'exhib_recorrido' && e.verbo === 'update')?.filas?.[0]?.cobertura as
    | { cats: string[]; por: string | null; cuando: string }
    | undefined

  it('guarda las categorías declaradas', async () => {
    const res = await guardar({ cats: ['TOPS Y BODIES', 'BLUSAS'] })
    expect(res.code).toBe(200)
    expect(guardada()?.cats).toEqual(['TOPS Y BODIES', 'BLUSAS'])
  })

  it('🔴 la firma sale del perfil y NUNCA del body', async () => {
    await guardar({ cats: ['TOPS Y BODIES'], por: 'El Gerente', cuando: '1999-01-01T00:00:00.000Z' })
    expect(guardada()?.por).toBe('camilaquintana')
    expect(guardada()?.cuando.startsWith('1999')).toBe(false)
  })

  it('las categorías entran limpias: sin vacías y sin repetir', async () => {
    await guardar({ cats: ['TOPS Y BODIES', '  ', 'TOPS Y BODIES', ' BLUSAS '] })
    expect(guardada()?.cats).toEqual(['TOPS Y BODIES', 'BLUSAS'])
  })

  /** ⚠️ Vacío es «alguien lo miró y dijo que esto ⛔ no cubrió un sector», ⛔ no «nadie lo miró». */
  it('declarar NINGUNA categoría es una declaración válida', async () => {
    const res = await guardar({ cats: [] })
    expect(res.code).toBe(200)
    expect(guardada()).toMatchObject({ cats: [], por: 'camilaquintana' })
  })

  it('🔴 un recorrido de OTRA marca ⛔ no se declara', async () => {
    base.tablas.exhib_recorrido = [{ id: REC, store: 'bdi', modo: 'libre', estado: 'cerrado' }]
    const res = await guardar({ cats: ['TOPS Y BODIES'] })
    expect(res.code).toBe(404)
    expect(guardada()).toBeUndefined()
  })
})

/**
 * **Tachar una prenda del mandado** (21-sep-2026). Viaja adentro de `cobertura` —es la misma
 * afirmación de quien hizo el balance— y por eso el handler hace **leer-modificar-escribir**: el
 * oráculo de estos casos es qué queda guardado en el jsonb, ⛔ no qué contestó.
 */
describe('tachar una prenda del mandado', () => {
  const conCobertura = (cobertura: unknown) => {
    base.tablas.exhib_recorrido = [{ id: REC, store: 'zattia', modo: 'libre', estado: 'cerrado', cobertura }]
  }
  const guardada = () => base.escrituras.filter((e) => e.tabla === 'exhib_recorrido').at(-1)?.filas?.[0]?.cobertura as Record<string, unknown>

  it('guarda la prenda con su motivo, quién y cuándo', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], por: 'Bruno Arevalo', cuando: '2026-09-21T16:32:00.000Z' })
    const res = await correr(postear({ action: 'tachar', id: REC, variante_id: 'b2', motivo: 'otro-lugar' }))
    expect(res.code).toBe(200)
    const t = (guardada().tachadas as Record<string, unknown>[])[0]
    expect(t).toMatchObject({ variante_id: 'b2', motivo: 'otro-lugar', por: 'camilaquintana' })
    expect(String(t.cuando)).toMatch(/^\d{4}-/)
  })

  /**
   * 🔴 `por`/`cuando` son de la DECLARACIÓN del sector y ⛔ no de la tachadura: pisarlos haría que
   * «lo declaró Fulano» cambie de nombre por tachar una prenda. Cada tachada trae los suyos.
   */
  it('⛔ no le cambia el dueño a la declaración del sector', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], por: 'Bruno Arevalo', cuando: '2026-09-21T16:32:00.000Z' })
    await correr(postear({ action: 'tachar', id: REC, variante_id: 'b2', motivo: 'despues' }))
    expect(guardada()).toMatchObject({ por: 'Bruno Arevalo', cuando: '2026-09-21T16:32:00.000Z', tipos: ['TOP'] })
  })

  it('volver a ponerla la saca de la lista (motivo null)', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], tachadas: [{ variante_id: 'b2', motivo: 'despues', por: 'x', cuando: 'y' }], por: null, cuando: 'z' })
    await correr(postear({ action: 'tachar', id: REC, variante_id: 'b2', motivo: null }))
    expect(guardada().tachadas).toEqual([])
  })

  /** ⚠️ Tachar dos veces la misma prenda la deja UNA vez, con el último motivo. */
  it('⛔ no duplica la misma prenda', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], tachadas: [{ variante_id: 'b2', motivo: 'despues', por: 'x', cuando: 'y' }], por: null, cuando: 'z' })
    await correr(postear({ action: 'tachar', id: REC, variante_id: 'b2', motivo: 'otro-lugar' }))
    const ts = guardada().tachadas as Record<string, unknown>[]
    expect(ts).toHaveLength(1)
    expect(ts[0].motivo).toBe('otro-lugar')
  })

  /**
   * 🔴 **El motivo se valida contra la lista.** Es el dato con el que después se va a contestar
   * «¿por qué el sector ⛔ no está donde el sistema cree?», y un motivo libre ⛔ no se puede contar.
   */
  it('un motivo inventado se rechaza y ⛔ no escribe nada', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], por: null, cuando: 'z' })
    const res = await correr(postear({ action: 'tachar', id: REC, variante_id: 'b2', motivo: 'porque-si' }))
    expect(res.code).toBe(400)
    expect(base.escrituras.filter((e) => e.tabla === 'exhib_recorrido')).toHaveLength(0)
  })

  /**
   * 🔴 **Guardar la declaración ⛔ NO borra las tachaduras.** Si las pisara, tildar un tipo más
   * borraría veinte motivos sin avisar — y del otro lado se ve como un mandado que creció solo.
   */
  it('🔴 declarar un tipo más conserva lo ya tachado', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], tachadas: [{ variante_id: 'b2', motivo: 'despues', por: 'x', cuando: 'y' }], por: null, cuando: 'z' })
    await correr(postear({ action: 'cobertura', id: REC, tipos: ['TOP', 'BLUSA'] }))
    expect(guardada().tipos).toEqual(['TOP', 'BLUSA'])
    expect(guardada().tachadas).toHaveLength(1)
  })
})

/**
 * **La otra mitad del balance**: qué se hace con una prenda colgada de más. Entra por el MISMO
 * camino que `tachar` (ver `MARCAS`) y por eso lo que se ejerce acá es que las dos listas convivan
 * sin pisarse — que es lo único que las diferencia.
 */
describe('decidir sobre una prenda colgada de más', () => {
  const conCobertura = (cobertura: unknown) => {
    base.tablas.exhib_recorrido = [{ id: REC, store: 'zattia', modo: 'libre', estado: 'cerrado', cobertura }]
  }
  const guardada = () => base.escrituras.filter((e) => e.tabla === 'exhib_recorrido').at(-1)?.filas?.[0]?.cobertura as Record<string, unknown>

  it('guarda la decisión con quién y cuándo', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], por: 'Bruno Arevalo', cuando: '2026-09-21T16:32:00.000Z' })
    const res = await correr(postear({ action: 'repetida', id: REC, variante_id: 'b1', decision: 'sacar' }))
    expect(res.code).toBe(200)
    expect((guardada().repetidas as Record<string, unknown>[])[0]).toMatchObject({ variante_id: 'b1', decision: 'sacar', por: 'camilaquintana' })
  })

  it('una decisión inventada se rechaza y ⛔ no escribe nada', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], por: null, cuando: 'z' })
    const res = await correr(postear({ action: 'repetida', id: REC, variante_id: 'b1', decision: 'tirarla' }))
    expect(res.code).toBe(400)
    expect(base.escrituras.filter((e) => e.tabla === 'exhib_recorrido')).toHaveLength(0)
  })

  /**
   * 🔴 **Las dos listas conviven.** Son el mismo guardado con otro nombre de lista: si una pisara a
   * la otra, decidir sobre un repetido borraría los motivos de todo lo tachado —y del otro lado eso
   * se ve como un mandado que creció solo—.
   */
  it('🔴 decidir un repetido ⛔ NO borra lo tachado, ni al revés', async () => {
    conCobertura({ cats: [], tipos: ['TOP'], tachadas: [{ variante_id: 'b2', motivo: 'despues', por: 'x', cuando: 'y' }], por: null, cuando: 'z' })
    await correr(postear({ action: 'repetida', id: REC, variante_id: 'b1', decision: 'queda' }))
    expect(guardada().tachadas).toHaveLength(1)
    expect(guardada().repetidas).toHaveLength(1)

    conCobertura(guardada())
    await correr(postear({ action: 'tachar', id: REC, variante_id: 'b3', motivo: 'otro-lugar' }))
    expect(guardada().repetidas).toHaveLength(1)
    expect(guardada().tachadas).toHaveLength(2)
  })

  it('guardar la declaración conserva las dos listas', async () => {
    conCobertura({
      cats: [], tipos: ['TOP'],
      tachadas: [{ variante_id: 'b2', motivo: 'despues', por: 'x', cuando: 'y' }],
      repetidas: [{ variante_id: 'b1', decision: 'sacar', por: 'x', cuando: 'y' }],
      por: null, cuando: 'z',
    })
    await correr(postear({ action: 'cobertura', id: REC, tipos: ['TOP', 'BLUSA'] }))
    expect(guardada().tachadas).toHaveLength(1)
    expect(guardada().repetidas).toHaveLength(1)
  })

  it('deshacer la saca de la lista', async () => {
    conCobertura({ cats: [], tipos: [], repetidas: [{ variante_id: 'b1', decision: 'sacar', por: 'x', cuando: 'y' }], por: null, cuando: 'z' })
    await correr(postear({ action: 'repetida', id: REC, variante_id: 'b1', decision: null }))
    expect(guardada().repetidas).toEqual([])
  })
})

/**
 * **La hora de cada lectura** (`sql/migrate-exhib-horas.sql`). Lo que se ejerce acá es lo único que
 * puede romper el salón: que una columna que todavía ⛔ no existe **⛔ no se lleve puesta la tanda**.
 */
describe('las horas de cada lectura', () => {
  it('se guardan saneadas y EN ORDEN', async () => {
    await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo({ veces: 3, horas: ['2026-09-19T13:40:08.000Z', '2026-09-19T13:40:00.000Z', 'cualquier cosa', '2026-09-19T13:40:04.000Z'] })] }))
    expect(subidas()[0].horas).toEqual(['2026-09-19T13:40:00.000Z', '2026-09-19T13:40:04.000Z', '2026-09-19T13:40:08.000Z'])
  })

  /** ⚠️ Vacío ⇒ `null`, que es «fila sin el detalle» y ⛔ no «ninguna lectura»: lo lee `horasDe`. */
  it('sin horas legibles guarda null, ⛔ no una lista vacía', async () => {
    await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo({ horas: ['nada'] }), escaneo({ variante_id: 'v2' })] }))
    expect(subidas()[0].horas).toBe(null)
    expect(subidas()[1].horas).toBe(null)
  })

  /**
   * 🔴 **EL CASO QUE NO SE PUEDE PAGAR.** `migrate-exhib-horas.sql` se corre a mano en el Supabase
   * de Zattia, así que entre el deploy y esa consulta hay una ventana en la que la columna ⛔ no
   * existe. Una columna desconocida hace fallar **el upsert entero**, y eso ⛔ no es un renglón
   * perdido: la cola deja TODO en «sin subir», reintenta para siempre contra el mismo error y
   * **cerrar con pendientes está prohibido** ⇒ quien camina el local ⛔ no puede cerrar el
   * recorrido. Es el mismo pozo del 19-sep con la fila sin hora, y ⛔ no se puede pagar por un dato
   * que es un detalle de diagnóstico.
   */
  it('🔴 si la columna todavía ⛔ NO existe, la tanda entra igual sin ella', async () => {
    base.rechazarHoras = true
    const res = await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo({ veces: 2, horas: ['2026-09-19T13:40:00.000Z', '2026-09-19T13:40:05.000Z'] }), escaneo({ variante_id: 'v2' })] }))
    expect(res.code).toBe(200)
    // Las DOS filas entraron, y ⛔ ninguna trae la columna que la base ⛔ no conoce.
    expect(subidas()).toHaveLength(2)
    expect(subidas().every((f) => !('horas' in f))).toBe(true)
    // Y lo demás quedó intacto: el contador ⛔ no se pierde por el reintento.
    expect(subidas()[0].veces).toBe(2)
  })

  /** ⚠️ Un error que ⛔ NO es de la columna tiene que seguir siendo un error: ⛔ no se lo tapa. */
  it('⛔ no se come cualquier error del upsert', async () => {
    base.romperUpsert = 'permission denied for table exhib_escaneo'
    const res = await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo()] }))
    expect(res.code).toBe(500)
  })
})

describe('el repetido: la fila del teléfono pisa a la de la base', () => {
  /**
   * 🔴 **El agujero del 26-sep-2026.** El repetido se subía borrando primero la fila vieja; si ese
   * borrado fallaba, el upsert con `ignoreDuplicates` dejaba «1 vez» en la base y contestaba `ok`.
   * Ahora el teléfono manda la fila entera y la base la toma, salvo que ya tenga MÁS unidades.
   */
  it('🔴 «2 veces» entra sobre «1 vez» sin borrar nada antes', async () => {
    base.tablas.exhib_escaneo = [{ recorrido_id: REC, lugar: 'Tops', variante_id: 'v1', veces: 1 }]
    const res = await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo({ veces: 2 })] }))
    expect(res.code).toBe(200)
    expect(subidas()).toHaveLength(1)
    expect(subidas()[0].veces).toBe(2)
  })

  it('⛔ una tanda vieja que llega tarde NO baja el contador', async () => {
    base.tablas.exhib_escaneo = [{ recorrido_id: REC, lugar: 'Tops', variante_id: 'v1', veces: 3 }]
    const res = await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo({ veces: 2 }), escaneo({ variante_id: 'v2' })] }))
    expect(res.code).toBe(200)
    expect(subidas().map((f) => f.variante_id)).toEqual(['v2'])
  })

  it('el mismo contador en otro lugar ⛔ se confunde', async () => {
    base.tablas.exhib_escaneo = [{ recorrido_id: REC, lugar: 'Vidriera', variante_id: 'v1', veces: 5 }]
    await correr(postear({ action: 'escanear', recorrido_id: REC, escaneos: [escaneo({ veces: 1 })] }))
    expect(subidas()).toHaveLength(1)
  })
})
