// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFila, contarVistas } from '@/lib/erp/ventas-lista.core.js'
import { escanear, faltanEscanear, prendasADesarmar, textoDeVuelta } from '@/lib/erp/desarme.core.js'
import { devolucionDeFicha, leerAnular } from '@/lib/erp/venta.core.js'
import type { FichaDeVenta, FilaVentaLista } from '@/lib/erp/cliente'

/**
 * **ERP › Ventas › anular y desarmar** (contrato-venta.md §17, 37a; Diseño 8). El oráculo es lo que se APRIETA y lo que
 * sale al servidor: anular pide elegir plata o saldo cuando entró plata (y la clienta si no hay); una anulada «A desarmar»
 * se escanea prenda por prenda y recién con todas se confirma la vuelta. La regla del escaneo pasa por el núcleo real.
 */
const LINEAS = [
  { id: 'l1', n: 1, producto: '10', talle: '2', nombre: 'Remera Lisa', talleNombre: 'M', sku: 'RBT-0151', codigo: 'RBT0151', cantidad: 2, precio: 10000, descuento: 0, rebaja: 0, importe: 20000, devuelta: false, lineaOrigenId: null, cambiado: 0 },
  { id: 'l2', n: 2, producto: '11', talle: '3', nombre: 'Short', talleNombre: 'L', sku: 'SHO-0002', codigo: null, cantidad: 1, precio: 5000, descuento: 0, rebaja: 0, importe: 5000, devuelta: false, lineaOrigenId: null, cambiado: 0 },
]

describe('el núcleo', () => {
  it('el escaneo cuenta por código o SKU, sin guiones; lo ajeno y lo de más se dicen', () => {
    const p = prendasADesarmar(LINEAS)
    let c: Record<string, number> = {}
    for (const x of ['rbt0151', 'RBT-0151']) c = escanear(p, c, x).contados
    expect(c).toEqual({ l1: 2 })
    expect(escanear(p, c, 'RBT0151').resultado).toBe('de_mas')
    expect(escanear(p, c, 'XXX-1').resultado).toBe('no_es')
    expect(faltanEscanear(p, c)).toBe(1)
    expect(faltanEscanear(p, escanear(p, c, 'sho-0002').contados)).toBe(0)
  })
  it('lo que ya volvió en un cambio ⛔ se escanea', () => {
    expect(prendasADesarmar([{ ...LINEAS[0], cambiado: 2 }, LINEAS[1]]).map((x) => x.id)).toEqual(['l2'])
  })
  it('qué pasa con la prenda, según el estado', () => {
    expect(textoDeVuelta('a_desarmar', { deposito: 'Local', prueba: false })).toContain('A desarmar')
    expect(textoDeVuelta('a_recibir', { deposito: 'Local', prueba: false })).toContain('DEVOLUCIÓN')
    expect(textoDeVuelta('ya', { deposito: 'Local', prueba: false })).toContain('al instante')
    expect(textoDeVuelta('a_desarmar', { deposito: 'Local', prueba: true })).toContain('prueba')
  })
  it('anular SIEMPRE lleva la forma de devolver', () => {
    const base = { ventaId: '00000000-0000-0000-0000-000000000001', motivo: 'la clienta se arrepintió' }
    expect(leerAnular(base).error).toMatch(/Elegí cómo se devuelve/)
    expect(leerAnular({ ...base, devolucion: { forma: 'saldo' }, cliente: { doc: '30111222', nombre: 'Ana' } })).toMatchObject({ devolucion: { forma: 'saldo' }, cliente: { doc: '30111222', nombre: 'Ana' } })
  })
  it('saldo a favor a precio de LISTA (13.500 pagados de 15.000 con el 10 %)', () => {
    expect(devolucionDeFicha({ plata: 13500, subtotal: 15000, total: 13500, vueltaSiAnula: 'ya', pin: false, conDevolucion: true })).toMatchObject({ pagadoEnPlata: 13500, aLista: 15000 })
  })
  it('la anulada a desarmar tiene su estado y su vista', () => {
    const f = armarFila({ kind: 'venta', id: 'v9', numero: 9, linea: 'zattia', tipo: 'venta', estado: 'anulada', origen: 'tn', total: 1, vueltaPendiente: 'a_desarmar', pagos: [] })
    expect(f.estadoKey).toBe('a_desarmar')
    expect(contarVistas([f]).desarmar).toBe(1)
  })
})

const anularVenta = vi.fn(async () => ({ ok: true, movimientos: 0, ncPendiente: false, vuelta: 'a_desarmar', devolucion: { forma: 'plata', monto: 25000, pagos: [{ medio: 'transferencia', monto: 25000 }] }, saldo: null }))
const confirmarVuelta = vi.fn(async () => ({ ok: true, movimientos: 2, vuelta: 'a_desarmar' }))
let ficha: FichaDeVenta
vi.mock('@/lib/erp/cliente', () => ({
  leerFichaDeVenta: async () => ficha,
  leerExtraDeVenta: async () => null,
  anularVenta: (...a: unknown[]) => (anularVenta as (...x: unknown[]) => unknown)(...a),
  confirmarVuelta: (...a: unknown[]) => (confirmarVuelta as (...x: unknown[]) => unknown)(...a),
  notaDeCreditoDeVenta: vi.fn(),
}))

const DEV = { conDevolucion: true, pin: false, vueltaSiAnula: 'a_desarmar' as const, pagadoEnPlata: 25000, aLista: 25000, devoluciones: [], volvio: null }
const fichaDe = (o: Partial<FichaDeVenta> = {}): FichaDeVenta => ({
  venta: { id: '00000000-0000-0000-0000-0000000000aa', numero: 412, marca: 'zattia', tipo: 'venta', estado: 'confirmada', origen: 'tn', canal: 'online', deposito: 'local', total: 25000, prueba: false, ocurridaEn: '2026-10-19T13:00:00Z', cliente: null, subtotal: 25000, usuario: 'tn', registradaEn: '2026-10-19T13:00:00Z', origenRef: 'zattia:1', gnSaleId: null, ventaOriginalId: null },
  cliente: null, lineas: LINEAS, pagos: [{ cuenta: 'Transferencia Zattia', medio: 'transferencia', monto: 25000, base: null, porcentaje: null }], anulacion: null, facturas: [],
  facturada: false, conNotaDeCredito: false, acreditadaEntera: false, cambios: [], original: null, puedeAnular: null, devolucion: DEV, ...o,
})
const fila = (o: Record<string, unknown> = {}) => armarFila({ kind: 'venta', id: '00000000-0000-0000-0000-0000000000aa', numero: 412, linea: 'zattia', tipo: 'venta', estado: 'confirmada', origen: 'tn', total: 25000, pagos: [], ...o }) as FilaVentaLista

let root: Root | null = null
const onCambio = vi.fn()
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; vi.clearAllMocks() })

async function montar(f: FilaVentaLista, accionInicial?: 'anular') {
  const { FichaVenta } = await import('@/components/erp/ventas/FichaVenta')
  const { ConfirmProvider } = await import('@/components/ui')
  const host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => {
    root = createRoot(host)
    root.render(<ConfirmProvider><FichaVenta marca="zattia" fila={f} accionInicial={accionInicial} puede={{ editar: false, notas: false, cobrar: false }} onCerrar={() => {}} onCambio={onCambio} abrirVentana={() => {}} irACaja={() => {}} version={0} /></ConfirmProvider>)
  })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: string | RegExp) => [...document.querySelectorAll('button')].find((b) => (typeof t === 'string' ? b.textContent?.trim() === t : t.test(b.textContent ?? '')))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
async function escribir(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!
    set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('anular desde la ficha', () => {
  it('dice adónde va la prenda y, con plata pagada, elegir saldo pide la clienta', async () => {
    ficha = fichaDe()
    await montar(fila(), 'anular')
    expect(todo()).toContain('queda «A desarmar»')
    expect(todo()).toContain('Devolver la plata · $ 25.000')
    await escribir(document.querySelector('textarea')!, 'la clienta se arrepintió')
    await clic(boton(/Dejar saldo a favor/))
    expect(boton('Anular venta').disabled).toBe(true) // falta la clienta
    const [doc, nombre] = [...document.querySelectorAll<HTMLInputElement>('input.mo-input')]
    await escribir(doc, '30111222'); await escribir(nombre, 'Ana Pérez')
    await clic(boton('Anular venta'))
    expect(anularVenta).toHaveBeenCalledWith('zattia', ficha.venta.id, 'la clienta se arrepintió', { forma: 'saldo' }, { doc: '30111222', nombre: 'Ana Pérez' })
  })
  it('con la plata: sale «plata» y el aviso dice cuánto devolver y que queda a desarmar', async () => {
    ficha = fichaDe()
    await montar(fila(), 'anular')
    await escribir(document.querySelector('textarea')!, 'la clienta se arrepintió')
    await clic(boton('Anular venta'))
    expect(anularVenta).toHaveBeenCalledWith('zattia', ficha.venta.id, 'la clienta se arrepintió', { forma: 'plata' }, undefined)
    expect(onCambio.mock.calls[0][0]).toMatch(/Devolvé \$ 25\.000 \(transferencia\)\. Queda «A desarmar»/)
  })
})

describe('el desarme', () => {
  it('se escanea prenda por prenda y recién con todas se confirma', async () => {
    ficha = fichaDe({ anulacion: { motivo: 'cancelado en TN', usuario: 'tn', anuladaEn: '2026-10-20T10:00:00Z', devolucion: null, vuelta: 'a_desarmar' } })
    await montar(fila({ estado: 'anulada', vueltaPendiente: 'a_desarmar' }))
    expect(todo()).toContain('Desarmar el paquete')
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Código de la prenda"]')!
    const contar = async (c: string) => { await escribir(input, c); await act(async () => { input.form!.requestSubmit() }) }
    await contar('RBT-0151'); await contar('XXX')
    expect(todo()).toContain('Esa prenda no es de esta venta.')
    await contar('rbt0151')
    expect(boton('Confirmar que volvieron').disabled).toBe(true)
    expect(todo()).toContain('Faltan 1 prenda')
    await clic([...document.querySelectorAll('button')].find((b) => b.textContent === '+1' && !b.disabled)!) // la del Short, sin código
    await clic(boton('Confirmar que volvieron'))
    expect(confirmarVuelta).toHaveBeenCalledWith('zattia', ficha.venta.id)
    expect(onCambio.mock.calls[0][0]).toContain('volvieron 3 prendas al stock')
  })
  it('ya desarmada: ⛔ se escanea de nuevo', async () => {
    ficha = fichaDe({ anulacion: { motivo: 'x', usuario: 'tn', anuladaEn: '2026-10-20T10:00:00Z', devolucion: null, vuelta: 'a_desarmar' }, devolucion: { ...DEV, volvio: { usuario: 'Gise', en: '2026-10-20T11:00:00Z' } } })
    await montar(fila({ estado: 'anulada' }))
    expect(todo()).not.toContain('Desarmar el paquete')
    expect(todo()).toContain('Se desarmó el paquete')
  })
})
