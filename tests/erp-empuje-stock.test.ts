import { beforeEach, describe, expect, it, vi } from 'vitest'

const pedir = vi.fn()
const leer = vi.fn()
vi.mock('../motor/tn/pedido-stock.mjs', () => ({ pedirEmpujeStock: (...a: unknown[]) => pedir(...a), empujesStock: (...a: unknown[]) => leer(...a) }))

import { empujesDeStock, mandarStock } from '../api/_erp-empuje-stock.js'
import { permisoErpDe } from '../lib/permisos.core.js'
import { entradaInvalida } from '../lib/erp/entrada.core.js'

/** Un `conMotor` de mentira que anota a qué base se conectó. */
const bases: string[] = []
const conMotor = async (base: string, _q: string, fn: (pg: unknown) => Promise<unknown>) => { bases.push(base); return fn({}) }

describe('botón de Diferencias: mandar el stock del ERP a Tienda Nube (puerta del monitor)', () => {
  beforeEach(() => { pedir.mockReset(); leer.mockReset(); bases.length = 0 })

  it('ver los envíos y mandar es sólo de admin, y la forma del pedido está nombrada', () => {
    expect(permisoErpDe({ method: 'GET', vista: 'empujes-stock' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'mandar-stock' })).toBe('configurar')
    expect(entradaInvalida({ method: 'POST', query: {}, body: { accion: 'mandar-stock', marca: 'stunned' } })).toBeFalsy()
    expect(entradaInvalida({ method: 'GET', query: { vista: 'empujes-stock', marca: 'stunned' }, body: {} })).toBeFalsy()
  })

  it('valida la tienda y quién antes de tocar el motor', async () => {
    expect((await mandarStock({ marca: 'otra', usuario: 'bruno' }, { conMotor })).status).toBe(400)
    expect((await mandarStock({ marca: 'stunned', usuario: null }, { conMotor })).status).toBe(400)
    expect((await empujesDeStock({ marca: '' }, { conMotor })).status).toBe(400)
    expect(pedir).not.toHaveBeenCalled()
    expect(leer).not.toHaveBeenCalled()
  })

  it('mandar avisa a la cola de la base de BDI, también para Stunned, con la tienda y quién', async () => {
    pedir.mockResolvedValue({ ok: true, id: 7, nuevo: false })
    expect(await mandarStock({ marca: 'stunned', usuario: 'Bruno Arévalo' }, { conMotor })).toEqual({ ok: true, id: 7, yaEsperaba: true })
    expect(bases).toEqual(['bdi'])
    expect(pedir.mock.calls[0][1]).toEqual({ tienda: 'stunned', usuario: 'Bruno Arévalo' })
  })

  it('la lista dice si fue SECO y qué mandó o mandaría', async () => {
    leer.mockResolvedValue({ ok: true, empujes: [
      { id: 9, estado: 'pendiente', origen: 'boton:Bruno', avisos: 1, creado_en: 't9', terminado_en: null, resultado: null, error: null },
      { id: 8, estado: 'hecho', origen: 'libro:zattia', avisos: 1, creado_en: 't8', terminado_en: 't8b', resultado: { seco: true, cambios: 3, unidades: 5 }, error: null },
      { id: 6, estado: 'hecho', origen: 'boton:Bruno', avisos: 2, creado_en: 't6', terminado_en: 't6b', resultado: { seco: false, cambios: 3, unidades: 5, escritos: 3, quedan: 0 }, error: null },
    ] })
    const r = await empujesDeStock({ marca: 'zattia' }, { conMotor })
    expect(bases).toEqual(['bdi'])
    expect(leer.mock.calls[0][1]).toEqual({ tienda: 'zattia', limite: 5 })
    expect(r.empujes.map((e: { seco: boolean | null }) => e.seco)).toEqual([null, true, false])
    expect(r.empujes[2]).toMatchObject({ pedidoPor: 'boton:Bruno', cambios: 3, escritos: 3, quedan: 0 })
  })

  it('un rechazo del motor vuelve con su mensaje', async () => {
    pedir.mockResolvedValue({ ok: false, error: { codigo: 'TIENDA', mensaje: 'Tienda desconocida: x' } })
    expect(await mandarStock({ marca: 'bdi', usuario: 'b' }, { conMotor })).toEqual({ status: 400, error: 'Tienda desconocida: x' })
  })
})
