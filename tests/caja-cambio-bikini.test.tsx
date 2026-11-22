// @vitest-environment jsdom
/**
 * 🩱 El cambio de una bikini EN PANTALLA (`useCambio`, lo usan el POS y ERP › Caja; Bruno 21/22-nov): devolver una parte pregunta si
 * vuelve la bikini completa o cambia el talle de esa parte; la parte sola sale a lo que vale en la bikini; lo que se lleva de una bikini
 * sale entero; y la regla del motor (`conjuntoIncompleto`) frena el cobro antes del 409. Lo que no se ve si falla: la cajera arma un
 * cambio que el servidor rechaza recién al confirmar, o la parte sale «sin precio» (en TN ⛔ existe sola).
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useCambio, ventaDeFicha, type Cambio } from '@/components/caja/useCambio'
import type { Config } from '@/lib/caja/cliente'
import type { FichaDeVenta } from '@/lib/erp/cliente'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const kit = (vid: number, cs: number, bs: number) => ({
  variant_id: vid, nombre: 'Bikini MADDIE · Camo', precio: 49990,
  piezas: [
    { n: 1, product_id: 100, size_id: cs, cantidad: 1, precio: 30000, nombre: `CORPIÑO MADDIE CAMO · ${cs}`, producto: 'CORPIÑO MADDIE CAMO', talle: String(cs) },
    { n: 2, product_id: 200, size_id: bs, cantidad: 1, precio: 19990, nombre: `BOMBACHA MADDIE CAMO · ${bs}`, producto: 'BOMBACHA MADDIE CAMO', talle: String(bs) },
  ],
})
const config = { conjuntos: [kit(901, 1, 1), kit(902, 1, 2), kit(903, 2, 1), kit(904, 2, 2)], reglas: { redondeo: 100, cuentas: {} }, politica_cambio: null } as unknown as Config
const linea = (id: string, pid: number, sid: number, importe: number) => ({ id, n: 1, producto: String(pid), talle: String(sid), nombre: pid === 100 ? 'CORPIÑO MADDIE CAMO' : 'BOMBACHA MADDIE CAMO', talleNombre: String(sid), sku: null, cantidad: 1, precio: importe, descuento: 0, rebaja: 0, importe, devuelta: false, lineaOrigenId: null, cambiado: 0, codigo: null })
/** La venta: la bikini 902 (corpiño S=1 + bombacha M=2). */
const ficha = {
  venta: { id: 'v1', numero: 15, prueba: false, gnSaleId: null, marca: 'zattia', total: 49990 },
  cliente: null,
  lineas: [linea('c', 100, 1, 30000), linea('b', 200, 2, 19990)],
  conjuntos: [{ variant_id: 902, nombre: 'Bikini MADDIE · Camo', cantidad: 1, piezas: [{ product_id: 100, size_id: 1, cantidad: 1 }, { product_id: 200, size_id: 2, cantidad: 1 }] }],
} as unknown as FichaDeVenta
const v = (pid: number, sid: number) => ({ product_id: pid, size_id: sid, product_name: pid === 100 ? 'CORPIÑO MADDIE CAMO' : 'BOMBACHA MADDIE CAMO', size_name: String(sid), sku: null, barcode: null })

function montar() {
  const ref: { c: Cambio | null } = { c: null }
  function Prueba() {
    ref.c = useCambio({ store: 'zattia', config, precioDe: () => null, esStunned: () => false })
    return null
  }
  const raiz = createRoot(document.createElement('div'))
  act(() => raiz.render(<Prueba />))
  const hacer = (fn: (c: Cambio) => void) => act(() => fn(ref.c as Cambio))
  hacer((c) => c.elegirVenta(ventaDeFicha(ficha)))
  return { get c() { return ref.c as Cambio }, hacer }
}

describe('🩱 el cambio de una bikini en pantalla', () => {
  it('la ficha marca las partes de la bikini', () => {
    const t = montar()
    expect(t.c.vendidas.map((l) => l.bikini?.nombre)).toEqual(['Bikini MADDIE · Camo', 'Bikini MADDIE · Camo'])
  })

  it('devolver una parte PREGUNTA; «la bikini completa» suma la otra parte', () => {
    const t = montar()
    t.hacer((c) => c.cambiarCantidadDevuelta('c', 1))
    expect(t.c.preguntaBikini).toMatchObject({ tipo: 'devuelve', nombre: 'Bikini MADDIE · Camo' })
    t.hacer((c) => c.devolverBikiniCompleta())
    expect(t.c.devueltas.map((d) => [d.clave, d.cantidad])).toEqual([['c', 1], ['b', 1]])
    expect(t.c.preguntaBikini).toBeNull()
    expect(t.c.problemaBikini).toBeNull()
  })

  it('«cambia el talle de esta parte»: sin llevarse nada, frena con la regla del motor; con el corpiño M sale solo, a lo que vale la parte', () => {
    const t = montar()
    t.hacer((c) => c.cambiarCantidadDevuelta('c', 1))
    t.hacer((c) => c.devolverSoloLaParte())
    expect(t.c.devueltas).toHaveLength(1)
    expect(t.c.problemaBikini).toMatch(/una parte sola se cambia sólo por otro talle/)
    t.hacer((c) => c.sumarNueva(v(100, 2)))
    expect(t.c.nuevas.map((n) => [n.variante.size_id, n.precio, n.parte])).toEqual([[2, 30000, true]])
    expect(t.c.problemaBikini).toBeNull()
    // Una segunda parte suelta ⛔: vuelve UNA ⇒ la próxima pide la bikini entera.
    t.hacer((c) => c.sumarNueva(v(100, 2)))
    expect(t.c.preguntaBikini).toMatchObject({ tipo: 'lleva' })
  })

  it('lo que se lleva de una bikini sale entero: se elige la otra parte y van atadas (cantidad y sacar, juntas)', () => {
    const t = montar()
    t.hacer((c) => c.cambiarCantidadDevuelta('c', 1))
    t.hacer((c) => c.devolverBikiniCompleta())
    t.hacer((c) => c.sumarNueva(v(200, 2)))
    const p = t.c.preguntaBikini
    expect(p?.tipo === 'lleva' && p.opciones.map((k) => k.variant_id)).toEqual([902, 904])
    t.hacer((c) => c.llevarBikini(config.conjuntos![1 + 2]))
    expect(t.c.nuevas.map((n) => [n.variante.product_id, n.variante.size_id, n.precio, n.conjunto?.variant_id])).toEqual([[100, 2, 30000, 904], [200, 2, 19990, 904]])
    expect(t.c.seLleva).toBe(49990)
    t.hacer((c) => c.cambiarNueva(0, { precio: 1 }))
    expect(t.c.nuevas[0].precio).toBe(30000)
    t.hacer((c) => c.cambiarCantidadNueva(1, 0))
    expect(t.c.nuevas).toEqual([])
  })
})
