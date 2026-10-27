// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Ventas › Gastos, la pantalla**: abre en «De prueba»; los números salen del motor; si hay cobros sin tasa lo dice
 * (esas comisiones NO están en el total); «Nuevo gasto» pide confirmar y manda el monto con su signo y el libro elegido.
 */
const leer = vi.fn(async (_m: string, desde: string, hasta: string, prueba: boolean) => ({
  desde, hasta, prueba, total: 1_010_000, por_tipo: { comision: 450_000, impuesto: 200_000, otro: 360_000 }, meses: [], comisionAutomatica: 412_000, cobrosSinComision: 3,
  gastos: [{ id: '1', linea: 'zattia', fecha: '2026-10-17', tipo: 'otro', monto: 21_000, detalle: 'Cadete · 6 envíos', cuenta: 'Caja de efectivo', origen: 'manual', venta_id: null, usuario: 'Bruno', creado_en: '2026-10-17T15:00:00Z' }],
}))
const registrar = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/erp/cliente', () => ({
  leerGastos: (...a: [string, string, string, boolean]) => leer(...a),
  registrarGastoErp: (...a: unknown[]) => (registrar as (...x: unknown[]) => unknown)(...a),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'Bruno' } }) }))

let root: Root | null = null
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; vi.clearAllMocks() })

const boton = (t: string | RegExp) => [...document.querySelectorAll('button')].find((b) => (typeof t === 'string' ? b.textContent?.trim() === t : t.test(b.textContent ?? '')))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const escribir = async (el: Element, v: string) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function montar() {
  const { GastosErp } = await import('@/components/erp/ventas/GastosErp')
  const { ConfirmProvider } = await import('@/components/ui')
  const host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ConfirmProvider><GastosErp /></ConfirmProvider>) })
  await act(async () => {})
  return host
}

describe('la pantalla de Gastos', () => {
  it('abre en «De prueba», con los tiles, la comisión automática y el aviso de los cobros sin tasa', async () => {
    const host = await montar()
    expect(leer.mock.calls[0][3]).toBe(true)
    const t = host.textContent ?? ''
    expect(t).toContain('1.010.000')
    expect(t).toContain('412.000 salen solas de los cobros')
    expect(t).toContain('3 cobros con tarjeta o Mercado Pago no tienen comisión')
    expect(t).toContain('no están en el total')
    expect(t).toContain('Comisiones de plataformas de todos los cobros del período')
    expect(t).toContain('Cadete · 6 envíos')
    await clic(boton('Reales'))
    expect(leer.mock.calls.at(-1)![3]).toBe(false)
  })

  it('Nuevo gasto: un monto vacío no sale; con signo menos sale negativo, de prueba, después de confirmar', async () => {
    await montar()
    await clic(boton('Nuevo gasto'))
    await clic(boton('Cargar gasto'))
    expect(document.body.textContent).toContain('El monto es distinto de cero')
    expect(registrar).not.toHaveBeenCalled()
    const campos = [...document.querySelectorAll('input')]
    const monto = campos.find((i) => i.getAttribute('inputmode') === 'decimal')!
    const detalle = campos.find((i) => i.placeholder === 'Cadete · 6 envíos')!
    await escribir(monto, '-21.000')
    await escribir(detalle, 'Cadete cargado de más')
    await clic(boton('Cargar gasto'))
    await clic(boton('Cargar'))
    expect(registrar).toHaveBeenCalledTimes(1)
    expect(registrar.mock.calls[0]).toMatchObject(['zattia', { tipo: 'otro', monto: -21000, detalle: 'Cadete cargado de más', prueba: true, linea: 'zattia' }])
    expect(document.body.textContent).toContain('Quedó anotado')
  })
})
