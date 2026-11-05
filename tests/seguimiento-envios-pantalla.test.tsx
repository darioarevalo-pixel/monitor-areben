// @vitest-environment jsdom
/**
 * La pantalla de Seguimiento de envíos con una respuesta del servidor: las dos solapas, la marca de
 * «Volvió» y los avisos cuando el Correo no contesta o cuando hay paquetes que no entran en las solapas.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { FilaSeguimiento, Seguimiento } from '@/lib/seguimiento-envios/cliente'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let respuesta: Seguimiento
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia' }) }))
vi.mock('@/lib/seguimiento-envios/cliente', async (original) => ({
  ...(await original<typeof import('@/lib/seguimiento-envios/cliente')>()),
  leerSeguimiento: async () => respuesta,
}))

const { SeguimientoEnvios } = await import('@/components/seguimiento-envios/SeguimientoEnvios')

const fila = (extra: Partial<FilaSeguimiento>): FilaSeguimiento => ({
  tienda: 'zattia', id: 1, numero: 100, cliente: 'Clienta', envio: 'Punto de retiro', codigo: 'C1', pieza: 'HC-560088547-AR',
  pedido: '2026-10-01', planta: 'FUNES', ultimo: 'EN ESPERA EN SUCURSAL', dias: 3, volvio: false, motivo: null,
  ...extra,
})

const base = (): Seguimiento => ({
  retiro: [
    fila({ numero: 139, tienda: 'stunned', id: 2 }),
    fila({ numero: 7158, id: 3, planta: 'OAM-ROSARIO SUCURSAL', volvio: true }),
  ],
  trabados: [fila({ numero: 21000, id: 4, motivo: 'robado', dias: 43, ultimo: 'Lamentamos…' }), fila({ numero: 21445, id: 5, motivo: 'sin-movimiento', dias: 44, ultimo: 'EN PROCESO DE CLASIFICACIÓN' })],
  volvieron: [fila({ numero: 6848, id: 6, planta: 'CDD 01 ROSARIO', volvio: true, dias: 48, ultimo: 'ENTREGADO' })],
  resumen: { consultados: 7, enCamino: 3, entregados: 0, sinLeer: [] },
  sinCodigo: 0,
  correoCaido: false,
  desde: '2026-08-08',
  leidoEn: '2026-11-05T13:02:00Z',
})

async function montar() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(<SeguimientoEnvios />)
  })
  return host
}

describe('SeguimientoEnvios', () => {
  beforeEach(() => {
    respuesta = base()
  })

  it('Esperando retiro: distingue el que lo busca el cliente del que volvió, y dice que no se avisó', async () => {
    const host = await montar()
    expect(host.textContent).toContain('Stunned #139')
    expect(host.textContent).toContain('#7158')
    expect(host.textContent).toContain('Volvió: lo buscamos nosotros')
    expect(host.textContent!.match(/Volvió: lo buscamos nosotros/g)).toHaveLength(1)
    expect(host.textContent).toContain('Sin aviso')
    expect(host.textContent).toContain('HC-560088547-AR')
    expect(host.textContent).toContain('C1')
    expect(host.textContent).toContain('todavía no le avisa a nadie')
    expect(host.querySelector('a[href*="stunned3.mitiendanube.com/admin/orders/2"]')).not.toBeNull()
  })

  it('Trabados: nombra el robo y el último estado', async () => {
    const host = await montar()
    const solapa = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Trabados'))!
    await act(async () => {
      solapa.click()
    })
    expect(host.textContent).toContain('Robado según el Correo')
    expect(host.textContent).toContain('EN PROCESO DE CLASIFICACIÓN')
    expect(host.textContent).not.toContain('Sin aviso')
  })

  it('🔴 si el Correo no contesta, lo dice: ⛔ queda como «no hay paquetes»', async () => {
    respuesta = { ...base(), retiro: [], trabados: [], volvieron: [], correoCaido: true }
    const host = await montar()
    expect(host.textContent).toContain('pudo haber cambiado su página')
    expect(host.textContent).not.toContain('No hay paquetes')
  })

  it('nombra lo que no se pudo leer', async () => {
    const r = base()
    r.resumen.sinLeer = [{ tienda: 'zattia', id: 8, numero: 555 }]
    respuesta = r
    const host = await montar()
    expect(host.textContent).toContain('#555')
  })

  it('Volvieron: lista los pedidos y pide confirmarlos', async () => {
    const host = await montar()
    const solapa = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Volvieron'))!
    await act(async () => {
      solapa.click()
    })
    expect(host.textContent).toContain('#6848')
    expect(host.textContent).toContain('CDD 01 ROSARIO')
    expect(host.textContent).toContain('Hay que confirmar')
    expect(host.textContent).toContain('Volvió hace')
    expect(host.textContent).not.toContain('Volvió: lo buscamos nosotros')
  })
})
