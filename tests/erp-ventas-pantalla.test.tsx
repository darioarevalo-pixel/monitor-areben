// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFila } from '@/lib/erp/ventas-lista.core.js'
import type { ExtraDeVenta, FichaDeVenta, FilaVentaLista, QueSabeElMotor } from '@/lib/erp/cliente'

/**
 * **ERP › Ventas, del lado de la pantalla** (piloto del diseño, 18-oct). El oráculo es lo que se LEE y lo que se APRIETA:
 * las vistas con su número, el resumen arriba, que la columna se oculte y quede GUARDADA para ese usuario, que la fila
 * abra la ficha al costado (con su historial) y que $ y Editar desde la fila abran SÓLO su ventana. Lo que el motor ⛔
 * sabe todavía, la ventana lo DICE y ⛔ deja guardar. Las filas pasan por el núcleo real (`armarFila`).
 */
const V = (o: Record<string, unknown>) => armarFila({
  kind: 'venta', id: 'v1', numero: 301, linea: 'bdi', tipo: 'venta', estado: 'confirmada', origen: 'caja', total: 18990, prueba: true,
  usuario: 'camila', ocurridaEn: '2026-10-18T13:40:00Z', pagos: [{ medio: 'efectivo', monto: 18990 }], ...o,
}) as FilaVentaLista
const FILAS = [
  V({}),
  V({ id: 'v2', numero: 293, origen: 'mayorista', gnEstado: 'Compra Pendiente', clienteGn: 'Mayorista Norte', total: 186400, clienteId: 'c1', pagos: [{ medio: 'cuenta', monto: 93200 }, { medio: 'transferencia', monto: 93200 }] }),
  V({ id: 'v3', numero: 286, estado: 'anulada', total: 22990 }),
]
let puede: QueSabeElMotor = { editar: false, notas: false, cobrar: false }
const leerListaDeVentas = vi.fn(async () => ({ filas: FILAS, desde: '2026-10-01', hasta: '2026-10-18', puede }))
const ficha: FichaDeVenta = {
  venta: { id: 'v2', numero: 293, marca: 'bdi', tipo: 'venta', estado: 'confirmada', origen: 'mayorista', canal: 'mayorista', deposito: 'deposito_minorista', total: 186400, prueba: true, ocurridaEn: '2026-10-16T21:12:00Z', cliente: null, subtotal: 186400, usuario: 'gn-mayorista', registradaEn: '2026-10-16T21:12:00Z', origenRef: 'gn:1', gnSaleId: '1', ventaOriginalId: null },
  cliente: null, lineas: [], pagos: [{ cuenta: 'Cuenta corriente', medio: 'cuenta', monto: 93200, base: null, porcentaje: null }], anulacion: null, facturas: [],
  facturada: false, conNotaDeCredito: false, acreditadaEntera: false, cambios: [], original: null, puedeAnular: null, devolucion: null,
}
const extra: ExtraDeVenta = {
  clienteGn: 'Mayorista Norte', gnNumero: '32365', gnEstado: 'Compra Pendiente', clienteId: 'c1', vendedor: null, entrega: null, facturar: null, tn: null,
  facturas: [], cuentas: [{ id: 'k1', nombre: 'Transferencia Mayorista', medio: 'transferencia' }],
  ediciones: [{ campo: 'entrega', antes: 'Retira', despues: 'Cadete · Mitre 123', usuario: 'Darío', cuando: '2026-10-16T22:05:00Z' }], notas: [], nota: null, motor: null,
}
vi.mock('@/lib/erp/cliente', () => ({
  leerListaDeVentas: () => leerListaDeVentas(),
  leerFichaDeVenta: async () => ficha,
  leerExtraDeVenta: async () => extra,
  anularVenta: vi.fn(), notaDeCreditoDeVenta: vi.fn(), editarVentaErp: vi.fn(), guardarNotaDeVenta: vi.fn(), cobrarVentaErp: vi.fn(),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno' } }) }))

// El `localStorage` de Node 25 le gana al de jsdom y viene sin métodos: uno en memoria (como `caja-calculadora`).
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) },
  removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear(),
})

let root: Root | null = null
let host: HTMLDivElement
const irACaja = vi.fn()
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks() })

async function montar() {
  const { VentasErp } = await import('@/components/erp/ventas/VentasErp')
  const { ConfirmProvider } = await import('@/components/ui')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ConfirmProvider><VentasErp irACaja={irACaja} /></ConfirmProvider>) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: string | RegExp, en: ParentNode = document.body) => [...en.querySelectorAll('button')].find((b) => (typeof t === 'string' ? (b.textContent?.trim() === t || b.getAttribute('aria-label') === t) : t.test(b.textContent ?? '') || t.test(b.getAttribute('aria-label') ?? '')))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filaDe = (ref: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(ref))!

describe('la lista', () => {
  it('vistas con su número, resumen arriba y la prueba dicha', async () => {
    await montar()
    expect(todo()).toContain('Todo lo de esta lista es de prueba')
    const vistas = [...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
    expect(vistas).toEqual(['Todas3', 'A preparar1', 'Listas0', 'A desarmar0', 'Sin pagar0', 'Con saldo1', 'Sin factura2', 'Anuladas1'])
    expect(todo()).toContain('$ 205.390') // vendido: 18.990 + 186.400 (la anulada ⛔)
    expect(todo()).toContain('$ 93.200') // por cobrar
    await clic(boton(/^Con saldo/))
    expect(host.querySelectorAll('[role="row"]').length).toBe(2) // encabezado + la mayorista
  })

  it('ocultar una columna queda GUARDADO para ese usuario', async () => {
    await montar()
    expect(host.querySelector('[role="row"]')!.textContent).toContain('Origen')
    await clic(boton(/^Columnas · 7 de 11/))
    await act(async () => { (document.getElementById('col-o') as HTMLInputElement).click() })
    expect(host.querySelector('[role="row"]')!.textContent).not.toContain('Origen')
    expect(localStorage.getItem('erp_lista_prefs')).toContain('erp-ventas:bruno')
    act(() => root?.unmount()); root = null; host.remove()
    await montar()
    expect(host.querySelector('[role="row"]')!.textContent).not.toContain('Origen')
    expect(boton(/^Columnas · 6 de 11/)).toBeTruthy()
  })
})

describe('la ficha y las ventanas', () => {
  it('la fila abre la ficha al costado, con el historial y la edición antes → después', async () => {
    await montar()
    await clic(filaDe('#293').querySelectorAll('[role="cell"]')[3])
    const aside = document.querySelector('aside[aria-label="Ficha de la venta #293"]')!
    expect(aside).toBeTruthy()
    expect(aside.textContent).toContain('Mayorista Norte')
    expect(aside.textContent).toContain('Saldo$ 93.200')
    expect(aside.textContent).toContain('Quedó a cuenta · $ 93.200')
    expect(aside.textContent).toContain('Editó entrega')
    expect(aside.textContent).toContain('Cadete · Mitre 123')
    expect(host.querySelectorAll('[role="row"]').length).toBe(4) // la lista ⛔ se pierde
  })

  it('$ desde la FILA abre sólo el cobro; sin el motor lo dice y ⛔ deja registrar', async () => {
    await montar()
    await clic(boton(/^Registrar cobro \(todavía no conectado al motor\)/, filaDe('#293')))
    expect(document.querySelector('aside')).toBeNull()
    expect(todo()).toContain('Venta #293 · Mayorista Norte · saldo $ 93.200')
    expect(todo()).toContain('Todavía no está en el motor del monitor')
    expect((boton(/^Registrar \$ 93\.200/) as HTMLButtonElement).disabled).toBe(true)
  })

  it('con el motor, el cobro se manda imputado a esa venta', async () => {
    puede = { editar: true, notas: true, cobrar: true }
    const cliente = await import('@/lib/erp/cliente')
    await montar()
    await clic(boton(/^Registrar cobro · saldo/, filaDe('#293')))
    const select = document.querySelector('select:not([aria-label])') as HTMLSelectElement
    await act(async () => { select.value = 'k1'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await clic(boton(/^Registrar \$ 93\.200/))
    expect(cliente.cobrarVentaErp).toHaveBeenCalledWith('bdi', expect.objectContaining({ ventaId: 'v2', clienteId: 'c1', monto: 93200, saldo: 93200, cuenta: 'k1' }))
    puede = { editar: false, notas: false, cobrar: false }
  })

  it('Editar: prendas y cobros con candado; sin cambios ⛔ se guarda', async () => {
    await montar()
    await clic(boton('Editar', filaDe('#301')))
    await act(async () => {})
    expect(todo()).toContain('Editar la venta #301')
    expect(todo()).toContain('No se editan acá: mueven stock, plata o la factura.')
    expect((boton('Guardar cambios') as HTMLButtonElement).disabled).toBe(true)
    await clic(boton('Hacer cambio'))
    expect(irACaja).toHaveBeenCalledWith('cambio')
  })

  it('una anulada ⛔ se edita', async () => {
    await montar()
    expect((boton('Anulada: no se edita', filaDe('#286')) as HTMLButtonElement).disabled).toBe(true)
  })
})
