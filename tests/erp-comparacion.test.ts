import { describe, expect, it } from 'vitest'
import { armarComparacion, contarVistas, envioPosteriorALaFoto, filtrar, ordenar, resumen } from '@/lib/erp/comparacion.core.js'
import { comparacionConTiendas } from '../api/_erp-stock.js'

// Filas de Stock (`armarFilasStock`) con la forma medida el 20-oct en BDI.
const fila = (id: string, sku: string | null, deps: Record<string, number>, enPedidos = 0, extra: object = {}) => ({
  id, producto: id.split('/')[0], talle: id.split('/')[1], nombre: `Funda ${id}`, talleNombre: 'iPhone 15', sku, barcode: null,
  linea: 'bdi', deps, estanteria: 0, enPedidos, disponible: 0, gn: null, negativo: false, ultimo: null, ...extra,
})
const inv = (id: string, store: string, n: number) => ({ product_id: id.split('/')[0], size_id: id.split('/')[1], store_name: store, available_quantity: n })
const tn = (variant_id: number, sku: string | null, stock: number | null, extra: object = {}) => ({ tienda: 'bdi', variant_id, sku, barcode: null, stock, ...extra })

describe('armarComparacion (la cuenta de la conciliación del motor, en vivo)', () => {
  it('cuenta SÓLO los depósitos de la tienda, menos lo apartado, y clasifica como la conciliación', () => {
    const filas = [
      fila('1/1', 'F-1', { local: 5, deposito_minorista: 10, deposito_mayorista: 99 }, 2), // para TN: 10 − 2 = 8
      fila('2/2', 'F-2', { local: 0, deposito_minorista: 4, deposito_mayorista: 0 }),
      fila('3/3', 'F-3', { local: 0, deposito_minorista: 3, deposito_mayorista: 0 }),
    ]
    const inventario = [inv('1/1', 'Deposito Minorista', 8), inv('2/2', 'Deposito Minorista', 6), inv('3/3', 'Deposito Minorista', 3)]
    const r = armarComparacion({ marca: 'bdi', filas, inventario, tn: [tn(10, 'f-1 ', 8), tn(20, 'F-2', 6), tn(30, 'F-3', 1)] })
    const por = Object.fromEntries(r.filas.map((f) => [f.id, f]))
    expect(por['1/1']).toMatchObject({ paraTienda: 8, tn: 8, clase: 'coincide', diferencia: 0 })
    // TN y GN dicen 6, el ERP 4 ⇒ el que está aparte es el ERP.
    expect(por['2/2']).toMatchObject({ paraTienda: 4, tn: 6, gn: 6, clase: 'libro_aparte', diferencia: 2 })
    // El ERP y GN dicen 3, TN 1 ⇒ la tienda está atrasada (muestra de menos).
    expect(por['3/3']).toMatchObject({ clase: 'tn_atrasado', diferencia: -2 })
  })

  it('cruza por código de barras si el SKU no está, y una variante de TN sin producto se dice', () => {
    const filas = [fila('1/1', null, { deposito_minorista: 2 }, 0, { barcode: '779' })]
    const r = armarComparacion({ marca: 'bdi', filas, inventario: [], tn: [tn(10, null, 2, { barcode: '779' }), tn(11, 'NO-EXISTE', 3, { nombre: 'Funda X', valores: ['iPhone 16'] })] })
    expect(r.filas.find((f) => f.id === '1/1')?.tn).toBe(2)
    expect(r.filas.find((f) => f.id === 'tn:11')).toMatchObject({ clase: 'sin_variante', paraTienda: null, nombre: 'Funda X', talleNombre: 'iPhone 16' })
  })

  it('SKU repetido en TN: decide la primera; sin control de stock no se compara; con stock y sin publicar aparte', () => {
    const filas = [fila('1/1', 'F-1', { deposito_minorista: 2 }), fila('2/2', 'F-2', { deposito_minorista: 5 }), fila('3/3', 'F-3', { deposito_minorista: 0 })]
    const r = armarComparacion({ marca: 'bdi', filas, inventario: [], tn: [tn(10, 'F-1', 2), tn(11, 'F-1', 9), tn(12, 'F-3', null)] })
    expect(r.filas.filter((f) => f.id === '1/1')).toHaveLength(1)
    expect(r.filas.find((f) => f.id === '1/1')).toMatchObject({ tn: 2, repetidas: 1 })
    expect(r.sinLimite).toBe(1)
    expect(r.filas.find((f) => f.id === '2/2')).toMatchObject({ clase: 'no_publicada', paraTienda: 5 })
    // Sin stock y sin publicar ⛔ es una fila.
    expect(r.filas.find((f) => f.id === '3/3')).toBeUndefined()
  })

  it('Stunned publica Depósito + Local; Zattia sólo el Local', () => {
    const filas = [fila('1/1', 'STN-1', { local: 1, deposito: 2 }, 0, { linea: 'stunned' }), fila('2/2', 'Z-1', { local: 1, deposito: 7 }, 0, { linea: 'zattia' })]
    const r = armarComparacion({ marca: 'zattia', filas, inventario: [], tn: [{ ...tn(1, 'STN-1', 3), tienda: 'stunned' }, { ...tn(2, 'Z-1', 1), tienda: 'zattia' }] })
    expect(r.filas.map((f) => [f.id, f.paraTienda, f.clase])).toEqual([['1/1', 3, 'coincide'], ['2/2', 1, 'gn_aparte']])
  })

  it('Stunned ya cortó: sólo el ERP contra TN, ⛔ GN (Bruno 28-oct: SCOTTISH S, ERP 0 = TN 0, salía «Gestión Nube dice otro stock»)', () => {
    const filas = [fila('5/1', 'STU-REM-0005-S', { local: 0, deposito: 1 }, 1, { linea: 'stunned' }), fila('6/1', 'STU-6', { local: 2, deposito: 0 }, 0, { linea: 'stunned' })]
    const inventario = [inv('5/1', 'Local', 4), inv('6/1', 'Local', 2)]
    const r = armarComparacion({ marca: 'zattia', filas, inventario, tn: [{ ...tn(1, 'STU-REM-0005-S', 0), tienda: 'stunned' }, { ...tn(2, 'STU-6', 5), tienda: 'stunned' }] })
    expect(r.filas.map((f) => [f.id, f.paraTienda, f.tn, f.gn, f.clase])).toEqual([['5/1', 0, 0, null, 'coincide'], ['6/1', 2, 5, null, 'tn_distinto']])
    expect(resumen(r.filas).noCoinciden).toBe(1)
    // Zattia sigue con GN como testigo.
    const z = armarComparacion({ marca: 'zattia', filas: [fila('7/1', 'Z-7', { local: 1, deposito: 0 }, 0, { linea: 'zattia' })], inventario: [inv('7/1', 'Local', 3)], tn: [{ ...tn(3, 'Z-7', 1), tienda: 'zattia' }] })
    expect(z.filas[0]).toMatchObject({ gn: 3, clase: 'gn_aparte' })
  })
})

describe('vistas, resumen y orden', () => {
  const filas = armarComparacion({
    marca: 'bdi', inventario: [inv('3/3', 'Deposito Minorista', 2)],
    filas: [fila('1/1', 'F-1', { deposito_minorista: 1 }), fila('2/2', 'F-2', { deposito_minorista: 5 }), fila('3/3', 'F-3', { deposito_minorista: 2 }), fila('4/4', 'F-4', { deposito_minorista: 3 })],
    tn: [tn(1, 'F-1', 4), tn(2, 'F-2', 2), tn(3, 'F-3', 2), tn(9, 'ZZ', 1)],
  }).filas
  it('cuenta cada vista; «No coinciden» deja afuera las sin publicar', () => {
    expect(contarVistas(filas)).toEqual({ no: 3, mas: 1, menos: 1, sinerp: 1, sinpub: 1, todas: 5 })
    expect(resumen(filas)).toMatchObject({ noCoinciden: 3, deMas: 1, uMas: 3, deMenos: 1, uMenos: 3, comparadas: 3 })
  })
  it('de entrada, la que muestra DE MÁS arriba', () => {
    expect(ordenar(filtrar(filas, { vista: 'no' }), null).map((f) => f.id)).toEqual(['1/1', '2/2', 'tn:9'])
  })
})

describe('comparacionConTiendas', () => {
  it('marca inválida ⇒ 400; sin conexión al motor ⇒ el 409 del motor', async () => {
    expect(await comparacionConTiendas({ marca: 'x' }, { conMotor: async () => ({}), pedidosSinPagar: async () => ({}) })).toMatchObject({ status: 400 })
    const r = await comparacionConTiendas({ marca: 'bdi' }, { conMotor: async () => ({ status: 409, error: 'sin conexión' }), pedidosSinPagar: async () => ({ pedidos: [] }), leerInventario: async () => [] })
    expect(r).toMatchObject({ status: 409 })
  })
})

describe('la foto de TN anterior al último envío (Bruno, 28-oct: «No coinciden 35» con TN ya igual al libro)', () => {
  const envio = (terminadoEn: string, extra: Record<string, unknown> = {}) => ({ estado: 'hecho', seco: false, escritos: 3, terminadoEn, ...extra })
  it('un envío REAL después de la foto la deja vieja: devuelve el último', () => {
    const e = envioPosteriorALaFoto('2026-10-28T22:42:00Z', [envio('2026-10-29T01:08:00Z'), envio('2026-10-29T01:48:00Z', { escritos: 1 })])
    expect(e?.terminadoEn).toBe('2026-10-29T01:48:00Z')
  })
  it('⛔ cuentan los secos, los que no escribieron nada, los que no terminaron ni los anteriores a la foto', () => {
    const foto = '2026-10-28T22:42:00Z'
    expect(envioPosteriorALaFoto(foto, [envio('2026-10-29T01:00:00Z', { seco: true })])).toBeNull()
    expect(envioPosteriorALaFoto(foto, [envio('2026-10-29T01:00:00Z', { escritos: 0 })])).toBeNull()
    expect(envioPosteriorALaFoto(foto, [envio('2026-10-29T01:00:00Z', { estado: 'fallado' })])).toBeNull()
    expect(envioPosteriorALaFoto(foto, [envio('2026-10-28T20:00:00Z')])).toBeNull()
    expect(envioPosteriorALaFoto(null, [envio('2026-10-29T01:00:00Z')])).toBeNull()
  })
})
