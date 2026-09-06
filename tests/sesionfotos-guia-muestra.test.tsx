// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Variante } from '@/lib/etl/tipos'

/**
 * **La sesión de EJEMPLO del tour, MONTADA** — el defecto que Bruno cazó caminándolo.
 *
 * Sus palabras: *«desde la 4 no muestra nada, porque no hay nada creado»*. Nueve de los trece pasos
 * de la guía hablan de lo que hay ADENTRO de una sesión —la modelo, el banco, la orden recibida,
 * los outfits, los dos botones de pedir— y en una instalación **sin ninguna sesión**, que es
 * exactamente la de quien recién abre la sección, ninguno de esos controles existe. El motor hacía
 * lo correcto (⛔ no saltear el paso, decir dónde aparece), pero un tour que explica nueve veces
 * seguidas «esto aparece cuando abrís una sesión» ⛔ no enseña: **enseñar dónde está un botón es
 * mostrarlo**.
 *
 * 🔑 **Este test monta, ⛔ no lee el fuente.** `tests/guia.test.ts` ya afirma que cada `data-guia`
 * existe en algún JSX; eso ⛔ no dice nada sobre si está EN PANTALLA. La pregunta de acá es la otra:
 * con la lista vacía y el tour corriendo, **¿tiene el globo dónde pararse?** Es la única forma de
 * que el defecto no vuelva callado el día que alguien mueva el ejemplo.
 */

vi.mock('@/components/SesionProvider', () => ({
  useSesion: () => ({ marca: 'zattia', perfil: { name: 'Ana', admin: true, cuenta: null, acceso: {}, funcion: [] } }),
}))
vi.mock('@/components/modelos/useModelos', () => ({
  useModelosElegibles: () => ({ modelos: [], error: null }),
}))
vi.mock('@/lib/recepciones/cliente', () => ({
  leerRecepciones: async () => [],
  leerRecepcion: async () => ({ lineas: [] }),
}))

const { Eventos } = await import('@/components/sesionfotos/Eventos')
const { sesionDeMuestra } = await import('@/lib/sesionfotos/guia')

/** Los controles que los pasos 4 a 10 señalan: todos viven adentro de una sesión abierta. */
const ADENTRO = ['sf.abrir', 'sf.pedirProductos', 'sf.modelo', 'sf.banco', 'sf.bancoOC', 'sf.bancoBuscar', 'sf.bancoPedir']

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

function pintar(muestra: ReturnType<typeof sesionDeMuestra> | null) {
  act(() => {
    root.render(
      <Eventos
        muestra={muestra}
        eventos={[]}
        solicitudes={[]}
        variantes={[] as Variante[]}
        huerfanas={[] as Variante[]}
        linea="zattia"
        editable
        usuario="Ana"
        persistir={async () => true}
        onPedirProductos={() => {}}
        onPedirDelBanco={async () => []}
        onVerSolicitud={() => {}}
      />,
    )
  })
}

const anclas = () => new Set([...host.querySelectorAll('[data-guia]')].map((e) => e.getAttribute('data-guia')))

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('el tour, con la lista de sesiones vacía', () => {
  it('🔴 sin el ejemplo no hay dónde pararse: es el defecto que se cazó caminándolo', () => {
    pintar(null)
    const hay = anclas()
    for (const a of ADENTRO) {
      if (a === 'sf.abrir' || a === 'sf.pedirProductos') continue // viven en la FILA, que tampoco existe
      expect(hay.has(a), `${a} no debería estar sin ninguna sesión`).toBe(false)
    }
  })

  it('con el ejemplo, los siete controles de los pasos 4 a 10 están en pantalla', () => {
    pintar(sesionDeMuestra('2026-09-10'))
    const hay = anclas()
    for (const a of ADENTRO) {
      expect(hay.has(a), `falta ${a}: el paso que lo señala se quedaría sin dónde pararse`).toBe(true)
    }
  })

  it('y se ve que es un ejemplo, con su rótulo y su aclaración', () => {
    pintar(sesionDeMuestra('2026-09-10'))
    // Una sesión de mentira que no se anuncia es peor que ninguna: se lee como trabajo de alguien.
    expect(host.textContent).toContain('Ejemplo')
    expect(host.textContent).toContain('No se guarda')
  })

  it('el ejemplo nace ABIERTO: si hubiera que apretarle «Abrir», los pasos de adentro no se verían', () => {
    pintar(sesionDeMuestra('2026-09-10'))
    // El banco sólo se dibuja con la sesión desplegada; que esté es la prueba de que nace abierta.
    expect(anclas().has('sf.banco')).toBe(true)
  })
})
