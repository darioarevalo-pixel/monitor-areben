// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProveedorLineaErp } from '@/lib/erp/linea-erp'

/**
 * **ERP › Stock › Mover y recibir, del lado de la pantalla.** El oráculo es lo que se APRIETA y lo que viaja al motor:
 * escanear dos veces suma 2, «Mover» hace crear → armar → enviar con los mismos renglones (ids y cantidad), y «Recibir»
 * manda lo escaneado al llegar (lo que no se escanea ⛔ viaja).
 */
const REM = { producto: '10', talle: '1', sku: 'STU-REM-0019-M', barcode: '779001', nombre: 'REMERA', talleNombre: 'M', gn: 0 }
const doc = (x: Record<string, unknown>) => ({ id: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12), numero: 7, linea: 'stunned', desde: 'deposito', hacia: 'local', origen: 'libre', estado: 'en_transito', nota: null, creada_por: 'Bruno', creada_en: '2026-10-26T20:00:00Z', enviada_por: 'Bruno', enviada_en: '2026-10-26T20:01:00Z', recibida_por: null, recibida_en: null, diferencias: [], renglones: [{ n: 1, product_id: 10, size_id: 1, sku: 'STU-REM-0019-M', barcode: '779001', pedida: 0, armada: 3, enviada: 3, recibida: null }], ...x })
const res = (t: unknown, extra = {}) => ({ ok: true, transferencia: t, ya: false, movimientos: 1, unidades: 2, diferencias: [], avisos: [], ...extra })
const m = vi.hoisted(() => ({
  buscarPrendas: vi.fn(), leerListaDeStock: vi.fn(), leerTransferenciasDoc: vi.fn(), crearTransferenciaDoc: vi.fn(), armarTransferenciaDoc: vi.fn(), enviarTransferenciaDoc: vi.fn(), recibirTransferenciaDoc: vi.fn(), cancelarTransferenciaDoc: vi.fn(),
  leerDepositos: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => m)

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })
beforeEach(() => {
  m.leerListaDeStock.mockResolvedValue({ filas: [{ producto: '10', talle: '1', nombre: 'REMERA OVERSIZE', talleNombre: 'M' }] })
  // El depósito Evento (motor sql/058) apagado: los selects son los de siempre.
  m.leerDepositos.mockResolvedValue({ depositos: [{ id: 'evento', nombre: 'Evento', activo: false, deGN: false, unidades: 0 }] })
})

const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
async function montar() {
  const { MoverYRecibir } = await import('@/components/erp/stock/MoverYRecibir')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<ProveedorLineaErp value="stunned"><MoverYRecibir /></ProveedorLineaErp>) })
  await esperar()
}
async function escribir(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement
async function abrirFicha() {
  await act(async () => { (document.querySelector('[role="row"].mo-lista-fila') as HTMLElement).click() })
}
async function escanear(codigo: string) {
  const caja = document.querySelector('input[placeholder^="Código"]') as HTMLInputElement
  await escribir(caja, codigo)
  await act(async () => { caja.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  await esperar()
}

describe('Mover y recibir', () => {
  it('el Evento (motor sql/058) aparece en «Sale de» y «Va a» sólo si está ACTIVO', async () => {
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [], enTransito: [] })
    await montar()
    const opciones = () => [...document.querySelectorAll('select')].map((x) => [...x.options].map((o) => o.value))
    expect(opciones().flat()).not.toContain('evento')
    act(() => root?.unmount()); root = null; host.remove()
    m.leerDepositos.mockResolvedValue({ depositos: [{ id: 'evento', nombre: 'Evento', activo: true, deGN: false, unidades: 0 }] })
    await montar()
    const [sale, va] = opciones()
    expect(sale).toContain('evento'); expect(va).toContain('evento')
  })

  it('dos escaneos suman 2 y «Mover» crea, arma y envía con esos renglones', async () => {
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [], enTransito: [] })
    m.buscarPrendas.mockResolvedValue({ variantes: [REM], cortado: false })
    const t = doc({ estado: 'borrador' })
    m.crearTransferenciaDoc.mockResolvedValue(res(t)); m.armarTransferenciaDoc.mockResolvedValue(res(t)); m.enviarTransferenciaDoc.mockResolvedValue(res(doc({}), { unidades: 2 }))
    await montar()
    await escanear('779001'); await escanear('779001')
    expect(m.buscarPrendas).toHaveBeenCalledWith('zattia', '779001')
    expect(boton('Mover 2 u')).toBeTruthy()
    await act(async () => { boton('Mover 2 u').click() })
    await esperar()
    const renglones = [{ product_id: '10', size_id: '1', sku: 'STU-REM-0019-M', barcode: '779001', cantidad: 2 }]
    expect(m.crearTransferenciaDoc).toHaveBeenCalledWith('stunned', 'deposito', 'local', renglones)
    expect(m.armarTransferenciaDoc).toHaveBeenCalledWith('stunned', t.id, renglones)
    expect(m.enviarTransferenciaDoc).toHaveBeenCalledWith('stunned', t.id)
    expect(document.body.textContent).toContain('T-7 en tránsito')
  })

  it('si «armar» falla, el error dice que no salió nada y NO se envía', async () => {
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [], enTransito: [] })
    m.buscarPrendas.mockResolvedValue({ variantes: [REM], cortado: false })
    m.crearTransferenciaDoc.mockResolvedValue(res(doc({ estado: 'borrador' }))); m.armarTransferenciaDoc.mockRejectedValue(new Error('Se cayó'))
    await montar()
    await escanear('779001')
    await act(async () => { boton('Mover 1 u').click() })
    await esperar()
    expect(m.enviarTransferenciaDoc).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('no salió nada del stock')
  })

  it('«Recibir» arranca en 0, suma lo escaneado y manda sólo eso; con faltante lo dice', async () => {
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [doc({})], enTransito: [] })
    m.buscarPrendas.mockResolvedValue({ variantes: [REM], cortado: false })
    m.recibirTransferenciaDoc.mockResolvedValue(res(doc({ estado: 'recibida' }), { diferencias: [{ sku: 'STU-REM-0019-M', enviada: 3, recibida: 2, diferencia: -1 }] }))
    await montar()
    await abrirFicha()
    expect(document.body.textContent).toContain('REMERA OVERSIZE · M')
    await act(async () => { boton('Recibir').click() })
    expect(boton('Recibir con 3 u de menos')).toBeTruthy()
    await escanear('779001'); await escanear('779001')
    expect(boton('Recibir con 1 u de menos')).toBeTruthy()
    await act(async () => { boton('Recibir con 1 u de menos').click() })
    await esperar()
    expect(m.recibirTransferenciaDoc).toHaveBeenCalledWith('stunned', doc({}).id, [{ product_id: '10', size_id: '1', sku: 'STU-REM-0019-M', barcode: '779001', cantidad: 2 }])
    expect(document.body.textContent).toContain('recibida con 1 u de menos')
  })

  it('una transferencia PEDIDA (borrador) se PREPARA escaneando: arma lo escaneado y la envía', async () => {
    const pedida = doc({ estado: 'borrador', enviada_por: null, enviada_en: null, renglones: [{ n: 1, product_id: 10, size_id: 1, sku: 'STU-REM-0019-M', barcode: '779001', pedida: 2, armada: 0, enviada: 0, recibida: null }] })
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [pedida], enTransito: [] })
    m.buscarPrendas.mockResolvedValue({ variantes: [REM], cortado: false })
    m.armarTransferenciaDoc.mockResolvedValue(res(pedida)); m.enviarTransferenciaDoc.mockResolvedValue(res(doc({}), { unidades: 2 }))
    await montar()
    await abrirFicha()
    expect(boton('Recibir')).toBeUndefined()
    await act(async () => { boton('Preparar').click() })
    expect((boton('Enviar con 2 u de menos') as HTMLButtonElement).disabled).toBe(true)
    await escanear('779001'); await escanear('779001')
    await act(async () => { boton('Enviar completa').click() })
    await esperar()
    const renglones = [{ product_id: '10', size_id: '1', sku: 'STU-REM-0019-M', barcode: '779001', cantidad: 2 }]
    expect(m.armarTransferenciaDoc).toHaveBeenCalledWith('stunned', pedida.id, renglones)
    expect(m.enviarTransferenciaDoc).toHaveBeenCalledWith('stunned', pedida.id)
    expect(document.body.textContent).toContain('en tránsito')
  })

  it('si el ERP rechaza al preparar (rol sin permiso), el error se ve AL LADO del botón y lo escaneado queda', async () => {
    const pedida = doc({ estado: 'borrador', enviada_por: null, enviada_en: null, renglones: [{ n: 1, product_id: 10, size_id: 1, sku: 'STU-REM-0019-M', barcode: '779001', pedida: 1, armada: 0, enviada: 0, recibida: null }] })
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [pedida], enTransito: [] })
    m.buscarPrendas.mockResolvedValue({ variantes: [REM], cortado: false })
    m.armarTransferenciaDoc.mockRejectedValue(new Error('Tu rol no puede hacer esto en el ERP.'))
    await montar()
    await abrirFicha()
    await act(async () => { boton('Preparar').click() })
    await escanear('779001')
    await act(async () => { boton('Enviar completa').click() })
    await esperar()
    const tarjeta = boton('Enviar completa').closest('section, [class*="card"], div')!.parentElement!
    expect(tarjeta.textContent).toContain('Tu rol no puede hacer esto en el ERP.')
    expect(m.enviarTransferenciaDoc).not.toHaveBeenCalled()
  })

  it('una prenda que no salió en la transferencia frena «Recibir»', async () => {
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [doc({})], enTransito: [] })
    m.buscarPrendas.mockResolvedValue({ variantes: [{ ...REM, producto: '99', talle: '5', sku: 'STU-OTRA-S', barcode: '779999' }], cortado: false })
    await montar()
    await abrirFicha()
    await act(async () => { boton('Recibir').click() })
    await escanear('779999')
    expect(document.body.textContent).toContain('no salieron en esta transferencia')
    expect((boton('Recibir con') as HTMLButtonElement).disabled).toBe(true)
  })

  it('la nota viaja como 5º argumento sólo si se escribió', async () => {
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [], enTransito: [] })
    m.buscarPrendas.mockResolvedValue({ variantes: [REM], cortado: false })
    const t = doc({ estado: 'borrador' })
    m.crearTransferenciaDoc.mockResolvedValue(res(t)); m.armarTransferenciaDoc.mockResolvedValue(res(t)); m.enviarTransferenciaDoc.mockResolvedValue(res(doc({})))
    await montar()
    await escanear('779001')
    await escribir(document.querySelector('input[placeholder^="Para qué"]') as HTMLInputElement, 'Para el local de Rosario')
    await act(async () => { boton('Mover 1 u').click() })
    await esperar()
    expect(m.crearTransferenciaDoc).toHaveBeenCalledWith('stunned', 'deposito', 'local', [{ product_id: '10', size_id: '1', sku: 'STU-REM-0019-M', barcode: '779001', cantidad: 1 }], 'Para el local de Rosario')
  })

  it('la ficha de una recibida con faltantes muestra la diferencia y no ofrece «Recibir»', async () => {
    const r = doc({ estado: 'recibida', recibida_por: 'Ana', recibida_en: '2026-10-26T21:00:00Z', diferencias: [{ sku: 'STU-REM-0019-M', enviada: 3, recibida: 2, diferencia: -1 }], renglones: [{ n: 1, product_id: 10, size_id: 1, sku: 'STU-REM-0019-M', barcode: '779001', pedida: 0, armada: 3, enviada: 3, recibida: 2 }] })
    m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [r], enTransito: [] })
    await montar()
    await act(async () => { [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('Recibidas'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await abrirFicha()
    expect(document.body.textContent).toContain('Faltaron 1 u al recibir')
    expect(document.body.textContent).toContain('2 (-1)')
    expect(boton('Recibir')).toBeUndefined()
    expect(boton('Imprimir remito')).toBeTruthy()
  })
})
