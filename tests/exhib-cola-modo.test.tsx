// @vitest-environment jsdom
/**
 * La cola de escaneos recuerda **con qué modo se abrió el recorrido** (5-oct-2026, «Chequeo + mapa»).
 *
 * 🔴 La apertura en el servidor se reintenta en cada tanda: sin señal puede no haber llegado nunca. Si
 * el teléfono se recarga en el medio y el modo vivía sólo en memoria, la reapertura crearía el recorrido
 * como `libre` y al verlo después ⛔ saldría el relevamiento. El oráculo es lo que se le manda al servidor.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

// El `localStorage` del teléfono, en memoria (el del entorno de test ⛔ es completo).
const disco = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => disco.get(k) ?? null,
  setItem: (k: string, v: string) => void disco.set(k, v),
  removeItem: (k: string) => void disco.delete(k),
  clear: () => disco.clear(),
})

const abiertos: { id: string; modo?: string }[] = []
let abrirFalla = true
vi.mock('@/lib/exhib/cliente', () => ({
  abrirRecorrido: vi.fn(async (_m: string, id: string, opts?: { modo?: string }) => {
    abiertos.push({ id, modo: opts?.modo })
    if (abrirFalla) throw new Error('sin señal')
  }),
  subirEscaneos: vi.fn(async () => {}),
  cerrarRecorrido: vi.fn(async () => {}),
  eliminarRecorrido: vi.fn(async () => {}),
  sacarEscaneo: vi.fn(async () => {}),
}))

const { useColaEscaneos } = await import('@/components/exhib/useColaEscaneos')
const { aEscaneo } = await import('@/lib/exhib/libre')

type Cola = ReturnType<typeof useColaEscaneos<string>>
let cola: Cola
const verCola = (c: Cola) => {
  cola = c
}
function Sonda({ onCola }: { onCola: (c: Cola) => void }) {
  const c = useColaEscaneos<string>('zattia', 'test_cola_modo', '', 'libre')
  useEffect(() => onCola(c))
  return null
}
const montar = async () => {
  const host = document.createElement('div')
  let root: Root
  await act(async () => {
    root = createRoot(host)
    root.render(<Sonda onCola={verCola} />)
  })
  return () => act(async () => root.unmount())
}

describe('el modo del recorrido en la cola', () => {
  it('🔴 se abre «+ mapa», se recarga el teléfono sin señal, y la reapertura sigue siendo `mapa`', async () => {
    localStorage.clear()
    const desmontar = await montar()
    await act(async () => cola.iniciar('ex_1', '', { modo: 'mapa' }))
    expect(abiertos.at(-1)).toEqual({ id: 'ex_1', modo: 'mapa' })
    expect(cola.modo).toBe('mapa')
    await desmontar()

    // Recarga: un hook nuevo, que sólo tiene el borrador del teléfono.
    abrirFalla = false
    await montar()
    expect(cola.modo).toBe('mapa')
    await act(async () => {
      cola.registrar(aEscaneo(null, '779', 'D01 arriba', Date.now()))
    })
    expect(abiertos.at(-1)).toEqual({ id: 'ex_1', modo: 'mapa' })
  })

  it('sin modo, el recorrido es el del hook (libre)', async () => {
    localStorage.clear()
    await montar()
    await act(async () => cola.iniciar('ex_2', ''))
    expect(abiertos.at(-1)).toEqual({ id: 'ex_2', modo: 'libre' })
    expect(cola.modo).toBe('libre')
  })
})
