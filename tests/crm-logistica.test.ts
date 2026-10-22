import { afterEach, describe, expect, it, vi } from 'vitest'
import { avisosDe, cambiosDeEnvio, entregaDe, sugerenciaDe, type PedidoLogistica, type PendienteLogistica } from '../lib/crm/logistica'

vi.mock('../api/_auth.js', () => ({ exigirUsuario: vi.fn(async () => ({ name: 'Darío', admin: true })) }))
vi.mock('../lib/permisos.core.js', () => ({ puedeVerAlguna: vi.fn(() => true), esAdmin: vi.fn(() => true) }))

const { default: handler, rutaDe, datosEtiqueta } = await import('../api/_logistica.js')
const { puedeVerAlguna, esAdmin } = await import('../lib/permisos.core.js')

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

describe('la etiqueta', () => {
  it('sólo viajan los datos de envío conocidos', () => {
    expect(datosEtiqueta({ dispatch_option: 3, carrier: 'via_cargo', shipping: { dni: ' 30111222 ', locality: '', otro: 'x' }, em: 4 })).toEqual({
      cuerpo: { dispatch_option: 3, carrier: 'via_cargo', shipping: { dni: '30111222', locality: null } },
    })
    expect(datosEtiqueta({ shipping: { dni: 30111222 } }).error).toBeTruthy()
  })
  it('vista previa e interpretar no guardan pero van por POST', () => {
    expect(rutaDe({ action: 'vista-previa', id: 604, datos: { dispatch_option: 2, shipping: {} } })).toEqual({
      ruta: '/mayorista/pedidos/604/etiqueta/vista-previa?formato=png',
      metodo: 'POST',
      cuerpo: { dispatch_option: 2, shipping: {} },
      imagen: true,
    })
    expect(rutaDe({ action: 'interpretar', text: '  ' }).error).toBe('Pegá el mensaje del cliente.')
  })
  it('generar manda lo que se vio', () => {
    expect(rutaDe({ action: 'etiqueta', id: 604, datos: { dispatch_option: 2, shipping: { dni: '1' } }, expected: { shipping: { dni: null } } }).cuerpo).toEqual({
      dispatch_option: 2,
      shipping: { dni: '1' },
      expected: { shipping: { dni: null } },
    })
  })
  it('cambiosDeEnvio: sólo lo que se tocó', () => {
    expect(cambiosDeEnvio({ dni: '1', locality: null }, { dni: '1 ', locality: 'Río Segundo', zipcode: '' })).toEqual({ locality: 'Río Segundo' })
  })
})

describe('api/_logistica.js', () => {
  it('lista cerrada de rutas: sólo números llegan a la URL', () => {
    expect(rutaDe({ action: 'cliente', clienteId: 649338 })).toEqual({ ruta: '/mayorista/clientes/649338/pedidos' })
    expect(rutaDe({ action: 'cliente', clienteId: '1/../../me' }).error).toBeTruthy()
    expect(rutaDe({ action: 'telefono', tel: '+54 9 383 427-0554' })).toEqual({ ruta: '/mayorista/pedidos?telefono=5493834270554' })
    expect(rutaDe({ action: 'despachar' }).error).toBeTruthy()
  })

  it('la forma de entrega: sólo esos campos, y siempre con lo que se vio', () => {
    expect(rutaDe({ action: 'entrega', id: 604, dispatch_option: 3, carrier: 'via_cargo', expected: { dispatch_option: null, carrier: null }, em: 5, shipping: { dni: '1' } })).toEqual({
      ruta: '/mayorista/pedidos/604',
      metodo: 'PATCH',
      cuerpo: { dispatch_option: 3, carrier: 'via_cargo', expected: { dispatch_option: null, carrier: null } },
    })
    expect(rutaDe({ action: 'entrega', id: 604, dispatch_option: 1 }).error).toBe('Falta lo que viste del pedido.')
    expect(rutaDe({ action: 'entrega', id: 604, dispatch_option: null, expected: { dispatch_option: 1 } }).error).toBe('Falta la forma de entrega.')
    expect(rutaDe({ action: 'entrega', id: '604/despachar', dispatch_option: 1, expected: { dispatch_option: null } }).error).toBeTruthy()
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
    vi.mocked(esAdmin).mockReturnValue(true)
  })

  it('cargar es sólo de admin; mirar no', async () => {
    vi.mocked(esAdmin).mockReturnValue(false)
    vi.stubEnv('LOGISTICA_TOKEN', 'lgk_secreto')
    const f = vi.fn(async () => new Response('{"count":0,"by_step":{},"orders":[]}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    const carga = await llamar({ action: 'entrega', id: 604, dispatch_option: 1, expected: { dispatch_option: null } })
    expect(carga.code).toBe(403)
    expect(f).not.toHaveBeenCalled()
    expect((await llamar({ action: 'pendientes' })).code).toBe(200)
  })

  it('el 409 vuelve tal cual, con el pedido como quedó', async () => {
    vi.stubEnv('LOGISTICA_TOKEN', 'lgk_secreto')
    const cuerpo = { detail: 'El pedido cambió.', conflicts: [{ field: 'dispatch_option', expected: null, current: 1 }], order: { id: 604 } }
    const f = vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: 409 }))
    vi.stubGlobal('fetch', f)
    const res = await llamar({ action: 'entrega', id: 604, dispatch_option: 3, carrier: 'via_cargo', expected: { dispatch_option: null, carrier: null } })
    expect(f).toHaveBeenCalledWith('https://logistica.arebensrl.com/api/ext/v1/mayorista/pedidos/604', expect.objectContaining({ method: 'PATCH' }))
    expect(res.code).toBe(409)
    expect(res.cuerpo).toEqual({ ...cuerpo, error: 'El pedido cambió.' })
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
