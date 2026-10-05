// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { VistaTicket, ticketDeMuestra } from '@/components/caja/VistaTicket'
import { armarTicket } from '@/lib/caja/ticket'

/**
 * La vista previa del ticket de la pestaña Caja (rediseño, fase 2): se dibuja con las MISMAS `ops` que
 * imprime `armarTicket`. El oráculo es esa función: la vista tiene que tener cada texto que pone el
 * papel, el logo guardado y la política guardada.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// Un medidor sin jsPDF: cada texto en un renglón.
const medir = (txt: string) => [txt]
const LOGO = { src: 'data:image/png;base64,AAAA', ancho: 400, alto: 200 }

let raiz: Root
let caja: HTMLDivElement
beforeEach(() => {
  caja = document.createElement('div')
  document.body.appendChild(caja)
  raiz = createRoot(caja)
})
afterEach(() => {
  act(() => raiz.unmount())
  caja.remove()
})

describe('VistaTicket', () => {
  it('dibuja cada texto del papel, la política y el logo', () => {
    act(() => raiz.render(<VistaTicket logo={LOGO} politica="Cambios dentro de los 30 días." medidor={medir} />))
    const textos = [...caja.querySelectorAll('text')].map((t) => t.textContent)
    const papel = armarTicket(ticketDeMuestra(LOGO, 'Cambios dentro de los 30 días.'), () => true, Date.now(), medir)
    const delPapel = papel.ops.filter((o) => o.k === 'txt').map((o) => (o as { txt: string }).txt)
    // La fecha cambia de un milisegundo a otro: se compara la cantidad, y los textos fijos uno por uno.
    expect(textos).toHaveLength(delPapel.length)
    for (const t of ['COMPROBANTE', 'TOTAL', 'VUELTO', 'Cambios dentro de los 30 días.', 'Gracias por tu compra!']) expect(textos).toContain(t)
    expect(caja.querySelector('image')?.getAttribute('href')).toBe(LOGO.src)
    // Con logo, ⛔ el nombre de la marca en letras.
    expect(textos).not.toContain('ZATTIA')
  })

  it('sin logo lleva el nombre, y sin política no la inventa', () => {
    act(() => raiz.render(<VistaTicket logo={null} politica={null} medidor={medir} />))
    const textos = [...caja.querySelectorAll('text')].map((t) => t.textContent)
    expect(textos).toContain('ZATTIA')
    expect(caja.querySelector('image')).toBeNull()
    expect(textos).not.toContain('Cambios dentro de los 30 días.')
  })

  it('la muestra cierra: subtotal − descuento = total, y paga con $40.000 da vuelto', () => {
    const t = ticketDeMuestra(null, null)
    expect(t.renglones.reduce((s, r) => s + r.importe, 0)).toBe(t.subtotal)
    expect(t.subtotal - t.pagos[0].descuento).toBe(t.total)
    expect(t.pagos[0].monto).toBe(t.total)
  })
})
