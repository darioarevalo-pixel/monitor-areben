import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El tipo de campaña, **ejercido contra el handler**.
 *
 * 🔴 **Lo que se fija acá es que el tipo no se puede inventar desde el navegador.** `liquidaciones.
 * datos` es un `jsonb` y el handler lo arma campo por campo justamente para que nadie escriba ahí
 * lo que quiera; un `tipo` que entrara sin validar dejaría campañas con un valor que ninguna
 * pantalla sabe leer, y como `tipoDe()` cae a `liquidacion` ante lo que no conoce, **nadie se
 * enteraría**: la campaña se vería normal y el dato guardado sería basura.
 *
 * Mismo patrón de mock que `tests/liquidacion-colgadas-handler.test.ts`.
 */

let filasPorTabla: Record<string, unknown[]> = {}
const escrituras: { tabla: string; metodo: string; filas: unknown }[] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'eq', 'order', 'limit']) {
        q[m] = () => q
      }
      for (const m of ['insert', 'update', 'upsert']) {
        q[m] = (filas: unknown) => {
          escrituras.push({ tabla, metodo: m, filas })
          return q
        }
      }
      const unaFila = () => Promise.resolve({ data: (filasPorTabla[tabla] || [])[0] ?? null, error: null })
      q.single = unaFila
      q.maybeSingle = unaFila
      q.range = (desde: number) => Promise.resolve({ data: desde === 0 ? filasPorTabla[tabla] || [] : [], error: null })
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
const cabecera = { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) }
const LIQUIDACION = { name: 'Bruno', admin: false, cuenta: null, acceso: { bdi: { liquidacion: true } }, funcion: [] }

async function llamar(body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: LIQUIDACION }) })))
  const mod = await import(/* @vite-ignore */ '@/api/_liquidacion.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', query: {}, headers: cabecera, body: { recurso: 'liquidacion', store: 'bdi', ...body } },
    res,
  )
  return res
}

/** Lo que quedó guardado en `liquidaciones` en la última escritura. */
function datosGuardados(): Record<string, unknown> {
  const e = escrituras.filter((x) => x.tabla === 'liquidaciones').at(-1)
  const fila = Array.isArray(e?.filas) ? (e?.filas as Record<string, unknown>[])[0] : (e?.filas as Record<string, unknown>)
  return (fila?.datos ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  filasPorTabla = {}
  escrituras.length = 0
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio'
})
afterEach(() => vi.unstubAllGlobals())

describe('crear una campaña con tipo', () => {
  it('guarda el tipo que se pidió y lo devuelve', async () => {
    const res = await llamar({ action: 'crear', campania: { id: 'l1', nombre: 'Ajuste de invierno', tipo: 'ajuste' } })
    expect(res.code).toBe(200)
    expect(datosGuardados().tipo).toBe('ajuste')
    expect((res.body?.campania as { tipo: string }).tipo).toBe('ajuste')
  })

  it('sin tipo nace como liquidación, que es lo que fueron todas hasta ahora', async () => {
    const res = await llamar({ action: 'crear', campania: { id: 'l2', nombre: 'Sale' } })
    expect(res.code).toBe(200)
    expect(datosGuardados().tipo).toBe('liquidacion')
  })

  it('🔴 un tipo inventado se rechaza con 400 y NO se escribe nada', async () => {
    const res = await llamar({ action: 'crear', campania: { id: 'l3', nombre: 'Rara', tipo: 'regalo' } })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('tipo')
    expect(escrituras.filter((e) => e.tabla === 'liquidaciones')).toHaveLength(0)
  })
})

describe('editar el tipo de una campaña', () => {
  const previa = [{ id: 'l1', nombre: 'Sale', estado: 'borrador', datos: { tipo: 'promo', desde: null, hasta: null, nota: 'algo' } }]

  it('cambia el tipo sin tocar lo demás', async () => {
    filasPorTabla = { liquidaciones: previa }
    const res = await llamar({ action: 'renombrar', id: 'l1', tipo: 'ajuste' })
    expect(res.code).toBe(200)
    expect(datosGuardados()).toMatchObject({ tipo: 'ajuste', nota: 'algo' })
  })

  it('🔑 no mandarlo deja el que tenía: editar el nombre no vuelve liquidación a una promo', async () => {
    filasPorTabla = { liquidaciones: previa }
    const res = await llamar({ action: 'renombrar', id: 'l1', nombre: 'Sale corregido' })
    expect(res.code).toBe(200)
    expect(datosGuardados().tipo).toBe('promo')
  })

  it('🔴 y uno inventado tampoco entra por acá', async () => {
    filasPorTabla = { liquidaciones: previa }
    const res = await llamar({ action: 'renombrar', id: 'l1', tipo: 'regalo' })
    expect(res.code).toBe(400)
    expect(escrituras.filter((e) => e.tabla === 'liquidaciones' && e.metodo === 'update')).toHaveLength(0)
  })
})
