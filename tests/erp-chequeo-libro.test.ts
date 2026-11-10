import { describe, expect, it, vi } from 'vitest'
import { chequeoDelLibro, enPalabras, estadoDeRegla } from '../lib/erp/chequeo-libro.core.js'
import { reglasDelLibro } from '../api/_erp-chequeo-libro.js'
import { permisoErpDe } from '../lib/permisos.core.js'
import { REGLAS } from '../motor/invariantes.mjs'

/**
 * «Chequeo de movimientos» (ERP › Stock › Diferencias): las reglas nocturnas del motor, en vivo. El oráculo: el estado de cada regla
 * sale de su gravedad y sus filas (una omitida ⛔ es «bien»), lo roto va arriba, la pantalla ⛔ dice la jerga del motor, y la vista es
 * sólo de Admin y corre las MISMAS reglas que la noche.
 */
const r = (o: Partial<{ id: string; titulo: string; gravedad: string; total: number; ejemplos: Array<{ ref?: unknown; detalle?: unknown }>; omitida: string }>) =>
  ({ id: 'x', titulo: 'X', gravedad: 'aviso', total: 0, ejemplos: [] as Array<{ ref?: unknown; detalle?: unknown }>, ...o })

describe('chequeo de movimientos · núcleo', () => {
  it('el estado sale de la gravedad y las filas; una regla omitida ⛔ cuenta como bien', () => {
    expect(estadoDeRegla(r({ gravedad: 'falla', total: 2 }))).toBe('falla')
    expect(estadoDeRegla(r({ gravedad: 'aviso', total: 28 }))).toBe('aviso')
    expect(estadoDeRegla(r({ gravedad: 'falla', total: 0 }))).toBe('ok')
    expect(estadoDeRegla(r({ gravedad: 'falla', total: 0, omitida: 'falta la tabla cheque' }))).toBe('omitida')
  })

  it('ordena errores, después avisos (el de más filas primero), omitidas y bien; y cuenta cada uno', () => {
    const c = chequeoDelLibro([
      r({ id: 'ok1' }), r({ id: 'av1', total: 1 }), r({ id: 'om', omitida: 'falta la tabla cheque' }),
      r({ id: 'av28', total: 28, ejemplos: [{ ref: 'ATE-026 · deposito_minorista', detalle: '-66' }] }), r({ id: 'f', gravedad: 'falla', total: 1 }),
    ])
    expect(c.reglas.map((x) => x.id)).toEqual(['f', 'av28', 'av1', 'om', 'ok1'])
    expect(c.cuenta).toEqual({ falla: 1, aviso: 2, omitida: 1, ok: 1 })
    expect(c.reglas[1].ejemplos).toEqual([{ ref: 'ATE-026 · deposito_minorista', detalle: '-66' }])
    expect(c.reglas.find((x) => x.id === 'om')!.porque).toBe('falta la tabla cheque')
  })

  it('⛔ jerga en pantalla: los títulos REALES del motor salen sin «libro», «GN» ni «motor»', () => {
    const titulos = chequeoDelLibro(REGLAS.map((x: { id: string; titulo: string; gravedad: string }) => r(x))).reglas.map((x) => x.titulo)
    expect(titulos.length).toBeGreaterThanOrEqual(17)
    for (const t of titulos) expect(t).not.toMatch(/\blibro\b|\bGN\b|\bmotor\b|\bprenda/i)
    expect(enPalabras('Una venta anulada cuya prenda no volvió al libro')).toBe('Una venta anulada cuyo producto no volvió al stock')
  })

  it('sin resultados ⛔ inventa un «todo bien»: tira', () => {
    expect(() => chequeoDelLibro(undefined as unknown as [])).toThrow()
  })
})

describe('chequeo de movimientos · servidor', () => {
  it('es sólo de Admin (configurar), nombrado', () => {
    expect(permisoErpDe({ method: 'GET', vista: 'reglas-libro' })).toBe('configurar')
  })

  it('marca inválida ⇒ 400 sin abrir la base', async () => {
    const conMotor = vi.fn()
    expect(await reglasDelLibro({ marca: 'stunned' }, { conMotor })).toMatchObject({ status: 400 })
    expect(conMotor).not.toHaveBeenCalled()
  })

  it('corre las reglas con la conexión de la marca, hablando `db.q` del motor', async () => {
    const query = vi.fn(async () => ({ rows: [{ hay: true }] }))
    const conMotor = vi.fn(async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn({ query }))
    const revisar = vi.fn(async (db: { q: (s: string, p?: unknown[]) => Promise<unknown[]> }) => {
      expect(await db.q('select 1', [1])).toEqual([{ hay: true }])
      return [r({ id: 'negativo', total: 3 })]
    })
    const out = await reglasDelLibro({ marca: 'zattia' }, { conMotor, revisar, ahora: () => new Date('2026-11-10T20:00:00Z') })
    expect(conMotor.mock.calls[0][0]).toBe('zattia')
    expect(query).toHaveBeenCalledWith('select 1', [1])
    expect(out).toMatchObject({ marca: 'zattia', revisadoEn: '2026-11-10T20:00:00.000Z', cuenta: { aviso: 1 } })
  })

  it('sin conexión del motor, el 409 de `conMotor` llega tal cual (⛔ un «todo bien»)', async () => {
    const conMotor = vi.fn(async () => ({ status: 409, error: 'El chequeo de movimientos todavía no está conectado' }))
    expect(await reglasDelLibro({ marca: 'bdi' }, { conMotor, revisar: vi.fn() })).toMatchObject({ status: 409 })
  })
})
