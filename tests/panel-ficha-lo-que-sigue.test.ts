import { describe, expect, it, vi } from 'vitest'

/**
 * La ficha del cliente con el ERP (Darío 15-nov, https://claude.ai/artifact/XiTbXCnZ4RqBs6Gog2Ea9m): «Lo que sigue» en orden
 * —1) sin cliente, 2) armado sin pagar, 3) debe una compra vieja (más días primero)— y la barra de pasos de cada pedido.
 */
vi.mock('@/lib/erp/cliente', () => ({}))
vi.mock('@/components/panel/CuentaCorriente', () => ({ useCuentaPrendida: () => true, HojaCargarPago: () => null, mensajeDeLaCuenta: () => 'Hola, te paso el saldo' }))
vi.mock('@/components/panel/FacturasCliente', () => ({}))
vi.mock('@/components/SesionProvider', () => ({ usePerfilOpcional: () => null }))

const { loQueSigue, pasosDe } = await import('@/components/panel/PedidosMayoristas')

const ped = (o: Record<string, unknown>) => ({ id: 'p', numero: 1203, recibido_en: '2026-11-15T12:00:00Z', etapa: 'pedido', total: 850000, unidades: 210, persona: null, venta_id: 'v1', ...o })
const cuenta = (pendientes: unknown[]) => ({ cliente: { id: 'c', nombre: 'Tecno', doc: null }, estado: { saldo: 1, pendientes } }) as never

describe('«Lo que sigue»', () => {
  it('orden: sin cliente → armado sin pagar → compras viejas (más días primero); la deuda del pedido abierto ⛔ se repite', () => {
    const pedidos = {
      prendido: true as const, escribir: true,
      sinEntrar: [{ id: 's1', numero: 1210, recibido_en: '', total: 290000, unidades: 64, nombre: 'Rodrigo', apartado: true }, { id: 's2', numero: 1211, recibido_en: '', total: 1, unidades: 1, nombre: null }],
      pedidos: [
        ped({ id: 'a', etapa: 'preparado', venta_id: 'v9', pago: { estado: 'sin_pagar', falta: 430000, pagado: 0 } }),
        ped({ id: 'b', etapa: 'pedido', venta_id: 'v1', pago: { estado: 'sin_pagar', falta: 850000, pagado: 0 } }),
        ped({ id: 'c', etapa: 'preparado', venta_id: 'v8', cuenta_habilitada: true, pago: { estado: 'sin_pagar', falta: 5, pagado: 0 } }),
      ],
    }
    const items = loQueSigue(pedidos as never, cuenta([
      { ref: 'venta:v1', fecha: '2026-11-15', monto: 850000, pendiente: 850000, dias: 0 },
      { ref: 'venta:v3', fecha: '2026-10-25', monto: 520000, pendiente: 320000, dias: 21 },
      { ref: 'venta:v4', fecha: '2026-10-01', monto: 100000, pendiente: 100000, dias: 45 },
    ]))
    expect(items.map((i) => i.titulo)).toEqual(['Sin cliente', 'M-1203 armado, sin pagar', 'Debe $100.000 hace 45 días', 'Debe $320.000 hace 21 días'])
    expect(items[0].mensaje).toBeUndefined()
    expect(items[1].mensaje?.label).toBe('Pedir pago')
    expect(items[3].detalle).toBe('pagó $200.000 de $520.000')
  })

  it('al día y sin pedidos: nada', () => {
    expect(loQueSigue({ prendido: true, escribir: true, sinEntrar: [], pedidos: [] }, cuenta([]))).toEqual([])
    expect(loQueSigue(null, null)).toEqual([])
  })
})

describe('la barra Pedido · Pago · Preparación · Despacho', () => {
  it('marca lo hecho', () => {
    expect(pasosDe({ etapa: 'pedido', pago: { estado: 'sin_pagar', falta: 1, pagado: 0 } })).toEqual([true, false, false, false])
    expect(pasosDe({ etapa: 'a_preparar', pago: { estado: 'pagado', falta: 0, pagado: 1 } })).toEqual([true, true, false, false])
    expect(pasosDe({ etapa: 'preparado', pago: { estado: 'parcial', falta: 1, pagado: 1 } })).toEqual([true, false, true, false])
    expect(pasosDe({ etapa: 'despachado', pago: { estado: 'pagado', falta: 0, pagado: 1 } })).toEqual([true, true, true, true])
  })
})
