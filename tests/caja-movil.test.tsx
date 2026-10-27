// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Vista de CELULAR del POS (Bruno, 27-oct): se dibuja con pantalla chica o `?movil=1`, ⛔ cambia la PC, y
 * ⛔ imprime (el ticket va por mail). El cobro es el mismo: lo cubren `caja-core` y `caja-handler`.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const disco = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => disco.get(k) ?? null,
  setItem: (k: string, v: string) => void disco.set(k, v),
  removeItem: (k: string) => void disco.delete(k),
  clear: () => disco.clear(),
})

const sesion = { perfil: { name: 'Sofi', email: 'sofi@zattia.com', admin: false, acceso: { zattia: { caja: true } } } as Record<string, unknown>, marca: 'zattia', setMarca: vi.fn() }
const TURNO = { id: 't1', abierto_en: '2026-10-05T12:00:00.000Z', abierto_por: 'Sofi', abierto_por_usuario: 'sofi@zattia.com', fondo: 50000, cerrado_en: null, cerrado_por: null, contado: null, esperado: null, nota: null }
let turno: typeof TURNO | null = TURNO

vi.mock('@/components/SesionProvider', () => ({ useSesion: () => sesion }))
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/fundas/useDatosMonitor', () => ({ useDatosMonitor: () => ({ datos: null }) }))
vi.mock('@/components/productos/useTnImages', () => ({ useTnPromo: () => null }))
vi.mock('@/store/useAgenda', () => {
  const st = { promos: [], cargar: async () => {} }
  return { useAgenda: Object.assign((sel: (s: unknown) => unknown) => sel(st), { getState: () => st }) }
})
vi.mock('@/components/layout/acciones', () => ({ HeaderAcciones: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/lib/caja/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/caja/cliente')>()),
  leerConfig: vi.fn(async () => ({ reglas: { redondeo: 100, cuentas: {} }, politica_cambio: null })),
  leerTurno: vi.fn(async () => ({ turno, ultimos: [] })),
  leerPendientes: vi.fn(async () => ({ ventas: [] })),
  leerPedidosWeb: vi.fn(async () => ({ pedidos: [], porSku: {}, noLeidas: 0, leidoEn: new Date().toISOString() })),
  reintentarPendientes: vi.fn(async () => ({ intentadas: 0, llegaron: 0 })),
  cerrarTurno: vi.fn(async () => ({ turno: { ...TURNO, cerrado_en: '2026-10-05T20:00:00.000Z' } })),
  cruzarVenta: vi.fn(async () => ({ venta: null, cruce: { estado: 'esperando' }, recientes: [{ id: '998812', monto: 12300, cuando: new Date().toISOString(), origen: 'banco', coincide: false }], cuentaMp: 'Areben Comercial' })),
  confirmarVarios: vi.fn(),
  confirmarOtraCuenta: vi.fn(),
  cancelarVenta: vi.fn(),
  elegirVariante: vi.fn(),
  leerVentasTurno: vi.fn(),
  confirmarVenta: vi.fn(async () => {
    throw Object.assign(new Error('Recargá la Caja: cambió una forma de pago (las transferencias van a otra cuenta).'), { status: 400, datos: {} })
  }),
}))

const { CajaPOS } = await import('@/components/caja/CajaPOS')


import { esMovil } from '@/lib/caja/movil'

let raiz: Root
beforeEach(() => {
  disco.clear()
  turno = TURNO
  const caja = document.createElement('div')
  document.body.appendChild(caja)
  raiz = createRoot(caja)
})
afterEach(() => {
  act(() => raiz.unmount())
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

async function montar(el: React.ReactElement) {
  await act(async () => raiz.render(el))
  await act(async () => {})
  return document.body.textContent || ''
}

describe('esMovil', () => {
  it('pantalla chica y táctil ⇒ celular', () => {
    expect(esMovil({ search: '', ancho: 390, tactil: true })).toBe(true)
    expect(esMovil({ search: '', ancho: 640, tactil: true })).toBe(true)
    expect(esMovil({ search: '', ancho: 1280, tactil: true })).toBe(false)
    expect(esMovil({ search: '', ancho: null, tactil: true })).toBe(false)
  })
  it('🔴 la PC con la ventana angosta o con zoom (mouse) ⛔ es celular: dejaría de imprimir', () => {
    expect(esMovil({ search: '', ancho: 500, tactil: false })).toBe(false)
  })
  it('?movil=1 la fuerza en la PC y ?movil=0 la apaga en el celular', () => {
    expect(esMovil({ search: '?movil=1', ancho: 1280, tactil: false })).toBe(true)
    expect(esMovil({ search: '?marca=bdi&movil=1', ancho: 1280, tactil: false })).toBe(true)
    expect(esMovil({ search: '?movil=0', ancho: 390, tactil: true })).toBe(false)
  })
})

describe('POS en el celular', () => {
  it('🔑 ?movil=1: una fila arriba con «⋯», el pedido y «Continuar al cobro» abajo; ⛔ los botones de la PC', async () => {
    window.history.replaceState(null, '', '/pos?movil=1')
    const t = await montar(<CajaPOS />)
    expect(document.querySelector('button[aria-label="Más opciones"]')).toBeTruthy()
    expect(t).toContain('Pedido · 0 prendas')
    expect(t).toContain('Continuar al cobro')
    expect(t).not.toContain('Alt+C')
    // Ventas, Contar billetes, Ingreso, Salida y Cerrar caja viven en el menú, no en la barra.
    expect(t).not.toContain('Cerrar caja')
    expect(document.querySelector('a[aria-label="Volver"]')?.getAttribute('href')).toBe('/caja')
  })

  it('el menú «⋯» trae las cinco acciones de la caja', async () => {
    window.history.replaceState(null, '', '/pos?movil=1')
    await montar(<CajaPOS />)
    await act(async () => (document.querySelector('button[aria-label="Más opciones"]') as HTMLButtonElement).click())
    const t = document.body.textContent || ''
    for (const x of ['Ventas', 'Contar billetes', '+ Ingreso', '+ Salida', 'Cerrar caja']) expect(t).toContain(x)
  })

  it('🔴 la PC queda igual: sin ?movil=1 y con pantalla ancha, el POS de siempre', async () => {
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Escanear o buscar')
    expect(t).toContain('Cerrar caja')
    expect(document.querySelector('button[aria-label="Más opciones"]')).toBeNull()
  })
})
