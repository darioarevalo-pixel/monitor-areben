import { describe, expect, it } from 'vitest'
import {
  armarMovimiento, contarVistas, documentoDe, filtrar, ordenar, quienDe, rangoDeMovimientos, resumen,
} from '@/lib/erp/movimientos.core.js'
import { listaDeMovimientos, TOPE_MOVS } from '../api/_erp-stock.js'

/**
 * **ERP › Stock › Movimientos** (19-oct, Diseño 7): la lista de REGISTRO del libro. El oráculo: que cada fila diga su
 * documento en palabras (⛔ la clave del libro), que «quién» sea una persona SÓLO si el libro la sabe, que las vistas y el
 * resumen cuenten lo suyo (una transferencia ⛔ entra ni sale), y que el servidor corte y avise.
 */
const N = new Map([['1/1', { nombre: 'TOP SAHARA', talleNombre: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', barcode: '771' }]])
const mov = (x: Record<string, unknown> = {}) => ({
  id: 10, linea: 'zattia', product_id: 1, size_id: 1, sku: null, barcode: null, deposito: 'local', cantidad: -1, tipo: 'venta', origen: 'caja',
  origen_ref: 'v1:1:1:local', ocurrido_en: '2026-10-19T13:25:00Z', hora_exacta: true, detalle: { caja: 'v1' }, queda: 2, ...x,
})

describe('cada movimiento', () => {
  it('dice su documento en palabras', () => {
    expect(documentoDe(mov({ venta_numero: 296 }))).toBe('Venta #296')
    expect(documentoDe(mov())).toBe('Venta de la Caja')
    expect(documentoDe(mov({ origen: 'ajuste', tipo: 'ajuste', origen_ref: 'a1:1', detalle: { ajuste: 12, motivo: 'fallado' } }))).toBe('Ajuste A-12 · Fallado')
    expect(documentoDe(mov({ origen: 'gn', origen_ref: '1533152:694420:76626:local', detalle: { canal: 'Tienda Nube', tn_order: '7324' } }))).toBe('Gestión Nube 1533152 · Tienda Nube 7324')
    expect(documentoDe(mov({ origen: 'repo', tipo: 'transferencia', origen_ref: 'repo:ra1:t1:1_1:entra', detalle: { transfer_id: 8101 } }))).toBe('Transferencia 8101')
    expect(documentoDe(mov({ origen: 'apertura', tipo: 'apertura', detalle: { anclaje: 'gn' } }))).toBe('Stock inicial (foto de Gestión Nube)')
    expect(documentoDe(mov({ origen: 'recepcion', tipo: 'ingreso', detalle: {} }))).toBe('Ingreso')
  })

  it('«quién» es una persona sólo si el ERP la sabe; si no, de qué sistema vino', () => {
    expect(quienDe(mov({ venta_usuario: 'camila' }))).toEqual({ nombre: 'camila', de: 'persona' })
    expect(quienDe(mov({ origen: 'ajuste', ajuste_usuario: 'bruno' }))).toEqual({ nombre: 'bruno', de: 'persona' })
    expect(quienDe(mov({ origen: 'repo' }))).toEqual({ nombre: 'Reposición', de: 'sistema' })
    expect(quienDe(mov({ origen: 'gn' }))).toEqual({ nombre: 'Gestión Nube', de: 'sistema' })
  })

  it('la fila trae el nombre del espejo, lo que quedó y se busca por documento y por quién', () => {
    const f = armarMovimiento(mov({ venta_numero: 296, venta_usuario: 'camila' }), N)
    expect(f).toMatchObject({ id: '10', nombre: 'TOP SAHARA', talleNombre: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', cantidad: -1, queda: 2, depositoTexto: 'Local', tipoTexto: 'Venta', documento: 'Venta #296', quien: 'camila' })
    expect(filtrar([f], { q: '#296' })).toHaveLength(1)
    expect(filtrar([f], { q: 'camila' })).toHaveLength(1)
    expect(filtrar([f], { q: '771' })).toHaveLength(1)
    expect(filtrar([f], { deposito: 'deposito' })).toHaveLength(0)
    // Sin la prenda en el espejo ⛔ se inventa el nombre.
    expect(armarMovimiento(mov({ product_id: 9 }), N)).toMatchObject({ nombre: 'Producto 9', talleNombre: '1' })
  })
})

describe('la lista', () => {
  const filas = [
    armarMovimiento(mov({ id: 1, cantidad: -2, ocurrido_en: '2026-10-19T10:00:00Z' }), N),
    armarMovimiento(mov({ id: 2, tipo: 'anulacion', cantidad: 1, ocurrido_en: '2026-10-19T11:00:00Z' }), N),
    armarMovimiento(mov({ id: 3, tipo: 'transferencia', origen: 'repo', deposito: 'deposito', cantidad: -3, ocurrido_en: '2026-10-19T12:00:00Z' }), N),
    armarMovimiento(mov({ id: 4, tipo: 'transferencia', origen: 'repo', deposito: 'local', cantidad: 3, ocurrido_en: '2026-10-19T12:00:00Z' }), N),
    armarMovimiento(mov({ id: 5, tipo: 'ajuste', origen: 'ajuste', cantidad: -1, ocurrido_en: '2026-10-19T13:00:00Z' }), N),
    armarMovimiento(mov({ id: 6, tipo: 'ingreso', origen: 'recepcion', cantidad: 10, ocurrido_en: '2026-10-19T09:00:00Z' }), N),
    armarMovimiento(mov({ id: 7, tipo: 'apertura', origen: 'apertura', cantidad: 4, ocurrido_en: '2026-10-13T09:00:00Z' }), N),
  ]
  it('las vistas cuentan lo suyo (la anulación va con las ventas)', () => {
    expect(contarVistas(filas)).toEqual({ todos: 7, ventas: 2, transferencias: 2, ajustes: 1, ingresos: 1, libro: 1 })
  })
  it('el resumen: una transferencia ⛔ entra ni sale, y la apertura ⛔ cuenta como entrada', () => {
    expect(resumen(filas)).toEqual({ movimientos: 7, entraron: 11, salieron: 3, vendidas: 1, transferidas: 3, ajustes: -1 })
  })
  it('sin orden elegido, el más nuevo arriba (a igual hora, el escrito después)', () => {
    expect(ordenar(filas, null).map((f) => f.id)).toEqual(['5', '4', '3', '2', '1', '6', '7'])
    expect(ordenar(filas, { col: 'cant', dir: 'desc' })[0].id).toBe('6')
  })
  it('el período en días argentinos', () => {
    expect(rangoDeMovimientos('hoy', '2026-10-19')).toEqual({ desde: '2026-10-19', hasta: '2026-10-19' })
    expect(rangoDeMovimientos('ayer', '2026-10-01')).toEqual({ desde: '2026-09-30', hasta: '2026-09-30' })
    expect(rangoDeMovimientos('7d', '2026-10-19')).toEqual({ desde: '2026-10-13', hasta: '2026-10-19' })
    expect(rangoDeMovimientos('mes', '2026-10-19')).toEqual({ desde: '2026-10-01', hasta: '2026-10-19' })
  })
})

describe('el servidor', () => {
  const inventario = [{ product_id: 1, size_id: 1, product_name: 'TOP SAHARA', size_name: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', barcode: '771', store_name: 'Local', available_quantity: 2 }]
  const conMotorCon = (rows: unknown[]) => {
    const pedidos: unknown[][] = []
    const conMotor = async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn({
      query: async (sql: string, params: unknown[]) => { pedidos.push(params); return { rows: sql.includes('max(ocurrido_en)') ? [{ hasta: '2026-10-19T19:52:26Z' }] : rows } },
    })
    return { conMotor, pedidos }
  }
  it('lee el día argentino entero y arma las filas con el nombre del espejo', async () => {
    const { conMotor, pedidos } = conMotorCon([mov({ venta_numero: 296, venta_usuario: 'camila' })])
    const r = await listaDeMovimientos({ marca: 'zattia', desde: '2026-10-19', hasta: '2026-10-19' }, { conMotor, leerInventario: async () => inventario })
    expect(pedidos[0]).toEqual(['2026-10-19T03:00:00.000Z', '2026-10-20T03:00:00.000Z'])
    expect(r).toMatchObject({ cortado: false, libroHasta: '2026-10-19T19:52:26.000Z', filas: [{ nombre: 'TOP SAHARA', documento: 'Venta #296', quien: 'camila' }] })
  })
  it('más del tope ⇒ corta y lo dice', async () => {
    const { conMotor } = conMotorCon(Array.from({ length: TOPE_MOVS + 1 }, (_, i) => mov({ id: i })))
    const r = await listaDeMovimientos({ marca: 'bdi', desde: '2026-10-01', hasta: '2026-10-19' }, { conMotor, leerInventario: async () => [] })
    expect(r).toMatchObject({ cortado: true })
    expect((r as { filas: unknown[] }).filas).toHaveLength(TOPE_MOVS)
  })
  it('marca o período inválidos ⇒ 400; sin la conexión del motor, lo que diga `conMotor`', async () => {
    const deps = { conMotor: async () => ({ status: 409, error: 'falta la conexión' }), leerInventario: async () => [] }
    expect(await listaDeMovimientos({ marca: 'x', desde: '2026-10-19', hasta: '2026-10-19' }, deps)).toMatchObject({ status: 400 })
    expect(await listaDeMovimientos({ marca: 'bdi', desde: '2026-10-20', hasta: '2026-10-19' }, deps)).toMatchObject({ status: 400 })
    expect(await listaDeMovimientos({ marca: 'bdi', desde: '2026-10-19', hasta: '2026-10-19' }, deps)).toMatchObject({ status: 409 })
  })
})
