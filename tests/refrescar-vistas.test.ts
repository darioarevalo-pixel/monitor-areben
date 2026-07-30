import { describe, it, expect } from 'vitest'
import { refrescarVistas, VISTAS } from '../scripts/lib/refrescar-vistas.mjs'

/**
 * Lo que se prueba es lo que el bug rompía: que un refresco que falla se REPORTE
 * (para que el sync pueda terminar en rojo) en vez de quedar en un console.warn
 * con el job en verde, y que la vuelta atrás a `refresh_all_views()` funcione
 * mientras el SQL nuevo no esté aplicado en esa base.
 */

/* Los mocks implementan solo `rpc`, que es lo único que el módulo usa. El módulo
   es .mjs sin tipos, así que `any` acá es fiel: no hay contrato de TS que romper. */
type Err = { code?: string; message: string } | null

/** Mock del client: `respuestas` mapea nombre de función → error (o null si sale bien). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mock(respuestas: Record<string, Err>): any {
  const llamadas: string[] = []
  return {
    llamadas,
    async rpc(nombre: string) {
      llamadas.push(nombre)
      return { error: nombre in respuestas ? respuestas[nombre] : null }
    },
  }
}

const silencio = { log: () => {}, warn: () => {} }

describe('refrescarVistas', () => {
  it('refresca una vista por llamada y las reporta todas OK', async () => {
    const sb = mock({})
    const r = await refrescarVistas(sb, silencio)

    expect(r.ok).toEqual(VISTAS)
    expect(r.fallaron).toEqual([])
    expect(r.legacy).toBe(false)
    // Una llamada por vista, no una sola para las tres: ese es el punto del cambio.
    expect(sb.llamadas).toEqual(VISTAS.map((v) => `refresh_${v}`))
  })

  it('una vista que se pasa de tiempo se REPORTA y no frena a las otras', async () => {
    // 57014 es el statement_timeout: exactamente lo que venía pasando todos los días.
    const sb = mock({
      refresh_fundas_por_modelo_mes: { code: '57014', message: 'canceling statement due to statement timeout' },
    })
    const r = await refrescarVistas(sb, silencio)

    expect(r.fallaron).toEqual([
      { vista: 'fundas_por_modelo_mes', error: 'canceling statement due to statement timeout' },
    ])
    // Las otras dos igual quedaron al día: dos mejor que ninguna.
    expect(r.ok).toEqual(['ventas_por_mes', 'ventas_por_categoria_mes'])
    expect(sb.llamadas).toHaveLength(3)
  })

  it('si el SQL nuevo no está aplicado, cae a refresh_all_views()', async () => {
    const sb = mock({ refresh_ventas_por_mes: { code: 'PGRST202', message: 'function not found' } })
    const r = await refrescarVistas(sb, silencio)

    expect(r.legacy).toBe(true)
    expect(r.ok).toEqual(VISTAS)
    expect(r.fallaron).toEqual([])
    // No insiste con las otras dos por vista: sabe que tampoco existen.
    expect(sb.llamadas).toEqual(['refresh_ventas_por_mes', 'refresh_all_views'])
  })

  it('si tampoco existe el camino viejo, ninguna vista queda al día', async () => {
    const sb = mock({
      refresh_ventas_por_mes: { code: '42883', message: 'undefined function' },
      refresh_all_views: { code: '57014', message: 'canceling statement due to statement timeout' },
    })
    const r = await refrescarVistas(sb, silencio)

    expect(r.ok).toEqual([])
    expect(r.fallaron).toHaveLength(VISTAS.length)
    expect(r.legacy).toBe(true)
  })
})
