// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { MesMedido } from '@/lib/reclamos/medidor'

/**
 * **El medidor, dibujado** (§5 del plan del 30-ago-2026).
 *
 * 🔴 **Acá se fija lo que la pantalla ⛔ NO puede dejar de decir.** El número que sale de la base es
 * `2 / 283`, y hay dos maneras de dibujarlo mal, las dos en verde:
 *
 * 1. **Poner un `0,0 cada 100` en los meses de antes de que el módulo registrara reclamos.** Marzo
 *    a julio de 2026 dan `0 / 173` y `0 / 124` porque **nadie anotaba**, ⛔ no porque nadie
 *    reclamara. Con esos ceros dibujados, el primer mes con formulario público se lee como un
 *    aumento — que es exactamente lo que el plan pide ⛔ no dejar pasar.
 * 2. **Dibujar el número sin decir qué es.** ⛔ No es la tasa de reclamos: es **lo que se
 *    registró**. Una pantalla que ⛔ no lo aclara igual **afirma**.
 *
 * El oráculo es **lo dibujado**, ⛔ no lo que devuelve la función: la regla ya tiene sus tests, y
 * este módulo se rompió cuatro veces con la regla en verde y el cable cortado.
 */

const MEDIDO: MesMedido[] = []

vi.mock('@/lib/reclamos/medidor', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/medidor')>()
  return { ...real, leerMedidor: vi.fn(async () => MEDIDO) }
})

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return { ...real, leerReclamos: vi.fn(async () => ({ filas: [], hayMas: false })) }
})

const { Medidor } = await import('@/components/reclamos/Medidor')
const { Devoluciones } = await import('@/components/reclamos/Reclamos')
const { ToastProvider } = await import('@/components/ui/Toast')
const { SesionProvider } = await import('@/components/SesionProvider')

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

/** Lo que la base contesta hoy en BDI: cinco meses sin registro y agosto con 2 sobre 283. */
const COMO_HOY: MesMedido[] = [
  { mes: '2026-03', ventas: 308, reclamos: 0, cada100: null, sinNumero: 'sin-registro', enCurso: false },
  { mes: '2026-04', ventas: 173, reclamos: 0, cada100: null, sinNumero: 'sin-registro', enCurso: false },
  { mes: '2026-05', ventas: 161, reclamos: 0, cada100: null, sinNumero: 'sin-registro', enCurso: false },
  { mes: '2026-06', ventas: 125, reclamos: 0, cada100: null, sinNumero: 'sin-registro', enCurso: false },
  { mes: '2026-07', ventas: 124, reclamos: 0, cada100: null, sinNumero: 'sin-registro', enCurso: false },
  { mes: '2026-08', ventas: 283, reclamos: 2, cada100: 0.7067137809187279, sinNumero: null, enCurso: true },
]

async function dibujar(filas: MesMedido[]) {
  MEDIDO.length = 0
  MEDIDO.push(...filas)
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => { root.render(<Medidor marca="bdi" />) })
  const texto = div.textContent || ''
  await act(async () => { root.unmount() })
  div.remove()
  return texto
}

describe('lo que queda escrito en la pantalla', () => {
  it('🔴 los meses sin registro dicen POR QUÉ, y ⛔ no dibujan un cero', async () => {
    const texto = await dibujar(COMO_HOY)
    expect(texto).toContain('todavía no se registraban reclamos')
    expect(texto).not.toContain('0 cada 100')
    expect(texto).not.toContain('0,0 cada 100')
  })

  it('el mes con registro sí muestra el cociente, y las dos puntas de las que sale', async () => {
    const texto = await dibujar(COMO_HOY)
    expect(texto).toContain('0,7 cada 100')
    expect(texto).toContain('283')
    expect(texto).toContain('ago 2026')
  })

  /**
   * 🔴 **Sin esto, el número es una tasa.** Es la única línea que separa «el 0,7% de la gente
   * reclama» de «se registró el 0,7% de las ventas», y las dos se leen igual en una tabla.
   */
  it('🔴 dice que ⛔ NO es la tasa de reclamos, sino lo que se registró', async () => {
    const texto = await dibujar(COMO_HOY)
    expect(texto).toContain('no es la tasa de reclamos')
    expect(texto).toMatch(/chat/)
  })

  it('marca el mes en curso como incompleto', async () => {
    const texto = await dibujar(COMO_HOY)
    expect(texto).toContain('(en curso)')
  })

  it('🔴 un mes sin ventas online dice que ⛔ no hubo ventas, ⛔ no que nadie reclamó', async () => {
    const texto = await dibujar([
      { mes: '2026-08', ventas: 0, reclamos: 0, cada100: null, sinNumero: 'sin-ventas', enCurso: true },
    ])
    expect(texto).toContain('no hubo ventas online')
  })

  /**
   * ⚠️ **Un medidor que ⛔ no pudo medir tiene que decirlo.** Quedarse en blanco se lee igual que un
   * cero, y este número existe justo para que nadie improvise cuando la válvula haya que moverla.
   */
  it('🔴 si la lectura falla, sale el error y ⛔ no una tabla vacía', async () => {
    const { leerMedidor } = await import('@/lib/reclamos/medidor')
    vi.mocked(leerMedidor).mockRejectedValueOnce(new Error('permission denied for table ventas'))
    const texto = await dibujar(COMO_HOY)
    expect(texto).toContain('permission denied')
    // Ni una fila de mes: el título lleva «cada 100», así que el oráculo son los meses.
    expect(texto).not.toContain('ago 2026')
    expect(texto).not.toContain('283')
  })
})

/**
 * 🔑 **La regla y el CABLE, siempre los dos.** Todo lo de arriba monta `Medidor` a mano: prueba que
 * dibuja bien lo que le den, ⛔ no que alguien se lo esté dando. Este módulo se rompió cuatro veces
 * con la regla en verde y el cable cortado, así que acá se monta **la pantalla de Reclamos entera**
 * y se busca el medidor adentro.
 */
describe('el cable: el medidor está enchufado a Reclamos', () => {
  it('🔴 montando la pantalla de Administración, el medidor aparece', async () => {
    MEDIDO.length = 0
    MEDIDO.push(...COMO_HOY)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, devoluciones: [] }) })))
    const div = document.createElement('div')
    document.body.appendChild(div)
    const root = createRoot(div)
    window.history.replaceState(null, '', '/postventa')
    await act(async () => {
      root.render(<SesionProvider><ToastProvider><Devoluciones /></ToastProvider></SesionProvider>)
    })
    const texto = div.textContent || ''
    await act(async () => { root.unmount() })
    div.remove()
    vi.unstubAllGlobals()
    expect(texto).toContain('Reclamos registrados por cada 100 ventas online')
    expect(texto).toContain('0,7 cada 100')
    expect(texto).toContain('todavía no se registraban reclamos')
  })
})
