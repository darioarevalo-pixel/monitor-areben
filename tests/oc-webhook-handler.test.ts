// El receptor del webhook, ejercido entero: cabeceras → firma → base.
//
// 🔑 Lo que fija este archivo es lo que el núcleo puro no puede: **de dónde sale el cuerpo** y
// **qué se escribe (y qué no) en cada camino**. Los dos modos de falla que un receptor de webhooks
// no puede tener son firmar sobre el JSON reparseado y procesar dos veces el mismo mensaje.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

const SECRETO = Buffer.from('un-secreto-de-prueba-largo-1234567890').toString('base64')
const ID = 'msg_1'

const EVENTO = {
  type: 'oc.confirmada',
  timestamp: '2026-08-26T14:31:58Z',
  data: {
    orden_compra: { id: 42, label: 'OC-0042', estado: 'confirmada' },
    negocio: { id: 1, nombre: 'BDI', slug: 'bdi' },
    proveedor: { id: 7, nombre: 'Textil Sur' },
    totales: { productos: 1, lineas: 1, unidades_pedidas: 12, unidades_contadas: 10, diferencia_unidades: -2, lineas_con_diferencia: 1 },
    lineas: [{ sku: 'REM-1', cantidad_pedida: 12, cantidad_contada: 10, es_nuevo: true }],
  },
}
// ⚠️ Con espacios adentro: es un JSON válido que NO es el que saldría de `JSON.stringify` pelado.
// Si el handler reparseara y volviera a serializar, la firma dejaría de validar y el test lo caza.
const CUERPO = JSON.stringify(EVENTO, null, 1)

function firmar(cuerpo: string, id = ID, ts = String(Math.floor(Date.now() / 1000))) {
  const clave = Buffer.from(SECRETO, 'base64')
  const contenido = Buffer.concat([Buffer.from(`${id}.${ts}.`, 'utf8'), Buffer.from(cuerpo, 'utf8')])
  return { firma: 'v1,' + crypto.createHmac('sha256', clave).update(contenido).digest('base64'), ts }
}

/**
 * Un `req` como el que llega a un handler de Vercel: `@vercel/node` ya consumió el socket y repuso
 * el cuerpo parcheando `on('data')` / `on('end')`. Se imita eso —y se le pone además un `body` ya
 * parseado y **distinto**, para que un handler que leyera de ahí falle de forma visible.
 */
function reqDe(cuerpo: string, headers: Record<string, string>, method = 'POST') {
  return {
    method,
    headers,
    query: { recurso: 'oc-webhook' },
    body: { type: 'esto-no-es-lo-que-llegó' },
    on(evento: string, cb: (x?: unknown) => void) {
      if (evento === 'data') setTimeout(() => cb(Buffer.from(cuerpo, 'utf8')), 0)
      if (evento === 'end') setTimeout(() => cb(), 1)
      return this
    },
  }
}

function resFalso() {
  const r = {
    code: 0,
    body: null as Record<string, unknown> | null,
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
  }
  return r
}

/** Lo que había en la base antes del POST, y todo lo que el handler escribió. */
let previo: { estado: string } | null = null
let escrituras: { tabla: string; op: string; datos: unknown }[] = []
/** Para probar que la Agenda caída ⛔ no voltea el evento: la OC no se puede perder. */
let agendaRota = false

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const q = {
        select: () => q,
        eq: () => q,
        // `not` lo usa la pregunta de la puerta para pedirle a la BASE las que ya están abiertas.
        not: () => q,
        in: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: tabla === 'recepcion_evento' ? previo : null, error: null }),
        upsert: async (fila: unknown) => { escrituras.push({ tabla, op: 'upsert', datos: fila }); return { error: null } },
        insert: async (filas: unknown) => {
          if (tabla === 'agenda_items' && agendaRota) return { error: { message: 'la agenda no contesta' } }
          escrituras.push({ tabla, op: 'insert', datos: filas }); return { error: null }
        },
        delete: () => ({ eq: async () => { escrituras.push({ tabla, op: 'delete', datos: null }); return { error: null } } }),
        // Para el cruce con el espejo, que hace `await sb.from(...).select(...).in(...)`.
        then: (ok: (v: unknown) => void) => ok({ data: [], error: null }),
      }
      return q
    },
  }),
}))

async function llamar(req: unknown) {
  const mod = await import('@/api/_oc-webhook.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

beforeEach(() => {
  vi.resetModules()
  previo = null
  escrituras = []
  agendaRota = false
  vi.stubEnv('INGRESO_WEBHOOK_SECRET', SECRETO)
  vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
  // ⛔ Sin credenciales de Zattia a propósito en el caso base: el cruce con el espejo tiene que
  // poder no correr sin voltear el evento.
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

const conFirma = (cuerpo = CUERPO, id = ID) => {
  const { firma, ts } = firmar(cuerpo, id)
  return reqDe(cuerpo, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': firma })
}

describe('el camino feliz', () => {
  it('🔴 valida contra los BYTES del stream, no contra `req.body`', async () => {
    // `req.body` trae otra cosa; si el handler lo usara, la firma no validaría nunca.
    const res = await llamar(conFirma())
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, oc: 'bdi:42', lineas: 1 })
  })

  it('escribe el evento, la OC y sus renglones — en ese orden', async () => {
    await llamar(conFirma())
    expect(escrituras.map((e) => `${e.tabla}.${e.op}`)).toEqual([
      'recepcion_evento.upsert',
      'recepcion_oc.upsert',
      'recepcion_linea.delete',
      'recepcion_linea.insert',
    ])
    const oc = escrituras[1].datos as Record<string, unknown>
    expect(oc.id).toBe('bdi:42')
    expect(oc.unidades_faltantes).toBe(2)
    expect(oc.evento_id).toBe(ID)
    // Se preguntó y no matcheó ninguno: eso SÍ es "falta darlo de alta" (la OC trae `es_nuevo`).
    expect(oc.espejo_consultado).toBe(true)
    expect(oc.skus_sin_espejo).toBe(1)
    expect((escrituras[3].datos as Record<string, unknown>[])[0].en_gn).toBe(false)
  })

  it('🔴 si NO se pudo preguntar, el cruce queda en null — no en "ninguno está"', async () => {
    // El evento es de Zattia y las credenciales de esa marca no están: la OC se guarda igual, con
    // la bandera en false. Un mapa vacío se leería como catálogo vacío, que es la afirmación cara.
    const zattia = JSON.stringify({ ...EVENTO, data: { ...EVENTO.data, negocio: { slug: 'zattia' } } })
    const res = await llamar(conFirma(zattia))
    expect(res.code).toBe(200)
    const oc = escrituras[1].datos as Record<string, unknown>
    expect(oc.espejo_consultado).toBe(false)
    expect(oc.skus_sin_espejo).toBeNull()
    expect((escrituras[3].datos as Record<string, unknown>[])[0].en_gn).toBeNull()
  })

  it('🔴 borra los renglones ANTES de insertar los nuevos', async () => {
    // Al revés se llevaría puesto lo que se acaba de escribir, y la OC quedaría sin renglones.
    await llamar(conFirma())
    const i = escrituras.findIndex((e) => e.op === 'delete')
    const j = escrituras.findIndex((e) => e.tabla === 'recepcion_linea' && e.op === 'insert')
    expect(i).toBeGreaterThan(-1)
    expect(i).toBeLessThan(j)
  })
})

describe('la idempotencia', () => {
  it('🔑 un reintento del mismo mensaje contesta 200 y NO vuelve a procesar', async () => {
    previo = { estado: 'procesado' }
    const res = await llamar(conFirma())
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ repetido: true })
    expect(escrituras).toEqual([])
  })

  it('pero un evento que quedó en `error` SÍ se reprocesa', async () => {
    // Si no, el reintento —que es justo lo que arreglaría una caída de la base— chocaría con la
    // fila del intento fallido y se contestaría 200 dejándolo perdido para siempre.
    previo = { estado: 'error' }
    const res = await llamar(conFirma())
    expect(res.code).toBe(200)
    expect(escrituras.some((e) => e.tabla === 'recepcion_oc')).toBe(true)
  })
})

describe('lo que se rechaza', () => {
  it('firma inválida: 401 y ni una escritura', async () => {
    const { ts } = firmar(CUERPO)
    const req = reqDe(CUERPO, { 'webhook-id': ID, 'webhook-timestamp': ts, 'webhook-signature': 'v1,cualquiera' })
    const res = await llamar(req)
    expect(res.code).toBe(401)
    expect(escrituras).toEqual([])
  })

  it('un byte cambiado después de firmar: 401', async () => {
    const { firma, ts } = firmar(CUERPO)
    const res = await llamar(reqDe(CUERPO.replace('"10"', '"11"').replace(': 10', ': 11'), {
      'webhook-id': ID, 'webhook-timestamp': ts, 'webhook-signature': firma,
    }))
    expect(res.code).toBe(401)
  })

  it('sin secreto cargado: 503, para que el emisor reintente cuando se cargue', async () => {
    vi.stubEnv('INGRESO_WEBHOOK_SECRET', '')
    expect((await llamar(conFirma())).code).toBe(503)
  })

  it('un GET no entra', async () => {
    const { firma, ts } = firmar(CUERPO)
    const req = reqDe(CUERPO, { 'webhook-id': ID, 'webhook-timestamp': ts, 'webhook-signature': firma }, 'GET')
    expect((await llamar(req)).code).toBe(405)
  })

  it('un cuerpo que no es JSON: 400 (y la firma igual tuvo que validar antes)', async () => {
    const cuerpo = 'esto no es json'
    const res = await llamar(conFirma(cuerpo))
    expect(res.code).toBe(400)
    expect(escrituras).toEqual([])
  })
})

describe('lo que no es para nosotros', () => {
  it('🔑 un tipo desconocido se ACEPTA con 200 y queda anotado, pero no escribe ninguna OC', async () => {
    const otro = JSON.stringify({ ...EVENTO, type: 'oc.anulada' })
    const res = await llamar(conFirma(otro))
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ignorado: 'tipo' })
    expect(escrituras.map((e) => e.tabla)).toEqual(['recepcion_evento'])
    expect((escrituras[0].datos as Record<string, unknown>).estado).toBe('ignorado')
  })

  it('un negocio que no es ninguna de las dos marcas tampoco escribe OC', async () => {
    const otro = JSON.stringify({ ...EVENTO, data: { ...EVENTO.data, negocio: { slug: 'otra' } } })
    const res = await llamar(conFirma(otro))
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ignorado: 'store' })
    expect(escrituras.map((e) => e.tabla)).toEqual(['recepcion_evento'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// La pregunta de la puerta: el hecho llega, pero sin decir por dónde entró
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 🔑 **Esto es «la pregunta del medio»**: el núcleo decide bien y el handler guarda bien, y lo que
 * se rompe callado es el cable entre los dos. Sin estos tests, `abrirPreguntaDePuerta` podía tirar
 * en cada evento —su `try/catch` se lo traga a propósito, para no voltear la OC— y **el webhook
 * seguía contestando 200 con la OC guardada**: verde por todos lados y ni una pregunta abierta.
 */
describe('la pregunta de la puerta', () => {
  const enAgenda = () => escrituras.filter((e) => e.tabla === 'agenda_items')

  /** El mismo evento, con la hora de confirmación puesta: es de ahí que cuelga la pregunta. */
  const conConfirmada = (iso: string) => {
    const ev = { ...EVENTO, data: { ...EVENTO.data, orden_compra: { ...EVENTO.data.orden_compra, confirmada_at: iso } } }
    const cuerpo = JSON.stringify(ev, null, 1)
    const { firma, ts } = firmar(cuerpo, 'msg_conf')
    return reqDe(cuerpo, { 'webhook-id': 'msg_conf', 'webhook-timestamp': ts, 'webhook-signature': firma })
  }

  it('abre UN pendiente en la Agenda cuando la OC se acaba de confirmar', async () => {
    const res = await llamar(conConfirmada(new Date().toISOString()))
    expect(res.code).toBe(200)
    const filas = enAgenda()
    expect(filas).toHaveLength(1)
    const fila = (filas[0].datos as Record<string, unknown>[])[0]
    expect(String(fila.titulo)).toContain('¿Por qué puerta entró OC-0042')
    expect(fila.autor).toBe('Ingresos')
    expect(fila.marcas).toEqual(['bdi'])
  })

  it('🔴 va DESPUÉS de guardar la OC: una pregunta sobre un ingreso que no está no le sirve a nadie', async () => {
    await llamar(conConfirmada(new Date().toISOString()))
    const orden = escrituras.map((e) => e.tabla)
    expect(orden.indexOf('agenda_items')).toBeGreaterThan(orden.indexOf('recepcion_oc'))
  })

  it('🔴 el evento del BACKFILL ⛔ no abre nada, y el webhook DICE por qué', async () => {
    const res = await llamar(conConfirmada('2026-06-17T10:00:00.000Z'))
    expect(res.code).toBe(200)
    expect(enAgenda()).toEqual([])
    expect(String(res.body?.agenda)).toContain('no se pregunta por lo viejo')
  })

  it('🔴 sin `confirmada_at` ⛔ no adivina una fecha, y lo dice', async () => {
    const res = await llamar(conFirma())
    expect(res.code).toBe(200)
    expect(enAgenda()).toEqual([])
    expect(String(res.body?.agenda)).toContain('confirmada_at')
  })

  it('🔴 la Agenda caída ⛔ NO voltea el evento: la OC se guarda y el emisor recibe 200', async () => {
    // Perder el evento es definitivo —no hay quién lo vuelva a mandar—; perder la pregunta no: el
    // botón «Ingresó mercadería» sigue estando y la próxima confirmación la vuelve a abrir.
    agendaRota = true
    const res = await llamar(conConfirmada(new Date().toISOString()))
    expect(res.code).toBe(200)
    expect(escrituras.some((e) => e.tabla === 'recepcion_oc')).toBe(true)
    expect(String(res.body?.agenda)).toContain('no se pudo abrir')
  })

  it('🔑 lo que pasó con la pregunta viaja SIEMPRE en la respuesta, aunque no haya pasado nada', async () => {
    const res = await llamar(conFirma())
    expect(typeof res.body?.agenda).toBe('string')
    expect(String(res.body?.agenda).length).toBeGreaterThan(3)
  })
})
