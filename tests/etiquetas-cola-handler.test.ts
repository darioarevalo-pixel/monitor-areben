import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La cola de reetiquetado, **ejercida contra el handler**.
 *
 * 🔴 Existe por un mutante que salió VERDE: apagar la rama de `etiquetado` (que deja de cortar y
 * sigue de largo) no rompía ni un test. `tests/handlers-autorizacion.test.ts` no podía cazarlo — ahí
 * `createClient` tira siempre, así que todo lo que pasa el gate explota igual y no hay forma de
 * distinguir «entró y trabajó» de «entró y siguió de largo». Ese archivo fija quién NO entra; éste
 * fija qué pasa cuando entra.
 *
 * Mismo patrón de mock que `tests/costos-servidor.test.ts`: un cliente de Supabase que devuelve
 * filas de mentira y anota qué se le pidió.
 */

/** Lo que PostgREST devuelve como máximo sin `range`, y sin decir que cortó. */
const TOPE_POSTGREST = 1000

let filasPorTabla: Record<string, unknown[]> = {}
const consultas: { tabla: string; pasos: string[] }[] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const registro = { tabla, pasos: [] as string[] }
      consultas.push(registro)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'eq', 'order', 'limit', 'insert', 'update', 'upsert']) {
        q[m] = (...args: unknown[]) => {
          registro.pasos.push(`${m}(${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join('|')})`)
          return q
        }
      }
      const unaFila = () => Promise.resolve({ data: (filasPorTabla[tabla] || [])[0] ?? null, error: null })
      q.single = unaFila
      q.maybeSingle = unaFila
      // 🔑 **El mock corta en 1.000 como PostgREST.** Devolver siempre todas las filas es
      // exactamente lo que hacía verde a una consulta sin paginar: el defecto sólo existe pasadas
      // las mil, y el mock lo escondía. `range` pagina de verdad; `then` (la consulta sin `range`)
      // entrega el tope y nada más, sin error, como el servidor.
      q.range = (desde: number, hasta: number) =>
        Promise.resolve({ data: (filasPorTabla[tabla] || []).slice(desde, hasta + 1), error: null })
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: (filasPorTabla[tabla] || []).slice(0, TOPE_POSTGREST), error: null }).then(ok)
      return q
    },
  }),
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    send(b: string) { r.body = JSON.parse(b) as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const cabecera = { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) }

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

async function llamar(req: unknown) {
  const mod = await import(/* @vite-ignore */ '@/api/_liquidacion.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

const SOLO_ETIQUETAS = { name: 'Local', admin: false, cuenta: null, acceso: { bdi: { etiquetas: true } }, funcion: [] }

const ayer = '2026-08-15T10:00:00.000Z'
const anteayer = '2026-08-14T10:00:00.000Z'

beforeEach(() => {
  filasPorTabla = {}
  consultas.length = 0
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio'
})
afterEach(() => vi.unstubAllGlobals())

describe('GET ?etiquetas=1&cola=1 — la cola sale de la bitácora, no de una campaña', () => {
  const pedir = () => ({ method: 'GET', headers: cabecera, query: { store: 'bdi', etiquetas: '1', cola: '1' }, body: {} })

  it('separa pendiente, al día y sin stock, y no pide una sola campaña', async () => {
    sesionDe(SOLO_ETIQUETAS)
    filasPorTabla['liquidacion_bitacora'] = [
      { pid: '1', producto: 'SWEATER BERLIN', sku: 'SW', cuando: ayer, precio_a: 20990, precio_lista: 29990, liq_nombre: 'Sale', modo: 'poner' },
      { pid: '2', producto: 'TOP AUREA', sku: 'TA', cuando: ayer, precio_a: 11190, precio_lista: 15990, liq_nombre: 'Sale', modo: 'poner' },
      { pid: '3', producto: 'JEAN BLECK', sku: 'JB', cuando: ayer, precio_a: 12990, precio_lista: 19990, liq_nombre: 'Sale', modo: 'poner' },
    ]
    filasPorTabla['etiquetas_impresas'] = [{ pid: '2', cuando: '2026-08-16T09:00:00.000Z', modo: 'impresa' }]
    filasPorTabla['inventario'] = [
      { product_id: 1, available_quantity: 5 },
      { product_id: 2, available_quantity: 4 },
      { product_id: 3, available_quantity: 0 },
    ]

    const res = await llamar(pedir())
    expect(res.code).toBe(200)
    expect((res.body?.pendientes as { pid: string }[]).map((p) => p.pid)).toEqual(['1'])
    expect((res.body?.hechas as { pid: string }[]).map((p) => p.pid)).toEqual(['2'])
    expect((res.body?.sinStock as { pid: string }[]).map((p) => p.pid)).toEqual(['3'])
    // 🔑 Ni una consulta a `liquidaciones`: la campaña dejó de ser la que dice qué etiquetar.
    expect(consultas.map((c) => c.tabla)).not.toContain('liquidaciones')
  })

  it('el stock suma los dos depósitos: Local y Depósito son la misma prenda', async () => {
    sesionDe(SOLO_ETIQUETAS)
    filasPorTabla['liquidacion_bitacora'] = [
      { pid: '1', producto: 'X', sku: null, cuando: ayer, precio_a: 100, precio_lista: 200, liq_nombre: null, modo: 'poner' },
    ]
    // 🔑 Los dos con unidades y distintos: con `0` y `3` el test pasaba igual pisando en vez de
    // sumar (el último gana y da 3), y el mutante se escapaba.
    filasPorTabla['inventario'] = [
      { product_id: 1, available_quantity: 2 },
      { product_id: 1, available_quantity: 3 },
    ]
    const res = await llamar(pedir())
    expect((res.body?.pendientes as { pid: string; stock: number }[])[0]).toMatchObject({ pid: '1', stock: 5 })
  })

  it('un producto con tres cambios es UNA etiqueta, no tres, y vale el más nuevo', async () => {
    sesionDe(SOLO_ETIQUETAS)
    // Vienen ordenados por `cuando desc`, como los pide el handler.
    filasPorTabla['liquidacion_bitacora'] = [
      { pid: '1', producto: 'X', sku: null, cuando: ayer, precio_a: null, precio_lista: 200, liq_nombre: null, modo: 'sacar' },
      { pid: '1', producto: 'X', sku: null, cuando: anteayer, precio_a: 100, precio_lista: 200, liq_nombre: null, modo: 'poner' },
    ]
    filasPorTabla['inventario'] = [{ product_id: 1, available_quantity: 2 }]
    const res = await llamar(pedir())
    const p = res.body?.pendientes as { pid: string; cuando: string; modo: string }[]
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ cuando: ayer, modo: 'sacar' })
  })

  it('devuelve los sellos con su número, para poder comparar contra el precio de hoy', async () => {
    sesionDe(SOLO_ETIQUETAS)
    filasPorTabla['etiquetas_impresas'] = [
      { pid: '7', cuando: ayer, modo: 'impresa', precio: '12290.00', precio_lista: '20490.00' },
      { pid: '8', cuando: ayer, modo: 'ya_estaba', precio: null, precio_lista: null },
    ]
    const res = await llamar(pedir())
    const sellos = res.body?.sellos as Record<string, { precio: number | null; precioLista: number | null }>
    expect(sellos['7']).toEqual({ cuando: ayer, modo: 'impresa', precio: 12290, precioLista: 20490 })
    expect(sellos['8'].precio).toBeNull()
  })

  /**
   * 🔴 El defecto que destapó Bruno el 3-sep-2026: cambió el precio de MINI BLUSH —17 unidades en
   * el Local— y la prenda no aparecía en la cola. Las tres consultas leían sin paginar, así que
   * PostgREST devolvía **las primeras 1.000 filas y ninguna señal**: del inventario de Zattia
   * (3.892 filas) salía un mapa de stock con **256 productos de 734**, y todo lo que quedaba afuera
   * se leía como «sin stock» y se descartaba.
   */
  it('🔴 lee el inventario ENTERO: la prenda de la fila 1001 tenía stock y salía sin stock', async () => {
    sesionDe(SOLO_ETIQUETAS)
    filasPorTabla['liquidacion_bitacora'] = [
      { pid: '9999', producto: 'MINI BLUSH', sku: 'RMI-0055', cuando: ayer, precio_a: 14990, precio_lista: 19990, liq_nombre: null, modo: 'poner' },
    ]
    filasPorTabla['inventario'] = [
      ...Array.from({ length: TOPE_POSTGREST }, (_, i) => ({ product_id: i + 1, available_quantity: 1 })),
      { product_id: 9999, available_quantity: 17 },
    ]
    const res = await llamar(pedir())
    expect((res.body?.stock as Record<string, number>)['9999']).toBe(17)
    expect((res.body?.pendientes as { pid: string; stock: number }[])).toMatchObject([{ pid: '9999', stock: 17 }])
    expect(res.body?.sinStock).toEqual([])
  })

  it('🔴 lee la bitácora ENTERA: el cambio de precio 1001 no desaparece de la cola', async () => {
    sesionDe(SOLO_ETIQUETAS)
    filasPorTabla['liquidacion_bitacora'] = [
      ...Array.from({ length: TOPE_POSTGREST }, (_, i) => ({ pid: String(i + 1), producto: 'X', sku: null, cuando: ayer, precio_a: 100, precio_lista: 200, liq_nombre: null, modo: 'poner' })),
      { pid: '9999', producto: 'MINI BLUSH', sku: null, cuando: anteayer, precio_a: 14990, precio_lista: 19990, liq_nombre: null, modo: 'poner' },
    ]
    filasPorTabla['inventario'] = [{ product_id: 9999, available_quantity: 17 }]
    const res = await llamar(pedir())
    expect((res.body?.pendientes as { pid: string }[]).map((p) => p.pid)).toContain('9999')
  })

  it('🔴 lee los sellos ENTEROS: sin el 1001 la prenda vuelve a la cola ya etiquetada', async () => {
    sesionDe(SOLO_ETIQUETAS)
    filasPorTabla['liquidacion_bitacora'] = [
      { pid: '9999', producto: 'MINI BLUSH', sku: null, cuando: anteayer, precio_a: 14990, precio_lista: 19990, liq_nombre: null, modo: 'poner' },
    ]
    filasPorTabla['etiquetas_impresas'] = [
      ...Array.from({ length: TOPE_POSTGREST }, (_, i) => ({ pid: String(i + 1), cuando: ayer, modo: 'impresa', precio: 100, precio_lista: 200 })),
      { pid: '9999', cuando: ayer, modo: 'impresa', precio: 14990, precio_lista: 19990 },
    ]
    filasPorTabla['inventario'] = [{ product_id: 9999, available_quantity: 17 }]
    const res = await llamar(pedir())
    expect((res.body?.hechas as { pid: string }[]).map((p) => p.pid)).toEqual(['9999'])
    expect(res.body?.pendientes).toEqual([])
    expect((res.body?.sellos as Record<string, unknown>)['9999']).toBeTruthy()
  })

  it('la respuesta dice CUÁNDO se leyó: una cola vacía sana se ve igual que una rota', async () => {
    sesionDe(SOLO_ETIQUETAS)
    const res = await llamar(pedir())
    expect(res.body?.leidoEn).toBeTruthy()
    expect(res.body?.pendientes).toEqual([])
  })
})

describe('POST action:etiquetado — la única escritura de la llave de Etiquetas', () => {
  const postDe = (body: Record<string, unknown>) => ({
    method: 'POST',
    headers: cabecera,
    query: { store: 'bdi', etiquetas: '1' },
    body: { store: 'bdi', ...body },
  })

  it('🔴 la rama corta y ESCRIBE: un upsert en etiquetas_impresas', async () => {
    // El mutante que motivó este archivo: si la rama deja de cortar, esto deja de escribir.
    sesionDe(SOLO_ETIQUETAS)
    const res = await llamar(postDe({ action: 'etiquetado', pids: ['1', '2'] }))
    expect(res.code).toBe(200)
    expect(res.body?.marcados).toBe(2)
    const escritura = consultas.find((c) => c.tabla === 'etiquetas_impresas')
    expect(escritura, 'tiene que haber pasado por etiquetas_impresas').toBeTruthy()
    expect(escritura!.pasos.join(' ')).toContain('upsert(')
    expect(escritura!.pasos.join(' ')).toContain('"modo":"impresa"')
  })

  it('«ya está» se guarda como ya_estaba: decir «impresa» sobre algo que nadie imprimió es mentir', async () => {
    sesionDe(SOLO_ETIQUETAS)
    await llamar(postDe({ action: 'etiquetado', pids: ['1'], modo: 'ya_estaba' }))
    const escritura = consultas.find((c) => c.tabla === 'etiquetas_impresas')
    expect(escritura!.pasos.join(' ')).toContain('"modo":"ya_estaba"')
  })

  it('un modo inventado cae en «impresa», no viaja tal cual a la base', async () => {
    sesionDe(SOLO_ETIQUETAS)
    await llamar(postDe({ action: 'etiquetado', pids: ['1'], modo: 'lo-que-sea' }))
    const escritura = consultas.find((c) => c.tabla === 'etiquetas_impresas')
    expect(escritura!.pasos.join(' ')).toContain('"modo":"impresa"')
    expect(escritura!.pasos.join(' ')).not.toContain('lo-que-sea')
  })

  it('🔴 guarda QUÉ NÚMERO decía la etiqueta, que es lo que caza un precio de lista cambiado a mano', async () => {
    // Sin esto la cola sólo sabe comparar fechas contra la bitácora, y la bitácora sólo tiene lo que
    // escribe el Monitor: un precio de LISTA corregido en Gestión Nube no deja rastro.
    sesionDe(SOLO_ETIQUETAS)
    await llamar(postDe({ action: 'etiquetado', pids: ['1'], precios: { '1': { precio: 12290, precioLista: 20490 } } }))
    const escritura = consultas.find((c) => c.tabla === 'etiquetas_impresas')!.pasos.join(' ')
    expect(escritura).toContain('"precio":12290')
    expect(escritura).toContain('"precio_lista":20490')
  })

  it('un precio que no es número no viaja a la base: entra como null', async () => {
    sesionDe(SOLO_ETIQUETAS)
    await llamar(postDe({ action: 'etiquetado', pids: ['1'], precios: { '1': { precio: 'gratis', precioLista: null } } }))
    const escritura = consultas.find((c) => c.tabla === 'etiquetas_impresas')!.pasos.join(' ')
    expect(escritura).toContain('"precio":null')
    expect(escritura).not.toContain('gratis')
  })

  it('sin productos contesta 400 y no escribe nada', async () => {
    sesionDe(SOLO_ETIQUETAS)
    const res = await llamar(postDe({ action: 'etiquetado', pids: [] }))
    expect(res.code).toBe(400)
    expect(consultas.find((c) => c.tabla === 'etiquetas_impresas')).toBeFalsy()
  })
})
