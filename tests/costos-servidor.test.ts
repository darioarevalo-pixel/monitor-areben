import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La pieza B del escalón 3 de la Fase S: `productos.unit_cost` salió del navegador.
 *
 *   `api/_costos.js`  → la puerta, gateada por el permiso de las cinco secciones que muestran costo
 *   `api/_canjes.js`  → estampa el costo de un ítem SIN creerle al body
 *   `api/_fallas.js`  → completa la valuación cuando no vino tipeada
 *
 * 🔴 **Los handlers se ejercen, no se leen.** Es la lección que dejó la pieza A: la acción nueva de
 * Liquidación había quedado debajo de un guard que la hacía contestar 400 a un request válido, con
 * lint, typecheck, build y los tests del navegador EN VERDE. Ninguno de esos llama al handler.
 *
 * 🔴 Y la lección propia de esta pieza: **el gate acá NO es un 403**. Sin permiso se contesta 200
 * con la lista vacía, porque el costo es un enriquecimiento opcional del payload del ETL y un 403
 * dejaría a 11 de 14 personas sin poder abrir el Monitor. Un test que esperara 403 estaría
 * describiendo un bug.
 */

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
      // `single`/`maybeSingle` cierran la cadena con UNA fila, no con el array. Confundirlos es lo
      // que hacía que `traerCanje` recibiera una lista donde espera el canje y cortara con 404.
      const unaFila = () => Promise.resolve({ data: (filasPorTabla[tabla] || [])[0] ?? null, error: null })
      q.single = unaFila
      q.maybeSingle = unaFila
      q.range = (desde: number) =>
        Promise.resolve({ data: desde === 0 ? filasPorTabla[tabla] || [] : [], error: null })
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: filasPorTabla[tabla] || [], error: null }).then(ok)
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

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

const pedido = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: {},
  body,
})

async function llamar(modulo: string, req: unknown) {
  const mod = await import(/* @vite-ignore */ modulo)
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

const con = (...keys: string[]) => ({
  name: 'Alguien',
  acceso: { bdi: Object.fromEntries(keys.map((k) => [k, true])), zattia: Object.fromEntries(keys.map((k) => [k, true])) },
})

beforeEach(() => {
  filasPorTabla = {}
  consultas.length = 0
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio'
  process.env.ZATTIA_SUPABASE_URL = 'https://zattia.supabase.co'
  process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'clave-de-servicio-zattia'
})
afterEach(() => vi.unstubAllGlobals())

describe('api/_costos.js — la puerta', () => {
  const COSTOS = '@/api/_costos.js'

  it('sin permiso contesta 200 con la lista vacía, NO 403', async () => {
    // El ETL de las 11 personas que no ven costos tiene que terminar igual. Un 403 acá las deja
    // sin poder abrir el Monitor.
    sesionDe(con('marketing'))
    const res = await llamar(COSTOS, pedido({ store: 'bdi' }))
    expect(res.code).toBe(200)
    expect(res.body?.costos).toEqual({})
    expect(res.body?.sinPermiso).toBe(true)
  })

  it('con el permiso de una sección que muestra costo, los devuelve', async () => {
    sesionDe(con('margenes'))
    filasPorTabla.productos = [{ id: 7, unit_cost: 4500 }, { id: 9, unit_cost: null }]
    const res = await llamar(COSTOS, pedido({ store: 'bdi' }))
    expect(res.code).toBe(200)
    // `null` se conserva: es "GN no mandó el costo", que no es lo mismo que cero.
    expect(res.body?.costos).toEqual({ '7': 4500, '9': null })
  })

  it('las cinco secciones abren la puerta, y `canjes` no', async () => {
    // El gate se mide contra el padrón real: sólo 3 de 14 personas ven una cifra de costo. Quien
    // entra a Canjes lo estampaba sin verlo, y eso ahora lo hace el servidor.
    for (const key of ['margenes', 'proveedores', 'liquidacion', 'comisiones', 'postventa']) {
      sesionDe(con(key))
      filasPorTabla.productos = [{ id: 1, unit_cost: 100 }]
      const res = await llamar(COSTOS, pedido({ store: 'bdi' }))
      expect(res.body?.sinPermiso, `${key} tendría que abrir la puerta`).toBeUndefined()
    }
    sesionDe(con('canjes'))
    const res = await llamar(COSTOS, pedido({ store: 'bdi' }))
    expect(res.body?.sinPermiso).toBe(true)
  })

  it('un store inválido corta con 400 antes de tocar la base', async () => {
    sesionDe(con('margenes'))
    const res = await llamar(COSTOS, pedido({ store: 'stunned' }))
    expect(res.code).toBe(400)
    expect(consultas).toHaveLength(0)
  })

  it('pide sólo los ids cuando se los mandan', async () => {
    sesionDe(con('margenes'))
    filasPorTabla.productos = [{ id: 3, unit_cost: 900 }]
    await llamar(COSTOS, pedido({ store: 'bdi', ids: [3, 'no-un-numero', -1] }))
    // Los que no son enteros positivos se filtran: estos ids van al `in.(…)` de PostgREST.
    expect(consultas[0].pasos).toContain('in(id|[3])')
  })
})

describe('api/_canjes.js — el costo lo pone el servidor', () => {
  const CANJES = '@/api/_canjes.js'

  /** Un canje abierto de la marca que se pida, con el ítem que se va a agregar. */
  function canjeAbierto(store: string) {
    filasPorTabla.canjes = [{ id: 5, store, estado: 'aprobado', tope_monto: 999999 }]
    filasPorTabla.canje_items = []
    filasPorTabla.productos = [{ id: 42, unit_cost: 7777 }]
  }

  it('ignora el costo_unit del body y usa el de la base', async () => {
    // 🔴 El agujero que esto cierra: `controlDelTope` —lo único que impide que un canje de $80.000
    // salga $200.000— se calcula con este número, y hasta ayer lo elegía el navegador.
    sesionDe(con('canjes'))
    canjeAbierto('bdi')
    await llamar(CANJES, pedido({
      recurso: 'canjes', store: 'bdi', action: 'item-agregar', id: 5,
      product_id: '42', size_id: '1', nombre: 'Funda', cantidad: 1,
      costo_unit: 1, // lo que mandaría alguien tocando el request
      pvp_unit: 20000,
    }))
    const insert = consultas.find((c) => c.tabla === 'canje_items' && c.pasos.some((p) => p.startsWith('insert(')))
    expect(insert, 'tendría que haber insertado el ítem').toBeTruthy()
    const fila = JSON.parse(insert!.pasos.find((p) => p.startsWith('insert('))!.slice('insert('.length, -1))
    expect(fila.costo_unit).toBe(7777)
  })

  it('Stunned lee los costos de la base de Zattia, no de la suya', async () => {
    // Stunned no tiene base propia. Es la misma traducción que hace `baseDeCostos` en el navegador.
    sesionDe(con('canjes'))
    canjeAbierto('stunned')
    await llamar(CANJES, pedido({
      recurso: 'canjes', store: 'stunned', action: 'item-agregar', id: 5,
      product_id: '42', size_id: '1', nombre: 'Remera', cantidad: 1,
    }))
    const insert = consultas.find((c) => c.tabla === 'canje_items' && c.pasos.some((p) => p.startsWith('insert(')))
    const fila = JSON.parse(insert!.pasos.find((p) => p.startsWith('insert('))!.slice('insert('.length, -1))
    expect(fila.costo_unit).toBe(7777)
  })
})

describe('api/_fallas.js — la valuación la completa el servidor', () => {
  const FALLAS = '@/api/_fallas.js'

  it('completa el costo cuando el campo vino vacío', async () => {
    sesionDe(con('postventa-local'))
    filasPorTabla.productos = [{ id: 42, unit_cost: 3300 }]
    filasPorTabla.fallas_deposito = [{ id: 1 }]
    await llamar(FALLAS, {
      ...pedido({ store: 'bdi', action: 'crear', producto: 'Buzo', product_id: '42', valuacion_costo: null }),
    })
    const insert = consultas.find((c) => c.tabla === 'fallas_deposito' && c.pasos.some((p) => p.startsWith('insert(')))
    const fila = JSON.parse(insert!.pasos.find((p) => p.startsWith('insert('))!.slice('insert('.length, -1))
    expect(fila.valuacion_costo).toBe(3300)
  })

  it('respeta el cero que tipeó un admin: cero no es vacío', async () => {
    sesionDe(con('postventa'))
    filasPorTabla.productos = [{ id: 42, unit_cost: 3300 }]
    filasPorTabla.fallas_deposito = [{ id: 1 }]
    await llamar(FALLAS, {
      ...pedido({ store: 'bdi', action: 'crear', producto: 'Buzo', product_id: '42', valuacion_costo: 0 }),
    })
    const insert = consultas.find((c) => c.tabla === 'fallas_deposito' && c.pasos.some((p) => p.startsWith('insert(')))
    const fila = JSON.parse(insert!.pasos.find((p) => p.startsWith('insert('))!.slice('insert('.length, -1))
    expect(fila.valuacion_costo).toBe(0)
  })
})
