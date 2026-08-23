import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **Los dos permisos de Faltantes, que no son el mismo.** Es toda la idea de la sección y no hay
 * ninguna pantalla donde se vea:
 *
 *   - **Anotar** entra con `atencion`, porque el alta vive adentro de «Atención al cliente». Si
 *     pidiera el permiso de la sección, la única persona que escucha el pedido sería la única que
 *     no puede anotarlo — y la lista queda vacía para siempre, con la trampa de que una lista vacía
 *     se lee como «no piden nada».
 *   - **Decidir** (conseguido / descartado) pide `pedidos-clientes`, porque mover el estado **borra
 *     demanda de la vista del que compra**.
 *
 * 🔴 Y el agujero que separa las dos cosas: `estado` viaja adentro del alta. Sin un candado propio,
 * quien sólo tiene `atencion` manda `estado:'descartado'` en el `guardar` y hace por la puerta de
 * al lado exactamente lo que el gate de abajo le prohíbe. Ese caso es el que este archivo fija.
 */

const h = vi.hoisted(() => ({
  /** La fila que devuelve el `select().maybeSingle()` del handler antes de escribir. */
  fila: null as Record<string, unknown> | null,
  /** Lo que se intentó escribir. Es lo que prueba que un 200 escribió de verdad. */
  acciones: [] as { verbo: string; v?: unknown }[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {
      from: () => q,
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: h.fila, error: null }),
      upsert: (v: unknown) => { h.acciones.push({ verbo: 'upsert', v }); return q },
      update: (v: unknown) => { h.acciones.push({ verbo: 'update', v }); return q },
      delete: () => { h.acciones.push({ verbo: 'delete' }); return q },
      // La cadena entera es esperable: `await ...select().eq().order().limit()` y
      // `await ...update().eq()` terminan acá.
      then: (res: (v: unknown) => void) => res({ data: [], error: null }),
    }
    return q
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

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    String(url).includes('bdi-catalogo.vercel.app/api/usuarios')
      ? { ok: true, json: async () => ({ ok: true, perfil }) }
      : { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [] }), text: async () => '{"data":[]}' }
  )) as unknown as typeof fetch)
}

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: {},
  body,
})

async function llamar(req: unknown) {
  const mod = await import('@/api/_pedidos-clientes.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

/** Quien atiende: tiene la pantalla donde se anota, y NO la sección de Compras. */
const SOLO_ATIENDE = { name: 'Sofi', admin: false, cuenta: null, acceso: { bdi: { atencion: true } }, funcion: [] }
/** Quien compra: tiene la sección. */
const COMPRA = { name: 'Compras', admin: false, cuenta: null, acceso: { bdi: { 'pedidos-clientes': true } }, funcion: [] }
/** Alguien del equipo sin ninguna de las dos. */
const SIN_NADA = { name: 'Depósito', admin: false, cuenta: null, acceso: {}, funcion: [] }

beforeEach(() => {
  vi.resetModules()
  h.fila = null
  h.acciones = []
  vi.stubEnv('SUPABASE_URL', 'puesto-para-que-no-corte-antes')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'puesto-para-que-no-corte-antes')
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'puesto-para-que-no-corte-antes')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'puesto-para-que-no-corte-antes')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('anotar entra con «atencion»: si no, la lista queda vacía para siempre', () => {
  it('quien sólo atiende puede anotar un faltante', async () => {
    sesionDe(SOLO_ATIENDE)
    const res = await llamar(post({ store: 'bdi', action: 'guardar', pedido: { texto: 'funda iphone 15' } }))
    expect(res.code).toBe(200)
    // 🔑 El 200 no alcanza: se comprueba que la escritura EXISTIÓ. Un handler que contesta ok y no
    // llama a `upsert` deja la pantalla diciendo «anotado» sobre una lista que sigue vacía.
    expect(h.acciones.map((a) => a.verbo)).toContain('upsert')
  })

  it('quien no tiene ninguna de las dos no entra ni a leer', async () => {
    sesionDe(SIN_NADA)
    const res = await llamar({ method: 'GET', headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'p' }) }, query: { store: 'bdi' }, body: {} })
    expect(res.code).toBe(403)
    expect(h.acciones).toEqual([])
  })

  it('el GET le dice al que sólo atiende que NO decide, así la pantalla no dibuja botones que rebotan', async () => {
    sesionDe(SOLO_ATIENDE)
    const res = await llamar({ method: 'GET', headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'p' }) }, query: { store: 'bdi' }, body: {} })
    expect(res.code).toBe(200)
    expect((res.body as { puede: { decidir: boolean } }).puede.decidir).toBe(false)
  })
})

describe('decidir pide la sección, y no hay puerta de al lado', () => {
  it('quien sólo atiende no puede marcar conseguido', async () => {
    sesionDe(SOLO_ATIENDE)
    const res = await llamar(post({ store: 'bdi', action: 'estado', id: 'p1', estado: 'conseguido' }))
    expect(res.code).toBe(403)
    expect(h.acciones).toEqual([])
  })

  /**
   * 🔴 El agujero real: el mismo efecto, escrito por el alta. Sin este candado el gate de arriba
   * está puesto y no sirve para nada — y no falla, sólo deja la fila descartada.
   */
  it('tampoco puede colar el estado adentro del alta', async () => {
    sesionDe(SOLO_ATIENDE)
    const res = await llamar(post({ store: 'bdi', action: 'guardar', pedido: { texto: 'body', estado: 'descartado' } }))
    expect(res.code).toBe(403)
    expect(h.acciones).toEqual([])
  })

  it('quien compra sí decide — si no, lo de arriba estaría verde por prohibir todo', async () => {
    sesionDe(COMPRA)
    h.fila = { store: 'bdi', creado_por: 'Sofi' }
    const res = await llamar(post({ store: 'bdi', action: 'estado', id: 'p1', estado: 'conseguido' }))
    expect(res.code).toBe(200)
    expect(h.acciones.map((a) => a.verbo)).toContain('update')
  })
})

describe('borrar es para el error de tipeo, no para sacar de la lista lo que anotó otro', () => {
  it('quien sólo atiende borra lo suyo', async () => {
    sesionDe(SOLO_ATIENDE)
    h.fila = { store: 'bdi', creado_por: 'Sofi' }
    const res = await llamar(post({ store: 'bdi', action: 'borrar', id: 'p1' }))
    expect(res.code).toBe(200)
    expect(h.acciones.map((a) => a.verbo)).toContain('delete')
  })

  it('🔴 y NO borra lo que anotó otra persona', async () => {
    sesionDe(SOLO_ATIENDE)
    h.fila = { store: 'bdi', creado_por: 'Cami' }
    const res = await llamar(post({ store: 'bdi', action: 'borrar', id: 'p1' }))
    expect(res.code).toBe(403)
    expect(h.acciones.map((a) => a.verbo)).not.toContain('delete')
  })

  it('quien compra borra cualquiera', async () => {
    sesionDe(COMPRA)
    h.fila = { store: 'bdi', creado_por: 'Cami' }
    const res = await llamar(post({ store: 'bdi', action: 'borrar', id: 'p1' }))
    expect(res.code).toBe(200)
  })

  it('una fila de la otra marca no se toca ni con la sección tildada', async () => {
    sesionDe(COMPRA)
    h.fila = { store: 'zattia', creado_por: 'Cami' }
    const res = await llamar(post({ store: 'bdi', action: 'borrar', id: 'p1' }))
    expect(res.code).toBe(403)
    expect(h.acciones.map((a) => a.verbo)).not.toContain('delete')
  })
})

describe('lo que no llega a la base', () => {
  it('una marca inventada no entra', async () => {
    sesionDe(COMPRA)
    const res = await llamar(post({ store: 'inventada', action: 'guardar', pedido: { texto: 'body' } }))
    expect(res.code).toBe(400)
  })

  /**
   * ⛔ `stunned` es una LÍNEA que se separa por prefijo de SKU, y un producto que **no tenemos** no
   * tiene SKU: acá no hay nada que pueda clasificarlo. Se corta en 400 y no se acepta «por las
   * dudas» para que después no aparezca una tercera columna de datos que nadie sabe llenar.
   */
  it('stunned tampoco: un faltante no tiene SKU con el que separarlo', async () => {
    sesionDe(COMPRA)
    const res = await llamar(post({ store: 'stunned', action: 'guardar', pedido: { texto: 'body' } }))
    expect(res.code).toBe(400)
  })

  it('un pedido vacío no entra', async () => {
    sesionDe(COMPRA)
    const res = await llamar(post({ store: 'bdi', action: 'guardar', pedido: { texto: '   ' } }))
    expect(res.code).toBe(400)
    expect(h.acciones).toEqual([])
  })

  it('una acción desconocida no cae en ninguna rama por descarte', async () => {
    sesionDe(COMPRA)
    const res = await llamar(post({ store: 'bdi', action: 'inventada', id: 'p1' }))
    expect(res.code).toBe(400)
  })

  it('un estado inventado no entra aunque lo mande el que decide', async () => {
    sesionDe(COMPRA)
    const res = await llamar(post({ store: 'bdi', action: 'estado', id: 'p1', estado: 'guardado' }))
    expect(res.code).toBe(400)
    expect(h.acciones).toEqual([])
  })
})

describe('la cuenta fija manda también acá', () => {
  const CLAVADA_A_ZATTIA = {
    name: 'Local Zattia',
    admin: false,
    cuenta: 'zattia',
    acceso: { bdi: { 'pedidos-clientes': true }, zattia: { 'pedidos-clientes': true } },
    funcion: [],
  }

  it('🔴 clavada a Zattia y con la sección en las dos: no anota un faltante de BDI', async () => {
    sesionDe(CLAVADA_A_ZATTIA)
    const res = await llamar(post({ store: 'bdi', action: 'guardar', pedido: { texto: 'body' } }))
    expect(res.code).toBe(403)
  })

  it('el mismo perfil SÍ anota el de Zattia', async () => {
    sesionDe(CLAVADA_A_ZATTIA)
    const res = await llamar(post({ store: 'zattia', action: 'guardar', pedido: { texto: 'body' } }))
    expect(res.code).toBe(200)
  })
})
