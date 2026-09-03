// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { CuentaMeta } from '@/lib/meta-ads/tipos'

/**
 * 🔴 **EL CABLE: a qué cuenta se le pide el día en curso.**
 *
 * `tests/meta-cuenta-parte.test.ts` fija la regla (`cuentaDelParte`). Esto fija la única línea que
 * la usa — y **es justo donde vivía el defecto las dos veces**: `useParte(laCuenta ? … : null)`,
 * con `laCuenta` en `null` mientras el eje diga «Todas», que es como se entra por el menú. Sin este
 * archivo, el núcleo puede quedar perfecto y la pantalla seguir sin pedir nada: los dos lados en
 * verde y el bug en la pregunta del medio. Es la misma forma que ya mordió en Reclamos y en los
 * KPIs de esta misma sección.
 *
 * ⚠️ Se mockea todo lo que sale a la red (las cuentas, la foto, las reglas, la poda y las cinco
 * llamadas del parte): lo único que se mira es **qué cuenta recibe `useParte`**.
 */

const cuenta = (id: string, nombre: string, lineas: string[]): CuentaMeta => ({
  id, nombre, moneda: 'ARS', zona: 'America/Argentina/Buenos_Aires',
  campanias: 10, asignadas: 10, lineas, administra: true, minDiarioCrudo: null,
}) as unknown as CuentaMeta

const STUNNED = cuenta('999', 'Stunned', ['stunned'])
const COMPARTIDA = cuenta('114', 'Areben', ['bdi', 'zattia'])
const ZATTIA_NUEVA = cuenta('222', 'Zattia nueva', ['zattia'])

/** Lo que el contexto va a contestar en cada caso. Se pisa por test. */
const eje = {
  cuentas: [STUNNED] as CuentaMeta[],
  cuenta: 'todas' as string,
  linea: 'stunned' as string,
  visibles: ['stunned'] as string[],
}

/** Las cuentas con las que se llamó a `useParte`, en orden. */
const pedidas: (string | null)[] = []

vi.mock('@/components/meta-ads/ContextoMeta', () => ({
  useMeta: () => ({
    estado: { fase: 'cargando' as const },
    cuentas: eje.cuentas,
    cuentasVisibles: eje.cuentas,
    cuenta: eje.cuenta,
    setCuenta: () => {},
    linea: eje.linea,
    setLinea: () => {},
    visibles: eje.visibles,
    rango: '7d',
    setRango: () => {},
    laCuenta: eje.cuenta === 'todas' ? null : eje.cuentas.find((c) => c.id === eje.cuenta) ?? null,
    recargar: () => {},
  }),
}))

vi.mock('@/components/meta-ads/parte/useParte', () => ({
  useParte: (c: string | null) => {
    pedidas.push(c)
    return { estado: { fase: 'sin-cuenta' as const }, error: null, actualizar: () => {} }
  },
}))

vi.mock('@/components/meta-ads/zona/useZona', () => ({
  useZona: () => ({ estado: { fase: 'cargando' as const }, recargar: () => {} }),
}))
vi.mock('@/components/meta-ads/reglas/useReglas', () => ({ useReglas: () => ({ hallazgos: [], silencio: null }) }))
vi.mock('@/components/meta-ads/reglas/PodaPendiente', () => ({
  usePoda: () => ({ pendiente: null }),
  PodaPendiente: () => null,
}))
vi.mock('@/components/meta-ads/acciones', () => ({
  useAccionMeta: () => ({ acciones: {}, modales: {} }),
  ModalesDeAccion: () => null,
}))
vi.mock('@/components/meta-ads/SelectorMeta', () => ({ SelectorMeta: () => null }))
vi.mock('@/components/meta-ads/planes/PlanesEnCurso', () => ({ PlanesEnCurso: () => null }))
vi.mock('@/components/meta-ads/parte/ParteDelDia', () => ({ ParteDelDia: () => null }))
vi.mock('@/components/meta-ads/parte/BandaDeHoy', () => ({ BandaDeHoy: () => null }))

const { ZonaRendimiento } = await import('@/components/meta-ads/zona/ZonaRendimiento')

const pintar = async (): Promise<void> => {
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => { root.render(<ZonaRendimiento />) })
  await act(async () => { root.unmount() })
  div.remove()
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
beforeEach(() => { pedidas.length = 0 })

describe('a qué cuenta se le pide el día en curso', () => {
  it('🔴 con el eje en «Todas» y una sola cuenta en la línea, SE PIDE — antes no se pedía nunca', async () => {
    eje.cuentas = [STUNNED, COMPARTIDA]
    eje.cuenta = 'todas'
    eje.linea = 'stunned'
    eje.visibles = ['stunned']
    await pintar()
    expect(pedidas).toContain('999')
    expect(pedidas).not.toContain(null)
  })

  it('con dos cuentas en la línea ⛔ no se pide: la pantalla pide elegir en vez de mostrar la mitad', async () => {
    eje.cuentas = [COMPARTIDA, ZATTIA_NUEVA]
    eje.cuenta = 'todas'
    eje.linea = 'zattia'
    eje.visibles = ['zattia']
    await pintar()
    expect(pedidas).toEqual([null])
  })

  it('con una cuenta elegida a mano, se pide ÉSA', async () => {
    eje.cuentas = [COMPARTIDA, ZATTIA_NUEVA]
    eje.cuenta = '222'
    eje.linea = 'zattia'
    eje.visibles = ['zattia']
    await pintar()
    expect(pedidas).toContain('222')
  })

  it('⛔ sin línea resuelta no se pide nada: el gasto de dos líneas juntas no es de ninguna', async () => {
    eje.cuentas = [COMPARTIDA, STUNNED]
    eje.cuenta = 'todas'
    eje.linea = 'todas'
    eje.visibles = ['bdi', 'zattia']
    await pintar()
    expect(pedidas).toEqual([null])
  })
})
