// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El botón verde de «Pendientes en Logística» (Darío, 3-nov-2026: no abría el chat). Logística puede
 * traer el pedido sin teléfono: el botón quedaba apagado, pero se seguía viendo verde.
 */
const panel = vi.hoisted(() => ({ telefonoDeCliente: vi.fn() }))
vi.mock('@/lib/crm/panel', async (original) => ({ ...(await original<typeof import('@/lib/crm/panel')>()), ...panel }))

import { FilaLogistica } from '@/components/panel/AgendaDelDia'
import type { PendienteLogistica } from '@/lib/crm/logistica'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pedido = (x: Partial<PendienteLogistica>) =>
  ({ id: 1, client_name: 'Ana', gn_client_id: '77', client_phone: '', status: { code: 3, label: 'Listo' }, units: {}, missing: [], ...x }) as unknown as PendienteLogistica

let root: Root
let caja: HTMLDivElement
const onAbrir = vi.fn()
const dibujar = async (p: PendienteLogistica) => {
  await act(async () => root.render(<FilaLogistica p={p} onAbrir={onAbrir} onFicha={vi.fn()} />))
  return caja.querySelector('button[aria-label^="Abrir el chat"]') as HTMLButtonElement
}

beforeEach(() => {
  vi.clearAllMocks()
  caja = document.createElement('div')
  document.body.appendChild(caja)
  root = createRoot(caja)
})
afterEach(() => {
  act(() => root.unmount())
  caja.remove()
})

describe('FilaLogistica · el botón del chat', () => {
  it('sin teléfono en el pedido, abre con el de la ficha del cliente', async () => {
    panel.telefonoDeCliente.mockResolvedValue('5493834270554')
    const b = await dibujar(pedido({}))
    expect(panel.telefonoDeCliente).toHaveBeenCalledWith(77)
    expect(b.disabled).toBe(false)
    await act(async () => b.click())
    expect(onAbrir).toHaveBeenCalledWith(77, '5493834270554')
  })

  it('con el teléfono en el pedido no consulta la ficha, y lo abre con el formato de WhatsApp', async () => {
    const b = await dibujar(pedido({ client_phone: '3834270554' }))
    expect(panel.telefonoDeCliente).not.toHaveBeenCalled()
    await act(async () => b.click())
    expect(onAbrir).toHaveBeenCalledWith(77, '5493834270554')
  })

  it('sin teléfono en ningún lado se ve apagado, no verde, y dice por qué', async () => {
    panel.telefonoDeCliente.mockResolvedValue('')
    const b = await dibujar(pedido({}))
    expect(b.disabled).toBe(true)
    expect(b.style.opacity).toBe('0.5')
    expect(b.title).toContain('No tiene teléfono')
  })
})
