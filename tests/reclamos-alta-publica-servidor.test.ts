import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TOPE_ALTAS_POR_HORA } from '@/lib/reclamos/alta-publica.core.js'

/**
 * **El alta pública, con el handler corriendo de verdad.**
 *
 * 🔴 Es el primer verbo del repo abierto a internet que **CREA FILAS**, así que lo que se prueba acá
 * ⛔ no es que ande: es que **⛔ no se pueda entrar por al lado**. Los dos que importan:
 *
 * 1. **La llave gira del lado del SERVIDOR.** El modo cómodo de escribir esto es que el navegador
 *    verifique y después postee «creá el reclamo con estos productos» — y ahí la verificación ⛔ no
 *    sirve para nada, porque el segundo POST lo escribe cualquiera con `curl`.
 * 2. **Los productos salen de la orden verificada**, ⛔ no del body. Si salieran del body, quien
 *    pasara la llave de su propia orden podría reclamar un artículo que nunca compró.
 */

type Fila = Record<string, unknown>

const mundo = {
  abierto: null as Fila | null,
  count: 0,
  insertado: null as Fila | null,
  selects: [] as unknown[][],
  errorInsert: null as string | null,
}

function fakeSupabase() {
  const desde = () => {
    const api: Record<string, unknown> = {}
    Object.assign(api, {
      select: (...a: unknown[]) => { mundo.selects.push(a); return api },
      eq: () => api,
      in: () => api,
      gte: () => api,
      limit: () => api,
      insert: (row: Fila) => { mundo.insertado = row; return api },
      maybeSingle: async () => ({ data: mundo.abierto, error: null }),
      single: async () => (mundo.errorInsert
        ? { data: null, error: { message: mundo.errorInsert } }
        : { data: { token: String(mundo.insertado?.token || '') }, error: null }),
      // El conteo del fusible: `select('id', {count, head}).eq().eq().gte()` se resuelve al await.
      then: (ok: (v: unknown) => unknown) => ok({ count: mundo.count, error: null }),
    })
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_blob.js', () => ({ subirDataUrl: async () => ({ ok: true, url: 'https://blob/x.jpg' }) }))

/** La orden que contesta Tienda Nube ya verificada: sin un solo monto, como la manda el otro repo. */
const ORDEN = {
  number: 21033,
  cliente: 'Victoria',
  products: [
    { product_id: 111, variant_id: 222, name: 'Funda Girlhood', sku: 'GH-01', quantity: 1 },
    { product_id: 333, variant_id: 444, name: 'Funda Stellar', sku: 'ST-02', quantity: 2 },
  ],
}

const llamadas: { url: string; init: RequestInit }[] = []
/** Qué contesta el repo de la orden. `null` = no verificada (no existe, sin mail, o no coincide). */
let contestaTN: unknown = { ok: true, orden: ORDEN }
/** El código HTTP del otro repo. Se separa del cuerpo a propósito: ver el test del 502. */
let httpTN = true

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() { /* no importa acá */ },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

async function pegar(body: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const { default: handler } = await import('../api/_reclamo.js')
  const res = resFalso()
  await handler({ headers: {}, query: {}, method: 'POST', body, ...extra }, res)
  return res
}

const ALTA = { accion: 'alta', store: 'bdi', orden: '21033', mail: 'victoria@gmail.com', opcion: 'talle', productos: [0] }

beforeEach(() => {
  mundo.abierto = null; mundo.count = 0; mundo.insertado = null; mundo.selects = []; mundo.errorInsert = null
  llamadas.length = 0
  contestaTN = { ok: true, orden: ORDEN }
  httpTN = true
  process.env.SUPABASE_URL = 'https://base'
  process.env.SUPABASE_KEY = 'k'
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), init })
    return { ok: httpTN && contestaTN !== null, json: async () => contestaTN } as unknown as Response
  })
})

describe('🔴 la llave gira del lado del servidor', () => {
  it('el handler consulta Tienda Nube él mismo, con el mail en el BODY', async () => {
    await pegar(ALTA)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].init.method).toBe('POST')
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ mail: 'victoria@gmail.com' })
  })

  it('🔴 el mail ⛔ no viaja en la query string', async () => {
    // Una query string queda en el log de acceso, en el historial del navegador y en el `Referer`
    // de lo que la página cargue después. El otro repo además rechaza `?mail=` con 400, así que
    // "arreglarlo" mandándolo por GET falla ruidoso — pero el que ⛔ no lo escriba es éste.
    await pegar(ALTA)
    expect(llamadas[0].url).not.toContain('mail')
    expect(llamadas[0].url).not.toContain('victoria')
    expect(llamadas[0].url).toContain('orden=21033')
  })

  it('sin cruce ⛔ no se crea nada, y contesta 404', async () => {
    contestaTN = { ok: true, orden: null }
    const r = await pegar(ALTA)
    expect(r.code).toBe(404)
    expect(mundo.insertado).toBe(null)
  })

  it('el otro repo caído se ve IGUAL que un mail equivocado', async () => {
    // Distinguirlos convierte esto en un oráculo de «¿existe la orden N?» sobre una numeración
    // correlativa.
    contestaTN = null
    const caido = await pegar(ALTA)
    contestaTN = { ok: true, orden: null }
    const noCoincide = await pegar(ALTA)
    expect(caido.code).toBe(noCoincide.code)
    expect(caido.body).toEqual(noCoincide.body)
    expect(mundo.insertado).toBe(null)
  })

  it('🔴 un cuerpo que parece bueno con un código que no lo es ⛔ NO abre la puerta', async () => {
    // El otro repo contesta 400 cuando el mail va en la URL, 403 sin credencial y 502 cuando TN se
    // cae. Mirar sólo el cuerpo es confiar en que un error nunca vuelva con la forma de un éxito
    // —un proxy, un caché, una página de error de la plataforma—. El código se mira primero.
    httpTN = false
    const r = await pegar(ALTA)
    expect(r.code).toBe(404)
    expect(mundo.insertado).toBe(null)
  })

  it('un error de red se ve igual también', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('ECONNREFUSED') })
    const r = await pegar(ALTA)
    expect(r.code).toBe(404)
    expect(mundo.insertado).toBe(null)
  })

  it('el alta ⛔ no pide token: pasa por delante de esa puerta', async () => {
    // Es la única acción que puede hacerlo, y por eso está escrita ANTES del guard del token.
    const r = await pegar(ALTA)
    expect(r.code).toBe(200)
    expect(String(r.body?.token)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('por GET ⛔ no se crea nada', async () => {
    const r = await pegar(ALTA, { method: 'GET', query: {} })
    expect(mundo.insertado).toBe(null)
    expect(r.code).toBe(404)
  })
})

describe('🔴 lo que se guarda sale de la orden verificada, ⛔ no del body', () => {
  it('los productos son los de la orden, señalados por índice', async () => {
    await pegar({ ...ALTA, productos: [1] })
    expect(mundo.insertado?.items).toEqual([
      { sku: 'ST-02', tn_product_id: '333', variant_id: '444', producto: 'Funda Stellar', cantidad: 2 },
    ])
  })

  it('🔴 un producto mandado en el body se IGNORA', async () => {
    // El ataque exacto: pasar la llave de la orden propia y reclamar otra cosa.
    await pegar({ ...ALTA, items: [{ producto: 'Notebook', sku: 'CARO', cantidad: 1, precio: 900000 }] })
    expect(mundo.insertado?.items).toEqual([
      { sku: 'GH-01', tn_product_id: '111', variant_id: '222', producto: 'Funda Girlhood', cantidad: 1 },
    ])
  })

  it('🔴 un MOTIVO mandado en el body se ignora: sale de la opción', async () => {
    // `sin_stock` afirma que le vendimos algo que no teníamos; `no_llego` enciende el reclamo al
    // transportista. Ninguno de los dos lo puede escribir alguien de afuera.
    await pegar({ ...ALTA, motivo: 'sin_stock' })
    expect(mundo.insertado?.motivo).toBe('talle')
  })

  it('el nombre del cliente sale de la orden, ⛔ no del body', async () => {
    await pegar({ ...ALTA, cliente: 'Yo Mismo' })
    expect(mundo.insertado?.cliente).toBe('Victoria')
  })

  it('un índice que ⛔ no existe en la orden no crea nada', async () => {
    const r = await pegar({ ...ALTA, productos: [0, 7] })
    expect(r.code).toBe(404)
    expect(mundo.insertado).toBe(null)
  })
})

describe('la fila que nace', () => {
  it('nace en borrador, con el token, y a nombre del cliente', async () => {
    await pegar(ALTA)
    const f = mundo.insertado!
    expect(f.estado).toBe('borrador')
    expect(f.store).toBe('bdi')
    expect(f.orden_tn).toBe('21033')
    expect(f.usuario).toBe('cliente')
    expect(String(f.token)).toMatch(/^[a-f0-9]{64}$/)
    expect(new Date(String(f.token_vence)).getTime()).toBeGreaterThan(Date.now())
    expect(f.fotos).toEqual([])
  })

  it('🔴 ⛔ NINGÚN pendiente nace prendido', async () => {
    // Un toque del cliente ⛔ no le pone una tarea a nadie. Que los motivos de entrada no puedan
    // encender ninguno está atado en `tests/reclamos-alta-publica.test.ts`; acá se fija la fila.
    await pegar(ALTA)
    const f = mundo.insertado!
    expect(f.stock_estado).toBe('no_aplica')
    expect(f.reintegro_estado).toBe('no_aplica')
    expect(f.tn_stock_estado).toBe('no_aplica')
    expect(f.reclamo_correo_estado).toBe('no_aplica')
  })

  it('el historial dice que lo abrió el cliente, y con qué opción', async () => {
    await pegar({ ...ALTA, opcion: 'fallado' })
    const h = (mundo.insertado?.historial as Record<string, unknown>[])[0]
    expect(h.usuario).toBe('cliente')
    expect(String(h.nota)).toContain('fallado')
    expect(mundo.insertado?.motivo).toBe('falla')
  })

  it('⛔ ni un monto y ⛔ ningún escenario', async () => {
    await pegar(ALTA)
    const claves = Object.keys(mundo.insertado!)
    for (const c of ['monto_producto', 'monto_total', 'pagado', 'escenario', 'compensacion']) {
      expect(claves, c).not.toContain(c)
    }
  })

  it('si la base falla, el cliente ⛔ no se queda sin saber', async () => {
    mundo.errorInsert = 'column no existe'
    const r = await pegar(ALTA)
    expect(r.code).toBe(500)
    expect(String(r.body?.error)).toContain('Escribinos')
  })
})

describe('los frenos', () => {
  it('🔑 si ya hay uno abierto para esa orden, devuelve ESE link', async () => {
    // ⛔ No se crea un segundo expediente por el mismo pedido, y el cliente ⛔ no queda golpeando una
    // puerta cerrada — que es como termina abriendo el reclamo por WhatsApp, afuera del sistema.
    mundo.abierto = { token: 'b'.repeat(64), estado: 'en_revision' }
    const r = await pegar(ALTA)
    expect(r.code).toBe(200)
    expect(r.body?.token).toBe('b'.repeat(64))
    expect(r.body?.yaExistia).toBe(true)
    expect(mundo.insertado).toBe(null)
  })

  it('el fusible corta con 429 y ⛔ no crea', async () => {
    mundo.count = TOPE_ALTAS_POR_HORA
    const r = await pegar(ALTA)
    expect(r.code).toBe(429)
    expect(mundo.insertado).toBe(null)
  })

  it('justo abajo del tope sigue pasando', async () => {
    mundo.count = TOPE_ALTAS_POR_HORA - 1
    const r = await pegar(ALTA)
    expect(r.code).toBe(200)
    expect(mundo.insertado).not.toBe(null)
  })

  it('los frenos corren DESPUÉS del cruce', async () => {
    // Si corrieran antes, un «ya tenés uno abierto» le contestaría a cualquiera que tipee números:
    // el 200 con token sería el oráculo de que esa orden existe.
    contestaTN = { ok: true, orden: null }
    mundo.abierto = { token: 'b'.repeat(64), estado: 'en_revision' }
    const r = await pegar(ALTA)
    expect(r.code).toBe(404)
  })
})

describe('la forma del pedido', () => {
  it('una marca desconocida ⛔ no consulta nada', async () => {
    const r = await pegar({ ...ALTA, store: 'otra' })
    expect(r.code).toBe(400)
    expect(llamadas).toHaveLength(0)
  })

  it('🔴 STUNNED ⛔ no es una puerta del alta, aunque SÍ sea una tienda de Tienda Nube', async () => {
    // Es la trampa de esta lista: `bdi-catalogo` la atiende (`store=stunned`), así que copiar de
    // allá las tres tiendas parece prolijo. Pero los reclamos de Stunned vivirían en la base de
    // **Zattia**, donde el freno de «un reclamo abierto por orden» compara `(store, orden_tn)`:
    // dos órdenes distintas pueden tener el mismo número y el freno le contestaría a una persona
    // **el token del reclamo de otra**. La tercera puerta se abre con una columna, ⛔ no con una
    // línea en la lista.
    const r = await pegar({ ...ALTA, store: 'stunned' })
    expect(r.code).toBe(400)
    expect(llamadas).toHaveLength(0)
  })

  it('un pedido mal formado ⛔ no consulta Tienda Nube', async () => {
    // El orden importa: primero la forma, después la red. Si no, cualquiera hace que el servidor
    // pegue a TN tantas veces como quiera.
    await pegar({ ...ALTA, orden: 'abc' })
    expect(llamadas).toHaveLength(0)
  })

  it('el 400 ⛔ no dice qué estaba mal', async () => {
    const r = await pegar({ ...ALTA, opcion: 'sin_stock' })
    expect(r.code).toBe(400)
    expect(JSON.stringify(r.body)).not.toContain('opcion')
    expect(JSON.stringify(r.body)).not.toContain('sin_stock')
  })
})
