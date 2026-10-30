// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProveedorLineaErp } from '@/lib/erp/linea-erp'

/**
 * **ERP › Cuentas de cobro, del lado de la pantalla** (18-oct, Bruno: «que avise»). El oráculo es lo que se LEE y lo que
 * se MANDA: la grilla dice adónde va cada medio, el aviso aparece ANTES de guardar cuando la cuenta factura y el medio
 * tiene descuento, y el pedido lleva la línea, el canal, el medio y la cuenta elegidos.
 */

const GAL = '00000000-0000-0000-0000-00000000aaa1'
const MPB = '00000000-0000-0000-0000-00000000bbb1'
const cuentas = [
  { id: GAL, titular: 'areben', nombre: 'Cuenta Corriente', banco: 'Galicia', tipo: 'banco' },
  { id: MPB, titular: 'bruno', nombre: 'Caja de Ahorro', banco: 'Mercado Pago', tipo: 'billetera' },
]
const reglas = [{ nombre: 'Transferencia siempre', marca: 'zattia', canal: 'local', medios: ['transferencia'], efecto: 'descuento', pct: 10, activa: true }]
const vigente = { id: 'r1', marca: 'zattia', canal: 'local', medio: 'transferencia', cuenta_real_id: MPB, tasa: null, dias_acreditacion: null, desde: '2026-10-18T15:00:00Z', puesta_por: 'Bruno Arevalo', puesta_en: '2026-10-18T15:00:00Z', cuenta_titular: 'bruno', cuenta_nombre: 'Caja de Ahorro', cuenta_banco: 'Mercado Pago' }
const medios = ['efectivo', 'transferencia', 'debito', 'credito', 'mp', 'pagonube']
const filas = (linea: string) => ['local', 'online', 'mayorista', 'ml'].flatMap((canal) => medios.map((medio) => {
  const v = linea === 'zattia' && canal === 'local' && medio === 'transferencia'
  return { canal, medio, vigente: v ? vigente : null, proxima: null, cuenta: v ? { id: MPB, titular: 'bruno', nombre: 'Caja de Ahorro', banco: 'Mercado Pago' } : null, factura: v ? false : null, aviso: null }
}))
const datos = { lineas: [{ linea: 'zattia', filas: filas('zattia') }, { linea: 'stunned', filas: filas('stunned') }], cuentas, reglas, historial: [vigente], cuentasCopiadasEn: '2026-10-18T12:00:00Z' }

const leerRutas = vi.fn(async () => datos)
const ponerRuta = vi.fn(async () => ({ ok: true, ruta: { id: 'r2', desde: 'x' }, aviso: 'AVISO DEL SERVIDOR' }))
vi.mock('@/lib/erp/cliente', () => ({ leerRutas: (...a: unknown[]) => leerRutas(...(a as [])), ponerRuta: (...a: unknown[]) => ponerRuta(...(a as [])) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar(linea: 'zattia' | 'stunned' = 'zattia') {
  const { RutasCobro } = await import('@/components/erp/RutasCobro')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ProveedorLineaErp value={linea}><RutasCobro /></ProveedorLineaErp>) })
  await act(async () => {})
}
/** La fila de la lista (canal Local, la primera vista): `role="row"` con el medio adentro. */
const fila = (medio: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes('Local') && r.textContent?.includes(medio))!
const pagina = () => document.body.textContent ?? ''
const abrir = async (medio: string) => { await act(async () => { fila(medio).dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
const elegir = async (cuenta: string) => {
  const sel = [...document.body.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') !== 'Línea') as HTMLSelectElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, cuenta)
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('RutasCobro', () => {
  it('la grilla dice adónde va cada medio, si factura, y lo sin cuenta', async () => {
    await montar()
    expect(fila('Transferencia').textContent).toContain('Mercado Pago · Caja de Ahorro (Bruno)')
    expect(fila('Transferencia').textContent).toContain('No')
    expect(fila('Efectivo').textContent).toContain('Sin cuenta')
    expect(host.textContent).toContain('la Caja sigue cobrando como hoy')
    expect(host.textContent).toContain('A qué cuenta va')
    expect(host.textContent).toMatch(/Sin cuenta\s*23/)
    expect(host.textContent).toMatch(/Cambios\s*1/)
  })

  it('🔑 el aviso aparece ANTES de guardar: a Galicia (factura) con transferencia −10 %; a Bruno, ⛔', async () => {
    await montar()
    await abrir('Transferencia')
    await elegir(GAL)
    expect(pagina()).toContain('Transferencia de Zattia en local tiene −10 % («Transferencia siempre») y ahora va a Galicia · Cuenta Corriente (Areben), que factura. ¿Revisás la regla?')
    await elegir(MPB)
    expect(pagina()).not.toContain('¿Revisás la regla?')
  })

  it('guardar manda línea, canal, medio y cuenta, y muestra el aviso del servidor', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await montar()
    await abrir('Efectivo')
    await elegir(GAL)
    await act(async () => [...document.body.querySelectorAll('button')].filter((b) => b.textContent === 'Cambiar la cuenta').pop()!.click())
    await act(async () => {})
    expect(ponerRuta).toHaveBeenCalledWith('zattia', { linea: 'zattia', canal: 'local', medio: 'efectivo', cuenta_real_id: GAL, tasa: '', dias_acreditacion: '' })
    expect(host.textContent).toContain('Efectivo de Zattia en local va a Galicia · Cuenta Corriente (Areben) desde ahora.')
    expect(host.textContent).toContain('AVISO DEL SERVIDOR')
    expect(leerRutas).toHaveBeenCalledTimes(2)
  })

  it('Stunned: la misma pantalla con su línea', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await montar('stunned')
    expect(host.querySelector('select[aria-label="Línea"]')).toBeNull()
    expect(fila('Transferencia').textContent).toContain('Sin cuenta')
    await abrir('Transferencia')
    await elegir(GAL)
    expect(pagina()).toContain('Transferencia de Stunned en local tiene −10 %')
    await act(async () => [...document.body.querySelectorAll('button')].filter((b) => b.textContent === 'Cambiar la cuenta').pop()!.click())
    expect(ponerRuta).toHaveBeenCalledWith('zattia', expect.objectContaining({ linea: 'stunned', medio: 'transferencia', cuenta_real_id: GAL }))
  })
})
