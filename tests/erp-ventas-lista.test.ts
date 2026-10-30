import { describe, expect, it } from 'vitest'
import {
  COLUMNAS_DE_SIEMPRE, accionesDeFila, alternarColumna, armarFila, clienteDe, contarVistas, estadoDeVenta, filtrar, ventasDeTnSinNombre,
  historialDeVenta, moverColumna, normalizarPrefs, ordenar, rangoDePeriodo, resumen, saldoDeVenta,
} from '@/lib/erp/ventas-lista.core.js'
import { cobrarCuentaErp, cobrarVentaErp, corregirMedioErp, corregirPrecioErp, editarVentaErp, notaDeVentaErp, numeroDeFactura, textoDeCampo } from '../api/_erp-ventas.js'

/**
 * **ERP › Ventas, el PILOTO del diseño** (18-oct): la lista que junta Caja, TN, mayoristas, cambios y pedidos sin pagar.
 * El oráculo es lo que la pantalla DICE de cada venta, en todos sus estados: el chip de estado, el de cobro, de dónde sale
 * el cliente (el ERP manda; si no, GN; un pedido online ⛔ es «consumidor final»), qué cuenta cada vista y el resumen, y que
 * las columnas guardadas rotas ⛔ rompan la lista. Del lado del servidor: lo que ⛔ está en el motor se FRENA con el motivo.
 */

const venta = (o: Record<string, unknown> = {}) => ({
  kind: 'venta', id: 'v1', numero: 301, linea: 'zattia', tipo: 'venta', estado: 'confirmada', origen: 'caja', total: 18990, prueba: true,
  usuario: 'camilaquintana', ocurridaEn: '2026-10-18T13:40:00Z', pagos: [{ medio: 'efectivo', cuenta: 'Efectivo', monto: 18990 }], ...o,
})

describe('la fecha de la fila es la del PEDIDO (Bruno, 19-oct)', () => {
  it('una venta de Tienda Nube muestra cuándo entró el pedido, ⛔ cuándo se pagó; sin pedido, la de la venta', () => {
    const tn = armarFila(venta({ origen: 'tn', ocurridaEn: '2026-10-19T12:00:00Z', tnCreadaEn: '2026-10-16T22:05:00+00:00' }))
    expect(tn.pedidoEn).toBe('2026-10-16T22:05:00+00:00')
    expect(tn.ocurridaEn).toBe('2026-10-19T12:00:00Z')
    expect(armarFila(venta()).pedidoEn).toBe('2026-10-18T13:40:00Z')
    // Un pedido «posterior» al pago (reloj corrido) ⛔ adelanta la fecha.
    expect(armarFila(venta({ origen: 'tn', tnCreadaEn: '2026-10-18T14:00:00Z' })).pedidoEn).toBe('2026-10-18T13:40:00Z')
  })
  it('tres pedidos de días distintos pagados juntos se ordenan por el pedido', () => {
    const f = ['2026-10-14T10:00:00Z', '2026-10-17T10:00:00Z', '2026-10-15T10:00:00Z'].map((t, i) =>
      armarFila(venta({ id: `v${i}`, numero: 300 + i, origen: 'tn', ocurridaEn: '2026-10-19T12:00:00Z', tnCreadaEn: t })))
    expect(ordenar(f, null).map((x: { numero: number }) => x.numero)).toEqual([301, 302, 300])
  })
})

describe('el estado de cada venta', () => {
  it('cada origen dice lo suyo', () => {
    expect(estadoDeVenta(venta())).toBe('retirado')
    expect(estadoDeVenta(venta({ estado: 'anulada' }))).toBe('anulada')
    expect(estadoDeVenta(venta({ origen: 'mayorista', gnEstado: 'Compra Pendiente' }))).toBe('pendiente_gn')
    expect(estadoDeVenta(venta({ origen: 'mayorista', gnEstado: 'Cerrado' }))).toBe('cerrada_gn')
    expect(estadoDeVenta(venta({ origen: 'tn', tnEstado: 'a_preparar' }))).toBe('a_preparar')
    expect(estadoDeVenta(venta({ origen: 'tn', tnEstado: 'listo', envioTipo: 'pickup' }))).toBe('listo_retira')
    expect(estadoDeVenta(venta({ origen: 'tn', tnEstado: 'listo', envioTipo: 'ship' }))).toBe('listo_envio')
    expect(estadoDeVenta(venta({ origen: 'tn', tnEstado: null }))).toBe('sin_estado')
    expect(estadoDeVenta(venta({ origen: 'tn', tnEstado: 'algo_nuevo' }))).toBe('sin_estado')
  })
  it('el saldo: lo que quedó a cuenta, o lo del motor si vino; una anulada ⛔ debe', () => {
    const aCuenta = venta({ pagos: [{ medio: 'efectivo', monto: 1000 }, { medio: 'cuenta', monto: 17990 }] })
    expect(saldoDeVenta(venta())).toBe(0)
    expect(saldoDeVenta(aCuenta)).toBe(17990)
    expect(saldoDeVenta({ ...aCuenta, pendiente: 5000 })).toBe(5000)
    expect(saldoDeVenta({ ...aCuenta, pendiente: 0 })).toBe(0)
    expect(saldoDeVenta({ ...aCuenta, estado: 'anulada' })).toBe(0)
  })
  it('el cliente: el del ERP manda, después Gestión Nube; online sin nombre ⛔ es consumidor final', () => {
    expect(clienteDe(venta({ cliente: { nombre: 'Lucía G.' }, clienteGn: 'Otra' }))).toEqual({ nombre: 'Lucía G.', de: 'erp' })
    expect(clienteDe(venta({ clienteGn: 'Mayorista Norte' }))).toEqual({ nombre: 'Mayorista Norte', de: 'gn' })
    expect(clienteDe(venta({ clienteGn: 'Consumidor Final' }))).toEqual({ nombre: 'Consumidor final', de: null })
    expect(clienteDe(venta({ origen: 'tn', clienteGn: null }))).toEqual({ nombre: 'Sin nombre todavía', de: 'falta' })
    // Bruno, 19-oct: el pedido sin pagar trae el nombre de TN en vivo; GN y el ERP le siguen ganando
    expect(clienteDe(venta({ origen: 'tn', clienteGn: null, clienteTn: 'Micaela J.' }))).toEqual({ nombre: 'Micaela J.', de: 'tn' })
    expect(clienteDe(venta({ origen: 'tn', clienteGn: 'De Gestión Nube', clienteTn: 'Micaela J.' }))).toEqual({ nombre: 'De Gestión Nube', de: 'gn' })
  })
})

describe('la fila, las vistas y el resumen', () => {
  const filas = [
    armarFila(venta()),
    armarFila(venta({ id: 'v2', numero: 300, origen: 'tn', tnEstado: 'a_preparar', tnNumero: 21938, envioTipo: 'pickup', clienteGn: 'Lucía Gómez', total: 42500, facturaGn: 'B 00005-00012351' })),
    armarFila(venta({ id: 'v3', numero: 293, origen: 'mayorista', linea: 'bdi', gnEstado: 'Compra Pendiente', clienteGn: 'Mayorista Norte', total: 186400, pagos: [{ medio: 'cuenta', monto: 93200 }, { medio: 'transferencia', monto: 93200 }], nota: { id: 'n1', texto: 'Entregar con remito firmado', de: 'Darío' } })),
    armarFila(venta({ id: 'v4', numero: 286, estado: 'anulada', total: 22990 })),
    armarFila(venta({ id: 'v5', numero: 302, tipo: 'cambio', originalNumero: 301, total: 0 })),
    armarFila({ kind: 'pedido', tienda: 'zattia', tnId: '777', tnNumero: 4818, creadaEn: '2026-10-16T02:41:00Z', total: 15490, link: 'https://x/orders/777', unidades: 2 }),
  ]
  it('cada fila dice su origen, su cobro y su factura', () => {
    expect(filas[1]).toMatchObject({ origenTexto: 'Tienda Nube · 21938 · retira', cliente: 'Lucía Gómez', clienteDe: 'gn', facturada: true, factura: { de: 'gn' } })
    expect(filas[2]).toMatchObject({ cobroKey: 'saldo', saldo: 93200, estadoKey: 'pendiente_gn' })
    expect(filas[3]).toMatchObject({ cobroKey: 'devuelta', anulada: true })
    expect(filas[4].origenTexto).toBe('Cambio · de la #301')
    expect(filas[5]).toMatchObject({ kind: 'pedido', ref: 'Tienda Nube 4818', estadoKey: 'pedido', cobroKey: 'sinpagar', saldo: 15490, cliente: 'Sin nombre todavía' })
  })
  it('un pedido sin pagar trae lo que tenía su pestaña: hace cuánto, el medio y lo que retiene (y se busca por producto)', () => {
    const p = armarFila({
      kind: 'pedido', tienda: 'stunned', tnId: '9', tnNumero: 512, creadaEn: '2026-10-14T12:00:00Z', total: 30000, link: null, unidades: 3,
      dias: 5, medio: 'transfer', gateway: 'offline', prendas: [{ nombre: 'Remera Boxy Negra', sku: 'STU-1', cantidad: 2 }, { nombre: null, sku: 'STU-2', cantidad: 1 }],
    })
    expect(p).toMatchObject({ dias: 5, medio: 'Transferencia', origenTexto: 'Tienda Nube · 512 · sin pagar · Transferencia', prendas: [{ sku: 'STU-1' }, { sku: 'STU-2' }] })
    expect(filtrar([p], { q: 'boxy' })).toHaveLength(1)
    expect(filtrar([p], { q: 'stu-2' })).toHaveLength(1)
    // Sin medio de los de TN, el gateway; sin nada, ⛔ se inventa.
    expect(armarFila({ kind: 'pedido', tienda: 'bdi', tnId: '1', tnNumero: 1, creadaEn: '2026-10-19T12:00:00Z', total: 1, gateway: 'mercadopago' }).medio).toBe('mercadopago')
    expect(armarFila({ kind: 'pedido', tienda: 'bdi', tnId: '1', tnNumero: 1, creadaEn: '2026-10-19T12:00:00Z', total: 1 })).toMatchObject({ medio: null, dias: null, prendas: [] })
    expect(p.entregadoSinCobrar).toBe(false)
    expect(armarFila({ kind: 'pedido', tienda: 'bdi', tnId: '2', tnNumero: 2, creadaEn: '2026-10-19T12:00:00Z', total: 1, entregadoSinCobrar: true }).entregadoSinCobrar).toBe(true)
    // Se cobra en Cobranzas (el ícono $ lleva ahí, ⛔ a una ventana del ERP).
    expect(accionesDeFila(p).cobro).toMatchObject({ activo: true, label: 'Pedido sin pagar: se cobra en Cobros del monitor ↗' })
  })
  it('las vistas cuentan lo suyo', () => {
    expect(contarVistas(filas)).toEqual({ todas: 6, preparar: 2, listas: 0, desarmar: 0, sinpagar: 1, saldo: 1, sinfactura: 2, anuladas: 1 })
  })
  it('el buscador lee número, pedido de Tienda Nube, cliente y nota, sin tildes', () => {
    expect(filtrar(filas, { q: '#293' }).map((f: { id: string }) => f.id)).toEqual(['v3'])
    expect(filtrar(filas, { q: 'lucia' }).map((f: { id: string }) => f.id)).toEqual(['v2'])
    expect(filtrar(filas, { q: '21938' }).map((f: { id: string }) => f.id)).toEqual(['v2'])
    expect(filtrar(filas, { q: 'remito' }).map((f: { id: string }) => f.id)).toEqual(['v3'])
    expect(filtrar(filas, { origenes: ['mayorista'] }).length).toBe(1)
    expect(filtrar(filas, { vista: 'inexistente' }).length).toBe(6)
  })
  it('el resumen: vendido sin anuladas ni pedidos, ventas sin cambios, y lo que se debe', () => {
    expect(resumen(filas)).toEqual({ vendido: 18990 + 42500 + 186400 + 0, ventas: 3, ticket: Math.round(247890 / 3), porCobrar: 93200, sinPagar: 15490 })
    expect(resumen([])).toEqual({ vendido: 0, ventas: 0, ticket: 0, porCobrar: 0, sinPagar: 0 })
  })
  it('ordenar: sin orden la más nueva arriba; por total y por número', () => {
    expect(ordenar(filas, null)[0].id).toBe('v1')
    expect(ordenar(filas, { col: 'total', dir: 'desc' })[0].id).toBe('v3')
    expect(ordenar(filas, { col: 'n', dir: 'asc' })[0].kind).toBe('pedido')
  })
  it('los íconos de la fila: verde si hay algo para hacer, apagado dice por qué', () => {
    expect(accionesDeFila(filas[2], { cobrar: false }).cobro).toMatchObject({ activo: true, verde: true, label: 'Registrar cobro (todavía no disponible)' })
    expect(accionesDeFila(filas[2], { cobrar: true }).cobro.label).toBe('Registrar cobro · saldo $ 93.200')
    expect(accionesDeFila(filas[0]).cobro).toMatchObject({ verde: false, label: 'Cobrada · ver cobros' })
    expect(accionesDeFila(filas[3]).editar).toMatchObject({ activo: false })
    expect(accionesDeFila(filas[1]).factura).toMatchObject({ verde: true, label: 'Factura B 00005-00012351 (de Gestión Nube)' })
  })
})

describe('las columnas guardadas por usuario', () => {
  it('lo guardado roto, viejo o vacío ⛔ rompe: las de siempre, las fijas siempre visibles', () => {
    expect(normalizarPrefs(null)).toEqual({ ...COLUMNAS_DE_SIEMPRE })
    expect(normalizarPrefs('basura')).toEqual({ ...COLUMNAS_DE_SIEMPRE })
    const p = normalizarPrefs({ orden: ['total', 'vieja', 'c', 'c'], visibles: ['vieja', 'nota'] })
    expect(p.orden.slice(0, 2)).toEqual(['total', 'c'])
    expect(p.orden).toHaveLength(COLUMNAS_DE_SIEMPRE.orden.length)
    expect(p.visibles).toEqual(['total', 'c', 'n', 'nota'])
  })
  it('mover y alternar: los bordes ⛔ se mueven, las fijas ⛔ se ocultan', () => {
    const p = normalizarPrefs(null)
    expect(moverColumna(p, 'n', -1)).toBe(p)
    expect(moverColumna(p, 'h', -1).orden.slice(0, 2)).toEqual(['h', 'n'])
    expect(alternarColumna(p, 'total')).toBe(p)
    expect(alternarColumna(p, 'nota').visibles).toContain('nota')
    expect(alternarColumna(p, 'o').visibles).not.toContain('o')
  })
})

describe('el historial', () => {
  const ficha = {
    venta: { origen: 'caja', usuario: 'camila', tipo: 'venta', ocurridaEn: '2026-10-16T21:12:00Z' },
    pagos: [{ medio: 'cuenta', cuenta: 'Cuenta corriente', monto: 93200 }],
    cambios: [{ numero: 310, ocurridaEn: '2026-10-17T19:02:00Z', total: 0, estado: 'confirmada' }],
    original: null,
    anulacion: { anuladaEn: '2026-10-18T12:00:00Z', usuario: 'Bruno', motivo: 'Se cargó dos veces' },
  }
  it('del más viejo al más nuevo, con la edición antes → después', () => {
    const h = historialDeVenta(ficha, { ediciones: [{ cuando: '2026-10-17T12:40:00Z', campo: 'cliente', antes: 'Consumidor final', despues: 'Sofía R.', usuario: 'camila' }], notas: [{ cuando: '2026-10-17T13:00:00Z', texto: 'Pedir DNI', de: 'camila', reemplaza: 'Retira la hermana' }] })
    expect(h.map((x: { titulo: string }) => x.titulo)).toEqual(['Se vendió', 'Quedó a cuenta · $ 93.200', 'Editó cliente', 'Cambió la nota', 'Hizo un cambio · #310', 'Anulada'])
    expect(h[2]).toMatchObject({ antes: 'Consumidor final', despues: 'Sofía R.' })
    expect(h[3]).toMatchObject({ antes: 'Retira la hermana', despues: 'Pedir DNI' })
    expect(h[5].detalle).toBe('Bruno · «Se cargó dos veces»')
  })
})

describe('el período', () => {
  it('este mes, el pasado (también en enero) y los últimos días', () => {
    expect(rangoDePeriodo('mes', '2026-10-18')).toEqual({ desde: '2026-10-01', hasta: '2026-10-18' })
    expect(rangoDePeriodo('anterior', '2026-10-18')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(rangoDePeriodo('anterior', '2027-01-05')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' })
    expect(rangoDePeriodo('7d', '2026-10-03')).toEqual({ desde: '2026-09-27', hasta: '2026-10-03' })
  })
})

describe('el servidor: lo que ⛔ está en el motor se frena con el motivo', () => {
  const V = '11111111-2222-3333-4444-555555555555'
  const db = { query: async () => ({ rows: [{ id: V }] }) }
  it('sin la función del §16 en la copia: 409 «espera al motor», ⛔ un camino inventado', async () => {
    expect(await editarVentaErp({ marca: 'zattia', body: { ventaId: V, cambios: { vendedor: 'karen' } }, usuario: 'bruno' }, { ficha: {}, db })).toMatchObject({ status: 409 })
    expect(await notaDeVentaErp({ marca: 'zattia', body: { ventaId: V, texto: 'hola' }, usuario: 'bruno' }, { ficha: {}, db })).toMatchObject({ status: 409 })
    expect(await cobrarVentaErp({ marca: 'bdi', body: { ventaId: V, clienteId: V, monto: 100, cuenta: 'x', ref: V }, usuario: 'bruno' }, { cuenta: {}, db })).toMatchObject({ status: 409 })
  })
  it('con la función: manda SÓLO lo editable y devuelve el error del motor con su código', async () => {
    let pedido: unknown = null
    const ficha = { editarVenta: async (_db: unknown, e: unknown) => { pedido = e; return { ok: false, error: { codigo: 'YA_FACTURADA', mensaje: 'Ya está facturada' } } } }
    const r = await editarVentaErp({ marca: 'zattia', body: { ventaId: V, cambios: { vendedor: 'karen', total: 1 } }, usuario: 'bruno' }, { ficha, db })
    expect(pedido).toEqual({ venta_id: V, cambios: { vendedor: 'karen' }, usuario: 'bruno' })
    expect(r).toEqual({ status: 409, error: 'Ya está facturada (YA_FACTURADA)' })
  })
  it('corregir el precio: manda sólo n y precio, devuelve la diferencia, y sin la función o con un motivo vacío ⛔ escribe', async () => {
    let pedido: unknown = null
    const correccion = { corregirPrecio: async (_db: unknown, e: unknown) => { pedido = e; return { ok: true, correccion: { total_antes: 22500, total_despues: 19500, cobrado: 22500, diferencia: -3000 } } } }
    const lineas = [{ n: 1, precio: '12000', total: 5 }]
    const r = await corregirPrecioErp({ marca: 'zattia', body: { ventaId: V, motivo: ' Precio viejo ', lineas }, usuario: 'dario' }, { correccion, db })
    expect(pedido).toEqual({ venta_id: V, motivo: 'Precio viejo', usuario: 'dario', lineas: [{ n: 1, precio: 12000 }] })
    expect(r).toMatchObject({ ok: true, correccion: { diferencia: -3000 } })
    expect(await corregirPrecioErp({ marca: 'zattia', body: { ventaId: V, motivo: ' ', lineas }, usuario: 'd' }, { correccion, db })).toMatchObject({ status: 400 })
    expect(await corregirPrecioErp({ marca: 'zattia', body: { ventaId: V, motivo: 'x', lineas: [{ n: 1, precio: -1 }] }, usuario: 'd' }, { correccion, db })).toMatchObject({ status: 400 })
    expect(await corregirPrecioErp({ marca: 'zattia', body: { ventaId: V, motivo: 'x', lineas }, usuario: 'd' }, { correccion: {}, db })).toMatchObject({ status: 409 })
    const factura = { corregirPrecio: async () => ({ ok: false, error: { codigo: 'FACTURADA', mensaje: 'Ya tiene factura' } }) }
    expect(await corregirPrecioErp({ marca: 'zattia', body: { ventaId: V, motivo: 'x', lineas }, usuario: 'd' }, { correccion: factura, db })).toEqual({ status: 409, error: 'Ya tiene factura (FACTURADA)' })
  })
  it('corregir el medio del cobro: manda sólo lo que el motor entiende, devuelve la corrección, y sin la función o sin motivo ⛔ escribe', async () => {
    let pedido: unknown = null
    const correccionMedio = { corregirMedioCobro: async (_db: unknown, e: unknown) => { pedido = e; return { ok: true, correccion: { medio_antes: 'efectivo', medio_despues: 'transferencia', cuenta_despues: 'Transferencia', monto: 13500 }, avisos: ['SIN_CUENTA_REAL'] } } }
    const r = await corregirMedioErp({ marca: 'zattia', body: { ventaId: V, medio: ' transferencia ', motivo: ' Tienda Nube lo marcó pagado antes ', extra: 'x' }, usuario: 'dario' }, { correccionMedio, db })
    expect(pedido).toEqual({ venta_id: V, medio: 'transferencia', motivo: 'Tienda Nube lo marcó pagado antes', usuario: 'dario' })
    expect(r).toEqual({ ok: true, correccion: { medio_antes: 'efectivo', medio_despues: 'transferencia', cuenta_despues: 'Transferencia', monto: 13500 }, avisos: ['SIN_CUENTA_REAL'] })
    await corregirMedioErp({ marca: 'bdi', body: { ventaId: V, medio: 'transferencia', motivo: 'x', pagoId: V, cuenta: 2003, cuentaReal: 'abc' }, usuario: 'd' }, { correccionMedio, db })
    expect(pedido).toEqual({ venta_id: V, medio: 'transferencia', motivo: 'x', usuario: 'd', pago_id: V, cuenta: 2003, cuenta_real: 'abc' })
    const malo = (body: object) => corregirMedioErp({ marca: 'zattia', body: { ventaId: V, medio: 'mp', motivo: 'x', ...body }, usuario: 'd' }, { correccionMedio, db })
    expect(await malo({ motivo: ' ' })).toMatchObject({ status: 400 })
    expect(await malo({ medio: '' })).toMatchObject({ status: 400 })
    expect(await malo({ ventaId: 'no' })).toMatchObject({ status: 400 })
    expect(await malo({ pagoId: 'no' })).toMatchObject({ status: 400 })
    expect(await corregirMedioErp({ marca: 'otra', body: { ventaId: V, medio: 'mp', motivo: 'x' }, usuario: 'd' }, { correccionMedio, db })).toMatchObject({ status: 400 })
    expect(await corregirMedioErp({ marca: 'zattia', body: { ventaId: V, medio: 'mp', motivo: 'x' }, usuario: 'd' }, { correccionMedio: {}, db })).toMatchObject({ status: 409 })
    const factura = { corregirMedioCobro: async () => ({ ok: false, error: { codigo: 'FACTURADA', mensaje: 'Ya tiene factura' } }) }
    expect(await corregirMedioErp({ marca: 'zattia', body: { ventaId: V, medio: 'mp', motivo: 'x' }, usuario: 'd' }, { correccionMedio: factura, db })).toEqual({ status: 409, error: 'Ya tiene factura (FACTURADA)' })
    const noEsta = { corregirMedioCobro: async () => ({ ok: false, error: { codigo: 'NO_ENCONTRADA', mensaje: 'No está esa venta' } }) }
    expect(await corregirMedioErp({ marca: 'zattia', body: { ventaId: V, medio: 'mp', motivo: 'x' }, usuario: 'd' }, { correccionMedio: noEsta, db })).toMatchObject({ status: 404 })
  })
  it('el cliente se elige por documento y se vuelve su id; sin ficha, lo dice', async () => {
    let pedido: { cambios?: unknown } | null = null
    const ficha = { editarVenta: async (_db: unknown, e: { cambios: unknown }) => { pedido = e; return { ok: true, ediciones: [] } } }
    expect(await editarVentaErp({ marca: 'zattia', body: { ventaId: V, cambios: {}, clienteDoc: '30.111.222' }, usuario: 'b' }, { ficha, db })).toEqual({ ok: true, ediciones: [] })
    expect(pedido!.cambios).toEqual({ cliente_id: V })
    const sinFicha = { query: async () => ({ rows: [] }) }
    expect(await editarVentaErp({ marca: 'zattia', body: { ventaId: V, cambios: {}, clienteDoc: '30111222' }, usuario: 'b' }, { ficha, db: sinFicha })).toMatchObject({ status: 409 })
    expect(await editarVentaErp({ marca: 'zattia', body: { ventaId: V, cambios: {}, clienteDoc: '12' }, usuario: 'b' }, { ficha, db })).toMatchObject({ status: 400 })
  })
  it('el cobro va imputado a ESA venta, nunca más que su saldo, con una clave que no duplica', async () => {
    let pedido: Record<string, unknown> | null = null
    const cuenta = { registrarPagoACuenta: async (_db: unknown, e: Record<string, unknown>) => { pedido = e; return { ok: true, pago: {}, cuenta: {}, ya_existia: false } } }
    await cobrarVentaErp({ marca: 'bdi', body: { ventaId: V, clienteId: V, linea: 'bdi', monto: '150000', saldo: 93200, cuenta: 'c1', ref: V, fecha: '2026-10-18' }, usuario: 'Darío' }, { cuenta, db })
    expect(pedido).toMatchObject({ cliente_id: V, marca: 'bdi', monto: 150000, cuenta: 'c1', origen_ref: `erp-cobro:${V}`, prueba: true, imputar: [{ venta_id: V, monto: 93200 }] })
    expect(await cobrarVentaErp({ marca: 'bdi', body: { ventaId: V, clienteId: null, monto: 1, cuenta: 'c', ref: V }, usuario: 'x' }, { cuenta, db })).toMatchObject({ status: 400 })
  })
  it('el cobro a la CUENTA va sin imputar (el motor lo reparte FIFO), con su propia clave, y valida lo suyo', async () => {
    let pedido: Record<string, unknown> | null = null
    const cuenta = { registrarPagoACuenta: async (_db: unknown, e: Record<string, unknown>) => { pedido = e; return { ok: true, pago: {}, cuenta: {}, ya_existia: false } } }
    const r = await cobrarCuentaErp({ marca: 'bdi', body: { clienteId: V, linea: 'bdi', monto: '150000', cuenta: 'c1', ref: V, fecha: '2026-10-18' }, usuario: 'Darío' }, { cuenta, db })
    expect(r).toMatchObject({ ok: true, yaExistia: false })
    expect(pedido).toMatchObject({ cliente_id: V, marca: 'bdi', monto: 150000, cuenta: 'c1', origen_ref: `erp-cobro-cuenta:${V}`, prueba: true, ocurrida_en: '2026-10-18T15:00:00.000Z' })
    expect(pedido).not.toHaveProperty('imputar')
    for (const body of [{ clienteId: null }, { monto: 0 }, { monto: 'x' }, { cuenta: '' }, { ref: 'x' }]) {
      expect(await cobrarCuentaErp({ marca: 'bdi', body: { clienteId: V, monto: 10, cuenta: 'c', ref: V, ...body }, usuario: 'x' }, { cuenta, db })).toMatchObject({ status: 400 })
    }
    expect(await cobrarCuentaErp({ marca: 'otra', body: { clienteId: V, monto: 10, cuenta: 'c', ref: V }, usuario: 'x' }, { cuenta, db })).toMatchObject({ status: 400 })
    expect(await cobrarCuentaErp({ marca: 'bdi', body: { clienteId: V, monto: 10, cuenta: 'c', ref: V }, usuario: 'x' }, { cuenta: {}, db })).toMatchObject({ status: 409 })
    const rechaza = { registrarPagoACuenta: async () => ({ ok: false, error: { codigo: 'CUENTA_DESCONOCIDA', mensaje: 'Un pago a cuenta entra con plata' } }) }
    expect(await cobrarCuentaErp({ marca: 'bdi', body: { clienteId: V, monto: 10, cuenta: 'c', ref: V }, usuario: 'x' }, { cuenta: rechaza, db })).toMatchObject({ status: 409 })
  })
  it('los textos: el número de factura y lo editado', () => {
    expect(numeroDeFactura({ tipo: 6, pto_vta: 5, numero: 12351, ambiente: 'produccion' })).toBe('B 0005-00012351')
    expect(numeroDeFactura({ tipo: 8, pto_vta: 2, numero: 3, ambiente: 'homologacion' })).toBe('NC B 0002-00000003 (prueba)')
    expect(textoDeCampo('entrega', { tipo: 'envio', direccion: 'Mitre 123' })).toBe('Envío · Mitre 123')
    expect(textoDeCampo('cliente', null)).toBe('—')
  })
})

describe('ventasDeTnSinNombre: las ventas de Tienda Nube que hay que pedir a Tienda Nube en vivo', () => {
  const v = (extra: Record<string, unknown> = {}) => ({ origen: 'tn', origen_ref: 'stunned:2043654775', cliente: null, clienteGn: null, ...extra })
  it('sin nombre del ERP ni de Gestión Nube ⇒ se pide; con alguno de los dos ⇒ ⛔', () => {
    const r = ventasDeTnSinNombre([v(), v({ clienteGn: 'Ana P.' }), v({ cliente: { nombre: 'Lía' } }), v({ clienteGn: 'Consumidor final', origen_ref: 'zattia:77' })])
    expect(r).toEqual([{ i: 0, tienda: 'stunned', tnId: '2043654775' }, { i: 3, tienda: 'zattia', tnId: '77' }])
  })
  it('la Caja y lo que ⛔ trae un id de Tienda Nube válido ⛔ se piden, y hay tope', () => {
    expect(ventasDeTnSinNombre([v({ origen: 'caja' }), v({ origen_ref: null }), v({ origen_ref: 'stunned:abc' })])).toEqual([])
    expect(ventasDeTnSinNombre(Array.from({ length: 5 }, (_, k) => v({ origen_ref: `bdi:${k + 1}` })), 2)).toHaveLength(2)
  })
})
