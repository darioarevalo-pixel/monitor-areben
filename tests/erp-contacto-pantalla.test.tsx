// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Cuenta corriente › «Editar WhatsApp» (27-oct, Resto; en ⋯ desde 22-nov).** El oráculo es lo que se MANDA al guardar (cliente y texto),
 * a qué número dice que va a escribir antes de guardar, y que el botón de WhatsApp de la ficha se prende con el número nuevo.
 */

const CLIENTE = '00000000-0000-0000-0000-0000000000c1'
const fila = {
  id: 'f1', clienteId: CLIENTE, linea: 'bdi', nombre: 'Mayorista Uno', doc: null, saldo: 1000, debe: 1000, aFavor: 0, vencido: 0, diasMayor: 3, tramos: {},
  credito: { credito: true, tope: null, dias: 30, puesto_por: null, puesto_en: null }, sinCredito: false, estado: 'aldia',
}
const cuenta = {
  hoy: '2026-10-27', cliente: { id: CLIENTE, nombre: 'Mayorista Uno', doc: null }, credito: fila.credito,
  estado: { saldo: 1000, debe: 1000, a_favor: 0, vencido: 0, dias_mayor: 3, atrasado: false, sin_credito: false, tramos: {}, pendientes: [] },
  mayor: { anterior: 0, renglones: [], final: 1000 }, csv: '', cuentas: [],
}
const ponerContactoCliente = vi.fn(async (_m: string, p: { whatsapp?: string }) => ({ ok: true, contacto: { whatsapp: '5491155551234', email: null }, p }))
vi.mock('@/lib/erp/cliente', () => ({
  leerCuentaDeCliente: async () => cuenta, cobrarCuentaErp: vi.fn(), ponerCreditoCliente: vi.fn(),
  ponerContactoCliente: (...a: unknown[]) => ponerContactoCliente(...(a as [string, { whatsapp?: string }])),
  leerPermisos: async () => ({ permisos: { bdi: {}, zattia: {} } }),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined
async function montar(whatsapp: string | null, admin = true) {
  const { FichaCuenta } = await import('@/components/erp/clientes/FichaCuenta')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<FichaCuenta marca="bdi" fila={{ ...fila, whatsapp }} prueba admin={admin} onCerrar={() => {}} onCambio={() => {}} />) })
}
/** «Editar WhatsApp» vive en el ⋯ de la ficha (Darío 22-nov). */
const item = (t: string) => [...document.querySelectorAll('button, [role="menuitem"]')].find((b) => b.textContent?.trim() === t) as HTMLElement | undefined
async function abrirEditar() {
  await act(async () => { (document.querySelector('button[aria-label^="Más acciones de la cuenta"]') as HTMLButtonElement).click() })
  await act(async () => { item('Editar WhatsApp')!.click() })
}
async function escribir(valor: string) {
  const input = document.querySelector('input[inputmode="tel"]') as HTMLInputElement
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('cargar el WhatsApp desde la ficha de la cuenta (pantalla)', () => {
  it('sólo el admin ve el botón', async () => {
    await montar(null, false)
    await act(async () => { (document.querySelector('button[aria-label^="Más acciones de la cuenta"]') as HTMLButtonElement).click() })
    expect(item('Editar WhatsApp')).toBeUndefined()
    expect(item('Imprimir resumen')).toBeDefined()
  })
  it('un número dudoso ⛔ se puede guardar; uno bueno dice a cuál va a escribir', async () => {
    await montar(null)
    await abrirEditar()
    await escribir('123')
    expect(boton('Guardar')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('Número incompleto o con dígitos de más.')
    await escribir('011 15 5555-1234')
    expect(boton('Guardar')!.disabled).toBe(false)
    expect(document.body.textContent).toContain('Se va a escribir a +5491155551234')
  })
  it('guarda por el id del cliente y el botón de WhatsApp de la ficha se prende', async () => {
    await montar(null)
    expect(boton('Escribir por WhatsApp')!.disabled).toBe(true)
    await abrirEditar()
    await escribir('11 5555-1234')
    await act(async () => { boton('Guardar')!.click() })
    expect(ponerContactoCliente).toHaveBeenCalledWith('bdi', { clienteId: CLIENTE, whatsapp: '11 5555-1234' })
    expect(boton('Escribir por WhatsApp')!.disabled).toBe(false)
    expect(document.body.textContent).toContain('WhatsApp guardado.')
  })
})
