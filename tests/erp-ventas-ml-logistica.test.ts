import { describe, expect, it } from 'vitest'
import { listaDeVentas } from '../api/_erp-ventas.js'

/**
 * 🔑 **El estado de una venta de Mercado Libre lo da LOGÍSTICA** (Bruno, 14-nov: «eso nos podría informar logística, como nos
 * informa que un pedido fue despachado»). El motor guarda cada pedido de `GET /orders` de Logística en `logistica_pedido`; el de
 * Mercado Libre sale con el PACK como `external_id` (medido 14-nov en BDI: venta 2038 ⇔ pack 2000016018734109, `dispatched`).
 * El oráculo es el CHIP de la fila, por el handler entero y con un Supabase falso que filtra como PostgREST (`eq`, `in`).
 */

type Fila = Record<string, unknown>

/** Un Supabase de mentira: cada tabla es una lista y la consulta filtra por `eq`/`in` como PostgREST. */
function sbFalso(tablas: Record<string, Fila[]>, rota: string[] = []) {
  const consultas: string[] = []
  return {
    consultas,
    from(tabla: string) {
      consultas.push(tabla)
      const filtros: Array<(f: Fila) => boolean> = []
      const q = {
        select: () => q, order: () => q, gte: () => q, lt: () => q,
        eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
        in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.map(String).includes(String(f[c]))), q),
        range: () => q,
        then: (ok: (r: { data: Fila[] | null; error: { message: string } | null }) => unknown) =>
          ok(rota.includes(tabla) ? { data: null, error: { message: `${tabla} no existe` } } : { data: (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))), error: null }),
      }
      return q
    },
  }
}

const ventaMl = (o: Fila = {}) => ({
  id: 'v-2038', numero: 2038, marca: 'bdi', tipo: 'venta', estado: 'confirmada', origen: 'ml', canal: 'online', total: 30000, prueba: false,
  ocurrida_en: '2026-11-12T20:57:58Z', pagos: [{ medio: 'mercadopago', cuenta: 'Mercado Pago', monto: 30000 }], facturas: [],
  detalle: { ml: { pack: '2000016018734109', medio: 'account_money', ordenes: ['2000019512616282', '2000019512616284'] } }, ...o,
})

const lista = async (ventas: Fila[], logistica: Fila[], rota: string[] = []) => {
  const sb = sbFalso({ venta_ficha: ventas, logistica_pedido: logistica }, rota)
  const r = await listaDeVentas({ marca: 'bdi', desde: '2026-11-01', hasta: '2026-11-14' }, { sb })
  return { r: r as { filas: Array<{ id: string; estadoKey: string }> }, sb }
}

describe('Ventas: el estado de Mercado Libre sale de Logística', () => {
  it('la venta se cruza por el PACK con el pedido de Logística del canal mercadolibre y de SU marca', async () => {
    const { r } = await lista([ventaMl()], [
      { negocio: 'bdi', canal: 'mercadolibre', external_id: '2000016018734109', estado: 'dispatched' },
      // Otro canal u otra marca con el mismo número ⛔ cuentan.
      { negocio: 'zattia', canal: 'mercadolibre', external_id: '2000016018734109', estado: 'pending' },
      { negocio: 'bdi', canal: 'tiendanube', external_id: '2000016018734109', estado: 'cancelled' },
    ])
    expect(r.filas.find((f) => f.id === 'v-2038')?.estadoKey).toBe('despachado')
  })

  it('una orden suelta (sin pack) se cruza por la orden', async () => {
    const { r } = await lista([ventaMl({ detalle: { ml: { ordenes: ['2000019346819230'] } } })], [
      { negocio: 'bdi', canal: 'mercadolibre', external_id: '2000019346819230', estado: 'preparing' },
    ])
    expect(r.filas[0].estadoKey).toBe('en_preparacion')
  })

  it('sin pedido en Logística (las de antes de que el motor la leyera) dice que le falta, ⛔ inventa', async () => {
    const { r } = await lista([ventaMl()], [])
    expect(r.filas[0].estadoKey).toBe('sin_estado_ml')
  })

  it('🔴 si la tabla de Logística ⛔ responde, la lista sale igual (sin el estado), ⛔ se cae', async () => {
    const { r } = await lista([ventaMl()], [], ['logistica_pedido'])
    expect(r.filas[0].estadoKey).toBe('sin_estado_ml')
  })

  it('sin ventas de Mercado Libre ⛔ se consulta Logística', async () => {
    const { sb } = await lista([ventaMl({ origen: 'caja', detalle: {} })], [])
    expect(sb.consultas).not.toContain('logistica_pedido')
  })
})
