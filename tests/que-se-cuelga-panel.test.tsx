// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Prenda } from '@/lib/mapa-local/tipos'

/**
 * La vista «Qué se cuelga» dibujada con un stock chico: la temporada de hoy, lo que duerme y lo que
 * no rota, y que sin un mapa guardado ⛔ no deja guardar temporadas.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const prenda = (nombre: string, over: Partial<Prenda> = {}): Prenda => ({ clave: `${nombre}|`, productId: nombre, nombre, color: '', tipo: 'TOP', linea: 'nc', img: null, unidades: 1, ventas30: 2, ultimaVenta: '2026-07-01', alta: '2026-01-01', ritmo: 2 / 30, tramo: 'vende', ...over })

const datos = vi.hoisted(() => ({ actual: null as unknown }))
vi.mock('@/components/mapa-local/useMapaLocalDatos', () => ({ useMapaLocalDatos: () => datos.actual }))
vi.mock('@/components/clavados/useClavados', () => ({ useClavados: () => ({ porProducto: new Map(), puedeEscribir: false, cargando: false, error: null }) }))
vi.mock('@/components/layout/acciones', () => ({ HeaderAcciones: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

async function dibujar(over: Record<string, unknown>) {
  const { MAPA_INICIAL } = await import('@/lib/mapa-local/inicial')
  datos.actual = {
    marca: 'zattia',
    hoy: '2026-01-15',
    prendas: [
      prenda('SWEATER ARIZONA', { tipo: 'SWEATER' }),
      prenda('TOP MUERTO', { ventas30: 0, ritmo: 0, tramo: 'sin-rotacion', ultimaVenta: null }),
      prenda('TOP VENDE', { ventas30: 9, ritmo: 0.3 }),
    ],
    sinEtl: false,
    sinCruzarTn: false,
    guardado: { mapa: MAPA_INICIAL, en: null, por: null },
    setGuardado: () => {},
    editar: true,
    sinTabla: false,
    cargando: false,
    error: null,
    ...over,
  }
  const { ToastProvider } = await import('@/components/ui')
  const { QueSeCuelga } = await import('@/components/que-se-cuelga/QueSeCuelga')
  const div = document.createElement('div')
  await act(async () => createRoot(div).render(<ToastProvider><QueSeCuelga /></ToastProvider>))
  return div
}

describe('QueSeCuelga', () => {
  it('en verano: dice qué duerme, cuenta lo dormido y lista lo que no rota', async () => {
    const div = await dibujar({})
    const t = div.textContent || ''
    expect(t).toContain('Hoy: verano')
    expect(t).toContain('Duermen: SWEATER')
    expect(t).toContain('Durmiendo por temporada (1)')
    // Sobra lugar de tops: el que no rota queda colgado, y se avisa que es el primero en salir.
    expect(t).toContain('Colgadas que no vendieron en 30 días (1)')
    expect(t).toContain('No entran y no vendieron en 30 días (0)')
  })

  it('sin un mapa guardado, avisa y el botón de guardar queda apagado', async () => {
    const div = await dibujar({})
    expect(div.textContent).toContain('Nadie guardó el mapa todavía')
    const boton = [...div.querySelectorAll('button')].find((b) => b.textContent === 'Guardar las temporadas')
    expect(boton?.disabled).toBe(true)
  })

  it('en el cambio de temporada no duerme nada', async () => {
    const div = await dibujar({ hoy: '2026-10-01' })
    const t = div.textContent || ''
    expect(t).toContain('Hoy: cambio de temporada')
    expect(t).toContain('Durmiendo por temporada (0)')
  })
})
