// «Corregir productos» de una venta hecha, con el mismo número (motor sql/088; Bruno 16/18-nov, la #33748 de BDI cargada con
// TEMPLADO 9D en vez de 9D PREMIUM): los renglones como quedaron, la cuenta de la ventana, el servidor y el permiso.
import { describe, expect, it, vi } from 'vitest'
import { netearLineas, armarFicha } from '../lib/erp/venta.core.js'
import { renglonesDeVenta } from '../lib/erp/factura.core.js'
import { cuentaDeCorreccion } from '../lib/erp/correccion-productos.core.js'
import { historialDeVenta } from '../lib/erp/ventas-lista.core.js'
import { corregirProductosErp } from '../api/_erp-ventas.js'
import { permisoErpDe, puedeErp } from '../lib/permisos.core.js'

const ORIG = '00000000-0000-0000-0000-0000000000a1'
// Lo que devuelve `venta_ficha.lineas` después de corregir: 2 × 9D (10.000 c/u), se sacó 1 y se agregó 1 × 9D PREMIUM.
const lineas = [
  { id: ORIG, n: 1, product_id: 1, size_id: 10, sku: 'ATE-9D', cantidad: 2, precio: 10000, importe: 20000, linea_origen_id: null, correccion_id: null },
  { id: 'neg', n: 2, product_id: 1, size_id: 10, sku: 'ATE-9D', cantidad: -1, precio: 10000, importe: -10000, linea_origen_id: ORIG, correccion_id: 'k1' },
  { id: 'nue', n: 3, product_id: 2, size_id: 30, sku: 'ATE-9DP', cantidad: 1, precio: 12000, importe: 12000, linea_origen_id: null, correccion_id: 'k1' },
]

describe('los renglones como quedaron', () => {
  it('lo sacado se descuenta de su original y lo agregado queda como un renglón más', () => {
    const r = netearLineas(lineas)
    expect(r.map((l) => [l.id, l.cantidad, l.importe])).toEqual([[ORIG, 1, 10000], ['nue', 1, 12000]])
    expect(r[0].cantidad_original).toBe(2)
  })
  it('lo sacado entero desaparece; un CAMBIO ⛔ se netea (sus negativos son lo devuelto)', () => {
    const todo = [lineas[0], { ...lineas[1], cantidad: -2, importe: -20000 }]
    expect(netearLineas(todo)).toEqual([])
    const cambio = [{ ...lineas[1], correccion_id: null }]
    expect(netearLineas(cambio, 'cambio')).toEqual(cambio)
  })
  it('la ficha y la factura usan los renglones como quedaron', () => {
    const f = { tipo: 'venta', numero: 33748, total: 22000, total_original: 20000, subtotal: 20000, lineas, pagos: [], facturas: [] }
    const ficha = armarFicha(f)
    expect(ficha.lineas.map((l) => [l.cantidad, l.agregada, l.cantidadOriginal])).toEqual([[1, false, 2], [1, true, null]])
    expect(ficha.venta.totalOriginal).toBe(20000)
    const r = renglonesDeVenta(f)
    expect(r.map((x) => [x.cantidad, x.importe])).toEqual([[1, 10000], [1, 12000]])
  })
})

describe('la cuenta de la ventana', () => {
  const base = { total: 20000, lineas: [{ id: ORIG, cantidad: 2, cambiado: 0, importe: 20000 }] }
  it('sacar 1 y agregar 1 a 12.000: total 22.000 y lo que va al motor', () => {
    const c = cuentaDeCorreccion({ ...base, quedan: { [ORIG]: 1 }, agregadas: [{ cantidad: 1, precio: 12000 }] })
    expect(c).toMatchObject({ error: null, totalNuevo: 22000, hayCambio: true, sacar: [{ lineaId: ORIG, cantidad: 1 }] })
  })
  it('sin tocar nada ⛔ hay cambio; sin precio ⛔ sale; ⛔ más de lo que queda', () => {
    expect(cuentaDeCorreccion({ ...base, quedan: {}, agregadas: [] }).hayCambio).toBe(false)
    expect(cuentaDeCorreccion({ ...base, quedan: {}, agregadas: [{ cantidad: 1, precio: NaN }] }).error).toBeTruthy()
    expect(cuentaDeCorreccion({ ...base, quedan: { [ORIG]: 3 }, agregadas: [] }).error).toBeTruthy()
  })
})

describe('el historial', () => {
  it('el cambio de un PEDIDO mayorista (motor sql/090) se ve como «Cambió el pedido», con lo que entró y salió', () => {
    const ficha = { venta: { tipo: 'venta', origen: 'mayorista', ocurridaEn: '2026-11-18T15:00:00Z', usuario: 'darío' }, pagos: [] }
    const h = historialDeVenta(ficha, { correcciones: { correcciones: [{ tipo: 'pedido', creada_en: '2026-11-18T18:01:00Z', motivo: 'Pedido 121: cambiado por darío', usuario: 'darío',
      total_antes: 135100, total_despues: 163000, lineas: [], renglones: [{ cantidad: 2, sku: 'F-0211-17PM' }] }] } })
    const c = h.find((x) => x.titulo === 'Cambió el pedido')
    expect(c?.detalle).toContain('+2 F-0211-17PM')
    expect(h.some((x) => x.titulo === 'Corrigió el precio')).toBe(false)
  })
  it('dice qué se corrigió, el motivo y quién, con el total antes → después', () => {
    const ficha = { venta: { tipo: 'venta', origen: 'manual', ocurridaEn: '2026-11-16T15:00:00Z', usuario: 'bruno' }, pagos: [] }
    const h = historialDeVenta(ficha, { correcciones: { correcciones: [{ tipo: 'productos', creada_en: '2026-11-18T15:00:00Z', motivo: 'Era 9D PREMIUM', usuario: 'bruno', total_antes: 20000, total_despues: 22000,
      lineas: [], renglones: [{ cantidad: -1, sku: 'ATE-9D' }, { cantidad: 1, sku: 'ATE-9DP' }] }] } })
    const c = h.find((x) => x.titulo === 'Corrigió los productos')
    expect(c?.detalle).toContain('−1 ATE-9D, +1 ATE-9DP')
    expect(c?.detalle).toContain('«Era 9D PREMIUM»')
  })
})

describe('el servidor', () => {
  const V = '00000000-0000-0000-0000-000000000001'
  const ok = { ventaId: V, motivo: 'Era 9D PREMIUM', ref: 'abcdefgh-1', sacar: [{ lineaId: ORIG, cantidad: 1 }], agregar: [{ producto: '2', talle: '30', cantidad: 1, precio: 12000 }] }
  it('le pasa al motor lo que tiene que ser', async () => {
    const corregirProductos = vi.fn(async () => ({ ok: true, correccion: { total_despues: 22000, diferencia: 2000 }, avisos: [] }))
    const r = await corregirProductosErp({ marca: 'bdi', body: ok, usuario: 'bruno' }, { correccion: { corregirProductos }, db: {} })
    expect(r).toMatchObject({ ok: true, correccion: { diferencia: 2000 } })
    expect(corregirProductos).toHaveBeenCalledWith({}, { venta_id: V, motivo: 'Era 9D PREMIUM', usuario: 'bruno', ref: 'abcdefgh-1',
      sacar: [{ linea_id: ORIG, cantidad: 1 }], agregar: [{ product_id: 2, size_id: 30, cantidad: 1, precio: 12000 }] })
  })
  it('frena lo mal armado antes del motor, y sin el motor nuevo lo dice', async () => {
    const correccion = { corregirProductos: vi.fn() }
    for (const body of [{ ...ok, motivo: ' ' }, { ...ok, ref: '' }, { ...ok, sacar: [{ lineaId: 'x', cantidad: 1 }] }, { ...ok, agregar: [{ producto: '2', talle: '30', cantidad: 0, precio: 1 }] }, { ...ok, sacar: [], agregar: [] }]) {
      expect(await corregirProductosErp({ marca: 'bdi', body, usuario: 'b' }, { correccion, db: {} })).toMatchObject({ status: 400 })
    }
    expect(correccion.corregirProductos).not.toHaveBeenCalled()
    expect(await corregirProductosErp({ marca: 'bdi', body: ok, usuario: 'b' }, { correccion: {}, db: {} })).toMatchObject({ status: 409 })
  })
  it('el motor que frena (FACTURADA) llega como 409 con su texto', async () => {
    const corregirProductos = async () => ({ ok: false, error: { codigo: 'FACTURADA', mensaje: 'La venta 5 ya tiene factura' } })
    expect(await corregirProductosErp({ marca: 'bdi', body: ok, usuario: 'b' }, { correccion: { corregirProductos }, db: {} })).toMatchObject({ status: 409, error: expect.stringContaining('FACTURADA') })
  })
})

describe('el permiso', () => {
  it('es el de corregir el precio: Administración y Admin, y lo apaga la misma aprobación', () => {
    expect(permisoErpDe({ method: 'POST', accion: 'corregir-productos' })).toBe('corregir-precio')
    const admin = { user: 'a', funcion: ['administracion'], acceso: { bdi: { erp: true } } }
    const local = { user: 'l', funcion: ['local'], acceso: { bdi: { erp: true } } }
    expect(puedeErp(local, 'bdi', 'corregir-precio')).toBe(false)
    expect(typeof puedeErp(admin, 'bdi', 'corregir-precio')).toBe('boolean')
  })
})
