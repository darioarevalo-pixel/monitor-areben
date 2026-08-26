import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **Las notas del canje** (26-ago-2026).
 *
 * Es la copia del patrón que ya tenía la PERSONA (`persona-nota`), y por eso lo que se prueba acá no
 * es el formato sino las dos decisiones que se pagan si se pierden:
 *
 *  1. 🔴 **Se borra POR ID, nunca por índice.** La pantalla dibuja la lista INVERTIDA, así que el
 *     índice del render no es el de la base: borrar por posición borra la nota equivocada. No es
 *     hipotético — `lib/crm/leads.ts` borra por índice y ya se cobró una.
 *  2. **Se puede escribir sobre un canje TERMINAL.** La nota no es el trato —para eso está
 *     `canje-editar`, que se cierra al acordar— sino lo que se fue sabiendo, y de un canje lo más
 *     útil suele saberse después de cerrarlo. Es la misma excepción que `resultado`.
 *
 * Es comportamiento del handler, no una regla pura: por eso monta un supabase de mentira y llama a
 * `api/_canjes.js`, igual que `tests/canje-drive.test.ts`.
 */

type Mundo = {
  canje: Record<string, unknown>
  updates: Record<string, unknown>[]
}

let mundo: Mundo

function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: { tabla: string; update: Record<string, unknown> | null } = { tabla, update: null }
    const resolver = async () => {
      if (ctx.update) {
        mundo.updates.push(ctx.update)
        // El update se aplica de verdad: sin esto, dos acciones seguidas leerían siempre la lista
        // original y el test no podría ver que la segunda opera sobre el resultado de la primera.
        Object.assign(mundo.canje, ctx.update)
        return { data: null, error: null }
      }
      if (ctx.tabla === 'canjes') return { data: mundo.canje, error: null }
      if (ctx.tabla === 'canje_config') return { data: { factor_costo_estimado: 0.4 }, error: null }
      return { data: [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      is: () => api,
      order: () => api,
      update: (row: Record<string, unknown>) => { ctx.update = row; return api },
      maybeSingle: () => resolver(),
      single: () => resolver(),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => resolver().then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => ({ name: 'Sofi', email: 'sofi@arebensrl.com', admin: true }),
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

async function postear(body: Record<string, unknown>) {
  const mod = await import('@/api/_canjes.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', headers: {}, query: {}, body: { store: 'bdi', id: 12, ...body } },
    res,
  )
  return res
}

type Nota = { id: string; texto: string; at: string; usuario?: string | null }
const notas = (r: ReturnType<typeof resFalso>) => (r.body?.notas || []) as Nota[]

beforeEach(() => {
  vi.resetModules()
  mundo = { canje: { id: 12, store: 'bdi', estado: 'en_curso', notas: [] }, updates: [] }
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('canje-nota — apilar', () => {
  it('guarda el texto, la fecha y quién la escribió, y devuelve la lista entera', async () => {
    const res = await postear({ action: 'canje-nota', texto: '  pidió que llegue antes del viernes  ' })
    expect(res.code).toBe(200)
    const [n] = notas(res)
    expect(n.texto).toBe('pidió que llegue antes del viernes')
    expect(n.usuario).toBe('Sofi')
    expect(n.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // El id propio es la razón de ser del formato: sin él no se puede borrar de a una.
    expect(n.id).toBeTruthy()
  })

  it('apila: la segunda no pisa la primera', async () => {
    await postear({ action: 'canje-nota', texto: 'una' })
    const res = await postear({ action: 'canje-nota', texto: 'dos' })
    expect(notas(res).map((n) => n.texto)).toEqual(['una', 'dos'])
  })

  it('cada nota tiene su PROPIO id', async () => {
    await postear({ action: 'canje-nota', texto: 'una' })
    const res = await postear({ action: 'canje-nota', texto: 'dos' })
    const [a, b] = notas(res)
    expect(a.id).not.toBe(b.id)
  })

  it('una nota vacía no se guarda', async () => {
    const res = await postear({ action: 'canje-nota', texto: '   ' })
    expect(res.code).toBe(400)
    expect(mundo.updates).toHaveLength(0)
  })

  it('se puede escribir sobre un canje CERRADO', async () => {
    // Es la excepción a propósito: de un canje lo más útil suele saberse después de cerrarlo, y
    // `canje-editar` —que sí se cierra— no es de donde cuelga esto.
    mundo.canje.estado = 'cerrado'
    const res = await postear({ action: 'canje-nota', texto: 'terminó comprando dos veces' })
    expect(res.code).toBe(200)
    expect(notas(res)).toHaveLength(1)
  })
})

describe('canje-nota-borrar — 🔴 por ID, nunca por índice', () => {
  it('borra la que se pidió aunque no sea la que está en esa posición', async () => {
    // EL caso: la pantalla dibuja `[...notas].reverse()`, así que la primera de la lista de arriba
    // es la ÚLTIMA del array. Un borrado por índice se llevaría la otra.
    await postear({ action: 'canje-nota', texto: 'la vieja' })
    const dos = await postear({ action: 'canje-nota', texto: 'la nueva' })
    const laNueva = notas(dos)[1]

    const res = await postear({ action: 'canje-nota-borrar', nota_id: laNueva.id })
    expect(res.code).toBe(200)
    expect(notas(res).map((n) => n.texto)).toEqual(['la vieja'])
  })

  it('un id que ya no está contesta 404 y no toca nada', async () => {
    // Dos personas mirando la misma ficha: la segunda no puede borrar "la que quedó en ese lugar".
    await postear({ action: 'canje-nota', texto: 'la única' })
    mundo.updates.length = 0
    const res = await postear({ action: 'canje-nota-borrar', nota_id: 'una-que-ya-no-existe' })
    expect(res.code).toBe(404)
    expect(mundo.updates).toHaveLength(0)
  })

  it('sin `nota_id` no borra nada', async () => {
    await postear({ action: 'canje-nota', texto: 'la única' })
    mundo.updates.length = 0
    const res = await postear({ action: 'canje-nota-borrar', nota_id: '' })
    expect(res.code).toBe(400)
    expect(mundo.updates).toHaveLength(0)
  })
})
