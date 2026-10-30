// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ROLES, paraHacerDe, verResultado } from '../lib/erp/inicio-roles.core.js'
import { ERP_ROLES } from '../lib/permisos.core.js'
import { VISTAS as VENTAS } from '../lib/erp/ventas-lista.core.js'
import { VISTAS as STOCK } from '../lib/erp/stock-lista.core.js'
import { VISTAS as PRODUCTOS } from '../lib/erp/productos-lista.core.js'

/**
 * **ERP › Inicio › «Ver como» (26-oct, Resto).** El oráculo: cada renglón de «Para hacer» es una vista que EXISTE en su lista
 * (⛔ un número sin lista detrás), los roles son los del permiso, y sólo Admin ve el resultado (con costo).
 */
describe('Ver como — el núcleo', () => {
  it('los 5 roles de abajo son los de ERP_ROLES, más Admin', () => {
    expect(ROLES[0][0]).toBe('admin')
    expect(ROLES.slice(1).map(([k]) => k).sort()).toEqual([...ERP_ROLES].sort())
  })
  it('todo renglón apunta a una vista que existe en su lista', () => {
    const vistas: Record<string, string[]> = { ventas: VENTAS.map((v) => v[0] as string), stock: STOCK.map((v) => v[0] as string), productos: PRODUCTOS.map((v) => v[0] as string) }
    for (const [rol] of ROLES) for (const [, items] of paraHacerDe(rol)) for (const [lista, vista] of items) expect(vistas[lista], `${rol}: ${lista}/${vista}`).toContain(vista)
  })
  it('sólo Admin ve el resultado y los costos de Productos; Consulta ⛔ ve «sin costo»', () => {
    expect(ROLES.filter(([k]) => verResultado(k)).map(([k]) => k)).toEqual(['admin'])
    for (const [rol] of ROLES.filter(([k]) => k !== 'admin')) expect(JSON.stringify(paraHacerDe(rol))).not.toContain('sincosto')
  })
})

vi.mock('@/lib/erp/cliente', () => ({
  leerResultadoDelMes: async () => ({ mes: { desde: '2026-10-01', hasta: '2026-10-19', ventas: 1, vendido: 100, costo: 40, sinCosto: 0, margen: 60 }, anterior: { desde: '2026-09-01', hasta: '2026-09-19', ventas: 1, vendido: 100, costo: 40, sinCosto: 0, margen: 60 }, gnHasta: null }),
  leerListaDeVentas: async () => ({ filas: [{ estadoKey: 'a_preparar', cobroKey: 'sinpagar', kind: 'venta', tipo: 'venta', anulada: false, facturada: false }] }),
  leerListaDeStock: async () => ({ filas: [] }),
  leerListaDeProductos: async () => ({ filas: [] }),
}))
let admin = true
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno', admin } }) }))
let root: Root | null = null
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; admin = true })

async function montar() {
  const { InicioErp } = await import('@/components/erp/inicio/InicioErp')
  const host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<InicioErp href={(s, p) => `/erp/${s}/${p}`} />) })
  await act(async () => {})
  return host
}
// 🎯 Bruno 30-oct: «Ver como» va escondido en un botón arriba a la derecha; los roles aparecen al abrirlo.
const boton = (host: HTMLElement) => [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Ver como')) as HTMLButtonElement | undefined
const rol = (host: HTMLElement, nombre: string) => [...host.querySelectorAll('[role=menuitemradio]')].find((b) => b.textContent === nombre) as HTMLButtonElement

describe('Ver como — la pantalla', () => {
  it('Admin lo ve todo; con «Depósito» cambian las tarjetas y desaparece el resultado', async () => {
    const host = await montar()
    expect(host.textContent).toContain('Resultado comercial del mes')
    expect(host.textContent).toContain('Productos sin costo')
    expect(rol(host, 'Depósito')).toBeUndefined()
    await act(async () => { boton(host)!.click() })
    await act(async () => { rol(host, 'Depósito').click() })
    expect(boton(host)!.textContent).toContain('Depósito')
    expect(rol(host, 'Depósito')).toBeUndefined()
    expect(host.textContent).not.toContain('Resultado comercial del mes')
    expect(host.textContent).not.toContain('Productos sin costo')
    expect(host.textContent).toContain('Ventas a desarmar')
    expect(host.textContent).toContain('Depósito: lo que hay que preparar')
  })
  it('⛔ el selector es sólo de admin', async () => {
    admin = false
    const host = await montar()
    expect(boton(host)).toBeUndefined()
  })
})
