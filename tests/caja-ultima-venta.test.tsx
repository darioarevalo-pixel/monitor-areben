// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { UltimaVenta } from '@/components/caja/partes'

/**
 * 🔴 «Apreté regalo para que salgan ambos y sólo salió el de precios» (reporte del local, 14-oct): el ticket
 * de cambio lo lanza la página 1,5 s después y el navegador lo puede descartar callado. La tarjeta de la
 * última venta, si fue regalo, deja el ticket de cambio resaltado y dice que se toque si no salió.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const VENTA = { id: 'c6bf7140-1562-4e3d-a1cb-aee72fb27219', estado: 'en_gn', gn_number: 30613, total: 50800, pagos: [], email: null, paga_con: null, ultimo_error: null } as never

let raiz: Root
let caja: HTMLDivElement
beforeEach(() => {
  caja = document.createElement('div')
  document.body.appendChild(caja)
  raiz = createRoot(caja)
})
afterEach(() => {
  act(() => raiz.unmount())
  caja.remove()
})

const botones = () => [...caja.querySelectorAll('button')].map((b) => b.textContent?.trim())

describe('UltimaVenta', () => {
  it('con regalo: «Imprimir ticket de cambio» y la línea que dice que se toque si no salió', () => {
    const cambio = vi.fn()
    act(() => raiz.render(<UltimaVenta venta={VENTA} regalo onReimprimir={() => {}} onTicketCambio={cambio} />))
    expect(botones()).toContain('Imprimir ticket de cambio')
    expect(caja.textContent).toContain('si no salió el ticket de cambio')
    act(() => [...caja.querySelectorAll('button')].find((b) => b.textContent?.includes('ticket de cambio'))!.click())
    expect(cambio).toHaveBeenCalledTimes(1)
  })

  it('sin regalo: el botón de siempre, sin la línea', () => {
    act(() => raiz.render(<UltimaVenta venta={VENTA} onReimprimir={() => {}} onTicketCambio={() => {}} />))
    expect(botones()).toContain('Ticket de cambio')
    expect(caja.textContent).not.toContain('si no salió')
  })
})

describe('UltimaVenta · de qué sistema es el número', () => {
  const pintar = (venta: object) => act(() => raiz.render(<UltimaVenta venta={venta as never} regalo={false} onReimprimir={() => {}} onOtra={() => {}} />))
  it('una venta de GN dice «#número · en Gestión Nube»', () => {
    pintar(VENTA)
    expect(caja.textContent).toContain('Venta #30613'); expect(caja.textContent).toContain('en Gestión Nube')
  })
  it('una venta del ERP dice SU número y «en el ERP» (⛔ #null ni Gestión Nube)', () => {
    pintar({ ...(VENTA as object), estado: 'en_erp', gn_number: null, erp_numero: 19 })
    expect(caja.textContent).toContain('Venta #19'); expect(caja.textContent).toContain('en el ERP')
    expect(caja.textContent).not.toContain('null'); expect(caja.textContent).not.toContain('Gestión Nube')
  })
})
