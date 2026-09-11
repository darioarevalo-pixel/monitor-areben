// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ListaDePrecios, PrecioItem } from '@/lib/precios/tipos'

/**
 * **El gesto de abrir el desglose de stock, ejercido de verdad.**
 *
 * 🔴 **Esto existe porque no puedo abrir la pantalla en producción** —la credencial del Monitor es
 * de Bruno—, y lo que se agregó el 11-sep es un GESTO: *«cuando apretemos en el producto, que se
 * pueda desplegar el stock con las variantes por talle y color»*. Un gesto ⛔ no lo prueba ningún
 * test de núcleo: se prueba clickeando.
 *
 * Y tiene una trampa que **se ve como «no anda»** en vez de como un error: la fila entera abre, y
 * adentro hay tres cosas que también se clickean —la ⭐, la foto y el propio número de stock—. Sin
 * `stopPropagation`, apretar el número dispara **el botón y la fila**, o sea que abre y cierra en
 * el mismo click.
 *
 * Los mutantes que tienen que caer:
 *
 *  1. Sacarle el `stopPropagation` al número de stock → abre y cierra en el mismo click.
 *  2. Sacárselo a la foto → mirar la foto abre el desglose.
 *  3. Sacárselo a la ⭐ → marcar una estrella abre el desglose.
 *  4. Poner el `onClick` de la fila sin mirar `tieneVariantes` → el producto sin talles "se abre"
 *     y muestra un panel vacío.
 */

const ITEMS: PrecioItem[] = [
  {
    pid: '1', nombre: 'CORSET FRANK', sku: '7830', imagen: 'https://x/foto.jpg',
    precioLista: 18990, precio: 8990, pctDesc: 53, firme: true, stock: 121, estrella: false,
    variantes: [
      { nombre: 'Bordó - S', por: { Local: 3, Deposito: 51 }, total: 54 },
      { nombre: 'Verde - S', por: { Local: 5, Deposito: 48 }, total: 53 },
      { nombre: 'Negro - XS', por: { Local: 0, Deposito: 0 }, total: 0 },
    ],
  },
  {
    pid: '2', nombre: 'ACCESORIO SIN TALLES', sku: null, imagen: null,
    precioLista: 5990, precio: 1990, pctDesc: 67, firme: false, stock: 34, estrella: false,
    variantes: [{ nombre: 'Variante Única', por: { Local: 34 }, total: 34 }],
  },
]

const LISTA: ListaDePrecios = {
  campania: { id: 'lX', nombre: 'Feria de prueba', desde: '2026-09-14', hasta: '2026-09-19', nota: null, n: 2 },
  items: ITEMS,
  tiendas: ['Local', 'Deposito'],
  leidoEn: '2026-09-11T09:00:00Z',
}

vi.mock('@/lib/precios/persistencia', () => ({
  leerCampaniasCompartidas: vi.fn(async () => [LISTA.campania]),
  leerListaDePrecios: vi.fn(async () => LISTA),
}))

// La ⭐ pega a su propio recurso; acá sólo importa que el botón exista y que su click no abra nada.
vi.mock('@/components/destacados/useDestacados', () => ({
  useDestacados: () => ({ porProducto: new Map(), cargando: false, error: null, alternar: async () => {} }),
}))

const { Precios } = await import('@/components/precios/Precios')
const { SesionProvider } = await import('@/components/SesionProvider')
const { ToastProvider } = await import('@/components/ui/Toast')

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

/** Monta la pantalla y devuelve con qué jugar. El `unmount` lo hace cada test al terminar. */
async function pintar() {
  window.history.replaceState(null, '', '/precios')
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Precios /></ToastProvider></SesionProvider>)
  })
  const filaDe = (nombre: string) => {
    const tr = [...div.querySelectorAll('tbody tr')].find((r) => (r.textContent || '').includes(nombre))
    if (!tr) throw new Error(`no está la fila de «${nombre}» — la pantalla dice: ${div.textContent?.slice(0, 200)}`)
    return tr as HTMLElement
  }
  const click = async (el: Element | null | undefined) => {
    if (!el) throw new Error('no está el elemento que se quería clickear')
    await act(async () => { (el as HTMLElement).click() })
  }
  return {
    div,
    filaDe,
    click,
    /** El desglose se reconoce por su encabezado, que ⛔ no está en ninguna otra parte. */
    abierto: () => (div.textContent || '').includes('Talle y color'),
    cerrar: async () => { await act(async () => { root.unmount() }); div.remove() },
  }
}

describe('🔑 apretar el producto abre el stock por talle y color', () => {
  it('la fila del producto lo abre', async () => {
    const p = await pintar()
    expect(p.abierto()).toBe(false)
    await p.click(p.filaDe('CORSET FRANK'))
    expect(p.abierto()).toBe(true)
    // Y muestra lo que tiene que mostrar: los talles, y las dos tiendas como columnas.
    expect(p.div.textContent).toContain('Bordó - S')
    expect(p.div.textContent).toContain('Deposito')
    await p.cerrar()
  })

  it('y volver a apretarla lo cierra', async () => {
    const p = await pintar()
    await p.click(p.filaDe('CORSET FRANK'))
    await p.click(p.filaDe('CORSET FRANK'))
    expect(p.abierto()).toBe(false)
    await p.cerrar()
  })

  it('🔴 el NÚMERO de stock también lo abre, y ⛔ no se abre y se cierra en el mismo click', async () => {
    // El defecto de los dos handlers apilados. Sin `stopPropagation` esto da `false` y se lee
    // como «el botón no anda».
    const p = await pintar()
    const boton = p.filaDe('CORSET FRANK').querySelector('button[aria-expanded]')
    await p.click(boton)
    expect(p.abierto()).toBe(true)
    await p.cerrar()
  })

  it('🔴 mirar la FOTO ⛔ no abre el desglose', async () => {
    const p = await pintar()
    const foto = p.filaDe('CORSET FRANK').querySelector('button[aria-label^="Ver la foto"]')
    await p.click(foto)
    expect(p.abierto()).toBe(false)
    await p.cerrar()
  })

  it('🔴 marcar la ⭐ ⛔ no abre el desglose', async () => {
    const p = await pintar()
    const estrella = p.filaDe('CORSET FRANK').querySelector('button[aria-pressed]')
    await p.click(estrella)
    expect(p.abierto()).toBe(false)
    await p.cerrar()
  })

  it('🔴 un producto SIN talles ⛔ no se abre ni invita a apretarlo', async () => {
    const p = await pintar()
    const fila = p.filaDe('ACCESORIO SIN TALLES')
    // Primero: la fila SE VE. Sin esto el test pasaría por no estar dibujada.
    expect(fila.textContent).toContain('ACCESORIO SIN TALLES')
    expect(fila.style.cursor).not.toBe('pointer')
    await p.click(fila)
    expect(p.abierto()).toBe(false)
    await p.cerrar()
  })

  it('las variantes en CERO se pliegan, y se pueden abrir', async () => {
    const p = await pintar()
    await p.click(p.filaDe('CORSET FRANK'))
    expect(p.div.textContent).not.toContain('Negro - XS')
    const mas = [...p.div.querySelectorAll('button')].find((b) => (b.textContent || '').includes('sin unidades'))
    await p.click(mas)
    expect(p.div.textContent).toContain('Negro - XS')
    await p.cerrar()
  })
})
