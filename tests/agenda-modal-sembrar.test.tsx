// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ModalSembrar } from '@/components/agenda/ModalSembrar'
import { plantillaDe, type ItemAgenda } from '@/lib/agenda'

/**
 * **El botón que siembra un hecho a mano, montado y apretado.**
 *
 * 🔑 **Monta y aprieta, ⛔ no lee el fuente.** `Modal` usa un portal, así que `renderToStaticMarkup`
 * —el oráculo del resto de las pantallas— tira *«Portals are not currently supported by the server
 * renderer»*. Y acá lo que hay que fijar no es que exista un `<Select>` en el JSX: es que **lo que
 * se aprieta mande la acción y el eje correctos**, que es la mitad del 4º disparador que ningún
 * test del servidor puede ver.
 *
 * Lo que se prueba es lo que se rompe callado cuando el modal dejó de ser el del ingreso y pasó a
 * ser el de cualquier plantilla con botón (29-ago-2026):
 *
 *  1. **La copia sale del catálogo.** Si `pantalla` se leyera mal, el modal del cambio de condición
 *     comercial preguntaría «qué entró» y nadie sabría qué contestar.
 *  2. **La fecha del ingreso arranca en HOY y la del cambio arranca VACÍA**, que es una decisión por
 *     plantilla: un default que casi siempre acierta es el peor de todos.
 *  3. **El eje viaja con el nombre que dice la plantilla** (`puerta` / `cambio`): el handler pide el
 *     suyo, y si se mandara siempre `puerta` el servidor contestaría «falta decir qué cambió» sin
 *     que la pantalla pueda explicar por qué.
 */

const molde = (over: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: 'c1',
  clase: 'pendiente',
  titulo: 'Actualizar la barra de anuncios',
  cuerpo: null,
  regla: { tipo: 'diaria' },
  destino: { tipo: 'personas', personas: ['Cande'] },
  marcas: [],
  manualId: null,
  activo: true,
  arrastra: true,
  plantilla: 'condicion',
  offsetDias: 0,
  autor: null,
  creado: null,
  paraMi: true,
  ...over,
})

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

async function abrir(key: string, moldes: ItemAgenda[]) {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <ModalSembrar
        plantilla={plantillaDe(key)!}
        moldes={moldes}
        onCerrar={() => {}}
        onListo={async () => {}}
      />,
    )
  })
}

/** Escribir como escribe una persona: React sólo se entera por el setter nativo + `input`. */
function tipear(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

const campos = () => [...document.querySelectorAll('input')] as HTMLInputElement[]
const selects = () => [...document.querySelectorAll('select')] as HTMLSelectElement[]
const boton = (texto: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(texto))!
const texto = () => document.body.textContent || ''

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => { vi.restoreAllMocks() })

describe('el modal del hecho: la copia y los campos salen del catálogo', () => {
  it('el del CAMBIO pregunta por el cambio, ⛔ no por lo que entró', async () => {
    await abrir('condicion', [molde()])
    expect(texto()).toContain('Cambió una condición comercial')
    expect(texto()).toContain('Qué cambió, en pocas palabras')
    expect(texto()).toContain('Desde cuándo rige')
    // ⚠️ El eje es el SEGUNDO select desde el 1-sep-2026: la marca se pregunta primero, porque en
    // el ingreso las puertas que existen dependen de ella.
    expect([...selects()[0].options].map((o) => o.textContent)).toEqual(['Elegí la marca…', 'BDI', 'Zattia'])
    // Los tres del manual, y ninguno más. Los del cambio ⛔ no dependen de la marca: van completos.
    await act(async () => { tipear(selects()[0], 'bdi') })
    const opciones = [...selects()[1].options].map((o) => o.textContent)
    expect(opciones).toEqual(['Elegí…', 'Una promo', 'Una forma de pago', 'Un cambio de envío'])
  })

  it('🔴 la fecha del CAMBIO arranca VACÍA y la del INGRESO arranca en hoy', async () => {
    await abrir('condicion', [molde()])
    expect(campos()[1].value).toBe('')
    await abrir('ingreso', [molde({ plantilla: 'ingreso' })])
    /*
      🔴 **El día LOCAL, y ⛔ no `toISOString()`.** Con el UTC este test salía rojo **todas las
      noches después de las 21:00 de acá** —el modal usa `hoyIso()`, que es local, y allá ya es
      mañana— y verde de día: una corrida que depende de la hora enseña a no mirar los rojos.
      ⚠️ Y el oráculo ⛔ NO es `hoyIso()`: si las dos puntas usaran la misma función, esto no
      probaría nada. `en-CA` da `YYYY-MM-DD` por otro camino.
    */
    expect(campos()[1].value).toBe(new Date().toLocaleDateString('en-CA'))
    expect(texto()).toContain('Qué entró')
  })

  it('sin moldes cargados lo dice y ⛔ no ofrece sembrar nada', async () => {
    await abrir('condicion', [])
    expect(texto()).toContain('Todavía no hay ninguna actividad cargada en este evento')
    expect(selects()).toHaveLength(0)
  })

  it('🔴 una fecha ya vencida avisa ANTES de dejar apretar', async () => {
    await abrir('condicion', [molde()])
    await act(async () => { tipear(campos()[1], dia(-10)) })
    expect(texto()).toContain('Esa fecha ya pasó')
    expect(boton('Cargar los pendientes').disabled).toBe(true)
  })
})

describe('el modal del hecho: lo que manda al apretar', () => {
  it('🔑 el eje viaja con el nombre de ESTA plantilla (`cambio`), y la acción es la suya', async () => {
    const llamadas: { url: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      llamadas.push({ url, body: JSON.parse(init.body) })
      return { ok: true, status: 200, json: async () => ({ ok: true, creados: 1, ya: false }) }
    })

    await abrir('condicion', [molde()])
    await act(async () => { tipear(campos()[0], '3 cuotas Galicia') })
    await act(async () => { tipear(campos()[1], dia(3)) })
    await act(async () => { tipear(selects()[0], 'zattia') })
    await act(async () => { tipear(selects()[1], 'forma-de-pago') })
    // Antes de apretar, la pantalla cuenta cuántos van a salir: el conteo es la promesa.
    expect(texto()).toContain('Se van a crear')
    await act(async () => { boton('Cargar los pendientes').click() })

    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].body).toEqual({
      recurso: 'agenda',
      action: 'condicion',
      nombre: '3 cuotas Galicia',
      fecha: dia(3),
      marca: 'zattia',
      cambio: 'forma-de-pago',
    })
  })

  it('⛔ no manda nada hasta que están las tres preguntas contestadas', async () => {
    const llamadas: unknown[] = []
    vi.stubGlobal('fetch', async () => { llamadas.push(1); return { ok: true, status: 200, json: async () => ({ ok: true }) } })
    await abrir('condicion', [molde()])
    await act(async () => { tipear(campos()[0], 'Envío gratis') })
    await act(async () => { tipear(campos()[1], dia(1)) })
    // Falta el eje y la marca: el botón no se aprieta, y si se apretara no saldría nada.
    expect(boton('Cargar los pendientes').disabled).toBe(true)
    await act(async () => { boton('Cargar los pendientes').click() })
    expect(llamadas).toEqual([])
  })

  it('🆕 🔴 las PUERTAS que se ofrecen dependen de la marca, y cambiarla LIMPIA la elegida', async () => {
    // Bruno, 1-sep-2026: *«bdi y zattia tienen compra nacional; la diferencia es que bdi tiene
    // importado, y zattia tiene producción propia»*. 🔑 La lista es la misma por la que corta el
    // servidor: si la pantalla ofreciera una puerta que `sembrar` rechaza, apretar sería un 400.
    await abrir('ingreso', [molde({ plantilla: 'ingreso' })])
    // ⛔ Sin marca ⛔ no hay lista: la puerta más común contestada sola es la que sale mal.
    expect(selects()[1].disabled).toBe(true)
    expect([...selects()[1].options].map((o) => o.textContent)).toEqual(['Elegí primero la marca…'])

    await act(async () => { tipear(selects()[0], 'zattia') })
    expect([...selects()[1].options].map((o) => o.textContent))
      .toEqual(['Elegí…', 'Producción propia', 'Compra nacional'])

    await act(async () => { tipear(selects()[1], 'produccion') })
    expect(selects()[1].value).toBe('produccion')

    // 🔴 Al pasar a BDI, «producción propia» ya no existe: si quedara elegida, el formulario
    // mostraría como elegida una opción que la lista no ofrece y que el servidor rechaza.
    await act(async () => { tipear(selects()[0], 'bdi') })
    expect([...selects()[1].options].map((o) => o.textContent))
      .toEqual(['Elegí…', 'Compra nacional', 'Importación'])
    expect(selects()[1].value).toBe('')
  })

  it('🔴 un molde que ⛔ no corre para lo elegido: lo dice y no deja apretar', async () => {
    // El mismo cálculo que hace el servidor. Sin esto, apretar contesta un 400 que se lee como una
    // falla del sistema en vez de «ese paso no corre para este cambio».
    await abrir('condicion', [molde({ cambios: ['promo'] })])
    await act(async () => { tipear(campos()[0], 'Envío gratis') })
    await act(async () => { tipear(campos()[1], dia(1)) })
    await act(async () => { tipear(selects()[0], 'bdi') })
    await act(async () => { tipear(selects()[1], 'envio') })
    expect(texto()).toContain('Ninguno de los 1 moldes cargados corre')
    expect(boton('Cargar los pendientes').disabled).toBe(true)
  })
})
