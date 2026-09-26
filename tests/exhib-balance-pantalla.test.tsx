// @vitest-environment jsdom
// El panel del balance, dibujado: que abra sin romperse y que diga poco (26-sep-2026, Bruno:
// «mucho texto y poca definición»). El oráculo es lo que queda en pantalla.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ExhibItem } from '@/lib/exhib/tipos'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

vi.mock('@/lib/sync-gn', () => ({ ultimoSyncStock: async () => new Date(Date.now() - 18 * 36e5) }))
vi.mock('@/lib/exhib/cliente', () => ({
  guardarCobertura: vi.fn(async (_m: string, _id: string, tipos: string[]) => ({ tipos, por: 'bruno', cuando: new Date().toISOString() })),
  tacharPrenda: vi.fn(),
  decidirRepetida: vi.fn(),
}))

const { BalanceSector } = await import('@/components/exhib/BalanceSector')
const { ToastProvider } = await import('@/components/ui/Toast')
const { aEscaneo } = await import('@/lib/exhib/libre')

const v = (over: Partial<ExhibItem>): ExhibItem => ({
  barcode: '', sku: '', productId: 'p', name: 'X', size: 'U', qty: 1, img: null,
  cat: 'SWEATERS', cleanCats: ['SWEATERS'], tnId: null, precio: null, promo: null, ...over,
})
const NINA_R = v({ productId: '1', name: 'SWEATER NINA', size: 'ROJO', barcode: 'b1' })
const NINA_N = v({ productId: '1', name: 'SWEATER NINA', size: 'NEGRO', barcode: 'b2' })
const OLIVIA = v({ productId: '2', name: 'SWEATER OLIVIA', size: 'GRIS', barcode: 'b3' })

describe('BalanceSector en pantalla', () => {
  it('con SWEATER marcado: tres números y un renglón por modelo, por nombre', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const escaneos = [aEscaneo(NINA_R, 'b1', 'Sweater', Date.now())]
    await act(async () => {
      createRoot(host).render(
        <ToastProvider>
          <BalanceSector
            escaneos={escaneos}
            items={[NINA_R, NINA_N, OLIVIA]}
            marca="zattia"
            recorridoId="r1"
            cobertura={{ tipos: ['SWEATER'], por: 'bruno', cuando: '2026-09-26T13:00:00Z' } as never}
            onGuardada={() => {}}
            onTraerStock={async () => {}}
            trayendo={false}
          />
        </ToastProvider>,
      )
    })
    const t = host.textContent ?? ''
    expect(t).toContain('Faltan colgar')
    expect(t).toContain('SWEATER NINA')
    expect(t).not.toContain('⭐')
    expect(t).toContain('SWEATER OLIVIA')
    expect(t).toContain('Stock de hace 18 h')
    // ⛔ Los párrafos viejos no vuelven.
    expect(t).not.toContain('El local vende unas 160 prendas')
    expect(t).not.toContain('Balance guardado')
    expect(t.indexOf('SWEATER NINA')).toBeLessThan(t.indexOf('SWEATER OLIVIA'))
  })
})
