// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * El modo «Cambios» del POS (Bruno, 27-oct, maqueta aprobada): la banda con los dos pasos, la prenda sin venta y el PIN de la encargada.
 * Las cuentas las cubre `caja-cambio-suelto.test.tsx`; éste mira lo que muestra la pantalla.
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
let stunnedErp = true
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
}))
vi.mock('@/lib/caja/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/caja/cliente')>()),
  leerConfig: vi.fn(async () => ({ stunned_erp: stunnedErp, reglas: { redondeo: 100, cuentas: {} }, politica_cambio: null })),
  leerTurno: vi.fn(async () => ({ turno: TURNO, ultimos: [] })),
  leerPendientes: vi.fn(async () => ({ ventas: [] })),
  leerPedidosWeb: vi.fn(async () => ({ pedidos: [], porSku: {}, noLeidas: 0, leidoEn: new Date().toISOString() })),
  reintentarPendientes: vi.fn(async () => ({ intentadas: 0, llegaron: 0 })),
  buscarProducto: vi.fn(async () => ({ variante: REMERA, stock: { local: 3, deposito: 0, fuente: 'vivo' } })),
  buscarNombre: vi.fn(async () => ({ conStock: [], sinStock: [], masCon: 0, masSin: 0 })),
}))

const { CajaPOS } = await import('@/components/caja/CajaPOS')

let raiz: Root
beforeEach(() => {
  disco.clear()
  stunnedErp = true
  const el = document.createElement('div')
  document.body.appendChild(el)
  raiz = createRoot(el)
})
afterEach(() => {
  act(() => raiz.unmount())
  document.body.innerHTML = ''
})

const texto = () => document.body.textContent || ''
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes(t)) as HTMLButtonElement | undefined
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

describe('POS · modo «Cambios»', () => {
  it('🔑 el botón «⇄ Cambios» sale sólo con Stunned vendiendo por el ERP', async () => {
    stunnedErp = false
    await montar()
    expect(boton('Cambios')).toBeUndefined()
  })

  it('🔑 «⇄ Cambios» abre la banda de los dos pasos, y el pedido de venta deja su lugar al del cambio', async () => {
    await montar()
    expect(texto()).toContain('Pedido · 0 prendas')
    await act(async () => boton('Cambios')!.click())
    const t = texto()
    expect(t).toContain('1 Lo que devuelve')
    expect(t).toContain('2 Lo que se lleva')
    expect(t).toContain('Buscar la venta')
    expect(t).toContain('Siguiente →')
    expect(t).toContain('Salir del cambio')
    expect(t).not.toContain('Pedido · 0 prendas')
    expect(t).toContain('DEVUELVE')
  })

  it('🔴 en el paso 1 el pie ⛔ dice «Queda a favor»: el total se calcula en el paso 2', async () => {
    await montar()
    await act(async () => boton('Cambios')!.click())
    await escanear('STU-REM-M')
    const t = texto()
    expect(t).toContain('Remera')
    expect(t).toContain('Devuelve')
    expect(t).not.toMatch(/queda a favor/i)
    expect(t).not.toContain('DIFERENCIA A COBRAR')
  })

  it('🔑 una prenda sin venta se marca «Sin venta» y «Siguiente →» pide el PIN de la encargada', async () => {
    await montar()
    await act(async () => boton('Cambios')!.click())
    await escanear('STU-REM-M')
    expect(texto()).toContain('Sin venta')
    // Sin el precio de la etiqueta (acá no hay Tienda Nube), la cajera escribe lo que pagó; sin eso ⛔ se sigue.
    await act(async () => boton('Siguiente')!.click())
    expect(texto()).toContain('Escribí lo que pagó la clienta')
    expect(texto()).not.toContain('Autoriza la encargada')
    const precio = document.querySelector('input[placeholder="Lo que pagó"]') as HTMLInputElement
    const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      poner.call(precio, '12000')
      precio.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => boton('Siguiente')!.click())
    await act(async () => {})
    expect(texto()).toContain('Autoriza la encargada')
    // Sin elegir a la encargada ni poner el PIN, ⛔ se puede autorizar.
    expect(boton('Autorizar')!.disabled).toBe(true)
    // Sigue en el paso 1: lo que se lleva ⛔ se muestra.
    expect(texto()).not.toContain('SE LLEVA')
  })

  it('«Salir del cambio» vuelve al pedido de venta', async () => {
    await montar()
    await act(async () => boton('Cambios')!.click())
    await act(async () => boton('Salir del cambio')!.click())
    expect(texto()).toContain('Pedido · 0 prendas')
    expect(texto()).not.toContain('1 Lo que devuelve')
  })
})
