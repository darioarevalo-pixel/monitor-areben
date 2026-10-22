import { afterEach, describe, expect, it, vi } from 'vitest'
import { avisosDe, entregaDe, sugerenciaDe, type PedidoLogistica, type PendienteLogistica } from '../lib/crm/logistica'

vi.mock('../api/_auth.js', () => ({ exigirUsuario: vi.fn(async () => ({ name: 'Darío', admin: true })) }))
vi.mock('../lib/permisos.core.js', () => ({ puedeVerAlguna: vi.fn(() => true) }))

const { default: handler, rutaDe } = await import('../api/_logistica.js')
const { puedeVerAlguna } = await import('../lib/permisos.core.js')

function pedido(cambios: Partial<PedidoLogistica> = {}): PedidoLogistica {
  return {
    id: 604,
    gn_number: '32599',
    gn_client_id: '649338',
    client_name: 'Facundo López',
    client_phone: '543834270554',
    sold_at: '2026-10-21T13:05:00Z',
    status: { code: 2, label: 'En preparación' },
    dispatch_option: { code: 3, label: 'Transporte' },
    label_state: { code: 'datos_cargados', label: 'Datos cargados' },
    missing: [],
    has_label: false,
    em: null,
    carrier: { slug: 'via_cargo', label: 'Via Cargo' },
    tracking_number: null,
    tracking_url: null,
    tracking_source: null,
    tracking_needs_manual: false,
    units: { scanned: 37, total: 37, complete: true },
    dispatched_at: null,
    url: 'https://logistica.arebensrl.com/mayorista/604',
    updated_at: '2026-10-22T11:51:33Z',
    ...cambios,
  }
}

describe('avisosDe', () => {
  it('un pedido completo no avisa nada', () => {
    expect(avisosDe(pedido())).toEqual([])
  })
  it('sin forma de entrega', () => {
    expect(avisosDe(pedido({ dispatch_option: null, carrier: null }))).toEqual(['Falta elegir la forma de entrega'])
  })
  it('EM sin número', () => {
    expect(avisosDe(pedido({ dispatch_option: { code: 1, label: 'Etiqueta manual' }, carrier: null }))).toEqual(['Falta cargar el EM'])
  })
  it('faltan datos, con cuáles', () => {
    expect(avisosDe(pedido({ label_state: { code: 'falta_datos', label: 'Faltan datos' }, missing: ['Localidad', 'Código postal'] }))).toEqual([
      'Faltan datos: Localidad, Código postal',
    ])
  })
  it('Listo con menos unidades avisa; en preparación no', () => {
    const corto = { scanned: 30, total: 37, complete: false }
    expect(avisosDe(pedido({ units: corto }))).toEqual([])
    expect(avisosDe(pedido({ units: corto, status: { code: 3, label: 'Listo' } }))).toEqual(['Se cerró con 30 de 37 unidades: puede faltar un producto'])
  })
  it('seguimiento que no se pudo leer del PDF', () => {
    expect(avisosDe(pedido({ tracking_needs_manual: true }))).toEqual(['No se pudo leer el seguimiento del PDF: cargalo en Logística'])
  })
})

describe('entregaDe y sugerenciaDe', () => {
  it('arma la forma de entrega', () => {
    expect(entregaDe(pedido())).toBe('Transporte · Via Cargo')
    expect(entregaDe(pedido({ dispatch_option: { code: 1, label: 'Etiqueta manual' }, carrier: null, em: 12345 }))).toBe('Etiqueta manual · EM 12345')
    expect(entregaDe(pedido({ dispatch_option: null }))).toBeNull()
  })
  it('la sugerencia de la vez pasada', () => {
    const p = { ...pedido(), next_step: null, suggestion: { dispatch_option: { code: 3, label: 'Transporte' }, carrier: { slug: 'via_cargo', label: 'Via Cargo' }, from_gn_number: '31877', from_date: null } } as PendienteLogistica
    expect(sugerenciaDe(p)).toBe('La vez pasada: Transporte · Via Cargo')
    expect(sugerenciaDe({ ...p, suggestion: null })).toBeNull()
  })
})

describe('api/_logistica.js', () => {
  it('lista cerrada de rutas: sólo números llegan a la URL', () => {
    expect(rutaDe({ action: 'cliente', clienteId: 649338 })).toEqual({ ruta: '/mayorista/clientes/649338/pedidos' })
    expect(rutaDe({ action: 'cliente', clienteId: '1/../../me' }).error).toBeTruthy()
    expect(rutaDe({ action: 'telefono', tel: '+54 9 383 427-0554' })).toEqual({ ruta: '/mayorista/pedidos?telefono=5493834270554' })
    expect(rutaDe({ action: 'despachar' }).error).toBeTruthy()
  })

  function llamar(body: unknown) {
    const res = {
      code: 0,
      cuerpo: null as unknown,
      headers: {} as Record<string, string>,
      status(c: number) {
        this.code = c
        return this
      },
      json(b: unknown) {
        this.cuerpo = b
        return this
      },
      setHeader(k: string, v: string) {
        this.headers[k] = v
      },
    }
    return handler({ method: 'POST', body, headers: {}, query: {} }, res).then(() => res)
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.mocked(puedeVerAlguna).mockReturnValue(true)
  })

  it('sin permiso de Clientes no consulta', async () => {
    vi.mocked(puedeVerAlguna).mockReturnValue(false)
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const res = await llamar({ action: 'pendientes' })
    expect(res.code).toBe(403)
    expect(f).not.toHaveBeenCalled()
  })

  it('sin clave lo dice', async () => {
    vi.stubEnv('LOGISTICA_TOKEN', '')
    const res = await llamar({ action: 'pendientes' })
    expect(res.code).toBe(500)
    expect(res.cuerpo).toEqual({ error: 'Falta la clave de Logística en el Monitor.' })
  })

  it('manda el token, devuelve el error de Logística tal cual y no lo filtra', async () => {
    vi.stubEnv('LOGISTICA_TOKEN', 'lgk_secreto')
    const f = vi.fn(async () => new Response(JSON.stringify({ detail: 'El token venció.' }), { status: 401 }))
    vi.stubGlobal('fetch', f)
    const res = await llamar({ action: 'me' })
    expect(f).toHaveBeenCalledWith('https://logistica.arebensrl.com/api/ext/v1/me', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer lgk_secreto' }) }))
    expect(res.code).toBe(401)
    expect(res.cuerpo).toEqual({ detail: 'El token venció.', error: 'El token venció.' })
    expect(JSON.stringify(res.cuerpo)).not.toContain('lgk_')
  })
})
