import { afterEach, describe, expect, it, vi } from 'vitest'
import { leerVentasDeCampania } from '@/lib/liquidacion/ventas'

/**
 * Las ventas de una campaña ya no salen de Supabase: desde el escalón 3 de la Fase S las pide
 * `api/datos?recurso=liquidacion`. El motivo es `unit_price` y `total` — con la anon key, que viaja
 * en el bundle, esa tabla entregaba 122.952 líneas de facturación en BDI.
 *
 * Lo que este archivo sostiene es lo que la mudanza podía romper en silencio: **qué se manda** y
 * **qué se hace con lo que vuelve**. El cruce y el reparto de la plata se quedaron en el navegador
 * y nunca habían tenido test.
 */

/** Espía el `fetch` de `apiFetch` y contesta con la forma del handler. */
function espiar(respuesta: { ventas?: unknown[]; detalles?: unknown[] } = {}) {
  const llamadas: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, opts: RequestInit) => {
      llamadas.push({ url: String(url), body: JSON.parse(String(opts.body)) })
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ventas: respuesta.ventas || [], detalles: respuesta.detalles || [] }),
      })
    }),
  )
  return { llamadas }
}

const venta = (id: number, date_sale: string, channel = 'Local') => ({ id, date_sale, channel })
const linea = (sale_id: number, product_id: number, extra: Record<string, unknown> = {}) => ({
  sale_id,
  product_id,
  quantity: 1,
  unit_price: 1000,
  total: 1000,
  ...extra,
})

afterEach(() => vi.unstubAllGlobals())

describe('leerVentasDeCampania', () => {
  it('pide al servidor, no a Supabase, y manda la marca en el body', async () => {
    const { llamadas } = espiar()
    await leerVentasDeCampania('zattia', ['1', '2'], '2026-08-12', '2026-08-27')
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toContain('/api/datos?recurso=liquidacion')
    expect(llamadas[0].body).toMatchObject({
      store: 'zattia',
      action: 'ventas-campania',
      desde: '2026-08-12',
      hasta: '2026-08-27',
    })
    // 🔴 La `store` del body es la que elige la base del otro lado. Mandarla mal no da error: da
    // los números de la otra marca.
    expect(llamadas[0].body.pids).toEqual(['1', '2'])
  })

  it('no sale ninguna llamada si no hay productos o el rango está al revés', async () => {
    const a = espiar()
    expect(await leerVentasDeCampania('bdi', [], '2026-08-12', '2026-08-27')).toEqual([])
    expect(await leerVentasDeCampania('bdi', ['1'], '2026-08-27', '2026-08-12')).toEqual([])
    expect(await leerVentasDeCampania('bdi', ['1'], '', '')).toEqual([])
    expect(a.llamadas).toHaveLength(0)
  })

  it('cruza cada línea con su venta y descarta la que no está en el mapa', async () => {
    // El rango de sale_id que el servidor consulta incluye ventas de otras fechas que caen en el
    // medio: el cruce final va contra las ventas devueltas, no contra el rango.
    espiar({
      ventas: [venta(10, '2026-08-13'), venta(20, '2026-08-14')],
      detalles: [linea(10, 1), linea(15, 1), linea(20, 1)],
    })
    const out = await leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')
    expect(out.map((l) => l.fecha)).toEqual(['2026-08-13', '2026-08-14'])
  })

  it('descarta la línea de un producto que no es de la campaña', async () => {
    espiar({ ventas: [venta(10, '2026-08-13')], detalles: [linea(10, 1), linea(10, 999)] })
    const out = await leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')
    expect(out).toHaveLength(1)
    expect(out[0].pid).toBe('1')
  })

  it('`total` manda sobre `unit_price`, que es donde vive el descuento de la caja', async () => {
    // 🔑 Al revés se perderían los descuentos por línea: la caja los aplica sobre el precio
    // unitario y el `total` es lo único que dice lo que entró de verdad.
    espiar({
      ventas: [venta(10, '2026-08-13')],
      detalles: [linea(10, 1, { quantity: 2, unit_price: 5000, total: 7000 })],
    })
    const [l] = await leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')
    expect(l.plata).toBe(7000)
    expect(l.precioUnitario).toBe(3500)
  })

  it('sin `total` cae al unitario por las unidades', async () => {
    espiar({ ventas: [venta(10, '2026-08-13')], detalles: [linea(10, 1, { quantity: 3, unit_price: 5000, total: null })] })
    const [l] = await leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')
    expect(l.plata).toBe(15000)
  })

  it('`quantity` en null es UNA unidad, no cero', async () => {
    // La fila existe porque algo se vendió. Descartarla perdería la venta entera.
    espiar({ ventas: [venta(10, '2026-08-13')], detalles: [linea(10, 1, { quantity: null })] })
    const [l] = await leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')
    expect(l.unidades).toBe(1)
  })

  it('🔴 una devolución (`quantity` negativo) LLEGA: la decide el consumidor, no el transporte', async () => {
    // Descartarla acá le sacaba la unidad a la conciliación de stock de `agotadosQueNoCierran`, que
    // necesita el neto: la prenda devuelta volvió al stock. El que la ignora es `resultadoCampania`.
    espiar({ ventas: [venta(10, '2026-08-13')], detalles: [linea(10, 1, { quantity: -1, unit_price: 12890, total: -12890 })] })
    const out = await leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')
    expect(out).toHaveLength(1)
    expect(out[0].unidades).toBe(-1)
  })

  it('una línea de cero unidades no dice nada y no entra', async () => {
    espiar({ ventas: [venta(10, '2026-08-13')], detalles: [linea(10, 1, { quantity: 0 })] })
    expect(await leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')).toEqual([])
  })

  it('un 403 del handler sube como error, no como "no vendió nada"', async () => {
    // 🔴 El modo de falla que agrega el endpoint. Tragárselo devolviendo `[]` haría que Resultado
    // dijera que el sale no vendió — y sobre eso se decide bajar más los precios.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 403, json: async () => ({ error: 'No tenés acceso a Liquidación en esta marca.' }) }),
      ),
    )
    await expect(leerVentasDeCampania('bdi', ['1'], '2026-08-12', '2026-08-27')).rejects.toThrow(
      'No tenés acceso a Liquidación en esta marca.',
    )
  })
})
