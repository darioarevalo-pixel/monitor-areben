// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/** **ERP › Productos › Vincular, del lado de la pantalla.** El oráculo es lo que se LEE y lo que se MANDA. */

const fila = (variant_id: number, producto: string, valores: string[], stock: number | null, publicado = true) => ({ variant_id, producto, publicado, valores, sku: null, barcode: null, stock })
const datos = {
  sin_par: [fila(1, 'OCULTA', ['iPhone 15'], 9, false), fila(2, 'MAG CASE', ['iPhone 18 Pro'], 3)],
  trabados: [{ product_id: 7, size_id: 70, nombre: 'CAMISA TAOS · S', variantes: [fila(3, 'CAMISA TAOS', ['S', 'Bordo'], 0)] }],
  elegidas: [{ ...fila(4, 'TWIST CASE', ['iPhone 16'], 1), product_id: 8, size_id: 80, nombre: 'TWIST · iPhone 16', usuario: 'Bruno', actualizado_en: '2026-11-03T12:00:00Z' }],
}
const leerVinculos = vi.fn(async () => datos)
const buscarVariantesVinculo = vi.fn(async () => ({ variantes: [{ product_id: 5, size_id: 50, producto: 'MAG CASE', talle: 'iPhone 17 Pro', sku: 'F-1', barcode: null }] }))
const ponerVinculo = vi.fn(async () => ({ ok: true, vinculadas: 2 }))
vi.mock('@/lib/erp/cliente', () => ({
  leerVinculos: (...a: unknown[]) => leerVinculos(...(a as [])),
  buscarVariantesVinculo: (...a: unknown[]) => buscarVariantesVinculo(...(a as [])),
  ponerVinculo: (...a: unknown[]) => ponerVinculo(...(a as [])),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno' } }) }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

async function montar() {
  const { VincularTN } = await import('@/components/erp/productos/VincularTN')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<VincularTN />) })
}
const texto = () => document.body.textContent ?? ''
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined
const filaDe = (t: string) => [...document.querySelectorAll('b')].find((b) => b.textContent === t) as HTMLElement
const esperar = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

describe('Vincular (pantalla)', () => {
  it('lee la tienda de la marca y muestra primero lo publicado', async () => {
    await montar()
    expect(leerVinculos).toHaveBeenCalledWith('bdi', 'bdi')
    const t = texto()
    expect(t.indexOf('MAG CASE')).toBeGreaterThan(-1)
    expect(t.indexOf('MAG CASE')).toBeLessThan(t.indexOf('OCULTA'))
  })

  it('cada vista muestra lo suyo', async () => {
    await montar()
    await act(async () => { boton('Repetidas')?.click() })
    expect(texto()).toContain('CAMISA TAOS · S')
    await act(async () => { boton('Elegidas acá')?.click() })
    expect(texto()).toContain('TWIST · iPhone 16')
    expect(texto()).toContain('Bruno')
  })

  it('elegir y guardar manda las dos variantes, y vuelve a leer', async () => {
    await montar()
    await act(async () => { filaDe('MAG CASE').click() })
    expect(boton('Guardar')?.disabled).toBe(true)
    await esperar(300)
    expect(buscarVariantesVinculo).toHaveBeenCalledWith('bdi', 'bdi', 'MAG CASE')
    await act(async () => { (document.querySelector('[role="option"]') as HTMLElement).click() })
    await act(async () => { boton('Guardar')?.click() })
    expect(ponerVinculo).toHaveBeenCalledWith({ marca: 'bdi', tienda: 'bdi', variant_id: 2, product_id: 5, size_id: 50 })
    expect(leerVinculos).toHaveBeenCalledTimes(2)
    expect(texto()).toContain('y 1 más')
  })

  it('lo que frena el motor se lee en la ventana, y la ventana queda abierta', async () => {
    ponerVinculo.mockRejectedValueOnce(new Error('Esa variante ya lleva «CAMISA TAOS S / Blanco»'))
    await montar()
    await act(async () => { filaDe('MAG CASE').click() })
    await esperar(300)
    await act(async () => { (document.querySelector('[role="option"]') as HTMLElement).click() })
    await act(async () => { boton('Guardar')?.click() })
    expect(texto()).toContain('ya lleva «CAMISA TAOS S / Blanco»')
    expect(boton('Guardar')).toBeDefined()
  })
})
