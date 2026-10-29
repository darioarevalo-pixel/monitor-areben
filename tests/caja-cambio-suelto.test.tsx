// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * El CAMBIO SUELTO de Stunned en la pantalla (Bruno, 27-oct): el estado y las cuentas de `useCambio`, que usan el POS (modo «Cambios») y
 * erp › Caja › Cambio. Tres orígenes de lo que se devuelve: venta del ERP, venta de Gestión Nube y sin ticket (PIN de la encargada).
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cambiarVenta = vi.fn()
vi.mock('@/lib/erp/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/erp/cliente')>()),
  cambiarVenta: (...a: unknown[]) => cambiarVenta(...a),
  verificarPin: vi.fn(async () => ({ ok: true, persona: 'ana' })),
  leerSaldo: vi.fn(async () => ({ cliente: null, saldo: 0 })),
}))

const { useCambio, ventaDeGn, ventaDeFicha, claveDePrenda } = await import('@/components/caja/useCambio')
type Cambio = ReturnType<typeof useCambio>

const REMERA = { product_id: 7, size_id: 3, product_name: 'Remera', size_name: 'M', sku: 'STU-REM-M', barcode: null }
const JEAN = { product_id: 9, size_id: 4, product_name: 'Jean', size_name: '40', sku: 'ZAT-JEAN-40', barcode: null }
const OTRA_STU = { product_id: 8, size_id: 3, product_name: 'Buzo', size_name: 'M', sku: 'STU-BUZ-M', barcode: null }
const GN = {
  venta: { id: '30930', numero: '30930', fecha: '2026-09-01T12:00:00Z', cliente: 'Ana', prueba: true },
  lineas: [{ product_id: 7, size_id: 3, sku: 'STU-REM-M', nombre: 'Remera', talle: 'M', cantidad: 2, precio: 15000, cambiado: 0 }],
}

let h: Cambio
function Harness({ prueba = true, alCambio }: { prueba?: boolean; alCambio: (c: Cambio) => void }) {
  const c = useCambio({ store: 'zattia', config: { stunned_erp: true, stunned_prueba: prueba, reglas: null, politica_cambio: null } as never, precioDe: () => 15000, esStunned: (v) => String(v.sku).startsWith('STU') })
  useEffect(() => alCambio(c))
  return null
}

let raiz: Root
beforeEach(() => {
  cambiarVenta.mockReset()
  cambiarVenta.mockResolvedValue({ ok: true, venta: { id: 'v1', numero: 5 }, total: 0, aFavor: 0, saldo: null, ncPendiente: false, yaExistia: false })
  const el = document.createElement('div')
  document.body.appendChild(el)
  raiz = createRoot(el)
})
afterEach(() => {
  act(() => raiz.unmount())
  document.body.innerHTML = ''
})
const montar = () => act(async () => raiz.render(<Harness alCambio={(c) => { h = c }} />))
const hacer = (fn: () => void) => act(async () => void fn())
const error = (fn: () => void) => { try { fn() } catch (e) { return (e as Error).message } return null }

describe('cambio suelto · devolver', () => {
  it('🔑 sin venta: la prenda queda «suelta» con el precio de la etiqueta, y repetirla suma', async () => {
    await montar()
    await hacer(() => h.devolverPrenda(REMERA))
    await hacer(() => h.devolverPrenda(REMERA))
    expect(h.tipo).toBe('suelto')
    expect(h.devueltas).toMatchObject([{ productId: 7, sizeId: 3, cantidad: 2, precio: 15000 }])
    expect(h.vuelve).toBe(30000)
  })

  it('🔴 sin venta sólo se devuelve Stunned', async () => {
    await montar()
    expect(error(() => h.devolverPrenda(JEAN))).toMatch(/Stunned/)
  })

  it('🔴 con la venta de Gestión Nube ⛔ se devuelve de más ni lo que no compró (contando lo ya cambiado)', async () => {
    await montar()
    const g = ventaDeGn({ ...GN, lineas: [{ ...GN.lineas[0], cambiado: 1 }] })
    await hacer(() => h.devolverDeVenta(g, { [claveDePrenda(7, 3)]: 1 }))
    expect(error(() => h.devolverPrenda(REMERA))).toMatch(/ya se devolvieron 1/)
    expect(error(() => h.devolverPrenda(OTRA_STU))).toMatch(/no está en esa venta/)
    expect(h.devueltas[0].cantidad).toBe(1)
  })

  it('⛔ mezcla: con prendas sin venta, no se elige una venta después', async () => {
    await montar()
    await hacer(() => h.devolverPrenda(REMERA))
    expect(error(() => h.devolverDeVenta(ventaDeGn(GN), { [claveDePrenda(7, 3)]: 1 }))).toMatch(/otra venta o sin venta/)
  })

  it('lo que se lleva tiene que ser de Stunned (un cambio es de una marca)', async () => {
    await montar()
    await hacer(() => h.devolverDeVenta(ventaDeGn(GN), { [claveDePrenda(7, 3)]: 1 }))
    expect(error(() => h.sumarNueva(JEAN))).toMatch(/Stunned/)
    await hacer(() => h.sumarNueva(OTRA_STU))
    expect(h.nuevas).toHaveLength(1)
  })

  it('una venta del ERP: la diferencia sale del importe exacto de la línea', async () => {
    await montar()
    const f = ventaDeFicha({
      venta: { id: 'e1', numero: 802, marca: 'stunned', prueba: true, gnSaleId: null, total: 10000 },
      cliente: { nombre: 'Lu' },
      lineas: [{ id: 'l1', producto: '7', talle: '3', sku: 'STU-REM-M', nombre: 'Remera', talleNombre: 'M', cantidad: 3, importe: 10000, devuelta: false, cambiado: 0 }],
    } as never)
    await hacer(() => h.devolverDeVenta(f, { l1: 1 }))
    await hacer(() => h.sumarNueva(OTRA_STU))
    // 1 de 3 a 3.333,33 y se lleva uno a 15.000
    expect(h.diferencia).toBe(11666.67)
  })
})

describe('cambio suelto · el pedido al servidor', () => {
  it('🔑 venta de Gestión Nube: viaja el número y las prendas, ⛔ el precio (lo pone el servidor desde el espejo)', async () => {
    await montar()
    await hacer(() => h.devolverDeVenta(ventaDeGn(GN), { [claveDePrenda(7, 3)]: 1 }))
    await hacer(() => h.sumarNueva(REMERA))
    expect(h.diferencia).toBe(0)
    expect(h.listo).toBe(true)
    await hacer(() => void h.confirmar())
    const [marca, p] = cambiarVenta.mock.calls[0]
    expect(marca).toBe('zattia')
    expect(p).toMatchObject({ gnVentaId: '30930', devueltas: [{ productId: 7, sizeId: 3, cantidad: 1, sku: 'STU-REM-M' }], items: [{ product_id: 7, size_id: 3, cantidad: 1, precio: 15000, sku: 'STU-REM-M' }] })
    expect(p.devueltas[0]).not.toHaveProperty('precio')
    expect(p).not.toHaveProperty('sinTicket')
    expect(h.hecho?.numero).toBe(5)
    expect(h.venta).toBeNull()
  })

  it('🔑 el cambio deja su COMPROBANTE con el molde del ticket de venta: lo que vuelve en negativo y SIN DIFERENCIA donde iría el TOTAL (Bruno, 28-oct)', async () => {
    await montar()
    await hacer(() => h.devolverDeVenta(ventaDeGn(GN), { [claveDePrenda(7, 3)]: 1 }))
    await hacer(() => h.sumarNueva(OTRA_STU))
    await hacer(() => void h.confirmar())
    expect(h.hecho?.comprobante).toMatchObject({
      numero: 5, origen: 'Venta #30930 de Gestión Nube', subtotal: 0, total: 0, aFavor: 0,
      renglones: [
        { nombre: 'Remera', talle: 'M', cantidad: -1, precio: 15000, importe: -15000, stunned: true },
        { nombre: 'Buzo', talle: 'M', cantidad: 1, precio: 15000, importe: 15000, stunned: true },
      ],
    })
    const { armarTicket, armarTicketCambio, ticketDeCambio } = await import('@/lib/caja/ticket')
    const t = ticketDeCambio(h.hecho!.comprobante, { nombreCuenta: () => 'Efectivo', politica: null })
    const medir = (x: string) => x.match(/.{1,40}/g) || ['']
    const textos = (r: { ops: { k: string }[] }) => r.ops.filter((o) => o.k === 'txt').map((o) => (o as unknown as { txt: string }).txt)
    const txt = textos(armarTicket(t, Date.parse('2026-10-28T22:00:00Z'), medir))
    for (const x of ['COMPROBANTE', 'DOCUMENTO NO VÁLIDO COMO FACTURA', 'Comprobante: Cambio #5', 'De: Venta #30930 de Gestión Nube', 'Cliente: Consumidor Final', '-1 x $15.000', '-$15.000', 'Remera - M', '1 x $15.000', 'Buzo - M', 'SIN DIFERENCIA', 'Gracias por tu compra!']) expect(txt).toContain(x)
    expect(txt).not.toContain('TOTAL')
    // El de regalo: sólo lo que se lleva.
    const regalo = textos(armarTicketCambio(t, Date.parse('2026-10-28T22:00:00Z'), medir))
    expect(regalo).toContain('1 x Buzo - M')
    expect(regalo.join(' ')).not.toContain('Remera')
    // Con diferencia a favor de la clienta, en vez del TOTAL va el SALDO A FAVOR.
    const aFavor = textos(armarTicket({ ...t, subtotal: -2000, cambio: { origen: 'Sin ticket', aFavor: 2000, saldo: 2000, saldoUsado: 0 } }, 0, medir))
    expect(aFavor).toContain('SALDO A FAVOR')
    expect(aFavor).toContain('-$2.000')
  })

  it('🔴 sin ticket: no se puede confirmar sin el PIN de la encargada ni sin lo que pagó', async () => {
    await montar()
    await hacer(() => h.devolverPrenda(REMERA))
    await hacer(() => h.sumarNueva(OTRA_STU))
    expect(h.listo).toBe(false)
    expect(h.faltaPin).toBe(true)
    await hacer(() => h.ponerPrecioDevuelta(claveDePrenda(7, 3), ''))
    await hacer(() => h.setEncargada({ persona: 'ana', pin: '1234' }))
    expect(h.sinPrecioDevuelta).toBe(true)
    expect(h.listo).toBe(false)
  })

  it('🔑 sin ticket: viaja `sinTicket`, el precio de la cajera, el PIN y la encargada', async () => {
    await montar()
    await hacer(() => h.devolverPrenda(REMERA))
    await hacer(() => h.ponerPrecioDevuelta(claveDePrenda(7, 3), 12000))
    await hacer(() => h.sumarNueva(OTRA_STU))
    await hacer(() => h.setEncargada({ persona: ' ana ', pin: '1234' }))
    expect(h.diferencia).toBe(3000)
    // La diferencia a cobrar necesita las reglas de la Caja (sin ellas, ⛔ se confirma): acá, lo que se manda con diferencia 0.
    await hacer(() => h.cambiarNueva(0, { precio: 12000 }))
    expect(h.diferencia).toBe(0)
    await hacer(() => void h.confirmar())
    expect(cambiarVenta.mock.calls[0][1]).toMatchObject({ sinTicket: true, pin: '1234', pinPersona: 'ana', devueltas: [{ productId: 7, sizeId: 3, cantidad: 1, precio: 12000 }] })
  })

  it('en el paso 1 hay lo que vuelve y ninguna cuenta de diferencia: el total se calcula con lo que se lleva (paso 2)', async () => {
    await montar()
    await hacer(() => h.devolverPrenda(REMERA))
    // Sin nada que se lleve, `diferencia` es la de devolver todo; la pantalla del paso 1 ⛔ la muestra (sólo «Devuelve»).
    expect(h.unidadesNuevas).toBe(0)
    expect(h.vuelve).toBe(15000)
  })
})

describe('cambio · buscar la venta', () => {
  it('🔴 la pantalla del ERP ⛔ esconde las ventas de Zattia cuando Stunned se prende; el POS sí las saca', async () => {
    const cliente = await import('@/lib/erp/cliente')
    const venta = (id: string, marca: string) => ({ id, numero: Number(id), marca, tipo: 'venta', estado: 'confirmada', origen: 'caja', canal: 'local', deposito: 'local', total: 1000, prueba: true, ocurridaEn: '2026-10-27T12:00:00Z', cliente: null })
    vi.spyOn(cliente, 'buscarVentas').mockResolvedValue({ ventas: [venta('1', 'zattia'), venta('2', 'stunned')], cortado: false } as never)
    const { buscarVentasDelCambio } = await import('@/components/caja/useCambio')
    expect((await buscarVentasDelCambio('zattia', 'ana', { gn: true, soloStunned: false })).filas.map((f) => f.numero)).toEqual([1, 2])
    expect((await buscarVentasDelCambio('zattia', 'ana', { gn: true, soloStunned: true })).filas.map((f) => f.numero)).toEqual([2])
  })
})
