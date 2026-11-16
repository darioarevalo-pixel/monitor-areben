// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «¿Es de un cliente que ya tenés?» en la tarjeta Pedidos (Darío §1): el verbo entero desde la pantalla. Elegir una ficha
 * anota el número del chat con quién es; «Es nuevo» (nombre; CUIT/DNI opcional, Darío/Bruno 15-nov) está apagado sin la llave de escribir
 * y, prendido, manda nombre, documento, número y persona.
 */
const cliente = vi.hoisted(() => ({
  buscarClientesPanel: vi.fn(), anotarWhatsappPanel: vi.fn(), clienteNuevoPanel: vi.fn(),
  leerPedidoPanel: vi.fn(), buscarProductosPedido: vi.fn(), cambiarPedidoPanel: vi.fn(), mandarAPrepararPanel: vi.fn(),
  anularPedidoPanel: vi.fn(), entrarPedidoPanel: vi.fn(), leerPedidosPanel: vi.fn(), leerPreparadosSinPagar: vi.fn(), leerPedidosSinCliente: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => cliente)
vi.mock('@/components/panel/CuentaCorriente', () => ({ useCuentaPrendida: () => true }))

import { ElegirCliente, PedidosSinCliente } from '@/components/panel/PedidosMayoristas'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const TEL = '5493411234567'
let root: Root
let caja: HTMLDivElement
const decir = vi.fn()
const onCambio = vi.fn()
const boton = (txt: string | RegExp) => {
  const b = [...document.querySelectorAll('button')].find((x) => (typeof txt === 'string' ? x.textContent?.trim() === txt : txt.test(x.textContent ?? '')))
  if (!b) throw new Error(`No está el botón «${txt}»`)
  return b
}
const esperar = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
const escribir = async (input: HTMLInputElement, valor: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const inputs = () => [...document.querySelectorAll<HTMLInputElement>('input')]
const montar = async (escribirPrendido: boolean) => {
  await act(async () => { root.render(<ElegirCliente tel={TEL} persona="Rodrigo" escribir={escribirPrendido} decir={decir} onCambio={onCambio} />) })
}

beforeEach(() => {
  for (const f of [...Object.values(cliente), decir, onCambio]) f.mockReset()
  cliente.buscarClientesPanel.mockResolvedValue({ prendido: true, clientes: [{ id: 'u1', nombre: 'Celulares Rosario', doc: '20123456786' }] })
  cliente.anotarWhatsappPanel.mockResolvedValue({ ok: true })
  cliente.clienteNuevoPanel.mockResolvedValue({ ok: true, cliente: { id: 'n1', nombre: 'Fundas Norte', doc: '30718508181' } })
  caja = document.createElement('div')
  document.body.appendChild(caja)
  root = createRoot(caja)
})
afterEach(() => { act(() => root.unmount()); caja.remove() })

describe('«¿Es de un cliente que ya tenés?»', () => {
  it('buscar y elegir anota el número del chat con quién es', async () => {
    await montar(false)
    expect(inputs()[0].value).toBe('Rodrigo')
    await escribir(document.querySelector<HTMLInputElement>('input[aria-label="Buscar el cliente"]')!, 'celu')
    await esperar(350)
    expect(cliente.buscarClientesPanel).toHaveBeenCalledWith('celu')
    await act(async () => { boton(/Celulares Rosario · 20123456786/).click() })
    await esperar()
    expect(cliente.anotarWhatsappPanel).toHaveBeenCalledWith({ clienteId: 'u1', whatsapp: TEL, nombre: 'Rodrigo' })
    expect(decir).toHaveBeenCalledWith('Listo: este número entra solo a Celulares Rosario.')
    expect(onCambio).toHaveBeenCalled()
  })

  it('«Es nuevo» apagado sin la llave de escribir', async () => {
    await montar(false)
    expect(boton('Es nuevo').disabled).toBe(true)
  })

  it('«Es nuevo» sin CUIT/DNI (Darío 15-nov): alcanza con el nombre, y manda número y persona', async () => {
    await montar(true)
    await act(async () => { boton('Es nuevo').click() })
    expect(boton('Crear cliente').disabled).toBe(true)
    const [, nombre] = inputs()
    await escribir(nombre, 'Fundas Norte')
    expect(boton('Crear cliente').disabled).toBe(false)
    await act(async () => { boton('Crear cliente').click() })
    await esperar()
    expect(cliente.clienteNuevoPanel).toHaveBeenCalledWith({ nombre: 'Fundas Norte', doc: '', whatsapp: TEL, persona: 'Rodrigo' })
  })

  it('«Es nuevo» con la llave y el CUIT/DNI cargado: lo manda', async () => {
    await montar(true)
    await act(async () => { boton('Es nuevo').click() })
    const [, nombre, doc] = inputs()
    await escribir(nombre, 'Fundas Norte')
    await escribir(doc, '30-71850818-1')
    await act(async () => { boton('Crear cliente').click() })
    await esperar()
    expect(cliente.clienteNuevoPanel).toHaveBeenCalledWith({ nombre: 'Fundas Norte', doc: '30-71850818-1', whatsapp: TEL, persona: 'Rodrigo' })
    expect(onCambio).toHaveBeenCalled()
  })

  it('el error del servidor (documento con ficha) se ve y ⛔ se da por hecho', async () => {
    cliente.clienteNuevoPanel.mockRejectedValue(new Error('Ese documento ya es de Celulares Rosario: buscalo y elegilo.'))
    await montar(true)
    await act(async () => { boton('Es nuevo').click() })
    const [, nombre, doc] = inputs()
    await escribir(nombre, 'Celus')
    await escribir(doc, '20123456786')
    await act(async () => { boton('Crear cliente').click() })
    await esperar()
    expect(document.body.textContent).toContain('Ese documento ya es de Celulares Rosario')
    expect(onCambio).not.toHaveBeenCalled()
  })
})

describe('«Sin cliente» sin chat (Bruno 15-nov: el número del pedido puede ⛔ tener chat)', () => {
  const PEDIDO = { id: 'p1', numero: 111, recibido_en: '2026-11-15T21:32:32.482Z', total: 4900, unidades: 1, nombre: 'Roberto', telefono: TEL }
  const montarLista = async () => { await act(async () => { root.render(<PedidosSinCliente />) }); await esperar() }
  beforeEach(() => {
    cliente.leerPedidosSinCliente.mockResolvedValueOnce({ prendido: true, pedidos: [PEDIDO] }).mockResolvedValue({ prendido: true, pedidos: [] })
    cliente.entrarPedidoPanel.mockResolvedValue({ ok: true, ya: false, sinCambios: false, avisarDeposito: false, ventaId: 'v2' })
  })

  it('elegir un cliente desde la lista le anota el número Y le pasa el pedido', async () => {
    await montarLista()
    await act(async () => { boton('Elegir cliente').click() })
    expect(inputs()[0].value).toBe('Roberto')
    await escribir(document.querySelector<HTMLInputElement>('input[aria-label="Buscar el cliente"]')!, 'celu')
    await esperar(350)
    await act(async () => { boton(/Celulares Rosario · 20123456786/).click() })
    await esperar()
    expect(cliente.anotarWhatsappPanel).toHaveBeenCalledWith({ clienteId: 'u1', whatsapp: TEL, nombre: 'Roberto' })
    expect(cliente.entrarPedidoPanel).toHaveBeenCalledWith({ pedidoId: 'p1', clienteId: 'u1' })
    expect(cliente.leerPedidosSinCliente).toHaveBeenCalledTimes(2)
    // Darío 15-nov: sin aviso al terminar — el pedido sale de la lista y pasa solo a su cliente.
    expect(document.body.textContent).toBe('')
  })

  it('textos: «Sin cliente», sin pie y ⛔ se habla de fundas apartadas (Darío 15-nov)', async () => {
    await montarLista()
    const txt = document.body.textContent ?? ''
    expect(txt).toContain('Sin cliente')
    expect(txt).not.toMatch(/apartad|Falta el cliente|Pasá cada pedido/)
  })

  it('tocar el pedido abre su hoja', async () => {
    cliente.leerPedidoPanel.mockReturnValue(new Promise(() => {}))
    await montarLista()
    await act(async () => { (document.querySelector('button[aria-label^="Ver el pedido"]') as HTMLButtonElement).click() })
    expect(cliente.leerPedidoPanel).toHaveBeenCalledWith('p1')
  })

  it('crear el cliente desde la lista también le pasa el pedido', async () => {
    await montarLista()
    await act(async () => { boton('Elegir cliente').click() })
    await act(async () => { boton('Es nuevo').click() })
    const [, nombre, doc] = inputs()
    await escribir(nombre, 'Fundas Norte')
    await escribir(doc, '30-71850818-1')
    await act(async () => { boton('Crear cliente').click() })
    await esperar()
    expect(cliente.entrarPedidoPanel).toHaveBeenCalledWith({ pedidoId: 'p1', clienteId: 'n1' })
  })

  it('si pasar el pedido falla, se ve el error y el pedido sigue en la lista', async () => {
    cliente.entrarPedidoPanel.mockRejectedValue(new Error('El pedido ya tiene pagos'))
    await montarLista()
    await act(async () => { boton('Elegir cliente').click() })
    await escribir(document.querySelector<HTMLInputElement>('input[aria-label="Buscar el cliente"]')!, 'celu')
    await esperar(350)
    await act(async () => { boton(/Celulares Rosario · 20123456786/).click() })
    await esperar()
    expect(document.body.textContent).toContain('El pedido ya tiene pagos')
    expect(cliente.leerPedidosSinCliente).toHaveBeenCalledTimes(1)
  })
})
