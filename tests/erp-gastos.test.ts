import { beforeEach, describe, expect, it, vi } from 'vitest'

const comerciales = vi.fn()
const registrar = vi.fn()
vi.mock('../motor/gasto/gasto.mjs', () => ({ gastosComerciales: (...a: unknown[]) => comerciales(...a), registrarGasto: (...a: unknown[]) => registrar(...a) }))

import { gastosDelPeriodo, registrarGastoErp } from '../api/_erp-gastos.js'
import { permisoErpDe } from '../lib/permisos.core.js'

/** Un `conMotor` de mentira: `marca` devuelve las líneas pedidas con su empresa. */
const conMotor = async (_m: string, _q: string, fn: (pg: unknown) => Promise<unknown>) =>
  fn({ query: async (_sql: string, p: unknown[]) => ({ rows: (p[0] as string[] | string) instanceof Array ? (p[0] as string[]).map((id) => ({ id, empresa_id: 'areben' })) : [{ empresa_id: 'areben' }] }) })
const vacio = { ok: true, por_tipo: { comision: 0, impuesto: 0, otro: 0 }, meses: [], comision_automatica: 0, cobrosSinComision: 0, gastos: [] }

describe('gastos comerciales (puerta del monitor)', () => {
  beforeEach(() => { comerciales.mockReset(); registrar.mockReset() })

  it('ver y cargar gastos es sólo de admin', () => {
    expect(permisoErpDe({ method: 'GET', vista: 'gastos' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'registrar-gasto' })).toBe('configurar')
  })

  it('valida marca y período antes de tocar el motor', async () => {
    expect((await gastosDelPeriodo({ marca: 'x', desde: '2026-10-01', hasta: '2026-10-31' }, { conMotor })).status).toBe(400)
    expect((await gastosDelPeriodo({ marca: 'bdi', desde: 'ayer', hasta: '2026-10-31' }, { conMotor })).status).toBe(400)
    expect(comerciales).not.toHaveBeenCalled()
  })

  it('sin línea (el puente del dashboard, que es de Areben) Zattia suma sus dos líneas: total, por tipo, por mes y los cargados', async () => {
    comerciales.mockImplementation(async (_pg, { marca }) => marca === 'zattia'
      ? { ...vacio, por_tipo: { comision: 675, impuesto: 1000, otro: 0 }, meses: [{ mes: '2026-10', total: 1675, por_tipo: { comision: 675, impuesto: 1000, otro: 0 } }], comision_automatica: 675, cobrosSinComision: 1,
        gastos: [{ id: 'g1', fecha: '2026-10-05', tipo: 'impuesto', monto: 1000 }] }
      : { ...vacio, por_tipo: { comision: 25.5, impuesto: 0, otro: 0 }, meses: [{ mes: '2026-10', total: 25.5, por_tipo: { comision: 25.5, impuesto: 0, otro: 0 } }], comision_automatica: 25.5 })
    const r = await gastosDelPeriodo({ marca: 'zattia', desde: '2026-10-01', hasta: '2026-10-31', prueba: false }, { conMotor })
    expect(comerciales.mock.calls.map((c) => c[1].marca).sort()).toEqual(['stunned', 'zattia'])
    expect(r.total).toBe(1700.5)
    expect(r.por_tipo).toEqual({ comision: 700.5, impuesto: 1000, otro: 0, plataforma: 0 })
    expect(r.meses).toHaveLength(1)
    expect(r.meses[0].total).toBe(1700.5)
    expect(r.comisionAutomatica).toBe(700.5)
    expect(r.cobrosSinComision).toBe(1)
    expect(r.gastos).toEqual([{ id: 'g1', fecha: '2026-10-05', tipo: 'impuesto', monto: 1000, linea: 'zattia' }])
  })

  it('motor sql/061: el costo de Tienda Nube llega en su RENGLÓN y DENTRO del total (⛔ mezclado con la comisión)', async () => {
    comerciales.mockResolvedValue({ ...vacio, por_tipo: { comision: 1030, impuesto: 0, otro: 0, plataforma: 242 }, comision_automatica: 1030, plataforma_automatica: 242,
      meses: [{ mes: '2026-10', total: 1272, por_tipo: { comision: 1030, impuesto: 0, otro: 0, plataforma: 242 } }] })
    const r = await gastosDelPeriodo({ marca: 'zattia', linea: 'stunned', desde: '2026-10-01', hasta: '2026-10-31', prueba: false }, { conMotor })
    expect([r.total, r.por_tipo.comision, r.por_tipo.plataforma, r.plataformaAutomatica, r.meses[0].por_tipo.plataforma]).toEqual([1272, 1030, 242, 242, 242])
  })

  it('con línea, SÓLO esa (el ERP: mirando Stunned ⛔ se ven los gastos de Zattia, Bruno 30-oct)', async () => {
    comerciales.mockImplementation(async (_pg, { marca }) => marca === 'zattia'
      ? { ...vacio, por_tipo: { comision: 675, impuesto: 1000, otro: 0 }, meses: [{ mes: '2026-10', total: 1675, por_tipo: { comision: 675, impuesto: 1000, otro: 0 } }], comision_automatica: 675,
        gastos: [{ id: 'g1', fecha: '2026-10-05', tipo: 'impuesto', monto: 1000 }] }
      : { ...vacio, por_tipo: { comision: 25.5, impuesto: 0, otro: 0 }, meses: [{ mes: '2026-10', total: 25.5, por_tipo: { comision: 25.5, impuesto: 0, otro: 0 } }], comision_automatica: 25.5 })
    const r = await gastosDelPeriodo({ marca: 'zattia', linea: 'stunned', desde: '2026-10-01', hasta: '2026-10-31' }, { conMotor })
    expect(comerciales.mock.calls.map((c) => c[1].marca)).toEqual(['stunned'])
    expect(r.total).toBe(25.5)
    expect(r.comisionAutomatica).toBe(25.5)
    expect(r.meses[0].total).toBe(25.5)
    expect(r.gastos).toEqual([])
  })

  it('una línea que no es de la marca ⇒ 400 sin tocar el motor', async () => {
    expect((await gastosDelPeriodo({ marca: 'bdi', linea: 'stunned', desde: '2026-10-01', hasta: '2026-10-31' }, { conMotor })).status).toBe(400)
    expect((await gastosDelPeriodo({ marca: 'zattia', linea: '', desde: '2026-10-01', hasta: '2026-10-31' }, { conMotor })).status).toBe(400)
    expect(comerciales).not.toHaveBeenCalled()
  })

  it('cargar un gasto: pide quién, valida la línea y le pasa al motor lo que escribió', async () => {
    registrar.mockResolvedValue({ ok: true, gasto: { id: 'g1' } })
    const body = { fecha: '2026-10-27', tipo: 'impuesto', monto: 1234.5, detalle: 'IIBB', cuenta: 'ARCA' }
    expect((await registrarGastoErp({ marca: 'bdi', body, usuario: null }, { conMotor })).status).toBe(400)
    expect((await registrarGastoErp({ marca: 'bdi', body: { ...body, linea: 'stunned' }, usuario: 'bruno' }, { conMotor })).status).toBe(400)
    const r = await registrarGastoErp({ marca: 'zattia', body: { ...body, linea: 'stunned' }, usuario: 'bruno' }, { conMotor })
    expect(r).toEqual({ ok: true, gasto: { id: 'g1' } })
    expect(registrar.mock.calls[0][1]).toMatchObject({ empresa_id: 'areben', marca: 'stunned', tipo: 'impuesto', monto: 1234.5, detalle: 'IIBB', cuenta: 'ARCA', usuario: 'bruno', prueba: true })
  })

  it('un rechazo del motor vuelve con su mensaje y un 400', async () => {
    registrar.mockResolvedValue({ ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'Falta el detalle' } })
    expect(await registrarGastoErp({ marca: 'bdi', body: { fecha: '2026-10-27', tipo: 'otro', monto: 5, detalle: '' }, usuario: 'bruno' }, { conMotor })).toEqual({ status: 400, error: 'Falta el detalle' })
  })
})
