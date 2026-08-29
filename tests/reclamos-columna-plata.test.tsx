// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **EL CABLE de la columna «A devolver»** (D10 de la auditoría del 28-ago-2026).
 *
 * `tests/reclamos.test.ts` fija `montoADevolver`, que es la regla. Esto fija el otro lado: que la
 * celda dibuje **eso** y ⛔ no una cuenta escrita a mano en el JSX — que es exactamente de donde
 * salió el defecto (`d.monto_total ?? d.monto_producto ?? 0`, sin mirar si había decisión). Es la
 * mitad que este módulo ya perdió dos veces: los dos lados bien y el bug en la pregunta del medio.
 *
 * 🔑 El oráculo es **lo que se lee en la fila**, ⛔ no lo que devuelve la función.
 */

const FILAS: ReclamoRow[] = []

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => FILAS) }
})

const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

/** R-0022 el 28-ago a las 13:30: sin decidir, con los dos montos en la fila. */
const SIN_DECIDIR = {
  id: 22, store: 'bdi', estado: 'en_revision', motivo: 'falla', cliente: 'Lorena Reyes',
  compensacion: null, monto_total: 20682, monto_producto: 23564,
  items: [{ sku: 'X', producto: 'P', cantidad: 1, precio: '23564.00' }],
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica',
} as unknown as ReclamoRow

/** Las celdas de la fila, en texto: la columna de plata es la única que muestra un `$`. */
const celdas = async (filas: ReclamoRow[]): Promise<string[]> => {
  FILAS.length = 0
  FILAS.push(...filas)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
  })
  const txt = [...div.querySelectorAll('td')].map((t) => t.textContent || '')
  await act(async () => { root.unmount() })
  div.remove()
  return txt
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

describe('la columna «A devolver»', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/postventa') })

  it('🔴 sin decidir dice «sin decidir», y ⛔ NO el monto que el cliente pagó', async () => {
    const cs = await celdas([SIN_DECIDIR])
    expect(cs.some((c) => c.includes('sin decidir'))).toBe(true)
    expect(cs.join(' ')).not.toContain('20.682')
    expect(cs.join(' ')).not.toContain('23.564')
  })

  it('decidido sí muestra la plata que sale', async () => {
    const cs = await celdas([{ ...SIN_DECIDIR, compensacion: 'plata_total' } as ReclamoRow])
    expect(cs.join(' ')).toContain('20.682')
    expect(cs.some((c) => c.includes('sin decidir'))).toBe(false)
  })
})
