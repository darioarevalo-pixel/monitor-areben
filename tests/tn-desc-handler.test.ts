import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * La cola de Redacción tiene DOS niveles de permiso, y la línea está donde está el costo:
 * cargar el **insumo** («gasa, botones nacarados») lo hace el local y sólo pide la sección;
 * escribir y **aprobar** un borrador pide el sub `publicar`, porque de ahí en adelante el
 * texto sale a la tienda en vivo.
 *
 * Es una regla que no se ve en ninguna pantalla —las dos personas ven la misma— y que se
 * rompe sola en cuanto alguien mueve un `if`. Por eso está acá.
 */

const llamadas: string[] = []
/** Lo último que se mandó a escribir. Es lo que permite mirar QUÉ quedó, no sólo que no falló. */
let escrito: Record<string, unknown> | null = null
/** Cada `update` por separado: el orden de los pasos ES la regla en `publicar`. */
const updates: Record<string, unknown>[] = []
/** Cada `upsert` por separado. `op:'atributos'` escribe DOS: el atributo y la familia. */
const upserts: Record<string, unknown>[] = []
/** Lo que la base contesta al buscar la fila. `null` = la fila existe pero sin borrador. */
let filaGuardada: Record<string, unknown> | null = { borrador: { parrafo: 'x', bullets: [] } }

/** La ficha guardada del producto. De acá salen los bullets que se publican. */
let atributosGuardados: { atributo: string; valor: string }[] = []

function tabla(nombre?: string) {
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, order: () => q,
    maybeSingle: async () => ({ data: filaGuardada, error: null }),
    upsert: async (fila: Record<string, unknown>) => { llamadas.push('upsert'); upserts.push(fila); escrito = fila; return { error: null } },
    update: (fila: Record<string, unknown>) => { llamadas.push('update'); updates.push(fila); escrito = fila; return q },
    delete: () => { llamadas.push('delete'); return q },
    then: (r: (v: unknown) => void) => r({ data: nombre === 'tn_atributos' ? atributosGuardados : [], error: null }),
  }
  return q
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => tabla(t) }) }))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

/** Alguien del local: ve Redacción en Zattia, pero NO puede aprobar. */
const LOCAL = { name: 'Local', admin: false, cuenta: null, acceso: { zattia: { 'gen-desc': true } }, funcion: [] }
/**
 * Marketing: la misma sección, más el sub que habilita publicar.
 * 🔑 Los subs se guardan PLANOS (`gen-desc.publicar`), no anidados — `puedeSub` es
 * literalmente `puedeVer(perfil, marca, 'key.sub')`. Anidarlo deja la sección visible y el
 * sub apagado, que es un modo de falla silencioso y verosímil.
 */
const MKT = {
  name: 'Marta', admin: false, cuenta: null,
  acceso: { zattia: { 'gen-desc': true, 'gen-desc.publicar': true } },
  funcion: [],
}

const post = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'p' }) },
  query: {},
  body: { recurso: 'tn-desc', store: 'zattia', tn_id: '123', ...body },
})

async function llamar(req: unknown) {
  const mod = await import('@/api/_tn-desc.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

beforeEach(() => {
  llamadas.length = 0
  updates.length = 0
  upserts.length = 0
  escrito = null
  atributosGuardados = []
  filaGuardada = { borrador: { parrafo: 'x', bullets: [] } }
  vi.resetModules()
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'no-es-un-jwt-asi-que-no-se-opina')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('el local carga el insumo sin poder publicar', () => {
  it('🔑 `insumo` NO pide el permiso de aprobar: es la tarea del local', async () => {
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'insumo', insumo: 'gasa, botones nacarados' }))
    expect(res.code).toBe(200)
    expect(llamadas).toContain('upsert')
  })

  it('pero NO puede escribir el borrador, ni aprobarlo, ni sacar la fila', async () => {
    for (const op of ['borrador', 'aprobar', 'quitar']) {
      sesionDe(LOCAL)
      const res = await llamar(post({ op, borrador: { parrafo: 'x', bullets: [] } }))
      expect(res.code, `op ${op}`).toBe(403)
    }
    // ⛔ Y ninguna de las tres llegó a escribir: el 403 sale ANTES de tocar la base.
    expect(llamadas).toEqual([])
  })
})

describe('🆕 la ficha de atributos: la carga el local, con lista cerrada', () => {
  it('🔑 `atributos` NO pide el permiso de aprobar, igual que el insumo', async () => {
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'atributos', familia: 'tops', atributo: 'tela', valor: 'morley' }))
    expect(res.code).toBe(200)
    expect(upserts[0]).toMatchObject({ atributo: 'tela', valor: 'morley', por: 'Local' })
  })

  it('🔴 un valor INVENTADO se rechaza EN EL SERVIDOR', async () => {
    // El `<select>` es una comodidad del que carga. Lo único que separa una lista cerrada de un
    // campo de texto —y con eso, un catálogo que se puede sumar de uno que no— es este chequeo.
    // ⚠️ El 1-sep-2026 dejó de alcanzar con un valor de OTRA familia («wide leg» en un top) para
    // probarlo: prestar entre familias ahora está permitido a pedido de Bruno, así que el caso
    // que ejerce el guard tiene que ser una palabra que no existe en ninguna lista.
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'atributos', familia: 'tops', atributo: 'calce', valor: 'apretadito' }))
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('no es un valor de calce para tops')
    expect(llamadas).toEqual([])
  })

  it('🔑 un valor prestado de otra prenda entra, y queda guardado', async () => {
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'atributos', familia: 'faldas', atributo: 'calce', valor: 'recto' }))
    expect(res.code).toBe(200)
    expect(upserts[0]).toMatchObject({ atributo: 'calce', valor: 'recto' })
  })
})

describe('🆕 las medidas: las carga el local, con la prenda apoyada', () => {
  it('🔑 `medida` NO pide el permiso de aprobar: es el mismo momento que la ficha', async () => {
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'medida', familia: 'tops', ficha: {}, talle: 'S', medida: 'largo', valor: '40' }))
    expect(res.code).toBe(200)
    expect(upserts[0]).toMatchObject({ talle: 'S', medida: 'largo', valor: '40', por: 'Local' })
  })

  it('🔴 se guarda lo MEDIDO, no lo publicado: el x2 de la cintura no está acá', async () => {
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'medida', familia: 'faldas', ficha: {}, talle: '', medida: 'contornoCintura', valor: '34' }))
    expect(res.code).toBe(200)
    expect(upserts[0]).toMatchObject({ medida: 'contornoCintura', valor: '34' })
  })

  it('🔴 el largo NO puede marcarse «estira», y el ancho sí', async () => {
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'medida', familia: 'tops', ficha: {}, talle: '', medida: 'largo', valor: 'estira' }))).code).toBe(400)
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'medida', familia: 'tops', ficha: {}, talle: '', medida: 'ancho', valor: 'estira' }))).code).toBe(200)
  })

  it('⛔ una medida que no es de esa prenda muere en 400, aunque el casillero no se dibuje', async () => {
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'medida', familia: 'tops', ficha: { manga: 'sin mangas' }, talle: '', medida: 'largoManga', valor: '58' }))).code).toBe(400)
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'medida', familia: 'tops', ficha: {}, talle: '', medida: 'contornoCintura', valor: '34' }))).code).toBe(400)
  })

  it('⛔ un texto no es una medida', async () => {
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'medida', familia: 'tops', ficha: {}, talle: '', medida: 'largo', valor: '40 cm' }))).code).toBe(400)
  })

  it('«no lleva medidas» pide un motivo de la lista, y se puede sacar', async () => {
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'sin-medidas', motivo: 'porque si' }))).code).toBe(400)
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'sin-medidas', motivo: 'elastizada' }))
    expect(res.code).toBe(200)
    expect(upserts[0]).toMatchObject({ sin_medidas: 'elastizada', sin_medidas_por: 'Local' })
    sesionDe(LOCAL)
    const off = await llamar(post({ op: 'sin-medidas', motivo: '' }))
    expect(off.code).toBe(200)
    // El último upsert, no el primero: `upserts` acumula los de todo el test.
    expect(upserts[upserts.length - 1]).toMatchObject({ sin_medidas: null, sin_medidas_por: null })
  })

  it('una familia o un atributo inventados mueren en 400 sin tocar la base', async () => {
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'atributos', familia: 'mueble', atributo: 'tela', valor: 'lino' }))).code).toBe(400)
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'atributos', familia: 'tops', atributo: 'vibra', valor: 'linda' }))).code).toBe(400)
    expect(llamadas).toEqual([])
  })

  it('⛔ vacío BORRA la fila en vez de guardar un valor vacío', async () => {
    // Un '' contaría como cargado en el «4/6» y saldría en cualquier group by como una
    // categoría más. Destildar tiene que dejar la ficha como estaba antes de tocarla.
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'atributos', familia: 'tops', atributo: 'tela', valor: '' }))
    expect(res.code).toBe(200)
    expect(res.body?.valor).toBeNull()
    expect(llamadas).toContain('delete')
    expect(llamadas).not.toContain('upsert')
  })

  it('🔑 guarda la FAMILIA en la cola: sin eso, publicar no sabría qué lista mirar', async () => {
    sesionDe(LOCAL)
    await llamar(post({ op: 'atributos', familia: 'pantalon', atributo: 'tiro', valor: 'tiro alto', nombre: 'JEAN DUSK' }))
    // Dos upserts: el atributo y la fila de la cola con su familia.
    expect(upserts).toHaveLength(2)
    expect(upserts[0]).toMatchObject({ atributo: 'tiro', valor: 'tiro alto' })
    expect(upserts[1]).toMatchObject({ familia: 'pantalon', nombre: 'JEAN DUSK' })
  })

  it('🆕 cuando TiendaNube no dice qué prenda es, lo elige la persona (y NO pide publicar)', async () => {
    // Son los dos productos cargados sólo como «NEW IN». Bloquearlos hasta que alguien arregle la
    // categoría en la tienda es dejarlos mudos por algo que no depende de quien está cargando.
    sesionDe(LOCAL)
    const res = await llamar(post({ op: 'familia', familia: 'faldas', nombre: 'BERMUDA TIDE' }))
    expect(res.code).toBe(200)
    expect(upserts[0]).toMatchObject({ familia: 'faldas', nombre: 'BERMUDA TIDE' })
  })

  it('una familia inventada muere en 400 sin tocar la base', async () => {
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'familia', familia: 'mueble' }))).code).toBe(400)
    expect(llamadas).toEqual([])
  })

  it('el detalle es libre, pero tiene tope', async () => {
    sesionDe(LOCAL)
    expect((await llamar(post({ op: 'atributos', familia: 'tops', atributo: 'detalle', valor: 'argolla plateada' }))).code).toBe(200)
    sesionDe(LOCAL)
    const largo = await llamar(post({ op: 'atributos', familia: 'tops', atributo: 'detalle', valor: 'x'.repeat(61) }))
    expect(largo.code).toBe(400)
  })
})

describe('marketing sí', () => {
  it('con el sub `publicar` escribe el borrador y aprueba', async () => {
    sesionDe(MKT)
    expect((await llamar(post({ op: 'borrador', borrador: { parrafo: 'x', bullets: [] } }))).code).toBe(200)
    sesionDe(MKT)
    expect((await llamar(post({ op: 'aprobar' }))).code).toBe(200)
  })

  it('un borrador que no tiene la forma esperada se rechaza en la frontera', async () => {
    sesionDe(MKT)
    const res = await llamar(post({ op: 'borrador', borrador: 'un texto suelto' }))
    expect(res.code).toBe(400)
    expect(llamadas).toEqual([])
  })

  it('una op desconocida muere en 400 y no escribe nada', async () => {
    sesionDe(MKT)
    const res = await llamar(post({ op: 'publicar-en-tn' }))
    expect(res.code).toBe(400)
    expect(String(res.body?.error)).toContain('op desconocida')
    expect(llamadas).toEqual([])
  })

  it('🔑 un borrador NUEVO desaprueba el anterior', async () => {
    // Si no, quedaría «aprobado» un texto que nadie leyó, con la firma y la fecha de quien
    // aprobó el que estaba antes — y esa fila diría «listo para publicar» mintiendo.
    sesionDe(MKT)
    await llamar(post({ op: 'borrador', borrador: { parrafo: 'otro', bullets: [] } }))
    expect(escrito?.estado).toBe('borrador')
    expect(escrito?.aprobado_por).toBeNull()
    expect(escrito?.aprobado_at).toBeNull()
  })

  it('🔑 la firma sale del PERFIL, no del body', async () => {
    // Si saliera del POST, el rastro de quién aprobó un texto que salió a la tienda se podría
    // firmar con el nombre de otro cambiando un campo. Es el molde de `api/_canjes.js`.
    sesionDe(MKT)
    await llamar(post({ op: 'insumo', insumo: 'gasa', usuario: 'Otro Cualquiera', insumo_por: 'Otro Cualquiera' }))
    expect(escrito?.insumo_por).toBe('Marta')
    sesionDe(MKT)
    await llamar(post({ op: 'aprobar', usuario: 'Otro Cualquiera', aprobado_por: 'Otro Cualquiera' }))
    expect(escrito?.aprobado_por).toBe('Marta')
  })

  it('⛔ no se aprueba lo que no está: sin borrador guardado, 400 y sin sellar', async () => {
    // Sin esto la fila quedaría en «aprobado», con firma y fecha, sobre un campo vacío — o sea
    // diciendo «listo para publicar» de algo que nadie escribió.
    filaGuardada = { borrador: null }
    sesionDe(MKT)
    const res = await llamar(post({ op: 'aprobar' }))
    expect(res.code).toBe(400)
    expect(llamadas).not.toContain('update')
  })

  it('sin tn_id no hace nada', async () => {
    sesionDe(MKT)
    const res = await llamar({ ...post({ op: 'insumo' }), body: { recurso: 'tn-desc', store: 'zattia', op: 'insumo' } })
    expect(res.code).toBe(400)
    expect(llamadas).toEqual([])
  })
})

/**
 * `publicar`: el único verbo de este archivo que sale a la tienda en vivo.
 *
 * 🔴 Lo que se prueba acá es el ORDEN, no que «no falle». TiendaNube no tiene historial: la
 * fila `html_previo` es la única copia que va a existir del texto anterior. Si la tienda se
 * escribe antes de que el respaldo confirme, y el respaldo falla, el texto de antes no está
 * en ningún lado del mundo.
 */
describe('publicar: el respaldo va ANTES que la tienda', () => {
  /** El diario de lo que pasó, en orden: los `update` de la base y las llamadas al catálogo. */
  let diario: string[] = []
  /** Lo que contesta el catálogo al escribir. Se cambia por test. */
  let respEscribir: { status: number; body: Record<string, unknown> } = {
    status: 200,
    body: { ok: true, escrito: 'lo que quedó', verificado: true },
  }
  const HTML_ACTUAL = '<h5>Top de red.</h5><!--AREBEN-TALLES-INI--><table><tr><td>S</td></tr></table><!--AREBEN-TALLES-FIN-->'
  /** Lo que el catálogo recibió en el POST de escritura. Es lo que va a quedar en la tienda. */
  let mandado: Record<string, unknown> = {}

  function catalogoFalso(perfil: unknown) {
    diario = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        if (!String(url).includes('tn-categorias')) return { ok: true, json: async () => ({ ok: true, perfil }) }
        if (!init || init.method !== 'POST') {
          diario.push('tn:leer')
          return { ok: true, status: 200, json: async () => ({ ok: true, html: HTML_ACTUAL, hash: 'HASH-1', lang: 'es' }) }
        }
        diario.push('tn:escribir')
        mandado = JSON.parse(String(init.body))
        return { ok: respEscribir.status === 200, status: respEscribir.status, json: async () => respEscribir.body }
      }),
    )
  }

  // ⚠️ El borrador guardado trae bullets (los compuestos al aprobar), pero **no son los que se
  // publican**: al publicar se recomponen desde `tn_atributos`. Ver el test de abajo.
  const APROBADA = {
    borrador: { parrafo: 'Camisa de gasa liviana.', bullets: [{ etiqueta: 'Tela', texto: 'VIEJO' }] },
    estado: 'aprobado',
    familia: 'tops',
  }

  beforeEach(() => {
    filaGuardada = { ...APROBADA }
    respEscribir = { status: 200, body: { ok: true, escrito: 'lo que quedó', verificado: true } }
    mandado = {}
  })

  it('🔴 el respaldo se escribe y confirma ANTES de tocar la tienda', async () => {
    catalogoFalso(MKT)
    const res = await llamar(post({ op: 'publicar' }))
    expect(res.code).toBe(200)
    // La lectura fresca, el respaldo, y RECIÉN AHÍ la escritura.
    expect(updates[0]?.html_previo).toBe(HTML_ACTUAL)
    expect(updates[0]?.hash_previo).toBe('HASH-1')
    expect(updates[0]?.estado).toBe('escribiendo')
    expect(diario).toEqual(['tn:leer', 'tn:escribir'])
    expect(updates.length).toBe(2) // respaldo + registro de lo escrito
  })

  it('🔴 si el respaldo NO se puede guardar, la tienda no se toca', async () => {
    catalogoFalso(MKT)
    const mod = await import('@supabase/supabase-js')
    // La base falla justo en el `update` del respaldo.
    vi.spyOn(mod, 'createClient').mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: APROBADA, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: async () => ({ error: { message: 'la base dijo que no' } }) }) }),
      }),
    } as never)
    const res = await llamar(post({ op: 'publicar' }))
    expect(res.code).toBe(500)
    expect(String(res.body?.error)).toContain('no se escribió en la tienda')
    expect(diario).toEqual(['tn:leer']) // ⛔ nunca se llamó a escribir
  })

  it('lo que se manda a la tienda sale del borrador GUARDADO, y conserva la tabla', async () => {
    catalogoFalso(MKT)
    await llamar(post({ op: 'publicar' }))
    const nuevo = String(mandado.nuevo)
    expect(nuevo).toContain('AREBEN-PROSA-INI')
    expect(nuevo).toContain('Camisa de gasa liviana.')
    expect(nuevo).toContain('<!--AREBEN-TALLES-INI--><table><tr><td>S</td></tr></table><!--AREBEN-TALLES-FIN-->')
    expect(nuevo).toContain('<h5>Top de red.</h5>') // el residuo se conserva por defecto
    expect(mandado.hashPrevio).toBe('HASH-1') // el compare-and-swap viaja
  })

  it('🔑 los bullets se componen desde la FICHA, no salen del borrador guardado', async () => {
    // La ficha es el dato vivo: si alguien la corrigió después de aprobar el texto, lo que sale
    // a la tienda tiene que ser la corrección. El párrafo sí sale del borrador aprobado.
    atributosGuardados = [
      { atributo: 'largo', valor: 'crop' },
      { atributo: 'tela', valor: 'morley' },
    ]
    catalogoFalso(MKT)
    await llamar(post({ op: 'publicar' }))
    const nuevo = String(mandado.nuevo)
    expect(nuevo).toContain('<b>Tela:</b> morley')
    expect(nuevo).toContain('<b>Largo:</b> crop')
    expect(nuevo).not.toContain('VIEJO')
    // Y en el orden canónico, no en el de carga.
    expect(nuevo.indexOf('Tela:')).toBeLessThan(nuevo.indexOf('Largo:'))
  })

  it('destildar «conservar» tira el residuo, pero NUNCA la tabla', async () => {
    catalogoFalso(MKT)
    await llamar(post({ op: 'publicar', conservarResiduo: false }))
    const nuevo = String(mandado.nuevo)
    expect(nuevo).not.toContain('<h5>Top de red.</h5>')
    expect(nuevo).toContain('<!--AREBEN-TALLES-INI-->')
  })

  it('⛔ un borrador que NO está aprobado no sale a la tienda', async () => {
    catalogoFalso(MKT)
    filaGuardada = { ...APROBADA, estado: 'borrador' }
    const res = await llamar(post({ op: 'publicar' }))
    expect(res.code).toBe(400)
    expect(diario).toEqual([]) // ni siquiera se leyó la tienda
    expect(llamadas).toEqual([])
  })

  it('⛔ y el local no puede publicar: es el mismo permiso que aprobar', async () => {
    catalogoFalso(LOCAL)
    const res = await llamar(post({ op: 'publicar' }))
    expect(res.code).toBe(403)
    expect(diario).toEqual([])
  })

  it('🔑 un 409 (alguien la tocó en el medio) se pasa tal cual y la fila queda en «falla»', async () => {
    catalogoFalso(MKT)
    respEscribir = { status: 409, body: { error: 'La descripción cambió en TiendaNube desde que la leíste.', hashActual: 'HASH-2' } }
    const res = await llamar(post({ op: 'publicar' }))
    expect(res.code).toBe(409)
    expect(res.body?.hashActual).toBe('HASH-2')
    const ultimo = updates[updates.length - 1]
    expect(ultimo?.estado).toBe('falla')
    expect(String(ultimo?.error)).toContain('cambió en TiendaNube')
    // 🔑 El respaldo queda igual: es el texto que sigue estando en la tienda.
    expect(updates[0]?.html_previo).toBe(HTML_ACTUAL)
  })

  it('🔴 un PUT con 200 y relectura que NO coincide queda marcado, no silenciado', async () => {
    catalogoFalso(MKT)
    respEscribir = { status: 200, body: { ok: true, escrito: 'otra cosa', verificado: false } }
    const res = await llamar(post({ op: 'publicar' }))
    expect(res.code).toBe(200)
    expect(res.body?.verificado).toBe(false)
    const ultimo = updates[updates.length - 1]
    expect(ultimo?.verificado).toBe(false)
    expect(String(ultimo?.error)).toContain('relectura')
  })
})
