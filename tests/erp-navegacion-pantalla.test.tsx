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
// El local (⛔ admin, sólo Zattia) se prueba cambiando estas dos.
let sesion = { marca: 'bdi', perfil: { name: 'bruno', admin: true } }
let admin = true
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ ...sesion, setMarca }) }))
vi.mock('@/lib/permisos', () => ({ puedeVer: (_p: unknown, m: string) => admin || m === 'zattia', esAdmin: () => admin }))
for (const [archivo, nombre] of [['CambioCaja', 'CambioCaja'], ['FacturaCaja', 'FacturaCaja'], ['Facturacion', 'Facturacion'], ['stock/StockErp', 'StockErp'], ['DiferenciasDia', 'DiferenciasDia'], ['ConciliacionDia', 'ConciliacionDia'], ['AjustesStock', 'AjustesStock'], ['PedidosSinPagar', 'PedidosSinPagar'], ['PreciosProducto', 'PreciosProducto'], ['ReglasComerciales', 'ReglasComerciales'], ['RutasCobro', 'RutasCobro'], ['ventas/VentasErp', 'VentasErp']]) {
  vi.doMock(`@/components/erp/${archivo}`, () => ({ [nombre]: () => <div data-pantalla={nombre} /> }))
}

let root: Root | null = null
const div = document.createElement('div')
document.body.appendChild(div)
afterEach(() => {
  act(() => root?.unmount()); root = null; push.mockClear(); replace.mockClear()
  sesion = { marca: 'bdi', perfil: { name: 'bruno', admin: true } }; admin = true
})

async function montar(ruta: string[]) {
  const { Erp } = await import('@/components/erp/Erp')
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => { root = createRoot(div); root.render(<Erp ruta={ruta} />) })
}
const pantalla = () => div.querySelector('[data-pantalla]')?.getAttribute('data-pantalla') ?? null

describe('ERP › el armazón propio', () => {
  it('el menú del diseño, con la sección marcada y «Volver al monitor»', async () => {
    await montar(['stock', 'ajustes'])
    const links = (nav: string) => [...div.querySelectorAll(`nav.${nav} a`)].map((a) => [a.textContent, a.getAttribute('href')])
    expect(links('erp-menu')).toEqual([
      // 🎨 30-oct (Bruno): menú de grupos; el abierto (Stock) muestra sus ítems con su dirección, y ⛔ hay sección Caja.
      ['Inicio', '/erp'], ['Ventas', '/erp/ventas'], ['Stock', '/erp/stock'],
      ['Stock', '/erp/stock/stock'], ['Transferencias', '/erp/stock/transferencias'], ['Ingresos y ajustes', '/erp/stock/ajustes'], ['Diferencias', '/erp/stock/diferencias'],
      ['Productos y precios', '/erp/productos'], ['Clientes y proveedores', '/erp/clientes'], ['Configuración', '/erp/configuracion'],
      ['Volver al monitor', '/inicio'],
    ])
    // La barra de abajo del celular (ERP en el celular, tanda 1): las 4 primeras; el resto va en «Más».
    expect(links('erp-movil-nav')).toEqual([['Inicio', '/erp'], ['Ventas', '/erp/ventas'], ['Stock', '/erp/stock'], ['Productos', '/erp/productos']]) // en la barra de abajo, corto: el largo se partía en 2 renglones (30-oct)
    expect(div.querySelector('nav.erp-menu a[aria-current="page"]')?.textContent).toBe('Ingresos y ajustes')
    expect(div.querySelector('h1')?.textContent).toBe('Ingresos y ajustes')
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

  it('📱 el cartel «se cambia en la compu» va en Configuración, Facturación y Redondeo, ⛔ en Ventas (tanda 3, 30-oct)', async () => {
    // Se muestra por CSS sólo abajo de 900 px (globals.css § erp-aviso-compu); acá se prueba en qué pantallas está.
    const cartel = () => div.querySelector('.erp-aviso-compu')?.textContent ?? null
    for (const ruta of [['configuracion', 'reglas'], ['ventas', 'facturacion'], ['productos', 'redondeo']]) {
      await montar(ruta)
      expect(cartel(), ruta.join('/')).toContain('se cambia en la compu')
      act(() => root?.unmount()); root = null
    }
    await montar(['ventas'])
    expect(cartel()).toBeNull()
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
  it('el selector ofrece BDI · Zattia · Stunned; Stunned = marca zattia + línea (🎨 27-oct, paso 4)', async () => {
    await montar([])
    const radios = () => [...div.querySelectorAll('[aria-label="Marca"] [role="radio"]')] as HTMLButtonElement[]
    expect(radios().map((b) => b.textContent)).toEqual(['BDI', 'Zattia', 'Stunned'])
    setMarca.mockClear()
    act(() => radios().find((b) => b.textContent === 'Stunned')!.click())
    expect(setMarca).toHaveBeenCalledWith('zattia')
    expect(radios().find((b) => b.textContent === 'Stunned')!.getAttribute('aria-checked')).toBe('false') // la marca de este test sigue siendo bdi
  })
  it('el local (⛔ admin) ve SÓLO Stunned: la línea Zattia queda oculta hasta que Zattia pase al ERP (Bruno, 30-oct)', async () => {
    sesion = { marca: 'zattia', perfil: { name: 'local', admin: false } }; admin = false
    await montar([])
    expect(div.querySelectorAll('[aria-label="Marca"] [role="radio"]')).toHaveLength(0) // una sola opción ⇒ sin selector
    expect(div.querySelector('.erp-movil-marca')?.textContent).toContain('Stunned')
    expect(div.querySelector('.erp-movil-marca')?.textContent).not.toContain('Zattia')
  })
  it('⌘K y el botón «Buscar» abren el buscador global; «?» los atajos; Esc cierra (🎨 26-oct)', async () => {
    await montar(['ventas', 'ventas'])
    const dialogo = () => document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null
    expect(dialogo()).toBeNull()
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })) })
    expect(dialogo()).toBe('Buscar en el ERP')
    act(() => { document.querySelector('[aria-label="Buscar venta, producto o cliente"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(dialogo()).toBeNull()
    act(() => { [...div.querySelectorAll('nav button')].find((b) => b.textContent?.includes('Buscar'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(dialogo()).toBe('Buscar en el ERP')
    act(() => { document.querySelector('[aria-label="Buscar venta, producto o cliente"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })) })
    expect(dialogo()).toBe('Atajos de teclado')
  })
})
