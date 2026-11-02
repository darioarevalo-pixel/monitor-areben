// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/** ERP › Configuración › Tokens de la API, montada: el resumen antes de crear, el token UNA vez, y las acciones de un revocado. */
const m = vi.hoisted(() => ({ crear: vi.fn(), regenerar: vi.fn(), revocar: vi.fn(), probar: vi.fn(), editar: vi.fn(), actividad: vi.fn(), confirma: true }))
const TOKEN = (o: Record<string, unknown>) => ({ id: 7, negocio: 'bdi', app: 'Logistica', key_prefix: 'erk__8NxNArB', permisos: ['locations:read'], vence_en: '2030-02-01T02:59:59Z', revocado_en: null, ultimo_uso_en: null, ultimo_uso_ip: null, dueno: 'Administracion', dueno_activo: true, ...o })
vi.mock('@/lib/erp/cliente', () => ({
  leerTokens: async () => ({
    tokens: [TOKEN({}), TOKEN({ id: 1, app: 'Oraculo', revocado_en: '2026-11-02T00:00:00Z' })],
    permisos: { 'locations:read': { explica: 'Leer la ubicación', datos: 'Código de barras y ubicación' } },
    nunca: ['Ver costos, márgenes'],
    negocios: { bdi: 'BDI Accesorios', zattia: 'Zattia' },
  }),
  crearTokenApi: m.crear, regenerarTokenApi: m.regenerar, revocarTokenApi: m.revocar, probarTokenApi: m.probar, editarTokenApi: m.editar, leerActividadToken: m.actividad,
}))
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<object>()), useConfirmar: () => ({ confirmar: async () => m.confirma }) }))

import { TokensApi } from '@/components/erp/TokensApi'

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); m.confirma = true })

const espera = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const montar = async () => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => root!.render(<TokensApi />))
  await espera()
}
const botones = (t: string) => [...document.querySelectorAll('button')].filter((b) => b.textContent === t)
const tocar = async (b: Element) => { await act(async () => { (b as HTMLElement).click() }); await espera() }
const escribir = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const texto = () => document.body.textContent ?? ''

describe('Tokens de la API', () => {
  it('lista con su estado; un revocado sólo deja ver la actividad', async () => {
    await montar()
    expect(texto()).toContain('Logistica')
    expect(texto()).toContain('Revocado')
    expect(texto()).toContain('Activo')
    expect(botones('Revocar').length).toBe(1)
    expect(botones('Regenerar').length).toBe(1)
    expect(botones('Editar').length).toBe(1)
    expect(botones('Actividad').length).toBe(2)
  })

  it('nuevo: pide lo que falta, muestra el resumen ANTES de crear y el token una sola vez', async () => {
    m.crear.mockResolvedValue({ ok: true, id: 9, key_prefix: 'erk_nuevo', token: 'erk_EL_TOKEN' })
    await montar()
    await tocar(botones('Nuevo token')[0])
    await tocar(botones('Seguir')[0])
    expect(texto()).toContain('Escribí el nombre de la app')
    expect(m.crear).not.toHaveBeenCalled()
    const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[]
    await escribir(inputs.find((i) => i.placeholder === 'Logística')!, 'App X')
    await escribir(inputs.find((i) => i.placeholder === 'Administración')!, 'Bruno')
    await tocar(document.querySelector('input[type=checkbox]')!)
    await tocar(botones('Seguir')[0])
    expect(texto()).toContain('Qué puede hacer')
    expect(texto()).toContain('Código de barras y ubicación')
    expect(texto()).toContain('Ver costos, márgenes')
    expect(m.crear).not.toHaveBeenCalled()
    await tocar(botones('Crear token')[0])
    expect(m.crear.mock.calls[0][0]).toMatchObject({ app: 'App X', dueno: 'Bruno', negocio: 'bdi', permisos: ['locations:read'] })
    expect(document.querySelector('[data-testid=token-una-vez]')?.textContent).toBe('erk_EL_TOKEN')
    await tocar(botones('Ya lo guardé')[0])
    expect(texto()).not.toContain('erk_EL_TOKEN')
  })

  it('regenerar: confirma y entrega el nuevo; sin confirmar, nada', async () => {
    m.regenerar.mockResolvedValue({ ok: true, id: 7, key_prefix: 'erk_otro', token: 'erk_NUEVO' })
    await montar()
    m.confirma = false
    await tocar(botones('Regenerar')[0])
    expect(m.regenerar).not.toHaveBeenCalled()
    m.confirma = true
    await tocar(botones('Regenerar')[0])
    expect(m.regenerar).toHaveBeenCalledWith(7)
    expect(document.querySelector('[data-testid=token-una-vez]')?.textContent).toBe('erk_NUEVO')
  })

  it('revocar confirma', async () => {
    m.revocar.mockResolvedValue({ ok: true })
    await montar()
    await tocar(botones('Revocar')[0])
    expect(m.revocar).toHaveBeenCalledWith(7)
  })

  it('probar dice si funciona o por qué no', async () => {
    m.probar.mockResolvedValue({ ok: false, code: 'token_revoked', detalle: 'Este token fue revocado: pedí uno nuevo.', token: { app: 'L', key_prefix: 'erk_x' } })
    await montar()
    await tocar(botones('Probar un token')[0])
    await escribir(document.querySelector('input[type=password]') as HTMLInputElement, 'erk_algo')
    await tocar(botones('Probar')[0])
    expect(m.probar).toHaveBeenCalledWith('erk_algo')
    expect(texto()).toContain('Este token fue revocado')
  })

  it('la actividad muestra lo consultado', async () => {
    m.actividad.mockResolvedValue({ consultas: [{ en: '2026-11-02T12:00:00Z', metodo: 'GET', molde: '/locations', status: 200, code: null, ms: 10, cantidad: 3, ip: '1.2.3.4' }] })
    await montar()
    await tocar(botones('Actividad')[0])
    expect(m.actividad).toHaveBeenCalledWith(7)
    expect(texto()).toContain('GET /locations')
  })
})
