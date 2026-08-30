import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { costoDelCaso, costoDeLaFila } from '@/lib/reclamos/plata.core.js'

/**
 * **El costo de la mercadería, que hasta hoy valía CERO** (30-ago-2026, §1.3 del plan).
 *
 * 🔴 *«Lo que nos costó»* contaba **sólo la plata**: `unit_cost` salió del navegador en la Fase S
 * —10 personas mandaban un costo que ⛔ no veían— y `enriquecerConGN` dejó de resolverlo. De los
 * tres handlers que **guardan** el costo (`_fallas`, `_canjes`, éste), `api/_reclamos.js` era el
 * único que ⛔ no lo pedía ⇒ el techo de la oferta y `costoDelCaso` calculados contra precio de
 * lista, con la unidad valiendo nada.
 *
 * 🔴 🔑 **Y prender el costo destapó que la cuenta miraba la CABECERA**: con los costos en cero
 * ⛔ no cambiaba ningún número, así que el defecto era invisible. Con costos de verdad decide plata
 * en **3 de cada 10 reclamos de BDI** —los de dos productos—: con un solo destino, o se contaban
 * **las dos** unidades como perdidas o **ninguna**.
 */

const it_ = (costo: number, cantidad = 1, extra: Record<string, unknown> = {}) =>
  ({ producto: 'X', costo, cantidad, ...extra })

describe('la unidad perdida se pregunta POR UNIDAD', () => {
  /** 🔴 El caso que decide plata: uno vuelve a stock, el otro se lo queda el cliente. */
  it('🔴 con dos productos y un solo destino cada uno, suma SÓLO el que se queda', () => {
    const c = costoDelCaso({
      montoDevuelto: 0,
      items: [it_(2000, 1, { destino: 'stock' }), it_(5000, 1, { destino: 'regalada' })],
      destino: 'stock',
    })
    expect(c).toBe(5000)
  })

  /** **Ausente = el de la cabecera**, que es el default explícito del módulo. */
  it('la unidad sin destino propio hereda el del reclamo', () => {
    expect(costoDelCaso({ montoDevuelto: 0, items: [it_(2000)], destino: 'regalada' })).toBe(2000)
    expect(costoDelCaso({ montoDevuelto: 0, items: [it_(2000)], destino: 'stock' })).toBe(0)
  })

  /**
   * 🔴 **La fallada que VUELVE ⛔ no se perdió, y contarla acá la contaba DOS VECES**: vuelve al
   * depósito de fallas y ahí se valúa con su propio `valuacion_costo`. El docstring de
   * `costoDelCaso` ya prometía *«si vuelve —sana o fallada— se recuperó»*; la condición ⛔ no lo
   * cumplía.
   */
  it('🔴 la fallada que vuelve ⛔ NO se cuenta: se valúa en el ledger de Fallas', () => {
    const c = costoDelCaso({ montoDevuelto: 8000, items: [it_(2000)], destino: 'falla', retornoDecidido: true })
    expect(c).toBe(8000)
  })

  it('y la fallada que el cliente se queda SÍ: quedársela ⛔ no la vuelve sana', () => {
    const c = costoDelCaso({ montoDevuelto: 8000, items: [it_(2000)], destino: 'falla', retornoDecidido: false })
    expect(c).toBe(10000)
  })

  it('sin producto en juego (null) sigue valiendo cero, aunque las unidades traigan destino', () => {
    const c = costoDelCaso({
      montoDevuelto: 5000, items: [it_(2000, 1, { destino: 'regalada' })], destino: null,
    })
    expect(c).toBe(5000)
  })

  it('lo que nunca salió del depósito tampoco se perdió', () => {
    expect(costoDelCaso({ montoDevuelto: 8000, items: [it_(2000)], destino: 'no_salio' })).toBe(8000)
  })

  /** 🔑 `costoDeLaFila` le tiene que pasar el retorno, o `'falla'` vuelve a contarse siempre. */
  it('🔴 `costoDeLaFila` pasa el retorno decidido, ⛔ no lo pierde en el camino', () => {
    const fila = {
      compensacion: 'plata_total', monto_total: 8000, envio_costo: 0, envio_ida_costo: 0,
      items: [it_(2000)], destino_prenda: 'falla',
    }
    expect(costoDeLaFila({ ...fila, retorno_decidido: true })).toBe(8000)
    expect(costoDeLaFila({ ...fila, retorno_decidido: false })).toBe(10000)
  })
})

// ── El cable: el handler pide el costo a Gestión Nube ──────────────────────────

const COSTOS: Record<string, number | null> = { '77': 4500 }
const leerCostos = vi.fn(async (_store: string, ids: unknown[]) =>
  Object.fromEntries(ids.map((i) => [String(i), COSTOS[String(i)]]).filter(([, c]) => c != null)))

vi.mock('../api/_costos.js', () => ({ leerCostos: (...a: [string, unknown[]]) => leerCostos(...a), SECCIONES_CON_COSTO: ['postventa'] }))

const mundo = { fila: {} as Record<string, unknown>, escrito: null as Record<string, unknown> | null }

function fakeSupabase() {
  const desde = () => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      update: (row: Record<string, unknown>) => { mundo.escrito = row; return api },
      insert: (row: Record<string, unknown>) => { mundo.escrito = row; return api },
      maybeSingle: async () => ({ data: mundo.fila, error: null }),
      single: async () => ({ data: { id: 22, token: 't' }, error: null }),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
        Promise.resolve({ data: mundo.fila, error: null }).then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))

function resFalso() {
  const r = {
    code: 0 as number, body: null as Record<string, unknown> | null,
    setHeader() { /* no importa */ },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const ADMIN = { name: 'Bruno', admin: false, cuenta: null, acceso: { bdi: { reclamos: true } }, funcion: ['administracion'] }

async function postear(body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
  const { default: handler } = await import('../api/_reclamos.js')
  const res = resFalso()
  await handler({
    method: 'POST', headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'y' }) }, query: {},
    body: { store: 'bdi', ...body },
  }, res)
  return res
}

const items = (extra: Record<string, unknown> = {}) => [
  { sku: 'A1', producto: 'Campera', cantidad: 1, precio: '90000.00', product_id: '77', ...extra },
]

describe('el handler completa el costo al CREAR', () => {
  beforeEach(() => {
    mundo.fila = {}
    mundo.escrito = null
    leerCostos.mockClear()
    vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
    vi.stubEnv('SUPABASE_KEY', 'llave-de-mentira')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('🔴 le pega el costo de GN al producto, que antes quedaba en null', async () => {
    const res = await postear({ action: 'crear', motivo: 'falla', items: items() })
    expect(res.code).toBe(200)
    expect((mundo.escrito?.items as { costo: number }[])[0].costo).toBe(4500)
  })

  /** 🔑 Un `0` tipeado por una persona quiere decir cero, y eso ⛔ no es lo mismo que `null`. */
  it('🔑 ⛔ NO pisa un costo cargado a mano, ni siquiera si es 0', async () => {
    await postear({ action: 'crear', motivo: 'falla', items: items({ costo: 0 }) })
    expect((mundo.escrito?.items as { costo: number }[])[0].costo).toBe(0)
    expect(leerCostos).not.toHaveBeenCalled()
  })

  /**
   * 🔴 **Y el caso que de verdad ejerce el guard de adentro**: con un producto que SÍ necesita el
   * costo, la consulta se hace igual — y ahí el `0` del de al lado tiene que sobrevivir. Sin este
   * test, el filtro de afuera tapa al guard de adentro y sacarlo ⛔ no pone nada en rojo.
   */
  it('🔴 con dos productos, el que tiene 0 a mano NO se pisa y el otro SÍ se completa', async () => {
    await postear({
      action: 'crear',
      motivo: 'falla',
      items: [...items({ costo: 0 }), { sku: 'B2', producto: 'Buzo', cantidad: 1, product_id: '77' }],
    })
    const guardados = mundo.escrito?.items as { costo: number }[]
    expect(leerCostos).toHaveBeenCalled()
    expect(guardados[0].costo).toBe(0)
    expect(guardados[1].costo).toBe(4500)
  })

  /** En un `mal_armado` lo que vuelve es esta lista: sin completarla, media cuenta sigue en cero. */
  it('también completa `items_correctos`', async () => {
    await postear({ action: 'crear', motivo: 'mal_armado', items: items({ product_id: null }), items_correctos: items() })
    expect((mundo.escrito?.items_correctos as { costo: number }[])[0].costo).toBe(4500)
  })

  it('un producto que ⛔ no está en GN queda como vino, ⛔ no en 0', async () => {
    await postear({ action: 'crear', motivo: 'falla', items: items({ product_id: '999' }) })
    expect((mundo.escrito?.items as { costo: number | null }[])[0].costo).toBeUndefined()
  })

  /**
   * ⚠️ **Que no se pueda leer el costo ⛔ no puede dejar al local sin poder abrir el reclamo**: hay
   * un cliente enojado del otro lado y el costo se completa después.
   */
  it('⚠️ si Gestión Nube falla, el reclamo se crea IGUAL', async () => {
    leerCostos.mockRejectedValueOnce(new Error('GN caída'))
    const res = await postear({ action: 'crear', motivo: 'falla', items: items() })
    expect(res.code).toBe(200)
    expect((mundo.escrito?.items as { costo?: number }[])[0].costo).toBeUndefined()
  })
})

describe('y al DECIDIR, donde el número ya importa', () => {
  const filaVieja = {
    id: 22, motivo: 'falla', escenario: null, reclamo_correo_estado: 'no_aplica',
    items: [{ sku: 'A1', producto: 'Campera', cantidad: 1, product_id: '77' }],
    items_correctos: null, destino_prenda: null, retorno_decidido: false,
    reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', reingreso_estado: 'no_aplica',
    cobro_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', cupon_estado: 'no_aplica',
    retencion_at: null, historial: [],
  }

  beforeEach(() => {
    mundo.fila = { ...filaVieja }
    mundo.escrito = null
    leerCostos.mockClear()
    vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
    vi.stubEnv('SUPABASE_KEY', 'llave-de-mentira')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  /**
   * 🔴 **El `costo_caso` que manda la pantalla quedó viejo por definición**: lo calculó con la
   * unidad en cero. Se recalcula con `costoDeLaFila`, la MISMA función que usa la pantalla.
   */
  it('🔴 completa el costo de un reclamo viejo y RECALCULA el costo_caso que mandó la pantalla', async () => {
    const res = await postear({
      action: 'decidir', id: 22, compensacion: 'plata_total', destino_prenda: 'regalada',
      monto_total: 90000, costo_caso: 90000, // lo que calculó la pantalla, con la unidad en cero
    })
    expect(res.code).toBe(200)
    expect(mundo.escrito?.costo_caso).toBe(94500)
    expect((mundo.escrito?.items as { costo: number }[])[0].costo).toBe(4500)
  })

  /**
   * 🔑 **Si ⛔ no completó nada, el servidor ⛔ NO le discute el número a la pantalla.** El número
   * de prueba es a propósito uno que la cuenta ⛔ no daría (`12345`): si el handler recalculara
   * siempre, acá se vería — y con un número que coincide, el test sería vacío.
   */
  it('🔑 y si ⛔ no completó nada, respeta el número de la pantalla aunque ⛔ no coincida', async () => {
    mundo.fila = { ...filaVieja, items: [{ producto: 'Campera', cantidad: 1, costo: 1000, product_id: '77' }] }
    await postear({
      action: 'decidir', id: 22, compensacion: 'plata_total', destino_prenda: 'regalada',
      monto_total: 90000, costo_caso: 12345,
    })
    expect(mundo.escrito?.costo_caso).toBe(12345)
    expect(leerCostos).not.toHaveBeenCalled()
  })
})
