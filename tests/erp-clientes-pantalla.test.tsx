// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFilasClientes } from '@/lib/erp/clientes-lista.core.js'
import type { FilaCliente } from '@/lib/erp/cliente'

/**
 * **ERP › Clientes, del lado de la pantalla.** El oráculo es lo que se LEE: el aviso de que los clientes salen de GN
 * (el motor ⛔ tiene), las vistas con número, «sin cuenta» en vez de un 0, y la ficha al costado con sus compras.
 * Las filas pasan por el núcleo real.
 */
const FILAS = armarFilasClientes({
  hoy: '2026-10-19',
  gn: [
    { clave: '10', nombre: 'Barbara Spagnoli', compras: 26, total: 500000, primera: '2025-02-16', ultima: '2026-10-03', mayorista: 12, canales: ['Mayorista'] },
    { clave: '11', nombre: 'Dana Pérez', compras: 2, total: 40000, primera: '2025-03-01', ultima: '2026-05-10', mayorista: 0, canales: ['Tienda Nube'] },
  ],
}) as FilaCliente[]
const leerListaDeClientes = vi.fn(async () => ({ filas: FILAS, gnHasta: '2026-10-19', clientesErp: 0, cuentaLista: true, porNombre: false }))
const leerFichaDeCliente = vi.fn(async () => ({
  compras: [{ id: '1', number: 9123, fecha: '2026-10-03', channel: 'Mayorista', total: 250000, sale_state: 'Entregado', payment_method: null, tn_order: null }],
  contacto: { name: 'Barbara', email: 'barbara@x.com', phone: '341', city: 'Rosario', province: 'Santa Fe', address: null }, cuenta: null, cortado: false,
}))
vi.mock('@/lib/erp/cliente', () => ({ leerListaDeClientes: () => leerListaDeClientes(), leerFichaDeCliente: () => leerFichaDeCliente() }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno' } }) }))
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) }, removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear() })

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

async function montar() {
  const { ClientesErp } = await import('@/components/erp/clientes/ClientesErp')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ClientesErp />) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: RegExp) => [...document.querySelectorAll('button')].find((b) => t.test(b.textContent ?? ''))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filaDe = (t: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(t))!

describe('la lista de clientes', () => {
  it('dice que salen de GN, vistas con número y «sin cuenta» en el saldo', async () => {
    await montar()
    expect(todo()).toContain('el ERP todavía no tiene clientes propios')
    expect(boton(/^Compraron este mes/).textContent).toContain('1')
    expect(boton(/^Mayoristas/).textContent).toContain('1')
    expect(boton(/^Sin comprar hace \+90 días/).textContent).toContain('1')
    expect(filaDe('Barbara Spagnoli').textContent).toContain('sin cuenta')
    expect(filaDe('Barbara Spagnoli').textContent).toContain('Mayorista')
    await clic(boton(/^Mayoristas/))
    expect(host.querySelector('[role="table"]')!.textContent).not.toContain('Dana Pérez')
  })

  it('la fila abre la ficha al costado con el contacto y sus compras', async () => {
    await montar()
    await clic(filaDe('Barbara Spagnoli').querySelector('[role="cell"]:last-child')!)
    const f = document.querySelector('aside[aria-label^="Ficha del cliente"]')!
    expect(f.textContent).toContain('Saldo de la cuenta')
    expect(f.textContent).toContain('El ERP todavía no lleva la cuenta de este cliente')
    expect(f.textContent).toContain('barbara@x.com')
    expect(f.textContent).toContain('9123')
    expect(f.textContent).toContain('03/10/26')
  })
})
