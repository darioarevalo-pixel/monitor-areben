import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { COLUMNAS_PARA_CERRAR, faltantesParaCerrar } from '@/lib/reclamos/casos.core.js'

/**
 * **Cerrar y anular, del lado del servidor.**
 *
 * 🔴 Hasta el 28-ago-2026 `faltantesParaCerrar` era una lista que **sólo miraba la pantalla**: el
 * botón «Cerrar» se ponía gris en Reclamos y en Cambios, y `api/_reclamos.js` aceptaba
 * `estado: 'cerrado'` viniera de donde viniera. O sea que un reclamo se podía cerrar **con la plata
 * sin devolver y la venta sin anular** — la regla que este módulo tiene escrita tres veces: *una
 * pantalla que esconde un botón es una sugerencia, ⛔ no una regla* (D11 de la auditoría del 28-ago).
 *
 * ⚠️ **Y lo que la auditoría pedía de más**: pedía que cerrar fuera de administración. Eso le
 * sacaría el botón «Cerrar» al Local en `ArmarCambio.tsx`, que es justo lo que el encabezado del
 * handler dice que el Local tiene que poder hacer de punta a punta. Lo que protege la plata ⛔ no
 * es el rol: es que no queden pendientes. **Anular sí es de administración** —es el hermano de
 * `eliminar`— y por eso los dos casos se fijan acá abajo, uno al lado del otro.
 */

/** La fila que contesta la base, y lo que quedó escrito. Se rearma en cada test. */
const mundo = {
  fila: {} as Record<string, unknown>,
  escrito: null as Record<string, unknown> | null,
}

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

/** Administración de verdad, y el puesto del Local: los dos entran a Reclamos, uno solo decide plata. */
const ADMIN = { name: 'Bruno', admin: false, cuenta: null, acceso: { bdi: { reclamos: true } }, funcion: ['administracion'] }
const LOCAL = { name: 'bdilocal', admin: false, cuenta: null, acceso: { bdi: { 'reclamos-local': true } }, funcion: [] }

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

/** Corre el handler de VERDAD con el perfil que se le diga. */
async function postear(perfil: unknown, body: Record<string, unknown>) {
  sesionDe(perfil)
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

/** Un reclamo decidido a reembolso, con la plata YA devuelta y la venta YA anulada: se puede cerrar. */
const LISTO = {
  id: 22, estado: 'resuelto', motivo: 'falla', escenario: null, compensacion: 'reembolso',
  destino_prenda: 'falla', diferencia: null, retorno_decidido: false,
  items: [{ producto: 'Campera', cantidad: 1, destino: 'falla' }], items_correctos: null,
  fotos: [{ url: 'u', at: 'x' }],
  reintegro_estado: 'hecho', stock_estado: 'hecho', reingreso_estado: 'no_aplica',
  cobro_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', cupon_estado: 'no_aplica',
  tn_stock_estado: 'no_aplica', reclamo_correo_estado: 'no_aplica', historial: [],
}

beforeEach(() => {
  mundo.fila = { ...LISTO }
  mundo.escrito = null
  // El handler corta con 500 si no hay credenciales antes de llegar al verbo. El cliente está
  // mockeado: lo único que importa es que existan.
  vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
  vi.stubEnv('SUPABASE_KEY', 'llave-de-mentira')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('cerrar', () => {
  it('con la plata sin devolver ⛔ NO cierra, y dice qué falta', async () => {
    mundo.fila = { ...LISTO, reintegro_estado: 'pendiente' }
    const res = await postear(ADMIN, { action: 'estado', estado: 'cerrado' })
    expect(res.code).toBe(409)
    expect(String(res.body?.error)).toContain('devolver la plata')
    expect(mundo.escrito).toBeNull()
  })

  it('con la venta original sin anular tampoco', async () => {
    mundo.fila = { ...LISTO, stock_estado: 'pendiente' }
    const res = await postear(ADMIN, { action: 'estado', estado: 'cerrado' })
    expect(res.code).toBe(409)
    expect(String(res.body?.error)).toContain('anular la venta original')
    expect(mundo.escrito).toBeNull()
  })

  it('sin decidir tampoco: no hay nada cerrado que cerrar', async () => {
    mundo.fila = { ...LISTO, compensacion: null }
    const res = await postear(ADMIN, { action: 'estado', estado: 'cerrado' })
    expect(res.code).toBe(409)
    expect(String(res.body?.error)).toContain('decidir qué se hace')
  })

  it('sin nada pendiente, cierra', async () => {
    const res = await postear(ADMIN, { action: 'estado', estado: 'cerrado' })
    expect(res.code).toBe(200)
    expect(mundo.escrito?.estado).toBe('cerrado')
  })

  /** El botón «Cerrar» del cambio es del Local, y el freno ⛔ no puede ser el que se lo saque. */
  it('lo puede cerrar el LOCAL, no sólo Administración', async () => {
    const res = await postear(LOCAL, { action: 'estado', estado: 'cerrado' })
    expect(res.code).toBe(200)
    expect(mundo.escrito?.estado).toBe('cerrado')
  })

  it('cerrar uno ya cerrado ⛔ no es un error, y ⛔ no vuelve a escribir', async () => {
    mundo.fila = { ...LISTO, estado: 'cerrado' }
    const res = await postear(ADMIN, { action: 'estado', estado: 'cerrado' })
    expect(res.code).toBe(200)
    expect(res.body?.yaEstaba).toBe(true)
    expect(mundo.escrito).toBeNull()
  })
})

describe('anular', () => {
  it('el Local ⛔ no puede: es el hermano de eliminar', async () => {
    const res = await postear(LOCAL, { action: 'estado', estado: 'anulado' })
    expect(res.code).toBe(403)
    expect(mundo.escrito).toBeNull()
  })

  it('Administración sí, y ⛔ no le pide que no falte nada: anular es decir que el caso no debió existir', async () => {
    mundo.fila = { ...LISTO, reintegro_estado: 'pendiente' }
    const res = await postear(ADMIN, { action: 'estado', estado: 'anulado' })
    expect(res.code).toBe(200)
    expect(mundo.escrito?.estado).toBe('anulado')
  })
})

/** Los otros estados siguen pasando: el freno es de los dos finales, ⛔ no de la columna. */
describe('los estados del medio', () => {
  it('«esperando_cliente» pasa aunque falten cosas', async () => {
    mundo.fila = { ...LISTO, compensacion: null, reintegro_estado: 'pendiente' }
    const res = await postear(LOCAL, { action: 'estado', estado: 'esperando_cliente' })
    expect(res.code).toBe(200)
    expect(mundo.escrito?.estado).toBe('esperando_cliente')
  })
})

/**
 * **El historial es lo que se lee después.** Los dos rótulos de acá (D17 y D18 de la auditoría del
 * 28-ago) ⛔ no cambian ninguna cuenta: cambian lo que alguien encuentra cuando abre el reclamo a
 * preguntarse qué pasó y desde cuándo. Se prueban con el mismo arnés porque los dos salen del
 * evento que apila el handler, ⛔ no de la pantalla.
 */
describe('el evento que queda en el historial', () => {
  const ultimo = () => {
    const h = (mundo.escrito?.historial || []) as Array<Record<string, string>>
    return h[h.length - 1] || {}
  }

  it('armar un cambio ⛔ NO anota un momento en «borrador» sobre una fila que está en revisión', async () => {
    mundo.fila = { ...LISTO, estado: 'en_revision', compensacion: null, historial: [] }
    const res = await postear(LOCAL, { action: 'cambio' })
    expect(res.code).toBe(200)
    // El evento lleva el estado en el que la fila QUEDA. Con `'borrador'` fijo,
    // `desdeQueEsta(d, 'borrador')` devolvía un instante en el que nunca estuvo.
    expect(ultimo().estado).toBe('en_revision')
    expect(mundo.escrito?.estado).toBeUndefined()
  })

  it('y sobre un borrador sigue diciendo «borrador»', async () => {
    mundo.fila = { ...LISTO, estado: 'borrador', compensacion: null, historial: [] }
    await postear(LOCAL, { action: 'cambio' })
    expect(ultimo().estado).toBe('borrador')
  })

  it('la baja del producto se anota en Gestión Nube, ⛔ no en TN', async () => {
    mundo.fila = { ...LISTO, tn_stock_estado: 'pendiente', historial: [] }
    const res = await postear(LOCAL, { action: 'gn-baja' })
    expect(res.code).toBe(200)
    // La columna se llama `tn_stock_estado` por su primera versión, pero el movimiento es de GN:
    // el nombre viejo manda a buscarlo a la tienda, donde no está.
    expect(ultimo().nota).toContain('Gestión Nube')
    expect(ultimo().nota).not.toContain('TN')
    expect(mundo.escrito?.tn_stock_estado).toBe('hecho')
  })
})

/**
 * 🔑 **El contrato de columnas, que es el modo de falla que este freno se trae puesto.**
 *
 * El handler lee la fila con un `select` y después le pregunta a `faltantesParaCerrar` si falta
 * algo. Si mañana alguien agrega un pendiente a la función y se olvida de `COLUMNAS_PARA_CERRAR`,
 * el `select` ⛔ no trae esa columna, la función la ve `undefined` y **deja pasar justo el caso que
 * vino a frenar** — callado, y con todos los tests en verde. Es el mismo defecto que ya tuvo
 * `costo_caso` con sus dos listas escritas a mano, y por eso la regla ⛔ no alcanza con estar
 * escrita: [un invariante escrito no frena].
 */
describe('COLUMNAS_PARA_CERRAR contra lo que faltantesParaCerrar lee', () => {
  const fuente = readFileSync(new URL('../lib/reclamos/casos.core.js', import.meta.url), 'utf8')

  it('toda columna que la función mira, la lista la nombra', () => {
    const cuerpo = fuente.split('export function faltantesParaCerrar(d) {')[1].split('\n}')[0]
    const leidas = [...new Set([...cuerpo.matchAll(/\bd\.([a-z_]+)/g)].map((m) => m[1]))]
    expect(leidas.length).toBeGreaterThan(10) // que la extracción no se haya quedado vacía
    expect(leidas.filter((c) => !COLUMNAS_PARA_CERRAR.includes(c))).toEqual([])
  })

  /**
   * La otra punta, y la que también cubre lo que leen los helpers (`loQueFaltaLlegar` y compañía
   * miran `items`, `items_correctos`, `motivo` y `retorno_decidido` sin que aparezcan como `d.x`):
   * con la fila entera y con la fila **recortada al select**, la respuesta tiene que ser la misma.
   */
  it('recortar la fila al select ⛔ no cambia la respuesta', () => {
    const entera = {
      estado: 'en_transito', motivo: 'excedente', escenario: 'otra_venta', compensacion: 'plata_total',
      destino_prenda: 'falla', diferencia: -500, retorno_decidido: true, fotos: [],
      items: [{ producto: 'Campera', cantidad: 1, destino: 'stock' }],
      items_correctos: [{ producto: 'Buzo', cantidad: 1, destino: 'regalada' }],
      reintegro_estado: 'pendiente', stock_estado: 'pendiente', reingreso_estado: 'pendiente',
      cobro_estado: 'pendiente', envio_nuevo_estado: 'pendiente', cupon_estado: 'pendiente',
      tn_stock_estado: 'pendiente', reclamo_correo_estado: 'pendiente',
      // Ruido que el select ⛔ no trae: nada de esto puede cambiar la lista.
      cliente: 'Lorena', relato: 'x', token: 'secreto', historial: [], costo_caso: 12000,
    }
    const recorte = Object.fromEntries(COLUMNAS_PARA_CERRAR.map((c) => [c, (entera as Record<string, unknown>)[c]]))
    const faltan = faltantesParaCerrar(entera)
    expect(faltan.length).toBeGreaterThan(4) // que el caso de prueba ejerza varias ramas
    expect(faltantesParaCerrar(recorte)).toEqual(faltan)
  })

  it('y el handler lee con esa lista, ⛔ no con un select escrito a mano', () => {
    const handler = readFileSync(new URL('../api/_reclamos.js', import.meta.url), 'utf8')
    expect(handler).toContain('COLUMNAS_PARA_CERRAR.join(')
  })
})

/**
 * **El registro de lo que se le dijo al cliente, del lado del servidor** (D9 de la auditoría del
 * 28-ago-2026).
 *
 * 🔑 Lo que se fija acá y ⛔ no en el núcleo son las dos decisiones del handler: **quién** puede
 * (el Local, que es el que le habla al cliente) y **qué NO toca** (`updated_at`, del que cuelgan
 * dos relojes de alerta).
 */
describe('registrar un mensaje', () => {
  const conMensajes = (mensajes: unknown) => { mundo.fila = { ...LISTO, mensajes } }

  it('lo apila con su momento, su texto y quién lo mandó', async () => {
    conMensajes([])
    const res = await postear(LOCAL, { action: 'mensaje', tipo: 'resolucion', texto: 'Te devolvemos $13.491.' })
    expect(res.code).toBe(200)
    const m = (mundo.escrito?.mensajes || []) as Array<Record<string, string>>
    expect(m).toHaveLength(1)
    expect(m[0].tipo).toBe('resolucion')
    expect(m[0].texto).toBe('Te devolvemos $13.491.')
    expect(m[0].por).toBe('bdilocal')
  })

  /**
   * 🔴 🔑 **La regla que más cuesta ver, y la que ya se pagó una vez.** `apilar()` mueve
   * `updated_at`, y de ahí cuentan *«hace N días que la plata no sale»* y *«esperando una decisión
   * hace N días»* (`alertasDe`). Si copiar el mensaje de resolución moviera la fila, **contarle al
   * cliente que la plata va a salir reiniciaría el reloj de que la plata no salió**.
   * ⇒ [[feedback_areben_updated_at_no_mide_la_espera]]
   */
  it('🔴 ⛔ NO toca `updated_at`: contarle al cliente ⛔ no reinicia el reloj de lo que falta hacer', async () => {
    conMensajes([])
    await postear(LOCAL, { action: 'mensaje', tipo: 'resolucion', texto: 'Te devolvemos todo.' })
    expect(Object.keys(mundo.escrito || {})).toEqual(['mensajes'])
  })

  /** ⛔ Tampoco en el historial: ahí va el ESTADO en el que la fila queda, ⛔ no las palabras. */
  it('⛔ no apila un evento en el historial', async () => {
    conMensajes([])
    await postear(LOCAL, { action: 'mensaje', tipo: 'etiqueta', texto: 'Ahí va la etiqueta.' })
    expect(mundo.escrito?.historial).toBeUndefined()
  })

  it('un momento que ⛔ no existe es 400, y ⛔ no escribe nada', async () => {
    conMensajes([])
    const res = await postear(LOCAL, { action: 'mensaje', tipo: 'lo_que_sea', texto: 'hola' })
    expect(res.code).toBe(400)
    expect(mundo.escrito).toBeNull()
  })

  it('sin texto es 400: un registro sin texto no contesta lo único que vino a contestar', async () => {
    conMensajes([])
    const res = await postear(LOCAL, { action: 'mensaje', tipo: 'resolucion', texto: '  ' })
    expect(res.code).toBe(400)
    expect(mundo.escrito).toBeNull()
  })

  /** El doble click: se contesta 200 —el mensaje se copió— y ⛔ no se escribe la entrada repetida. */
  it('el mismo mensaje pegado al anterior contesta 200 y ⛔ no lo duplica', async () => {
    conMensajes([{ tipo: 'resolucion', at: new Date().toISOString(), por: 'bdilocal', texto: 'Te devolvemos todo.' }])
    const res = await postear(LOCAL, { action: 'mensaje', tipo: 'resolucion', texto: 'Te devolvemos todo.' })
    expect(res.code).toBe(200)
    expect(res.body?.repetido).toBe(true)
    expect(mundo.escrito).toBeNull()
  })

  /**
   * 🔑 **⛔ No es de administración, y es la mitad negativa de la regla**: el que le habla al
   * cliente es el Local, y los cinco botones de mensaje son suyos. Gatearlo con `DE_ADMIN` dejaría
   * el registro vacío justo en los reclamos que sí se atendieron.
   */
  it('🔴 lo puede hacer el LOCAL, ⛔ no sólo Administración', async () => {
    conMensajes([])
    const res = await postear(LOCAL, { action: 'mensaje', tipo: 'pedir_fotos', texto: 'Mandanos fotos.' })
    expect(res.code).toBe(200)
  })
})
