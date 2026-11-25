// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * El estado «Falla» del POS (Bruno, 25-nov): la MISMA venta, en otro estado. Se escanea normal, el total da $0 y «Registrar falla»
 * reemplaza a «Continuar al cobro». La carga de cada renglón la cubre `caja-falla-pos.test.ts`; éste mira la pantalla.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const disco = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => disco.get(k) ?? null,
  setItem: (k: string, v: string) => void disco.set(k, v),
  removeItem: (k: string) => void disco.delete(k),
  clear: () => disco.clear(),
})

const sesion = { perfil: { name: 'Sofi', email: 'sofi@zattia.com', admin: false, acceso: { zattia: { caja: true, 'postventa-local': true } } } as Record<string, unknown>, marca: 'zattia', setMarca: vi.fn() }
const TURNO = { id: 't1', abierto_en: '2026-10-05T12:00:00.000Z', abierto_por: 'Sofi', abierto_por_usuario: 'sofi@zattia.com', fondo: 50000, cerrado_en: null, cerrado_por: null, contado: null, esperado: null, nota: null }
/** Las líneas de la Caja que ya venden por el ERP (`config.erp_lineas`, por su corte). */
let erpLineas: string[] = ['stunned']
const REMERA = { product_id: 7, size_id: 3, product_name: 'Remera', size_name: 'M', sku: 'STU-REM-M', barcode: null }

vi.mock('@/components/SesionProvider', () => ({ useSesion: () => sesion }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/fundas/useDatosMonitor', () => ({ useDatosMonitor: () => ({ datos: { allProductos: [{ id: 7, sku: 'STU-REM' }] } }) }))
vi.mock('@/components/productos/useTnImages', () => ({ useTnPromo: () => null }))
vi.mock('@/store/useAgenda', () => {
  const st = { promos: [], cargar: async () => {} }
  return { useAgenda: Object.assign((sel: (s: unknown) => unknown) => sel(st), { getState: () => st }) }
})
vi.mock('@/components/layout/acciones', () => ({ HeaderAcciones: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/lib/erp/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/erp/cliente')>()),
  leerPines: vi.fn(async () => ({ marca: 'zattia', pines: [{ usuario: 'ana', pin: '1234', cambiado_por: 'x', cambiado_en: '', bloqueado: false, bloqueado_hasta: null }] })),
  verificarPin: vi.fn(async () => ({ ok: true, persona: 'ana' })),
  leerEncargadas: vi.fn(async () => ({ encargadas: [] })),
}))
vi.mock('@/lib/caja/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/caja/cliente')>()),
  leerConfig: vi.fn(async () => ({ erp_lineas: erpLineas, reglas: { redondeo: 100, cuentas: {} }, politica_cambio: null })),
  leerTurno: vi.fn(async () => ({ turno: TURNO, ultimos: [] })),
  leerPendientes: vi.fn(async () => ({ ventas: [] })),
  leerPedidosWeb: vi.fn(async () => ({ pedidos: [], porSku: {}, noLeidas: 0, leidoEn: new Date().toISOString() })),
  reintentarPendientes: vi.fn(async () => ({ intentadas: 0, llegaron: 0 })),
  buscarProducto: vi.fn(async () => ({ variante: REMERA, stock: { local: 3, deposito: 0, fuente: 'vivo' } })),
  buscarNombre: vi.fn(async () => ({ conStock: [], sinStock: [], masCon: 0, masSin: 0 })),
  confirmarVenta: (...a: unknown[]) => confirmar(...a),
}))

const { registrar, confirmar } = vi.hoisted(() => ({ registrar: vi.fn(), confirmar: vi.fn() }))
vi.mock('@/lib/caja/falla-pos', async (orig) => ({ ...(await orig<typeof import('@/lib/caja/falla-pos')>()), registrarFallaPOS: (...a: unknown[]) => registrar(...a) }))
vi.mock('@/lib/sesion', async (orig) => ({ ...(await orig<typeof import('@/lib/sesion')>()), credencialConPrompt: vi.fn(async () => ({ token: 't' })) }))

const { CajaPOS } = await import('@/components/caja/CajaPOS')

let raiz: Root
beforeEach(() => {
  disco.clear()
  erpLineas = ['stunned']
  const el = document.createElement('div')
  document.body.appendChild(el)
  raiz = createRoot(el)
})
afterEach(() => {
  act(() => raiz.unmount())
  document.body.innerHTML = ''
})

const texto = () => document.body.textContent || ''
async function montar() {
  await act(async () => raiz.render(<CajaPOS />))
  await act(async () => {})
}
async function escanear(codigo: string) {
  const input = document.querySelector('input[aria-label^="Código de barras"]') as HTMLInputElement
  const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    poner.call(input, codigo)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  await act(async () => {})
}


const botones = (t: string) => [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === t) as HTMLButtonElement[]
/** «Registrar falla»: el cartel que pregunta es `window.confirm` (sin el provider), que contesta que sí. */
async function registrarYConfirmar() {
  await act(async () => botones('Registrar falla')[0].click())
  await act(async () => {})
  await act(async () => {})
}

describe('POS · estado «Falla»', () => {
  beforeEach(() => {
    registrar.mockReset()
    window.confirm = () => true
  })

  it('🔑 sin permiso de Post-venta ⛔ hay botón «Falla» (cargar una falla lo pide el servidor)', async () => {
    const antes = sesion.perfil
    sesion.perfil = { ...antes, acceso: { zattia: { caja: true } } }
    try {
      await montar()
      expect(botones('Falla')).toHaveLength(0)
    } finally {
      sesion.perfil = antes
    }
  })

  it('🔑 se escanea normal, el TOTAL da $0 y «Registrar falla» reemplaza a «Continuar al cobro»', async () => {
    await montar()
    await act(async () => botones('Falla')[0].click())
    expect(texto()).toContain('Salir de falla')
    expect(texto()).toContain('Productos con falla')
    await escanear('STU-REM-M')
    const t = texto()
    expect(t).toContain('Remera')
    expect(t).toContain('Pedido · 1 producto')
    expect(t).toContain('Registrar falla')
    expect(t).not.toContain('Continuar al cobro')
    expect(t).not.toContain('Mail para el ticket')
    // 🔴 La pantalla de la clienta ⛔ ve la falla.
    const vista = [...disco.entries()].find(([k]) => k.startsWith('caja:cliente:'))
    if (vista) expect(JSON.parse(vista[1]).renglones ?? []).toHaveLength(0)
  })

  it('🔑 con algo en el pedido ⛔ se pasa a falla: lo escaneado es una venta', async () => {
    await montar()
    await escanear('STU-REM-M')
    await act(async () => botones('Falla')[0].click())
    expect(texto()).toContain('Para pasar a falla, el pedido tiene que estar vacío')
    expect(texto()).not.toContain('Salir de falla')
  })

  it('🔑 «Registrar falla» carga cada renglón y, si anduvo, el pedido queda vacío y vuelve a la venta', async () => {
    registrar.mockResolvedValue({ ok: true, fallaId: 9, barcode: 'F-9', erpAjuste: 31 })
    await montar()
    await act(async () => botones('Falla')[0].click())
    await escanear('STU-REM-M')
    await registrarYConfirmar()
    expect(registrar).toHaveBeenCalledTimes(1)
    expect(registrar.mock.calls[0][0]).toBe('zattia')
    expect(registrar.mock.calls[0][1]).toMatchObject({ cantidad: 1, variante: { product_id: 7, size_id: 3 } })
    const t = texto()
    expect(t).toContain('Falla registrada · ajuste A-31 en Areben Gestión')
    expect(t).not.toContain('Salir de falla')
    expect(t).toContain('Continuar al cobro')
    expect(t).toContain('Pedido · 0 productos')
  })

  it('🔴 cargó y ⛔ descontó ⇒ queda en el pedido con el aviso, y el reintento manda el fallaId (⛔ otra falla igual)', async () => {
    registrar.mockResolvedValueOnce({ ok: false, fallaId: 9, barcode: 'F-9', error: 'sin stock en el ERP' })
    await montar()
    await act(async () => botones('Falla')[0].click())
    await escanear('STU-REM-M')
    await registrarYConfirmar()
    expect(texto()).toContain('No se registró: Remera M: sin stock en el ERP')
    expect(texto()).toContain('falta descontar el stock')
    // ⛔ se sale con una cargada sin descontar.
    await act(async () => botones('Salir de falla')[0].click())
    expect(texto()).toContain('Salir de falla')
    registrar.mockResolvedValueOnce({ ok: true, fallaId: 9, barcode: 'F-9', erpAjuste: null })
    await registrarYConfirmar()
    expect(registrar.mock.calls[1][1]).toMatchObject({ fallaId: 9, fallaBarcode: 'F-9' })
    expect(texto()).toContain('Falla registrada.')
  })
})

async function escribir(input: HTMLInputElement, valor: string) {
  const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    poner.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const campo = (label: string) => [...document.querySelectorAll('label')].find((l) => (l.textContent || '').startsWith(label))?.querySelector('input') as HTMLInputElement

describe('POS · estado «Publicidad»', () => {
  beforeEach(() => confirmar.mockReset())

  it('🔑 la banda pide persona y monto; con el estado prendido, Falla y Cambios se traban y ⛔ hay descuento a mano', async () => {
    await montar()
    await act(async () => botones('Publicidad')[0].click())
    expect(texto()).toContain('Salir de publicidad')
    expect(campo('Persona')).toBeTruthy()
    expect(campo('Tiene a favor')).toBeTruthy()
    expect(texto()).toContain('Falta la persona y cuánto tiene a favor.')
    expect(botones('Falla')[0].disabled).toBe(true)
    expect(botones('⇄ Cambios')[0].disabled).toBe(true)
    expect(texto()).not.toMatch(/^Descuento$/m)
  })

  it('🔑 se lleva MENOS de lo que tiene a favor: total $0, «Registrar publicidad» sin forma de pago, y lo que sobra se ve', async () => {
    confirmar.mockResolvedValue({ venta: { id: 'v1', estado: 'en_erp', destino: 'erp', erp_numero: 12, renglones: [], pagos: [], subtotal: 12000, total: 0, a_mano: { venta: 0, prendas: 0, precios: 0, publicidad: { persona: 'Mica', a_favor: 30000, usado: 12000, sobra: 18000 } }, creada_en: new Date().toISOString() } })
    await montar()
    await act(async () => botones('Publicidad')[0].click())
    await escribir(campo('Persona'), 'Mica')
    await escribir(campo('Tiene a favor'), '30000')
    await escanear('STU-REM-M')
    const precio = document.querySelector('input[aria-label="Precio"]') as HTMLInputElement
    await escribir(precio, '12000')
    await act(async () => precio.dispatchEvent(new FocusEvent('blur', { bubbles: true })))
    await act(async () => precio.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    const t = texto()
    expect(t).toContain('A favor de Mica')
    expect(t).toContain('Le queda a favor')
    expect(t).not.toContain('Continuar al cobro')
    const reg = botones('Registrar publicidad')[0]
    expect(reg.disabled).toBe(false)
    await act(async () => reg.click())
    await act(async () => {})
    expect(confirmar).toHaveBeenCalledTimes(1)
    expect(confirmar.mock.calls[0][0]).toMatchObject({ pagos: [], total: 0, descuentoVenta: null, publicidad: { persona: 'Mica', aFavor: 30000 } })
    // La venta quedó: el estado se apaga con el pedido.
    expect(texto()).not.toContain('Salir de publicidad')
  })
})
