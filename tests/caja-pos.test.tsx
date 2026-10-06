// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Caja · fase C (Bruno, 5-oct): el POS lo usa SÓLO la cuenta que abrió la caja, y la pestaña Caja le
 * muestra «Abrir POS» sólo a esa cuenta. El servidor tiene su propio test (`caja-handler`): éste
 * mira que la pantalla diga lo mismo.
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
vi.mock('@/components/fundas/useDatosMonitor', () => ({ useDatosMonitor: () => ({ datos: null }) }))
vi.mock('@/components/productos/useTnImages', () => ({ useTnPromo: () => null }))
vi.mock('@/store/useAgenda', () => ({ useAgenda: (sel: (s: unknown) => unknown) => sel({ promos: [], cargar: async () => {} }) }))
vi.mock('@/components/layout/acciones', () => ({ HeaderAcciones: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/lib/caja/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/caja/cliente')>()),
  leerConfig: vi.fn(async () => ({ reglas: { redondeo: 100, cuentas: {} }, politica_cambio: null })),
  leerTurno: vi.fn(async () => ({ turno, ultimos: [] })),
  leerPendientes: vi.fn(async () => ({ ventas: [] })),
  leerPedidosWeb: vi.fn(async () => ({ pedidos: [], porSku: {}, noLeidas: 0, leidoEn: new Date().toISOString() })),
}))

const { CajaPOS } = await import('@/components/caja/CajaPOS')
const { Caja } = await import('@/components/caja/Caja')

let raiz: Root
beforeEach(() => {
  disco.clear()
  turno = TURNO
  sesion.perfil = { ...sesion.perfil, name: 'Sofi', email: 'sofi@zattia.com', admin: false }
  const caja = document.createElement('div')
  document.body.appendChild(caja)
  raiz = createRoot(caja)
})
afterEach(() => {
  act(() => raiz.unmount())
  document.body.innerHTML = ''
})

async function montar(el: React.ReactElement) {
  await act(async () => raiz.render(el))
  await act(async () => {})
  return document.body.textContent || ''
}

describe('POS (/pos)', () => {
  it('🔑 la cuenta que abrió la caja ve el POS: escanear, el pedido y «Cerrar turno»', async () => {
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Escanear o buscar')
    expect(t).toContain('Pedido · 0 prendas')
    expect(t).toContain('Cerrar turno')
    // Sólo una flecha (Bruno, 5-oct), ⛔ «Volver al monitor».
    expect(t).not.toContain('Volver al monitor')
    expect(document.querySelector('a[aria-label="Volver"]')?.getAttribute('href')).toBe('/caja')
  })

  it('🔴 otra cuenta ⇒ «la abrió Sofi», sin escanear ni cobrar', async () => {
    sesion.perfil = { ...sesion.perfil, name: 'Ana', email: 'ana@zattia.com' }
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Turno de Sofi: POS sólo para esa cuenta.')
    expect(t).not.toContain('Escanear o buscar')
  })

  it('🔴 ni un admin', async () => {
    sesion.perfil = { ...sesion.perfil, name: 'Bruno', email: 'bruno@arebensrl.com', admin: true }
    const t = await montar(<CajaPOS />)
    expect(t).not.toContain('Escanear o buscar')
  })

  it('sin turno abierto ⇒ lo dice y manda a la Caja', async () => {
    turno = null
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Sin turno abierto')
    expect(document.querySelector('a[href="/caja"]')).toBeTruthy()
  })
})

describe('POS · promos (W5)', () => {
  it('🔑 la promo sale en el renglón con su nombre y baja el subtotal (2x1: $10.000 + $8.000 ⇒ $10.000)', async () => {
    const { leerConfig } = await import('@/lib/caja/cliente')
    const promo = { id: 'p1', nombre: '2x1 primavera', tipo: 'nxm', lleva: 2, paga: 1, alcance: { tipo: 'todo' }, desde: '2026-01-01', hasta: null, activa: true }
    vi.mocked(leerConfig).mockResolvedValueOnce({ reglas: { redondeo: 100, cuentas: {}, promos: [promo] }, politica_cambio: null } as never)
    const renglon = (id: number, precio: number) => ({ variante: { product_id: id, size_id: 1, product_name: `PRENDA ${id}`, size_name: 'M', sku: null, barcode: null }, stock: { local: 3, deposito: 0, fuente: 'vivo' }, cantidad: 1, precio, fueraDeTn: false, foto: null, rebaja: null })
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'b1', renglones: [renglon(1, 10000), renglon(2, 8000)], email: '' }))
    const t = await montar(<CajaPOS />)
    expect(t).toContain('2x1 primavera')
    expect(t).toMatch(/Subtotal\s*\$\s?10\.000/)
  })
})

describe('pestaña Caja', () => {
  it('«Abrir POS» sólo para la cuenta que abrió; se cobra en el POS, ⛔ acá', async () => {
    let t = await montar(<Caja />)
    expect(document.querySelector('a[href="/pos"]')?.textContent).toBe('Abrir POS')
    expect(t).not.toContain('Escanear')
    expect(t).toContain('Contar billetes')
    act(() => raiz.unmount())

    sesion.perfil = { ...sesion.perfil, name: 'Ana', email: 'ana@zattia.com' }
    const caja = document.createElement('div')
    document.body.appendChild(caja)
    raiz = createRoot(caja)
    t = await montar(<Caja />)
    expect(document.querySelector('a[href="/pos"]')).toBeNull()
    expect(t).toContain('POS sólo para esa cuenta')
    // Cerrar la caja, sí: «desde los dos lados». Contar billetes, ⛔ (el servidor da 403).
    expect(t).toContain('Cerrar turno')
    expect(t).not.toContain('Contar billetes')
  })
})
