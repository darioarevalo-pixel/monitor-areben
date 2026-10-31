import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 La cuenta corriente del ERP en el panel de WhatsApp está ESCONDIDA hasta el día que BDI pasa al ERP (Bruno, 31-oct;
 * `docs/secciones/crm.md` § Lo ESCONDIDO del panel): nadie la ve en pantalla, así que un cambio en el panel la puede sacar sin
 * que nadie se entere hasta prender el interruptor. Los tests de `CuentaCorriente.tsx` prueban las piezas; éste, que sigan
 * ENGANCHADAS en el panel.
 */
const panel = readFileSync('components/panel/PanelWhatsApp.tsx', 'utf8')
const pagos = readFileSync('components/panel/Pagos.tsx', 'utf8')

describe('la cuenta corriente sigue enganchada en el panel (escondida, ⛔ sacada)', () => {
  it('PanelWhatsApp: la lee y dibuja la franja, la tarjeta y la hoja de cargar pago', () => {
    expect(panel).toMatch(/from '\.\/CuentaCorriente'/)
    expect(panel).toMatch(/useCuentaPanel\(/)
    for (const pieza of ['<FranjaCuenta', '<TarjetaCuenta', '<HojaCargarPago']) expect(panel).toContain(pieza)
  })
  it('Pagos: el segmento «Cuentas» detrás del interruptor', () => {
    expect(pagos).toMatch(/from '\.\/CuentaCorriente'/)
    expect(pagos).toMatch(/useCuentaPrendida\(\)/)
    expect(pagos).toContain("['cuentas', 'Cuentas']")
    expect(pagos).toContain('<ListaCuentas')
  })
})
