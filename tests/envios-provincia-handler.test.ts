import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * 🔴 **Que Envíos le siga mandando la provincia al geocoder** (30-ago-2026).
 *
 * El 30-ago `api/_georef.js` dejó de tener `provincia: 'Santa Fe'` clavada y pasó a exigirla **por
 * pedido**, porque el PRM pregunta por locales de Flores y con la constante puesta una dirección de
 * CABA resolvía en Santa Fe **contestando un punto plausible**. El precio de un envío sale de ese
 * punto.
 *
 * ⚠️ **Ese cambio dejó a Envíos a un `push` de distancia de romperse, y no lo cubría nada**:
 * `tests/envios-sugerir-handler.test.ts` compara TEXTO contra texto y ⛔ no ejerce el camino, y
 * `tests/georef-provincia.test.ts` prueba el geocoder solo. En el medio quedaba justo el renglón
 * donde el handler arma el pedido: si alguien le saca ese campo, georef tira y **«Sugerir precios»
 * deja de andar en producción**, que es plata todos los días.
 *
 * Por eso acá se corre el handler DE VERDAD y se lee **lo que sale hacia el geocoder**, no lo que
 * vuelve: un mock que devuelva coordenadas lindas pasa igual con la provincia mal.
 */

let pedidos: { direcciones: { provincia?: string; localidad?: string; direccion?: string }[] }[]

function fakeSupabase() {
  const desde = (tabla: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      in: () => api,
      eq: () => api,
      order: () => api,
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve(
          tabla === 'envios_reparto'
            ? { data: [{ id: '1', direccion: 'Rodriguez 1062', localidad: 'Rosario', cp: '2000' }], error: null }
            // La zona sólo tiene que existir: sin ninguna, el handler corta antes de geocodificar.
            : { data: [{ id: 'z1', nombre: 'Zona 1', tipo: 'poligono', precio: 4500, prioridad: 1, poligono: [] }], error: null },
        ).then(ok),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => ({ name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }),
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

beforeEach(() => {
  vi.resetModules()
  pedidos = []
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body)
      pedidos.push(body)
      return {
        ok: true,
        json: async () => ({ resultados: body.direcciones.map(() => ({ direcciones: [] })) }),
      }
    }),
  )
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function sugerir() {
  const mod = await import('@/api/_envios.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', headers: {}, query: {}, body: { action: 'zonas-sugerir', ids: ['1'] } },
    res,
  )
  return res
}

describe('🔴 «Sugerir precios» le manda la provincia al geocoder', () => {
  it('la consulta sale con provincia «Santa Fe» — la moto reparte en Rosario', async () => {
    const res = await sugerir()

    // Que haya llegado a preguntar es la mitad del oráculo: sin esto, un handler que corta antes
    // pasaría el test de abajo por vacuidad.
    expect(pedidos.length, `el handler no llegó a consultar el geocoder (HTTP ${res.code}: ${JSON.stringify(res.body)})`).toBeGreaterThan(0)

    const dir = pedidos[0].direcciones[0]
    expect(dir.provincia).toBe('Santa Fe')
    expect(dir.localidad).toBe('Rosario')
    expect(dir.direccion).toContain('Rodriguez 1062')
  })

  it('y el handler contesta 200: sacarle la provincia lo haría explotar', async () => {
    const res = await sugerir()
    expect(res.code).toBe(200)
  })
})
