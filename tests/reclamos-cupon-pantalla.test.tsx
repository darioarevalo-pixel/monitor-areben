// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * **La otra puerta del vencimiento del cupón: la pantalla** (30-ago-2026, §1.2).
 *
 * Son **dos preguntas**, y las dos vuelve a exigirlas el servidor: el código prueba que el cupón
 * existe en la tienda, la fecha es lo único que el cliente necesita antes de guardarlo para «alguna
 * vez». ⚠️ Lo que se fija acá es que la pantalla **pregunte** y **mande las dos cosas** — la regla
 * de qué fecha vale vive en `cupon.core.js` y tiene sus propios tests.
 */

const FILAS: ReclamoRow[] = []

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => ({ filas: FILAS, hayMas: false })) }
})

const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

const CON_CUPON = {
  id: 22, store: 'bdi', estado: 'resuelto', motivo: 'falla', cliente: 'Lorena',
  compensacion: 'cupon', monto_total: 90000,
  items: [{ sku: 'A1', producto: 'Campera', cantidad: 1, precio: '90000.00' }],
  reintegro_estado: 'no_aplica', stock_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
  cupon_estado: 'pendiente', envio_nuevo_estado: 'no_aplica', reingreso_estado: 'no_aplica',
  reclamo_correo_estado: 'no_aplica', cobro_estado: 'no_aplica', historial: [],
} as unknown as ReclamoRow

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

const apretarCargarCupon = async (respuestas: (string | null)[]) => {
  let mandado: Record<string, unknown> | null = null
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: { body?: string }) => {
    const cuerpo = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null
    if (cuerpo?.action === 'cupon-emitido') mandado = cuerpo
    return { ok: true, status: 200, json: async () => ({ ok: true, devoluciones: [] }) }
  }))
  // Sin `ConfirmProvider`, `useConfirmar` cae a los diálogos nativos (ver `Confirm.tsx`).
  let i = 0
  const pregunta = vi.spyOn(window, 'prompt').mockImplementation(() => respuestas[i++] ?? null)

  FILAS.length = 0
  FILAS.push(CON_CUPON)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  window.history.replaceState(null, '', '/postventa')
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
  })
  const visible = div.textContent || ''
  const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Cargar el cupón'))
  if (b) await act(async () => { b.click() })
  // Lo que quedó dibujado DESPUÉS del gesto: es donde vive el cartel de error, si lo hubo.
  const despues = div.textContent || ''
  await act(async () => { root.unmount() })
  div.remove()
  const veces = pregunta.mock.calls.length
  const textos = pregunta.mock.calls.map((c) => String(c[0]))
  vi.unstubAllGlobals()
  pregunta.mockRestore()
  return { mandado: mandado as Record<string, unknown> | null, hayBoton: !!b, veces, textos, visible, despues }
}

describe('cargar el cupón', () => {
  it('🔴 pregunta el código Y el vencimiento, y manda los dos', async () => {
    const r = await apretarCargarCupon(['ABC123', '30/09/2026'])
    expect(r.visible).toContain('R-0022')
    expect(r.hayBoton).toBe(true)
    expect(r.veces).toBe(2)
    expect(r.textos[1]).toContain('Hasta cuándo')
    expect(r.mandado).toMatchObject({ action: 'cupon-emitido', cupon_codigo: 'ABC123', cupon_vence: '2026-09-30' })
  })

  /**
   * ⛔ Cancelar la segunda pregunta ⛔ no puede sellar el cupón con la primera.
   *
   * 🔑 **Y cancelar ⛔ no es un error: es «me arrepentí».** Sin el `return` explícito, el vacío cae
   * en la validación y la pantalla te contesta *«falta la fecha»* a alguien que acaba de decir que
   * no quería seguir — mismo resultado, otro trato. Lo mide el cartel, ⛔ no lo mandado.
   */
  it('⛔ si se cancela el vencimiento, ⛔ no manda nada — y ⛔ no reta a nadie', async () => {
    const r = await apretarCargarCupon(['ABC123', null])
    expect(r.veces).toBe(2)
    expect(r.mandado).toBeNull()
    expect(r.despues).not.toContain('Falta hasta cuándo')
  })

  it('⛔ con una fecha que ya pasó tampoco sale de la pantalla', async () => {
    const r = await apretarCargarCupon(['ABC123', '01/01/2020'])
    expect(r.mandado).toBeNull()
  })

  it('⛔ y sin código ⛔ ni pregunta la fecha', async () => {
    const r = await apretarCargarCupon(['   ', '30/09/2026'])
    expect(r.veces).toBe(1)
    expect(r.mandado).toBeNull()
  })
})
