// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renglones } from '@/lib/caja/core.core.js'
import { CLAVE_MAIL, CLAVE_VISTA, enmascarar, leerMail, leerVista, vistaParaCliente } from '@/lib/caja/pantalla-cliente'

/**
 * La pantalla de la clienta (rediseño, fase 3). El oráculo: los números que ve la clienta son los del
 * POS —las `filas` de `renglones()` del núcleo y el `cobro`— ⛔ recalculados. A mano: 1 × $20.000 con 10%
 * + 2 × $12.000 = $18.000 + $24.000 = $42.000; con $2.000 de descuento a la venta, a pagar $40.000.
 */
vi.mock('@/lib/caja/cliente', () => ({ leerConfig: () => Promise.reject(new Error('sin red')) }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const disco = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => disco.get(k) ?? null,
  setItem: (k: string, v: string) => void disco.set(k, v),
  removeItem: (k: string) => void disco.delete(k),
  clear: () => disco.clear(),
})

const carrito = [
  { nombre: 'BLAZER NEREA', talle: 'M', color: 'CHOCOLATE', cantidad: 1, precio: 20000, foto: null },
  { nombre: 'TOP MORA', talle: 'S', cantidad: 2, precio: 12000, foto: null },
]
const filas = renglones([
  { product_id: 1, size_id: 1, cantidad: 1, precio: 20000, rebaja: { tipo: 'pct', valor: 10 } },
  { product_id: 2, size_id: 2, cantidad: 2, precio: 12000 },
])

describe('vistaParaCliente', () => {
  it('sin cobro elegido: los importes del núcleo, el descuento a la venta y el total a pagar', () => {
    const v = vistaParaCliente({ carrito, filas, aPagar: 40000, cobro: null, medio: 'Efectivo', email: '', ultima: null })
    expect(v.estado).toBe('compra')
    if (v.estado !== 'compra') return
    expect(v.renglones.map((r) => [r.lista, r.importe])).toEqual([
      [20000, 18000],
      [24000, 24000],
    ])
    expect(v.prendas).toBe(3)
    expect(v.subtotal).toBe(42000)
    expect(v.descuentoVenta).toBe(2000)
    expect(v.total).toBe(40000)
    // Sin cobro ⛔ se dice con qué paga.
    expect(v.medio).toBeNull()
  })

  it('con el cobro: el total y el descuento de la forma de pago son los del cobro, ⛔ recalculados', () => {
    const cobro = { total: 34000, pagos: [{ descuento: 6000, redondeo: 0 }] }
    const v = vistaParaCliente({ carrito, filas, aPagar: 40000, cobro, medio: 'Efectivo', email: 'ana@mail.com', ultima: null })
    if (v.estado !== 'compra') throw new Error('esperaba compra')
    expect(v.total).toBe(34000)
    expect(v.descuentoMedio).toBe(6000)
    expect(v.medio).toBe('Efectivo')
    expect(v.email).toBe('ana@mail.com')
  })

  it('carrito vacío: bienvenida, o gracias si se acaba de cobrar', () => {
    expect(vistaParaCliente({ carrito: [], filas: null, aPagar: null, cobro: null, medio: null, email: '', ultima: null })).toEqual({ estado: 'vacio' })
    expect(vistaParaCliente({ carrito: [], filas: null, aPagar: null, cobro: null, medio: null, email: '', ultima: { numero: 30051, email: 'ana@mail.com' } })).toEqual({
      estado: 'gracias',
      numero: 30051,
      email: 'ana@mail.com',
    })
  })

  it('lo publicado roto ⛔ revienta la pantalla, y el mail se enmascara', () => {
    expect(leerVista('{no es json')).toEqual({ estado: 'vacio' })
    expect(leerVista(JSON.stringify({ estado: 'compra' }))).toEqual({ estado: 'vacio' })
    expect(leerMail(null)).toBeNull()
    expect(enmascarar('anabella@gmail.com')).toBe('anab••••@gmail.com')
  })
})

describe('CajaCliente', () => {
  let raiz: Root
  let caja: HTMLDivElement
  beforeEach(() => {
    disco.clear()
    caja = document.createElement('div')
    document.body.appendChild(caja)
    raiz = createRoot(caja)
  })
  afterEach(() => {
    act(() => raiz.unmount())
    caja.remove()
  })

  it('muestra la compra publicada por el POS y le devuelve el mail', async () => {
    const { CajaCliente } = await import('@/components/caja/CajaCliente')
    disco.set(CLAVE_VISTA, JSON.stringify(vistaParaCliente({ carrito, filas, aPagar: 40000, cobro: null, medio: null, email: '', ultima: null })))
    await act(async () => raiz.render(<CajaCliente />))
    const t = caja.textContent ?? ''
    expect(t).toContain('Tu compra · 3 prendas')
    expect(t).toContain('BLAZER NEREA')
    expect(t).toContain('$40.000')
    // El renglón: «color · talle · ×n».
    expect(t).toContain('Chocolate · M')
    expect(t).toContain('S · ×2')

    const input = caja.querySelector('input[type=email]') as HTMLInputElement
    const escribir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      escribir.call(input, 'ana')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const gmail = [...caja.querySelectorAll('button')].find((b) => b.textContent === '@gmail.com')!
    await act(async () => gmail.click())
    // La casilla de novedades viene tildada; destildada, viaja junto al mail.
    const novedades = caja.querySelector('input[type=checkbox]') as HTMLInputElement
    expect(novedades.checked).toBe(true)
    await act(async () => novedades.click())
    const enviar = [...caja.querySelectorAll('button')].find((b) => b.textContent === 'Enviar')!
    await act(async () => enviar.click())
    expect(leerMail(disco.get(CLAVE_MAIL) ?? null)).toMatchObject({ email: 'ana@gmail.com', no: false, novedades: false })
  })

  it('se entera de cada cambio del POS (evento storage)', async () => {
    const { CajaCliente } = await import('@/components/caja/CajaCliente')
    await act(async () => raiz.render(<CajaCliente />))
    expect(caja.textContent).toContain('Te damos la bienvenida')
    const nuevo = JSON.stringify(vistaParaCliente({ carrito: [], filas: null, aPagar: null, cobro: null, medio: null, email: '', ultima: { numero: 30051, email: null } }))
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_VISTA, newValue: nuevo })))
    expect(caja.textContent).toContain('¡Gracias por tu compra!')
    expect(caja.textContent).toContain('Venta #30051')
    expect(caja.textContent).toContain('Seguinos en @zattia_co')
  })
})
