import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El HANDLER de `?recurso=etapas` — el Embudo **con el token caído de verdad**.
 *
 * 🔴 **Por qué hace falta un test del handler y no alcanza el del núcleo.** El 30-ago-2026 el
 * Embudo se movió arriba del guard de `META_ADS_TOKEN` para que contestara desde la foto cuando
 * Graph no contesta, y eso se probó pasándole filas a `censoDeLaFoto()`. Pero el núcleo ⛔ no sabe
 * nada de las tres decisiones que sólo toma el handler, y que son justo las que dejan al respaldo
 * inútil sin hacer ruido:
 *
 * 1. **Cuándo cae a la foto**: sin token, y con Graph caído en **todas** las cuentas — ⛔ nunca con
 *    una sola caída, porque mezclar los dos censos cuenta una campaña dos veces con dos números.
 * 2. **Qué ventana mira**: `ultimoDiaCerrado()` se le pregunta a las filas de **conjunto**, ⛔ no a
 *    las de campaña. Preguntándoselo a campaña el cierre daba seis días atrás **con cara de
 *    actual**, y la ventana se comía las campañas más nuevas — que es exactamente el hueco que el
 *    Embudo dice tener.
 * 3. **Que lo diga**: `fuente`, `completo` y `motivo` viajan en la respuesta. Un respaldo servido
 *    callado, con cara de censo entero, es peor que el 500 que reemplaza.
 *
 * 🔑 **El oráculo de cada caso viene por otro camino que el hecho**: las fechas se arman relativas a
 * hoy y se afirma la que ⛔ NO sale del nivel equivocado, y en cada caso de respaldo se afirma
 * además que el censo **trajo campañas repartidas por línea** — sin eso, un respaldo roto que
 * devuelve todo vacío pasa los tres asserts de forma.
 */

// ── El doble de Supabase ────────────────────────────────────────────────────────────────────────
// Un builder que respeta `.eq()` (el handler pide la foto DOS veces, y lo único que las separa es
// `nivel`) e ignora el resto de los filtros: el recorte por ventana lo hace el handler a mano y es
// parte de lo que se está probando.

type Fila = Record<string, unknown>
let FOTO: Fila[] = []
let ASIGNADAS: Fila[] = []
let ERROR_FOTO: string | null = null

function consulta(tabla: string) {
  const filtros: [string, unknown][] = []
  const resolver = async () => {
    if (tabla === 'meta_ads_campania_linea') return { data: ASIGNADAS, error: null }
    if (tabla === 'meta_ads_snapshot_dia') {
      if (ERROR_FOTO) return { data: null, error: { message: ERROR_FOTO } }
      let f = FOTO
      for (const [col, val] of filtros) f = f.filter((x) => String(x[col]) === String(val))
      return { data: f, error: null }
    }
    return { data: [], error: null }
  }
  const q: Record<string, unknown> = {}
  const igual = () => q
  Object.assign(q, {
    select: igual, gte: igual, lte: igual, in: igual, order: igual, limit: igual,
    eq: (col: string, val: unknown) => { filtros.push([col, val]); return q },
    range: () => resolver(),
    then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => resolver().then(ok, no),
  })
  return q
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => consulta(tabla) }),
}))

// ── El aparato del pedido ───────────────────────────────────────────────────────────────────────

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
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }

/**
 * Un `fetch` que atiende la identidad y la Graph. `graph()` devuelve **sin reintentar** ante el
 * código 190 (token vencido), así que el caso del token caído no cuesta los seis segundos de espera
 * que costaría simular un 500.
 */
function red(graph: (url: string) => { status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/usuarios')) return { ok: true, json: async () => ({ ok: true, perfil: ADMIN }) }
    const r = graph(u)
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => null }, json: async () => r.body }
  }))
}

const TOKEN_VENCIDO = {
  status: 400,
  body: { error: { code: 190, message: 'Error validating access token: Session has expired' } },
}

async function llamar(query: Record<string, unknown> = {}) {
  const mod = await import('@/api/meta-ads.js')
  const res = resFalso()
  const req = {
    method: 'GET',
    headers: { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'p' }) },
    query: { recurso: 'etapas', ...query },
    body: {},
  }
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

// ── Las fechas, relativas a hoy ─────────────────────────────────────────────────────────────────
// ⛔ No se escriben fechas fijas: el handler arranca de `new Date()` y un archivo con agosto adentro
// empieza a probar «la foto está vacía» sin que nadie lo note.

const hace = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

/** Una fila de conjunto. `recapturada` es lo que hace que ese día cuente como CERRADO. */
const conjunto = (fecha: string, recapturada: boolean) => ({
  fecha, nivel: 'conjunto', objeto_id: 'cj-1',
  capturado_at: `${recapturada ? hace(0) : fecha}T09:00:00Z`,
})

const campania = (id: string, fecha: string, extra: Fila = {}) => ({
  fecha, nivel: 'campania', objeto_id: id, cuenta_id: '111', nombre: `Campaña ${id}`,
  objetivo: 'OUTCOME_SALES', estado: 'ACTIVE', estado_efectivo: 'ACTIVE',
  diario_crudo: 1000000, moneda: 'ARS',
  spend: 50000, impresiones: 10000, clicks: 200, compras: 5, revenue: 300000,
  // La foto de campaña NO se recaptura al día siguiente: es el hecho medido que hace que el cierre
  // ⛔ no se le pueda preguntar a este nivel. Se deja explícito para que el caso sea legible.
  capturado_at: `${fecha}T09:00:00Z`,
  ...extra,
})

beforeEach(() => {
  vi.resetModules()
  FOTO = []
  ASIGNADAS = []
  ERROR_FOTO = null
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) vi.stubEnv(v, 'https://ejemplo.supabase.co')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

/** La foto sana: un día cerrado ayer a nivel conjunto y dos campañas repartidas. */
function fotoSana() {
  FOTO = [
    conjunto(hace(2), true),
    conjunto(hace(1), true),
    conjunto(hace(0), false),
    campania('c-bdi', hace(1)),
    campania('c-zat', hace(1), { objetivo: 'OUTCOME_TRAFFIC' }),
  ]
  ASIGNADAS = [
    { campaign_id: 'c-bdi', linea: 'bdi', cuenta_id: '111' },
    { campaign_id: 'c-zat', linea: 'zattia', cuenta_id: '111' },
  ]
}

describe('El Embudo con el token caído', () => {
  it('el token VENCIDO de verdad: Graph rechaza y contesta desde la foto, diciéndolo', async () => {
    fotoSana()
    vi.stubEnv('META_ADS_TOKEN', 'un-token-que-ya-venció')
    red(() => TOKEN_VENCIDO)

    const res = await llamar()

    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, fuente: 'foto', completo: false, dias: 30 })
    expect(String(res.body?.motivo)).toContain('No se pudieron listar las cuentas de Meta')
    expect(String(res.body?.motivo)).toContain('Session has expired')
    // 🔑 El control que evita el falso verde: un respaldo que devuelve todo vacío pasaría los
    // asserts de forma de arriba y se vería igual que «no hay pauta».
    const lineas = res.body?.lineas as Record<string, unknown[]>
    expect(lineas.bdi).toHaveLength(1)
    expect(lineas.zattia).toHaveLength(1)
    expect(lineas.stunned).toHaveLength(0)
  })

  it('sin token configurado: mismo respaldo, y el motivo habla del token', async () => {
    fotoSana()
    vi.stubEnv('META_ADS_TOKEN', '')
    red(() => { throw new Error('LLEGÓ A GRAPH — sin token no tiene que salir a la red') })

    const res = await llamar()

    expect(res.code).toBe(200)
    expect(res.body?.fuente).toBe('foto')
    expect(String(res.body?.motivo)).toContain('token')
    expect((res.body?.lineas as Record<string, unknown[]>).bdi).toHaveLength(1)
  })

  it('la ventana se cierra con las filas de CONJUNTO, no con las de campaña', async () => {
    // A nivel campaña la única recaptura es la del día -7. Si el cierre se le preguntara a ese
    // nivel, `hasta` daría hace(7) y la campaña que sólo existe ayer se caería de la ventana: el
    // Embudo mostraría un hueco que no existe, con cara de dato de hoy.
    FOTO = [
      conjunto(hace(1), true),
      campania('c-vieja', hace(7), { capturado_at: `${hace(6)}T09:00:00Z` }),
      campania('c-nueva', hace(1)),
    ]
    ASIGNADAS = [
      { campaign_id: 'c-vieja', linea: 'bdi', cuenta_id: '111' },
      { campaign_id: 'c-nueva', linea: 'bdi', cuenta_id: '111' },
    ]
    vi.stubEnv('META_ADS_TOKEN', 'vencido')
    red(() => TOKEN_VENCIDO)

    const res = await llamar()

    expect(res.body?.hasta).toBe(hace(1))
    expect(res.body?.desde).toBe(hace(30))
    const bdi = (res.body?.lineas as Record<string, { id: string }[]>).bdi
    expect(bdi.map((c) => c.id).sort()).toEqual(['c-nueva', 'c-vieja'])
  })

  it('UNA cuenta caída ⛔ no cae a la foto: mezclar los dos censos contaría dos veces', async () => {
    fotoSana()
    vi.stubEnv('META_ADS_TOKEN', 'un-token-vivo')
    red((u) => {
      if (u.includes('me/adaccounts')) {
        return { status: 200, body: { data: [
          { account_id: '111', name: 'BDI', currency: 'ARS' },
          { account_id: '222', name: 'Zattia', currency: 'ARS' },
        ] } }
      }
      if (u.includes('act_222/campaigns')) return TOKEN_VENCIDO
      if (u.includes('act_111/campaigns')) {
        return { status: 200, body: { data: [
          { id: 'c-bdi', name: 'Campaña viva', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE' },
        ] } }
      }
      return { status: 200, body: { data: [] } }
    })

    const res = await llamar()

    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ fuente: 'meta', completo: true })
    expect(res.body?.motivo).toBeUndefined()
    expect((res.body?.lineas as Record<string, unknown[]>).bdi).toHaveLength(1)
  })

  it('sin ningún día cerrado en la foto: 502 que dice las DOS cosas que fallaron', async () => {
    FOTO = [conjunto(hace(0), false), campania('c-bdi', hace(0))]
    ASIGNADAS = [{ campaign_id: 'c-bdi', linea: 'bdi', cuenta_id: '111' }]
    vi.stubEnv('META_ADS_TOKEN', 'vencido')
    red(() => TOKEN_VENCIDO)

    const res = await llamar()

    expect(res.code).toBe(502)
    expect(String(res.body?.error)).toContain('No se pudieron listar las cuentas de Meta')
    expect(String(res.body?.detalle)).toContain('ningún día cerrado')
  })

  it('la foto ilegible también corta con las dos: ⛔ no un censo vacío con cara de censo', async () => {
    fotoSana()
    ERROR_FOTO = 'connection reset'
    vi.stubEnv('META_ADS_TOKEN', 'vencido')
    red(() => TOKEN_VENCIDO)

    const res = await llamar()

    expect(res.code).toBe(502)
    expect(String(res.body?.error)).toContain('No se pudieron listar las cuentas de Meta')
    expect(String(res.body?.detalle)).toContain('connection reset')
  })
})

describe('El reparto por línea del respaldo', () => {
  it('una campaña SIN fila de línea queda en sinAsignar, ⛔ no en una línea por descarte', async () => {
    FOTO = [conjunto(hace(1), true), campania('c-huerfana', hace(1), { nombre: 'BDI - VENTAS - suelta' })]
    ASIGNADAS = []
    vi.stubEnv('META_ADS_TOKEN', 'vencido')
    red(() => TOKEN_VENCIDO)

    const res = await llamar()

    const lineas = res.body?.lineas as Record<string, unknown[]>
    expect(lineas.bdi).toHaveLength(0)
    expect(lineas.zattia).toHaveLength(0)
    expect(lineas.stunned).toHaveLength(0)
    const sin = res.body?.sinAsignar as { id: string; sugerida: string; tuvoActividad: boolean }[]
    expect(sin).toHaveLength(1)
    expect(sin[0]).toMatchObject({ id: 'c-huerfana', sugerida: 'bdi', tuvoActividad: true })
  })

  it('las que la foto tiene SIN objetivo se cuentan aparte y ⛔ no entran como sin clasificar', async () => {
    FOTO = [
      conjunto(hace(1), true),
      campania('c-bdi', hace(1)),
      campania('c-muda', hace(1), { objetivo: null }),
    ]
    ASIGNADAS = [
      { campaign_id: 'c-bdi', linea: 'bdi', cuenta_id: '111' },
      { campaign_id: 'c-muda', linea: 'bdi', cuenta_id: '111' },
    ]
    vi.stubEnv('META_ADS_TOKEN', 'vencido')
    red(() => TOKEN_VENCIDO)

    const res = await llamar()

    expect(res.body?.sinObjetivo).toBe(1)
    const bdi = (res.body?.lineas as Record<string, { id: string }[]>).bdi
    expect(bdi.map((c) => c.id)).toEqual(['c-bdi'])
  })
})
