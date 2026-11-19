import { describe, expect, it, vi } from 'vitest'
import { permisoErpDe, puedeErp, type Perfil } from '@/lib/permisos'
import { ACCIONES } from '@/lib/erp/entrada.core.js'

/**
 * **«Eliminar» un ajuste aplicado (Bruno 18-nov)**, del lado del servidor del monitor: sólo Admin (`configurar`), el ajuste tiene que
 * ser de la línea que se pide (el id viaja del navegador) y cada freno del motor se dice en palabras de la pantalla, con el depósito
 * por su nombre. La regla (qué se puede eliminar, el movimiento contrario) es del motor: `test/ajuste-eliminar-pg.mjs` de areben-motor.
 */
const eliminarAjuste = vi.fn()
vi.mock('../motor/stock/ajuste.mjs', () => ({ eliminarAjuste: (...a: unknown[]) => eliminarAjuste(...a), porQueNoSeElimina: () => null }))

const ID = '0d6c3f0e-0000-4000-8000-000000000005'
const conMotor = (lineaDelAjuste: string | null) => vi.fn(async (_base: string, _q: string, fn: (pg: unknown) => unknown) =>
  fn({ query: async () => ({ rows: lineaDelAjuste ? [{ linea: lineaDelAjuste }] : [] }) }))

async function eliminar(linea: string, lineaDelAjuste: string | null) {
  const { eliminarAjusteErp } = await import('../api/_erp-ajustes.js')
  return eliminarAjusteErp({ body: { linea, ajusteId: ID }, usuario: 'Bruno Arevalo' }, { conMotor: conMotor(lineaDelAjuste) }) as Promise<Record<string, unknown>>
}

describe('Eliminar un ajuste aplicado', () => {
  it('sólo Admin: la acción pide `configurar` y Depósito (que carga y aprueba) ⛔ la tiene', () => {
    expect(ACCIONES).toContain('eliminar-ajuste')
    expect(permisoErpDe({ method: 'POST', accion: 'eliminar-ajuste' })).toBe('configurar')
    const deposito: Perfil = { name: 'Ana', admin: false, cuenta: null, funcion: ['deposito'], acceso: { bdi: { erp: true }, zattia: { erp: true } } }
    expect(puedeErp(deposito, 'bdi', 'aprobar-ajuste')).toBe(true)
    expect(puedeErp(deposito, 'bdi', 'configurar')).toBe(false)
    expect(puedeErp({ ...deposito, admin: true }, 'bdi', 'configurar')).toBe(true)
  })

  it('el ajuste de OTRA línea ⇒ 404 y el motor ⛔ se llama', async () => {
    eliminarAjuste.mockReset()
    expect(await eliminar('bdi', 'zattia')).toEqual({ status: 404, error: 'No está ese ajuste' })
    expect(await eliminar('bdi', null)).toEqual({ status: 404, error: 'No está ese ajuste' })
    expect(await eliminar('otra', 'otra')).toEqual({ status: 400, error: 'Línea inválida' })
    expect(eliminarAjuste).not.toHaveBeenCalled()
  })

  it('eliminado: devuelve el número; el motor recibe quién lo hizo', async () => {
    eliminarAjuste.mockReset().mockResolvedValueOnce({ ok: true, ajuste: { id: ID, numero: 12, estado: 'eliminado' }, movimientos: 2 })
    expect(await eliminar('bdi', 'bdi')).toEqual({ ok: true, numero: 12, estado: 'eliminado', movimientos: 2 })
    expect(eliminarAjuste.mock.calls[0][1]).toEqual({ ajuste_id: ID, usuario: 'Bruno Arevalo' })
  })

  it('cada freno, en palabras de la pantalla (⛔ «libro», ⛔ el id del depósito)', async () => {
    const con = async (codigo: string, mensaje = '') => { eliminarAjuste.mockReset().mockResolvedValueOnce({ ok: false, error: { codigo, mensaje } }); return eliminar('bdi', 'bdi') }
    const neg = await con('QUEDA_NEGATIVO', 'TOP-1: el ajuste sumó 5 en deposito_minorista y hoy hay 1; eliminarlo lo deja en -4')
    expect(neg.status).toBe(409)
    expect(neg.error).toBe('No se puede eliminar: lo que sumó ese ajuste ya salió. TOP-1: el ajuste sumó 5 en Depósito minorista y hoy hay 1; eliminarlo lo deja en -4.')
    expect((await con('DE_OTRO_FLUJO')).error).toMatch(/se deshace desde ese trámite/)
    expect((await con('ANTES_DEL_CORTE')).error).toMatch(/antes de pasar la marca a Areben Gestión/)
    expect((await con('NO_APLICADO')).error).toMatch(/si está pendiente, se descarta/)
    expect((await con('YA_RESUELTO')).error).toBe('Ese ajuste ya está eliminado: volvé a leer.')
  })
})
