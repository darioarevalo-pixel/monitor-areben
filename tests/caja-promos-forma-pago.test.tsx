// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PromosFormaDePago } from '@/components/caja/PromosFormaDePago'
import { REGLAS_INICIALES } from '@/lib/caja/core.core.js'
import type { Reglas } from '@/lib/caja/cliente'
import { hoyIso } from '@/lib/agenda'
import type { Promo } from '@/lib/agenda/tipos'
import { useAgenda } from '@/store/useAgenda'

/**
 * «Promociones bancarias y por forma de pago» (Bruno, 12-oct): sólo lectura. Lo que dice de HOY sale de
 * `promosDe`, la MISMA pregunta del cobro; los descuentos, de las reglas de la Caja.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const promo = (p: Partial<Promo>): Promo =>
  ({ id: 'x', banco: 'Galicia', medio: 'credito', beneficio: { tipo: 'descuento', pct: 10 }, regla: { tipo: 'diaria' }, desde: '2026-01-01', hasta: null, condiciones: [], pasos: null, canales: ['mostrador'], marcas: [], activa: true, ...p }) as Promo

describe('PromosFormaDePago', () => {
  it('🔑 la de hoy arriba con «Hoy», la de otro día con «Otro día», la web y la vencida ⛔, y los % de la Caja', () => {
    const otroDia = new Date(Date.parse(`${hoyIso()}T12:00:00Z`) + 86400000).getUTCDay()
    useAgenda.setState({
      cargado: true,
      promos: [
        promo({ id: 'a', banco: 'Nación', regla: { tipo: 'semanal', dias: [otroDia] } }),
        promo({ id: 'b', banco: 'Galicia' }),
        promo({ id: 'c', banco: 'Web', canales: ['web'] }),
        promo({ id: 'd', banco: 'Vieja', hasta: '2026-01-02' }),
      ],
    })
    const reglas = { ...(REGLAS_INICIALES as unknown as Reglas), transferenciaA: 13015 }
    act(() => raiz.render(<PromosFormaDePago reglas={reglas} />))
    act(() => (caja.querySelector('button') as HTMLButtonElement).click())
    const t = caja.textContent || ''
    expect(t).toContain('(1 hoy)')
    expect(t.indexOf('Galicia')).toBeLessThan(t.indexOf('Nación'))
    expect(t).toMatch(/Hoy\s*Galicia/)
    expect(t).toMatch(/Otro día\s*Nación/)
    expect(t).not.toContain('Web')
    expect(t).not.toContain('Vieja')
    expect(t).toContain('15% de descuento')
    expect(t).toContain('Los productos en oferta se cobran con efectivo, transferencia.')
  })
})
