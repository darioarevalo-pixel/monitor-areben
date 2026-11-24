// @vitest-environment jsdom
import type { PrendaAAjustar } from '@/components/erp/stock/StockErp'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarAContar, filaDeAjuste } from '@/lib/erp/ajuste.core.js'
import type { AjustesDeLinea } from '@/lib/erp/cliente'
import { ProveedorLineaErp } from '@/lib/erp/linea-erp'

/**
 * **ERP › Stock › Conteos y ajustes, del lado de la pantalla** (Diseño, 19-oct). El oráculo es lo que se LEE y lo que se
 * MANDA: ⛔ «A contar» ni «Conteo» a mano (Bruno: ⛔ se cuenta en el ERP); «Guardar ajuste» manda lo que SALE en positivo
 * y APLICA en el mismo gesto (aprobación apagada); si aplicar falla, queda «Sin confirmar» y ⛔ se crea dos veces; la lista
 * abre la ficha con antes → después.
 */
const conciliacion = { fecha: '2026-10-19', calculadoEn: '2026-10-19T16:40:00Z', grupos: [{ tipo: 'stock_tn', clase: 'libro_aparte', filas: [
  { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', tn: 12, erp: 0, gn: 12, dias: 2 },
] }] }
const pendiente = { id: '0d6c3f0e-0000-4000-8000-000000000001', numero: 7, linea: 'zattia', deposito: 'local', motivo: 'fallado', estado: 'para_aprobar', fuente: 'mano',
  creado_por: 'camila', creado_en: '2026-10-19T13:00:00Z', renglones: [{ n: 1, product_id: 370642, size_id: 76584, sku: 'RTO-0013-BL', antes: 7, contado: null, diferencia: -1, ahora: 7 }] }
const igualado = { id: '0d6c3f0e-0000-4000-8000-000000000002', numero: 5, linea: 'zattia', deposito: 'deposito', motivo: 'otro', detalle: 'Igualado a Gestión Nube (Bruno, 19-oct) · causa: transferencia', estado: 'aplicado', fuente: 'mano',
  creado_por: 'bruno', creado_en: '2026-10-19T12:00:00Z', resuelto_por: 'bruno', resuelto_en: '2026-10-19T12:00:01Z', renglones: [{ n: 1, product_id: 828948, size_id: 229042, sku: 'RTO-0152-NG', antes: 0, contado: null, diferencia: 12, ahora: 12 }] }
const datos = (): AjustesDeLinea => ({ ...armarAContar({ linea: 'zattia', conciliacion, contar: [], ajustes: [] }), sinConciliacion: false, ajustes: [filaDeAjuste(pendiente), filaDeAjuste(igualado)] }) as AjustesDeLinea
const prenda = { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', barcode: '7790152' }
const leerAjustes = vi.fn(async (..._a: unknown[]) => datos())
const leerStockDePrenda = vi.fn(async (..._a: unknown[]) => ({ prenda: { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', barcode: '7790152' },
  depositos: [{ deposito: 'local', libro: 5, gn: 12, diferencia: 7 }, { deposito: 'deposito', libro: 3, gn: 3, diferencia: 0 }], historial: [], sinDeposito: [] }))
const crearAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 8, id: 'nuevo-8', renglones: 1, avisos: [{ codigo: 'CONTEO_DE_DEPOSITO_RECIENTE', texto: 'Este producto tiene un conteo de Depósito (C-31)' }] }))
const aprobarAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 7, movimientos: 1, avisos: [] }))
const descartarAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 7 }))
const eliminarAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 5, movimientos: 1 }))
vi.mock('@/lib/erp/cliente', () => ({
  leerAjustes: (...a: unknown[]) => leerAjustes(...a), leerStockDePrenda: (...a: unknown[]) => leerStockDePrenda(...a),
  crearAjuste: (...a: unknown[]) => crearAjuste(...a), aprobarAjuste: (...a: unknown[]) => aprobarAjuste(...a),
  descartarAjuste: (...a: unknown[]) => descartarAjuste(...a), eliminarAjuste: (...a: unknown[]) => eliminarAjuste(...a), buscarPrendas: vi.fn(async () => ({ variantes: [prenda], cortado: false })),
  // La lista de stock de la línea (la misma de Transferencias): el código se resuelve acá, sin ir al servidor.
  leerListaDeStock: vi.fn(async () => ({ filas: [{ ...prenda, deps: { local: 5, deposito: 3 } }] })),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; window.confirm = () => true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar(pedida: PrendaAAjustar | null = null, enErp = false) {
  const { AjustesStock } = await import('@/components/erp/AjustesStock')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ProveedorLineaErp value={pedida?.linea === 'stunned' ? 'stunned' : 'zattia'}><AjustesStock pedida={pedida} enErp={enErp} /></ProveedorLineaErp>) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''
const elegirSalida = async (motivo = 'fallado') => {
  await act(async () => { ([...document.querySelectorAll('button')].find((b) => b.textContent === 'Salida') as HTMLButtonElement).click() })
  const sel = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === motivo)) as HTMLSelectElement
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, motivo); sel.dispatchEvent(new Event('change', { bubbles: true })) })
}
const boton = (t: string | RegExp) => [...document.body.querySelectorAll('button')].find((b) => (typeof t === 'string' ? b.textContent === t : t.test(b.textContent ?? ''))) as HTMLButtonElement
const click = async (b: HTMLButtonElement) => { await act(async () => { b.click() }); await act(async () => {}) }
/** El buscador de Transferencias: el código de barras exacto suma el producto (como la pistola). */
async function escanear(codigo: string) {
  const caja = host.querySelector('input[placeholder^="Código"]') as HTMLInputElement
  escribir(caja, codigo)
  await act(async () => { caja.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  await act(async () => {})
}
function escribir(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('Ingresos y ajustes', () => {
  it('sin carteles que explican (Darío, 19-nov): ⛔ el aviso de Gestión Nube ni el subtítulo', async () => {
    await montar()
    expect(texto()).not.toContain('Gestión Nube se ajusta')
    expect(texto()).not.toContain('Nada se borra')
  })

  it('⛔ «A contar» ni «Conteo» a mano; lista los ajustes y lo que quedó sin aplicar', async () => {
    await montar()
    expect(leerAjustes).toHaveBeenCalledWith('zattia')
    expect(texto()).not.toContain('A contar')
    expect(texto()).toContain('Todos2')
    expect(texto()).toContain('Pendientes1')
    expect(texto()).toContain('Igualado a Gestión Nube')
    await click(boton('Nuevo ajuste'))
    await elegirSalida()
    const motivos = [...host.querySelectorAll('option')].map((o) => o.textContent)
    expect(motivos).toContain('Con falla')
    expect(motivos).not.toContain('Conteo')
  })

  it('«Guardar ajuste» manda lo que sale en positivo y lo aplica en el mismo gesto', async () => {
    await montar()
    await click(boton('Nuevo ajuste'))
    await elegirSalida()
    await escanear('7790152')
    expect(leerStockDePrenda).toHaveBeenCalledWith('zattia', '828948', '229042')
    expect(boton('Sacar 1 unidad').disabled).toBe(false)
    escribir(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]') as HTMLInputElement, '-2')
    await act(async () => {})
    expect(boton('Sacar 2 unidades').disabled).toBe(false)
    await click(boton('Sacar 2 unidades'))
    expect(crearAjuste).toHaveBeenCalledWith({ linea: 'zattia', deposito: 'local', motivo: 'fallado', detalle: '', fuente: 'mano',
      renglones: [{ producto: '828948', talle: '229042', sku: 'RTO-0152-NG', barcode: '7790152', cantidad: 2 }] })
    expect(aprobarAjuste).toHaveBeenCalledWith('zattia', 'nuevo-8')
    expect(texto()).toContain('C-31')
  })

  it('🔴 una salida que deja el depósito en negativo: «Queda» en rojo, el porqué y ⛔ se guarda (el motor la rechaza)', async () => {
    await montar()
    await click(boton('Nuevo ajuste'))
    await elegirSalida()
    await escanear('7790152')
    escribir(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]') as HTMLInputElement, '-8')
    await act(async () => {})
    expect(host.querySelector('[data-negativo]')?.textContent).toBe('-3')
    expect(host.querySelector('[data-falta]')?.textContent).toBe('No hay stock suficiente en Local. Bajá lo marcado en rojo.')
    expect(texto()).not.toContain('motivo «Conteo»')
    expect(boton('Sacar 8 unidades').disabled).toBe(true)
    escribir(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]') as HTMLInputElement, '-5')
    await act(async () => {})
    expect(host.querySelector('[data-negativo]')).toBeNull()
    expect(boton('Sacar 5 unidades').disabled).toBe(false)
  })

  it('«Ingreso» suma con el porqué escrito y el botón dice qué falta (Bruno, 9-nov)', async () => {
    await montar()
    await click(boton('Nuevo ajuste'))
    expect(texto()).toContain('Elegí si es un ingreso o una salida')
    await click(boton('Ingreso'))
    await escanear('7790152')
    escribir(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]') as HTMLInputElement, '2')
    await act(async () => {})
    expect(texto()).toContain('Escribí el porqué')
    expect(boton('Ingresar 2 unidades').disabled).toBe(true)
    const porque = [...host.querySelectorAll('input')].find((i) => i.closest('label, div')?.textContent?.includes('Detalle') && i.placeholder.startsWith('Obligatorio')) as HTMLInputElement
    escribir(porque, 'apareció en el depósito')
    await act(async () => {})
    await click(boton('Ingresar 2 unidades'))
    expect(crearAjuste).toHaveBeenCalledWith({ linea: 'zattia', deposito: 'local', motivo: 'otro', detalle: 'apareció en el depósito', fuente: 'mano',
      renglones: [{ producto: '828948', talle: '229042', sku: 'RTO-0152-NG', barcode: '7790152', cantidad: 2 }] })
  })

  it('⚡ la pistola: el mismo código dos veces seguidas, sin redibujar en el medio, suma 2 (Darío, 19-nov: se perdía 1 de 10)', async () => {
    await montar()
    await click(boton('Nuevo ajuste'))
    await click(boton('Ingreso'))
    await escanear('7790152')
    const caja = host.querySelector('input[placeholder^="Código"]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      for (let i = 0; i < 3; i++) { set.call(caja, '7790152'); caja.dispatchEvent(new Event('input', { bubbles: true })); caja.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }
      await new Promise((r) => setTimeout(r, 0))
    })
    await act(async () => {})
    expect((host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]') as HTMLInputElement).value).toBe('4')
  })

  it('desde Stock («Ajustar»): abre «Nuevo ajuste» en su línea con el producto cargada y lo que dice el ERP', async () => {
    await montar({ linea: 'stunned', producto: '828948', talle: '229042', sku: 'STU-0152-NG', barcode: null, nombre: 'TOP ZARA', talleNombre: 'NEGRO' })
    expect(leerAjustes).toHaveBeenCalledWith('stunned')
    expect(leerStockDePrenda).toHaveBeenCalledWith('zattia', '828948', '229042')
    expect(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]')).toBeTruthy()
    expect(boton('Nuevo ajuste')).toBeUndefined()
  })

  it('si aplicar falla, lo dice y ⛔ deja el borrador para crearlo otra vez', async () => {
    aprobarAjuste.mockRejectedValueOnce(new Error('se cortó'))
    await montar()
    await click(boton('Nuevo ajuste'))
    await elegirSalida()
    await escanear('7790152')
    await click(boton('Sacar 1 unidad'))
    expect(texto()).toContain('A-8 quedó pendiente')
    expect(boton('Sacar 1 unidad')).toBeUndefined()
  })

  it('la fila abre la VENTANA; el pendiente se «Confirma» o se «Descarta» con el porqué (Darío, 19-nov)', async () => {
    await montar()
    const abrir = async (n: string) => { const fila = [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(n)) as HTMLElement; await act(async () => { fila.click() }) }
    await abrir('A-7')
    await click(boton('Confirmar ajuste'))
    expect(aprobarAjuste).toHaveBeenCalledWith('zattia', pendiente.id)
    await abrir('A-7')
    await click(boton('Descartar ajuste'))
    expect(boton('Descartar A-7').disabled).toBe(true)
    escribir(document.body.querySelector('input[placeholder="Ej.: se cargó otro modelo"]') as HTMLInputElement, 'otro modelo')
    await act(async () => {})
    await click(boton('Descartar A-7'))
    expect(descartarAjuste).toHaveBeenCalledWith('zattia', pendiente.id, 'otro modelo')
    await abrir('A-5')
    expect(document.body.textContent).toContain('Ajuste A-5')
    expect(document.body.textContent).toContain('+12')
  })

  it('«Eliminar» un aplicado (Bruno 18-nov): sólo si el motor lo deja; pregunta nombrándolo y queda «Eliminado» con quién', async () => {
    const abrir = async (n: string) => { const fila = [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(n)) as HTMLElement; await act(async () => { fila.click() }) }
    // Sin `eliminable` (de antes del corte, de otro trámite): ⛔ hay botón.
    await montar()
    await abrir('A-5')
    expect(boton('Eliminar ajuste')).toBeUndefined()
    act(() => root?.unmount()); root = null; host.remove()
    const eliminado = { ...igualado, id: '0d6c3f0e-0000-4000-8000-000000000003', numero: 4, estado: 'eliminado', eliminado_por: 'Bruno Arevalo', eliminado_en: '2026-11-19T15:10:00Z' }
    leerAjustes.mockImplementation(async () => ({ ...datos(), ajustes: [filaDeAjuste(pendiente), filaDeAjuste({ ...igualado, eliminable: true }), filaDeAjuste(eliminado)] }) as AjustesDeLinea)
    await montar()
    await abrir('A-5')
    // Sin proveedor, la confirmación cae en `window.confirm` con el texto plano: la pregunta nombra el ajuste. «Volver» ⛔ elimina.
    const pregunta = vi.fn(() => false)
    window.confirm = pregunta
    await click(boton('Eliminar ajuste'))
    expect(String((pregunta.mock.calls[0] as unknown[])[0])).toContain('¿Eliminar el ajuste A-5?')
    expect(eliminarAjuste).not.toHaveBeenCalled()
    window.confirm = () => true
    await click(boton('Eliminar ajuste'))
    expect(eliminarAjuste).toHaveBeenCalledWith('zattia', igualado.id)
    expect(texto()).toContain('Ajuste A-5 eliminado')
    await abrir('A-4')
    expect(document.body.textContent).toContain('Eliminado por')
    expect(document.body.textContent).toContain('Bruno Arevalo')
    expect(boton('Eliminar ajuste')).toBeUndefined()
    leerAjustes.mockImplementation(async () => datos())
  })
})
