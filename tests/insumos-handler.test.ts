// El handler de Insumos, entero: qué deja pasar, qué frena y qué NO manda.
//
// El `createClient` está mockeado con una base falsa que ANOTA lo que se le pide: el oráculo es lo
// que quedó escrito, ⛔ no lo que contestó el handler.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Fila = Record<string, unknown>

/** Lo que la base falsa recibió, para poder mirarlo desde el test. */
const base = {
  tablas: {} as Record<string, Fila[]>,
  escrituras: [] as { tabla: string; verbo: string; filas?: Fila[]; filtro?: [string, unknown] }[],
}

function consulta(tabla: string) {
  const q: Record<string, unknown> = {}
  const encadenable = ['select', 'order', 'gte', 'lte', 'eq'] as const
  for (const m of encadenable) q[m] = () => q
  q.range = async () => ({ data: base.tablas[tabla] ?? [], error: null })
  q.maybeSingle = async () => ({ data: (base.tablas[tabla] ?? [])[0] ?? null, error: null })
  q.upsert = async (filas: Fila | Fila[]) => {
    base.escrituras.push({ tabla, verbo: 'upsert', filas: Array.isArray(filas) ? filas : [filas] })
    return { error: null }
  }
  q.insert = async (filas: Fila | Fila[]) => {
    base.escrituras.push({ tabla, verbo: 'insert', filas: Array.isArray(filas) ? filas : [filas] })
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

/** Alguien de Administración: tiene la sección tildada en BDI. */
const CON_INSUMOS = { name: 'Lorena', admin: false, cuenta: null, acceso: { bdi: { insumos: true } }, funcion: [] }

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

const pedir = (extra: Record<string, unknown> = {}) => ({
  method: 'GET',
  headers: { 'x-monitor-auth': sobre({ user: 'Lorena', pass: 'p' }) },
  query: { store: 'bdi' },
  body: {},
  ...extra,
})

async function correr(req: Record<string, unknown>) {
  const { default: handler } = await import('../api/_insumos.js')
  const res = resFalso()
  await (handler as (q: unknown, s: unknown) => Promise<void>)(req, res)
  return res
}

beforeEach(() => {
  base.tablas = {}
  base.escrituras = []
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
  sesionDe(CON_INSUMOS)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lo que el GET manda', () => {
  it('🔴 NO manda plata de ventas: sólo cuentas de pedidos', async () => {
    base.tablas.insumo = [{
      id: 'in1', nombre: 'Bolsas', tipo: 'comercial', unidad: 'unidad', bulto: null, por_bulto: null,
      marcas: ['bdi'], minimo: 2, dias_reposicion: null, consumo: { modo: 'por-venta', canal: 'local', porVenta: 1 },
      activo: true, nota: null, autor: 'Lorena', created_at: 'x', updated_at: 'x',
    }]
    base.tablas.ventas = [{ date_sale: '2026-08-01', channel: 'Mi Local', total_price: 99999 }]
    const res = await correr(pedir())
    expect(res.code).toBe(200)
    const texto = JSON.stringify(res.body)
    expect(texto).not.toContain('99999')
    expect(texto).not.toContain('plata')
    expect(texto).not.toContain('total_price')
    expect(res.body?.comprasPorMarca).toEqual({ bdi: [{ fecha: '2026-08-01', local: 1, online: 0, mayorista: 0 }] })
  })

  it('sin ningún insumo atado a las ventas no va a buscar ninguna venta', async () => {
    base.tablas.insumo = [{
      id: 'in1', nombre: 'Yerba', tipo: 'comestible', unidad: 'kg', bulto: null, por_bulto: null,
      marcas: [], minimo: 1, dias_reposicion: null, consumo: {}, activo: true, nota: null,
      autor: 'Lorena', created_at: 'x', updated_at: 'x',
    }]
    base.tablas.ventas = [{ date_sale: '2026-08-01', channel: 'Mi Local' }]
    const res = await correr(pedir())
    expect(res.body?.comprasPorMarca).toEqual({})
  })

  it('un precio nulo en la base viaja como null, ⛔ no como 0', async () => {
    base.tablas.insumo = []
    base.tablas.insumo_movimiento = [{
      id: 'mv1', insumo_id: 'in1', tipo: 'compra', ubicacion: 'deposito', cantidad: 5,
      fecha: '2026-08-01', precio_total: null, proveedor: null, comprobante: null, grupo: null,
      usuario: 'Lorena', nota: null, datos: {}, created_at: 'x',
    }]
    const res = await correr(pedir())
    expect((res.body?.movimientos as { precioTotal: unknown }[])[0].precioTotal).toBe(null)
  })
})

describe('lo que el POST frena', () => {
  it('un precio vacío NO entra como 0', async () => {
    const res = await correr(pedir({
      method: 'POST',
      body: {
        action: 'guardar-movimiento',
        movimiento: { insumoId: 'in1', tipo: 'compra', ubicacion: 'deposito', cantidad: 5, fecha: '2026-08-01', precioTotal: '' },
      },
    }))
    expect(res.code).toBe(200)
    expect(base.escrituras[0].filas?.[0].precio_total).toBe(null)
  })

  it('🔴 un traslado NO entra por guardar-movimiento: quedaría media mitad', async () => {
    const res = await correr(pedir({
      method: 'POST',
      body: {
        action: 'guardar-movimiento',
        movimiento: { insumoId: 'in1', tipo: 'traslado', ubicacion: 'deposito', cantidad: 5, fecha: '2026-08-01' },
      },
    }))
    expect(res.code).toBe(400)
    expect(base.escrituras).toHaveLength(0)
  })

  it('un traslado escribe DOS filas con el mismo grupo y signos opuestos', async () => {
    const res = await correr(pedir({
      method: 'POST',
      body: { action: 'trasladar', insumoId: 'in1', origen: 'deposito', destino: 'local-bdi', cantidad: 20, fecha: '2026-08-01' },
    }))
    expect(res.code).toBe(200)
    const filas = base.escrituras[0].filas as Fila[]
    expect(filas).toHaveLength(2)
    expect(filas[0].grupo).toBe(filas[1].grupo)
    expect((filas[0].datos as { pata: string }).pata).toBe('salida')
    expect((filas[1].datos as { pata: string }).pata).toBe('entrada')
    // Las dos positivas: el signo lo pone el núcleo, no la fila.
    expect(filas.every((f) => Number(f.cantidad) > 0)).toBe(true)
  })

  it('trasladar al mismo lugar se frena', async () => {
    const res = await correr(pedir({
      method: 'POST',
      body: { action: 'trasladar', insumoId: 'in1', origen: 'deposito', destino: 'deposito', cantidad: 20, fecha: '2026-08-01' },
    }))
    expect(res.code).toBe(400)
  })

  it('🔴 borrar una pata de un traslado se lleva las DOS', async () => {
    base.tablas.insumo_movimiento = [{ id: 'mv1', tipo: 'traslado', grupo: 'tr9' }]
    const res = await correr(pedir({ method: 'POST', body: { action: 'borrar-movimiento', id: 'mv1' } }))
    expect(res.code).toBe(200)
    expect(base.escrituras[0].filtro).toEqual(['grupo', 'tr9'])
  })

  it('borrar un movimiento común borra sólo ése', async () => {
    base.tablas.insumo_movimiento = [{ id: 'mv1', tipo: 'compra', grupo: null }]
    await correr(pedir({ method: 'POST', body: { action: 'borrar-movimiento', id: 'mv1' } }))
    expect(base.escrituras[0].filtro).toEqual(['id', 'mv1'])
  })

  it('un insumo sin nombre no se guarda, y el error dice cuál es el campo', async () => {
    const res = await correr(pedir({
      method: 'POST',
      body: { action: 'guardar-insumo', insumo: { nombre: '  ', tipo: 'comercial', unidad: 'unidad', marcas: [], minimo: 2 } },
    }))
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toMatch(/nombre/)
    expect(base.escrituras).toHaveLength(0)
  })
})
