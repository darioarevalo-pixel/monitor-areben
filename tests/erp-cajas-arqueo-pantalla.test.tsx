// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * 🧾 **Arqueo de caja, la pantalla** (Bruno, 30-oct; ERP › Ventas › Cajas): sólo un admin ve el campo «Código de la caja» y
 * el botón «Revisar»; el resto ve el estado. Escaneada la caja, se abre DIRECTO la revisión: cada billete con lo esperado,
 * el ✓ («Igual al esperado») carga lo esperado y ⛔ mueve el foco; todos coinciden ⇒ «Listo» guarda y cierra el panel;
 * alguno ⛔ coincide ⇒ nota y «Guardar con diferencia». La caja es el sobre real Z-0040 (30-oct).
 */
const CERRADA = {
  id: 't40', store: 'zattia', numero: 40, arqueo: null, fondo: 55100, contado: 412700, esperado: 412700,
  abierto_en: '2026-10-30T12:00:00Z', abierto_por: 'camila', cerrado_en: '2026-10-30T17:02:49Z', cerrado_por: 'camilaquintana', resumen: null,
  conteos: { cierre: { billetes: { 100: 21, 200: 13, 500: 0, 1000: 50, 2000: 19, 10000: 12, 20000: 10 } } },
}
const m = vi.hoisted(() => ({
  sesion: { marca: 'zattia', perfil: { name: 'bruno', admin: true } as { name: string; admin?: boolean } },
  arquearSobre: vi.fn(),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => m.sesion }))
vi.mock('@/lib/erp/cliente', () => ({
  leerTurnosCaja: async () => ({ turnos: [CERRADA], arqueo: { disponible: true } }),
  leerCajaAbierta: async () => ({ turno: null }),
  leerCajaDelSobre: async () => ({ turno: CERRADA }),
  arquearSobre: m.arquearSobre,
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

async function montar(admin: boolean) {
  m.sesion.perfil = { name: admin ? 'bruno' : 'camila', ...(admin ? { admin: true } : {}) }
  const { CajasErp } = await import('@/components/erp/ventas/CajasErp')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<CajasErp />) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const set = (input: HTMLInputElement, v: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })) }
const campo = () => document.querySelector('input[aria-label="Código de la caja"]') as HTMLInputElement | null
const boton = (texto: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto) ?? null
const tildes = () => [...document.querySelectorAll('button[aria-label="Igual al esperado"]')] as HTMLButtonElement[]
const verificado = (billete: string) => document.querySelector(`input[aria-label="Verificado de $ ${billete}"]`) as HTMLInputElement
async function escanear() {
  const input = campo()!
  await act(async () => { set(input, 'z-0040') })
  await act(async () => { input.form!.requestSubmit() })
}

describe('ERP › Cajas › Arqueo de caja', () => {
  it('admin: escanea la caja ⇒ revisión directa con los billetes esperados del sobre', async () => {
    await montar(true)
    await escanear()
    const t = document.body.textContent ?? ''
    expect(t).toContain('Revisión · Caja Z-0040')
    // El sobre de Z-0040 con la regla del ticket: 10×20.000 + 12×10.000 + 18×2.000 + 1×1.000 + 3×200 = $ 357.600.
    expect(tildes()).toHaveLength(5)
    for (const b of ['20.000', '10.000', '2.000', '1.000', '200']) expect(verificado(b)).not.toBeNull()
    expect(t.replace(/\s/g, ' ')).toMatch(/357\.600/)
    expect(t).toContain('0 de 5 revisados')
    expect((boton('Listo') as HTMLButtonElement).disabled).toBe(true)
  })

  it('el ✓ carga lo esperado y ⛔ mueve el foco; todos coinciden ⇒ Listo guarda los billetes y cierra el panel', async () => {
    m.arquearSobre.mockResolvedValue({ turno: { ...CERRADA, arqueo: { estado: 'bien', esperado: 357600, contado: 357600, diferencia: 0, nota: null, por: 'bruno', en: '2026-10-30T23:00:00Z' } } })
    await montar(true)
    await escanear()
    const antes = document.activeElement
    await act(async () => { tildes()[0].click() })
    expect(verificado('20.000').value).toBe('10')
    expect(document.activeElement).not.toBe(verificado('10.000'))
    expect(document.activeElement === antes || document.activeElement === document.body || (document.activeElement as HTMLElement)?.getAttribute('aria-label') === 'Igual al esperado').toBe(true)
    for (const b of tildes().slice(1)) await act(async () => { b.click() })
    expect(document.body.textContent).toContain('Coincide')
    await act(async () => { boton('Listo')!.click() })
    expect(m.arquearSobre).toHaveBeenCalledWith('zattia', expect.objectContaining({ id: 't40', verificados: { 20000: 10, 10000: 12, 2000: 18, 1000: 1, 200: 3 }, nota: null, corregir: false }))
    expect(document.body.textContent).not.toContain('Revisión · Caja Z-0040')
  })

  it('Enter en un campo pasa al siguiente; un billete que ⛔ coincide pide nota y «Guardar con diferencia»', async () => {
    m.arquearSobre.mockResolvedValue({ turno: CERRADA })
    await montar(true)
    await escanear()
    const v20 = verificado('20.000')
    await act(async () => { v20.focus(); set(v20, '10') })
    await act(async () => { v20.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(document.activeElement).toBe(verificado('10.000'))
    for (const b of tildes().slice(1)) await act(async () => { b.click() })
    await act(async () => { set(verificado('2.000'), '16') })
    const t = document.body.textContent ?? ''
    expect(t).toContain('−2')
    const guardar = boton('Guardar con diferencia') as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
    await act(async () => { set(document.querySelector('input[aria-label="Nota"]') as HTMLInputElement, 'dio mal un vuelto') })
    expect(guardar.disabled).toBe(false)
    await act(async () => { guardar.click() })
    expect(m.arquearSobre).toHaveBeenCalledWith('zattia', expect.objectContaining({ verificados: expect.objectContaining({ 2000: 16 }), nota: 'dio mal un vuelto' }))
  })

  it('desde la lista se abre la ficha con «Revisar» (⛔ la revisión directa)', async () => {
    await montar(true)
    await act(async () => { (document.querySelector('.mo-lista-fila') as HTMLElement).click() })
    expect(document.body.textContent).toContain('Caja Z-0040')
    expect(boton('Revisar')).not.toBeNull()
    expect(tildes()).toHaveLength(0)
    await act(async () => { [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Revisar').at(-1)!.click() })
    expect(tildes()).toHaveLength(5)
  })

  it('⛔ admin: ni el campo ni «Revisar» (ve el estado)', async () => {
    await montar(false)
    expect(campo()).toBeNull()
    await act(async () => { (document.querySelector('.mo-lista-fila') as HTMLElement).click() })
    const t = document.body.textContent ?? ''
    expect(t).toContain('Caja Z-0040')
    expect(t).toContain('Sin recibir')
    expect(boton('Revisar')).toBeNull()
    expect(tildes()).toHaveLength(0)
  })
})
