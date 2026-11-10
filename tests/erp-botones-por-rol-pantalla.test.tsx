// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFila } from '@/lib/erp/ventas-lista.core.js'
import { armarFilasClientes } from '@/lib/erp/clientes-lista.core.js'
import type { FichaDeVenta, FilaCliente, FilaVentaLista } from '@/lib/erp/cliente'

/**
 * **El rol que ⛔ puede, ⛔ ve el botón** (10-nov, caminado en prod con «Ver como»). Consulta («ves todo sin tocar nada») veía
 * Editar, Hacer cambio y Anular…; Depósito, Hacer cambio y Anular…; Local, Nuevo ajuste y Mover; y Clientes, sin el permiso
 * `cuentas`, dejaba «Por cobrar …» para siempre y «Con saldo»/«Atrasadas» en 0. El servidor frenaba con 403 recién al guardar.
 * El oráculo es lo que el SERVIDOR contesta en `vista=permisos` (acá, Consulta en BDI: sólo `ver`), y lo que la pantalla deja ver.
 */
const SOLO_VER = { ver: true, costos: false, configurar: false, cuentas: false, 'editar-venta': false, cobrar: false, cambiar: false, anular: false, ajustar: false, 'facturar-venta': false, 'corregir-precio': false, 'corregir-medio': false }
let permisos: Record<string, boolean> = SOLO_VER

const V = (o: Record<string, unknown>) => armarFila({
  kind: 'venta', id: 'v1', numero: 301, linea: 'bdi', tipo: 'venta', estado: 'confirmada', origen: 'caja', total: 18990, prueba: true,
  usuario: 'camila', ocurridaEn: '2026-10-18T13:40:00Z', pagos: [{ medio: 'efectivo', monto: 9000 }], ...o,
}) as FilaVentaLista
const FILAS_VENTA = [V({})]
const ficha: FichaDeVenta = {
  venta: { id: 'v1', numero: 301, marca: 'bdi', tipo: 'venta', estado: 'confirmada', origen: 'caja', canal: 'local', deposito: 'local', total: 18990, prueba: true, ocurridaEn: '2026-10-18T13:40:00Z', cliente: null, subtotal: 18990, usuario: 'camila', registradaEn: '2026-10-18T13:40:00Z', origenRef: 'caja:1', gnSaleId: null, ventaOriginalId: null },
  cliente: null, lineas: [], pagos: [], anulacion: null, facturas: [],
  facturada: false, conNotaDeCredito: false, acreditadaEntera: false, cambios: [], original: null, puedeAnular: null, devolucion: null,
}
const FILAS_CLIENTE = armarFilasClientes({
  hoy: '2026-10-19',
  gn: [{ clave: '10', nombre: 'Barbara Spagnoli', compras: 26, total: 500000, primera: '2025-02-16', ultima: '2026-10-03', mayorista: 12, canales: ['Mayorista'] }],
}) as FilaCliente[]
const leerCuentasCorrientes = vi.fn(async () => ({ hoy: '2026-10-19', prueba: true, cuentas: [], clientesErp: 1, otroLibro: 0 }))

vi.mock('@/lib/erp/cliente', () => ({
  leerPermisos: async () => ({ permisos: { bdi: permisos, zattia: permisos } }),
  leerListaDeVentas: async () => ({ filas: FILAS_VENTA, desde: '2026-10-01', hasta: '2026-10-18', puede: { editar: true, notas: true, cobrar: true, corregir: true, corregirMedio: true } }),
  leerFichaDeVenta: async () => ficha,
  leerExtraDeVenta: async () => ({ clienteGn: null, gnNumero: null, gnEstado: null, clienteId: null, vendedor: null, entrega: null, facturar: null, tn: null, facturas: [], cuentas: [], ediciones: [], notas: [], nota: null, motor: null }),
  anularVenta: vi.fn(), notaDeCreditoDeVenta: vi.fn(), editarVentaErp: vi.fn(), guardarNotaDeVenta: vi.fn(), cobrarVentaErp: vi.fn(),
  leerCorteDeLinea: async () => ({ en_erp: false }),
  leerListaDeClientes: async () => ({ filas: FILAS_CLIENTE, gnHasta: '2026-10-19', clientesErp: 1, cuentaLista: true, porNombre: false }),
  leerFichaDeCliente: async () => ({ compras: [], contacto: null, cuenta: null, cortado: false }),
  leerCuentasCorrientes: () => leerCuentasCorrientes(),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno' } }) }))
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) }, removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear() })

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(async () => {
  act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; guardado.clear(); vi.clearAllMocks()
  ;(await import('@/lib/erp/usePuedeErp')).olvidarPermisosErp()
})

async function montar(el: React.ReactElement) {
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(el) })
  await act(async () => {}); await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: RegExp) => [...document.querySelectorAll('button')].find((b) => t.test(b.textContent ?? '') || t.test(b.getAttribute('aria-label') ?? ''))
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }

async function montarVentas() {
  const { VentasErp } = await import('@/components/erp/ventas/VentasErp')
  const { ConfirmProvider } = await import('@/components/ui')
  await montar(<ConfirmProvider><VentasErp irACaja={vi.fn()} /></ConfirmProvider>)
}
async function montarClientes() {
  const { ClientesErp } = await import('@/components/erp/clientes/ClientesErp')
  await montar(<ClientesErp />)
}

describe('Ventas: el «⋯» de la fila y la ficha, según el rol', () => {
  it('Consulta (sólo `ver`): ⛔ Registrar cobro, Editar, Hacer cambio ni Anular…; sí abrir la ficha e imprimir', async () => {
    permisos = SOLO_VER
    await montarVentas()
    await clic(boton(/^Más acciones de la venta #301$/)!)
    expect(todo()).toContain('Abrir la ficha')
    expect(todo()).toContain('Imprimir el ticket')
    for (const t of ['Registrar cobro', 'Hacer cambio', 'Anular…']) expect(todo()).not.toContain(t)
    expect(boton(/^Editar$/)).toBeUndefined()
  })

  it('Local (cobra, edita, cambia y anula): el «⋯» trae las cuatro', async () => {
    permisos = { ...SOLO_VER, cobrar: true, 'editar-venta': true, cambiar: true, anular: true }
    await montarVentas()
    await clic(boton(/^Más acciones de la venta #301$/)!)
    for (const t of ['Registrar cobro', 'Editar', 'Hacer cambio', 'Anular…']) expect(todo()).toContain(t)
  })

  it('sin respuesta del servidor el botón SE VE (falla abierto: el 403 lo frena igual)', async () => {
    permisos = {}
    await montarVentas()
    await clic(boton(/^Más acciones de la venta #301$/)!)
    for (const t of ['Editar', 'Hacer cambio', 'Anular…']) expect(todo()).toContain(t)
  })
})

describe('Clientes sin el permiso `cuentas`', () => {
  it('⛔ «Por cobrar …» para siempre ni vistas de cuenta en 0: no se muestran, y la cuenta corriente ⛔ se lee', async () => {
    permisos = SOLO_VER
    await montarClientes()
    expect(todo()).not.toContain('Por cobrar')
    for (const t of [/^Con saldo/, /^Atrasadas/, /^Con crédito/]) expect(boton(t)).toBeUndefined()
    expect(boton(/^Mayoristas/)).toBeTruthy()
    expect(leerCuentasCorrientes).not.toHaveBeenCalled()
  })

  it('con el permiso, la tarjeta y «Con saldo» siguen', async () => {
    permisos = { ...SOLO_VER, cuentas: true }
    await montarClientes()
    expect(todo()).toContain('Por cobrar')
    expect(boton(/^Con saldo/)).toBeTruthy()
  })
})
