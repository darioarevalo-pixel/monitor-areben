// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ListaDePrecios, PrecioItem } from '@/lib/precios/tipos'

/**
 * **Que una estrella GUARDADA se VEA prendida al entrar.**
 *
 * 🔴 Esto existe por un reporte de Bruno del 11-sep-2026: *«no anda el destacado, apreté y no
 * guardó»* — y medido contra la base, **las 13 estaban guardadas**, todas cruzando con ítems de la
 * campaña. O sea que lo que falló ⛔ no fue el guardado: fue que la pantalla las dibujaba apagadas,
 * que desde afuera se ve igual.
 *
 * ⚠️ **Y el test de gestos ⛔ no lo podía cazar, porque mockea `useDestacados` entero.** Acá el hook
 * corre **de verdad** y lo que se reemplaza es `apiFetch`, con la **forma exacta** de lo que
 * contesta `api/_destacados.js`. Ese pedazo —del JSON del handler al ★ de la fila— ⛔ no lo miraba
 * ningún test, y es justo donde vivía el defecto.
 */

const ITEM: PrecioItem = {
  pid: '832267', nombre: 'SWEATER DAKOTA', sku: null, imagen: null,
  precioLista: 19990, precio: 4990, pctDesc: 75, firme: true, stock: 12, estrella: true,
  variantes: [{ nombre: 'M', por: { Local: 12 }, total: 12 }],
}

const LISTA: ListaDePrecios = {
  campania: { id: 'lFERIA', nombre: 'Feria Septiembre 2026', desde: null, hasta: null, nota: null, n: 1 },
  items: [ITEM],
  tiendas: ['Local'],
  leidoEn: null,
}

vi.mock('@/lib/precios/persistencia', () => ({
  leerCampaniasCompartidas: vi.fn(async () => [LISTA.campania]),
  leerListaDePrecios: vi.fn(async () => LISTA),
}))

/** Las URLs que pidió el hook, para poder afirmar CON QUÉ ALCANCE preguntó. */
const PEDIDOS: string[] = []

/**
 * Cuando vale, **la respuesta del alcance vacío llega TARDE**, después de la de la campaña.
 *
 * 🔴 Es la carrera que reportó Bruno como *«las marqué y no las veo destacadas»*: la pantalla pide
 * dos veces —primero sin alcance, mientras viaja la lista de campañas, y después con la campaña— y
 * ⛔ nada garantiza el orden de llegada. Si la vacía contesta segunda y su `setState` no se
 * descarta, **pisa las 13 con un mapa vacío**. Acá el orden se fuerza para que el defecto ⛔ no sea
 * intermitente: un test que falla una de cada cinco veces ⛔ no sirve de red.
 */
const VACIA_LLEGA_TARDE = { si: false }

/**
 * 🔑 **La fila viene como la manda PostgREST, ⛔ no como me gustaría.** `producto_id` es `bigint` y
 * llega como **número**, no como texto: si la pantalla comparara sin normalizar, `832267 !== '832267'`
 * y la estrella se dibujaría apagada teniendo la fila delante.
 */
vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(async (url: string) => {
    PEDIDOS.push(url)
    const deLaCampania = url.includes('liq=lFERIA')
    if (VACIA_LLEGA_TARDE.si && !deLaCampania && url.includes('recurso=destacados')) {
      await new Promise((r) => setTimeout(r, 20))
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        destacados: deLaCampania
          ? [{
              id: 'zattia:832267:lFERIA:20260911T120139122Z',
              store: 'zattia', producto_id: 832267, liq_id: 'lFERIA',
              sku: null, nombre: 'SWEATER DAKOTA', nota: null,
              marcada_en: '2026-09-11T12:01:39.122Z', marcada_por: 'Bruno Arevalo',
              sacada_en: null, sacada_por: null,
            }]
          : [],
      }),
    }
  }),
}))

const { Precios } = await import('@/components/precios/Precios')
const { SesionProvider } = await import('@/components/SesionProvider')
const { ToastProvider } = await import('@/components/ui/Toast')

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

async function pintar() {
  window.history.replaceState(null, '', '/precios')
  PEDIDOS.length = 0
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><ToastProvider><Precios /></ToastProvider></SesionProvider>)
  })
  // Una vuelta más de microtareas: el hook pide DESPUÉS de que se resuelve la campaña.
  await act(async () => { await Promise.resolve() })
  return {
    div,
    estrella: () => div.querySelector('button[aria-pressed]'),
    cerrar: async () => { await act(async () => { root.unmount() }); div.remove() },
  }
}

describe('🔴 una estrella guardada se ve PRENDIDA al entrar', () => {
  it('el ★ está lleno, ⛔ no vacío', async () => {
    const p = await pintar()
    const e = p.estrella()
    expect(e, 'no se dibujó ninguna estrella').toBeTruthy()
    expect(e!.getAttribute('aria-pressed')).toBe('true')
    expect(e!.textContent).toBe('★')
    await p.cerrar()
  })

  it('y el título dice quién la marcó: es una decisión del equipo, no un adorno', async () => {
    const p = await pintar()
    expect(p.estrella()!.getAttribute('title')).toContain('Bruno Arevalo')
    await p.cerrar()
  })

  it('🔴 el contador de arriba la cuenta', async () => {
    // Si la pantalla y el contador leyeran distinto, uno de los dos mentiría en silencio.
    const p = await pintar()
    expect(p.div.textContent).toContain('★ Sólo destacados (1)')
    await p.cerrar()
  })

  it('🔴 y NO se apaga si la respuesta vacía llega tarde: es la carrera que las hacía desaparecer', async () => {
    // Sin descartar la respuesta vieja, este test deja la estrella en ☆ con la fila en la base.
    VACIA_LLEGA_TARDE.si = true
    const p = await pintar()
    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
    expect(p.estrella()!.getAttribute('aria-pressed')).toBe('true')
    expect(p.div.textContent).toContain('★ Sólo destacados (1)')
    VACIA_LLEGA_TARDE.si = false
    await p.cerrar()
  })

  it('🔴 se pidió CON el alcance de la campaña, y nunca sin él', async () => {
    // `liq` ausente ⛔ no es «todas»: es la estrella GENERAL, que es otra marca y viene vacía.
    const p = await pintar()
    const aDestacados = PEDIDOS.filter((u) => u.includes('recurso=destacados'))
    expect(aDestacados.length, 'el hook nunca pidió las estrellas').toBeGreaterThan(0)
    expect(aDestacados.every((u) => u.includes('liq=lFERIA'))).toBe(true)
    await p.cerrar()
  })
})
