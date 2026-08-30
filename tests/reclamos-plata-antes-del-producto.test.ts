import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { COLUMNAS_PARA_DEVOLVER, faltaRecibirAntesDeDevolver } from '@/lib/reclamos/efectos.core.js'
import { alertasDe, type ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **La plata ⛔ no sale hasta que el producto vuelva** (30-ago-2026, §1.1 del plan de post-venta).
 *
 * 🔴 `reintegro` era **el único verbo que mueve plata sin leer la fila**: escribía a ciegas, así
 * que se podía devolver la plata de un reclamo `en_transito` con el producto en la calle. Y era
 * peor que un descuido: tildarlo pone `reintegro_estado` en `'hecho'`, que es justo lo que **apaga**
 * el aviso «hace N días que la plata no sale» ⇒ el caso quedaba **mudo**, con la plata afuera, el
 * producto afuera y ni un reloj corriendo.
 *
 * Acá se fijan las cuatro puntas, porque este módulo ya se rompió cuatro veces con la regla en
 * verde: **la regla**, **el handler de verdad**, **las dos listas de columnas** que le dan de comer
 * (la del freno y la del aviso) y **el reloj** que queda corriendo cuando la plata sale igual.
 */

const CAMPERA = { sku: 'A1', producto: 'Campera', cantidad: 1, precio: '90000.00' }
const BUZO = { sku: 'B2', producto: 'Buzo', cantidad: 1, precio: '50000.00' }

describe('la regla: qué falta llegar antes de devolver la plata', () => {
  it('🔴 con el producto todavía en la calle, frena y NOMBRA cuál falta', () => {
    const traba = faltaRecibirAntesDeDevolver({
      motivo: 'falla', destino_prenda: 'stock', retorno_decidido: true, items: [CAMPERA],
    })
    expect(traba).toContain('Campera')
    expect(traba).toContain('vuelva al depósito')
  })

  it('con el producto ya recibido, la plata sale', () => {
    expect(faltaRecibirAntesDeDevolver({
      motivo: 'falla', destino_prenda: 'stock', retorno_decidido: true,
      items: [{ ...CAMPERA, recibida_at: '2026-08-29T10:00:00Z' }],
    })).toBeNull()
  })

  /**
   * 🔑 **Vacío ⛔ no es "falta todo": es que ⛔ no se espera nada.** Una unidad regalada, o una
   * fallada que el cliente se queda, ⛔ no vuelve nunca ⇒ esperar a que llegue dejaría esa plata
   * trabada para siempre. El cero de `loQueFaltaLlegar` acá **afirma**, y afirma bien.
   */
  it('🔑 si nada tiene que volver, ⛔ no frena nada', () => {
    expect(faltaRecibirAntesDeDevolver({
      motivo: 'falla', destino_prenda: 'regalada', retorno_decidido: false, items: [CAMPERA],
    })).toBeNull()
    // La fallada que se queda: `falla` sin retorno pedido tampoco vuelve.
    expect(faltaRecibirAntesDeDevolver({
      motivo: 'falla', destino_prenda: 'falla', retorno_decidido: false, items: [CAMPERA],
    })).toBeNull()
  })

  /**
   * 🔴 **Tres de los diez reclamos de BDI tienen dos productos.** Con uno recibido y el otro no,
   * "llegó" es falso, y la plata sale entera: mirar el estado del reclamo —que es uno solo— ⛔ no
   * alcanza. Por eso la regla pregunta **por unidad** (`recibida_at`).
   */
  it('🔴 con dos productos y uno solo recibido, sigue frenando — y nombra SÓLO el que falta', () => {
    const traba = faltaRecibirAntesDeDevolver({
      motivo: 'falla', destino_prenda: 'stock', retorno_decidido: true,
      items: [{ ...CAMPERA, recibida_at: '2026-08-29T10:00:00Z' }, BUZO],
    })
    expect(traba).toContain('Buzo')
    expect(traba).not.toContain('Campera')
  })

  /**
   * 🔴 **En un `mal_armado` lo que vuelve es `items_correctos`** —lo que se le mandó POR ERROR—, y
   * ⛔ no lo que compró, que nunca salió del depósito. Mirar `items` acá es mirar la lista que no es.
   */
  it('🔴 en un `mal_armado` mira lo que llegó POR ERROR, ⛔ no lo que compró', () => {
    const fila = {
      motivo: 'mal_armado' as const, destino_prenda: 'stock' as const, retorno_decidido: true,
      items: [{ ...CAMPERA, recibida_at: null }],
      items_correctos: [BUZO],
    }
    expect(faltaRecibirAntesDeDevolver(fila)).toContain('Buzo')
    expect(faltaRecibirAntesDeDevolver({ ...fila, items_correctos: [{ ...BUZO, recibida_at: 'x' }] })).toBeNull()
  })

  /** **Ausente = el destino del reclamo**, que es el default explícito del módulo. */
  it('una unidad sin destino propio hereda el del reclamo', () => {
    expect(faltaRecibirAntesDeDevolver({
      motivo: 'falla', destino_prenda: 'stock', retorno_decidido: false, items: [CAMPERA],
    })).toContain('Campera')
  })
})

/**
 * **El reloj que el reintegro apagaba.**
 *
 * Con la salida explicada esto pasa **a propósito**, y por eso hace falta: una excepción sin reloj
 * es una excepción que nadie vuelve a mirar.
 */
describe('el reloj: la plata salió y el producto todavía no volvió', () => {
  const HOY = Date.parse('2026-08-30T12:00:00Z')
  const base = {
    id: 22, estado: 'resuelto', motivo: 'falla', compensacion: 'reembolso',
    destino_prenda: 'stock', retorno_decidido: true, items: [CAMPERA],
    reintegro_estado: 'hecho', reintegro_at: '2026-08-26T12:00:00Z',
    historial: [], created_at: '2026-08-20T12:00:00Z', updated_at: '2026-08-30T11:00:00Z',
  } as unknown as ReclamoRow

  it('🔴 avisa, en rojo, y cuenta desde que la plata salió', () => {
    const a = alertasDe(base, HOY).find((x) => x.texto.includes('todavía no volvió'))
    expect(a?.tono).toBe('danger')
    expect(a?.texto).toContain('hace 4 días')
  })

  /**
   * ⚠️ **Y ⛔ no desde `updated_at`.** Es la misma lección que ya tuvo la alerta de tránsito: tocar
   * el reclamo mientras se espera el producto ⛔ no puede reiniciar la espera. Acá el toque más
   * probable —ir a ver por qué no llega— pondría el contador en cero.
   */
  it('🔴 tocar el reclamo ⛔ no reinicia el reloj', () => {
    const tocado = { ...base, updated_at: '2026-08-30T11:59:00Z' } as ReclamoRow
    expect(alertasDe(tocado, HOY).find((x) => x.texto.includes('todavía no volvió'))?.dias).toBe(4)
  })

  it('cuando el producto llegó, ⛔ no avisa nada', () => {
    const llego = { ...base, items: [{ ...CAMPERA, recibida_at: '2026-08-29T10:00:00Z' }] } as unknown as ReclamoRow
    expect(alertasDe(llego, HOY).some((x) => x.texto.includes('todavía no volvió'))).toBe(false)
  })

  it('y con la plata todavía sin salir tampoco: ése es el OTRO reloj', () => {
    // `updated_at` viejo: el otro reloj cuenta desde el último toque y pide 5 días.
    const pendiente = {
      ...base, reintegro_estado: 'pendiente', reintegro_at: null, updated_at: '2026-08-20T12:00:00Z',
    } as unknown as ReclamoRow
    const textos = alertasDe(pendiente, HOY).map((x) => x.texto)
    expect(textos.some((t) => t.includes('todavía no volvió'))).toBe(false)
    expect(textos.some((t) => t.includes('la plata no sale'))).toBe(true)
  })

  /** Las filas viejas ⛔ no tienen `reintegro_at`: avisan igual, y ⛔ sin inventar una espera. */
  it('sin `reintegro_at` avisa igual, y ⛔ no dice "hace 0 días"', () => {
    const vieja = { ...base, reintegro_at: null } as unknown as ReclamoRow
    const a = alertasDe(vieja, HOY).find((x) => x.texto.includes('todavía no volvió'))
    expect(a).toBeTruthy()
    expect(a?.texto).not.toContain('0 días')
  })
})

// ── El cable: el handler de verdad ─────────────────────────────────────────────
//
// 🔴 **La regla en verde ⛔ no alcanza, y en este módulo está medido**: el 25-ago el botón de
// despachar no existía con los tests de la regla verdes, el 28-ago el `estado: 'cerrado'` pasaba
// igual, y el 29-ago un `select` de menos habría dejado un freno mirando `undefined`. Acá corre
// `api/_reclamos.js` de verdad, con el Supabase de mentira contestando la fila.

const mundo = {
  fila: {} as Record<string, unknown>,
  escrito: null as Record<string, unknown> | null,
  pedido: [] as string[],
}

function fakeSupabase() {
  const desde = () => {
    const api: Record<string, unknown> = {
      select: (cols: string) => { mundo.pedido.push(cols); return api },
      eq: () => api,
      update: (row: Record<string, unknown>) => { mundo.escrito = row; return api },
      insert: () => api,
      maybeSingle: async () => ({ data: mundo.fila, error: null }),
      single: async () => ({ data: mundo.fila, error: null }),
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
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() { /* no importa acá */ },
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
    method: 'POST',
    headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'y' }) },
    query: {},
    body: { store: 'bdi', id: 22, ...body },
  }, res)
  return res
}

/** Un reembolso decidido, con el producto pedido de vuelta y todavía sin llegar. */
const EN_LA_CALLE = {
  id: 22, estado: 'en_transito', motivo: 'falla', compensacion: 'reembolso',
  destino_prenda: 'stock', retorno_decidido: true, items: [CAMPERA], items_correctos: null,
  reintegro_estado: 'pendiente', historial: [],
}

describe('el handler: devolver la plata', () => {
  beforeEach(() => {
    mundo.fila = { ...EN_LA_CALLE }
    mundo.escrito = null
    mundo.pedido = []
    vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
    vi.stubEnv('SUPABASE_KEY', 'llave-de-mentira')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('🔴 con el producto sin llegar contesta 409 y ⛔ NO escribe nada', async () => {
    const res = await postear({ action: 'reintegro' })
    expect(res.code).toBe(409)
    expect(String(res.body?.error)).toContain('Campera')
    expect(mundo.escrito).toBeNull()
  })

  /**
   * 🔑 **La salida explicada ⛔ no es un agujero: es lo que evita que la plata salga POR AFUERA.**
   * Sin ella, el día que haya que pagar antes alguien transfiere y en el sistema ⛔ no queda nada.
   */
  it('🔑 con un motivo escrito sale igual, y el historial dice que salió ANTES y por qué', async () => {
    const res = await postear({ action: 'reintegro', motivo: 'lo amenazó con Defensa del Consumidor' })
    expect(res.code).toBe(200)
    expect(mundo.escrito?.reintegro_estado).toBe('hecho')
    const evento = (mundo.escrito?.historial as { nota: string }[]).at(-1)
    expect(evento?.nota).toContain('ANTES')
    expect(evento?.nota).toContain('Defensa del Consumidor')
  })

  it('con el producto ya recibido sale sin motivo, y la nota ⛔ no dice nada raro', async () => {
    mundo.fila = { ...EN_LA_CALLE, items: [{ ...CAMPERA, recibida_at: '2026-08-29T10:00:00Z' }] }
    const res = await postear({ action: 'reintegro' })
    expect(res.code).toBe(200)
    const evento = (mundo.escrito?.historial as { nota: string }[]).at(-1)
    expect(evento?.nota).toBe('plata devuelta')
  })

  it('sobre un reclamo que no existe, 404 — ⛔ no un 409 que confunda', async () => {
    mundo.fila = null as unknown as Record<string, unknown>
    const res = await postear({ action: 'reintegro' })
    expect(res.code).toBe(404)
    expect(mundo.escrito).toBeNull()
  })
})

/**
 * **Las dos listas de columnas, atadas a las dos reglas que les dan de comer.**
 *
 * 🔴 Es el modo de falla que este módulo ya conoce: un `select` escrito a mano al lado de una regla
 * que vive en otro archivo. Si la regla mira una columna que el `select` ⛔ no trae, la ve
 * `undefined` y **deja pasar justo lo que vino a frenar** — o, del lado del aviso, **nace muerto**.
 *
 * 🔑 **Y el oráculo ⛔ no puede ser el Supabase de mentira**: devuelve la fila entera pase lo que
 * pase, así que sacar una columna del `select` ⛔ no pone nada en rojo. El oráculo es *recortar la
 * fila al select ⛔ no cambia la respuesta*.
 */
describe('las columnas que le dan de comer a cada regla', () => {
  const recortar = (fila: Record<string, unknown>, cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, fila[c]]))

  it('🔴 recortar la fila a COLUMNAS_PARA_DEVOLVER ⛔ no cambia el freno', () => {
    const entera = {
      motivo: 'mal_armado', destino_prenda: 'stock', retorno_decidido: true,
      items: [{ ...CAMPERA, recibida_at: 'ya' }], items_correctos: [BUZO],
      // Ruido que el select ⛔ no trae: nada de esto puede cambiar la respuesta.
      cliente: 'Lorena', relato_cliente: 'x', token: 'secreto', historial: [], costo_caso: 12000,
      estado: 'en_transito', compensacion: 'reembolso', monto_total: 90000,
    }
    const traba = faltaRecibirAntesDeDevolver(entera)
    expect(traba).toContain('Buzo')
    expect(faltaRecibirAntesDeDevolver(recortar(entera, COLUMNAS_PARA_DEVOLVER))).toBe(traba)
  })

  it('y el handler lee con esa lista, ⛔ no con un select escrito a mano', () => {
    const fuente = readFileSync(new URL('../api/_reclamos.js', import.meta.url), 'utf8')
    expect(fuente).toContain('COLUMNAS_PARA_DEVOLVER.join(')
  })

  /**
   * 🔴 **La otra punta, la que casi se rompe hoy**: el aviso del sidebar baja por `COLS_AVISO`, y
   * el reloj nuevo pregunta por `items` — que ⛔ no estaba. El aviso habría nacido mudo.
   */
  it('🔴 recortar la fila a COLS_AVISO ⛔ no cambia las alertas', async () => {
    const { COLS_AVISO } = await import('../api/_reclamos.js')
    const cols = String(COLS_AVISO).split(',').map((c) => c.trim())
    const HOY = Date.parse('2026-08-30T12:00:00Z')
    const entera = {
      id: 22, estado: 'resuelto', motivo: 'falla', compensacion: 'reembolso',
      destino_prenda: 'stock', retorno_decidido: true, items: [CAMPERA], items_correctos: null,
      reintegro_estado: 'hecho', reintegro_at: '2026-08-26T12:00:00Z',
      historial: [], created_at: '2026-08-15T12:00:00Z', updated_at: '2026-08-20T12:00:00Z',
      // Lo que el aviso ⛔ no baja.
      cliente: 'Lorena', relato_cliente: 'x', monto_total: 90000, costo_caso: 12000,
    } as unknown as ReclamoRow
    const enteras = alertasDe(entera, HOY)
    expect(enteras.length).toBeGreaterThan(0)
    expect(alertasDe(recortar(entera as unknown as Record<string, unknown>, cols) as unknown as ReclamoRow, HOY)).toEqual(enteras)
  })
})
