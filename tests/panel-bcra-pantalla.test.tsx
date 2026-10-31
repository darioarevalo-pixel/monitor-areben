// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **Panel de WhatsApp › tarjeta de cuenta › «Situación crediticia»** (BCRA, Bruno 31-oct). El oráculo: ⛔ consulta sola al
 * abrir la tarjeta; al apretar pide la vista con el id de la FICHA y dibuja lo que contestó (situación, cuánto debe en
 * pesos, cheques, el mes informado); con DNI dice que hace falta el CUIT.
 */

const CLIENTE = '00000000-0000-0000-0000-0000000000c1'
const cuenta = {
  prendido: true as const, prueba: true, hoy: '2026-10-31', linea: 'bdi' as const, credito: null,
  cliente: { id: CLIENTE, nombre: 'Mayorista Ejemplo', doc: '30718508181' },
  estado: { saldo: 0, debe: 0, a_favor: 0, vencido: 0, dias_mayor: 0, atrasado: false, sin_credito: true, tramos: {}, pendientes: [] },
  pagos: [], cuentas: [], personas: null, delChat: null,
}
const leerBcraPanel = vi.fn()
vi.mock('@/lib/erp/cliente', () => ({
  cobrarCuentaErp: vi.fn(), leerCuentaPanel: vi.fn(), leerCuentasCorrientes: vi.fn(), anotarWhatsappPanel: vi.fn(), sacarWhatsappPanel: vi.fn(),
  leerBcraPanel: (...a: unknown[]) => leerBcraPanel(...a),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined

async function montar() {
  const { TarjetaCuenta } = await import('@/components/panel/CuentaCorriente')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<TarjetaCuenta cuenta={cuenta} telChat={null} decir={() => {}} onCambio={() => {}} />) })
}

describe('Situación crediticia en la tarjeta de cuenta (pantalla)', () => {
  it('⛔ consulta sola; al apretar pide la ficha y muestra situación, deuda en pesos, cheques y el mes', async () => {
    leerBcraPanel.mockResolvedValue({
      prendido: true, cuit: '30718508181', ok: true, denominacion: 'AREBEN COMERCIAL S. R. L.', periodo: '202609', peor: 1, deuda: 28_527_000,
      bancos: [{ entidad: 'BANCO MACRO S.A.', situacion: 1, monto: 20_323_000, diasAtraso: 0, juicio: false }, { entidad: 'BANCO DE GALICIA Y BUENOS AIRES S.A.', situacion: 1, monto: 8_204_000, diasAtraso: 0, juicio: false }],
      historia: [], peor12: 1, cheques: { total: 0, sinPagar: 0, monto: 0 },
    })
    await montar()
    expect(leerBcraPanel).not.toHaveBeenCalled()
    await act(async () => { boton('Ver situación en el BCRA')!.click() })
    expect(leerBcraPanel).toHaveBeenCalledWith(CLIENTE)
    const t = document.body.textContent ?? ''
    expect(t).toContain('Situación 1 (normal) · debe $28.527.000 en 2 bancos · sin cheques rechazados')
    expect(t).toContain('BANCO MACRO S.A.')
    expect(t).toContain('informado a sep-26')
    expect(boton('Ver situación en el BCRA')).toBeUndefined()
  })

  it('con DNI dice que hace falta el CUIT', async () => {
    leerBcraPanel.mockResolvedValue({ prendido: true, sinCuit: true })
    await montar()
    await act(async () => { boton('Ver situación en el BCRA')!.click() })
    expect(document.body.textContent).toContain('Hace falta el CUIT del cliente')
  })

  it('si el BCRA falla lo dice y deja volver a intentar', async () => {
    leerBcraPanel.mockRejectedValue(new Error('No se pudo consultar el BCRA.'))
    await montar()
    await act(async () => { boton('Ver situación en el BCRA')!.click() })
    expect(document.body.textContent).toContain('No se pudo consultar el BCRA.')
    expect(boton('Ver situación en el BCRA')).toBeDefined()
  })
})
