// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Caja · fase C (Bruno, 5-oct): el POS lo usa SÓLO la cuenta que abrió la caja, y la pestaña Caja le
 * muestra «Abrir POS» sólo a esa cuenta. El servidor tiene su propio test (`caja-handler`): éste
 * mira que la pantalla diga lo mismo.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const disco = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => disco.get(k) ?? null,
  setItem: (k: string, v: string) => void disco.set(k, v),
  removeItem: (k: string) => void disco.delete(k),
  clear: () => disco.clear(),
})

const sesion = { perfil: { name: 'Sofi', email: 'sofi@zattia.com', admin: false, acceso: { zattia: { caja: true } } } as Record<string, unknown>, marca: 'zattia', setMarca: vi.fn() }
const TURNO = { id: 't1', abierto_en: '2026-10-05T12:00:00.000Z', abierto_por: 'Sofi', abierto_por_usuario: 'sofi@zattia.com', fondo: 50000, cerrado_en: null, cerrado_por: null, contado: null, esperado: null, nota: null }
let turno: typeof TURNO | null = TURNO

vi.mock('@/components/SesionProvider', () => ({ useSesion: () => sesion }))
vi.mock('@/components/fundas/useDatosMonitor', () => ({ useDatosMonitor: () => ({ datos: null }) }))
vi.mock('@/components/productos/useTnImages', () => ({ useTnPromo: () => null }))
vi.mock('@/store/useAgenda', () => {
  const st = { promos: [], cargar: async () => {} }
  return { useAgenda: Object.assign((sel: (s: unknown) => unknown) => sel(st), { getState: () => st }) }
})
vi.mock('@/components/layout/acciones', () => ({ HeaderAcciones: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/lib/caja/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/caja/cliente')>()),
  leerConfig: vi.fn(async () => ({ reglas: { redondeo: 100, cuentas: {} }, politica_cambio: null })),
  leerTurno: vi.fn(async () => ({ turno, ultimos: [] })),
  leerPendientes: vi.fn(async () => ({ ventas: [] })),
  leerPedidosWeb: vi.fn(async () => ({ pedidos: [], porSku: {}, noLeidas: 0, leidoEn: new Date().toISOString() })),
  reintentarPendientes: vi.fn(async () => ({ intentadas: 0, llegaron: 0 })),
  cerrarTurno: vi.fn(async () => ({ turno: { ...TURNO, cerrado_en: '2026-10-05T20:00:00.000Z' } })),
  confirmarVenta: vi.fn(async () => {
    throw Object.assign(new Error('Recargá la Caja: cambió una forma de pago (las transferencias van a otra cuenta).'), { status: 400, datos: {} })
  }),
}))

const { CajaPOS } = await import('@/components/caja/CajaPOS')
const { Caja } = await import('@/components/caja/Caja')
const { CerrarTurnoModal } = await import('@/components/caja/partes')

let raiz: Root
beforeEach(() => {
  disco.clear()
  turno = TURNO
  sesion.perfil = { ...sesion.perfil, name: 'Sofi', email: 'sofi@zattia.com', admin: false }
  const caja = document.createElement('div')
  document.body.appendChild(caja)
  raiz = createRoot(caja)
})
afterEach(() => {
  act(() => raiz.unmount())
  document.body.innerHTML = ''
})

async function montar(el: React.ReactElement) {
  await act(async () => raiz.render(el))
  await act(async () => {})
  return document.body.textContent || ''
}

describe('POS (/pos)', () => {
  it('🔑 la cuenta que abrió la caja ve el POS: escanear, el pedido y «Cerrar turno»', async () => {
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Escanear o buscar')
    expect(t).toContain('Pedido · 0 prendas')
    expect(t).toContain('Cerrar turno')
    // Sólo una flecha (Bruno, 5-oct), ⛔ «Volver al monitor».
    expect(t).not.toContain('Volver al monitor')
    expect(document.querySelector('a[aria-label="Volver"]')?.getAttribute('href')).toBe('/caja')
  })

  it('🔴 otra cuenta ⇒ «la abrió Sofi», sin escanear ni cobrar', async () => {
    sesion.perfil = { ...sesion.perfil, name: 'Ana', email: 'ana@zattia.com' }
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Turno de Sofi: POS sólo para esa cuenta.')
    expect(t).not.toContain('Escanear o buscar')
  })

  it('🔴 ni un admin', async () => {
    sesion.perfil = { ...sesion.perfil, name: 'Bruno', email: 'bruno@arebensrl.com', admin: true }
    const t = await montar(<CajaPOS />)
    expect(t).not.toContain('Escanear o buscar')
  })

  it('sin turno abierto ⇒ lo dice y manda a la Caja', async () => {
    turno = null
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Sin turno abierto')
    expect(document.querySelector('a[href="/caja"]')).toBeTruthy()
  })
})

describe('POS · promos (W5)', () => {
  it('🔑 la promo sale en el renglón con su nombre y baja el subtotal (2x1: $10.000 + $8.000 ⇒ $10.000)', async () => {
    const { leerConfig } = await import('@/lib/caja/cliente')
    const promo = { id: 'p1', nombre: '2x1 primavera', tipo: 'nxm', lleva: 2, paga: 1, alcance: { tipo: 'todo' }, desde: '2026-01-01', hasta: null, activa: true }
    vi.mocked(leerConfig).mockResolvedValueOnce({ reglas: { redondeo: 100, cuentas: {}, promos: [promo] }, politica_cambio: null } as never)
    const renglon = (id: number, precio: number) => ({ variante: { product_id: id, size_id: 1, product_name: `PRENDA ${id}`, size_name: 'M', sku: null, barcode: null }, stock: { local: 3, deposito: 0, fuente: 'vivo' }, cantidad: 1, precio, fueraDeTn: false, foto: null, rebaja: null })
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'b1', renglones: [renglon(1, 10000), renglon(2, 8000)], email: '' }))
    const t = await montar(<CajaPOS />)
    expect(t).toContain('2x1 primavera')
    expect(t).toMatch(/Subtotal\s*\$\s?10\.000/)
  })
})

describe('pestaña Caja', () => {
  it('«Abrir POS» sólo para la cuenta que abrió; se cobra en el POS, ⛔ acá', async () => {
    let t = await montar(<Caja />)
    expect(document.querySelector('a[href="/pos"]')?.textContent).toBe('Abrir POS')
    expect(t).not.toContain('Escanear')
    expect(t).toContain('Contar billetes')
    act(() => raiz.unmount())

    sesion.perfil = { ...sesion.perfil, name: 'Ana', email: 'ana@zattia.com' }
    const caja = document.createElement('div')
    document.body.appendChild(caja)
    raiz = createRoot(caja)
    t = await montar(<Caja />)
    expect(document.querySelector('a[href="/pos"]')).toBeNull()
    expect(t).toContain('POS sólo para esa cuenta')
    // Cerrar la caja, sí: «desde los dos lados». Contar billetes, ⛔ (el servidor da 403).
    expect(t).toContain('Cerrar turno')
    expect(t).not.toContain('Contar billetes')
  })
})

const boton = (texto: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto) as HTMLButtonElement
const borrador = () => JSON.parse(disco.get('caja:borrador:zattia') || 'null') as { id: string; renglones: unknown[]; enviado?: boolean }
const PRENDA = { variante: { product_id: 1, size_id: 1, product_name: 'PRENDA 1', size_name: 'M', sku: null, barcode: null }, stock: { local: 3, deposito: 0, fuente: 'vivo' }, cantidad: 1, precio: 10000, fueraDeTn: false, foto: null, rebaja: null }

describe('POS · auditoría 11-oct', () => {
  it('🔑 A1: «Vaciar pedido» renueva el id sólo si con él ⛔ se mandó nada', async () => {
    vi.stubGlobal('confirm', () => true)
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'sin-mandar', renglones: [PRENDA], email: '' }))
    await montar(<CajaPOS />)
    await act(async () => boton('Vaciar pedido').click())
    expect(borrador().renglones).toEqual([])
    expect(borrador().id).not.toBe('sin-mandar')
  })

  it('🔴 A1: si ya se mandó (la respuesta pudo perderse), el id se QUEDA: el pedido nuevo da 409 y se ve cuál era', async () => {
    vi.stubGlobal('confirm', () => true)
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'mandada', renglones: [PRENDA], email: '', enviado: true }))
    await montar(<CajaPOS />)
    await act(async () => boton('Vaciar pedido').click())
    expect(borrador().renglones).toEqual([])
    expect(borrador().id).toBe('mandada')
  })

  it('B1: «Ventas del turno» está en la cabecera del POS', async () => {
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Ventas del turno')
  })
})

describe('Cerrar turno · auditoría A10', () => {
  const RESUMEN = { porCuenta: [], total: 0, ventas: 0, efectivo: { fondo: 50000, cobrado: 0, deEspera: 0, cobradoGN: 0, salidas: 0, esperado: 50000 }, cobrosGN: [], esperando: [], sinGN: [] }
  it('🔴 vacío ⇒ apagado; un $0 escrito ⇒ pide confirmación con los tres números y ⛔ cierra sin ella', async () => {
    const { cerrarTurno } = await import('@/lib/caja/cliente')
    const pregunta = vi.fn(() => false)
    vi.stubGlobal('confirm', pregunta)
    await montar(<CerrarTurnoModal turno={{ ...TURNO, resumen: RESUMEN } as never} billetes={[1000]} onCerrar={() => {}} onCerrado={() => {}} />)
    expect(boton('Cerrar turno').disabled).toBe(true)
    const aMano = document.querySelector('input[aria-label="Total a mano"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(aMano, '0')
      aMano.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(boton('Cerrar turno').disabled).toBe(false)
    await act(async () => boton('Cerrar turno').click())
    expect(pregunta).toHaveBeenCalledTimes(1)
    expect(String((pregunta.mock.calls[0] as unknown[])[0])).toContain('Cerrar turno')
    expect(cerrarTurno).not.toHaveBeenCalled()
    pregunta.mockReturnValue(true)
    await act(async () => boton('Cerrar turno').click())
    expect(cerrarTurno).toHaveBeenCalledWith('t1', 0, '', null, false)
  })
})

describe('POS · A6: la pantalla se pone al día sola (Bruno, 12-oct)', () => {
  it('🔑 abrir el cobro vuelve a leer la configuración (una Caja abierta desde ayer traía la de ayer)', async () => {
    const { leerConfig } = await import('@/lib/caja/cliente')
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'b-a6', renglones: [PRENDA], email: '' }))
    await montar(<CajaPOS />)
    const antes = vi.mocked(leerConfig).mock.calls.length
    await act(async () => boton('Continuar al cobro Alt+C').click())
    expect(vi.mocked(leerConfig).mock.calls.length).toBe(antes + 1)
  })

  it('🔴 el servidor la rebota y la config cambió ⇒ «ya se actualizó», el carrito y su id siguen', async () => {
    const { leerConfig, confirmarVenta } = await import('@/lib/caja/cliente')
    const { REGLAS_INICIALES } = await import('@/lib/caja/core.core.js')
    const vieja = { reglas: { ...REGLAS_INICIALES, transferenciaA: null }, politica_cambio: null }
    vi.mocked(leerConfig).mockResolvedValueOnce(vieja as never).mockResolvedValueOnce(vieja as never)
      .mockResolvedValueOnce({ ...vieja, reglas: { ...vieja.reglas, redondeo: 10 } } as never)
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'b-rebote', renglones: [PRENDA], email: '' }))
    await montar(<CajaPOS />)
    await act(async () => boton('Continuar al cobro Alt+C').click())
    const debito = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Tarjeta de débito')) as HTMLButtonElement
    await act(async () => debito.click())
    const fin = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Finalizar venta')) as HTMLButtonElement
    expect(fin.disabled).toBe(false)
    await act(async () => fin.click())
    await act(async () => {})
    expect(vi.mocked(confirmarVenta)).toHaveBeenCalled()
    expect(document.body.textContent).toContain('ya se actualizó')
    expect(borrador().renglones).toHaveLength(1)
    expect(borrador().id).toBe('b-rebote')
  })
})
