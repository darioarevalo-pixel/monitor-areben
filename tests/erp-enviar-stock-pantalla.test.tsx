// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EmpujeStock } from '@/lib/erp/cliente'

/**
 * **ERP › Diferencias › «Enviar el stock a Tienda Nube», del lado de la pantalla.** El oráculo es lo que se LEE: un envío SECO
 * dice «Sin enviar» (⛔ se pinta de éxito), el botón confirma ANTES y dice si es prueba o de verdad según el último envío,
 * cancelar ⛔ pide nada, y mientras uno espera en la cola el botón se traba y la lista se vuelve a leer.
 */
const env = (x: Partial<EmpujeStock>): EmpujeStock => ({
  id: 1, estado: 'hecho', pedidoPor: 'boton:Bruno', avisos: 1, pedidoEn: '2026-10-28T12:00:00Z', terminadoEn: '2026-10-28T12:01:00Z', error: null,
  seco: true, cambios: 3, unidades: 5, escritos: null, quedan: null, ...x,
})
let lista: EmpujeStock[] = []
const leerEmpujesStock = vi.fn(async (_t: string) => ({ tienda: 'stunned', empujes: lista }))
const mandarStockATN = vi.fn(async (_t: string) => ({ ok: true, id: 2, yaEsperaba: false }))
vi.mock('@/lib/erp/cliente', () => ({ leerEmpujesStock: (t: string) => leerEmpujesStock(t), mandarStockATN: (t: string) => mandarStockATN(t) }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); vi.useRealTimers() })

async function montar(tienda: 'bdi' | 'zattia' | 'stunned' = 'stunned') {
  const { EnviarStockTN } = await import('@/components/erp/stock/EnviarStockTN')
  const { ConfirmProvider } = await import('@/components/ui/Confirm')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ConfirmProvider><EnviarStockTN tienda={tienda} /></ConfirmProvider>) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const apretar = async (texto: string) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent === texto)
  if (!b) throw new Error(`no está el botón «${texto}»`)
  await act(async () => { b.click() })
  await act(async () => {})
}
const boton = () => [...document.querySelectorAll('button')].find((b) => /Enviar el stock|Enviando|Pidiendo/.test(b.textContent ?? ''))!

describe('Enviar el stock a Tienda Nube', () => {
  it('un envío seco dice «Sin enviar» y qué cambiaría, ⛔ «Enviado»; el automático dice que lo pidió el ERP', async () => {
    lista = [env({ id: 3, pedidoPor: 'libro:zattia' }), env({ id: 1 })]
    await montar()
    expect(leerEmpujesStock).toHaveBeenCalledWith('stunned')
    expect(todo()).toContain('Sin enviar')
    expect(todo()).toContain('3 variantes distintas (5 u)')
    expect(todo()).not.toContain('Enviado')
    expect(todo()).toContain('el ERP, solo')
    expect(todo()).toContain('Bruno')
    expect(todo()).toContain('Hasta el corte de Stunned es una prueba')
  })

  it('confirma ANTES (prueba hasta el corte) y cancelar ⛔ pide nada', async () => {
    lista = [env({})]
    await montar()
    await act(async () => { boton().click() })
    expect(todo()).toContain('el ERP sólo calcula qué cambiaría')
    expect(todo()).toContain('dio 3 variantes distintas')
    expect(mandarStockATN).not.toHaveBeenCalled()
    await apretar('Cancelar')
    expect(mandarStockATN).not.toHaveBeenCalled()
  })

  it('con la llave prendida (último envío real) avisa que cambia la tienda de verdad, y al aceptar pide el envío', async () => {
    lista = [env({ seco: false, escritos: 3, quedan: 0 })]
    await montar('zattia')
    expect(todo()).toContain('Enviado')
    expect(todo()).toContain('3 variantes cambiadas en Tienda Nube')
    await act(async () => { boton().click() })
    expect(todo()).toContain('Cambia el stock de la tienda de verdad')
    await apretar('Enviar')
    expect(mandarStockATN).toHaveBeenCalledWith('zattia')
    expect(leerEmpujesStock).toHaveBeenCalledTimes(2)
  })

  it('mientras uno espera en la cola el botón se traba y la lista se vuelve a leer sola', async () => {
    vi.useFakeTimers()
    lista = [env({ id: 2, estado: 'pendiente', seco: null, cambios: null, terminadoEn: null }), env({})]
    await montar()
    expect(todo()).toContain('En cola')
    expect(boton().disabled).toBe(true)
    lista = [env({ id: 2 }), env({})]
    await act(async () => { vi.advanceTimersByTime(10_000) })
    await act(async () => {})
    expect(leerEmpujesStock).toHaveBeenCalledTimes(2)
    expect(todo()).not.toContain('En cola')
    expect(boton().disabled).toBe(false)
  })
})
