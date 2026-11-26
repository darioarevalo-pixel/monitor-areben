// @vitest-environment jsdom
/**
 * 🩱 La bikini EN PANTALLA en un solo renglón (Bruno 26-nov, probando en el local: «las partes no tendrían que tener precio, sino las
 * bikini en general»). Lo que no se ve si falla: la cajera ve dos precios con centavos ($22.319,16 + $27.670,84) en vez de $49.990.
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FilaBikini, type Renglon } from '@/components/caja/partes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const parte = (pid: number, nombre: string, talle: string, precio: number, n: number): Renglon => ({
  variante: { product_id: pid, size_id: 1, product_name: nombre, size_name: talle, sku: null, barcode: null },
  stock: { local: 3, deposito: 0, fuente: 'erp' },
  cantidad: 1, precio, precioLista: precio, fueraDeTn: false, foto: null, rebaja: null,
  conjunto: { variant_id: 901, n, nombre: 'Bikini SERENA · Watermelon' },
})

describe('caja · FilaBikini', () => {
  it('un nombre, un precio de bikini y las partes sólo con talle y stock', async () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const root = createRoot(div)
    let cantidad = 0
    await act(async () => {
      root.render(
        <FilaBikini
          nombre="Bikini SERENA · Watermelon"
          partes={[parte(100, 'CORPIÑO SERENA WATERMELON', 'S', 22319.16, 1), parte(200, 'BOMBACHA SERENA WATERMELON', 'M', 27670.84, 2)]}
          precio={49990}
          importe={44991}
          promos={['Promo bikinis']}
          rebaja={null}
          onCantidad={(n) => { cantidad = n }}
          onRebaja={() => {}}
          onSacar={() => {}}
          avisos={[null, null]}
          mirandoWeb={false}
        />,
      )
    })
    const t = div.textContent ?? ''
    expect(t).toContain('Bikini SERENA · Watermelon')
    expect(t).toContain('Promo bikinis')
    expect(t).toContain('Corpiño S')
    expect(t).toContain('Bombacha M')
    expect(t).not.toMatch(/22\.319|27\.670|CORPIÑO SERENA/) // ⛔ el precio ni el nombre de cada parte
    expect(t).toMatch(/44\.991/)
    expect((div.querySelector('input[aria-label="Precio"]') as HTMLInputElement).value).toBe('49990')
    await act(async () => { (div.querySelector('button[aria-label="Una más"]') as HTMLButtonElement).click() })
    expect(cantidad).toBe(2)
    root.unmount()
  })
})
