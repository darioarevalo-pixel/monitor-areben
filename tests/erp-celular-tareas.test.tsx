// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProveedorLineaErp } from '@/lib/erp/linea-erp'

/**
 * 📱 **El ERP en el celular, tanda 3** (Bruno, 29-oct; artifact `diseno/celular/erp-celular.html`, molde 4): las dos tareas
 * que se hacen de pie. **Recibir**: cada producto en una tarjeta con + y − grandes, verde si llegó entero y ámbar si falta, y
 * el botón fijo al pie. **Nuevo ajuste**: la cantidad grande con el antes → después, y «Guardar ajuste» fijo al pie. En la
 * compu ⛔ cambia nada: sigue la tabla con su campo de número y los botones abajo del formulario.
 */
const ID = 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12)
const doc = { id: ID, numero: 7, linea: 'stunned', desde: 'deposito', hacia: 'local', origen: 'libre', estado: 'en_transito', nota: null, creada_por: 'Bruno', creada_en: '2026-10-26T20:00:00Z', enviada_por: 'Bruno', enviada_en: '2026-10-26T20:01:00Z', recibida_por: null, recibida_en: null, diferencias: [], renglones: [{ n: 1, product_id: 10, size_id: 1, sku: 'STU-REM-0019-M', barcode: '779001', pedida: 0, armada: 3, enviada: 3, recibida: null }] }
const TOP = { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', barcode: '7790152' }
const m = vi.hoisted(() => ({
  buscarPrendas: vi.fn(), leerListaDeStock: vi.fn(), leerTransferenciasDoc: vi.fn(), crearTransferenciaDoc: vi.fn(), armarTransferenciaDoc: vi.fn(), enviarTransferenciaDoc: vi.fn(), recibirTransferenciaDoc: vi.fn(), cancelarTransferenciaDoc: vi.fn(),
  leerDepositos: vi.fn(), leerAjustes: vi.fn(), leerStockDePrenda: vi.fn(), crearAjuste: vi.fn(), aprobarAjuste: vi.fn(), descartarAjuste: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => m)

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); window.history.replaceState(null, '', '/') })
beforeEach(() => {
  m.leerListaDeStock.mockResolvedValue({ filas: [{ producto: '10', talle: '1', nombre: 'REMERA OVERSIZE', talleNombre: 'M' }] })
  m.leerDepositos.mockResolvedValue({ depositos: [] })
  m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [doc], enTransito: [] })
  m.recibirTransferenciaDoc.mockResolvedValue({ ok: true, transferencia: { ...doc, estado: 'recibida' }, ya: false, movimientos: 1, unidades: 3, diferencias: [], avisos: [] })
  m.leerAjustes.mockResolvedValue({ linea: 'zattia', aContar: [], sinConciliacion: false, ajustes: [] })
  m.leerStockDePrenda.mockResolvedValue({ prenda: TOP, depositos: [{ deposito: 'local', libro: 5, gn: 5, diferencia: 0 }], historial: [], sinDeposito: [] })
  m.crearAjuste.mockResolvedValue({ ok: true, numero: 8, id: 'nuevo-8', renglones: 1, avisos: [] })
  m.aprobarAjuste.mockResolvedValue({ ok: true, numero: 8, movimientos: 1, avisos: [] })
})

const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
async function montar(el: React.ReactElement, url: string) {
  window.history.replaceState(null, '', url)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(el) })
  await esperar()
}
const boton = (t: string | RegExp) => [...document.querySelectorAll('button')].find((b) => (typeof t === 'string' ? b.textContent === t : t.test(b.textContent ?? ''))) as HTMLButtonElement
const click = async (b: Element) => { await act(async () => { (b as HTMLElement).click() }); await esperar() }
const elPie = () => host.querySelector('[data-pie-tarea]')

async function abrirRecibir(url: string) {
  const { MoverYRecibir } = await import('@/components/erp/stock/MoverYRecibir')
  await montar(<ProveedorLineaErp value="stunned"><MoverYRecibir /></ProveedorLineaErp>, url)
  await click(host.querySelector('[role="row"].mo-lista-fila, [role="listitem"] button')!)
  await click(boton('Recibir'))
}

describe('Recibir en el celular', () => {
  it('tarjetas con + y − grandes: ámbar mientras falta, verde al llegar entero, y el botón fijo al pie manda lo contado', async () => {
    await abrirRecibir('/erp/stock/transferencias/mover?movil=1')
    const tarjeta = () => host.querySelector('[data-tono]') as HTMLElement
    expect(tarjeta().textContent).toContain('REMERA OVERSIZE · M')
    expect(tarjeta().dataset.tono).toBe('nada')
    expect(host.textContent).toContain('0 de 3 unidades contadas')
    // La lista de transferencias ⛔ está mientras se recibe: la tarea ocupa la pantalla.
    expect(host.querySelector('.mo-lista-fila, [role="listitem"]')).toBeNull()
    const mas = host.querySelector('button[aria-label="Más REMERA OVERSIZE · M"]') as HTMLButtonElement
    expect(mas.style.height).toBe('44px')
    await click(mas)
    expect(tarjeta().dataset.tono).toBe('warning')
    expect(tarjeta().textContent).toContain('faltan 2')
    await click(mas); await click(mas)
    expect(tarjeta().dataset.tono).toBe('success')
    expect(host.textContent).toContain('3 de 3 unidades contadas')
    const recibir = [...elPie()!.querySelectorAll('button')].find((b) => b.textContent === 'Recibir completa')!
    await click(recibir)
    expect(m.recibirTransferenciaDoc).toHaveBeenCalledWith('stunned', ID, [{ product_id: '10', size_id: '1', sku: 'STU-REM-0019-M', barcode: '779001', cantidad: 3 }])
    expect(elPie()).toBeNull()
  })

  it('en la compu sigue la tabla con el campo de número y ⛔ hay pie', async () => {
    await abrirRecibir('/erp/stock/transferencias/mover?movil=0')
    expect(host.querySelector('[data-tono]')).toBeNull()
    expect(host.querySelector('input[aria-label="Cantidad de REMERA OVERSIZE · M"]')).toBeTruthy()
    expect(elPie()).toBeNull()
    expect(boton('Recibir con 3 u de menos')).toBeTruthy()
  })
})

describe('Nuevo ajuste en el celular', () => {
  async function abrirAjuste(url: string) {
    const { AjustesStock } = await import('@/components/erp/AjustesStock')
    await montar(<ProveedorLineaErp value="zattia"><AjustesStock pedida={{ linea: 'zattia', ...TOP }} /></ProveedorLineaErp>, url)
  }

  it('la cantidad grande con el antes → después; «Guardar ajuste» fijo al pie manda lo que sale', async () => {
    await abrirAjuste('/erp/stock/ajustes?movil=1')
    const tarjeta = host.querySelector('[data-tarjeta-ajuste]') as HTMLElement
    expect(tarjeta.textContent).toContain('TOP ZARA · NEGRO')
    expect(tarjeta.textContent).toContain('el ERP dice 5 en Local')
    const guardar = () => [...elPie()!.querySelectorAll('button')].find((b) => b.textContent === 'Guardar ajuste')!
    expect(guardar().disabled).toBe(true)
    await click(host.querySelector('button[aria-label="Más TOP ZARA · NEGRO"]')!)
    await click(host.querySelector('button[aria-label="Más TOP ZARA · NEGRO"]')!)
    // Fallado cuenta lo que SALE: 5 → 3.
    expect(host.querySelector('[data-antes-despues]')!.textContent).toBe('Antes 5→Después 3-2')
    expect(guardar().disabled).toBe(false)
    await click(guardar())
    expect(m.crearAjuste).toHaveBeenCalledWith({ linea: 'zattia', deposito: 'local', motivo: 'fallado', detalle: '', fuente: 'mano',
      renglones: [{ producto: '828948', talle: '229042', sku: 'RTO-0152-NG', barcode: '7790152', cantidad: 2 }] })
    expect(m.aprobarAjuste).toHaveBeenCalledWith('zattia', 'nuevo-8')
    expect(elPie()).toBeNull()
  })

  it('en la compu sigue la tabla y los botones abajo del formulario', async () => {
    await abrirAjuste('/erp/stock/ajustes?movil=0')
    expect(host.querySelector('[data-tarjeta-ajuste]')).toBeNull()
    expect(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]')).toBeTruthy()
    expect(elPie()).toBeNull()
    expect(boton('Guardar ajuste')).toBeTruthy()
  })
})
