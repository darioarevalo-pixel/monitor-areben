// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **`/erp` como el POS** (Bruno, 19-oct): el menú propio con las secciones del diseño, la dirección dice qué se ve, las
 * pestañas cambian la dirección y siempre está «Volver al monitor». Las pestañas de adentro se reemplazan por un rótulo:
 * acá se prueba el armazón, cada pantalla tiene su test.
 */
const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))
const setMarca = vi.fn()
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno', admin: true }, setMarca }) }))
vi.mock('@/lib/permisos', () => ({ puedeVer: () => true }))
for (const [archivo, nombre] of [['CambioCaja', 'CambioCaja'], ['FacturaCaja', 'FacturaCaja'], ['Facturacion', 'Facturacion'], ['StockPrenda', 'StockPrenda'], ['DiferenciasDia', 'DiferenciasDia'], ['ConciliacionDia', 'ConciliacionDia'], ['AjustesStock', 'AjustesStock'], ['PedidosSinPagar', 'PedidosSinPagar'], ['PreciosProducto', 'PreciosProducto'], ['ReglasComerciales', 'ReglasComerciales'], ['RutasCobro', 'RutasCobro'], ['ventas/VentasErp', 'VentasErp']]) {
  vi.doMock(`@/components/erp/${archivo}`, () => ({ [nombre]: () => <div data-pantalla={nombre} /> }))
}

let root: Root | null = null
const div = document.createElement('div')
document.body.appendChild(div)
afterEach(() => { act(() => root?.unmount()); root = null; push.mockClear(); replace.mockClear() })

async function montar(ruta: string[]) {
  const { Erp } = await import('@/components/erp/Erp')
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => { root = createRoot(div); root.render(<Erp ruta={ruta} />) })
}
const pantalla = () => div.querySelector('[data-pantalla]')?.getAttribute('data-pantalla') ?? null

describe('ERP › el armazón propio', () => {
  it('el menú del diseño, con la sección marcada y «Volver al monitor»', async () => {
    await montar(['stock', 'ajustes'])
    const links = [...div.querySelectorAll('nav a')].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Inicio', '/erp'], ['Ventas', '/erp/ventas'], ['Caja (POS)', '/erp/caja'], ['Stock', '/erp/stock'],
      ['Productos y precios', '/erp/productos'], ['Clientes y proveedores', '/erp/clientes'], ['Configuración', '/erp/configuracion'],
      ['Volver al monitor', '/inicio'],
    ])
    expect(div.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Stock')
    expect(div.querySelector('h1')?.textContent).toBe('Stock')
    expect(pantalla()).toBe('AjustesStock')
    expect(replace).not.toHaveBeenCalled()
  })

  it('la pestaña cambia la DIRECCIÓN (se navega sin volver atrás)', async () => {
    await montar(['ventas'])
    expect(pantalla()).toBe('VentasErp')
    const tab = [...div.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Facturación') as HTMLButtonElement
    act(() => tab.click())
    expect(push).toHaveBeenCalledWith('/erp/ventas/facturacion')
  })

  it('una dirección que ⛔ existe se corrige sola', async () => {
    await montar(['stock', 'nada'])
    expect(replace).toHaveBeenCalledWith('/erp/stock/stock')
  })

  it('las dos marcas se eligen desde el menú', async () => {
    await montar([])
    const zattia = [...div.querySelectorAll('[role="radio"]')].find((b) => b.textContent === 'Zattia') as HTMLButtonElement
    act(() => zattia.click())
    expect(setMarca).toHaveBeenCalledWith('zattia')
  })
})
