import { describe, expect, it, vi } from 'vitest'
import { cuitParaBcra, leerRespuestaBcra, mesBcra, resumirBcra, tonoBcra } from '../lib/erp/bcra.core.js'
import { bcraDelPanel, situacionBcra } from '../api/_erp-clientes.js'

// La forma REAL de la respuesta (medida 31-oct con el CUIT de Areben; los nombres de banco son los que vinieron).
const DEUDAS = {
  status: 200,
  results: {
    identificacion: 30718508181, denominacion: 'AREBEN COMERCIAL S. R. L.',
    periodos: [{
      periodo: '202609', entidades: [
        { entidad: 'BANCO DE GALICIA Y BUENOS AIRES S.A.', situacion: 1, fechaSit1: '2025-05-30', monto: 8204.0, diasAtrasoPago: 0, refinanciaciones: false, recategorizacionOblig: false, situacionJuridica: false, irrecDisposicionTecnica: false, enRevision: false, procesoJud: false },
        { entidad: 'BANCO MACRO S.A.', situacion: 1, fechaSit1: '2025-05-30', monto: 20323.0, diasAtrasoPago: 0, refinanciaciones: false, recategorizacionOblig: false, situacionJuridica: false, irrecDisposicionTecnica: false, enRevision: false, procesoJud: false },
      ],
    }],
  },
}
const HISTORICAS = {
  status: 200,
  results: {
    identificacion: 30718508181, denominacion: 'AREBEN COMERCIAL S. R. L.',
    periodos: [
      { periodo: '202609', entidades: [{ entidad: 'BANCO MACRO S.A.', situacion: 1, monto: 20323.0, enRevision: false, procesoJud: false }] },
      { periodo: '202603', entidades: [{ entidad: 'BANCO MACRO S.A.', situacion: 3, monto: 900.0, enRevision: false, procesoJud: false }] },
    ],
  },
}
const NO_FIGURA = { status: 404, errorMessages: ['No se encontró datos para la identificación ingresada.'] }
// El ejemplo del manual del BCRA (ChequesRechazados): `monto` en PESOS, `fechaPago` null = sin pagar.
const CHEQUES = {
  status: 200,
  results: {
    identificacion: 20123456789, denominacion: 'X',
    causales: [{ causal: 'SIN FONDOS', entidades: [{ entidad: 1, detalle: [
      { nroCheque: 752395, fechaRechazo: '2024-04-08', monto: 115000.0, fechaPago: null, fechaPagoMulta: null, estadoMulta: 'IMPAGA' },
      { nroCheque: 752396, fechaRechazo: '2024-04-09', monto: 50000.0, fechaPago: '2024-05-01', fechaPagoMulta: '2024-05-01', estadoMulta: null },
    ] }] }],
  },
}

describe('BCRA: leer y resumir', () => {
  it('el CUIT: sólo 11 dígitos (un DNI ⛔ se consulta)', () => {
    expect(cuitParaBcra('30-71850818-1')).toBe('30718508181')
    expect(cuitParaBcra('30123456')).toBeNull()
    expect(cuitParaBcra(null)).toBeNull()
  })

  it('404 «No se encontró» = NO DEBE (⛔ error); otro 404 o un 500 sí es error', () => {
    expect(leerRespuestaBcra(404, NO_FIGURA)).toEqual({ estado: 'nada' })
    expect(leerRespuestaBcra(500, { status: 500, errorMessages: ['Se produjo un error al ejecutar la acción.'] }).estado).toBe('error')
    expect(leerRespuestaBcra(404, null).estado).toBe('error')
  })

  it('el monto de las deudas viene en MILES de pesos ⇒ se pasa a pesos', () => {
    const r = resumirBcra({ deudas: leerRespuestaBcra(200, DEUDAS) })
    expect(r).toMatchObject({ ok: true, denominacion: 'AREBEN COMERCIAL S. R. L.', periodo: '202609', peor: 1, deuda: 28_527_000 })
    expect(r.bancos[0]).toMatchObject({ entidad: 'BANCO MACRO S.A.', monto: 20_323_000 }) // el más grande primero
    expect(tonoBcra(r)).toBe('verde')
  })

  it('sin deudas (404) ⇒ ok, peor 0, sin bancos', () => {
    const r = resumirBcra({ deudas: leerRespuestaBcra(404, NO_FIGURA), cheques: leerRespuestaBcra(404, NO_FIGURA) })
    expect(r).toMatchObject({ ok: true, peor: 0, deuda: 0, bancos: [], cheques: { total: 0, sinPagar: 0, monto: 0 } })
    expect(tonoBcra(r)).toBe('verde')
  })

  it('la historia trae el PEOR de 12 meses: hoy 1 pero hace 6 meses 3 ⇒ rojo', () => {
    const r = resumirBcra({ deudas: leerRespuestaBcra(200, DEUDAS), historicas: leerRespuestaBcra(200, HISTORICAS) })
    expect(r.peor12).toBe(3)
    expect(r.historia).toEqual([{ periodo: '202609', peor: 1 }, { periodo: '202603', peor: 3 }])
    expect(tonoBcra(r)).toBe('rojo')
  })

  it('cheques: cuenta los rechazados y suma en PESOS sólo los sin pagar', () => {
    const r = resumirBcra({ deudas: leerRespuestaBcra(404, NO_FIGURA), cheques: leerRespuestaBcra(200, CHEQUES) })
    expect(r.cheques).toEqual({ total: 2, sinPagar: 1, monto: 115_000 })
    expect(tonoBcra(r)).toBe('rojo')
  })

  it('si la consulta de deudas falla, el resumen dice el error (⛔ «sin deudas»)', () => {
    expect(resumirBcra({ deudas: { estado: 'error', mensaje: 'El BCRA contestó 500' } })).toEqual({ ok: false, error: 'El BCRA contestó 500' })
  })

  it('el mes del período', () => {
    expect(mesBcra('202609')).toBe('sep-26')
    expect(mesBcra('x')).toBe('')
  })
})

describe('BCRA: la consulta y la vista del panel', () => {
  const respuesta = (status: number, json: unknown) => ({ status, json: async () => json }) as unknown as Response

  it('pide las tres rutas con el CUIT; si historia y cheques fallan sale igual sin ellas', async () => {
    const f = vi.fn(async (url: string) => {
      if (url.endsWith('/Deudas/30718508181')) return respuesta(200, DEUDAS)
      throw new Error('red')
    })
    const r = await situacionBcra('30718508181', { fetch: f as unknown as typeof fetch })
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/30718508181',
      'https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/Historicas/30718508181',
      'https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/ChequesRechazados/30718508181',
    ])
    expect(r).toMatchObject({ ok: true, peor: 1, historia: null, cheques: null })
  })

  const conDoc = (doc: string | null) => vi.fn(async (_m: string, _q: string, fn: (pg: unknown) => unknown) =>
    fn({ query: async () => ({ rows: doc === undefined ? [] : [{ doc }] }) }))

  it('apagado ⇒ ⛔ consulta nada', async () => {
    const f = vi.fn()
    expect(await bcraDelPanel({ clienteId: '00000000-0000-0000-0000-000000000001' }, { conMotor: conDoc('30718508181'), prendido: false, fetch: f })).toEqual({ prendido: false })
    expect(f).not.toHaveBeenCalled()
  })

  it('el CUIT sale de la FICHA; con DNI contesta sinCuit sin ir al BCRA', async () => {
    const f = vi.fn()
    expect(await bcraDelPanel({ clienteId: '00000000-0000-0000-0000-000000000001' }, { conMotor: conDoc('30123456'), prendido: true, fetch: f })).toEqual({ prendido: true, sinCuit: true })
    expect(f).not.toHaveBeenCalled()
  })

  it('sin id válido ⇒ 400', async () => {
    expect(await bcraDelPanel({ clienteId: 'x' }, { conMotor: conDoc('1'), prendido: true })).toMatchObject({ status: 400 })
  })

  it('con CUIT ⇒ consulta y devuelve el resumen con el CUIT', async () => {
    const f = vi.fn(async (url: string) => url.endsWith('/Deudas/30718508181') ? respuesta(200, DEUDAS) : respuesta(404, NO_FIGURA))
    const r = await bcraDelPanel({ clienteId: '00000000-0000-0000-0000-000000000001' }, { conMotor: conDoc('30718508181'), prendido: true, fetch: f as unknown as typeof fetch })
    expect(r).toMatchObject({ prendido: true, cuit: '30718508181', ok: true, deuda: 28_527_000, cheques: { total: 0 } })
  })

  it('si el motor no está conectado, pasa su 409', async () => {
    const sinMotor = vi.fn(async () => ({ status: 409, error: 'falta la conexión' }))
    expect(await bcraDelPanel({ clienteId: '00000000-0000-0000-0000-000000000001' }, { conMotor: sinMotor, prendido: true })).toMatchObject({ status: 409 })
  })
})
