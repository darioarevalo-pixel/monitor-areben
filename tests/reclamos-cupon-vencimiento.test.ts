import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { leerVencimiento, vencimientoEnCriollo, ANIOS_ABSURDOS } from '@/lib/reclamos/cupon.core.js'
import { mensajeCuponListo } from '@/lib/reclamos/mensajes'
import { resumenDeLoDecidido, type ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **El cupón, con vencimiento** (30-ago-2026, §1.2 del plan de post-venta).
 *
 * `cupon-emitido` exigía el **código** desde el 25-ago —lo único que prueba que el cupón existe en
 * la tienda— y nada más. Así que el módulo prometía *«te dejamos un cupón»* sin saber **hasta
 * cuándo**, y el que se enteraba de que había vencido era el cliente, en la caja.
 *
 * 🔑 **Y hay una razón más grande que la cortesía**: el cupón se elige sobre la plata porque ⛔ no
 * hay salida de caja, se gasta a precio de lista y una parte ⛔ no se usa nunca — el *breakage*.
 * **Sin vencimiento ⛔ no hay breakage**: un cupón sin fecha y sin usar ⛔ no está perdido, está
 * pendiente para siempre, y la cuenta ⛔ no cierra nunca.
 *
 * ▶️ Cuánto **debe** durar sigue siendo de Bruno (B6): acá ⛔ no hay ningún default, y eso también
 * se fija abajo.
 */

const HOY = new Date('2026-08-30T12:00:00')

describe('leer el vencimiento', () => {
  it('en criollo (dd/mm/aaaa), que es como se escribe acá', () => {
    expect(leerVencimiento('30/09/2026', HOY)).toEqual({ ok: true, fecha: '2026-09-30' })
    expect(leerVencimiento('5/9/2026', HOY)).toEqual({ ok: true, fecha: '2026-09-05' })
  })

  it('y en ISO, que es lo que sale de un input date y de la propia base', () => {
    expect(leerVencimiento('2026-09-30', HOY)).toEqual({ ok: true, fecha: '2026-09-30' })
  })

  it('hoy mismo vale: el cupón se puede usar el último día', () => {
    expect(leerVencimiento('30/08/2026', HOY)).toEqual({ ok: true, fecha: '2026-08-30' })
  })

  /**
   * 🔴 **Vacío ⛔ no pasa, y ése es el cambio entero**: hasta hoy no había fecha y el cupón se
   * emitía igual.
   */
  it('🔴 vacío ⛔ NO pasa, y el error dice qué se rompe', () => {
    const r = leerVencimiento('', HOY)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('Sin fecha')
    expect(leerVencimiento(null, HOY).ok).toBe(false)
    expect(leerVencimiento(undefined, HOY).ok).toBe(false)
  })

  /**
   * 🔴 **Una fecha ya pasada ⛔ no es un problema de formato**: emitir un cupón vencido es mandarle
   * al cliente un código que ⛔ no anda, con un mensaje que dice que sí. Es el defecto del código
   * inventado, un paso más adelante.
   */
  it('🔴 una fecha que ya pasó ⛔ NO pasa', () => {
    const r = leerVencimiento('29/08/2026', HOY)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('ya pasó')
  })

  it('un día que ⛔ no existe tampoco — y el round-trip es el que lo caza', () => {
    // `new Date('2026-02-31')` ⛔ no explota: se acomoda solo al 3 de marzo.
    expect(leerVencimiento('31/02/2027', HOY).ok).toBe(false)
    expect(leerVencimiento('30/13/2026', HOY).ok).toBe(false)
  })

  it('lo que ⛔ no es una fecha, tampoco', () => {
    expect(leerVencimiento('el mes que viene', HOY).ok).toBe(false)
    expect(leerVencimiento('30-09', HOY).ok).toBe(false)
  })

  /** ⚠️ Guard de TIPEO, ⛔ no política: un año mal tecleado promete décadas. */
  it(`un año a más de ${ANIOS_ABSURDOS} años se lee como un error de tipeo`, () => {
    const r = leerVencimiento('30/09/2062', HOY)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('tipeado')
    // Y justo adentro del tope sí pasa: el guard ⛔ no está poniendo un plazo.
    expect(leerVencimiento(`30/09/${2026 + ANIOS_ABSURDOS}`, HOY).ok).toBe(true)
  })

  /**
   * 🔴 **⛔ No hay plazo por default, y es a propósito**: cuánto dura un cupón es B6, de Bruno.
   * Un default acá sería inventar política, y encima una que después nadie sabría que existe.
   */
  it('🔴 el núcleo ⛔ NO propone ningún plazo', () => {
    const fuente = String(leerVencimiento)
    expect(/(90|60|30|365)\s*\*/.test(fuente)).toBe(false)
    expect(leerVencimiento('', HOY).ok).toBe(false) // no rellena: falla
  })

  it('y lo muestra como se lee acá', () => {
    expect(vencimientoEnCriollo('2026-09-30')).toBe('30/09/2026')
    expect(vencimientoEnCriollo('')).toBe('')
  })
})

/**
 * **Lo que llega al cliente**, que es donde la fecha importa de verdad: un cupón sin plazo se
 * guarda para «alguna vez», y ese «alguna vez» es la discusión en la caja.
 */
describe('el mensaje del cupón', () => {
  const base = { cliente: 'Lorena', cupon_codigo: 'ABC123', cupon_vence: '2026-09-30' } as ReclamoRow

  it('🔴 dice hasta cuándo', () => {
    const t = mensajeCuponListo(base, 'R-0022')
    expect(t).toContain('ABC123')
    expect(t).toContain('hasta el 30/09/2026')
  })

  /** ⚠️ Las filas anteriores al 30-ago ⛔ no tienen fecha: el mensaje **calla**, ⛔ no inventa. */
  it('⚠️ sin fecha CALLA, ⛔ no inventa un plazo', () => {
    const t = mensajeCuponListo({ ...base, cupon_vence: null } as ReclamoRow, 'R-0022')
    expect(t).toContain('ABC123')
    expect(t).not.toContain('hasta el')
    expect(t).not.toContain('undefined')
  })
})

/** El resumen que lee Administración: el código y la fecha van juntos o la pregunta vuelve. */
describe('el resumen de lo decidido', () => {
  const base = {
    motivo: 'falla', compensacion: 'cupon', cupon_codigo: 'ABC123', cupon_vence: '2026-09-30',
    items: [], estado: 'resuelto',
  } as unknown as ReclamoRow

  it('muestra el cupón con su vencimiento', () => {
    const linea = resumenDeLoDecidido(base, 'admin').find((l) => l.que === 'Cupón')
    expect(linea?.valor).toBe('ABC123 · hasta el 30/09/2026')
  })

  it('y sin fecha muestra sólo el código', () => {
    const linea = resumenDeLoDecidido({ ...base, cupon_vence: null } as ReclamoRow, 'admin').find((l) => l.que === 'Cupón')
    expect(linea?.valor).toBe('ABC123')
  })
})

// ── El cable: el handler de verdad ─────────────────────────────────────────────

const mundo = { fila: {} as Record<string, unknown>, escrito: null as Record<string, unknown> | null }

function fakeSupabase() {
  const desde = () => {
    const api: Record<string, unknown> = {
      select: () => api,
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
    method: 'POST', headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'y' }) }, query: {},
    body: { store: 'bdi', id: 22, ...body },
  }, res)
  return res
}

describe('el handler: sellar el cupón', () => {
  beforeEach(() => {
    mundo.fila = { id: 22, estado: 'resuelto', compensacion: 'cupon', cupon_estado: 'pendiente', historial: [] }
    mundo.escrito = null
    vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
    vi.stubEnv('SUPABASE_KEY', 'llave-de-mentira')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('🔴 sin vencimiento ⛔ NO sella, aunque el código esté', async () => {
    const res = await postear({ action: 'cupon-emitido', cupon_codigo: 'ABC123' })
    expect(res.code).toBe(400)
    expect(mundo.escrito).toBeNull()
  })

  it('sin código tampoco, como antes', async () => {
    const res = await postear({ action: 'cupon-emitido', cupon_vence: '30/09/2026' })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('código')
    expect(mundo.escrito).toBeNull()
  })

  it('🔴 con una fecha ya pasada tampoco: sería sellar un cupón muerto', async () => {
    const res = await postear({ action: 'cupon-emitido', cupon_codigo: 'ABC123', cupon_vence: '01/01/2020' })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('ya pasó')
    expect(mundo.escrito).toBeNull()
  })

  it('con los dos, sella — y guarda la fecha NORMALIZADA, ⛔ no lo que se tipeó', async () => {
    const res = await postear({ action: 'cupon-emitido', cupon_codigo: 'ABC123', cupon_vence: '30/09/2026' })
    expect(res.code).toBe(200)
    expect(mundo.escrito?.cupon_codigo).toBe('ABC123')
    expect(mundo.escrito?.cupon_vence).toBe('2026-09-30')
    expect(mundo.escrito?.cupon_estado).toBe('hecho')
  })

  it('y el historial deja las dos cosas, que es lo que se lee después', async () => {
    await postear({ action: 'cupon-emitido', cupon_codigo: 'ABC123', cupon_vence: '2026-09-30' })
    const evento = (mundo.escrito?.historial as { nota: string }[]).at(-1)
    expect(evento?.nota).toContain('ABC123')
    expect(evento?.nota).toContain('2026-09-30')
  })

  /**
   * 🔴 **Y la columna tiene que viajar en el listado**, o la pantalla y el mensaje leen `undefined`
   * sobre un cupón que sí tiene fecha: el mismo modo de falla que `COLS_AVISO`.
   */
  it('🔴 `cupon_vence` está en el `select` del listado', async () => {
    const { readFileSync } = await import('node:fs')
    const fuente = readFileSync(new URL('../api/_reclamos.js', import.meta.url), 'utf8')
    const cols = fuente.split('const COLS = `')[1].split('`')[0]
    expect(cols).toContain('cupon_vence')
  })
})
