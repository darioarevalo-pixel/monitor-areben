import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CAMPO,
  DESTINO_PREGUNTA,
  fechaDelHecho,
  preguntaDeItem,
  preguntaDeOc,
  TOPE_PREGUNTAS_DIARIAS,
} from '@/lib/agenda/pregunta-ingreso.core.js'

/**
 * **La pregunta de la puerta** — lo que pasa en la Agenda cuando Ingresos confirma una OC.
 *
 * El disparador del ingreso exige la puerta de entrada y sin ella contesta 400, porque dos de sus
 * seis renglones cambian de dueña con ella. El webhook `oc.confirmada` trae el hecho **sin** la
 * puerta. Este archivo prueba las cuatro cosas que se rompen callado:
 *
 *  1. **El freno del backfill.** Las 79 OCs del historial entraron en trece minutos; sin freno,
 *     conectar esto abre 79 preguntas viejas de una vez. El caso que distingue el freno de un
 *     `< hoy` pelado es **el de AYER**, que SÍ tiene que preguntar.
 *  2. **De qué fecha cuelga.** `confirmada_at` vino en 79 de 79; `fecha_ingreso` en 17, y
 *     `recibido_en` lo pone en hoy un backfill, o sea que desarma el freno de arriba.
 *  3. **Que contestar no sea «sembrá lo que quieras».** El nombre, la fecha y la marca salen de la
 *     fila y ⛔ nunca del body: si viajaran desde la pantalla, el gesto de un click sería un
 *     segundo endpoint de siembra libre con otro nombre.
 *  4. **Que la pregunta se TILDE y no se borre**, o Cumplimiento contaría una ocurrencia que
 *     desapareció.
 */

const oc = (over: Record<string, unknown> = {}) => ({
  id: 'zattia:412',
  store: 'zattia',
  oc_label: 'OC-0412',
  oc_id: 412,
  proveedor_nombre: 'RHOVE',
  confirmada_at: '2026-08-26T16:41:00.000Z',
  fecha_ingreso: null,
  recibido_en: '2026-08-27T14:00:00.000Z',
  ...over,
})

/** Mediodía del 26-ago, para que «hoy» sea el día de la confirmación. */
const AHORA = Date.parse('2026-08-26T15:00:00.000Z')

/**
 * La fila de la pregunta, tipada. El núcleo es `.js` —lo importan dos handlers que corren en Node
 * sin compilador— así que su unión `{ok,fila} | {no}` no llega tipada acá.
 *
 * ⚠️ Afirma `ok` de paso: sin eso, un caso que empezara a devolver `{no}` daría `undefined` en
 * todas las expectativas de abajo y ⛔ no un rojo que se entienda.
 */
function filaDe(r: { ok?: boolean; no?: string; fila?: Record<string, unknown> }): Record<string, unknown> {
  expect(r.no).toBeUndefined()
  expect(r.fila).toBeTruthy()
  return r.fila as Record<string, unknown>
}

describe('preguntaDeOc — cuándo se abre la pregunta', () => {
  it('abre UNA pregunta con la fecha del hecho, la marca de la OC y el proveedor en el título', () => {
    const r = preguntaDeOc(oc(), { ahora: AHORA })
    expect(r.ok).toBe(true)
    expect(filaDe(r).titulo).toBe('¿Por qué puerta entró OC-0412 (RHOVE)?')
    expect(filaDe(r).regla).toEqual({ tipo: 'unica', fecha: '2026-08-26' })
    expect(filaDe(r).marcas).toEqual(['zattia'])
    expect(filaDe(r).clase).toBe('pendiente')
  })

  it('ARRASTRA: un ingreso que nadie miró ese día es justo el que esto viene a no perder', () => {
    expect(filaDe(preguntaDeOc(oc(), { ahora: AHORA })).arrastra).toBe(true)
  })

  it('va a Administración por ROL y ⛔ no a una persona nombrada', () => {
    expect(filaDe(preguntaDeOc(oc(), { ahora: AHORA })).destino).toEqual(DESTINO_PREGUNTA)
    expect(DESTINO_PREGUNTA).toEqual({ tipo: 'roles', roles: ['administracion'] })
  })

  it('guarda lo que hace falta para sembrar después, y ⛔ no sólo una bandera', () => {
    const p = filaDe(preguntaDeOc(oc(), { ahora: AHORA }))[CAMPO]
    expect(p).toEqual({ oc: 'zattia:412', nombre: 'OC-0412', fecha: '2026-08-26', marca: 'zattia', proveedor: 'RHOVE' })
  })

  it('sin proveedor el título no queda con un paréntesis vacío', () => {
    expect(filaDe(preguntaDeOc(oc({ proveedor_nombre: '' }), { ahora: AHORA })).titulo)
      .toBe('¿Por qué puerta entró OC-0412?')
  })

  // ─── El freno del backfill ─────────────────────────────────────────────────────────────────
  it('🔴 ⛔ NO pregunta por una OC vieja: las 79 del backfill no abren 79 preguntas', () => {
    const r = preguntaDeOc(oc({ confirmada_at: '2026-06-17T10:00:00.000Z' }), { ahora: AHORA })
    expect(r.ok).toBeUndefined()
    expect(r.no).toContain('2026-06-17')
  })

  it('🔴 pero SÍ pregunta por la de AYER — el caso que distingue el freno de un «< hoy» pelado', () => {
    // El servidor corre en UTC y nosotros en Argentina: a las 21:00 de acá «hoy» ya es mañana allá.
    expect(preguntaDeOc(oc({ confirmada_at: '2026-08-25T23:30:00.000Z' }), { ahora: AHORA }).ok).toBe(true)
  })

  it('el motivo del «no» viaja SIEMPRE: un silencio se lee como que el disparador está roto', () => {
    for (const caso of [{ confirmada_at: '2026-01-01T00:00:00Z' }, { store: 'otra' }, { oc_label: '', oc_id: '' }, { confirmada_at: null }, { id: '' }]) {
      const r = preguntaDeOc(oc(caso), { ahora: AHORA })
      expect(r.ok).toBeUndefined()
      expect(typeof r.no).toBe('string')
      expect(String(r.no).length).toBeGreaterThan(3)
    }
  })

  // ─── De qué fecha cuelga ───────────────────────────────────────────────────────────────────
  it('🔴 cuelga de `confirmada_at` y ⛔ NO de `fecha_ingreso`, que vino en 17 de 79', () => {
    expect(fechaDelHecho(oc({ confirmada_at: '2026-08-26T16:41:00Z', fecha_ingreso: '2026-08-20' })))
      .toBe('2026-08-26')
    // Sin `confirmada_at` ⛔ no se cae a la otra: se dice que falta.
    expect(preguntaDeOc(oc({ confirmada_at: null, fecha_ingreso: '2026-08-26' }), { ahora: AHORA }).no)
      .toContain('confirmada_at')
  })

  it('🔴 y ⛔ NO de `recibido_en`: un backfill lo pone en hoy para todo el historial', () => {
    // Una OC de junio recibida hoy: si colgara de `recibido_en` pasaría el freno.
    const r = preguntaDeOc(oc({ confirmada_at: '2026-06-17T10:00:00Z', recibido_en: '2026-08-26T14:00:00Z' }), { ahora: AHORA })
    expect(r.ok).toBeUndefined()
  })

  // ─── No repreguntar, y el techo ────────────────────────────────────────────────────────────
  it('⛔ no repregunta por una OC que ya tiene su pregunta — el emisor reenvía al re-confirmar', () => {
    const r = preguntaDeOc(oc(), { yaPreguntadas: ['bdi:1', 'zattia:412'], ahora: AHORA })
    expect(r.no).toContain('ya tiene')
  })

  it('el tope diario corta y LO DICE, y está por encima del máximo medido (15 en un día)', () => {
    expect(TOPE_PREGUNTAS_DIARIAS).toBeGreaterThan(15)
    expect(preguntaDeOc(oc(), { abiertasHoy: TOPE_PREGUNTAS_DIARIAS, ahora: AHORA }).no).toContain('tope')
    expect(preguntaDeOc(oc(), { abiertasHoy: TOPE_PREGUNTAS_DIARIAS - 1, ahora: AHORA }).ok).toBe(true)
  })

  it('⛔ no inventa una marca por defecto: la equivocada le muestra a Zattia los pendientes de BDI', () => {
    expect(preguntaDeOc(oc({ store: '' }), { ahora: AHORA }).no).toContain('marca')
    expect(filaDe(preguntaDeOc(oc({ store: 'bdi' }), { ahora: AHORA })).marcas).toEqual(['bdi'])
  })
})

describe('preguntaDeItem — leer la pregunta de un ítem guardado', () => {
  const guardado = { arrastra: true, [CAMPO]: { oc: 'zattia:412', nombre: 'OC-0412', fecha: '2026-08-26', marca: 'zattia', proveedor: 'RHOVE' } }

  it('devuelve lo que hay que sembrar', () => {
    expect(preguntaDeItem(guardado)).toMatchObject({ nombre: 'OC-0412', fecha: '2026-08-26', marca: 'zattia' })
  })

  it('un ítem normal ⛔ no es una pregunta', () => {
    expect(preguntaDeItem({ arrastra: true })).toBeNull()
    expect(preguntaDeItem(null)).toBeNull()
  })

  it('🔴 una pregunta a medio escribir devuelve null, ⛔ no un objeto con huecos', () => {
    for (const roto of [{ nombre: '', fecha: '2026-08-26', marca: 'bdi' }, { nombre: 'x', fecha: 'ayer', marca: 'bdi' }, { nombre: 'x', fecha: '2026-08-26', marca: 'zzz' }]) {
      expect(preguntaDeItem({ [CAMPO]: roto })).toBeNull()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// El handler: contestar la pregunta
// ═══════════════════════════════════════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>
type Mundo = { items: Fila[]; insertados: { tabla: string; filas: Fila[] }[]; puedeCargar: boolean; borrados: string[] }
let mundo: Mundo

const PREGUNTA: Fila = {
  id: 'q1',
  clase: 'pendiente',
  titulo: '¿Por qué puerta entró OC-0412 (RHOVE)?',
  cuerpo: null,
  regla: { tipo: 'unica', fecha: '2026-08-26' },
  destino: DESTINO_PREGUNTA,
  marcas: ['zattia'],
  manual_id: null,
  activo: true,
  autor: 'Ingresos',
  datos: { arrastra: true, [CAMPO]: { oc: 'zattia:412', nombre: 'OC-0412', fecha: '2026-08-26', marca: 'zattia', proveedor: 'RHOVE' } },
  created_at: '2026-08-26T17:00:00.000Z',
}

const MOLDE: Fila = {
  id: 'm1',
  clase: 'pendiente',
  titulo: '1) El NOMBRE del producto',
  cuerpo: null,
  regla: { tipo: 'diaria' },
  destino: { tipo: 'personas', personas: ['Sofia Facello'] },
  marcas: [],
  manual_id: null,
  activo: true,
  autor: 'Bruno',
  datos: { plantilla: 'ingreso', offsetDias: 0, puertas: [] },
  created_at: '2026-08-01T10:00:00.000Z',
}

function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: { tabla: string; insert: Fila[] | null; eqId?: string; borrar?: boolean } = { tabla, insert: null }
    const resolver = async (single = false) => {
      if (ctx.borrar) { mundo.borrados.push(String(ctx.eqId)); return { data: null, error: null } }
      if (ctx.insert) { mundo.insertados.push({ tabla: ctx.tabla, filas: ctx.insert }); return { data: null, error: null } }
      if (ctx.tabla === 'agenda_items') {
        // ⚠️ El `.eq('id')` lo resuelve el fake **de verdad**: si lo ignorara, el handler podría
        // leer cualquier fila y el test saldría verde con el id equivocado.
        const filas = ctx.eqId ? mundo.items.filter((i) => i.id === ctx.eqId) : mundo.items
        return { data: single ? (filas[0] ?? null) : filas, error: null }
      }
      return { data: single ? null : [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: string) => { if (c === 'id') ctx.eqId = v; return api },
      not: () => api,
      order: () => api,
      gte: () => api, lt: () => api, in: () => api,
      delete: () => { ctx.borrar = true; return api },
      insert: (filas: Fila[]) => { ctx.insert = filas; return api },
      upsert: (filas: Fila[]) => { ctx.insert = filas; return api },
      maybeSingle: () => resolver(true),
      single: () => resolver(true),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => resolver().then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  equipoDelPadron: async () => [],
  exigirUsuario: async () => ({ name: 'Lorena Reyes', email: 'lore@arebensrl.com', admin: mundo.puedeCargar, acceso: {}, funcion: ['administracion'] }),
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

async function contestar(body: Record<string, unknown> = {}) {
  const mod = await import('@/api/_agenda.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', headers: {}, query: {}, body: { action: 'ingreso-puerta', id: 'q1', puerta: 'importacion', ...body } }, res,
  )
  return res
}

const sembrados = () => mundo.insertados.filter((e) => e.tabla === 'agenda_items').flatMap((e) => e.filas)
const tildes = () => mundo.insertados.filter((e) => e.tabla === 'agenda_hechos').flatMap((e) => e.filas)

describe('contestar la pregunta: un click siembra los pasos del ingreso', () => {
  beforeEach(() => {
    mundo = { items: [PREGUNTA, MOLDE], insertados: [], puedeCargar: true, borrados: [] }
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
    vi.resetModules()
  })

  it('siembra los moldes del ingreso con la fecha y la marca de la OC', async () => {
    const res = await contestar()
    expect(res.code).toBe(200)
    expect(res.body?.creados).toBe(1)
    const clon = sembrados()[0]
    expect(clon.titulo).toBe('OC-0412 · 1) El NOMBRE del producto')
    expect(clon.marcas).toEqual(['zattia'])
    expect((clon.regla as { fecha: string }).fecha).toBe('2026-08-26')
    expect((clon.datos as { puerta: string }).puerta).toBe('importacion')
  })

  it('🔴 el nombre, la fecha y la marca salen de la FILA y ⛔ NO del body', async () => {
    await contestar({ nombre: 'REGALO', fecha: '2026-12-25', marca: 'bdi' })
    const clon = sembrados()[0]
    expect(clon.titulo).toContain('OC-0412')
    expect(clon.titulo).not.toContain('REGALO')
    expect((clon.regla as { fecha: string }).fecha).toBe('2026-08-26')
    expect(clon.marcas).toEqual(['zattia'])
  })

  it('🔴 TILDA la pregunta y ⛔ no la borra: borrarla dejaría Cumplimiento contando lo que no está', async () => {
    await contestar()
    expect(mundo.borrados).toEqual([])
    expect(tildes()[0]).toMatchObject({ item_id: 'q1', fecha: '2026-08-26', usuario: 'Lorena Reyes' })
  })

  it('el tilde va a la fecha del HECHO y ⛔ no a hoy: es la única que corta el arrastre', async () => {
    expect(tildes()).toEqual([])
    await contestar()
    expect(tildes()[0].fecha).toBe('2026-08-26')
  })

  it('una puerta inválida es 400 y ⛔ no siembra con una por defecto', async () => {
    const res = await contestar({ puerta: 'la-de-atras' })
    expect(res.code).toBe(400)
    expect(sembrados()).toEqual([])
  })

  it('sin puerta es 400 y lo nombra', async () => {
    const res = await contestar({ puerta: undefined })
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toMatch(/puerta/i)
  })

  it('un id que ya no está es 404, y ⛔ no un 500', async () => {
    const res = await contestar({ id: 'no-existe' })
    expect(res.code).toBe(404)
  })

  it('🔴 un pendiente cualquiera ⛔ NO se puede contestar: esto no siembra sobre cualquier fila', async () => {
    mundo.items = [{ ...PREGUNTA, id: 'q1', datos: { arrastra: true } }, MOLDE]
    const res = await contestar()
    expect(res.code).toBe(400)
    expect(sembrados()).toEqual([])
  })

  it('🔴 sin `agenda.cargar` es 403 y ⛔ no siembra: son seis pendientes con dueña', async () => {
    mundo.puedeCargar = false
    const res = await contestar()
    expect(res.code).toBe(403)
    expect(sembrados()).toEqual([])
  })
})
