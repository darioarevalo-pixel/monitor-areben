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

vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', setMarca: () => {} }) }))
vi.mock('@/components/fundas/useDatosMonitor', () => ({ useDatosMonitor: () => ({ datos: { allProductos: [{ id: 5 }] } }) }))
vi.mock('@/components/productos/useTnImages', () => ({ useTnPromo: () => ({}) }))
vi.mock('@/lib/etiquetas/core', () => ({ construirPrecios: () => ({ precios: { 5: 18900 }, fueraDeTn: new Set() }) }))
vi.mock('@/lib/tn', () => ({ imagenDe: () => null }))
vi.mock('@/lib/tn-audit', () => ({
  traerAudit: () =>
    Promise.resolve([
      { id: 1, name: 'BLAZER NEREA', variantes: [{ sku: 'RBT-0137', color: 'NEGRO', image_url: 'negro.jpg' }, { sku: 'RBT-0138', color: 'CHOCOLATE', image_url: null }] },
    ]),
}))
vi.mock('@/lib/caja/cliente', () => ({
  leerConfig: () => Promise.resolve({ reglas: REGLAS_INICIALES, politica_cambio: null, ticket_logo: null }),
  buscarProducto: (codigo: string) =>
    codigo === BLAZER.barcode ? Promise.resolve({ variante: BLAZER, stock: { local: 3, deposito: 0, fuente: 'vivo' } }) : Promise.reject(new Error('El código no está en el inventario.')),
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

  it('un código que no existe', async () => {
    expect(await escanear('000')).toContain('No encontramos esta prenda')
  })

  it('todo sin stock en el local: lo dice, ⛔ muestra precio', async () => {
    todoSinStock = true
    const t = await escanear('7790001')
    expect(t).toContain('Sin stock en el local')
    expect(t).not.toContain('$16.100')
  })
})
