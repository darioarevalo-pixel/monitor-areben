// @vitest-environment jsdom
/**
 * «Chequeo + mapa» en pantalla (5-oct-2026): los botones del espacio escriben el lugar que se guarda
 * con cada escaneo, y el relevamiento del final dice falta/sobra y guarda el mapa con lo escaneado.
 * El oráculo es lo que queda en pantalla y lo que se le manda al servidor.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ExhibItem } from '@/lib/exhib/tipos'
import type { EscaneoLibre } from '@/lib/exhib/libre'
import type { MapaLocal } from '@/lib/mapa-local/tipos'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

vi.mock('@/lib/sync-gn', () => ({ ultimoSyncStock: async () => new Date(Date.now() - 5 * 36e5) }))
const guardarMapa = vi.fn(async (_m: MapaLocal, _b: string | null) => ({ actualizadoEn: '2026-10-05T15:00:00Z', actualizadoPor: 'bruno' }))
vi.mock('@/lib/mapa-local/cliente', () => ({ guardarMapa: (m: MapaLocal, b: string | null) => guardarMapa(m, b), leerMapa: vi.fn() }))

const { ElegirEspacio, otraAltura } = await import('@/components/exhib/ElegirEspacio')
const { RelevamientoPanel } = await import('@/components/exhib/RelevamientoPanel')
const { ToastProvider } = await import('@/components/ui/Toast')
const { ConfirmProvider } = await import('@/components/ui/Confirm')
const { MAPA_INICIAL } = await import('@/lib/mapa-local/inicial')

const boton = (host: HTMLElement, texto: string) => {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.trim() === texto)
  if (!b) throw new Error(`no está el botón «${texto}»: ${[...host.querySelectorAll('button')].map((x) => x.textContent).join(' | ')}`)
  return b
}
const click = async (host: HTMLElement, texto: string) => {
  await act(async () => boton(host, texto).click())
}

describe('ElegirEspacio', () => {
  const montar = async (lugar = '') => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const elegidos: string[] = []
    await act(async () => createRoot(host).render(<ElegirEspacio mapa={MAPA_INICIAL} lugar={lugar} onElegir={(l) => elegidos.push(l)} />))
    return { host, elegidos }
  }

  it('D → 01 → Arriba escribe «D01 arriba» (D01 es doble en el mapa: Doble ya viene marcado)', async () => {
    const { host, elegidos } = await montar()
    await click(host, 'D')
    await click(host, '01')
    expect(boton(host, 'Doble').getAttribute('aria-pressed')).toBe('true')
    await click(host, 'Arriba')
    expect(elegidos).toEqual(['D01 arriba'])
  })

  it('un módulo simple en el mapa ya se puede escanear; si en el salón es doble, se toca Doble', async () => {
    const { host, elegidos } = await montar()
    await click(host, 'D')
    await click(host, '06')
    expect(elegidos).toEqual(['D06'])
    await click(host, 'Doble')
    await click(host, 'Abajo')
    expect(elegidos).toEqual(['D06', 'D06 abajo'])
  })

  it('el lado I y la isla', async () => {
    const { host, elegidos } = await montar()
    await click(host, 'I')
    await click(host, '02')
    await click(host, 'Abajo')
    await click(host, 'ISLA')
    expect(elegidos).toEqual(['I02 abajo', 'ISLA'])
  })

  it('«Pasar a abajo» es la otra altura del mismo módulo', () => {
    expect(otraAltura('D01 arriba')).toEqual({ label: 'Pasar a abajo', lugar: 'D01 abajo' })
    expect(otraAltura('D01 abajo')).toEqual({ label: 'Pasar a arriba', lugar: 'D01 arriba' })
    expect(otraAltura('D06')).toBeNull()
    expect(otraAltura('vidriera')).toBeNull()
  })
})

const item = (pid: string, size = 'M'): ExhibItem =>
  ({ barcode: pid + size, sku: 'ZA', productId: pid, name: `TOP ${pid}`, size, qty: 1, img: null, cat: '', cleanCats: [], tnId: null, precio: 1000, promo: null }) as ExhibItem
const esc = (lugar: string, pid: string): EscaneoLibre =>
  ({ lugar, variante_id: pid, encontrado: true, codigo_crudo: pid, barcode: null, sku: 'ZA', product_id: pid, product_name: `TOP ${pid}`, size: 'M', cats: [], qty: 1, precio: 1000, promo: null, escaneado_en: '2026-10-05T12:00:00Z' }) as EscaneoLibre

describe('RelevamientoPanel', () => {
  const montar = async (editar: boolean) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const guardado = { mapa: MAPA_INICIAL, actualizadoEn: '2026-10-01T20:13:00Z', actualizadoPor: 'bruno', puede: { editar }, sinTabla: false }
    const escaneos = [esc('D01 arriba', 'A'), esc('D01 abajo', 'B'), esc('vidriera', 'C')]
    await act(async () =>
      createRoot(host).render(
        <ToastProvider>
          <ConfirmProvider>
            <RelevamientoPanel escaneos={escaneos} items={[item('A'), item('B'), item('C'), item('F')]} marca="zattia" guardado={guardado} onGuardado={() => {}} onTraerStock={async () => {}} trayendo={false} />
          </ConfirmProvider>
        </ToastProvider>,
      ),
    )
    return host
  }

  it('falta exhibir sale PROVISORIO y nombra lo que quedó sin relevar', async () => {
    const host = await montar(true)
    const t = host.textContent ?? ''
    expect(t).toContain('Falta exhibir: 1')
    expect(t).toContain('Provisorio')
    expect(t).toContain('quedó sin relevar I01, I02, ISLA, D02')
    expect(t).toContain('Stock de hace 5 h')
    expect(t).toContain('También se escaneó en: vidriera')
  })

  it('guardar manda el mapa con los modelos escaneados en cada barra, contra la versión leída', async () => {
    const host = await montar(true)
    guardarMapa.mockClear()
    await click(host, 'Guardar como mapa del local')
    await click(document.body, 'Guardar')
    expect(guardarMapa).toHaveBeenCalledTimes(1)
    const [mapa, base] = guardarMapa.mock.calls[0]
    expect(base).toBe('2026-10-01T20:13:00Z')
    const d01 = mapa.modulos.find((m) => m.codigo === 'D01')!
    expect(d01.niveles.map((n) => [n.pos, n.modelos])).toEqual([['alta', ['A']], ['baja', ['B']]])
  })

  it('sin permiso de editar el mapa, el botón ⛔ sale', async () => {
    const host = await montar(false)
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.includes('Guardar como mapa'))).toBe(false)
    expect(host.textContent).toContain('Lo pasa al Mapa del local quien lo edita')
  })
})
