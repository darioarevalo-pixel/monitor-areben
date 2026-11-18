import { beforeEach, describe, expect, it, vi } from 'vitest'
import { entradaInvalida } from '@/lib/erp/entrada.core.js'
import { permisoErpDe } from '@/lib/permisos.core.js'

/**
 * El pedido mayorista en el panel de WhatsApp (plan «BDI directo al ERP» paso 3, `api/_erp-pedido.js`): ESCONDIDO detrás de
 * `PANEL_CUENTA_CORRIENTE`, y lo que ESCRIBE además detrás de `VENTA_MAYORISTA_REAL` (hasta el corte, la venta mayorista la
 * registra la copia de Gestión Nube: entrar un pedido acá reservaría dos veces).
 */
const pv = {
  ventaMayoristaRealEn: vi.fn((m: string, env: Record<string, string>) => String(env.VENTA_MAYORISTA_REAL ?? '').split(',').includes(m)),
  pedidosMayoristasDe: vi.fn(), fichaDePedidoMayorista: vi.fn(), preparadosSinPagar: vi.fn(),
  entrarPedidoMayorista: vi.fn(), cambiarPedidoMayorista: vi.fn(), mandarAPreparar: vi.fn(), anularPedidoDelErp: vi.fn(),
  productosParaPedido: vi.fn(), ponerEnvioPedido: vi.fn(),
}
vi.mock('../motor/pedido/venta.mjs', () => pv)
// Las reglas de la tienda (Darío 18-nov) sin red: sin packs ni ofertas, la escala de siempre.
const tienda = vi.hoisted(() => ({ anotar: vi.fn(async () => true) }))
vi.mock('../api/_tienda-precios.js', async () => {
  const { reglasDeTienda } = await import('../lib/erp/precio-tienda.core.js')
  return { reglasVigentes: async () => reglasDeTienda({ config: { updatedAt: 'x' } }), anotarPacksEnTienda: tienda.anotar }
})

import { accionDePedido, escribirPrendido, pedidoDelPanel, pedidosDelPanel, productosParaElPanel } from '../api/_erp-pedido.js'

const base = (rows: Record<string, unknown[]>) => ({
  query: async (sql: string) => {
    const k = Object.keys(rows).find((x) => sql.includes(x))
    return { rows: k ? rows[k] : [] }
  },
})
const conMotor = (db: unknown) => async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db)
const CON064 = { 'information_schema.columns': [{ hay: true }] }
const P = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'

describe('El pedido mayorista en el panel (paso 3 del plan)', () => {
  beforeEach(() => { for (const f of Object.values(pv)) if (f !== pv.ventaMayoristaRealEn) f.mockReset() })

  it('APAGADO el panel: contesta sin abrir la base', async () => {
    const abrir = vi.fn()
    expect(await pedidosDelPanel({ clienteId: C }, { conMotor: abrir, prendido: false })).toEqual({ prendido: false })
    expect(await pedidoDelPanel({ pedidoId: P }, { conMotor: abrir, prendido: false })).toEqual({ prendido: false })
    expect(await accionDePedido({ accion: 'pedido-a-preparar', body: { pedidoId: P }, usuario: 'bruno' }, { conMotor: abrir, prendido: false, escribir: true })).toMatchObject({ status: 409 })
    expect(abrir).not.toHaveBeenCalled()
  })

  it('ESCRIBIR apagado (VENTA_MAYORISTA_REAL): 409 sin tocar el motor; la llave la lee el motor y un typo ⛔ rompe', async () => {
    const abrir = vi.fn()
    for (const accion of ['pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular']) {
      expect(await accionDePedido({ accion, body: { pedidoId: P }, usuario: 'bruno' }, { conMotor: abrir, prendido: true, escribir: false })).toMatchObject({ status: 409 })
    }
    expect(abrir).not.toHaveBeenCalled()
    // La llave la decide el motor REAL (`motor/llave-corte.mjs`): el corte de BDI la prende sola (Bruno 1-nov).
    const sinCorte = { cortes: async () => ({ stunned: '2026-10-28T23:40:27.759Z' }) }
    const conCorte = { cortes: async () => ({ bdi: '2026-10-01T03:00:00.000Z' }) }
    const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv
    expect(await escribirPrendido(env({}), sinCorte)).toBe(false)
    expect(await escribirPrendido(env({ VENTA_MAYORISTA_REAL: 'bdi' }), sinCorte)).toBe(true)
    expect(await escribirPrendido(env({}), conCorte)).toBe(true)
    expect(await escribirPrendido(env({ ERP_NO_MANDA: 'bdi' }), conCorte)).toBe(false)
    expect(await escribirPrendido(env({ VENTA_MAYORISTA_REAL: 'bid' }), sinCorte)).toBe(false)
    expect(await escribirPrendido(env({}), { cortes: async () => { throw new Error('base caída') } })).toBe(false)
  })

  it('sin la sql/064 en la base: vacío, ⛔ rompe el panel', async () => {
    const r = await pedidosDelPanel({ clienteId: C }, { conMotor: conMotor(base({ 'information_schema.columns': [{ hay: false }] })), prendido: true, escribir: true })
    expect(r).toEqual({ prendido: true, escribir: false, pedidos: [], sinEntrar: [], deGn: [], falta064: true })
    expect(pv.pedidosMayoristasDe).not.toHaveBeenCalled()
  })

  it('los pedidos hechos en GN (`gn_sale_id`) NO salen como «sin entrar»: ya son venta de GN (pedido 91, 16-nov)', async () => {
    const sqls: string[] = []
    const fila = { id: 'g', numero: '91', recibido_en: '2026-11-06', total: '1', unidades: '1', contacto: { telefono: '0341 15 123-4567' }, apartado: false, gn_number: '33311' }
    const db = { query: async (sql: string): Promise<{ rows: unknown[] }> => { sqls.push(sql); return { rows: sql.includes('information_schema.columns') ? [{ hay: true }] : sql.includes('from pedido_mayorista') ? [fila] : [] } } }
    const r = await pedidosDelPanel({ clienteId: '', tel: '5493411234567' }, { conMotor: conMotor(db), prendido: true, escribir: true })
    expect(r).toMatchObject({ sinEntrar: [], deGn: [{ id: 'g', gn_number: '33311' }] })
    expect(sqls.find((x) => x.includes('from pedido_mayorista'))).toContain('gn_sale_id')
  })

  it('los pedidos del cliente y los SIN ENTRAR que llegaron con el número del chat (escrito de otra forma)', async () => {
    pv.pedidosMayoristasDe.mockResolvedValue({ ok: true, pedidos: [{ id: 'a', numero: 3 }] })
    const db = base({ ...CON064, 'from pedido_mayorista': [
      { id: 'x', numero: '9', recibido_en: '2026-10-30', total: '1000', unidades: '2', contacto: { telefono: '0341 15 123-4567', nombre: 'Rodrigo' } },
      { id: 'y', numero: '8', recibido_en: '2026-10-29', total: '500', unidades: '1', contacto: { telefono: '351 999 9999' } },
    ] })
    const r = await pedidosDelPanel({ clienteId: C, tel: '5493411234567' }, { conMotor: conMotor(db), prendido: true, escribir: false })
    expect(r).toEqual({ prendido: true, escribir: false, pedidos: [{ id: 'a', numero: 3 }], sinEntrar: [{ id: 'x', numero: 9, recibido_en: '2026-10-30', total: 1000, unidades: 2, nombre: 'Rodrigo' }], deGn: [] })
    expect(pv.pedidosMayoristasDe.mock.calls[0][1]).toEqual({ cliente_id: C, limite: 30 })
  })

  it('los VENDIDOS POR GN (antes del corte) ⛔ quedan «sin entrar»: van aparte con su número de GN, por el cliente de su venta de GN o por el número (Darío 16-nov, pedido 91 = GN 33311)', async () => {
    pv.pedidosMayoristasDe.mockResolvedValue({ ok: true, pedidos: [] })
    const sqls: string[] = []
    const filas: Record<string, unknown[]> = {
      ...CON064,
      'join venta v': [{ id: 'g1', numero: '91', recibido_en: '2026-11-06', total: '161600', unidades: '37', gn_number: '33311' }],
      'from pedido_mayorista': [
        { id: 'g1', numero: '91', recibido_en: '2026-11-06', total: '161600', unidades: '37', contacto: { telefono: '3413788292' }, apartado: false, gn_number: '33311' },
        { id: 'g2', numero: '95', recibido_en: '2026-11-10', total: '5000', unidades: '2', contacto: { telefono: '3413788292' }, apartado: false, gn_number: '33518' },
        { id: 'n1', numero: '111', recibido_en: '2026-11-15', total: '900', unidades: '1', contacto: { telefono: '3413788292', nombre: 'Fede' }, apartado: false, gn_number: null },
      ],
    }
    const db = { query: async (sql: string) => { sqls.push(sql); const k = Object.keys(filas).find((x) => sql.includes(x)); return { rows: k ? filas[k] : [] } } }
    const r = await pedidosDelPanel({ clienteId: C, tel: '5493413788292' }, { conMotor: conMotor(db), prendido: true, escribir: true })
    expect(r).toMatchObject({
      sinEntrar: [{ id: 'n1', numero: 111 }],
      deGn: [{ id: 'g2', numero: 95, gn_number: '33518' }, { id: 'g1', numero: 91, total: 161600, unidades: 37, gn_number: '33311' }],
    })
    expect((r as { deGn: unknown[] }).deGn).toHaveLength(2) // el 91 por las dos vías ⇒ una vez
    expect(sqls.find((x) => x.includes('join venta v'))).toMatch(/v\.origen = 'gn'/)
  })

  it('«Entrar» un vendido por GN: el freno del motor sale como 409', async () => {
    pv.entrarPedidoMayorista.mockResolvedValue({ ok: false, error: { codigo: 'VENDIDO_EN_GN', mensaje: 'El pedido 91 ya se vendió por Gestión Nube (venta 33311): no se entra de nuevo' } })
    const r = await accionDePedido({ accion: 'pedido-entrar', body: { pedidoId: P, clienteId: C }, usuario: 'dario' }, { conMotor: conMotor(base({})), prendido: true, escribir: true })
    expect(r).toEqual({ status: 409, error: 'El pedido 91 ya se vendió por Gestión Nube (venta 33311): no se entra de nuevo' })
  })

  it('«Agregar producto»: escondido como la ficha; menos de 2 letras ⛔ abre la base; lo demás lo contesta el motor', async () => {
    const abrir = vi.fn()
    expect(await productosParaElPanel({ pedidoId: P, q: 'jean' }, { conMotor: abrir, prendido: false })).toEqual({ prendido: false })
    expect(await productosParaElPanel({ pedidoId: 'x', q: 'jean' }, { conMotor: abrir, prendido: true })).toMatchObject({ status: 400 })
    expect(await productosParaElPanel({ pedidoId: P, q: ' j ' }, { conMotor: abrir, prendido: true })).toEqual({ prendido: true, productos: [] })
    expect(abrir).not.toHaveBeenCalled()
    const productos = [{ product_id: 7, nombre: 'Funda X', precio: 900, variantes: [{ size_id: 70, talle: 'iPhone 15', sku: null, stock: 3, en_pedido: false }] }]
    pv.productosParaPedido.mockResolvedValue({ ok: true, deposito: 'deposito_minorista', productos })
    // con el precio de la tienda en cada talle (sin regla especial: el de lista) y sin pack
    expect(await productosParaElPanel({ pedidoId: P, q: '  funda '.padEnd(200, 'x') }, { conMotor: conMotor(base({})), prendido: true })).toEqual({
      prendido: true, tienda: true,
      productos: [{ ...productos[0], pack: null, soloPack: false, promo: null, variantes: [{ ...productos[0].variantes[0], precio: 900, tipo: 'lista' }] }],
    })
    expect(pv.productosParaPedido.mock.calls[0][1].q).toHaveLength(80)
    pv.productosParaPedido.mockResolvedValue({ ok: false, error: { codigo: 'NO_ENCONTRADO', mensaje: 'No está ese pedido' } })
    expect(await productosParaElPanel({ pedidoId: P, q: 'funda' }, { conMotor: conMotor(base({})), prendido: true })).toEqual({ status: 404, error: 'No está ese pedido' })
  })

  it('la ficha suma nombre y variante a cada renglón', async () => {
    pv.fichaDePedidoMayorista.mockResolvedValue({ ok: true, pedido: { id: P, numero: 3 }, cambios: [], lineas: [{ product_id: 7, size_id: 70, cantidad: 2, precio: 500, stock: 4 }] })
    const db = base({ ...CON064, 'from producto ': [{ id: '7', nombre: 'Funda X' }], 'from variante': [{ product_id: '7', size_id: '70', talle: 'iPhone 15' }] })
    const r = await pedidoDelPanel({ pedidoId: P }, { conMotor: conMotor(db), prendido: true, escribir: true })
    expect(r).toMatchObject({ prendido: true, escribir: true, lineas: [{ nombre: 'Funda X', talle: 'iPhone 15', stock: 4 }] })
    pv.fichaDePedidoMayorista.mockResolvedValue({ ok: false, error: { codigo: 'NO_ENCONTRADO', mensaje: 'No está ese pedido' } })
    expect(await pedidoDelPanel({ pedidoId: P }, { conMotor: conMotor(db), prendido: true, escribir: true })).toEqual({ status: 404, error: 'No está ese pedido' })
  })

  it('las acciones llaman al motor con quién lo hace; los frenos del motor salen como 409', async () => {
    const db = base(CON064)
    const dep = { conMotor: conMotor(db), prendido: true, escribir: true, puedeAnular: true }
    pv.entrarPedidoMayorista.mockResolvedValue({ ok: true, ya: false, venta_id: 'v1' })
    expect(await accionDePedido({ accion: 'pedido-entrar', body: { pedidoId: P, clienteId: C, personaId: 'nada' }, usuario: 'darío' }, dep)).toEqual({ ok: true, ya: false, sinCambios: false, avisarDeposito: false, ventaId: 'v1' })
    expect(pv.entrarPedidoMayorista.mock.calls[0][1]).toEqual({ pedido_id: P, cliente_id: C, persona_id: null, usuario: 'darío' })
    expect(await accionDePedido({ accion: 'pedido-entrar', body: { pedidoId: P }, usuario: 'darío' }, dep)).toMatchObject({ status: 400 })
    pv.cambiarPedidoMayorista.mockResolvedValue({ ok: false, error: { codigo: 'EN_PREPARACION', mensaje: 'El depósito ya empezó' } })
    pv.fichaDePedidoMayorista.mockResolvedValueOnce({ ok: true, pedido: { id: P, marca: 'bdi' }, lineas: [{ product_id: 1, size_id: 10, cantidad: 1, precio: 500 }], cambios: [] })
    expect(await accionDePedido({ accion: 'pedido-cambiar', body: { pedidoId: P, lineas: [{ productId: 1, sizeId: 10, cantidad: 2 }] }, usuario: 'darío' }, dep)).toEqual({ status: 409, error: 'El depósito ya empezó' })
    // el precio lo pone la puerta: el que ya tenía (sin lista en la base, se respeta tal cual)
    expect(pv.cambiarPedidoMayorista.mock.calls[0][1]).toEqual({ pedido_id: P, lineas: [{ product_id: 1, size_id: 10, cantidad: 2, precio: 500 }], usuario: 'darío' })
    pv.anularPedidoDelErp.mockResolvedValue({ ok: true })
    await accionDePedido({ accion: 'pedido-anular', body: { pedidoId: P, motivo: 'no lo quiere' }, usuario: 'darío' }, dep)
    expect(pv.anularPedidoDelErp.mock.calls[0][1]).toEqual({ pedido_id: P, motivo: 'no lo quiere', usuario: 'darío' })
    expect(await accionDePedido({ accion: 'pedido-a-preparar', body: { pedidoId: P }, usuario: null }, dep)).toMatchObject({ status: 400 })
  })

  it('el ENVÍO (Darío 15-nov): llega al motor con quién lo pone; con el pedido FACTURADO ⛔ (cambiaría una venta facturada)', async () => {
    const ficha = { ok: true, pedido: { venta_id: 'v1', total: 88500 } }
    pv.fichaDePedidoMayorista.mockResolvedValue(ficha)
    pv.ponerEnvioPedido.mockReset().mockResolvedValue({ ok: true, sin_cambios: false, venta_id: 'v2' })
    const dep = (fac: { entera: unknown; partes: number } | null) => ({ conMotor: conMotor(base(CON064)), prendido: true, escribir: true, facturacion: async () => fac })
    expect(await accionDePedido({ accion: 'pedido-envio', body: { pedidoId: P, envio: 4500, transporte: 'EM' }, usuario: 'darío' }, dep({ entera: null, partes: 0 })))
      .toEqual({ ok: true, ya: false, sinCambios: false, avisarDeposito: false, ventaId: 'v2' })
    expect(pv.ponerEnvioPedido.mock.calls[0][1]).toEqual({ pedido_id: P, envio: 4500, transporte: 'EM', usuario: 'darío' })
    // vacío ⇒ se saca (null); negativo ⇒ 400 sin llamar al motor
    await accionDePedido({ accion: 'pedido-envio', body: { pedidoId: P, envio: '' }, usuario: 'darío' }, dep(null))
    expect(pv.ponerEnvioPedido.mock.calls[1][1]).toMatchObject({ envio: null })
    expect(await accionDePedido({ accion: 'pedido-envio', body: { pedidoId: P, envio: -5 }, usuario: 'darío' }, dep(null))).toMatchObject({ status: 400 })
    for (const fac of [{ entera: { id: 'f1' }, partes: 0 }, { entera: null, partes: 1 }]) {
      expect(await accionDePedido({ accion: 'pedido-envio', body: { pedidoId: P, envio: 100 }, usuario: 'darío' }, dep(fac))).toEqual({ status: 409, error: 'El pedido ya tiene factura: el envío no se cambia.' })
    }
    expect(pv.ponerEnvioPedido).toHaveBeenCalledTimes(2)
    expect(permisoErpDe({ method: 'POST', accion: 'pedido-envio' })).toBe('cobrar')
    expect(entradaInvalida({ method: 'POST', body: { accion: 'pedido-envio', marca: 'bdi', pedidoId: P, envio: 4500 } })).toBeNull()
  })

  it('el envío y el cambio devuelven la hoja nueva en la misma respuesta (Darío 18-nov: ~5 s al guardar el envío)', async () => {
    pv.fichaDePedidoMayorista.mockReset().mockResolvedValue({ ok: true, pedido: { id: P, venta_id: 'v2', total: 93000, cliente_id: C }, lineas: [{ product_id: 1, size_id: 10, cantidad: 1, precio: 500 }], cambios: [] })
    pv.ponerEnvioPedido.mockReset().mockResolvedValue({ ok: true, sin_cambios: false, venta_id: 'v2' })
    pv.cambiarPedidoMayorista.mockReset().mockResolvedValue({ ok: true, sin_cambios: false, venta_id: 'v2' })
    const dep = { conMotor: conMotor(base(CON064)), prendido: true, escribir: true, facturacion: async () => ({ entera: null, partes: 0 }) }
    const r = await accionDePedido({ accion: 'pedido-envio', body: { pedidoId: P, envio: 4500 }, usuario: 'darío' }, dep)
    expect(r).toMatchObject({ ok: true, ventaId: 'v2', ficha: { prendido: true, escribir: true, pedido: { total: 93000 } } })
    const c = await accionDePedido({ accion: 'pedido-cambiar', body: { pedidoId: P, lineas: [{ productId: 1, sizeId: 10, cantidad: 2 }] }, usuario: 'darío' }, dep)
    expect(c).toMatchObject({ ok: true, ficha: { pedido: { total: 93000 } } })
    // si leer la hoja falla, lo guardado sale igual (la pantalla la vuelve a pedir)
    pv.fichaDePedidoMayorista.mockReset().mockResolvedValueOnce({ ok: true, pedido: { venta_id: null, total: 1 } }).mockRejectedValueOnce(new Error('se cortó'))
    pv.ponerEnvioPedido.mockReset().mockResolvedValue({ ok: true, sin_cambios: false, venta_id: 'v3' })
    const sin = await accionDePedido({ accion: 'pedido-envio', body: { pedidoId: P, envio: '' }, usuario: 'darío' }, dep)
    expect(sin).toMatchObject({ ok: true, ventaId: 'v3' })
    expect(sin).not.toHaveProperty('ficha')
  })

  it('anular: sólo Darío y Bruno (puedeAnular) y con motivo (Darío 15-nov)', async () => {
    const dep = { conMotor: conMotor(base(CON064)), prendido: true, escribir: true }
    pv.anularPedidoDelErp.mockReset()
    expect(await accionDePedido({ accion: 'pedido-anular', body: { pedidoId: P, motivo: 'no lo quiere' }, usuario: 'ger' }, dep)).toMatchObject({ status: 403 })
    expect(await accionDePedido({ accion: 'pedido-anular', body: { pedidoId: P, motivo: '  ' }, usuario: 'darío' }, { ...dep, puedeAnular: true })).toMatchObject({ status: 400 })
    expect(pv.anularPedidoDelErp).not.toHaveBeenCalled()
  })

  it('la puerta: vistas y acciones nombradas con su forma; leer = cuentas, escribir = cobrar', () => {
    const get = (query: Record<string, unknown>) => entradaInvalida({ method: 'GET', query: { recurso: 'erp', nc: '1', ...query } })
    expect(get({ vista: 'pedidos-panel', marca: 'bdi', cliente: C, tel: '5493411234567' })).toBeNull()
    expect(get({ vista: 'pedidos-panel', marca: 'bdi', tel: '+54 341' })).not.toBeNull()
    expect(get({ vista: 'pedido-panel', marca: 'bdi', id: P })).toBeNull()
    expect(get({ vista: 'preparados-sin-pagar', marca: 'bdi' })).toBeNull()
    for (const vista of ['pedidos-panel', 'pedido-panel', 'preparados-sin-pagar']) expect(permisoErpDe({ method: 'GET', vista })).toBe('cuentas')
    const post = (body: unknown) => entradaInvalida({ method: 'POST', query: { recurso: 'erp' }, body })
    for (const accion of ['pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular']) {
      expect(post({ accion, marca: 'bdi', pedidoId: P })).toBeNull()
      expect(permisoErpDe({ method: 'POST', accion })).toBe('cobrar')
    }
  })
})
