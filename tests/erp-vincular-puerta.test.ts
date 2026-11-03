import { describe, expect, it, vi } from 'vitest'
import { buscarVariantesVinculo, ponerVinculoErp, vinculosDeTienda } from '../api/_erp-vincular.js'
import { permisoErpDe } from '../lib/permisos.core.js'

/** La puerta de «Vincular»: frena lo mal formado ANTES de abrir la base, y sólo Admin. */
const deps = () => ({ conMotor: vi.fn(async () => ({ ok: true })) })

describe('Vincular (puerta)', () => {
  it('una tienda que no es de la marca ⛔ abre la base', async () => {
    const d = deps()
    expect((await vinculosDeTienda({ marca: 'bdi', tienda: 'zattia' }, d)).status).toBe(400)
    expect((await vinculosDeTienda({ marca: 'x', tienda: 'bdi' }, d)).status).toBe(400)
    expect((await buscarVariantesVinculo({ marca: 'zattia', tienda: 'bdi', q: 'a' }, d)).status).toBe(400)
    expect(d.conMotor).not.toHaveBeenCalled()
  })
  it('Stunned se vincula desde la base de Zattia', async () => {
    const d = deps()
    await vinculosDeTienda({ marca: 'zattia', tienda: 'stunned' }, d)
    expect(d.conMotor).toHaveBeenCalledTimes(1)
    expect(d.conMotor.mock.calls[0]?.[0 as never]).toBe('zattia')
  })
  it('sin las tres variantes con ids válidos ⛔ guarda', async () => {
    const d = deps()
    for (const body of [{}, { marca: 'bdi', tienda: 'bdi' }, { marca: 'bdi', tienda: 'bdi', variant_id: 1, product_id: 2 }, { marca: 'bdi', tienda: 'bdi', variant_id: '1;drop', product_id: 2, size_id: 3 }, { marca: 'bdi', tienda: 'bdi', variant_id: -1, product_id: 2, size_id: 3 }]) {
      expect((await ponerVinculoErp({ body, usuario: 'x' }, d)).status).toBe(400)
    }
    expect(d.conMotor).not.toHaveBeenCalled()
  })
  it('sólo Admin', () => {
    expect(permisoErpDe({ method: 'GET', vista: 'vinculos' })).toBe('configurar')
    expect(permisoErpDe({ method: 'GET', vista: 'vinculos-buscar' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'poner-vinculo' })).toBe('configurar')
  })
})

describe('Vincular (forma del pedido en la entrada del ERP)', () => {
  it('las vistas y la acción pasan; una tienda desconocida ⛔', async () => {
    const { entradaInvalida } = await import('../lib/erp/entrada.core.js')
    expect(entradaInvalida({ method: 'GET', query: { vista: 'vinculos', marca: 'bdi', tienda: 'bdi' } })).toBeNull()
    expect(entradaInvalida({ method: 'GET', query: { vista: 'vinculos-buscar', marca: 'zattia', tienda: 'stunned', q: 'mag case' } })).toBeNull()
    expect(entradaInvalida({ method: 'GET', query: { vista: 'vinculos', tienda: 'otra' } })).toMatchObject({ status: 400 })
    expect(entradaInvalida({ method: 'POST', body: { accion: 'poner-vinculo', marca: 'bdi', tienda: 'bdi', variant_id: 1, product_id: 2, size_id: 3 } })).toBeNull()
  })
})
