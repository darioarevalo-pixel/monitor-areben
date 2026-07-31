import { describe, it, expect } from 'vitest'
import {
  aplicarRecortes,
  armarFilas,
  buscar,
  categoriasDe,
  ordenar,
  predicadoDe,
  referenciaDe,
  resumen,
  type FilaAuditoria,
} from '@/lib/tncat/prioridad'
import { huellaDe } from '@/lib/tncat/auditoria'
import type { ProductoFchk, VarianteFchk } from '@/lib/tncat/tipos'

const v = (color: string | null, image_url: string | null, over: Partial<VarianteFchk> = {}): VarianteFchk => ({
  color,
  image_url,
  ...over,
})

const prod = (id: string, variantes: VarianteFchk[], over: Partial<ProductoFchk> = {}): ProductoFchk => ({
  id,
  name: 'P' + id,
  image_count: 1,
  imagenes: [{ id: 'i1', src: 'a.jpg' }],
  variantes,
  ...over,
})

/** Un producto con `n` variantes repartidas en `colores`, todas con la MISMA foto (choque). */
const cruzado = (id: string, colores: string[], porColor = 1, over: Partial<ProductoFchk> = {}) =>
  prod(
    id,
    colores.flatMap((c) => Array.from({ length: porColor }, () => v(c, 'misma.jpg'))),
    over,
  )

/**
 * El punto del módulo: BORDER CASE (3 variantes cruzadas) y PROTECTOR DE CÁMARA METALIZADO (63)
 * no pueden quedar en la misma fila. Si estos tests no pasan, la lista vuelve a ordenar por
 * nombre y se le dedica el mismo esfuerzo al producto de salida que al que ensucia 63
 * publicaciones.
 */
describe('prioridad — se cuentan publicaciones, no productos', () => {
  it('el producto grande queda arriba del chico aunque los dos estén rotos', () => {
    const border = cruzado('border', ['A', 'B', 'C']) // 3 variantes
    const metalizado = cruzado('metal', ['A', 'B', 'C', 'D', 'E', 'F', 'G'], 9) // 63 variantes
    const filas = ordenar(armarFilas([border, metalizado]))
    expect(filas[0].producto.id).toBe('metal')
    expect(filas[0].estado.variantesCruzadas).toBe(54)
    expect(filas[1].estado.variantesCruzadas).toBe(2)
  })

  it('la foto cruzada pesa más que el color sin foto', () => {
    // Engañar al cliente (compra violeta, recibe negra) es peor que mostrarle un hueco.
    const cruz = cruzado('c', ['A', 'B'], 2) // 4 variantes, 2 cruzadas
    const sin = prod('s', [v('A', null), v('B', null), v('C', null), v('D', null)]) // 4 sin foto
    const [primero] = ordenar(armarFilas([sin, cruz]))
    expect(primero.producto.id).toBe('c')
  })

  it('a igual impacto ordena alfabético para que la lista no baile', () => {
    const filas = ordenar(armarFilas([cruzado('zzz', ['A', 'B']), cruzado('aaa', ['A', 'B'])]))
    expect(filas.map((f) => f.producto.name)).toEqual(['Paaa', 'Pzzz'])
  })

  it('lo que se vende pesa más que lo parado', () => {
    const ventas = new Map([['vende', 200], ['parado', 0]])
    const filas = ordenar(
      armarFilas([cruzado('parado', ['A', 'B']), cruzado('vende', ['A', 'B'])], { ventas90PorTn: ventas }),
    )
    expect(filas[0].producto.id).toBe('vende')
  })

  it('sin dato de ventas no se lo trata como parado', () => {
    // El cruce GN⨯TN es difuso: no encontrarlo no es lo mismo que "no vende".
    const ventas = new Map([['parado', 0]])
    const filas = ordenar(armarFilas([cruzado('parado', ['A', 'B']), cruzado('desco', ['A', 'B'])], { ventas90PorTn: ventas }))
    expect(filas[0].producto.id).toBe('desco')
  })

  it('el producto sin ninguna foto entra en la lista y en el filtro de sin-foto', () => {
    const vacio: ProductoFchk = { id: 'v', name: 'DISTRIC CASE GRAY', image_count: 0, imagenes: [], variantes: [] }
    const f = armarFilas([vacio])[0]
    expect(predicadoDe('todo')(f)).toBe(true)
    expect(predicadoDe('sin-foto')(f)).toBe(true)
    expect(predicadoDe('fotografia')(f)).toBe(true)
    expect(f.impacto).toBeGreaterThan(0)
  })

  it('sin problema el impacto es cero', () => {
    const sano = prod('ok', [v('A', 'a.jpg'), v('B', 'b.jpg')], {
      imagenes: [{ id: '1', src: 'a.jpg' }, { id: '2', src: 'b.jpg' }],
    })
    expect(armarFilas([sano])[0].impacto).toBe(0)
  })

  it('el resumen cuenta publicaciones y productos', () => {
    const r = resumen(armarFilas([cruzado('a', ['A', 'B'], 2), prod('b', [v('X', null), v('Y', 'y.jpg')])]))
    expect(r.cruzadas).toBe(2)
    expect(r.sinFoto).toBe(1)
    expect(r.productos).toBe(2)
  })
})

describe('prioridad — filtros por tipo de problema', () => {
  const conChoque = armarFilas([cruzado('c', ['A', 'B'])])[0]
  const sinFoto = armarFilas([prod('s', [v('A', null), v('B', 'a.jpg')])])[0]

  it('cruzada agarra solo el choque', () => {
    expect(predicadoDe('cruzada')(conChoque)).toBe(true)
    expect(predicadoDe('cruzada')(sinFoto)).toBe(false)
  })

  it('sin-foto agarra solo el hueco', () => {
    expect(predicadoDe('sin-foto')(sinFoto)).toBe(true)
    expect(predicadoDe('sin-foto')(conChoque)).toBe(false)
  })

  it('separa lo que se arregla acá de lo que hay que fotografiar', () => {
    // Sin fotos libres no hay nada que vincular: es trabajo de la sesión de fotos.
    const soloFoto = armarFilas([cruzado('f', ['A', 'B'], 1, { imagenes: [{ id: 'i', src: 'misma.jpg' }] })])[0]
    expect(predicadoDe('fotografia')(soloFoto)).toBe(true)
    expect(predicadoDe('escritorio')(soloFoto)).toBe(false)
    expect(predicadoDe('escritorio')(conChoque)).toBe(true)
  })
})

describe('prioridad — recortes', () => {
  const filas = (over: Partial<ProductoFchk> = {}, ctx = {}) => armarFilas([cruzado('1', ['A', 'B'], 1, over)], ctx)

  it('sin stock se saca solo si hay dato', () => {
    expect(aplicarRecortes(filas({}, { stockPorTn: new Map([['1', 0]]) }), { soloConStock: true })).toHaveLength(0)
    expect(aplicarRecortes(filas(), { soloConStock: true })).toHaveLength(1)
  })

  it('lo que no se vende se saca solo si hay dato — es lo que hace manejable a Zattia', () => {
    expect(aplicarRecortes(filas({}, { ventas90PorTn: new Map([['1', 0]]) }), { soloQueSeVende: true })).toHaveLength(0)
    expect(aplicarRecortes(filas({}, { ventas90PorTn: new Map([['1', 4]]) }), { soloQueSeVende: true })).toHaveLength(1)
    expect(aplicarRecortes(filas(), { soloQueSeVende: true })).toHaveLength(1)
  })

  it('descarta lo despublicado y lo chico', () => {
    expect(aplicarRecortes(filas({ published: false }), { soloPublicado: true })).toHaveLength(0)
    expect(aplicarRecortes(filas(), { minVariantes: 10 })).toHaveLength(0)
    expect(aplicarRecortes(filas(), { minVariantes: 2 })).toHaveLength(1)
  })

  it('el ignorado no aparece', () => {
    expect(aplicarRecortes(filas(), { ignorados: new Set(['1']) })).toHaveLength(0)
  })

  it('filtra por categoría exacta', () => {
    expect(aplicarRecortes(filas({ categories: ['Remeras', 'Sale'] }), { categoria: 'Sale' })).toHaveLength(1)
    expect(aplicarRecortes(filas({ categories: ['Pantalones'] }), { categoria: 'Sale' })).toHaveLength(0)
    expect(aplicarRecortes(filas({ categories: ['Pantalones'] }), { categoria: null })).toHaveLength(1)
  })

  it('los recortes se acumulan', () => {
    const f = filas({ categories: ['Sale'] }, { stockPorTn: new Map([['1', 3]]), ventas90PorTn: new Map([['1', 0]]) })
    expect(aplicarRecortes(f, { categoria: 'Sale', soloConStock: true })).toHaveLength(1)
    expect(aplicarRecortes(f, { categoria: 'Sale', soloConStock: true, soloQueSeVende: true })).toHaveLength(0)
  })

  it('categoriasDe: únicas y ordenadas', () => {
    const f = armarFilas([
      cruzado('1', ['A', 'B'], 1, { categories: ['Sale', 'Remeras'] }),
      cruzado('2', ['A', 'B'], 1, { categories: ['Remeras'] }),
    ])
    expect(categoriasDe(f)).toEqual(['Remeras', 'Sale'])
  })
})

/**
 * La huella es lo que hace que el trabajo se haga una sola vez sin quedar ciego: si alguien
 * toca las fotos, el verificado se cae solo.
 */
describe('prioridad — verificado con huella', () => {
  const p = cruzado('1', ['A', 'B'])

  it('con la huella que coincide queda verificado', () => {
    const f = armarFilas([p], { huellasVerificadas: new Map([['1', huellaDe(p)]]) })
    expect(f[0].verificado).toBe(true)
    expect(f[0].cambioDesdeRevision).toBe(false)
    expect(aplicarRecortes(f, { verVerificados: true })).toHaveLength(1)
  })

  it('verificar NO esconde un producto con la foto cruzada', () => {
    // Contra un hecho probado —dos colores usando el mismo archivo— el ojo no tiene nada que
    // aportar. Esconderlo bajaría el tablero sin que se arregle nada, que es la confianza falsa
    // que toda esta pantalla existe para no dar.
    const f = armarFilas([p], { huellasVerificadas: new Map([['1', huellaDe(p)]]) })
    expect(f[0].verificado).toBe(true)
    expect(f[0].estado.choques.length).toBeGreaterThan(0)
    expect(aplicarRecortes(f, {})).toHaveLength(1)
    expect(resumen(aplicarRecortes(f, {})).cruzadas).toBeGreaterThan(0)
  })

  it('pero sí esconde uno sano, que es de lo que se trata', () => {
    const sano = prod('ok', [v('A', 'a.jpg'), v('B', 'b.jpg')], {
      imagenes: [{ id: '1', src: 'a.jpg' }, { id: '2', src: 'b.jpg' }],
    })
    const f = armarFilas([sano], { huellasVerificadas: new Map([['ok', huellaDe(sano)]]) })
    expect(aplicarRecortes(f, {})).toHaveLength(0)
  })

  it('si las fotos cambiaron, vuelve solo a la lista', () => {
    const f = armarFilas([p], { huellasVerificadas: new Map([['1', 'huella-vieja']]) })
    expect(f[0].verificado).toBe(false)
    expect(f[0].cambioDesdeRevision).toBe(true)
    expect(aplicarRecortes(f, {})).toHaveLength(1)
  })

  it('un producto sano que cambió después de revisado igual se muestra', () => {
    // Es justo lo que la automatización no puede ver: una foto de otro color, bien vinculada.
    const sano = prod('ok', [v('A', 'a.jpg'), v('B', 'b.jpg')], {
      imagenes: [{ id: '1', src: 'a.jpg' }, { id: '2', src: 'b.jpg' }],
    })
    const f = armarFilas([sano], { huellasVerificadas: new Map([['ok', 'vieja']]) })
    expect(f[0].estado.hayProblema).toBe(false)
    expect(predicadoDe('todo')(f[0])).toBe(true)
  })

  it('sin registro de revisión no está ni verificado ni cambiado', () => {
    const f = armarFilas([p])
    expect(f[0].verificado).toBe(false)
    expect(f[0].cambioDesdeRevision).toBe(false)
  })
})

/**
 * El buscador de antes buscaba dentro de lo ya filtrado, así que "BORDER CASE" no aparecía:
 * figura como completo y el filtro lo escondía antes de que el buscador lo mirara.
 */
describe('prioridad — buscador', () => {
  const sano = prod('sano', [v('A', 'a.jpg')], {
    name: 'BORDER CASE',
    imagenes: [{ id: '1', src: 'a.jpg' }],
    variantes: [v('A', 'a.jpg', { barcode: '0000000002221' }), v('B', 'b.jpg', { sku: 'BRD-2' })],
  })
  const otro = prod('otro', [v('X', 'x.jpg')], { name: 'RIPPLE CASE', sku: 'RIP-1' })
  const todas: FilaAuditoria[] = armarFilas([sano, otro])

  it('encuentra el producto sano, que los filtros esconden', () => {
    expect(todas.filter(predicadoDe('todo'))).toHaveLength(0) // ninguno figura como problema
    expect(buscar(todas, 'border').map((f) => f.producto.id)).toEqual(['sano'])
  })

  it('busca por código de barras de la variante — el producto en la mano', () => {
    expect(buscar(todas, '0000000002221').map((f) => f.producto.id)).toEqual(['sano'])
  })

  it('busca por SKU de la variante y por SKU del producto', () => {
    expect(buscar(todas, 'brd-2').map((f) => f.producto.id)).toEqual(['sano'])
    expect(buscar(todas, 'RIP-1').map((f) => f.producto.id)).toEqual(['otro'])
  })

  it('sin texto no devuelve nada (la lista normal manda)', () => {
    expect(buscar(todas, '   ')).toEqual([])
  })

  it('la referencia distingue dos productos con el mismo nombre', () => {
    const a = prod('199425512', [v('A', null)], { name: 'ICONIC CASE' })
    const b = prod('249547813', [v('A', null), v('B', null)], { name: 'ICONIC CASE' })
    expect(referenciaDe(a)).not.toBe(referenciaDe(b))
    expect(referenciaDe(a)).toContain('199425512')
  })
})
