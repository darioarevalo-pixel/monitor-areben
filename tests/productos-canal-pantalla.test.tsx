// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LIFESPAN_SIN_DATO, type Producto, type VentasCanal } from '@/lib/etl/tipos'

/**
 * **El selector de canal y la pestaña de ganadores, montados de verdad.**
 *
 * Existe porque la pantalla ⛔ no se puede abrir desde acá: la sesión del monitor es el login de
 * Google de Bruno. Lo que se agregó el 17-sep son dos GESTOS —apretar «Mayorista» y cambiar de
 * pestaña— y el tramo entre `conCanal` y la celda dibujada ⛔ lo mira ningún test de núcleo.
 *
 * Mutantes que cayeron (17-sep-2026, 5 de 5):
 *  1. Filtrar sobre `productos` en vez de `enCanal` → las columnas no cambian con el chip.
 *  2. Mostrar «En sale 30d» fuera de «Todos».
 *  3. Calcular vida útil en «Mayorista».
 *  4. BDI arrancando en «Todos».
 *  5. La pestaña de ganadores sin productos.
 */

const canal = (total: number, first: string | null): VentasCanal => ({ total, s7: total, s15: total, s30: total, s90: total, first, last: first })

function prod(id: string, name: string, uMin: number, uMay: number): Producto {
  return {
    id, name, sku: null, proveedor: null, category: 'FUNDAS', retailer_price: 14990, unit_cost: 1456, sinCosto: false,
    margin: null, markup: null, ingresoMes: '2026-09', ingresoFecha: '2026-09-11', diasVivo: 6,
    firstSale: '2026-09-11', lastSale: '2026-09-16', daysSinceLast: 1,
    sales7: uMin + uMay, sales15: uMin + uMay, sales30: uMin + uMay, sales60: 0, sales90: uMin + uMay, totalSales: uMin + uMay,
    monthlySales: [], stock: 300, lifespan: LIFESPAN_SIN_DATO, lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'nuevo', cls: '' },
    ventasMin: canal(uMin, uMin ? '2026-09-15' : null),
    ventasMay: canal(uMay, uMay ? '2026-09-11' : null),
    minOnline: uMin, minLocal: 0,
  }
}

const PRODUCTOS = [prod('1', 'HALFTONE CASE', 8, 388), prod('2', 'CHERRY HEART CASE', 5, 53), prod('3', 'BAMBI CASE', 1, 233)]
const MARCA = { valor: 'bdi' }

vi.mock('@/components/fundas/useDatosMonitor', () => ({
  useDatosMonitor: () => ({
    datos: { allProductos: PRODUCTOS, allVvar: {}, allVariantes: [] },
    error: null, progreso: null, origen: null, linea: null, setLinea: () => {}, lineas: [],
  }),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: MARCA.valor }) }))
vi.mock('@/components/productos/useTnImages', () => ({ useTnImages: () => null, useTnPromo: () => null, asegurarTnPromo: async () => null }))
vi.mock('@/components/liquidacion/useVendidoSale', () => ({ useVendidoSale: () => null }))
vi.mock('@/components/liquidacion/useCampaniaAbierta', () => ({
  useCampaniaAbierta: () => ({ liq: '', yaEstan: {}, abiertas: null, campania: null, error: null, pedirAbiertas: () => {}, entrar: () => {}, salir: () => {}, recargar: () => {} }),
}))
vi.mock('@/components/clavados/useClavados', () => ({ useClavados: () => ({}) }))
vi.mock('@/components/clavados/MarcaClavado', () => ({ MarcaClavado: () => null }))
vi.mock('@/components/destacados/useDestacados', () => ({ useDestacados: () => ({}) }))
vi.mock('@/components/destacados/MarcaEstrella', () => ({ MarcaEstrella: () => null }))
vi.mock('@/components/liquidacion/MandarALiquidacion', () => ({ MandarALiquidacion: () => null }))
vi.mock('@/components/productos/BotonActualizarInventario', () => ({ BotonActualizarInventario: () => null }))

const { ProductosTable } = await import('@/components/productos/ProductosTable')
const { ToastProvider } = await import('@/components/ui/Toast')

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

async function pintar(url = '/productos') {
  window.history.replaceState(null, '', url)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => { root.render(<ToastProvider><ProductosTable /></ToastProvider>) })
  const boton = (texto: string) => {
    const b = [...div.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith(texto))
    if (!b) throw new Error(`no está el botón «${texto}» — la pantalla dice: ${div.textContent?.slice(0, 200)}`)
    return b
  }
  /** Las celdas de la fila de un producto, como texto. */
  const fila = (nombre: string) => {
    const tr = [...div.querySelectorAll('tbody tr')].find((r) => (r.textContent || '').includes(nombre))
    if (!tr) throw new Error(`no está la fila de «${nombre}»`)
    return [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim())
  }
  const encabezados = () => [...div.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim())
  return {
    div, boton, fila, encabezados,
    click: async (el: Element) => { await act(async () => { (el as HTMLElement).click() }) },
    cerrar: async () => { await act(async () => { root.unmount() }); div.remove() },
  }
}

describe('🔑 el selector de canal cambia lo que dice la tabla', () => {
  it('BDI arranca en Minorista: las ventas son las del público y el orden también', async () => {
    const p = await pintar()
    expect(p.boton('Minorista').getAttribute('aria-pressed')).toBe('true')
    // [check, ⭐, foto, producto, última, 7d, 30d, 90d, vida útil, stock, estado] — sin «En sale».
    expect(p.fila('HALFTONE CASE')[6]).toBe('8')
    expect(p.fila('BAMBI CASE')[6]).toBe('1')
    expect(p.encabezados()).not.toContain('En sale 30d')
    const orden = [...p.div.querySelectorAll('tbody tr')].map((r) => r.textContent || '')
    expect(orden[0]).toContain('HALFTONE')
    expect(orden[1]).toContain('CHERRY')
    await p.cerrar()
  })

  it('apretar «Mayorista» muestra el mayorista y la vida útil queda en «—»', async () => {
    const p = await pintar()
    await p.click(p.boton('Mayorista'))
    expect(p.fila('HALFTONE CASE')[6]).toBe('388')
    expect(p.fila('BAMBI CASE')[6]).toBe('233')
    expect(p.fila('HALFTONE CASE')[8]).toBe('—')
    // Y la URL lo recuerda, para compartir el enlace.
    expect(window.location.search).toContain('canal=mayorista')
    await p.cerrar()
  })

  it('«Todos los canales» es el número de siempre, con «En sale» de vuelta', async () => {
    const p = await pintar()
    await p.click(p.boton('Todos los canales'))
    expect(p.fila('HALFTONE CASE')[6]).toBe('396')
    expect(p.encabezados()).toContain('En sale 30d')
    await p.cerrar()
  })

  it('en Zattia arranca en «Todos»: a quien ya la lee no se le mueven los números', async () => {
    MARCA.valor = 'zattia'
    try {
      const p = await pintar()
      expect(p.boton('Todos los canales').getAttribute('aria-pressed')).toBe('true')
      expect(p.fila('HALFTONE CASE')[7]).toBe('396') // con «En sale», la 30d corre una columna
      await p.cerrar()
    } finally {
      MARCA.valor = 'bdi'
    }
  })
})

describe('🔑 la pestaña «Ganadores por tanda»', () => {
  it('abre, dice qué ranking manda y ordena por él', async () => {
    const p = await pintar()
    await p.click(p.boton('Ganadores por tanda'))
    const texto = p.div.textContent || ''
    expect(texto).toContain('Alta 11 Sep 2026 · 3 modelos')
    // 14 u al público contra 3 × 10 = 30 ⇒ manda el mayorista.
    expect(texto).toContain('Ordena el mayorista, como anticipo')
    expect(texto).toContain('Público 14 de 30 u')
    const filas = [...p.div.querySelectorAll('tbody tr')].map((r) => r.textContent || '')
    expect(filas.map((f) => f.match(/[A-Z]+ (HEART )?CASE/)?.[0])).toEqual(['HALFTONE CASE', 'BAMBI CASE', 'CHERRY HEART CASE'])
    // CHERRY: 2º en el público, 3º en mayorista ⇒ ▲ 1.
    expect(filas[2]).toContain('▲ 1')
    await p.cerrar()
  })

  it('la pestaña ⛔ depende del chip: con «Mayorista» apretado el público sigue siendo el público', async () => {
    const p = await pintar('/productos?canal=mayorista&vista=ganadores')
    expect(p.div.textContent).toContain('Público 14 de 30 u')
    await p.cerrar()
  })
})
