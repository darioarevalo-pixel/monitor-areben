// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **La otra puerta del freno del 30-ago-2026: la pantalla.**
 *
 * ⚠️ **El botón ⛔ NO se esconde, y es a propósito** — la regla escrita de este módulo, por cuarta
 * vez: *una pantalla que esconde un botón es una sugerencia, ⛔ no una regla*. El freno de verdad
 * es el 409 del handler; lo que la pantalla hace es **preguntar por qué sale igual**, y eso queda
 * en el historial. Esconderlo dejaría a Administración sin forma de pagar antes cuando hay que
 * hacerlo, y esa plata saldría por transferencia sin dejar rastro en el sistema.
 */

const FILAS: ReclamoRow[] = []

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => ({ filas: FILAS, hayMas: false })) }
})

const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

/** Un reembolso decidido, con el producto pedido de vuelta y todavía en la calle. */
const EN_LA_CALLE = {
  id: 22, store: 'bdi', estado: 'en_transito', motivo: 'falla', cliente: 'Lorena',
  compensacion: 'reembolso', destino_prenda: 'stock', retorno_decidido: true,
  monto_total: 90000, items: [{ sku: 'A1', producto: 'Campera', cantidad: 1, precio: '90000.00' }],
  reintegro_estado: 'pendiente', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica', cobro_estado: 'no_aplica', historial: [],
} as unknown as ReclamoRow

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

/** Monta Reclamos con esa fila y devuelve el div montado, para apretar y leer. */
const montar = async (fila: ReclamoRow) => {
  FILAS.length = 0
  FILAS.push(fila)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  window.history.replaceState(null, '', '/postventa')
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
  })
  return { div, root }
}

describe('devolver la plata con el producto todavía en la calle', () => {
  /**
   * 🔴 **El positivo primero, y sin él el resto sería vacío**: si la fila no se dibujara, "no está
   * el botón" se cumpliría igual y un mutante que lo esconda siempre pasaría entero.
   */
  it('🔴 el botón ESTÁ, aunque el producto no haya vuelto', async () => {
    const { div, root } = await montar(EN_LA_CALLE)
    expect(div.textContent).toContain('R-0022')
    expect([...div.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Devolver la plata'))).toBe(true)
    await act(async () => { root.unmount() })
    div.remove()
  })

  it('🔴 apretarlo PREGUNTA por qué sale igual, y manda el motivo', async () => {
    let mandado: Record<string, unknown> | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      const cuerpo = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null
      if (cuerpo?.action === 'reintegro') mandado = cuerpo
      return { ok: true, status: 200, json: async () => ({ ok: true, devoluciones: [] }) }
    }))
    // Sin `ConfirmProvider` alrededor, `useConfirmar` cae a los diálogos nativos (ver `Confirm.tsx`).
    const pregunta = vi.spyOn(window, 'prompt').mockReturnValue('lo amenazó con Defensa del Consumidor')
    const confirma = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const { div, root } = await montar(EN_LA_CALLE)
    const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Devolver la plata'))
    await act(async () => { b!.click() })
    await act(async () => { root.unmount() })
    div.remove()

    // 🔑 Preguntó por el MOTIVO, ⛔ no confirmó el monto: son dos diálogos distintos.
    expect(pregunta).toHaveBeenCalled()
    expect(String(pregunta.mock.calls[0][0])).toContain('Campera')
    expect(confirma).not.toHaveBeenCalled()
    expect(mandado).toMatchObject({ action: 'reintegro', id: 22, motivo: 'lo amenazó con Defensa del Consumidor' })
    vi.unstubAllGlobals()
    pregunta.mockRestore()
    confirma.mockRestore()
  })

  it('⛔ y si nadie escribe el motivo, ⛔ no manda nada', async () => {
    let mandado: Record<string, unknown> | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      const cuerpo = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null
      if (cuerpo?.action === 'reintegro') mandado = cuerpo
      return { ok: true, status: 200, json: async () => ({ ok: true, devoluciones: [] }) }
    }))
    const pregunta = vi.spyOn(window, 'prompt').mockReturnValue('   ')

    const { div, root } = await montar(EN_LA_CALLE)
    const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Devolver la plata'))
    await act(async () => { b!.click() })
    await act(async () => { root.unmount() })
    div.remove()

    expect(pregunta).toHaveBeenCalled()
    expect(mandado).toBeNull()
    vi.unstubAllGlobals()
    pregunta.mockRestore()
  })

  /** Con el producto ya recibido ⛔ no pregunta el motivo: confirma el monto, como siempre. */
  it('con el producto recibido vuelve a ser la confirmación de siempre', async () => {
    let mandado: Record<string, unknown> | null = null
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
      const cuerpo = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null
      if (cuerpo?.action === 'reintegro') mandado = cuerpo
      return { ok: true, status: 200, json: async () => ({ ok: true, devoluciones: [] }) }
    }))
    const pregunta = vi.spyOn(window, 'prompt').mockReturnValue('x')
    const confirma = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const llego = {
      ...EN_LA_CALLE, estado: 'recibido',
      items: [{ sku: 'A1', producto: 'Campera', cantidad: 1, precio: '90000.00', recibida_at: '2026-08-29T10:00:00Z' }],
    } as unknown as ReclamoRow
    const { div, root } = await montar(llego)
    const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Devolver la plata'))
    await act(async () => { b!.click() })
    await act(async () => { root.unmount() })
    div.remove()

    expect(confirma).toHaveBeenCalled()
    expect(pregunta).not.toHaveBeenCalled()
    expect(mandado).toMatchObject({ action: 'reintegro', id: 22 })
    expect((mandado as unknown as { motivo?: string } | null)?.motivo).toBeUndefined()
    vi.unstubAllGlobals()
    pregunta.mockRestore()
    confirma.mockRestore()
  })
})
