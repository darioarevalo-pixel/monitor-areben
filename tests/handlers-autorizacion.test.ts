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
  { archivo: '_disenos-rondas', llave: 'disenos', que: 'las rondas de votación (y sus tokens)' },
  { archivo: '_solicitudes', llave: 'solicitudes', que: 'las solicitudes' },
  { archivo: '_tn-ignorados', llave: 'tncat', que: 'los productos apartados de la revisión' },
  { archivo: '_tn-fotos-verificadas', llave: 'tncat', que: 'las fotos ya verificadas' },
  { archivo: '_tn-desc', llave: 'gen-desc', que: 'la cola de descripciones' },
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
  // Nació con gate (23-ago-2026). Entra igual: lo que guarda es correspondencia de clientes, y el
  // 403 antes de tocar la base es lo que no se ve en ninguna pantalla.
  { archivo: '_buzon', llave: 'buzon', que: 'los mensajes de clientes' },
  // También nació con gate (23-ago-2026). Entra igual por la mitad que `puedeVer` no cubre: su
  // tabla vive en la base de CADA marca, así que la `store` del request elige a qué base se pega.
  { archivo: '_pedidos-clientes', llave: 'pedidos-clientes', que: 'los faltantes' },
  // Nació con gate (23-ago-2026). Entra igual porque es la puerta que sirve PLATA por día: es
  // exactamente lo que el ETL no baja al navegador, así que acá el 403 no lo respalda ningún
  // recorte del bundle.
  { archivo: '_ventas-diarias', llave: 'ventas-mensuales', que: 'la venta diaria en plata' },
  // Nació con gate (24-ago-2026). Entra igual por la misma mitad que `_pedidos-clientes`: su tabla
  // vive en la base de CADA marca, así que la `store` del request elige a qué base se pega — y acá
  // además el GET cruza contra `productos.unit_cost`, que es plata.
  { archivo: '_clavados', llave: 'productos', que: 'los clavados de la marca' },
  // Nació con gate (26-ago-2026). Su tabla vive en UNA sola base para las dos marcas, así que el
  // gate es lo único que separa las recepciones de una marca de las de la otra: sin él, `store` es
  // un filtro que el que llama elige, no un candado.
  { archivo: '_recepciones', llave: 'recepciones', que: 'las recepciones de la marca' },
  // Nació con gate (28-ago-2026). Entra igual porque ESCRIBE, y porque su tabla vive en UNA sola
  // base para las dos marcas: sin el gate, `store` sería un filtro que el que llama elige, no un
  // candado. Y además lee `ventas` de la otra base para medir el ritmo.
  { archivo: '_insumos', llave: 'insumos', que: 'el catálogo de insumos y su libro' },
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
  { archivo: '_pedidos-clientes', llave: 'pedidos-clientes', que: 'los faltantes de la otra marca' },
  { archivo: '_clavados', llave: 'productos', que: 'los clavados de la otra marca' },
  { archivo: '_ventas-diarias', llave: 'ventas-mensuales', que: 'la venta diaria de la otra marca' },
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
 * 🔴 **Ventas de Marketing NO abre `_liquidacion`, y eso es una decisión, no un olvido.**
 *
 * El resultado del sale llegó a estar en esa pantalla —con una quinta llave que servía los ítems
 * sin costo— y **lo sacó Bruno mirándolo**: *«esto en la vista marketing borralo, sólo sirve en
 * análisis»*. Con el bloque se fue la llave: una puerta de permisos sin consumidor es peor que no
 * tenerla, porque nadie la mira y sigue abierta.
 *
 * Este bloque existe para que volver a abrirla sea **una decisión con un test en rojo adelante** y
 * no un `||` que alguien agrega sin darse cuenta de qué está sirviendo.
 */
describe('_liquidacion · Ventas de Marketing no entra', () => {
  const SOLO_MKT = { name: 'Marketing', admin: false, cuenta: null, acceso: { bdi: { 'mkt-ventas': true } }, funcion: [] }

  it('🔴 el GET no entra, ni pelado ni con `?resultado=1`', async () => {
    sesionDe(SOLO_MKT)
    for (const query of [{ store: 'bdi' }, { store: 'bdi', resultado: '1' }]) {
      const res = await llamar('_liquidacion', conSesion({ query }))
      expect(res.code, JSON.stringify(query)).toBe(403)
    }
  })

  it('🔴 tampoco las dos lecturas que hace el Resultado por POST', async () => {
    sesionDe(SOLO_MKT)
    for (const action of ['ventas-campania', 'stock-campania', 'aplicar', 'crear']) {
      const res = await llamar('_liquidacion', conSesion({ method: 'POST', query: { store: 'bdi' }, body: { store: 'bdi', action, liq: 'l1', pids: ['1'] } }))
      expect(res.code, `action «${action}»`).toBe(403)
    }
  })

  // La mitad que evita el falso positivo de «prohibir todo»: con la sección de Liquidación SÍ entra.
  it('con Liquidación sí entra — si no, lo de arriba estaría verde por la razón equivocada', async () => {
    sesionDe({ name: 'Análisis', admin: false, cuenta: null, acceso: { bdi: { liquidacion: true } }, funcion: [] })
    try {
      const res = await llamar('_liquidacion', conSesion({ query: { store: 'bdi' } }))
      expect(res.code).not.toBe(403)
    } catch (e) {
      expect(String(e)).toContain('LLEGÓ A LA BASE')
    }
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

/**
 * 🔴 **La puerta ANGOSTA de la bandeja de retornos, y por qué necesita su propio bloque.**
 *
 * Depósito ⛔ **no tiene ninguna de las tres secciones de Reclamos** (`SECCIONES_RECLAMOS`): abre
 * `retornos` y nada más. Por eso `_reclamos.js` tiene un segundo gate al lado del de arriba — con el
 * permiso de la bandeja se puede leer `vista=retornos` (columnas mínimas, sin relato, sin montos y
 * sin el token del portal) y hacer **los gestos físicos**, que son los que enumera
 * `ACCIONES_DE_LA_BANDEJA`. Es una lista escrita a mano, y el bloque de arriba ⛔ no la mira: los
 * `PUERTAS` prueban «tiene la sección / no la tiene», no «tiene ESTA otra sección».
 *
 * 🔴 **Y ahí se coló un 403 durante dos días.** El tercer andén («Falta despachar») se construyó el
 * 26-ago-2026 **exactamente porque Depósito no puede abrir Reclamos**: el botón «Despaché» vivía del
 * lado equivocado de la puerta. El botón se mudó a `Retornos.tsx` y la lista se quedó en dos ⇒ la
 * persona que pone el paquete en la calle apretaba y recibía un 403. **Cuarta vuelta del agujero
 * propio del módulo**, y ⛔ no lo vio ningún test porque los dos lados estaban bien: el agujero
 * estaba en la pregunta del medio.
 *
 * ⚠️ La mitad negativa pesa igual que la positiva, y por eso están las dos: `estado` acepta los ocho
 * estados —**cerrar y anular incluidos**— y `decidir` mueve plata. Que Depósito ⛔ no llegue a
 * ninguno de los dos es lo que hace que «angosta» signifique algo.
 */
describe('la puerta angosta de Retornos: Depósito hace los tres gestos y nada más', () => {
  /** Depósito de verdad: la función le da `retornos` por área, y ⛔ ninguna sección de Reclamos. */
  const DEPOSITO = { name: 'Depósito', admin: false, cuenta: null, acceso: {}, funcion: ['deposito'] }

  /** Pasó el gate = llegó a la base (el `createClient` mockeado tira) o contestó algo que no es 403. */
  async function paso(req: unknown) {
    try { return (await llamar('_reclamos', req)).code !== 403 } catch (e) {
      expect(String(e)).toContain('LLEGÓ A LA BASE')
      return true
    }
  }

  const postDe = (action: string) => conSesion({ method: 'POST', body: { store: 'bdi', action, id: 1 } })

  for (const action of ['recibir', 'reingreso', 'despachado']) {
    it(`deja hacer «${action}», que es un gesto con el paquete en la mano`, async () => {
      sesionDe(DEPOSITO)
      expect(await paso(postDe(action))).toBe(true)
    })
  }

  for (const action of ['decidir', 'liberar-decision', 'estado', 'eliminar', 'cupon-emitido', 'reintegro']) {
    it(`⛔ NO deja hacer «${action}»`, async () => {
      sesionDe(DEPOSITO)
      expect((await llamar('_reclamos', postDe(action))).code).toBe(403)
    })
  }

  it('deja leer la bandeja', async () => {
    sesionDe(DEPOSITO)
    expect(await paso(conSesion({ query: { store: 'bdi', vista: 'retornos' } }))).toBe(true)
  })

  it('⛔ pero NO el listado completo ni el token del portal público', async () => {
    sesionDe(DEPOSITO)
    expect((await llamar('_reclamos', conSesion())).code).toBe(403)
    expect((await llamar('_reclamos', conSesion({ query: { store: 'bdi', vista: 'token', id: '1' } }))).code).toBe(403)
  })
})
