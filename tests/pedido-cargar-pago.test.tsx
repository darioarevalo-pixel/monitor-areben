// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «$ Cargar pago» DESDE la hoja del pedido mayorista (Darío §4: «le sumo otro pago al mismo pedido»), montado de verdad:
 * el botón aparece sólo si el pedido debe algo y hay cuenta; abre la hoja de pago del pedido con lo que falta, y lo que
 * viaja imputa ESE pedido. Con la tolerancia (faltan $1.000 o menos) se ve «Pagado» y se dice que la diferencia queda
 * en la cuenta (Bruno 31-oct), y el botón sigue: la deuda existe.
 */

const cliente = vi.hoisted(() => ({
  leerPedidoPanel: vi.fn(),
  buscarProductosPedido: vi.fn(),
  cambiarPedidoPanel: vi.fn(),
  mandarAPrepararPanel: vi.fn(),
  anularPedidoPanel: vi.fn(),
  entrarPedidoPanel: vi.fn(),
  leerPedidosPanel: vi.fn(),
  leerPreparadosSinPagar: vi.fn(),
  cobrarCuentaErp: vi.fn(),
  anotarWhatsappPanel: vi.fn(),
  leerCuentaPanel: vi.fn(),
  leerCuentasCorrientes: vi.fn(),
  sacarWhatsappPanel: vi.fn(),
  buscarClientesPanel: vi.fn(),
  clienteNuevoPanel: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => cliente)

import { HojaPedido } from '@/components/panel/PedidosMayoristas'

const V = '22222222-2222-4222-8222-222222222222'
const P = '11111111-1111-4111-8111-111111111111'
const ficha = (pago: Record<string, unknown>) => ({
  prendido: true, escribir: false,
  pedido: { id: P, numero: 12, recibido_en: '2026-10-30T15:00:00Z', etapa: 'pedido', total: 50000, unidades: 2, persona: null, venta_id: V, editable: true, a_preparar_por: null, pago },
  lineas: [{ product_id: 1, size_id: 10, cantidad: 2, precio: 25000, stock: 8, nombre: 'Funda Mom', talle: 'iPhone 13' }],
  cambios: [],
})
const cuenta = {
  prendido: true as const, prueba: true, hoy: '2026-10-31', linea: 'bdi' as const, credito: null,
  cliente: { id: '00000000-0000-0000-0000-0000000000c1', nombre: 'Mayorista Ejemplo', doc: null },
  estado: { saldo: 30000, debe: 30000, a_favor: 0, vencido: 0, dias_mayor: 1, atrasado: false, sin_credito: true, tramos: {}, pendientes: [
    { ref: `venta:${V}`, fecha: '2026-10-30', monto: 50000, pendiente: 30000, dias: 1, nombre: 'Venta 900' },
  ] },
  pagos: [], cuentas: [{ id: 7, nombre: 'Galicia', medio: 'transferencia' }], personas: [], delChat: null,
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let caja: HTMLDivElement
const boton = (txt: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === txt)
const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const montar = async (pago: Record<string, unknown>, conCuenta = true) => {
  cliente.leerPedidoPanel.mockResolvedValue(ficha(pago))
  await act(async () => { root.render(<HojaPedido pedidoId={P} cuenta={conCuenta ? cuenta : null} onCerrar={() => {}} onHecho={() => {}} />) })
  await esperar()
}

beforeEach(() => { caja = document.createElement('div'); document.body.appendChild(caja); root = createRoot(caja) })
afterEach(() => { act(() => root.unmount()); caja.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('Cargar pago desde la hoja del pedido (Darío §4)', () => {
  it('pagó una parte: el botón abre la hoja del pedido con lo que falta y manda la imputación a ESE pedido', async () => {
    await montar({ estado: 'parcial', falta: 30000, pagado: 20000 })
    expect(document.body.textContent).toContain('Pagó una parte (falta $30.000)')
    await act(async () => { boton('$ Cargar pago')!.click() })
    expect(document.body.textContent).toContain('Cargar pago · pedido 12')
    expect((document.querySelector('input[inputmode="decimal"]') as HTMLInputElement).value).toBe('$ 30.000')
    expect(document.body.textContent).toContain('Pedido 12 (30/10): $30.000 · queda pagada')
    cliente.cobrarCuentaErp.mockResolvedValue({ ok: true, cuenta: {} })
    await act(async () => { boton('Confirmar pago')!.click() })
    expect(cliente.cobrarCuentaErp).toHaveBeenCalledTimes(1)
    const [, c] = cliente.cobrarCuentaErp.mock.calls[0] as [string, Record<string, unknown>]
    expect(c).toMatchObject({ monto: 30000, cuenta: '7', imputar: [{ ventaId: V, monto: 30000 }] })
  })

  it('tolerancia: se ve «Pagado», dice que la diferencia queda en la cuenta, y se puede cargar igual', async () => {
    await montar({ estado: 'pagado', falta: 800, pagado: 49200, tolerado: true })
    const t = document.body.textContent ?? ''
    expect(t).toContain('Pagado')
    expect(t).toContain('Le faltan $800: menos de $1.000, se da por pagado y la diferencia queda en su cuenta.')
    expect(boton('$ Cargar pago')).toBeDefined()
  })

  it('pagado del todo, o sin cuenta: ⛔ hay botón', async () => {
    await montar({ estado: 'pagado', falta: 0, pagado: 50000 })
    expect(boton('$ Cargar pago')).toBeUndefined()
    expect(document.body.textContent).not.toContain('Le faltan')
    await montar({ estado: 'sin_pagar', falta: 50000, pagado: 0 }, false)
    expect(boton('$ Cargar pago')).toBeUndefined()
  })
})
