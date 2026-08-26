import { describe, expect, it } from 'vitest'
import { leerTechos, techoDe } from '@/lib/meta-ads/leer-snapshot.core.js'
import { DEFAULTS } from '@/lib/meta-ads/rentabilidad'

/**
 * 🔑 **El techo de costo por compra tiene UNA implementación y este archivo es el que la amarra.**
 *
 * La ficha guarda supuestos, no el techo: cada consumidor que la lea tiene que volver a calcularlo.
 * Hasta el 26-ago-2026 eso estaba escrito en la zona de Rendimiento, y las automatizaciones —que
 * son las que APAGAN cosas— no lo leían en ningún lado: `cpa_maximo` tenía columna, tenía dial y no
 * lo consumía ningún preset. Lo que se prueba acá es que la lectura sea una sola, que devuelva el
 * techo de GANANCIA y que una marca sin ficha se quede sin techo en vez de heredar uno inventado.
 */

/** Un cliente de Supabase que sólo sabe contestar `meta_ads_rentabilidad`. */
function base(filas: Array<Record<string, unknown>>, error: string | null = null) {
  return {
    from() {
      const q = {
        select: () => q,
        in: (_col: string, ls: string[]) => {
          filas = filas.filter((f) => ls.includes(String(f.linea)))
          return q
        },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
          return Promise.resolve({ data: error ? null : filas, error: error ? { message: error } : null }).then(res, rej)
        },
      }
      return q
    },
  }
}

const ficha = (linea: string, over: Record<string, unknown> = {}) => ({
  linea,
  supuestos: { ...DEFAULTS, ...over },
  updated_at: '2026-08-25T12:00:00Z',
})

describe('leerTechos — la ficha de rentabilidad, leída una sola vez', () => {
  it('calcula el techo de cada línea y lo devuelve con la fecha en que se cargó', async () => {
    const { mapa, error } = await leerTechos(base([ficha('bdi'), ficha('zattia', { precio: 32416, unidades: 1.57 })]))
    expect(error).toBeUndefined()
    expect(mapa.get('bdi')!.techo).toBeGreaterThan(0)
    expect(mapa.get('bdi')!.cargadaEl).toBe('2026-08-25T12:00:00Z')
    // Dos economías distintas dan dos techos distintos: si diera lo mismo, no estaría leyendo la fila.
    expect(mapa.get('zattia')!.techo).not.toBe(mapa.get('bdi')!.techo)
  })

  /**
   * 🔴 **El de GANANCIA, ⛔ nunca el de caja.** El de caja incluye el recupero del saldo de IVA:
   * plata real, pero que la venta sólo LIBERA —no se repite, no depende de la calidad de la venta y
   * no la genera la pauta—. Una regla calibrada sobre él arma estructura encima de un stock finito,
   * y como es el número más grande de los dos, el error sería siempre en la dirección cara.
   */
  it('el techo que cortan las reglas es el de ganancia, y el de caja viaja aparte', async () => {
    const { mapa } = await leerTechos(base([ficha('bdi', { saldoIva: true })]))
    const f = mapa.get('bdi')!
    expect(f.techoCaja).toBeGreaterThan(f.techo)
    expect(techoDe(mapa, 'bdi')).toBe(f.techo)
  })

  it('sin saldo de IVA no hay dos techos: el de caja va en null en vez de repetir el mismo número', async () => {
    const { mapa } = await leerTechos(base([ficha('bdi', { saldoIva: false })]))
    expect(mapa.get('bdi')!.techoCaja).toBeNull()
  })

  /** Una marca sin ficha NO entra al mapa: `0` es lo que deja la regla apagada diciendo qué falta. */
  it('la marca sin ficha se queda sin techo, ⛔ no con el de otra', async () => {
    const { mapa } = await leerTechos(base([ficha('bdi')]))
    expect(mapa.has('stunned')).toBe(false)
    expect(techoDe(mapa, 'stunned')).toBe(0)
  })

  it('una ficha ilegible es una línea sin techo, ⛔ no un error que voltea la pantalla', async () => {
    const { mapa, error } = await leerTechos(base([{ linea: 'bdi', supuestos: 'ni un objeto', updated_at: null }, ficha('zattia')]))
    expect(error).toBeUndefined()
    expect(techoDe(mapa, 'bdi')).toBe(0)
    expect(techoDe(mapa, 'zattia')).toBeGreaterThan(0)
  })

  /**
   * 🔴 **El caso que casi pasa desapercibido, y el más caro de los dos posibles.** `normalizar()`
   * arranca de la economía de las fundas de BDI, así que una fila guardada sin sus supuestos
   * devuelve el techo de BDI **para la línea que sea**. Una pantalla puede mostrar eso y decir que
   * es el arranque; una regla que apaga conjuntos no, y menos cortando contra el negocio de otra
   * marca. Sin `precio` no hay ficha.
   */
  it('una fila SIN precio no hereda la economía de BDI: se lee como que no hay ficha', async () => {
    const { mapa } = await leerTechos(base([
      { linea: 'stunned', supuestos: {}, updated_at: '2026-08-01T00:00:00Z' },
      { linea: 'bdi', supuestos: { ...DEFAULTS, precio: 0 }, updated_at: null },
    ]))
    expect(techoDe(mapa, 'stunned')).toBe(0)
    expect(techoDe(mapa, 'bdi')).toBe(0)
  })

  /**
   * ⚠️ Un error de lectura **se dice**. Devolver el mapa vacío en silencio dejaría a toda la pauta
   * sin techo y las reglas se apagarían solas diciendo «falta la ficha», que es mentira: la ficha
   * está, lo que falló fue leerla.
   */
  it('un error de lectura vuelve con el motivo, y el mapa vacío', async () => {
    const { mapa, error } = await leerTechos(base([ficha('bdi')], 'timeout'))
    expect(error).toBe('timeout')
    expect(mapa.size).toBe(0)
  })
})
