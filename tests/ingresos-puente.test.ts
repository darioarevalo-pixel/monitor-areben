import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bloqueParaElPuente,
  columnasDesdeDisenos,
  normNombre,
  pasarADestino,
  yaEnLaImportacion,
  type DisenoDeTablero,
} from '@/lib/ingresos/puente'
import { conItemsDerivados, nuevoBloque } from '@/lib/ingresos/core'
import { guardarIngresos, leerIngresos } from '@/lib/kv/cliente'
import type { Ingreso } from '@/lib/ingresos/tipos'

/**
 * El puente Diseños → Ingresos. Lo que estos tests defienden no es que copie campos: es que **no
 * fabrique el agujero que el puente vino a cerrar** (columnas sin nombre comercial, que no cruzan
 * con Gestión Nube) ni el que engorda el KV para siempre (fotos en base64).
 */

let n = 0
const nid = () => 'nuevo' + n++
const D = (id: string, name: string, url = 'https://blob/x.jpg'): DisenoDeTablero => ({ id, name, url })
const armar = (ds: DisenoDeTablero[]) => columnasDesdeDisenos(ds, { nid, nombreDe: (d) => d.name, imgDe: (d) => d.url })

describe('columnasDesdeDisenos', () => {
  it('el nombre viaja trimeado y el id de la columna es NUEVO, no el del tablero', () => {
    // El id de columna es la clave de `celdas`: meter ahí ids de otro sistema mezcla dos keyspaces
    // con ciclos de vida distintos. La trazabilidad va en un campo con nombre.
    const out = armar([D('d1', '  Cerezas  ')])
    expect(out.columnas[0].nombre).toBe('Cerezas')
    expect(out.columnas[0].disenoId).toBe('d1')
    expect(out.columnas[0].id).not.toBe('d1')
  })

  it('🔴 img NUNCA empieza con data: — el base64 no entra al KV ni de paso', () => {
    // El KV se reescribe entero en cada guardado de Ingresos y lo lee además Norte: una foto
    // embebida ahí se paga en las dos secciones, para siempre. Sin foto es recuperable; esto no.
    const out = armar([D('d1', 'Cerezas', 'data:image/jpeg;base64,/9j/4AAQSkZJRg')])
    expect(out.columnas[0].img).toBe('')
    expect(JSON.stringify(out)).not.toContain('data:')
    expect(JSON.stringify(out)).not.toContain('base64')
  })

  it('la URL del Blob se copia tal cual, sin volver a subir nada', () => {
    expect(armar([D('d1', 'Cerezas', 'https://blob/x.jpg')]).columnas[0].img).toBe('https://blob/x.jpg')
  })

  it('sin nombre NO viaja: una columna sin nombre no cruza con Gestión Nube', () => {
    const out = armar([D('d1', ''), D('d2', '   '), D('d3', 'Cerezas')])
    expect(out.columnas).toHaveLength(1)
    expect(out.sinNombre.map((d) => d.id)).toEqual(['d1', 'd2'])
  })

  it('avisa cuando dos elegidos normalizan al mismo nombre', () => {
    // En Gestión Nube serían el mismo producto, y la venta de los dos se sumaría en uno.
    expect(armar([D('d1', 'Cerezas'), D('d2', '  CEREZAS ')]).repetidos).toEqual(['cerezas'])
    expect(armar([D('d1', 'Cerezas'), D('d2', 'Mariposa')]).repetidos).toEqual([])
  })

  it('normNombre saca acentos, dobles espacios y mayúsculas', () => {
    expect(normNombre('  Corazón   ROJO ')).toBe('corazon rojo')
  })
})

const ingreso = (over: Partial<Ingreso> = {}): Ingreso => ({
  id: 'g1', desc: 'Diciembre', proveedor: '', fecha: '', estado: 'cotizando', nota: '',
  bloques: [
    { id: 'b1', nombre: 'IMD', modelos: [{ id: 'm1', model: 'iPhone 15' }], disenos: [{ id: 'c1', nombre: 'Vieja', img: '', disenoId: 'd1' }], celdas: { m1: { c1: 5 } } },
    { id: 'b2', nombre: 'Formas', modelos: [], disenos: [{ id: 'c2', nombre: 'Otra', img: '', disenoId: 'd2' }], celdas: {} },
  ],
  gallery: [], ...over,
})

describe('yaEnLaImportacion', () => {
  it('mira TODOS los bloques, no sólo el destino', () => {
    // La misma funda en otro bloque de la misma compra sigue siendo la misma funda pedida dos veces.
    expect([...yaEnLaImportacion(ingreso(), ['d1', 'd2', 'd3'])].sort()).toEqual(['d1', 'd2'])
  })

  it('ignora las columnas viejas que no vinieron por el puente', () => {
    const g = ingreso({ bloques: [{ id: 'b1', nombre: '', modelos: [], disenos: [{ id: 'c9', nombre: 'A mano', img: '' }], celdas: {} }] })
    expect(yaEnLaImportacion(g, ['d1']).size).toBe(0)
  })
})

describe('pasarADestino', () => {
  const cols = armar([D('d9', 'Nueva')]).columnas

  it('agrega al final del bloque elegido y no toca celdas ni los otros bloques', () => {
    const antes = [ingreso()]
    const out = pasarADestino(antes, 'g1', 'b1', cols)
    expect(out[0].bloques[0].disenos.map((d) => d.nombre)).toEqual(['Vieja', 'Nueva'])
    expect(out[0].bloques[0].celdas).toEqual({ m1: { c1: 5 } })
    // Identidad: el bloque que no se tocó tiene que ser el MISMO objeto, no una copia.
    expect(out[0].bloques[1]).toBe(antes[0].bloques[1])
  })

  it('no muta la lista de entrada ni toca los otros ingresos', () => {
    const otro = ingreso({ id: 'g2' })
    const antes = [ingreso(), otro]
    const out = pasarADestino(antes, 'g1', 'b1', cols)
    expect(antes[0].bloques[0].disenos).toHaveLength(1)
    expect(out[1]).toBe(otro)
  })

  it('sin columnas devuelve la MISMA lista: no se escribe por nada', () => {
    const antes = [ingreso()]
    expect(pasarADestino(antes, 'g1', 'b1', [])).toBe(antes)
  })
})

describe('bloqueParaElPuente', () => {
  it('🔑 nace con CERO columnas vacías', () => {
    // `nuevoBloque` nace con 10 huecos, que es lo que quiere quien arma una importación a mano.
    // Con el puente las columnas ya vienen: usar aquél dejaría 34 fundas + 10 columnas en blanco.
    expect(bloqueParaElPuente(nid, 'IMD', []).disenos).toHaveLength(0)
    expect(nuevoBloque(nid, 'IMD', 10).disenos).toHaveLength(10)
  })

  it('conserva los modelos que se le pasan y arranca sin celdas', () => {
    const b = bloqueParaElPuente(nid, '', [{ id: 'm1', model: 'iPhone 15' }])
    expect(b.modelos).toHaveLength(1)
    expect(b.celdas).toEqual({})
  })
})

describe('lo que se manda al KV', () => {
  it('🔴 TODOS los ingresos salen con items, incluido uno en formato viejo', () => {
    // Si un registro viejo del KV pasara sin normalizar por `conItemsDerivados`, `derivarItems`
    // haría `g.bloques || []` y le dejaría `items: []`: una importación de miles de unidades
    // contada como vacía. Es la misma trampa que documenta useNorte.
    const salida = pasarADestino([ingreso(), ingreso({ id: 'g2' })], 'g1', 'b1', armar([D('d9', 'Nueva')]).columnas).map(conItemsDerivados)
    for (const g of salida) expect(Array.isArray(g.items)).toBe(true)
    expect(salida.find((g) => g.id === 'g1')!.items!.some((i) => i.cantidad > 0)).toBe(true)
  })
})

/**
 * 🔴 El seam del KV. Esto no prueba que `fetch` funcione: prueba que **la invariante que casi costó
 * 305 clientes del CRM no se pueda romper desde acá**.
 *
 * Ingresos vive en el KV de `bdi-catalogo` y cada guardado **reescribe el array entero**. Si la
 * lectura previa falla y alguien cae a `[]`, guardar **borra la clave**. El servidor no protege: su
 * única guarda es `if (!map || typeof map !== 'object') return 400`, y `[]` pasa.
 *
 * Los cuatro modos de falla están calcados de `tests/kv.test.ts`, que los verificó leyendo el
 * handler del otro repo — el que más duele es el **500 con JSON válido**, porque `r.json()` no tira
 * y un `try/catch` no lo caza.
 */
describe('la disciplina del KV — que no se pueda borrar la clave', () => {
  const resp = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
  const noJson = (status: number) => ({
    ok: false,
    status,
    json: async () => {
      throw new Error('no es JSON')
    },
  })

  afterEach(() => vi.unstubAllGlobals())

  const FALLAS = [
    ['500 con JSON válido (el modo real del KV caído)', () => Promise.resolve(resp(500, { error: 'KV no configurado' }))],
    ['200 con ok:false', () => Promise.resolve(resp(200, { ok: false }))],
    ['respuesta no-JSON (502 con HTML)', () => Promise.resolve(noJson(502))],
    ['error de red (lo único que un catch cazaba)', () => Promise.reject(new Error('network'))],
  ] as const

  for (const [nombre, falla] of FALLAS) {
    it(`leerIngresos NO dice "está vacío" cuando falla: ${nombre}`, async () => {
      vi.stubGlobal('fetch', vi.fn(falla))
      const r = await leerIngresos<Ingreso>('bdi')
      // Lo importante: `ok:false`, ⛔ nunca `{ok:true, dato:[]}`. Confundir "no pude leer" con "no
      // hay nada" es literalmente el bug.
      expect(r.ok).toBe(false)
    })
  }

  it('🔴 sin `cargado`, guardarIngresos NO manda el POST', () => {
    // No es que devuelva un error después de escribir: el `fetch` **no se llama**. La única forma de
    // llegar al POST es contestando la pregunta "¿pude leer esto antes de pisarlo?".
    const espia = vi.fn(() => Promise.resolve(resp(200, { ok: true })))
    vi.stubGlobal('fetch', espia)
    return guardarIngresos({ store: 'bdi', ingresos: [], cred: null, cargado: false }).then((r) => {
      expect(r.ok).toBe(false)
      expect(espia).not.toHaveBeenCalled()
    })
  })

  it('un 403 vuelve marcado como prohibido, para poder decir de dónde viene', () => {
    // El gate que valida es `bdi-catalogo/api/ingresos.js` y pide **admin**. Sin este flag, alguien
    // con `ingresos.editar` y sin admin lee "error al guardar" y no tiene idea de qué le falta.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(resp(403, { error: 'no autorizado' }))))
    return guardarIngresos({ store: 'bdi', ingresos: [], cred: null, cargado: true }).then((r) => {
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.prohibido).toBe(true)
    })
  })
})
