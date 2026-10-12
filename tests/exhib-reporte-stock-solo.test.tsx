// @vitest-environment jsdom
// El reporte del chequeo trae el stock SOLO al abrirse si la foto es vieja (Darío, 12-oct-2026), y
// ⛔ lo vuelve a traer si es de hace menos de media hora.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let horasDelStock = 3
vi.mock('@/lib/reposicion/cliente', () => ({ ultimaSincronizacion: async () => new Date(Date.now() - horasDelStock * 36e5) }))
vi.mock('@/lib/exhib/cliente', () => ({ leerRecorrido: async () => ({ escaneos: [] }) }))
vi.mock('@/lib/supabase/rest', () => ({ fetchAll: async () => [] }))
vi.mock('@/components/exhib/FotoTicket', () => ({ FotoTicket: () => null }))

const { ReporteChequeo } = await import('@/components/exhib/ReporteChequeo')
const { ToastProvider } = await import('@/components/ui/Toast')

const recorrido = { id: 'r1', estado: 'cerrado', escaneos: 300, creado_en: '2026-10-10T12:04:00Z', persona: 'Camila' } as never

async function abrir(trayendo = false) {
  const traer = vi.fn(async () => {})
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <ToastProvider>
        <ReporteChequeo marca="zattia" previos={[recorrido]} items={[]} mapa={null} onTraerStock={traer} trayendo={trayendo} onCobertura={() => {}} />
      </ToastProvider>,
    )
  })
  await act(async () => {})
  return { traer, texto: host.textContent ?? '', host }
}

describe('el reporte trae el stock solo', () => {
  it('con la foto de hace 3 h, la trae una vez al abrir', async () => {
    horasDelStock = 3
    const { traer } = await abrir()
    expect(traer).toHaveBeenCalledTimes(1)
  })
  it('con la foto de hace 10 min, ⛔ la trae', async () => {
    horasDelStock = 10 / 60
    const { traer } = await abrir()
    expect(traer).not.toHaveBeenCalled()
  })
  it('mientras la trae, avisa y ⛔ deja imprimir', async () => {
    horasDelStock = 3
    const { texto, host } = await abrir(true)
    expect(texto).toContain('Actualizando el stock')
    const boton = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Imprimir ticket'))
    expect(boton?.disabled).toBe(true)
  })
})
