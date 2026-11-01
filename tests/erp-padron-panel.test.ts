/**
 * El padrón de ARCA en el panel (`padronDelPanel`): CUIT ⇒ razón social, condición (la OPCIÓN del panel) y domicilio.
 * Lo que importa: un CUIT mal tipeado ⛔ llega a ARCA, la condición sale con la clave del panel (`ri`…) y un error de ARCA
 * sale DICHO (la pantalla deja tipear). El oráculo es la 1ª consulta real en producción (el CUIT de Areben).
 */
import { describe, expect, it, vi } from 'vitest'
import { padronDelPanel } from '../api/_erp-factura-mayorista.js'
import { permisoErpDe } from '../lib/permisos.core.js'
import { COND_IVA } from '../motor/arca/arca.core.js'

const persona = (extra = {}) => ({
  cuit: '30718508181', razonSocial: 'AREBEN COMERCIAL S.R.L.', condicion: 'responsable_inscripto', condicionIva: COND_IVA.RESPONSABLE_INSCRIPTO,
  domicilioTexto: 'CORRIENTES 763, ROSARIO (2000), SANTA FE', estadoClave: 'ACTIVO', avisos: [], ...extra,
})

describe('padronDelPanel', () => {
  it('CUIT válido ⇒ los datos con la condición del panel', async () => {
    const arca = { persona: vi.fn(async () => persona()) }
    const r = await padronDelPanel({ cuit: '30-71850818-1' }, { prendido: true, arca })
    expect(arca.persona).toHaveBeenCalledWith('30718508181')
    expect(r).toEqual({
      prendido: true, cuit: '30718508181', razonSocial: 'AREBEN COMERCIAL S.R.L.', condicion: 'ri',
      domicilio: 'CORRIENTES 763, ROSARIO (2000), SANTA FE', estadoClave: 'ACTIVO', avisos: [],
    })
  })
  it('monotributo y consumidor final salen con su clave del panel', async () => {
    const m = await padronDelPanel({ cuit: '30718508181' }, { prendido: true, arca: { persona: async () => persona({ condicionIva: COND_IVA.MONOTRIBUTO }) } })
    const c = await padronDelPanel({ cuit: '30718508181' }, { prendido: true, arca: { persona: async () => persona({ condicionIva: COND_IVA.CONSUMIDOR_FINAL }) } })
    expect([m.condicion, c.condicion]).toEqual(['monotributo', 'consumidor'])
  })
  it('un CUIT con el dígito mal ⛔ llega a ARCA', async () => {
    const arca = { persona: vi.fn() }
    expect(await padronDelPanel({ cuit: '30718508182' }, { prendido: true, arca })).toMatchObject({ status: 400 })
    expect(await padronDelPanel({ cuit: '' }, { prendido: true, arca })).toMatchObject({ status: 400 })
    expect(arca.persona).not.toHaveBeenCalled()
  })
  it('apagado ⇒ { prendido: false } sin consultar', async () => {
    const arca = { persona: vi.fn() }
    expect(await padronDelPanel({ cuit: '30718508181' }, { prendido: false, arca })).toEqual({ prendido: false })
    expect(arca.persona).not.toHaveBeenCalled()
  })
  it('lo que dice ARCA sale dicho; la tabla sin migrar, también', async () => {
    const no = await padronDelPanel({ cuit: '30718508181' }, { prendido: true, arca: { persona: async () => { throw new Error('Padrón de ARCA: No existe persona con ese Id') } } })
    expect(no).toEqual({ status: 502, error: 'ARCA dice: No existe persona con ese Id' })
    const sinTabla = await padronDelPanel({ cuit: '30718508181' }, { prendido: true, arca: { persona: async () => { throw new Error('arca_ta_servicio: relation "public.arca_ta_servicio" does not exist') } } })
    expect(sinTabla).toMatchObject({ status: 409, error: expect.stringMatching(/migrate-arca-ta-servicio/) })
  })
  it('la vista pide el permiso de facturar', () => {
    expect(permisoErpDe({ method: 'GET', vista: 'padron-panel' })).toBe('facturar-venta')
  })
})
