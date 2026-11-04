// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { REGLAS_INICIALES } from '@/lib/caja/core.core.js'

/**
 * La pantalla del tótem (rediseño, fase 4): escanear ⇒ la prenda con su precio en efectivo y sus
 * talles; un código que no existe ⇒ «No encontramos esta prenda»; todo sin stock ⇒ lo dice y ⛔ muestra
 * precio. Oráculo: $18.900 en efectivo = $16.100 (15 % y redondeo a $100, ver `caja-totem.test.ts`).
 */
const BLAZER = { product_id: 5, size_id: 2, product_name: 'BLAZER NEREA', size_name: 'M', sku: 'RBT-0137', barcode: '7790001' }
const stockDe: Record<string, number> = { S: 0, M: 3, L: 1 }
let todoSinStock = false
let cargadas: object[] = []
let stockCaido = false
let stockPendiente = false
let pedidosDeStock = 0

vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', setMarca: () => {} }) }))
vi.mock('@/components/fundas/useDatosMonitor', () => ({ useDatosMonitor: () => ({ datos: { allProductos: [{ id: 5 }], allVariantes: cargadas } }) }))
vi.mock('@/components/productos/useTnImages', () => ({ useTnPromo: () => ({}) }))
vi.mock('@/lib/etiquetas/core', () => ({ construirPrecios: () => ({ precios: { 5: 18900 }, fueraDeTn: new Set() }) }))
vi.mock('@/lib/tn', () => ({ imagenDe: () => null, imagenesDe: () => ['tienda-2.jpg'], matchTn: () => null }))
vi.mock('@/lib/tn-audit', () => ({
  traerAudit: () =>
    Promise.resolve([
      { id: 1, name: 'BLAZER NEREA', imagenes: [{ id: 1, src: 'negro.jpg' }, { id: 2, src: 'atras.jpg' }], variantes: [{ sku: 'RBT-0137', color: 'NEGRO', image_url: 'negro.jpg' }, { sku: 'RBT-0138', color: 'CHOCOLATE', image_url: null }] },
    ]),
}))
vi.mock('@/lib/caja/cliente', () => ({
  elegirVariante: () => Promise.resolve({ variante: BLAZER, stock: { local: 3, deposito: 5, fuente: 'vivo', atras: ['A1', 'A2'] } }),
  leerConfig: () => Promise.resolve({ reglas: REGLAS_INICIALES, politica_cambio: null, ticket_logo: null }),
  buscarProducto: (codigo: string) =>
    codigo === BLAZER.barcode ? Promise.resolve({ variante: BLAZER, stock: { local: 3, deposito: 0, fuente: 'vivo' } }) : codigo === 'CAIDO' ? Promise.reject(Object.assign(new Error('Gestión Nube no contestó'), { status: 502 }))
      : Promise.reject(Object.assign(new Error('El código no está en el inventario.'), { status: 404 })),
  stockEnVivo: () => {
    pedidosDeStock++
    if (stockCaido) return Promise.reject(new Error('Gestión Nube contestó 429'))
    if (stockPendiente) return new Promise(() => {})
    return Promise.resolve({ variantes: ['S', 'M', 'L'].map((t, i) => ({ ...BLAZER, size_id: i + 1, size_name: t, local: todoSinStock ? 0 : stockDe[t] })) })
  },
  buscarNombre: () =>
    Promise.resolve({
      conStock: [{ product_id: 5, product_name: 'BLAZER NEREA', local: 4, variantes: ['S', 'M', 'L'].map((t) => ({ ...BLAZER, size_name: t, local: todoSinStock ? 0 : stockDe[t] })) }],
      sinStock: [],
      masCon: 0,
      masSin: 0,
    }),
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let raiz: Root
let caja: HTMLDivElement
beforeEach(() => {
  todoSinStock = false
  cargadas = []
  stockCaido = false
  stockPendiente = false
  pedidosDeStock = 0
  caja = document.createElement('div')
  document.body.appendChild(caja)
  raiz = createRoot(caja)
})
afterEach(() => {
  act(() => raiz.unmount())
  caja.remove()
})

async function escanear(codigo: string) {
  const { CajaTotem } = await import('@/components/caja/CajaTotem')
  await act(async () => raiz.render(<CajaTotem />))
  const input = caja.querySelector('input[aria-label="Código de la prenda"]') as HTMLInputElement
  const escribir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    escribir.call(input, codigo)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  return caja.textContent ?? ''
}

describe('CajaTotem', () => {
  it('muestra la prenda y el precio sin afirmar stock hasta confirmarlo', async () => {
    stockPendiente = true
    cargadas = ['S', 'M'].map((size, i) => ({ pid: '5', sid: String(i + 1), name: 'BLAZER NEREA', size, local: 0, sku: `RBT-${i}`, barcode: `77900${i}` }))
    const t = await escanear('779000')
    expect(t).toContain('BLAZER NEREA')
    expect(t).toContain('16.100')
    expect(t).toContain('Confirmando stock')
    expect(t).not.toContain('Sin stock en el local')
    expect(caja.querySelector('span[style*="line-through"]')).toBeNull()
  })

  it('el stock confirmado manda sobre el cargado: en 0 lo cargado, con stock en vivo', async () => {
    cargadas = [{ pid: '5', sid: '2', name: 'BLAZER NEREA', size: 'M', local: 0, sku: 'RBT-1', barcode: '779001' }]
    const t = await escanear('779001')
    expect(t).not.toContain('Confirmando stock')
    expect(t).not.toContain('Sin stock en el local')
    expect(pedidosDeStock).toBe(1)
  })

  it('si no se puede confirmar, reintenta una vez, lo dice y no afirma stock', async () => {
    stockCaido = true
    cargadas = [{ pid: '5', sid: '2', name: 'BLAZER NEREA', size: 'M', local: 7, sku: 'RBT-1', barcode: '779001' }]
    await escanear('779001')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1_600))
    })
    expect(pedidosDeStock).toBe(2)
    expect(caja.textContent).toContain('No se pudo confirmar el stock')
    expect(caja.textContent).toContain('16.100')
  })

  it('un código ya cargado muestra la prenda sin ir al servidor (`buscarProducto` contesta 404 a este)', async () => {
    cargadas = [{ pid: '5', sid: '9', name: 'BLAZER NEREA', size: 'M', local: 2, sku: 'RBT-0999', barcode: '7790099' }]
    const t = await escanear('7790099')
    expect(t).toContain('BLAZER NEREA')
    expect(t).toContain('16.100')
  })

  it('espera con «Escaneá una prenda»', async () => {
    const { CajaTotem } = await import('@/components/caja/CajaTotem')
    await act(async () => raiz.render(<CajaTotem />))
    expect(caja.textContent).toContain('Escaneá una prenda para ver su precio')
  })

  it('una prenda: nombre, talles del local, lista y efectivo del núcleo', async () => {
    const t = await escanear('7790001')
    expect(t).toContain('BLAZER NEREA')
    expect(t).toContain('Talles en el local')
    expect(t).toContain('$18.900')
    expect(t).toContain('$16.100')
    expect(t).toContain('Ahorrás $2.800')
    // Con las reglas iniciales transferencia es 10 % ⇒ ⛔ «o transferencia».
    expect(t).toContain('En efectivo')
    expect(t).not.toContain('o transferencia')
    // La fila de colores del audit de TN, y la foto del color escaneado.
    expect(t).toContain('Negro')
    expect(t).toContain('Chocolate')
    expect(caja.querySelector('img')?.getAttribute('src')).toBe('negro.jpg')
    const s = [...caja.querySelectorAll('span')].find((x) => x.textContent === 'S')!
    expect(s.style.textDecoration).toBe('line-through')
  })

  it('muestra los DOS precios y la galería avanza con las flechas, empezando por la foto del color', async () => {
    const t = await escanear('7790001')
    expect(t).toContain('Con transferencia')
    expect(t).toContain('$17.000')
    const foto = () => caja.querySelector('img')?.getAttribute('src')
    expect(foto()).toBe('negro.jpg')
    const siguiente = caja.querySelector('button[aria-label="Foto siguiente"]') as HTMLButtonElement
    await act(async () => siguiente.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(foto()).toBe('atras.jpg')
    await act(async () => siguiente.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(foto()).toBe('tienda-2.jpg')
    await act(async () => siguiente.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(foto()).toBe('negro.jpg')
  })

  it('tocar un color cambia la foto y lo marca', async () => {
    await escanear('7790001')
    const blanco = [...caja.querySelectorAll('button')].find((b) => b.textContent?.includes('Negro')) as HTMLButtonElement
    expect(blanco.getAttribute('aria-pressed')).toBe('true')
    const siguiente = caja.querySelector('button[aria-label="Foto siguiente"]') as HTMLButtonElement
    await act(async () => siguiente.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(caja.querySelector('img')?.getAttribute('src')).toBe('atras.jpg')
    await act(async () => blanco.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(caja.querySelector('img')?.getAttribute('src')).toBe('negro.jpg')
    const chocolate = [...caja.querySelectorAll('button')].find((b) => b.textContent?.includes('Chocolate')) as HTMLButtonElement
    await act(async () => chocolate.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(chocolate.getAttribute('aria-pressed')).toBe('true')
    expect(blanco.getAttribute('aria-pressed')).toBe('false')
  })

  async function pasar(codigo: string) {
    const input = caja.querySelector('input[aria-label="Código de la prenda"]') as HTMLInputElement
    const escribir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      escribir.call(input, codigo)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    return caja.textContent ?? ''
  }

  it('la tarjeta con una prenda en pantalla muestra su ubicación; sin tarjeta, la clienta ⛔ la ve', async () => {
    expect(await escanear('7790001')).not.toContain('Ubicación en depósito')
    const t = await pasar('encargada')
    expect(t).toContain('BLAZER NEREA')
    expect(t).toContain('Ubicación en depósito')
    expect(t).toContain('A1 · A2')
    expect(t).toContain('5 en depósito')
  })

  it('la tarjeta sin prenda espera la próxima, y a la siguiente ya ⛔ vale', async () => {
    expect(await escanear('ENCARGADA')).toContain('Escaneá la prenda para ver su ubicación')
    expect(await pasar('7790001')).toContain('A1 · A2')
    expect(await pasar('7790001')).not.toContain('A1 · A2')
  })

  it('modo prueba (`?prueba=1`): la entrada se ve y un nombre lleva a la lista y a la prenda', async () => {
    window.history.pushState({}, '', '/pos/totem?prueba=1')
    try {
      const t = await escanear('blazer')
      expect(t).not.toContain('No encontramos esta prenda')
      const input = caja.querySelector('input[aria-label="Código de la prenda"]') as HTMLInputElement
      expect(input.style.opacity).toBe('')
      const boton = [...caja.querySelectorAll('button')].find((b) => b.textContent?.includes('BLAZER NEREA'))!
      await act(async () => {
        boton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
      })
      expect(caja.textContent).toContain('$16.100')
    } finally {
      window.history.pushState({}, '', '/')
    }
  })

  it('sin modo prueba, un nombre ⛔ busca y la entrada sigue invisible', async () => {
    expect(await escanear('blazer')).toContain('No encontramos esta prenda')
    const input = caja.querySelector('input[aria-label="Código de la prenda"]') as HTMLInputElement
    expect(input.style.opacity).toBe('0')
    expect(caja.querySelector('button')).toBeNull()
  })

  it('un código que no existe', async () => {
    expect(await escanear('000')).toContain('No encontramos esta prenda')
  })

  it('robustez: GN caído ⛔ dice «no encontramos»: dice que no se pudo consultar', async () => {
    const t = await escanear('CAIDO')
    expect(t).toContain('No pudimos consultar el precio')
    expect(t).not.toContain('No encontramos esta prenda')
  })

  it('todo sin stock en el local: lo dice, ⛔ muestra precio', async () => {
    todoSinStock = true
    const t = await escanear('7790001')
    expect(t).toContain('Sin stock en el local')
    expect(t).not.toContain('$16.100')
  })
})
