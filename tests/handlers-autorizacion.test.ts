import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Los handlers que **autenticaban pero no autorizaban**.
 *
 * Hasta el 13-ago-2026 estos nueve llamaban a `exigirUsuario` y nada más. Tener sesión no es tener
 * permiso: cualquier cuenta válida del Monitor —incluidos los puestos compartidos `Depósito`,
 * `Local` y `bdilocal`, cuya contraseña conoce medio equipo— leía y escribía en las dos marcas sin
 * importar qué decía su perfil. Se bajaba el stock vivo completo, el mapeo de SKU de las tres
 * marcas, el padrón de clientes que reclamaron, y hasta **el token del portal público de cualquier
 * reclamo**, que es la llave para hacerse pasar por ese cliente.
 *
 * `lib/permisos.core.js` ya tenía todo lo necesario; el problema era la cobertura, no el diseño.
 *
 * Lo que fija este archivo es lo que no se ve en una pantalla: que el 403 salga **antes de tocar la
 * base**. Un gate que contesta 403 después de leer ya filtró los datos al proceso, y el día que
 * alguien mueva un `return` no se va a romper ninguna vista.
 */

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('LLEGÓ A LA BASE — el gate no cortó') },
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    ended: false,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { r.ended = true; return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const conSesion = (extra: Record<string, unknown> = {}) => ({
  method: 'GET',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: { store: 'bdi' },
  body: {},
  ...extra,
})

/**
 * El KV contesta que sí, con el perfil que le pasemos. La identidad es válida; el permiso, no.
 *
 * A todo lo que NO es el KV se le contesta una **página vacía y exitosa**. Importa que sea así y
 * no un error: `_inventario-vivo` pagina Gestión Nube contra un presupuesto de 10 s y reintenta
 * los fallos, así que con un 500 se quedaba dando vueltas ~29 s — al filo del `testTimeout` de 30,
 * o sea un test que iba a empezar a flakear solo. Con una página vacía la paginación termina en la
 * primera vuelta. Acá no interesa qué devuelve GN, sólo si el gate dejó llegar hasta ahí.
 */
function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    String(url).includes('bdi-catalogo.vercel.app/api/usuarios')
      ? { ok: true, json: async () => ({ ok: true, perfil }) }
      : { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [], meta: {} }), text: async () => '{"data":[]}' }
  )))
}

/** Alguien real del equipo: entra al Monitor, pero no tiene ninguna de las secciones de abajo. */
const SIN_NADA = { name: 'Depósito', admin: false, cuenta: null, acceso: {}, funcion: [] }

/**
 * Cada handler con la sección que lo abre. La clave elegida importa: una de más deja el endpoint
 * casi abierto, una de menos deja a alguien sin poder trabajar y se ve como "no anda".
 */
const PUERTAS = [
  { archivo: '_conteos-deposito', llave: 'conteo-deposito', que: 'los conteos del depósito' },
  { archivo: '_inventario-vivo', llave: 'conteo', que: 'el stock vivo de GN' },
  { archivo: '_disenos', llave: 'disenos', que: 'el tablero de diseños' },
  { archivo: '_solicitudes', llave: 'solicitudes', que: 'las solicitudes' },
  { archivo: '_tn-ignorados', llave: 'tncat', que: 'los productos apartados de la revisión' },
  { archivo: '_tn-fotos-verificadas', llave: 'tncat', que: 'las fotos ya verificadas' },
  { archivo: '_fallas', llave: 'postventa-deposito', que: 'las fallas' },
  { archivo: '_reclamos', llave: 'reclamos-local', que: 'los reclamos y sus tokens' },
  { archivo: 'sku-map', llave: 'integraciones', que: 'el mapeo de SKU' },
  // Estos cuatro SÍ tenían gate, pero con `puedeVer` pelado (13-ago-2026). Entran a la tabla para
  // que el 403 sin permiso quede fijado igual que en los otros: el gate estaba, y la mitad que
  // faltaba —la cuenta fija— se prueba abajo.
  { archivo: '_liquidacion', llave: 'liquidacion', que: 'los precios de sale' },
  { archivo: '_calendario', llave: 'calendario', que: 'el calendario editorial' },
  { archivo: '_atencion', llave: 'atencion', que: 'la bandeja de atención al cliente' },
  { archivo: '_meta-funnel', llave: 'meta-ads', que: 'el embudo de Meta Ads' },
] as const

/** El perfil que SÍ tiene una sección tildada en BDI. */
const conLlave = (key: string) => ({ name: 'Quien Sea', admin: false, cuenta: null, acceso: { bdi: { [key]: true } }, funcion: [] })

beforeEach(() => {
  vi.resetModules()
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ZATTIA_SUPABASE_URL', 'ZATTIA_SUPABASE_SERVICE_KEY']) {
    vi.stubEnv(v, 'puesto-para-que-no-corte-antes')
  }
  vi.stubEnv('GN_TOKEN', 'x')
  vi.stubEnv('GN_TOKEN_ZATTIA', 'x')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function llamar(archivo: string, req: unknown) {
  const mod = await import(`@/api/${archivo}.js`)
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

describe('sesión sin permiso: 403 y sin tocar la base', () => {
  for (const { archivo, que } of PUERTAS) {
    it(`${archivo} no sirve ${que}`, async () => {
      sesionDe(SIN_NADA)
      // Si el gate no cortara, el `createClient` mockeado tira y el test se cae con un mensaje
      // que dice exactamente qué pasó. Un 403 tardío tampoco pasa: el throw llega primero.
      const res = await llamar(archivo, conSesion())
      expect(res.code).toBe(403)
    })
  }
})

describe('con la sección tildada, pasa', () => {
  for (const { archivo, llave, que } of PUERTAS) {
    it(`${archivo} deja ver ${que} a quien tiene «${llave}»`, async () => {
      sesionDe(conLlave(llave))
      // Ahora el gate NO tiene que cortar: se espera llegar a la base (o al token de GN), o sea
      // cualquier cosa MENOS un 403. Es la mitad que evita el falso positivo de "prohibir todo".
      let code = 0
      try { code = (await llamar(archivo, conSesion())).code } catch (e) {
        expect(String(e)).toContain('LLEGÓ A LA BASE')
        return
      }
      expect(code).not.toBe(403)
    })
  }
})

describe('el admin entra a todo', () => {
  it('ninguna puerta le contesta 403', async () => {
    for (const { archivo } of PUERTAS) {
      sesionDe({ name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] })
      let code = 0
      try { code = (await llamar(archivo, conSesion())).code } catch (e) {
        expect(String(e)).toContain('LLEGÓ A LA BASE'); continue
      }
      expect(code, archivo).not.toBe(403)
    }
  })
})

/**
 * 🔴 **La mitad que `puedeVer` no cubre.** El gate podía estar puesto y la puerta seguir abierta:
 * `puedeVer(perfil, store, key)` mira la marca que le pasan, y del lado del servidor la `store` la
 * elige el request. Alguien clavado a Zattia pedía `?store=bdi` a mano y entraba, aunque en su
 * pantalla la marca ni siquiera se pueda cambiar (`puedeCambiarMarca()` es `!perfil.cuenta`).
 *
 * Por eso el permiso de abajo está tildado en LAS DOS marcas: lo que tiene que cortar no es la
 * falta de permiso, es la cuenta fija. Con `puedeVer` pelado los cinco dan 200.
 */
const CLAVADA_A_ZATTIA = [
  { archivo: '_conteos-deposito', llave: 'conteo', que: 'el stock del otro local' },
  { archivo: '_liquidacion', llave: 'liquidacion', que: 'los precios de sale de la otra marca' },
  { archivo: '_calendario', llave: 'calendario', que: 'el calendario de la otra marca' },
  { archivo: '_atencion', llave: 'atencion', que: 'la bandeja de atención de la otra marca' },
  { archivo: '_meta-funnel', llave: 'meta-ads', que: 'la pauta de la otra marca' },
] as const

describe('la cuenta fija sigue mandando', () => {
  for (const { archivo, llave, que } of CLAVADA_A_ZATTIA) {
    it(`${archivo}: clavada a Zattia y con «${llave}» en las dos, no ve ${que}`, async () => {
      sesionDe({
        name: 'Local Zattia',
        admin: false,
        cuenta: 'zattia',
        acceso: { bdi: { [llave]: true }, zattia: { [llave]: true } },
        funcion: [],
      })
      const res = await llamar(archivo, conSesion()) // conSesion() pide store=bdi
      expect(res.code).toBe(403)
    })
  }

  it('_liquidacion tampoco por la vuelta de Etiquetas, que abre la misma puerta con otra llave', async () => {
    sesionDe({
      name: 'Local Zattia',
      admin: false,
      cuenta: 'zattia',
      acceso: { bdi: { etiquetas: true }, zattia: { etiquetas: true } },
      funcion: [],
    })
    const res = await llamar('_liquidacion', conSesion({ query: { store: 'bdi', etiquetas: '1' } }))
    expect(res.code).toBe(403)
  })

  it('sin cuenta fija, el mismo perfil entra: el que corta es el clavado, no el permiso', async () => {
    // La mitad que evita el falso positivo de "prohibir todo": si esto también diera 403, el test
    // de arriba estaría verde por la razón equivocada.
    sesionDe({ name: 'Suelta', admin: false, cuenta: null, acceso: { bdi: { atencion: true } }, funcion: [] })
    let code = 0
    try { code = (await llamar('_atencion', conSesion())).code } catch (e) {
      expect(String(e)).toContain('LLEGÓ A LA BASE')
      return
    }
    expect(code).not.toBe(403)
  })
})

/**
 * La cola de reetiquetado agregó la **única escritura** que abre el permiso de Etiquetas, y con eso
 * se cayó la garantía cómoda que sostenía este endpoint: «Etiquetas es sólo GET, así que ninguna
 * `action` del POST se alcanza jamás con esa llave».
 *
 * Lo que la reemplaza es que `escribeEtiquetado` pide DOS condiciones a la vez —`?etiquetas=1` en la
 * query **y** `action:'etiquetado'` en el body— y corta con `return` antes de que se mire ninguna
 * otra `action`. Este bloque fija justamente eso: que con la llave de Etiquetas se llegue a
 * `etiquetado` y **a nada más**.
 */
/**
 * La QUINTA llave de `_liquidacion`: Ventas de Marketing (`mkt-ventas`).
 *
 * Marketing arma las campañas sobre el resultado del sale, así que ve **qué se vendió de lo
 * liquidado** — pero esta sección es de Dirección por el costo, y eso no se mueve. Lo que fija este
 * bloque es dónde queda el borde: qué abre la llave y, sobre todo, qué **no**.
 */
/**
 * 🔴 **`_mkt-ventas` es la única puerta de esa sección que ESCRIBE** —`ventas`, `venta_detalles` y
 * `clientes` del espejo de producción— **y la única que gasta cupo de Gestión Nube**. Su gate es lo
 * único entre una sesión cualquiera del Monitor y una escritura en las dos bases.
 */
describe('_mkt-ventas · la puerta que escribe', () => {
  const SOLO_MKT = { name: 'Marketing', admin: false, cuenta: null, acceso: { bdi: { 'mkt-ventas': true } }, funcion: [] }
  const post = (extra: Record<string, unknown> = {}) =>
    conSesion({ method: 'POST', query: { store: 'bdi' }, body: { store: 'bdi', action: 'traer-ventas-hoy', ...extra } })

  it('🔴 sin la sección no entra, aunque tenga sesión válida', async () => {
    sesionDe(SIN_NADA)
    const res = await llamar('_mkt-ventas', post())
    expect(res.code).toBe(403)
  })

  it('🔴 tampoco con la sección en la OTRA marca', async () => {
    sesionDe({ name: 'Marketing', admin: false, cuenta: null, acceso: { zattia: { 'mkt-ventas': true } }, funcion: [] })
    const res = await llamar('_mkt-ventas', post())
    expect(res.code).toBe(403)
  })

  // El GET contesta cuándo se apretó el botón por última vez, y NO escribe. Igual pide la sección:
  // el gate está arriba del `if (req.method)`, así que la respuesta es 403 y no un 405 que
  // insinuaría que la puerta existe para cualquiera.
  it('🔴 el GET también pide la sección', async () => {
    sesionDe(SIN_NADA)
    const res = await llamar('_mkt-ventas', conSesion({ query: { store: 'bdi' } }))
    expect(res.code).toBe(403)
  })

  it('un método que no es GET ni POST se rechaza', async () => {
    sesionDe(SOLO_MKT)
    const res = await llamar('_mkt-ventas', conSesion({ method: 'DELETE', query: { store: 'bdi' } }))
    expect(res.code).toBe(405)
  })

  it('una acción que no es la suya se rechaza antes de tocar la base', async () => {
    sesionDe(SOLO_MKT)
    const res = await llamar('_mkt-ventas', post({ action: 'cualquier-otra' }))
    expect(res.code).toBe(400)
  })

  it('con la sección SÍ entra — si no, todo lo de arriba estaría verde por prohibir todo', async () => {
    sesionDe(SOLO_MKT)
    try {
      const res = await llamar('_mkt-ventas', post())
      expect(res.code).not.toBe(403)
    } catch (e) {
      expect(String(e)).toContain('LLEGÓ A LA BASE')
    }
  })
})

describe('_liquidacion · la llave de Ventas de Marketing', () => {
  const SOLO_MKT = { name: 'Marketing', admin: false, cuenta: null, acceso: { bdi: { 'mkt-ventas': true } }, funcion: [] }
  const postDe = (body: Record<string, unknown>) =>
    conSesion({ method: 'POST', query: { store: 'bdi' }, body: { store: 'bdi', ...body } })

  it('🔴 el GET pelado NO entra: sin `?resultado=1` contesta la campaña con el costo adentro', async () => {
    // El que importa de este lado. Si esto deja de dar 403, Marketing se baja `foto.costo` de cada
    // producto de cada campaña — que es la razón por la que la sección es de Dirección.
    sesionDe(SOLO_MKT)
    const res = await llamar('_liquidacion', conSesion({ query: { store: 'bdi' } }))
    expect(res.code).toBe(403)
  })

  it('🔴 `aplicar` tampoco: escribir precios en la tienda pide Liquidación', async () => {
    sesionDe(SOLO_MKT)
    const res = await llamar('_liquidacion', postDe({ action: 'aplicar', liq: 'l1', pids: ['1'], modo: 'poner' }))
    expect(res.code).toBe(403)
  })

  it('🔴 ninguna otra action se cuela, ni siquiera mandando `?resultado=1`', async () => {
    sesionDe(SOLO_MKT)
    const acciones = ['crear', 'borrar', 'guardar-item', 'estado-item', 'revisar', 'quitar-item', 'sumar-items', 'decidir-masivo', 'renombrar', 'estado', 'sincronizar-ventas', 'etiquetado']
    for (const action of acciones) {
      const res = await llamar('_liquidacion', conSesion({ method: 'POST', query: { store: 'bdi', resultado: '1' }, body: { store: 'bdi', action, liq: 'l1', pids: ['1'] } }))
      expect(res.code, `action «${action}» no puede entrar con la llave de Marketing`).toBe(403)
    }
  })

  it('el GET con `?resultado=1` SÍ entra — si no, todo lo de arriba estaría verde por prohibir todo', async () => {
    sesionDe(SOLO_MKT)
    try {
      const res = await llamar('_liquidacion', conSesion({ query: { store: 'bdi', resultado: '1' } }))
      expect(res.code).not.toBe(403)
    } catch (e) {
      expect(String(e)).toContain('LLEGÓ A LA BASE')
    }
  })

  it('y las dos LECTURAS que hace el Resultado por POST también', async () => {
    sesionDe(SOLO_MKT)
    for (const action of ['ventas-campania', 'stock-campania']) {
      try {
        const res = await llamar('_liquidacion', postDe({ action, liq: 'l1', pids: ['1'] }))
        expect(res.code, action).not.toBe(403)
      } catch (e) {
        expect(String(e)).toContain('LLEGÓ A LA BASE')
      }
    }
  })

  it('sin la sección no entra, aunque mande `?resultado=1`', async () => {
    sesionDe(SIN_NADA)
    const res = await llamar('_liquidacion', conSesion({ query: { store: 'bdi', resultado: '1' } }))
    expect(res.code).toBe(403)
  })
})

describe('_liquidacion · el costo no sale por la llave de Marketing', () => {
  /**
   * 🔴 **Se ejerce la función, no se argumenta el comentario.** Es la única garantía de que
   * `foto.costo` no viaja, y este handler ya tuvo un docblock afirmando durante días algo que era
   * falso.
   */
  it('borra costo, sinCosto, margen y markup — y deja intacto todo lo demás', async () => {
    const { sinPlataDeCosto } = await import('../api/_liquidacion.js')
    const item = {
      pid: '1',
      estado: 'aplicado',
      foto: { nombre: 'Funda', sku: 'F-1', costo: 4200, sinCosto: false, precioNormal: 12000, stock: 30, ventas90: 18, imagen: 'x.jpg' },
      decision: { precioSale: 8000, pctDesc: 33, markup: 90, margen: 47, nota: 'ok', porQuien: 'Bruno' },
    }
    const limpio = sinPlataDeCosto(item) as typeof item
    expect(limpio.foto).not.toHaveProperty('costo')
    expect(limpio.foto).not.toHaveProperty('sinCosto')
    expect(limpio.decision).not.toHaveProperty('margen')
    expect(limpio.decision).not.toHaveProperty('markup')
    // La otra mitad: si borrara de más, la pantalla del Resultado se queda sin con qué contar.
    expect(limpio.foto).toEqual({ nombre: 'Funda', sku: 'F-1', precioNormal: 12000, stock: 30, ventas90: 18, imagen: 'x.jpg' })
    expect(limpio.decision).toEqual({ precioSale: 8000, pctDesc: 33, nota: 'ok', porQuien: 'Bruno' })
    expect(limpio.pid).toBe('1')
    expect(limpio.estado).toBe('aplicado')
  })

  it('no explota con un ítem sin foto ni decisión', async () => {
    const { sinPlataDeCosto } = await import('../api/_liquidacion.js')
    expect(sinPlataDeCosto({ pid: '9' })).toEqual({ pid: '9', foto: {}, decision: {} })
  })
})

describe('_liquidacion · la llave de Etiquetas escribe una sola cosa', () => {
  const SOLO_ETIQUETAS = { name: 'Local', admin: false, cuenta: null, acceso: { bdi: { etiquetas: true } }, funcion: [] }
  const postDe = (body: Record<string, unknown>) =>
    conSesion({ method: 'POST', query: { store: 'bdi', etiquetas: '1' }, body: { store: 'bdi', ...body } })

  it('🔴 `aplicar` con ?etiquetas=1 NO entra: escribir precios en la tienda pide Liquidación', async () => {
    // El que importa. Si esto deja de dar 403, cualquiera con Etiquetas escribe precios en GN.
    sesionDe(SOLO_ETIQUETAS)
    const res = await llamar('_liquidacion', postDe({ action: 'aplicar', liq: 'l1', pids: ['1'], modo: 'poner' }))
    expect(res.code).toBe(403)
  })

  it('🔴 ninguna otra action se cuela por la misma puerta', async () => {
    // `stock-campania` y `ventas-campania` son lecturas, pero entran por el POST y contestan datos
    // de la campaña: la llave de Etiquetas no las abre. Van en la lista por lo mismo que las otras
    // —la garantía se ejerce, no se argumenta—, y porque las dos viven ARRIBA del guard del id.
    for (const action of ['crear', 'borrar', 'guardar-item', 'revisar', 'decidir-masivo', 'sumar-items', 'quitar-item', 'ventas-campania', 'stock-campania']) {
      sesionDe(SOLO_ETIQUETAS)
      const res = await llamar('_liquidacion', postDe({ action, liq: 'l1' }))
      expect(res.code, `action «${action}» no puede entrar con la llave de Etiquetas`).toBe(403)
    }
  })

  it('`etiquetado` SÍ entra — si no, el bloque de arriba estaría verde por prohibir todo', async () => {
    sesionDe(SOLO_ETIQUETAS)
    try {
      const res = await llamar('_liquidacion', postDe({ action: 'etiquetado', pids: ['1'] }))
      expect(res.code).not.toBe(403)
    } catch (e) {
      // Pasó el gate y se fue a la base, que es exactamente lo que se quiere probar acá.
      expect(String(e)).toContain('LLEGÓ A LA BASE')
    }
  })

  it('`etiquetado` SIN ?etiquetas=1 vuelve a pedir Liquidación: hacen falta las dos condiciones', async () => {
    sesionDe(SOLO_ETIQUETAS)
    const res = await llamar('_liquidacion', conSesion({ method: 'POST', query: { store: 'bdi' }, body: { store: 'bdi', action: 'etiquetado', pids: ['1'] } }))
    expect(res.code).toBe(403)
  })

  it('y sin el permiso de Etiquetas tampoco, aunque mande las dos condiciones', async () => {
    sesionDe(SIN_NADA)
    const res = await llamar('_liquidacion', postDe({ action: 'etiquetado', pids: ['1'] }))
    expect(res.code).toBe(403)
  })
})
