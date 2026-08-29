// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { MensajeRegistrado } from '@/lib/reclamos/tipos'

/**
 * **El panel «Qué se le dijo», y sobre todo lo que dice cuando está VACÍO** (D9, 29-ago-2026).
 *
 * 🔴 🔑 El registro empezó el 29-ago-2026: **todos los reclamos anteriores tienen la lista vacía**,
 * los tres mensajes de R-0022 incluidos. Una lista vacía leída como *«no se le dijo nada»* es
 * exactamente el «el cero afirma» que este módulo viene tapando en `retencion_respuesta`, en la
 * columna «A devolver» y en el destino de las unidades — con la diferencia de que acá el que se
 * equivoca es alguien contestándole a un cliente que dice que le prometieron otra cosa.
 */

const RESPUESTA: { lista: MensajeRegistrado[]; falla: string | null; colgada: boolean } = {
  lista: [], falla: null, colgada: false,
}

vi.mock('@/lib/reclamos/cliente', async (orig) => {
  const real = await orig<typeof import('@/lib/reclamos/cliente')>()
  return {
    ...real,
    leerMensajes: vi.fn(async () => {
      if (RESPUESTA.colgada) return new Promise<MensajeRegistrado[]>(() => { /* nunca contesta */ })
      if (RESPUESTA.falla) throw new Error(RESPUESTA.falla)
      return RESPUESTA.lista
    }),
  }
})

const { QueSeLeDijo } = await import('@/components/reclamos/QueSeLeDijo')

const pintado = async (lista: MensajeRegistrado[], falla: string | null = null): Promise<string> => {
  RESPUESTA.lista = lista
  RESPUESTA.falla = falla
  RESPUESTA.colgada = false
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => { root.render(<QueSeLeDijo marca="bdi" id={22} />) })
  const txt = div.textContent || ''
  await act(async () => { root.unmount() })
  div.remove()
  return txt
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

describe('qué se le dijo al cliente', () => {
  /**
   * 🔴 **La mitad que importa.** Sin esta frase, el panel afirma sobre reclamos viejos algo que
   * ⛔ no sabe — y lo afirma justo en el lugar donde alguien va a buscar con qué contestarle a un
   * cliente.
   */
  it('🔴 vacío dice que ⛔ no es «no se le dijo nada», sino que ⛔ no quedó registrado', async () => {
    const t = await pintado([])
    expect(t).toContain('Nada registrado')
    expect(t).toContain('no quiere decir que no se le dijo nada')
    expect(t).toContain('29-ago-2026')
  })

  it('con mensajes: dibuja el momento, quién y el texto que salió', async () => {
    const t = await pintado([
      { tipo: 'resolucion', at: '2026-08-29T15:00:00.000Z', por: 'Lorena', texto: 'Te devolvemos $13.491.' },
    ])
    expect(t).toContain('La resolución')
    expect(t).toContain('Lorena')
    expect(t).toContain('Te devolvemos $13.491.')
  })

  /** Y lo que se lee es el TEXTO guardado, ⛔ no uno rearmado ahora con los datos de hoy. */
  it('🔴 muestra el texto tal cual quedó guardado', async () => {
    const t = await pintado([
      { tipo: 'propuesta', at: '2026-08-28T01:41:00.000Z', por: 'Bruno', texto: '¿Te lo querés quedar por $13.491?' },
    ])
    expect(t).toContain('¿Te lo querés quedar por $13.491?')
  })

  /** Si ⛔ no se pudo leer, lo dice: un error mudo se lee igual que una lista vacía. */
  it('🔴 si falla la lectura ⛔ no se muestra como «nada registrado»', async () => {
    const t = await pintado([], 'se cayó la conexión')
    expect(t).toContain('se cayó la conexión')
    expect(t).not.toContain('Nada registrado')
  })
})

/**
 * 🔴 **Y lo que se dibuja tiene que ser de ESTE reclamo.** El detalle se abre y se cierra sobre
 * filas distintas; si la respuesta anterior sobrevive al cambio de fila, abajo del encabezado
 * «Qué se le dijo» del reclamo nuevo queda la lista del anterior — o sea *«esto es lo que le
 * dijimos»* **sobre otro cliente**, que es la peor forma de afirmar de más que tiene esta pantalla.
 */
describe('cambiar de reclamo', () => {
  it('🔴 mientras carga el nuevo ⛔ NO deja dibujados los mensajes del anterior', async () => {
    RESPUESTA.lista = [{ tipo: 'resolucion', at: '2026-08-29T15:00:00.000Z', por: 'Lorena', texto: 'ESTO ES DE R-0022.' }]
    RESPUESTA.falla = null
    RESPUESTA.colgada = false
    const div = document.createElement('div')
    document.body.appendChild(div)
    const root = createRoot(div)
    await act(async () => { root.render(<QueSeLeDijo marca="bdi" id={22} />) })
    expect(div.textContent).toContain('ESTO ES DE R-0022.')

    RESPUESTA.colgada = true
    await act(async () => { root.render(<QueSeLeDijo marca="bdi" id={23} />) })
    expect(div.textContent).not.toContain('ESTO ES DE R-0022.')
    expect(div.textContent).toContain('Leyendo')

    await act(async () => { root.unmount() })
    div.remove()
  })
})
