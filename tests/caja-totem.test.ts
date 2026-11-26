import { describe, expect, it } from 'vitest'
import { REGLAS_INICIALES } from '@/lib/caja/core.core.js'
import type { Reglas } from '@/lib/caja/cliente'
import { BLACK_FRIDAY, bikiniDeLaParte, enBlackFriday, escaleraDeHoy, partesDeLaBikini, recargaDelTotem, esTarjetaEncargada, indiceDelTotem, opcionesDelLocal, coloresDelProducto, precioTotem, tallesDelLocal, varianteDelCodigo } from '@/lib/caja/totem'

/**
 * El tótem (rediseño, fase 4). Oráculo a mano con las reglas iniciales: efectivo 15 % y redondeo a $100.
 * $18.900 × 0,85 = $16.065 ⇒ redondeado $16.100, ahorro $2.800. Una prenda de feria: precio final,
 * $18.900, sin descuento.
 */
const R = REGLAS_INICIALES as unknown as Reglas

const HOY = '2026-10-11'

describe('precioTotem', () => {
  it('🔑 robustez: con la promo del local, el MISMO precio que cobra la caja (y su nombre)', () => {
    const conPromo = { ...R, promos: [{ id: 'p', nombre: '20% en todo', tipo: 'pct', pct: 20, alcance: { tipo: 'todo' }, desde: '2026-01-01', hasta: null, activa: true }] } as Reglas
    // 18.900 − 20 % = 15.120 ⇒ −15 % efectivo = 12.852 ⇒ redondeo 12.900.
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: conPromo, hoy: HOY, categorias: [] })).toMatchObject({ efectivo: 12900, promo: '20% en todo' })
  })

  it('🔑 la prenda de feria va al precio de SU campaña, ⛔ al de Tienda Nube (13-oct)', () => {
    // TN tiene la «Feria Online» ($5.590 = feria ÷ 0,9); la campaña de feria dice $4.990 ⇒ final $5.000 (redondeo).
    const feria = { ...R, feriaIdsCampania: [5], feriaPrecios: { 5: 4990 } } as Reglas
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 5590, reglas: feria, hoy: HOY, categorias: [] })).toEqual({ feria: true, lista: 4990, final: 5000 })
    // Sin precio de campaña (agregada a mano), el de la etiqueta.
    expect(precioTotem({ product_id: 6, size_id: 1, precio: 5590, reglas: { ...feria, feriaIdsCampania: [5, 6] } as Reglas, hoy: HOY, categorias: [] })).toMatchObject({ feria: true, lista: 5590 })
  })

  it('las TRES formas de pago del cobro: tarjeta en 3 cuotas, transferencia 10 %, efectivo 15 % y redondeo a $100 (26-nov)', () => {
    // 18.900 × 0,85 = 16.065 ⇒ 16.100 · × 0,9 = 17.010 ⇒ 17.000 · tarjeta (crédito sin %) 18.900 ⇒ cuota 6.300.
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: R, hoy: HOY, categorias: [] })).toEqual({
      feria: false, lista: 18900, precio: 18900, antes: null, pctOferta: null, promo: null,
      tarjeta: 18900, cuota: 6300, transferencia: 17000, pctTransferencia: 10, efectivo: 16100, pctEfectivo: 15,
    })
  })

  it('el % de cada forma de pago sale del cobro, ⛔ escrito: si transferencia vale lo mismo que efectivo, los dos −15 %', () => {
    const t = 13015 // `transferenciaA` de las reglas iniciales
    const igual = { ...R, cuentas: { ...R.cuentas, [t]: { ...R.cuentas[t], descuento: 15 } } } as Reglas
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: igual, hoy: HOY, categorias: [] })).toMatchObject({ transferencia: 16100, pctTransferencia: 15, efectivo: 16100, pctEfectivo: 15 })
  })

  it('🖤 en oferta de Tienda Nube: el precio de la oferta, la lista TACHADA y el chip del % (BF: TOP HAVEN 17.990 → 15.290)', () => {
    const p = precioTotem({ product_id: 5, size_id: 1, precio: 15290, antes: 17990, reglas: R, hoy: HOY, categorias: [] })
    // Tarjeta 15.290 ⇒ redondeo $100 = 15.300; efectivo 15.290 × 0,85 = 12.996,5 ⇒ 13.000.
    expect(p).toMatchObject({ precio: 15290, antes: 17990, pctOferta: 15, tarjeta: 15300, efectivo: 13000 })
  })

  it('una promo de la Caja tacha el precio de antes (la promo se SUMA a la forma de pago)', () => {
    const conPromo = { ...R, promos: [{ id: 'p', nombre: 'Black Friday bikinis', tipo: 'pct', pct: 15, alcance: { tipo: 'todo' }, desde: '2026-01-01', hasta: null, activa: true }] } as Reglas
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 20000, reglas: conPromo, hoy: HOY, categorias: [] })).toMatchObject({ precio: 17000, antes: 20000, pctOferta: 15, efectivo: 14500, promo: 'Black Friday bikinis' })
  })

  it('una prenda de feria: precio final, sin el % de la forma de pago', () => {
    const conFeria = { ...R, feriaProductos: [{ id: 5, nombre: 'Blazer' }] } as Reglas
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: conFeria, hoy: HOY, categorias: [] })).toEqual({ feria: true, lista: 18900, final: 18900 })
  })

  it('sin precio o sin formas de pago ⛔ inventa un número', () => {
    expect(precioTotem({ product_id: 5, size_id: 1, precio: null, reglas: R, hoy: HOY, categorias: [] })).toBeNull()
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: { ...R, medios: undefined } as Reglas, hoy: HOY, categorias: [] })).toBeNull()
    expect(precioTotem({ product_id: 5, size_id: 1, precio: 18900, reglas: null, hoy: HOY, categorias: [] })).toBeNull()
  })
})

describe('tallesDelLocal', () => {
  it('un talle por nombre, «hay» si alguna variante tiene stock en el local', () => {
    expect(
      tallesDelLocal([
        { size_name: 'S', local: 0 },
        { size_name: 'M', local: 2 },
        { size_name: 'M', local: 0 },
        { size_name: 'L' },
        { size_name: ' ' },
      ]),
    ).toEqual([
      { talle: 'S', hay: false },
      { talle: 'M', hay: true },
      { talle: 'L', hay: false },
    ])
  })
})

describe('opcionesDelLocal', () => {
  const tn = [{ nombre: 'NEGRO', foto: 'n.jpg' }, { nombre: 'BORDO', foto: null }]
  it('la variante de GN ES el color: el stock va en los colores y ⛔ hay talles', () => {
    expect(opcionesDelLocal([{ size_name: 'NEGRO', local: 2 }, { size_name: 'Bordo', local: 0 }, { size_name: 'ROSA', local: 1 }], tn)).toEqual({
      colores: [{ nombre: 'NEGRO', foto: 'n.jpg', hay: true }, { nombre: 'Bordo', foto: null, hay: false }, { nombre: 'ROSA', foto: null, hay: true }],
      talles: [],
    })
  })
  it('la variante es el talle: talles con stock, colores de TN sin afirmar stock', () => {
    expect(opcionesDelLocal([{ size_name: 'M', local: 2 }, { size_name: '38', local: 0 }], tn)).toEqual({
      colores: [{ nombre: 'NEGRO', foto: 'n.jpg', hay: null }, { nombre: 'BORDO', foto: null, hay: null }],
      talles: [{ talle: 'M', hay: true }, { talle: '38', hay: false }],
    })
  })
  it('sin lista de GN: los colores, sin afirmar stock', () => {
    expect(opcionesDelLocal([], tn).colores.every((c) => c.hay === null)).toBe(true)
  })
})

describe('esTarjetaEncargada', () => {
  it('sin importar mayúsculas ni espacios, y nada más', () => {
    expect(esTarjetaEncargada(' encargada ')).toBe(true)
    expect(esTarjetaEncargada('ENCARGADA2')).toBe(false)
  })
})

describe('coloresDelProducto', () => {
  it('los colores del producto del SKU escaneado, cada uno con su foto, y el del escaneado', () => {
    const audit = [
      { variantes: [{ sku: 'OTRO-1', color: 'ROJO', image_url: 'r.jpg' }] },
      {
        variantes: [
          { sku: 'RBT-0137-S', color: 'NEGRO', image_url: null },
          { sku: 'RBT-0137-M', color: 'NEGRO', image_url: 'n.jpg' },
          { sku: 'RBT-0137-L', color: 'CHOCOLATE', image_url: 'c.jpg' },
          { sku: 'RBT-0137-X', color: '' },
        ],
      },
    ]
    expect(coloresDelProducto(audit, 'rbt-0137-l')).toEqual({
      colores: [
        { nombre: 'NEGRO', foto: 'n.jpg' },
        { nombre: 'CHOCOLATE', foto: 'c.jpg' },
      ],
      actual: 'CHOCOLATE',
      foto: 'c.jpg',
      fotos: [],
    })
    expect(coloresDelProducto(audit, null).colores).toEqual([])
    expect(coloresDelProducto(audit, 'NO-ESTA').colores).toEqual([])
  })
})

describe('varianteDelCodigo', () => {
  const v = (sid: string, size: string, local: number, sku: string, barcode: string) => ({ pid: '5', sid, name: 'BLAZER', size, local, sku, barcode })
  const indice = indiceDelTotem([v('1', 'S', 0, 'RBT-01-S', '0779001'), v('2', 'M', 3, 'RBT01M', '779002'), v('3', 'L', 1, 'RBT-01-L', 'REPETIDO'), { ...v('4', 'U', 1, 'OTRO', 'REPETIDO'), pid: '6' }])

  it('encuentra por barcode y por SKU, tal cual o normalizado, como el servidor', () => {
    expect(varianteDelCodigo(indice, '0779001')?.size_id).toBe(1)
    expect(varianteDelCodigo(indice, ' 779002 ')?.size_id).toBe(2)
    expect(varianteDelCodigo(indice, '0779002')?.size_id).toBe(2)
    expect(varianteDelCodigo(indice, 'rbt-01-s')?.size_id).toBe(1)
    expect(varianteDelCodigo(indice, 'RBT-01-M')?.size_id).toBe(2)
  })
  it('un código que ⛔ está o que comparten varias prendas lo decide el servidor', () => {
    expect(varianteDelCodigo(indice, 'NO-ESTA')).toBeNull()
    expect(varianteDelCodigo(indice, 'REPETIDO')).toBeNull()
  })
  it('los talles del producto, primero los que hay en el local, como `productosPorStock`', () => {
    expect(indice.porProducto.get(5)?.map((x) => x.size_name)).toEqual(['L', 'M', 'S'])
  })
})

/**
 * 🩱 La bikini (Bruno 26-nov: se vende SÓLO la bikini completa). Datos medidos en prod el 26-nov: «Bikini MADDIE · Sky» $49.990,
 * corpiño 1000000074 (S = 1000000075) $21.917,24 + bombacha 1000000070 $28.072,76; la «Promo bikinis» de la Caja: 2 = 10 %, 3 = 15 %
 * hasta el 26; «Black Friday bikinis» −15 % del 27 al 30.
 */
const SKY = {
  variant_id: 1644987951, nombre: 'Bikini MADDIE · Sky', valores: ['S', 'S'], precio: 49990,
  piezas: [
    { n: 1, product_id: 1000000074, size_id: 1000000075, cantidad: 1, precio: 21917.24, producto: 'CORPIÑO MADDIE SKY', talle: 'S' },
    { n: 2, product_id: 1000000070, size_id: 1000000071, cantidad: 1, precio: 28072.76, producto: 'BOMBACHA MADDIE SKY', talle: 'S' },
  ],
}
const alcance = { tipo: 'productos', productos: [{ id: 1000000074, nombre: 'CORPIÑO MADDIE SKY' }] }
const BIKINIS = { ...R, promos: [
  { id: 'e', nombre: 'Promo bikinis', tipo: 'cantidad', escalones: [{ desde: 2, pct: 10 }, { desde: 3, pct: 15 }], alcance, desde: '2026-11-25', hasta: '2026-11-26', activa: true },
  { id: 'bf', nombre: 'Black Friday bikinis', tipo: 'pct', pct: 15, alcance, desde: '2026-11-27', hasta: '2026-11-30', activa: true },
] } as Reglas

describe('🩱 la bikini en el tótem', () => {
  it('escanear el corpiño muestra SU bikini, con las dos partes', () => {
    expect(bikiniDeLaParte([SKY], 1000000074, 1000000075)?.nombre).toBe('Bikini MADDIE · Sky')
    expect(bikiniDeLaParte([SKY], 1000000070, 1000000071)?.nombre).toBe('Bikini MADDIE · Sky')
    expect(bikiniDeLaParte([SKY], 5, 1)).toBeNull()
    expect(bikiniDeLaParte(null, 1000000074, 1000000075)).toBeNull()
    expect(partesDeLaBikini(SKY)).toEqual([{ rotulo: 'Corpiño', product_id: 1000000074 }, { rotulo: 'Bombacha', product_id: 1000000070 }])
  })

  it('el precio es el de UNA bikini ($49.990), ⛔ el de la parte; la escalera ⛔ baja el precio de una', () => {
    const p = precioTotem({ product_id: 1000000074, size_id: 1000000075, precio: 26990, reglas: BIKINIS, hoy: '2026-11-26', categorias: [], bikini: SKY as never })
    // El grande, el de la etiqueta; con tarjeta la Caja redondea a $100 = 50.000 · efectivo 49.990 × 0,85 = 42.491,5 ⇒ 42.500.
    expect(p).toMatchObject({ precio: 49990, antes: null, tarjeta: 50000, efectivo: 42500, transferencia: 45000 })
    expect(escaleraDeHoy(BIKINIS, '2026-11-26', [1000000074, 1000000070], [])).toEqual([{ desde: 2, pct: 10 }, { desde: 3, pct: 15 }])
  })

  it('🖤 del 27 al 30: −15 % de la Caja tachando el de lista, y SIN escalera', () => {
    const p = precioTotem({ product_id: 1000000074, size_id: 1000000075, precio: 26990, reglas: BIKINIS, hoy: '2026-11-27', categorias: [], bikini: SKY as never })
    expect(p).toMatchObject({ antes: 49990, pctOferta: 15, promo: 'Black Friday bikinis' })
    expect(escaleraDeHoy(BIKINIS, '2026-11-27', [1000000074, 1000000070], [])).toBeNull()
  })

  it('una prenda fuera del alcance ⛔ tiene escalera', () => {
    expect(escaleraDeHoy(BIKINIS, '2026-11-26', [5], [])).toBeNull()
  })
})

describe('🖤 Black Friday: jue 26 20 h → lun 30 inclusive (hora argentina)', () => {
  it('la ventana', () => {
    expect(enBlackFriday(Date.parse('2026-11-26T19:59:00-03:00'))).toBe(false)
    expect(enBlackFriday(Date.parse('2026-11-26T20:00:00-03:00'))).toBe(true)
    expect(enBlackFriday(Date.parse('2026-11-30T23:59:00-03:00'))).toBe(true)
    expect(enBlackFriday(Date.parse('2026-12-01T00:00:00-03:00'))).toBe(false)
    expect(BLACK_FRIDAY.cinta).toBe('BLACK FRIDAY · HASTA EL LUNES 30')
  })

  it('la recarga: cada 15 min con TN fresco cuando se aprietan los «Aplicar», cada hora en el BF, y lo de siempre fuera', () => {
    expect(recargaDelTotem(Date.parse('2026-11-26T20:10:00-03:00'))).toEqual({ cadaMs: 15 * 60_000, refrescar: true })
    expect(recargaDelTotem(Date.parse('2026-11-28T12:00:00-03:00'))).toEqual({ cadaMs: 60 * 60_000, refrescar: false })
    expect(recargaDelTotem(Date.parse('2026-11-30T21:00:00-03:00'))).toEqual({ cadaMs: 15 * 60_000, refrescar: true })
    expect(recargaDelTotem(Date.parse('2026-11-20T12:00:00-03:00'))).toBeNull()
  })
})
