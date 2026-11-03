// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/** **ERP › Productos › Actualizar Ingresos, la pantalla y la puerta.** El oráculo es lo que se LEE y lo que se MANDA. */
const prod = (ingresos_id: number, nombre: string, ocs: string[] = []) => ({ ingresos_id, nombre, status: 'hidden', updated_at: '2026-11-20T12:00:00Z', variantes: [{ ingresos_id: 1, sku: `S-${ingresos_id}`, barcode: null, talle: 'M' }], ocs })
const lista = { manda: true, corte: '2026-11-16T00:00:00Z', crear: [prod(1, 'TOP NUEVO', ['OC-9']), prod(2, 'PRECARGA')], agregar: [{ ...prod(3, 'REMERA'), product_id: '7' }], listos: [{ ingresos_id: 5, nombre: 'YA ESTABA', status: 'visible', updated_at: null, variantes: 2 }], a_vincular: [{ ingresos_id: 4, nombre: 'CLEAR CASE', motivo: 'talle_repetido', ocs: [] }], oc_sin_producto: [{ sku: 'ZZ-1', oc: 'OC-8' }] }
const leerProductosDeIngresos = vi.fn(async (): Promise<unknown> => lista)
const importarProductosDeIngresos = vi.fn(async (): Promise<unknown> => ({ manda: true, productos_nuevos: 1, variantes_nuevas: 1, no_disponibles: [] }))
vi.mock('@/lib/erp/cliente', () => ({
  leerProductosDeIngresos: (...a: unknown[]) => leerProductosDeIngresos(...(a as [])),
  importarProductosDeIngresos: (...a: unknown[]) => importarProductosDeIngresos(...(a as [])),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno' } }) }))
let linea = 'bdi'
vi.mock('@/lib/erp/linea-erp', () => ({ useTiendaErp: () => linea }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); linea = 'bdi'; leerProductosDeIngresos.mockImplementation(async () => lista) })

async function montar() {
  const { ActualizarIngresos } = await import('@/components/erp/productos/ActualizarIngresos')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ActualizarIngresos />) })
}
const texto = () => document.body.textContent ?? ''
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement
const clic = (el: Element) => act(async () => { (el as HTMLElement).click() })
const casilla = (n: string) => document.querySelector(`input[aria-label="elegir ${n}"]`) as HTMLInputElement

describe('Actualizar Ingresos (pantalla)', () => {
  it('⛔ lee solo al entrar: es a pedido', async () => {
    await montar()
    expect(leerProductosDeIngresos).not.toHaveBeenCalled()
    expect(texto()).toContain('Tocá «Actualizar Ingresos»')
  })
  it('antes del corte dice que todavía no corresponde, y ⛔ ofrece importar', async () => {
    leerProductosDeIngresos.mockImplementation(async () => ({ manda: false, corte: null, motivo: 'sin_corte' }))
    await montar()
    await clic(boton('Actualizar Ingresos'))
    expect(texto()).toContain('Todavía no corresponde')
    expect(boton('Importar')).toBeUndefined()
  })
  it('con el freno dice que está frenado', async () => {
    leerProductosDeIngresos.mockImplementation(async () => ({ manda: false, corte: 'x', motivo: 'frenada' }))
    await montar()
    await clic(boton('Actualizar Ingresos'))
    expect(texto()).toContain('frenado')
  })
  it('muestra el estado, la OC, lo de Vincular y lo que no se puede; ⛔ elige nada solo', async () => {
    await montar()
    await clic(boton('Actualizar Ingresos'))
    for (const t of ['TOP NUEVO', 'PRECARGA', 'REMERA', 'Sin publicar', 'OC-9', 'CLEAR CASE', 'Vincular', 'ZZ-1']) expect(texto()).toContain(t)
    expect(boton('Importar').disabled).toBe(true)
  })
  it('lo que ya está sale como Listo, y ⛔ se puede elegir', async () => {
    await montar()
    await clic(boton('Actualizar Ingresos'))
    expect(texto()).not.toContain('YA ESTABA')
    await clic(boton('Listo'))
    expect(texto()).toContain('YA ESTABA')
    expect(document.querySelector('input[aria-label="elegir YA ESTABA"]')).toBeNull()
    expect(boton('Importar')).toBeUndefined()
  })
  it('manda SÓLO lo elegido, y relee', async () => {
    await montar()
    await clic(boton('Actualizar Ingresos'))
    await clic(casilla('TOP NUEVO'))
    await clic(casilla('REMERA'))
    await clic(boton('Importar'))
    expect(importarProductosDeIngresos).toHaveBeenCalledWith('bdi', [1, 3])
    expect(leerProductosDeIngresos).toHaveBeenCalledTimes(2)
    expect(texto()).toContain('Importado')
  })
  it('Stunned ⛔ opera en Ingresos', async () => {
    linea = 'stunned'
    await montar()
    expect(texto()).toContain('Stunned no opera en Ingresos')
    expect(boton('Actualizar Ingresos')).toBeUndefined()
  })
})

describe('Actualizar Ingresos (puerta)', () => {
  const motorMock = { leerParaImportar: vi.fn(async (a: unknown) => ({ manda: true, a })), importarDeIngresos: vi.fn(async (a: unknown) => ({ manda: true, a })) }
  const deps = () => ({ conMotor: vi.fn(async (_m: string, _q: string, fn: (db: unknown) => unknown) => fn({ base: _m })) })
  async function puerta() {
    vi.resetModules()
    vi.doMock('../motor/conexion.mjs', () => motorMock)
    return import('../api/_erp-ingresos-productos.js')
  }
  it('marca inválida, sin token o Stunned ⛔ abren la base', async () => {
    const m = await puerta(); const d = deps()
    vi.stubEnv('INGRESOS_TOKEN_BDI', '')
    expect((await m.productosDeIngresos({ marca: 'stunned' }, d)).status).toBe(400)
    expect((await m.productosDeIngresos({ marca: 'bdi' }, d)).status).toBe(409)
    expect(d.conMotor).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
  it('sin elegidos, con ids raros o sin quién ⛔ importa', async () => {
    const m = await puerta(); const d = deps()
    for (const body of [{ marca: 'bdi' }, { marca: 'bdi', elegidos: [] }, { marca: 'bdi', elegidos: ['1;drop'] }]) expect((await m.importarDeIngresosErp({ body, usuario: 'x' }, d)).status).toBe(400)
    expect((await m.importarDeIngresosErp({ body: { marca: 'bdi', elegidos: [1] }, usuario: null }, d)).status).toBe(400)
    expect(d.conMotor).not.toHaveBeenCalled()
  })
  it('Zattia lee las OC de la base de BDI y los productos de la suya', async () => {
    const m = await puerta(); const d = deps()
    vi.stubEnv('INGRESOS_TOKEN_ZATTIA', 'igk_z')
    const r = await m.productosDeIngresos({ marca: 'zattia' }, d) as { a: { control: { base: string }, db: { base: string }, negocio: string, token: string } }
    expect([r.a.control.base, r.a.db.base, r.a.negocio, r.a.token]).toEqual(['bdi', 'zattia', 'zattia', 'igk_z'])
    vi.unstubAllEnvs()
  })
  it('un rechazo de Ingresos se dice, sin el token', async () => {
    const m = await puerta(); const d = deps()
    vi.stubEnv('INGRESOS_TOKEN_BDI', 'igk_b')
    motorMock.leerParaImportar.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 401 }))
    const r = await m.productosDeIngresos({ marca: 'bdi' }, d)
    expect(r.status).toBe(502)
    expect(JSON.stringify(r)).not.toContain('igk_')
    vi.unstubAllEnvs()
  })
  it('sólo Admin, y la entrada del ERP lo deja pasar', async () => {
    const { permisoErpDe } = await import('../lib/permisos.core.js')
    expect(permisoErpDe({ method: 'GET', vista: 'ingresos-productos' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'importar-ingresos' })).toBe('configurar')
    const { entradaInvalida } = await import('../lib/erp/entrada.core.js')
    expect(entradaInvalida({ method: 'GET', query: { vista: 'ingresos-productos', marca: 'bdi' } })).toBeNull()
    expect(entradaInvalida({ method: 'POST', body: { accion: 'importar-ingresos', marca: 'bdi', elegidos: [1] } })).toBeNull()
  })
})
