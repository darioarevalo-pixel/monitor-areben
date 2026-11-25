import { describe, expect, it } from 'vitest'
import { cuentaDelPedido, packDe, precioDeTienda, reglasDeTienda, renglonGuardado } from '@/lib/erp/precio-tienda.core.js'
import { preciosDelCambio } from '../api/_erp-pedido.js'

/**
 * Los PRECIOS DE LA TIENDA en la hoja del pedido (Darío 18-nov): las mismas reglas del catálogo mayorista (bdi-catalogo):
 * pack, oferta (Cyber o margen chico), precio por modelo y el descuento por monto sobre todo el pedido. Si cambian allá, acá.
 */
const R = reglasDeTienda({
  config: {
    updatedAt: 'x', ofertaMargen: 20, variantPrices: { '7-112': 3290 },
    descuentos: { escalaActiva: true, escala: [{ desde: 1000000, pct: 5 }, { desde: 2000000, pct: 10 }] },
    lotes: { productos: {
      5: { precio: 3990, activo: true, porLote: { 'iPhone 15': 2, 'iPhone 16': 3 }, lotes: 9 },
      8: { precio: 1340, activo: true },
      9: { precio: 999, activo: false },
    } },
    lotesVendidos: { 5: 4 },
  },
  cyber: { productos: { 6: { precio: 2490 }, 7: { precio: 3990 } } },
})
const T5 = [{ size_id: 51, talle: 'iPhone 15', stock: 20 }, { size_id: 52, talle: 'iPhone 16', stock: 12 }]

describe('el precio de la tienda', () => {
  it('lista, modelo, oferta (Cyber y margen) y pack', () => {
    expect(precioDeTienda(R, { product_id: 1, size_id: 10, lista: 4990, costo: 2400 })).toEqual({ precio: 4990, tipo: 'lista' })
    expect(precioDeTienda(R, { product_id: 1, size_id: 10, lista: 4990, costo: 4500 })).toEqual({ precio: 4990, tipo: 'oferta' }) // margen 10% < 20%
    expect(precioDeTienda(R, { product_id: 6, size_id: 1, lista: 3330 })).toEqual({ precio: 2490, tipo: 'oferta' })
    expect(precioDeTienda(R, { product_id: 7, size_id: 112, lista: 4990 })).toEqual({ precio: 3290, tipo: 'oferta' }) // el modelo más barato se queda con el suyo
    expect(precioDeTienda(R, { product_id: 8, size_id: 1, lista: 2110 })).toEqual({ precio: 1340, tipo: 'pack' }) // diseño entero en pack
    expect(precioDeTienda(R, { product_id: 9, size_id: 1, lista: 2110 })).toEqual({ precio: 2110, tipo: 'lista' }) // pack apagado: suelta
    expect(precioDeTienda(R, { product_id: 1, size_id: 10, lista: null })).toEqual({ precio: null, tipo: 'lista' })
    const vp = reglasDeTienda({ config: { variantPrices: { '3-30': 3290 } } })
    expect(precioDeTienda(vp, { product_id: 3, size_id: 30, lista: 4990, costo: 1000 })).toEqual({ precio: 3290, tipo: 'modelo' })
  })

  it('el pack: armado por modelo, cuántos quedan (N − vendidos) y cuántos alcanza el stock', () => {
    expect(packDe(R, 5, T5)).toMatchObject({ precio: 3990, fundas: 5, quedan: 5, alcanza: 4, soloPack: false })
    expect(packDe(R, 5, [T5[0]])).toBeNull() // falta un modelo
    expect(packDe(R, 1, T5)).toBeNull()
  })

  it('lo que ya estaba: regular con o sin descuento ⇒ base de lista; pack y oferta por su precio; lo demás, fijo', () => {
    const v = { product_id: 1, size_id: 10, lista: 4990, costo: 2400 }
    expect(renglonGuardado(R, v, 4990)).toEqual({ base: 4990, tipo: 'lista' })
    expect(renglonGuardado(R, v, 4740.5)).toEqual({ base: 4990, tipo: 'lista' })
    expect(renglonGuardado(R, v, 4200)).toEqual({ base: 4200, tipo: 'fijo' })
    expect(renglonGuardado(R, { ...v, product_id: 5 }, 3990)).toEqual({ base: 3990, tipo: 'pack' })
  })

  it('el descuento por monto: sólo a lo regular, pero todo suma para llegar; avisa cuánto falta', () => {
    const c = cuentaDelPedido(R, [{ base: 4990, tipo: 'lista', cantidad: 190 }, { base: 3990, tipo: 'pack', cantidad: 20 }, { base: 2490, tipo: 'oferta', cantidad: 10 }])
    expect(c.subtotal).toBe(1052800)
    expect(c.pct).toBe(5)
    expect(c.lineas.map((l) => l.precio)).toEqual([4740.5, 3990, 2490])
    expect(c.descuento).toBe(47405)
    expect(c.proximo).toEqual({ pct: 10, falta: 947200 })
    expect(cuentaDelPedido(R, [{ base: 4990, tipo: 'lista', cantidad: 10 }]).pct).toBe(0)
  })
})

describe('los precios de un cambio (la puerta decide)', () => {
  const datos = new Map([
    ['1', { lista: 4990, costo: 2400, variantes: [{ size_id: 10, talle: 'iPhone 13' }] }],
    ['5', { lista: 4990, costo: 2400, variantes: T5 }],
    ['6', { lista: 3330, costo: 1000, variantes: [{ size_id: 61, talle: 'iPhone 15' }] }],
  ])
  const actuales = [{ product_id: 1, size_id: 10, cantidad: 190, precio: 4990 }]

  it('agregar packs y una oferta pasa el millón: lo regular que ya estaba baja 5%; los packs se descuentan de la tienda', () => {
    const r = preciosDelCambio({ actuales, lineas: [{ productId: 1, sizeId: 10, cantidad: 190 }, { productId: 6, sizeId: 61, cantidad: 10 }], packs: [{ productId: 5, packs: 4 }], reglas: R, datos })
    expect('status' in r).toBe(false)
    if ('status' in r) return
    expect(r.pedidas).toEqual([
      { product_id: 5, size_id: 51, cantidad: 8, precio: 3990 }, { product_id: 5, size_id: 52, cantidad: 12, precio: 3990 },
      { product_id: 1, size_id: 10, cantidad: 190, precio: 4740.5 }, { product_id: 6, size_id: 61, cantidad: 10, precio: 2490 },
    ])
    expect(r.deltaPacks).toEqual([['5', 4]])
  })

  it('si baja del monto, el descuento se va', () => {
    const r = preciosDelCambio({ actuales: [{ product_id: 1, size_id: 10, cantidad: 210, precio: 4740.5 }], lineas: [{ productId: 1, sizeId: 10, cantidad: 100 }], reglas: R, datos })
    expect('status' in r ? r : r.pedidas).toEqual([{ product_id: 1, size_id: 10, cantidad: 100, precio: 4990 }])
  })

  it('precio a mano: sólo Darío, en lo nuevo y en lo que ya estaba; ⛔ más packs que los que quedan; ⛔ pack y suelta del mismo diseño', () => {
    const nuevo = [{ productId: 1, sizeId: 10, cantidad: 190 }, { productId: 6, sizeId: 61, cantidad: 2, precio: 2000 }]
    expect(preciosDelCambio({ actuales, lineas: nuevo, reglas: R, datos })).toMatchObject({ status: 403 })
    const ok = preciosDelCambio({ actuales, lineas: nuevo, reglas: R, datos, precioManual: true })
    expect('status' in ok ? ok : ok.pedidas[1]).toEqual({ product_id: 6, size_id: 61, cantidad: 2, precio: 2000 })
    // 25-nov (M-124): el precio a mano también vale sobre lo que YA estaba, y ⛔ se pierde; sin ser Darío, 403.
    const ya = preciosDelCambio({ actuales, lineas: [{ productId: 1, sizeId: 10, cantidad: 1, precio: 10 }], reglas: R, datos, precioManual: true })
    expect('status' in ya ? ya : ya.pedidas).toEqual([{ product_id: 1, size_id: 10, cantidad: 1, precio: 10 }])
    expect(preciosDelCambio({ actuales, lineas: [{ productId: 1, sizeId: 10, cantidad: 1, precio: 10 }], reglas: R, datos })).toMatchObject({ status: 403 })
    expect(preciosDelCambio({ actuales, lineas: [], packs: [{ productId: 5, packs: 6 }], reglas: R, datos })).toEqual({ status: 409, error: 'Quedan 5 packs.' })
    expect(preciosDelCambio({ actuales, lineas: [{ productId: 5, sizeId: 51, cantidad: 1 }], packs: [{ productId: 5, packs: 1 }], reglas: R, datos })).toMatchObject({ status: 409 })
    expect(preciosDelCambio({ actuales: [...actuales, { product_id: 5, size_id: 51, cantidad: 1, precio: 4990 }], lineas: [], packs: [{ productId: 5, packs: 1 }], reglas: R, datos })).toEqual({ status: 409, error: 'Ese diseño ya está suelto en el pedido.' })
  })

  it('sacar packs del pedido los devuelve a la tienda', () => {
    const conPack = [...actuales, { product_id: 5, size_id: 51, cantidad: 4, precio: 3990 }, { product_id: 5, size_id: 52, cantidad: 6, precio: 3990 }]
    const r = preciosDelCambio({ actuales: conPack, lineas: [{ productId: 1, sizeId: 10, cantidad: 190 }], packs: [{ productId: 5, packs: 1 }], reglas: R, datos })
    expect('status' in r ? r : r.deltaPacks).toEqual([['5', -1]])
  })
})

describe('la promo por cantidad (smartwatch y auriculares, 10% desde 10 u.)', () => {
  const RP = reglasDeTienda({ config: { updatedAt: 'x', descuentos: { escala: [{ desde: 1000000, pct: 5 }], promos: [{ id: 'p1', nombre: 'smartwatch y auriculares', categorias: ['SMARTWATCH', 'AURICULARES'], productos: [], desde: 10, pct: 10, activo: true }] }, lotes: { productos: { 5: { precio: 3990, activo: true, porLote: { 'iPhone 15': 2, 'iPhone 16': 3 } } } } } })
  const datos = new Map([
    ['12', { lista: 16990, costo: 9000, categoria: 'SMARTWATCH', variantes: [{ size_id: 1, talle: 'NEGRO' }] }],
    ['13', { lista: 5490, costo: 2000, categoria: 'AURICULARES', variantes: [{ size_id: 2, talle: 'Única' }] }],
    ['5', { lista: 4990, costo: 2400, categoria: 'FUNDAS', variantes: T5 }],
  ])
  it('pedido #121 (18-nov): agregar un pack ⛔ le saca el 10% que ya tenían los smartwatch del catálogo', () => {
    const actuales = [{ product_id: 12, size_id: 1, cantidad: 8, precio: 15291 }, { product_id: 13, size_id: 2, cantidad: 2, precio: 4941 }]
    const r = preciosDelCambio({ actuales, lineas: [{ productId: 12, sizeId: 1, cantidad: 8 }, { productId: 13, sizeId: 2, cantidad: 2 }], packs: [{ productId: 5, packs: 1 }], reglas: RP, datos })
    expect('status' in r ? r : r.pedidas.filter((l) => l.product_id !== 5).map((l) => l.precio)).toEqual([15291, 4941])
  })
  it('con menos de 10 unidades de la promo, vuelve a lista', () => {
    const actuales = [{ product_id: 12, size_id: 1, cantidad: 8, precio: 15291 }, { product_id: 13, size_id: 2, cantidad: 2, precio: 4941 }]
    const r = preciosDelCambio({ actuales, lineas: [{ productId: 12, sizeId: 1, cantidad: 7 }, { productId: 13, sizeId: 2, cantidad: 2 }], reglas: RP, datos })
    expect('status' in r ? r : r.pedidas.map((l) => l.precio)).toEqual([16990, 5490])
  })
})
