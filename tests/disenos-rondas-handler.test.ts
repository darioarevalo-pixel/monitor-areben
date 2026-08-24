import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El handler de rondas, ejercido de verdad — no su aritmética, que ya está en
 * `disenos-votacion.test.ts`, sino **lo que sale por el cable**.
 *
 * Existe por un número: el snapshot de una ronda congela la `url` de cada diseño, y los viejos la
 * tienen en base64. Medido el 24-ago-2026 sobre «Ingreso BDI Diciembre» (34 diseños, 9 con la foto
 * embebida): la misma ronda pesa **1.855 bytes** por `vista=resumen` y **279.760** por
 * `vista=resultados`. Como el ★ de cada tarjeta se pide **al entrar a la sección**, la diferencia no
 * es una optimización: es lo que decide si el ★ puede estar siempre a la vista o queda atrás de dos
 * clics, que es donde estaba y por lo que 10 votos no llegaron a ser una decisión.
 *
 * Los tests de `paraElVotante` prueban lo mismo un escalón más abajo. Éste prueba el escalón que
 * ninguno de los dos cubre: que el handler no vuelva a meter el snapshot en la respuesta.
 */

const FOTO_PESADA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD' + 'A'.repeat(500)

const RONDA = {
  id: 'r1',
  store: 'bdi',
  titulo: 'Ingreso BDI Diciembre',
  token_vence: '2026-09-20T00:00:00Z',
  cerrada_at: null,
  creada_por: 'Bruno',
  created_at: '2026-08-21T00:00:00Z',
  disenos: [
    { id: 'd1', name: 'Cerezas', url: FOTO_PESADA },
    { id: 'd2', name: 'Mariposa', url: 'https://blob.vercel-storage.com/disenos/x.jpg' },
    { id: 'd3', name: 'Nadie me votó', url: FOTO_PESADA },
  ],
}
const VOTOS = [
  { nombre: 'Sofia', puntajes: { d1: 5, d2: 3 } },
  { nombre: 'Pipi', puntajes: { d1: 4, d2: 2 } },
]

/** Un cliente de Supabase de mentira que devuelve lo de arriba y anota qué columnas le pidieron. */
const pedidos: string[] = []
function tabla(nombre: string) {
  const q: Record<string, unknown> = {}
  const self = {
    select(cols: string) {
      pedidos.push(`${nombre}:${cols}`)
      q.cols = cols
      return self
    },
    eq() { return self },
    in() { return self },
    order() { return self },
    limit() { return self },
    maybeSingle: async () => ({ data: nombre === 'disenos_rondas' ? RONDA : null, error: null }),
    then(resolver: (v: { data: unknown; error: null }) => unknown) {
      return Promise.resolve(resolver({ data: nombre === 'disenos_rondas' ? [RONDA] : VOTOS, error: null }))
    },
  }
  return self
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => tabla(t) }) }))
vi.mock('../api/_auth.js', () => ({
  exigirUsuario: async () => ({ name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }),
}))

function resFalso() {
  const r = {
    code: 0,
    body: null as Record<string, unknown> | null,
    setHeader() { return r },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

beforeEach(() => {
  pedidos.length = 0
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
})
afterEach(() => vi.unstubAllGlobals())

async function pegar(query: Record<string, string>) {
  const { default: handler } = await import('../api/_disenos-rondas.js')
  const res = resFalso()
  await handler({ method: 'GET', headers: {}, query: { store: 'bdi', ...query }, body: {} }, res)
  return res
}

describe('vista=resumen — el ★ de cada tarjeta', () => {
  it('🔴 NO manda una sola foto: ni la data URL ni la del Blob', async () => {
    const res = await pegar({ vista: 'resumen' })
    expect(res.code).toBe(200)
    const crudo = JSON.stringify(res.body)
    expect(crudo).not.toContain('data:')
    expect(crudo).not.toContain('base64')
    expect(crudo).not.toContain('blob.vercel-storage.com')
    // Con tres diseños y dos boletas, el cuerpo entero tiene que caber en menos de lo que ocupa
    // UNA de las fotos. Es el invariante que hace que pedir esto al entrar sea gratis.
    expect(crudo.length).toBeLessThan(FOTO_PESADA.length)
  })

  it('devuelve los puntajes por id y la cabecera con nDisenos', async () => {
    const res = await pegar({ vista: 'resumen' })
    expect(res.body!.puntajes).toEqual({
      d1: { n: 2, promedio: 4.5 },
      d2: { n: 2, promedio: 2.5 },
      d3: { n: 0, promedio: null },
    })
    expect(res.body!.ronda).toMatchObject({ id: 'r1', titulo: 'Ingreso BDI Diciembre', nDisenos: 3 })
    expect(res.body!.votantes).toBe(2)
    // El promedio de la ronda entera: (5+3+4+2)/4.
    expect(res.body!.general).toBe(3.5)
  })

  it('el nombre del diseño tampoco sale: el ★ se pinta contra el tablero, no contra el snapshot', async () => {
    expect(JSON.stringify((await pegar({ vista: 'resumen' })).body)).not.toContain('Cerezas')
  })
})

describe('el listado de rondas', () => {
  it('🔴 no pide `disenos` para devolverlo: manda nDisenos y ninguna foto', async () => {
    const res = await pegar({})
    const rondas = res.body!.rondas as Record<string, unknown>[]
    expect(rondas[0].nDisenos).toBe(3)
    expect(rondas[0]).not.toHaveProperty('disenos')
    expect(JSON.stringify(res.body)).not.toContain('base64')
  })

  it('⛔ el `token` no viaja en ninguna de las dos vistas', async () => {
    // Es la llave del portal público: quien la tenga puede votar en nombre de cualquiera.
    for (const q of [{}, { vista: 'resumen' }] as Record<string, string>[]) {
      expect(JSON.stringify((await pegar(q)).body)).not.toContain('"token"')
      // La columna PELADA. ⚠️ `token_vence` sí sale y tiene que salir: es la fecha de vencimiento,
      // no la llave. Buscar el substring "token" acá daría un verde que no significa nada.
      for (const p of pedidos) expect(p.split(':')[1].split(',').map((c) => c.trim())).not.toContain('token')
    }
  })
})
