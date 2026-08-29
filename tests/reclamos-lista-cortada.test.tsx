// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **El CABLE del tope: que la pantalla DIGA que la lista está cortada** (D12 de la auditoría del
 * 28-ago-2026).
 *
 * `tests/reclamos-tope.test.ts` fija que el servidor lo detecte y lo mande. Esto fija el otro lado,
 * que es la mitad que importa: un `hayMas` que llega y nadie dibuja es exactamente lo mismo que no
 * detectarlo — las tres pestañas siguen filtrando en el cliente sobre una lista incompleta, y quien
 * la mira entiende «no hay más». Es el modo de falla propio de este módulo: los dos lados bien y el
 * bug en la pregunta del medio.
 */

const RESPUESTA: { filas: ReclamoRow[]; hayMas: boolean } = { filas: [], hayMas: false }

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => RESPUESTA) }
})

const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

const base = {
  id: 1, store: 'bdi', estado: 'borrador', motivo: 'falla', cliente: 'Quien Sea',
  items: [{ sku: 'X', producto: 'P', cantidad: 1, precio: '1000.00' }],
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'no_aplica', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica', cobro_estado: 'no_aplica',
} as unknown as ReclamoRow

const pintar = async (hayMas: boolean): Promise<string> => {
  RESPUESTA.filas = [base]
  RESPUESTA.hayMas = hayMas
  window.history.replaceState(null, '', '/postventa')
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
  })
  const txt = div.textContent || ''
  await act(async () => { root.unmount() })
  div.remove()
  return txt
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

describe('cuando el servidor tuvo que cortar la lista', () => {
  it('🔴 la pantalla lo dice, y dice que los filtros trabajan sobre lo que bajó', async () => {
    const t = await pintar(true)
    expect(t).toContain('más reclamos de los que entran en esta lista')
    expect(t).toContain('sobre lo que bajó')
    // Y la fila sigue estando: avisar ⛔ no es en lugar de mostrar.
    expect(t).toContain('R-0001')
  })

  /** ⛔ Y sin corte ⛔ no grita: un cartel que sale siempre es ruido que se aprende a ignorar. */
  it('⛔ sin corte ⛔ no aparece', async () => {
    const t = await pintar(false)
    expect(t).not.toContain('más reclamos de los que entran')
    expect(t).toContain('R-0001')
  })
})
