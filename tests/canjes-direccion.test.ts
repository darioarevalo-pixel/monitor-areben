import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { digitosDelCp, provinciaCorregida, provinciaDelCp } from '../lib/canjes/direccion.core.js'

// El guard salió de un hecho medido, no de una idea: al cargar las trece etiquetas del 1 y 2 de
// septiembre de 2026 en Envío Nube, **cuatro de trece fichas decían «Buenos Aires» siendo CABA** y
// una decía literalmente «Provincia». Los dos campos son texto libre y ninguna pantalla los cruzaba,
// así que el error sólo aparecía tipeando la etiqueta — donde elegir mal la provincia manda el
// paquete a otra jurisdicción postal.

describe('los cuatro dígitos del código postal', () => {
  it('lee el CP viejo y el CPA nuevo como el mismo número', () => {
    expect(digitosDelCp('1406')).toBe(1406)
    expect(digitosDelCp('C1406DGH')).toBe(1406)
    expect(digitosDelCp(' 1406 ')).toBe(1406)
    expect(digitosDelCp(1406)).toBe(1406)
  })

  // Recortar sería inventar una respuesta sobre un dato que nadie escribió: `14060` es un error de
  // tipeo, y leerlo como `1406` corregiría la provincia contra un CP que no existe.
  it('con una cantidad de dígitos que no sea cuatro, no contesta', () => {
    expect(digitosDelCp('14060')).toBeNull()
    expect(digitosDelCp('140')).toBeNull()
    expect(digitosDelCp('')).toBeNull()
    expect(digitosDelCp(null)).toBeNull()
    expect(digitosDelCp(undefined)).toBeNull()
    expect(digitosDelCp('CABA')).toBeNull()
  })
})

describe('la provincia que afirma el código postal', () => {
  // Las dos puntas del rango, que es donde vive el error de un `<` que debería ser `<=`.
  it('1000 y 1499 son CABA, y son los bordes', () => {
    expect(provinciaDelCp('1000')).toBe('Ciudad Autónoma de Buenos Aires')
    expect(provinciaDelCp('1499')).toBe('Ciudad Autónoma de Buenos Aires')
    expect(provinciaDelCp('1406')).toBe('Ciudad Autónoma de Buenos Aires')
  })

  it('999 y 1500 ya no lo son', () => {
    expect(provinciaDelCp('0999')).toBeNull()
    expect(provinciaDelCp('1500')).toBeNull()
  })

  // El `null` es la respuesta normal: de casi ningún CP argentino se deduce la provincia sin
  // ambigüedad, y por eso la tabla tiene un solo rango. Un CP de Berisso (1923) es Buenos Aires y
  // uno de Rosario (2000) es Santa Fe, pero eso acá no se afirma.
  it('de los demás no dice nada, aunque se sepa por otro lado', () => {
    expect(provinciaDelCp('1923')).toBeNull()
    expect(provinciaDelCp('2000')).toBeNull()
    expect(provinciaDelCp('5000')).toBeNull()
    expect(provinciaDelCp('3000')).toBeNull()
  })
})

describe('la corrección de la provincia contra el CP', () => {
  // Éste es el caso real: la ficha de Abril Gobio decía «Buenos Aires» con CP 1406.
  it('con un CP de CABA, «Buenos Aires» se corrige', () => {
    const r = provinciaCorregida('Buenos Aires', '1406')
    expect(r.provincia).toBe('Ciudad Autónoma de Buenos Aires')
    expect(r.corregida).toBe(true)
  })

  it('y «Provincia», que fue lo que llegó a escribir una, también', () => {
    expect(provinciaCorregida('Provincia', '1425').provincia).toBe('Ciudad Autónoma de Buenos Aires')
  })

  // Si ya está bien, no se toca: `corregida: false` es lo que le permite al handler no escribir de
  // más y a la pantalla no avisar de un cambio que no hubo.
  it('lo que ya está bien no se toca, se escriba como se escriba', () => {
    expect(provinciaCorregida('Ciudad Autónoma de Buenos Aires', '1406').corregida).toBe(false)
    expect(provinciaCorregida('CIUDAD AUTÓNOMA DE BUENOS AIRES', '1406').corregida).toBe(false)
    expect(provinciaCorregida('  ciudad autónoma de buenos aires  ', '1406').corregida).toBe(false)
  })

  // La otra punta, que es la que impide que esto se convierta en "la provincia la decide el sistema":
  // fuera del único rango medido, lo que escribió la persona manda.
  it('fuera de CABA no corrige nada, ni siquiera algo que parece mal', () => {
    const r = provinciaCorregida('Buenos Aires', '2000')
    expect(r.provincia).toBe('Buenos Aires')
    expect(r.corregida).toBe(false)
  })

  // ⛔ Completar un obligatorio por atrás sería darle por afirmado a alguien un dato que no escribió;
  // el vacío tiene que llegar vacío al control de faltantes, para que el formulario lo reclame.
  it('no INVENTA una provincia donde no había', () => {
    for (const vacio of ['', '   ', null, undefined]) {
      const r = provinciaCorregida(vacio, '1406')
      expect(r.provincia).toBe(vacio)
      expect(r.corregida).toBe(false)
    }
  })

  it('sin CP usable tampoco corrige', () => {
    expect(provinciaCorregida('Buenos Aires', '').corregida).toBe(false)
    expect(provinciaCorregida('Buenos Aires', null).corregida).toBe(false)
    expect(provinciaCorregida('Buenos Aires', '14060').corregida).toBe(false)
  })
})

// ── Que el HANDLER DEL EQUIPO la llame ───────────────────────────────────────────
//
// La regla de arriba es pura y ya está probada; lo que falta probar es que el otro lado que escribe
// efectivamente la use. Y es el lado que importa: **las cuatro fichas que salieron mal las había
// tipeado el equipo desde la ficha, no ella desde el portal.** Sin este bloque, borrar la corrección
// de `persona-editar` deja la suite entera en verde.
//
// Es comportamiento del handler, no una regla: monta un supabase de mentira y llama a `_canjes.js`,
// igual que `tests/canje-notas.test.ts`.

type MundoPersona = { persona: Record<string, unknown>; updates: Record<string, unknown>[] }
let mundo: MundoPersona

function fakeSupabase() {
  const desde = (tabla: string) => {
    const ctx: { tabla: string; update: Record<string, unknown> | null } = { tabla, update: null }
    const resolver = async () => {
      if (ctx.update) {
        mundo.updates.push(ctx.update)
        Object.assign(mundo.persona, ctx.update)
        return { data: null, error: null }
      }
      if (ctx.tabla === 'canje_personas') return { data: mundo.persona, error: null }
      return { data: [], error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      is: () => api,
      order: () => api,
      update: (row: Record<string, unknown>) => { ctx.update = row; return api },
      maybeSingle: () => resolver(),
      single: () => resolver(),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => resolver().then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_auth.js', () => ({
  soloMismoOrigen: () => false,
  exigirUsuario: async () => ({ name: 'Sofi', email: 'sofi@arebensrl.com', admin: true }),
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

async function editar(body: Record<string, unknown>) {
  const mod = await import('@/api/_canjes.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    { method: 'POST', headers: {}, query: {}, body: { store: 'bdi', action: 'persona-editar', id: 7, ...body } },
    res,
  )
  return res
}

const ultimoUpdate = () => mundo.updates[mundo.updates.length - 1] ?? {}

beforeEach(() => {
  vi.resetModules()
  mundo = {
    persona: { id: 7, instagram: 'lu', cp: '1406', provincia: 'Buenos Aires' },
    updates: [],
  }
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'service')
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('persona-editar corrige la provincia contra el CP', () => {
  it('editando la provincia a mano, la guarda corregida', async () => {
    const res = await editar({ provincia: 'Buenos Aires' })
    expect(res.code).toBe(200)
    expect(ultimoUpdate().provincia).toBe('Ciudad Autónoma de Buenos Aires')
  })

  // El caso que se pasa por alto: si en la misma edición le cambian el CP, la provincia se juzga
  // contra el NUEVO. Con el viejo (1406, CABA) esta corrección no tendría que ocurrir.
  it('la juzga contra el CP que queda después de la edición, no contra el que había', async () => {
    mundo.persona = { id: 7, instagram: 'lu', cp: '2000', provincia: 'Santa Fe' }
    const res = await editar({ cp: '1425', provincia: 'Buenos Aires' })
    expect(res.code).toBe(200)
    expect(ultimoUpdate().provincia).toBe('Ciudad Autónoma de Buenos Aires')
  })

  // Y al revés: mover el CP fuera de CABA no puede arrastrar la provincia a CABA por el valor viejo.
  it('si el CP nuevo no es de CABA, no corrige nada', async () => {
    const res = await editar({ cp: '2000', provincia: 'Santa Fe' })
    expect(res.code).toBe(200)
    expect(ultimoUpdate().provincia).toBe('Santa Fe')
  })

  // Tocar SÓLO el CP también tiene que corregir: la provincia mal ya estaba guardada, y el que la
  // arregla suele ser el que corrige el código postal.
  it('corrigiendo sólo el CP, alcanza para arreglar la provincia que ya estaba mal', async () => {
    mundo.persona = { id: 7, instagram: 'lu', cp: '9999', provincia: 'Buenos Aires' }
    const res = await editar({ cp: '1406' })
    expect(res.code).toBe(200)
    expect(ultimoUpdate().provincia).toBe('Ciudad Autónoma de Buenos Aires')
  })

  // ⛔ Y si la provincia ya está bien, tampoco entra al update aunque el bloque haya corrido. Un
  // campo de más en un `update` no es inocuo: `persona-editar` escribe lo que le pasan y dos
  // personas editando la misma ficha a la vez se pisan el campo que ninguna de las dos tocó, con un
  // valor leído antes. Por eso el handler mira `corregida` y no escribe el resultado siempre.
  it('con la provincia ya correcta, no la agrega al update', async () => {
    mundo.persona = { id: 7, instagram: 'lu', cp: '1406', provincia: 'Ciudad Autónoma de Buenos Aires' }
    const res = await editar({ cp: '1425' })
    expect(res.code).toBe(200)
    expect(ultimoUpdate().cp).toBe('1425')
    expect(ultimoUpdate()).not.toHaveProperty('provincia')
  })

  // ⛔ Y una edición que no toca ni el CP ni la provincia no puede escribir la provincia de prepo:
  // `persona-editar` guarda sólo lo que vino, y meter una clave de más acá sería reescribir un campo
  // que nadie tocó en un update que la pantalla cree acotado.
  it('editando otra cosa, no mete la provincia en el update', async () => {
    const res = await editar({ telefono: '3415550000' })
    expect(res.code).toBe(200)
    expect(ultimoUpdate()).not.toHaveProperty('provincia')
  })
})
