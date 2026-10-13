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
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
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
  cruzarVenta: vi.fn(async () => ({ venta: null, cruce: { estado: 'esperando' }, recientes: [{ id: '998812', monto: 12300, cuando: new Date().toISOString(), origen: 'banco', coincide: false }], cuentaMp: 'Areben Comercial' })),
  confirmarVarios: vi.fn(),
  confirmarOtraCuenta: vi.fn(),
  cancelarVenta: vi.fn(),
  elegirVariante: vi.fn(),
  leerVentasTurno: vi.fn(),
  confirmarVenta: vi.fn(async () => {
    throw Object.assign(new Error('Recargá la Caja: cambió una forma de pago (las transferencias van a otra cuenta).'), { status: 400, datos: {} })
  }),
}))

const { CajaPOS } = await import('@/components/caja/CajaPOS')
const { Caja } = await import('@/components/caja/Caja')
const { CerrarTurnoModal, EsperaTransferencia, VentasDelTurno } = await import('@/components/caja/partes')

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
    expect(t).toContain('Cerrar caja')
    // Sólo una flecha (Bruno, 5-oct), ⛔ «Volver al monitor».
    expect(t).not.toContain('Volver al monitor')
    expect(document.querySelector('a[aria-label="Volver"]')?.getAttribute('href')).toBe('/caja')
  })

  it('🔴 otra cuenta ⇒ «la abrió Sofi», sin escanear ni cobrar', async () => {
    sesion.perfil = { ...sesion.perfil, name: 'Ana', email: 'ana@zattia.com' }
    const t = await montar(<CajaPOS />)
    expect(t).toContain('Caja de Sofi: POS sólo para esa cuenta.')
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
    expect(t).toContain('Sin caja abierta')
    expect(document.querySelector('a[href="/caja"]')).toBeTruthy()
  })

  it('🔑 se dibuja con la lectura LIVIANA del turno, sin esperar la entera (que lee GN: 1 a 10 s)', async () => {
    const { leerTurno } = await import('@/lib/caja/cliente')
    vi.mocked(leerTurno).mockImplementation((liviano?: boolean) => (liviano ? Promise.resolve({ turno, ultimos: [] }) : new Promise(() => {})) as never)
    try {
      const t = await montar(<CajaPOS />)
      expect(t).not.toContain('Abriendo la caja')
      expect(t).toContain('Cerrar caja')
      expect(vi.mocked(leerTurno)).toHaveBeenCalledWith(true)
    } finally {
      vi.mocked(leerTurno).mockImplementation(async () => ({ turno, ultimos: [] }) as never)
    }
  })

  it('🔴 la liviana que llega TARDE ⛔ pisa a la entera (que trae el resumen)', async () => {
    const { leerTurno } = await import('@/lib/caja/cliente')
    let soltar: (v: unknown) => void = () => {}
    vi.mocked(leerTurno).mockImplementation((liviano?: boolean) => (liviano ? new Promise((r) => (soltar = r)) : Promise.resolve({ turno: null, ultimos: [] })) as never)
    try {
      await montar(<CajaPOS />)
      await act(async () => soltar({ turno: TURNO, ultimos: [] }))
      expect(document.body.textContent).toContain('Sin caja abierta')
    } finally {
      vi.mocked(leerTurno).mockImplementation(async () => ({ turno, ultimos: [] }) as never)
    }
  })

  it('🔑 «Volver» navega adentro de la app: ⛔ recarga el monitor entero', async () => {
    push.mockClear()
    await montar(<CajaPOS />)
    const a = document.querySelector('a[href="/caja"]') as HTMLAnchorElement
    const clic = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    act(() => void a.dispatchEvent(clic))
    expect(clic.defaultPrevented).toBe(true)
    expect(push).toHaveBeenCalledWith('/caja')
    // Con Ctrl/⌘ sigue siendo un link: otra pestaña, ⛔ el router.
    push.mockClear()
    const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true })
    act(() => void a.dispatchEvent(ctrl))
    expect(push).not.toHaveBeenCalled()
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
    expect(document.querySelector('a[href="/pos?marca=zattia"]')?.textContent).toBe('Abrir POS')
    expect(t).not.toContain('Escanear')
    expect(t).toContain('Contar billetes')
    act(() => raiz.unmount())

    sesion.perfil = { ...sesion.perfil, name: 'Ana', email: 'ana@zattia.com' }
    const caja = document.createElement('div')
    document.body.appendChild(caja)
    raiz = createRoot(caja)
    t = await montar(<Caja />)
    expect(document.querySelector('a[href="/pos?marca=zattia"]')).toBeNull()
    expect(t).toContain('POS sólo para esa cuenta')
    // Cerrar la caja, sí: «desde los dos lados». Contar billetes, ⛔ (el servidor da 403).
    expect(t).toContain('Cerrar caja')
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
    expect(t).toContain('Ventas')
  })
})

describe('Cerrar turno · auditoría A10', () => {
  const RESUMEN = { porCuenta: [], total: 0, ventas: 0, efectivo: { fondo: 50000, cobrado: 0, deEspera: 0, cobradoGN: 0, salidas: 0, esperado: 50000 }, cobrosGN: [], esperando: [], sinGN: [] }
  it('🔴 vacío ⇒ apagado; un $0 escrito ⇒ pide confirmación con los tres números y ⛔ cierra sin ella', async () => {
    const { cerrarTurno } = await import('@/lib/caja/cliente')
    const pregunta = vi.fn(() => false)
    vi.stubGlobal('confirm', pregunta)
    await montar(<CerrarTurnoModal turno={{ ...TURNO, resumen: RESUMEN } as never} billetes={[1000]} onCerrar={() => {}} onCerrado={() => {}} />)
    expect(boton('Cerrar caja').disabled).toBe(true)
    const aMano = document.querySelector('input[aria-label="Total a mano"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(aMano, '0')
      aMano.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(boton('Cerrar caja').disabled).toBe(false)
    await act(async () => boton('Cerrar caja').click())
    expect(pregunta).toHaveBeenCalledTimes(1)
    expect(String((pregunta.mock.calls[0] as unknown[])[0])).toContain('Cerrar caja')
    expect(cerrarTurno).not.toHaveBeenCalled()
    pregunta.mockReturnValue(true)
    await act(async () => boton('Cerrar caja').click())
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

describe('POS · paso «Validar transferencia» (Bruno, 12-oct)', () => {
  it('🔑 con transferencia el botón dice «Validar transferencia» (13-oct) y, guardada, el cobro pasa a validar con los últimos pagos', async () => {
    const { leerConfig, confirmarVenta } = await import('@/lib/caja/cliente')
    const { REGLAS_INICIALES } = await import('@/lib/caja/core.core.js')
    const conf = { reglas: { ...REGLAS_INICIALES, transferenciaA: REGLAS_INICIALES.medios.transferencia.opciones[0] }, politica_cambio: null }
    vi.mocked(leerConfig).mockResolvedValue(conf as never)
    const venta = { id: '0d6c1c2e-1111-4222-8333-944445555666', estado: 'esperando_pago', espera_monto: 9000, total: 9000, creada_en: new Date().toISOString(), renglones: [], pagos: [] }
    vi.mocked(confirmarVenta).mockResolvedValueOnce({ venta } as never)
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'b-transf', renglones: [PRENDA], email: '' }))
    await montar(<CajaPOS />)
    await act(async () => boton('Continuar al cobro Alt+C').click())
    const transf = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Transferencia')) as HTMLButtonElement
    await act(async () => transf.click())
    const fin = [...document.querySelectorAll('button')].find((b) => /^(Finalizar venta|Validar transferencia)/.test(b.textContent ?? '')) as HTMLButtonElement
    expect(fin.textContent).toMatch(/^Validar transferencia/)
    await act(async () => fin.click())
    await act(async () => new Promise((r) => setTimeout(r, 10)))
    const t = document.body.textContent || ''
    expect(t).toContain('Transferencia pendiente de')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Seguir vendiendo mientras llega')
    expect(t).toContain('Últimos pagos en Mercado Pago (Areben Comercial)')
    expect(t).toContain('operación ····8812')
    // «Seguir vendiendo» cierra el paso: la venta queda esperando en el cartel de arriba.
    await act(async () => boton('Seguir vendiendo mientras llega').click())
    // La venta sigue esperando en el cartel de arriba, ya ⛔ en el modal.
    expect(document.body.textContent).not.toContain('Seguir vendiendo mientras llega')
  })
})

/** Espera a que la pantalla llegue (con la suite entera la máquina va lenta y 10 ms ⛔ alcanzan). */
async function hastaQue(cond: () => boolean, ms = 3000) {
  const fin = Date.now() + ms
  while (!cond() && Date.now() < fin) await act(async () => new Promise((r) => setTimeout(r, 20)))
}

describe('POS · la transferencia que ⛔ llega justa (Bruno, 12-oct, segunda tanda)', () => {
  const VENTA = { id: '0d6c1c2e-1111-4222-8333-944445555666', estado: 'esperando_pago', espera_monto: 13400, total: 13400, subtotal: 14900, creada_en: new Date(Date.now() - 60_000).toISOString(), renglones: [{ product_id: 1, size_id: 1, cantidad: 1, precio: 14900, nombre: 'PRENDA 1', talle: 'M' }], pagos: [{ cuenta: 13015, monto: 13400 }], email: null, usuario: 'Sofi' }
  const reciente = (id: string, monto: number, diferencia: number, coincide = false) => ({ id, monto, cuando: new Date().toISOString(), origen: 'mp', coincide, diferencia })

  it('🔑 «Completar con otro cobro»: suma pagos, dice cuánto falta y confirma con los dos', async () => {
    const { cruzarVenta, confirmarVarios } = await import('@/lib/caja/cliente')
    vi.mocked(cruzarVenta).mockResolvedValue({ venta: VENTA, cruce: { estado: 'esperando' }, recientes: [reciente('111', 13300, -100, true), reciente('222', 100, -13300)], cuentaMp: 'Areben Comercial' } as never)
    vi.mocked(confirmarVarios).mockResolvedValueOnce({ venta: { ...VENTA, estado: 'en_gn', gn_number: 30100 } } as never)
    const onLlego = vi.fn()
    await montar(<EsperaTransferencia venta={VENTA as never} reglas={null} onLlego={onLlego} onCambio={() => {}} />)
    await hastaQue(() => (document.body.textContent || '').includes('de menos'))
    // La tolerancia: el de $13.300 se marca «de menos», ⛔ «monto exacto».
    expect(document.body.textContent).toContain('$100 de menos')
    await act(async () => boton('Completar con otro cobro').click())
    const sumar = () => [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Sumar')
    await hastaQue(() => sumar().length === 2)
    expect(vi.mocked(cruzarVenta)).toHaveBeenLastCalledWith(VENTA.id, undefined, true)
    await act(async () => sumar()[0].click())
    expect(document.body.textContent).toContain('Elegidos $13.300 · falta $100')
    await act(async () => sumar()[0].click())
    expect(document.body.textContent).toContain('Elegidos $13.400 · completo')
    await act(async () => boton('Confirmar con estos 2 cobros').click())
    expect(vi.mocked(confirmarVarios)).toHaveBeenCalledWith(VENTA.id, ['111', '222'])
    expect(onLlego).toHaveBeenCalledWith(expect.objectContaining({ gn_number: 30100 }))
  })

  it('🔑 «Transfirió a otra cuenta»: titular y banco, recién ahí confirma', async () => {
    const { cruzarVenta, confirmarOtraCuenta } = await import('@/lib/caja/cliente')
    vi.mocked(cruzarVenta).mockResolvedValue({ venta: VENTA, cruce: { estado: 'esperando' }, recientes: [], cuentaMp: null } as never)
    vi.mocked(confirmarOtraCuenta).mockResolvedValueOnce({ venta: { ...VENTA, estado: 'en_gn' } } as never)
    const onLlego = vi.fn()
    const { REGLAS_INICIALES } = await import('@/lib/caja/core.core.js')
    await montar(<EsperaTransferencia venta={VENTA as never} reglas={REGLAS_INICIALES as never} onLlego={onLlego} onCambio={() => {}} />)
    await act(async () => boton('Transfirió a otra cuenta').click())
    const confirmar = () => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Validar transferencia') as HTMLButtonElement
    expect(confirmar().disabled).toBe(true)
    await act(async () => boton('Darío Arévalo').click())
    const banco = document.querySelector('input[placeholder^="Galicia"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(banco, 'Galicia')
      banco.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(confirmar().disabled).toBe(false)
    await act(async () => confirmar().click())
    expect(vi.mocked(confirmarOtraCuenta)).toHaveBeenCalledWith(VENTA.id, 'dario', 'Galicia')
    expect(onLlego).toHaveBeenCalled()
  })

  it('V4: una tienda sin titulares cargados ⛔ ofrece «Transfirió a otra cuenta»', async () => {
    const { cruzarVenta } = await import('@/lib/caja/cliente')
    vi.mocked(cruzarVenta).mockResolvedValue({ venta: VENTA, cruce: { estado: 'esperando' }, recientes: [], cuentaMp: null } as never)
    await montar(<EsperaTransferencia venta={VENTA as never} reglas={{ redondeo: 100, cuentas: {} }} onLlego={vi.fn()} onCambio={() => {}} />)
    await hastaQue(() => !!boton('Completar con otro cobro'))
    expect(boton('Transfirió a otra cuenta')).toBeFalsy()
  })

  it('🔑 «Cambiar forma de pago» en el POS: cancela con motivo y las prendas vuelven al carrito', async () => {
    const { cruzarVenta, cancelarVenta, elegirVariante, leerPendientes } = await import('@/lib/caja/cliente')
    vi.mocked(cruzarVenta).mockResolvedValue({ venta: VENTA, cruce: { estado: 'esperando' }, recientes: [], cuentaMp: null } as never)
    vi.mocked(leerPendientes).mockResolvedValue({ ventas: [VENTA] } as never)
    vi.mocked(elegirVariante).mockResolvedValue({ variante: PRENDA.variante, stock: PRENDA.stock } as never)
    vi.mocked(cancelarVenta).mockResolvedValue({ venta: { ...VENTA, estado: 'cancelada' } } as never)
    await montar(<CajaPOS />)
    await hastaQue(() => !!boton('Cambiar forma de pago'))
    await act(async () => boton('Cambiar forma de pago').click())
    await act(async () => new Promise((r) => setTimeout(r, 10)))
    await hastaQue(() => vi.mocked(cancelarVenta).mock.calls.length > 0)
    expect(vi.mocked(cancelarVenta)).toHaveBeenCalledWith(VENTA.id, 'cambio_pago')
    expect(borrador().renglones).toHaveLength(1)
    expect(document.body.textContent).toContain('sus prendas volvieron al carrito')
    vi.mocked(leerPendientes).mockResolvedValue({ ventas: [] } as never)
  })

  it('🔴 con otra venta en el carrito ⛔ cambia: lo dice y la venta sigue esperando', async () => {
    const { cruzarVenta, cancelarVenta, leerPendientes } = await import('@/lib/caja/cliente')
    vi.mocked(cancelarVenta).mockClear()
    // La consulta a MP llega DESPUÉS del clic (como en el CI, lento): ⛔ tiene que borrar el error de la acción.
    vi.mocked(cruzarVenta).mockImplementation(() => new Promise((r) => setTimeout(() => r({ venta: VENTA, cruce: { estado: 'esperando' }, recientes: [], cuentaMp: null } as never), 300)))
    vi.mocked(leerPendientes).mockResolvedValue({ ventas: [VENTA] } as never)
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'b-otra', renglones: [PRENDA], email: '' }))
    await montar(<CajaPOS />)
    // El carrito guardado se lee aparte: hasta que llega, el carrito está vacío.
    await hastaQue(() => !!boton('Cambiar forma de pago') && (document.body.textContent || '').includes('PRENDA 1'))
    await act(async () => boton('Cambiar forma de pago').click())
    await hastaQue(() => (document.body.textContent || '').includes('Hay otra venta en el carrito'))
    await act(async () => new Promise((r) => setTimeout(r, 400)))
    expect(document.body.textContent).toContain('Hay otra venta en el carrito')
    expect(vi.mocked(cancelarVenta)).not.toHaveBeenCalled()
    vi.mocked(leerPendientes).mockResolvedValue({ ventas: [] } as never)
  })
})

describe('Ventas de la caja (Bruno, 12-oct)', () => {
  const v = (id: string, extra: Record<string, unknown>) => ({ id, estado: 'en_gn', total: 10000, subtotal: 10000, pagos: [{ cuenta: 12921, monto: 10000 }], renglones: [{ product_id: 1, size_id: 1, cantidad: 2, precio: 5000, nombre: 'TOP AIXA', talle: 'S' }], creada_en: new Date().toISOString(), gn_number: null, usuario: 'Sofi', email: null, paga_con: null, ...extra })
  it('🔑 impresora, las provisorias en su sección de abajo, y el ojo abre el resumen', async () => {
    const { leerVentasTurno } = await import('@/lib/caja/cliente')
    vi.mocked(leerVentasTurno).mockResolvedValueOnce({ ventas: [
      v('a0000000-0000-4000-8000-000000000001', { estado: 'esperando_pago' }),
      v('a0000000-0000-4000-8000-000000000002', { gn_number: 30100, mp_cruce: 'otra_cuenta', confirmacion: { por: 'Sofi', en: '', titular: 'Darío Arévalo', banco: 'Galicia' } }),
    ] } as never)
    const reimprimir = vi.fn()
    await montar(<VentasDelTurno nombreCuenta={() => 'Efectivo'} onReimprimir={reimprimir} onCerrar={() => {}} />)
    await hastaQue(() => (document.body.textContent || '').includes('#30100'))
    const t = document.body.textContent || ''
    expect(t.indexOf('#30100')).toBeLessThan(t.indexOf('Provisorias (1)'))
    expect(t).toContain('transferencia a Darío Arévalo (Galicia)')
    // Las provisorias arrancan plegadas: la que espera ⛔ se ve hasta abrirlas, y quedan abiertas.
    expect(document.querySelectorAll('button[aria-label="Ver la venta"]')).toHaveLength(1)
    await act(async () => [...document.querySelectorAll('button[aria-expanded]')].find((b) => b.textContent?.includes('Provisorias (1)'))!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(document.querySelectorAll('button[aria-label="Ver la venta"]')).toHaveLength(2)
    expect(disco.get('caja:ventas:provisorias-abiertas')).toBe('1')
    // La impresora sólo en la que tiene ticket (la que espera ⛔).
    const imp = document.querySelectorAll('button[aria-label="Reimprimir ticket"]')
    expect(imp).toHaveLength(1)
    await act(async () => (imp[0] as HTMLButtonElement).click())
    expect(reimprimir).toHaveBeenCalledWith(expect.objectContaining({ gn_number: 30100 }))
    await act(async () => (document.querySelectorAll('button[aria-label="Ver la venta"]')[0] as HTMLButtonElement).click())
    const r = document.body.textContent || ''
    expect(r).toContain('2 × TOP AIXA')
    expect(r).toContain('Cobró: Sofi')
    expect(r).not.toContain('Provisorias (1)')
  })
})

describe('POS · la oferta en varios pagos (Bruno, 13-oct)', () => {
  const escribir = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  }

  it('🔑 «Varios pagos» ⛔ se traba: la oferta se parte entre efectivo y transferencia, y el resto aparte', async () => {
    const { leerConfig, confirmarVenta } = await import('@/lib/caja/cliente')
    const { REGLAS_INICIALES } = await import('@/lib/caja/core.core.js')
    const conf = { reglas: { ...REGLAS_INICIALES, transferenciaA: REGLAS_INICIALES.medios.transferencia.opciones[0], feriaProductos: [{ id: 1, nombre: 'PRENDA 1' }] }, politica_cambio: null }
    vi.mocked(leerConfig).mockResolvedValue(conf as never)
    vi.mocked(confirmarVenta).mockClear()
    const comun = { ...PRENDA, variante: { ...PRENDA.variante, product_id: 2, product_name: 'PRENDA 2' }, precio: 20000 }
    disco.set('caja:borrador:zattia', JSON.stringify({ id: 'b-oferta', renglones: [{ ...PRENDA, cantidad: 2 }, comun], email: '' }))
    await montar(<CajaPOS />)
    await act(async () => boton('Continuar al cobro Alt+C').click())
    const varios = boton('Varios pagos')
    expect(varios.disabled).toBe(false)
    await act(async () => varios.click())
    const t = document.body.textContent || ''
    expect(t).toContain('La oferta')
    expect(t).toContain('El resto')
    expect(t).toContain('Lo que no está en oferta se paga con cualquier forma de pago')
    // La oferta: sólo las formas de pago que la cobran aparte.
    const selects = [...document.querySelectorAll('select')].filter((s) => /Forma de pago \d/.test(s.getAttribute('aria-label') ?? '')) as HTMLSelectElement[]
    expect(selects).toHaveLength(3)
    expect([...selects[0].options].map((o) => o.value).filter(Boolean)).toEqual(['efectivo', 'transferencia'])
    await act(async () => escribir(selects[0], 'efectivo'))
    await act(async () => escribir(document.querySelector('input[aria-label="Lo que paga con el pago 1"]') as HTMLInputElement, '6000'))
    await act(async () => escribir(selects[1], 'transferencia'))
    // El resto: las cuatro, aunque débito y crédito ⛔ acepten oferta (Bruno, 13-oct).
    expect([...selects[2].options].map((o) => o.value).filter(Boolean)).toEqual(['efectivo', 'transferencia', 'debito', 'credito'])
    await act(async () => escribir(selects[2], 'debito'))
    const fin = [...document.querySelectorAll('button')].find((b) => /^(Finalizar venta|Validar transferencia)/.test(b.textContent ?? '')) as HTMLButtonElement
    expect(fin.disabled).toBe(false)
    await act(async () => fin.click())
    await act(async () => {})
    const pedido = vi.mocked(confirmarVenta).mock.calls[0][0] as unknown as { pagos: { cuenta: number; base?: number }[] }
    const m = REGLAS_INICIALES.medios
    expect(pedido.pagos).toEqual([
      { cuenta: m.efectivo.feria, base: 6000 },
      { cuenta: m.transferencia.feria, base: 14000 },
      { cuenta: m.debito.normal },
    ])
  })
})
