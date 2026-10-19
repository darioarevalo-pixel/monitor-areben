// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MesFacturacion } from '@/lib/erp/cliente'
import type { FacturaEmitida } from '@/lib/arca/factura-pdf'

/**
 * **ERP › Facturación con el molde, del lado de la pantalla** (🎨 Diseño 7). El oráculo es lo que se LEE y lo que se
 * APRIETA: el tope y lo pendiente arriba, las tres vistas con su número (sólo la marca del menú), que tildar arme la barra
 * con «Facturar» y mande SÓLO ids, y que la pantalla DIGA por qué ⛔ se puede (pasa lo pendiente, facturación apagada).
 */
const base: MesFacturacion = {
  mes: '2026-10', ambiente: 'homologacion', errorAmbiente: null, estado: 'abierto', cerradoPor: null, cerradoEn: null,
  techo: 1_000_000, techoCalculado: 1_000_000, facturadoGN: 300_000, facturadoMonitor: 100_000, facturado: 400_000, pendiente: 600_000,
  sinClasificar: [], porPedido: 100, puntosDeVenta: { zattia: 9, bdi: 8 },
  ventas: [
    { marca: 'zattia', ventaId: '501', fecha: '2026-10-03', monto: 50_000, cuentas: ['Mercado Pago'], numero: '7001', cliente: 'Sofía R.' },
    { marca: 'zattia', ventaId: '502', fecha: '2026-10-05', monto: 700_000, cuentas: ['Transferencia AREBEN'], numero: '7002', cliente: null },
    { marca: 'bdi', ventaId: '900', fecha: '2026-10-04', monto: 10_000, cuentas: ['Pago Nube'], numero: '1', cliente: 'Otra marca' },
  ],
  facturasGN: [
    { marca: 'zattia', ventaId: '480', numero: 'B 00005-00012144', tipo: 'B', cae: '7612', estado: 'APROBADO', fecha: '2026-10-02', monto: 300_000, venta: { numero: '6990', cliente: 'Juana' } },
  ],
}
const emitida = (o: Partial<FacturaEmitida>): FacturaEmitida => ({
  id: 'f1', ambiente: 'homologacion', marca: 'zattia', venta_id: '470', venta_numero: '6980', renglones: [], tipo: 6, pto_vta: 9, numero: 12,
  fecha: '2026-10-06', total: 100_000, neto: 82_644.63, iva: 17_355.37, doc_tipo: 99, doc_nro: 0, cond_iva: 5, estado: 'autorizada', cae: '7699', cae_vence: '2026-10-16', ...o,
})
let mes: MesFacturacion = base
const leerMes = vi.fn(async () => mes)
const leerFacturas = vi.fn(async () => ({ ambiente: 'homologacion', facturas: [emitida({}), emitida({ id: 'f2', tipo: 8, numero: 3, total: 100_000 })] }))
const facturar = vi.fn(async (..._a: unknown[]) => ({ ambiente: 'homologacion', ptoVta: 9, autorizadas: [{ ventaId: '501', numero: 13, cae: '1', total: 50_000 }], rechazadas: [], noSalen: [] }))
vi.mock('@/lib/erp/cliente', () => ({
  leerMes: () => leerMes(), leerFacturas: () => leerFacturas(), facturar: (...a: unknown[]) => facturar(...a), cerrarMes: vi.fn(), notaDeCredito: vi.fn(),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))
const confirmar = vi.fn(async () => true)
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<typeof import('@/components/ui')>()), useConfirmar: () => ({ confirmar }) }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks(); mes = base })

async function montar() {
  const { Facturacion } = await import('@/components/erp/Facturacion')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<Facturacion />) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''
const boton = (t: RegExp) => [...host.querySelectorAll('button')].find((b) => t.test(b.textContent ?? ''))
const filas = () => [...host.querySelectorAll('[role="row"]')].map((r) => r.textContent ?? '')
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => {}) }
const vista = (t: RegExp) => [...host.querySelectorAll('[role="tab"]')].find((b) => t.test(b.textContent ?? ''))!

describe('ERP › Facturación con el molde', () => {
  it('arriba el tope, lo facturado con su % y lo pendiente; las vistas cuentan sólo la marca del menú', async () => {
    await montar()
    expect(texto()).toContain('Tope del mes')
    expect(texto()).toMatch(/40 % del tope/)
    expect(texto()).toMatch(/Pendiente de facturar/)
    expect(vista(/Sin factura/).textContent).toMatch(/2$/)
    expect(vista(/^Facturas/).textContent).toMatch(/2$/)
    expect(vista(/Notas de crédito/).textContent).toMatch(/1$/)
    expect(filas().some((f) => f.includes('Otra marca'))).toBe(false)
    expect(filas().some((f) => f.includes('#7001') && f.includes('Sofía R.'))).toBe(true)
    expect(filas().some((f) => f.includes('#7002') && f.includes('Consumidor final'))).toBe(true)
  })

  it('clic en la fila la tilda ⇒ la barra suma y «Facturar» manda SÓLO los ids, después de confirmar', async () => {
    await montar()
    const fila = [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes('#7001'))!
    await clic(fila)
    expect(texto()).toContain('1 elegida')
    await clic(boton(/^Facturar$/)!)
    expect(confirmar).toHaveBeenCalledOnce()
    expect(facturar).toHaveBeenCalledWith('2026-10', 'zattia', ['501'])
    expect(texto()).toMatch(/1 factura\(s\) autorizada\(s\)/)
  })

  it('lo elegido que pasa lo pendiente ⛔ ofrece Facturar: dice por qué', async () => {
    await montar()
    for (const n of ['#7001', '#7002']) await clic([...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(n))!)
    expect(texto()).toContain('2 elegidas')
    expect(texto()).toMatch(/Pasa lo pendiente del mes/)
    expect(boton(/^Facturar$/)).toBeUndefined()
  })

  it('con la facturación apagada lo dice arriba y en la barra', async () => {
    mes = { ...base, ambiente: null, errorAmbiente: 'Facturación real APAGADA.' }
    await montar()
    expect(texto()).toContain('Facturación real APAGADA.')
    expect(texto()).toContain('se factura en Gestión Nube')
    const fila = [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes('#7001'))!
    await clic(fila)
    expect(texto()).toContain('La facturación está apagada')
    expect(boton(/^Facturar$/)).toBeUndefined()
  })

  it('Facturas: las de GN y las del ERP juntas; la que tiene NC dice «anulada con NC»; la NC resta', async () => {
    await montar()
    await clic(vista(/^Facturas/))
    expect(filas().some((f) => f.includes('Factura B 00005-00012144') && f.includes('Gestión Nube') && f.includes('Juana'))).toBe(true)
    expect(filas().some((f) => f.includes('Factura B 00009-00000012') && f.includes('anulada con NC'))).toBe(true)
    await clic(vista(/Notas de crédito/))
    expect(filas().some((f) => f.includes('NC B 00009-00000003') && f.includes('−'))).toBe(true)
  })
})
