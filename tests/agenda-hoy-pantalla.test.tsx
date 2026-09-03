// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PendientesHoy } from '@/components/agenda/PendientesHoy'
import { SesionProvider } from '@/components/SesionProvider'
import type { Hecho, ItemAgenda } from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'

/**
 * **La Agenda de Hoy, del lado de la pantalla** (3-sep-2026, dos cosas que cazó Bruno caminándola).
 *
 * 🔴 **Los dos defectos vivían en el CABLEADO, así que ningún test de núcleo podía verlos.** Es la
 * misma lección que dejaron los KPIs de Meta: `filasDeHoy` agrupaba bien, `pendientesDe` marcaba
 * bien lo hecho, y la tarjeta igual dibujaba los tres botones de la puerta sobre una orden ya
 * contestada — porque el JSX del grupo no miraba `hecho`. El oráculo es **lo que se lee en la
 * tarjeta**, ⛔ no lo que devuelve la función.
 *
 * 1. *«en las reuniones no dice qué sector, y tengo 3 sectores que dirijo»* → el destino ya viajaba
 *    y lo dibujaban Rutinas, Cumplimiento y la grilla; la única que no era ésta.
 * 2. *«no aparece la opción apretada como sí aparece la tilde en las OCs»* → el renglón suelto sí
 *    gateaba por `hecho` (`{!hecho && …}`) y **el grupo no**, así que el defecto sólo aparece con
 *    dos órdenes o más — que es el caso normal: el 1-sep entraron once.
 *
 * ⚠️ **Se pinta con `createRoot` y ⛔ no con `renderToStaticMarkup`**, y no es una preferencia: en
 * render de servidor zustand lee `getInitialState()` —el estado **inicial** del store, ⛔ no el
 * actual—, así que el `setState` del fixture no llega y la pantalla sale vacía en los dos casos.
 * Un oráculo que dice lo mismo con el arreglo y sin él no es un oráculo.
 *
 * 🔑 Nadie logueado: el perfil arranca en `null`, que es todo lo que hace falta — el sector y la
 * puerta salen del ítem, no de quién mira.
 */

// El único cable de Next que toca esta pantalla: «ver la orden ↗» empuja a Recepciones. Sin
// AppRouter de por medio, `useRouter()` tira — y el hook corre ANTES del guard de permiso, así que
// no alcanza con que nadie esté logueado.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }))

const HOY = '2026-09-03'

const item = (i: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: 'i1',
  clase: 'pendiente',
  titulo: 'Reunión de pauta',
  cuerpo: null,
  regla: { tipo: 'unica', fecha: HOY },
  destino: { tipo: 'todos' },
  marcas: [],
  manualId: null,
  activo: true,
  arrastra: false,
  autor: null,
  creado: '2026-08-01T10:00:00.000Z',
  paraMi: true,
  ...i,
})

/** Una pregunta de puerta, con o sin contestar. */
const pregunta = (id: string, oc: string, resp?: { puerta: string; por: string; at: string }): ItemAgenda =>
  item({
    id,
    titulo: `¿Por qué puerta entró ${oc} (RHOVE)?`,
    destino: { tipo: 'roles', roles: ['administracion'] },
    preguntaIngreso: {
      oc: `bdi:${id}`,
      nombre: oc,
      fecha: HOY,
      marca: 'bdi',
      proveedor: 'RHOVE',
      puerta: resp?.puerta ?? null,
      contestadaPor: resp?.por ?? null,
      contestadaAt: resp?.at ?? null,
    },
  })

const hecho = (itemId: string): Hecho => ({
  itemId,
  fecha: HOY,
  usuario: 'Lorena Reyes',
  nota: null,
  hechoAt: `${HOY}T13:00:00.000Z`,
})

/** Los rótulos de las tres puertas, tal como los dibuja `puertasDeMarca`. */
const PUERTAS = ['Producción propia', 'Compra nacional', 'Importación']

type Pintado = {
  /** El texto plano de la pantalla: es lo que una persona lee. */
  texto: string
  /**
   * Cuántos botones de puerta quedaron **para apretar**.
   *
   * 🔑 Se cuentan `<button>`, ⛔ no ocurrencias del rótulo en el HTML: el renglón contestado dice
   * «Entró por **Importación**», y un `match` sobre el texto contaba eso como un botón abierto —
   * o sea que el helper daba por roto justo el arreglo. El oráculo es lo que se puede apretar.
   *
   * ⚠️ **En BDI son DOS por pregunta, ⛔ no tres**: desde el 1-sep-2026 cada puerta vive en su
   * marca y «Producción propia» sólo existe en Zattia.
   */
  puertas: number
}

const pintar = async (items: ItemAgenda[], hechos: Hecho[] = []): Promise<Pintado> => {
  useAgenda.setState({ items, hechos })
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(<SesionProvider><PendientesHoy fecha={HOY} /></SesionProvider>)
  })
  const puertas = [...div.querySelectorAll('button')]
    .filter((b) => PUERTAS.includes((b.textContent || '').trim())).length
  const texto = (div.textContent || '').replace(/\s+/g, ' ').trim()
  await act(async () => { root.unmount() })
  div.remove()
  return { texto, puertas }
}

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

beforeEach(() => {
  useAgenda.setState({ items: [], hechos: [] })
})

describe('de qué SECTOR es cada renglón', () => {
  it('🔴 la reunión dice a qué sector va — antes no lo decía en ningún lado de esta pantalla', async () => {
    const p = await pintar([item({ destino: { tipo: 'roles', roles: ['marketing'] } })])
    expect(p.texto).toContain('Reunión de pauta')
    expect(p.texto).toContain('Marketing')
  })

  it('con dos sectores los nombra a los dos: es el dato que distingue una reunión de la otra', async () => {
    const p = await pintar([item({ destino: { tipo: 'roles', roles: ['local', 'deposito'] } })])
    expect(p.texto).toContain('Local y Depósito')
  })

  it('dirigida a una persona, dice la persona', async () => {
    const p = await pintar([item({ destino: { tipo: 'personas', personas: ['Sofi'] } })])
    expect(p.texto).toContain('Sofi')
  })

  it('⛔ «a todo el equipo» NO dibuja rótulo: es el caso más común y repetirlo no distingue nada', async () => {
    const p = await pintar([item({ destino: { tipo: 'todos' } })])
    expect(p.texto).toContain('Reunión de pauta')
    expect(p.texto).not.toContain('todo el equipo')
  })
})

describe('la puerta ya contestada, en la tarjeta de varias órdenes', () => {
  it('🔴 la contestada ⛔ NO vuelve a ofrecer los botones, y la que falta SÍ', async () => {
    const p = await pintar(
      [pregunta('p1', 'OC-0466', { puerta: 'nacional', por: 'Lorena Reyes', at: `${HOY}T14:05:00.000Z` }), pregunta('p2', 'OC-0468')],
      [hecho('p1')],
    )
    // Una sola pregunta abierta ⇒ un solo juego de botones (dos, porque la OC es de BDI).
    expect(p.puertas).toBe(2)
    expect(p.texto).toContain('OC-0466')
    expect(p.texto).toContain('OC-0468')
  })

  it('🔑 y DICE por qué puerta entró, con quién la eligió', async () => {
    const p = await pintar(
      [pregunta('p1', 'OC-0466', { puerta: 'nacional', por: 'Lorena Reyes', at: `${HOY}T14:05:00.000Z` }), pregunta('p2', 'OC-0468')],
      [hecho('p1')],
    )
    expect(p.texto).toContain('Entró por Compra nacional')
    expect(p.texto).toContain('lo eligió Lorena Reyes')
  })

  it('🔴 una contestada ANTES de que el campo existiera ⛔ no vuelve a ofrecer los botones', async () => {
    // Las preguntas del 1-sep se tildaron sin guardar la puerta: el campo nació después. Lo que ⛔ no
    // puede pasar es que vuelvan a ofrecer los botones — el trabajo ya salió. Y ⛔ tampoco puede
    // inventar una puerta: dice que ya se contestó y nada más.
    const p = await pintar(
      [pregunta('p1', 'OC-0466'), pregunta('p2', 'OC-0468')],
      [hecho('p1'), hecho('p2')],
    )
    expect(p.puertas).toBe(0)
    expect(p.texto).toContain('Ya se contestó')
    expect(p.texto).not.toContain('Entró por')
  })

  it('🔑 una sola orden ⛔ no arma grupo, y el renglón suelto también dice por qué puerta entró', async () => {
    // Con una sola pregunta no hay tarjeta unificada: cae en el renglón de siempre, que ya tildaba
    // bien pero decía «lo marcó Lorena» — quién apretó, ⛔ no qué se decidió.
    const p = await pintar(
      [pregunta('p1', 'OC-0466', { puerta: 'importacion', por: 'Lorena Reyes', at: `${HOY}T14:05:00.000Z` })],
      [hecho('p1')],
    )
    expect(p.puertas).toBe(0)
    expect(p.texto).toContain('Entró por Importación')
    expect(p.texto).toContain('lo eligió Lorena Reyes')
  })

  it('sin contestar ninguna, las dos ofrecen sus botones', async () => {
    const p = await pintar([pregunta('p1', 'OC-0466'), pregunta('p2', 'OC-0468')])
    expect(p.puertas).toBe(4)
  })

  it('🔴 el contador dice «X de N» también en las preguntas, y ⛔ no «N órdenes»', async () => {
    // Decía «2 órdenes» con las dos contestadas y con ninguna: era el único lugar donde el avance
    // podía delatarse, porque abajo los botones tampoco lo decían.
    const p = await pintar([pregunta('p1', 'OC-0466'), pregunta('p2', 'OC-0468')], [hecho('p1')])
    expect(p.texto).toContain('1 de 2')
    expect(p.texto).not.toContain('2 órdenes')
  })
})
