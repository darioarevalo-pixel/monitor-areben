// @vitest-environment jsdom
// La pantalla del lector con la Zebra (tanda 4, Darío 12-oct-2026): el botón de las «para exhibir»
// imprime la etiqueta que le toca a la prenda, y la impresión rápida reimprime la de código de barras.
// Se monta el `ArmadoLector` de verdad; sólo se reemplazan los precios, la red y el PDF.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const pdf = {
  buildEtiquetasPdf: vi.fn(async (..._a: unknown[]) => ({ etiqueta: true })),
  buildLibrePdf: vi.fn(async (..._a: unknown[]) => ({ libre: true })),
  imprimirPdf: vi.fn(),
}
vi.mock('@/lib/etiquetas/pdf', () => pdf)
vi.mock('@/lib/api-fetch', () => ({ apiFetch: async () => new Response(JSON.stringify({ ok: true })) }))
vi.mock('@/lib/sonido', () => ({ avisar: () => {}, prepararSonido: () => {} }))
vi.mock('@/components/etiquetas/useEtiquetasTn', () => ({ useEtiquetasTn: () => ({ tnProducts: [], tnIdx: {}, cargando: false, leidoEn: 0, refrescar: async () => {} }) }))
vi.mock('@/lib/etiquetas/core', async (orig) => ({
  ...(await orig<typeof import('@/lib/etiquetas/core')>()),
  // Precio de Tienda Nube: el corset sale más caro que en la campaña, para ver que gana la campaña.
  construirPrecios: () => ({ precios: { '700': 25990, '1': 29990 }, promos: {}, fueraDeTn: new Set() }),
}))
vi.mock('@/components/etiquetas/useEtiquetasCampania', async (orig) => ({
  ...(await orig<typeof import('@/components/etiquetas/useEtiquetasCampania')>()),
  useEtiquetasCampania: () => ({
    campanias: [],
    rotulo: { id: 'l1', nombre: 'Feria Septiembre 2026', nombreComercial: 'FERIA ZATTIA', etiqueta: { tamTitulo: 'titulo', abajo: [], tamPrecio: 15 } },
    porPid: { '700': { pid: '700', nombre: 'CORSET FRANK', imagen: null, precio: 11990, firme: true } },
    porPrecio: [],
    cargando: false,
    error: null,
  }),
}))

const { ArmadoLector } = await import('@/components/reposicion/ArmadoLector')
const { ToastProvider } = await import('@/components/ui/Toast')

const linea = (x: Record<string, unknown>) => ({ vid: '1_1', pid: '1', sid: '1', sku: 'RTO-0001-S', barcode: '779001', name: 'TOP ZOE', size: 'S', cant: 1, exhibir: false, ...x })
const armado = {
  id: 'ra1_abc123',
  linea: 'zattia',
  sentido: 'llevar',
  fecha: '2026-10-13',
  persona: 'Lorena',
  estado: 'en_curso',
  pedido: [
    linea({ vid: '700_5', pid: '700', sid: '5', sku: 'RCO-0010-NG', barcode: '779700', name: 'CORSET FRANK', size: 'Negro', exhibir: true }),
    linea({ exhibir: true }),
    linea({ vid: '2_1', pid: '2', sku: 'RBO-0002-M', barcode: '779002', name: 'BODY LIA', size: 'M' }),
  ],
  escaneos: {},
  faltantes: {},
  transfer: null,
  error: null,
  creado_en: '2026-10-13T10:00:00Z',
  actualizado_en: '2026-10-13T10:00:00Z',
  cerrado_en: null,
} as never
const inv = [
  { vid: '9_1', pid: '9', sid: '1', name: 'MINI BLUSH', size: 'S', sku: 'RMI-0009-S', barcode: '779009', local: 1, deposito: 4 },
  { vid: '9_2', pid: '9', sid: '2', name: 'MINI BLUSH', size: 'M', sku: 'RMI-0009-M', barcode: '779010', local: 0, deposito: 3 },
] as never

let host: HTMLDivElement
async function montar() {
  host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <ToastProvider>
        <ArmadoLector armado={armado} inv={inv} allProductos={[]} campaniaEtiqueta="l1" onSalir={() => {}} onTerminado={() => {}} />
      </ToastProvider>,
    )
  })
}
const boton = (txt: string) => [...host.querySelectorAll('button')].find((b) => (b.textContent || '').includes(txt))
async function clic(b: HTMLButtonElement | undefined) {
  expect(b, 'botón').toBeTruthy()
  await act(async () => {
    b!.click()
  })
}
async function escribir(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    set.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  pdf.buildEtiquetasPdf.mockClear()
  pdf.buildLibrePdf.mockClear()
  pdf.imprimirPdf.mockClear()
})

describe('etiquetas de las «para exhibir»', () => {
  it('al escanear la de la campaña, el botón dice qué sale e imprime SÓLO la de la campaña, a su precio', async () => {
    await montar()
    const lector = host.querySelector('input[name="codigo-prenda"]') as HTMLInputElement
    await act(async () => {
      lector.value = '779700'
      lector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const b = boton('Imprimir: Etiqueta de campaña · $11.990')
    await clic(b)
    expect(pdf.buildLibrePdf).toHaveBeenCalledTimes(1)
    expect(pdf.buildLibrePdf.mock.calls[0][0]).toMatchObject({ precio: 11990, copias: 1, lineas: [{ texto: 'FERIA ZATTIA' }] })
    expect(pdf.buildEtiquetasPdf).not.toHaveBeenCalled()
    expect(pdf.imprimirPdf).toHaveBeenCalledTimes(1)
  })

  it('la regular, desde su renglón: precio + formas de pago', async () => {
    await montar()
    const fila = [...host.querySelectorAll('tr')].find((tr) => tr.textContent?.includes('TOP ZOE'))!
    await clic([...fila.querySelectorAll('button')].find((b) => b.textContent === 'Etiquetas') as HTMLButtonElement)
    const [labels, modo] = pdf.buildEtiquetasPdf.mock.calls[0] as [unknown[], string]
    expect(modo).toBe('loc')
    expect(labels).toMatchObject([{ pid: '1', barcode: '779001' }, { __fp: true }])
  })

  it('la que no es para exhibir no tiene botón de etiquetas', async () => {
    await montar()
    const fila = [...host.querySelectorAll('tr')].find((tr) => tr.textContent?.includes('BODY LIA'))!
    expect([...fila.querySelectorAll('button')].some((b) => b.textContent === 'Etiquetas')).toBe(false)
  })
})

describe('impresión rápida', () => {
  it('busca por nombre y talle e imprime la etiqueta de código de barras (sin precio)', async () => {
    await montar()
    await clic(boton('Impresión rápida'))
    const buscar = host.querySelector('input[aria-label="Buscar prenda para imprimir"]') as HTMLInputElement
    await escribir(buscar, 'mini blush m')
    expect(host.textContent).toContain('RMI-0009-M')
    expect(host.textContent).not.toContain('RMI-0009-S')
    await clic(boton('Imprimir'))
    const [labels, modo] = pdf.buildEtiquetasPdf.mock.calls[0] as [unknown[], string]
    expect(modo).toBe('dep')
    expect(labels).toMatchObject([{ sku: 'RMI-0009-M', barcode: '779010' }])
  })
})
