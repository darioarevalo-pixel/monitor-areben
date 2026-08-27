// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DecidirReclamo } from '@/components/reclamos/DecidirReclamo'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **La pantalla pedía un número DESPUÉS de la cuenta que lo usa.**
 *
 * `Decidir` era una tira de 19 bloques, y el envío de vuelta y el PVP de feria —los dos números de
 * los que sale el techo de "¿cuánto le ofrezco para que se lo quede?"— se cargaban **150 líneas más
 * abajo** de esa caja. Con los campos vacíos, la caja mostraba $0, los dos botones apagados, y un
 * aviso en rojo pidiendo registrar algo que la pantalla no dejaba hacer. Lo encontró Bruno el
 * 27-ago-2026 usándola con el primer reclamo real de BDI: *«esta sección no la entiendo»*.
 *
 * El arreglo fue partirla en tres pestañas **ordenadas por el flujo del dato**, y hacer que la caja
 * de retención se conteste sola en vez de preguntar lo que el sistema ya sabe.
 *
 * 🔑 **Estos tests MONTAN el componente**, como `reclamos-foto-ampliada.test.tsx`, y por la misma
 * razón que ese archivo documenta: `Modal` usa un portal y `renderToStaticMarkup` tira *«Portals
 * are not currently supported by the server renderer»*. El oráculo de qué pestaña está abierta es
 * `aria-selected="true"`, el mismo de `postventa-pantalla.test.tsx`.
 */

const RECLAMO = {
  id: 42, store: 'bdi', orden_tn: '20700', estado: 'en_revision', motivo: 'falla',
  cliente: 'Ana', items: [{ producto: 'FUNDA X', variante: null, cantidad: 1, precio: 12000 }],
  fotos: [{ url: 'https://blob/primera.jpg' }],
} as unknown as ReclamoRow

/** Un caso sano donde el producto vuelve: arrepentimiento ya despachado. */
const SANO = { ...RECLAMO, motivo: 'arrepentimiento', escenario: 'ya_salio' } as unknown as ReclamoRow
/** Una demora: no hay producto en juego, así que la pestaña del producto queda vacía a propósito. */
const DEMORA = { ...RECLAMO, motivo: 'demora', escenario: 'transporte' } as unknown as ReclamoRow

async function abrir(reclamo: ReclamoRow) {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <DecidirReclamo marca="bdi" reclamo={reclamo} onClose={() => {}} onListo={() => {}} />,
    )
  })
}

const tabs = () => [...document.querySelectorAll('[role="tab"]')] as HTMLElement[]
const tab = (nombre: string) => tabs().find((t) => (t.textContent || '').includes(nombre))!
const abierta = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent || ''
const botones = () => [...document.querySelectorAll('button')] as HTMLButtonElement[]
const boton = (t: string | RegExp) => botones().find((b) => (typeof t === 'string' ? (b.textContent || '').includes(t) : t.test(b.textContent || '')))
const textoDeLaPantalla = () => document.body.textContent || ''
/** Los `<input>` de un `Field`, buscados por el texto de su label. */
const campo = (label: string) => {
  const l = [...document.querySelectorAll('label')].find((x) => (x.textContent || '').includes(label))
  return l?.querySelector('input') as HTMLInputElement | undefined
}

/** Tipea en un NumberField como lo haría una persona. */
async function tipear(label: string, valor: string) {
  const input = campo(label)!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

describe('Decidir — las tres pestañas', () => {
  it('son tres, en el orden en que se calculan los datos, y abre en la primera', async () => {
    await abrir(RECLAMO)
    expect(tabs().map((t) => t.textContent?.replace(/—|falta|traba/g, '').trim())).toEqual(['Qué pasó', 'El producto', 'El cliente'])
    expect(abierta()).toContain('Qué pasó')
  })

  it('cambiar de pestaña muestra su contenido, no sólo mueve el subrayado', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    expect(abierta()).toContain('El producto')
    // Sin esta mitad, una pestaña vacía pasaría el test igual.
    expect(campo('Envío de vuelta')).toBeTruthy()
  })

  /**
   * 🔑 **EL test del defecto.** Lo que arregla el rediseño no es el aspecto: es que el número se
   * pida antes de la caja que lo consume. Si alguien vuelve a poner la retención arriba, esto se
   * pone rojo.
   */
  it('el envío de vuelta va ARRIBA de la caja de la oferta, no abajo', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    // Se carga primero porque ése es el punto: hasta que no está, la caja de abajo no tiene con qué
    // contestar. Antes del rediseño se podía tipear acá y la caja quedaba igual arriba, en $0.
    await tipear('Envío de vuelta', '6000')
    const envio = campo('Envío de vuelta')!
    const oferta = campo('Cuánto se le ofrece')
    expect(oferta).toBeTruthy()
    // DOCUMENT_POSITION_FOLLOWING = la oferta viene después del envío en el documento.
    expect(envio.compareDocumentPosition(oferta!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Decidir — la oferta de retención se contesta sola', () => {
  it('sin nada que perder si vuelve, dice que NO conviene y no reta por no registrar', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    const t = textoDeLaPantalla()
    expect(t).toContain('No conviene ofrecerle que se lo quede')
    // El aviso que pedía anotar la respuesta con los botones apagados: ⛔ no puede estar.
    expect(t).not.toContain('anotá qué contestó')
    // Y tampoco los botones: no hay nada que ofrecer, así que no hay nada que registrar.
    expect(boton('Aceptó: se lo queda')).toBeUndefined()
  })

  it('pero deja registrar la oferta que se hizo igual', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    await act(async () => { boton('Se lo ofrecí igual')!.click() })
    expect(boton('Aceptó: se lo queda')).toBeTruthy()
  })

  // La contracara, sin la cual "nunca ofrecer nada" pasaría el test de arriba.
  it('con el envío de vuelta cargado, dice cuánto ofrecer y habilita los dos botones', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    await tipear('Envío de vuelta', '6000')
    expect(textoDeLaPantalla()).toContain('Ofrecele')
    expect(boton('Aceptó: se lo queda')?.disabled).toBe(false)
    expect(boton('No aceptó')?.disabled).toBe(false)
  })

  it('si aceptó quedárselo, «Que vuelva» queda trabado: el servidor rechaza las dos juntas', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    await tipear('Envío de vuelta', '6000')
    await act(async () => { boton('Aceptó: se lo queda')!.click() })
    expect(boton('Que vuelva')?.disabled).toBe(true)
  })
})

describe('Decidir — la cuenta del retorno no afirma sin datos', () => {
  /**
   * 🔴 Mismo defecto que el techo en $0, en el bloque de arriba: la cuenta compara lo recuperable
   * contra el envío, y con el campo vacío el envío vale 0 ⇒ **siempre** contestaba "Conviene
   * pedirlo". Un veredicto sacado de un número que existe y no significa nada.
   */
  it('con el envío sin cargar no da veredicto: dice que falta el dato', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    const t = textoDeLaPantalla()
    expect(t).toContain('Todavía no se puede saber si conviene pedirlo')
    expect(t).not.toContain('Conviene pedirlo.')
  })

  // ⚠️ Un 0 TIPEADO sí es un dato: es "la trae al local". La diferencia entre vacío y cero es lo
  // que hace que esto no sea simplemente esconder el veredicto.
  it('un cero tipeado SÍ es un dato y la cuenta contesta', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    await tipear('Envío de vuelta', '0')
    expect(textoDeLaPantalla()).toContain('Conviene pedirlo')
  })
})

describe('Decidir — el chip de cada pestaña', () => {
  /**
   * ⚠️ Una pestaña sin nada que contestar ⛔ no es una pestaña incompleta. Marcarla en rojo empuja
   * a inventar un destino con tal de poder cerrar, que es el defecto que este módulo ya tuvo: hasta
   * el 25-ago-2026 una demora **no se podía cerrar nunca**.
   */
  it('una demora no marca falta en «El producto», y explica por qué está vacía', async () => {
    await abrir(DEMORA)
    expect(tab('El producto').textContent).not.toContain('falta')
    await act(async () => { tab('El producto').click() })
    expect(textoDeLaPantalla()).toContain('no hay producto en juego')
  })

  it('una falla sin contestar la pregunta que decide SÍ marca falta', async () => {
    await abrir({ ...RECLAMO, escenario: null } as unknown as ReclamoRow)
    expect(tab('Qué pasó').textContent).toContain('falta')
  })
})

describe('Decidir — los bugs que encontró la primera vuelta real', () => {
  /**
   * 🔴 El ⓘ "no andaba": `.info-pop` tenía `z-index: 100` y el fondo del modal `200`, y los dos son
   * portales hermanos de `document.body`. El panel se abría TAPADO. Y peor: el click donde debería
   * estar el panel le pegaba al fondo, que cierra el modal ⇒ **leer la ayuda perdía lo cargado**.
   *
   * ⚠️ jsdom ⛔ no calcula apilamiento, así que el z-index no se puede probar acá: eso se mira en
   * el navegador. Lo que SÍ se puede fijar —y es el defecto grave— es que tocar el ⓘ **no cierre
   * el modal** y que el panel llegue al DOM.
   */
  const infoDot = () => document.querySelector('.info-dot') as HTMLElement | null

  it('tocar el ⓘ abre el panel Y NO cierra el modal', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    expect(infoDot()).toBeTruthy()
    await act(async () => { infoDot()!.click() })
    expect(document.querySelector('.info-pop')).toBeTruthy()
    // La aserción que vale: el modal sigue en pie. Es lo que se perdía.
    expect(document.querySelector('.mo-modal')).toBeTruthy()
  })

  /**
   * 🔴 El destino del reclamo salía DOS VECES: una en la opción vacía («Lo del reclamo — X») y otra
   * en la lista, que estaba escrita a mano. De paso `no_salio` no se podía elegir nunca.
   */
  it('el destino del reclamo no se repite en el desplegable de cada producto', async () => {
    await abrir({ ...SANO, items: [
      { producto: 'A', cantidad: 1, precio: 1000 },
      { producto: 'B', cantidad: 1, precio: 2000 },
    ] } as unknown as ReclamoRow)
    await act(async () => { tab('El producto').click() })
    const select = [...document.querySelectorAll('select')]
      .find((s) => [...s.options].some((o) => o.textContent?.startsWith('Lo del reclamo')))!
    const textos = [...select.options].map((o) => o.textContent || '')
    const delReclamo = textos[0].replace('Lo del reclamo — ', '')
    expect(textos.filter((t) => t === delReclamo)).toHaveLength(0)
    // Y la contracara: la lista sigue teniendo todas las OTRAS opciones, incluida `no_salio`,
    // que con la lista escrita a mano no aparecía nunca.
    expect(textos.some((t) => t.includes('Nunca salió'))).toBe(true)
  })
})

describe('Decidir — confirmar', () => {
  /**
   * 🔴 **El 27-ago-2026 se decidió un reclamo real habiendo pasado por un solo paso.** El botón
   * final vivía en el pie compartido y estaba a mano desde la pestaña 1. Ahora cada paso confirma
   * lo suyo y **sólo el último guarda**.
   */
  it('desde el primer paso NO se puede guardar: el botón confirma ESE paso', async () => {
    await abrir(SANO)
    expect(boton('Confirmar la decisión')).toBeUndefined()
    expect(boton('Confirmar paso')).toBeTruthy()
  })

  /**
   * 🔴 **Confirmar un paso GUARDA.** Hasta el 27-ago-2026 sólo marcaba el tilde en memoria: salir
   * del modal a buscar un dato perdía todo lo cargado. El pedido de Bruno fue literal: *«decidir el
   * paso 1, salir, volver a entrar y continuar»*.
   */
  it('confirmar un paso lo guarda, lo deja tildado y pasa al siguiente', async () => {
    const enviados: string[] = []
    const fetchSpy = vi.fn((_u: unknown, init?: { body?: string }) => {
      if (init?.body) enviados.push(init.body)
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchSpy)
    await abrir(SANO)
    await act(async () => { boton('Confirmar paso')!.click() })
    // La aserción que vale: SALIÓ un guardado, y es `editar` — que ⛔ no decide.
    expect(enviados.length).toBeGreaterThan(0)
    const body = JSON.parse(enviados[0])
    expect(body.action).toBe('editar')
    expect(body.escenario).toBe('ya_salio')
    expect(abierta()).toContain('El producto')
    expect(tab('Qué pasó').textContent).toContain('✓')
    vi.unstubAllGlobals()
  })

  // La contracara: al reabrir, lo guardado vuelve solo. Sin esto, "guardar el paso" no sirve.
  it('al reabrir, los datos guardados vuelven cargados y el paso queda tildado', async () => {
    await abrir({ ...SANO, envio_costo: 6000, via_retorno: 'correo' } as unknown as ReclamoRow)
    expect(tab('El producto').textContent).toContain('✓')
    await act(async () => { tab('El producto').click() })
    expect(campo('Envío de vuelta')?.value).toBe('6000')
    // Y con el envío ya cargado la caja de la oferta contesta, en vez de mostrar $0.
    expect(textoDeLaPantalla()).toContain('Ofrecele')
  })

  it('en el último paso sí aparece «Confirmar la decisión»', async () => {
    await abrir(SANO)
    await act(async () => { tab('El cliente').click() })
    expect(boton('Confirmar la decisión')?.disabled).toBe(false)
    expect(boton('Confirmar paso')).toBeUndefined()
  })

  /**
   * 🔑 Hasta hoy `guardar` no tenía un solo `if`: mandaba, el servidor rechazaba, y volvía un toast
   * con el mensaje crudo del handler y sin ninguna pista de dónde arreglarlo.
   */
  it('con algo que traba NO manda nada, y dice en qué pestaña está', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetchSpy)
    await abrir(SANO)
    // Una parcial de $0: el caso que traba sin necesidad de tocar la retención.
    await act(async () => { tab('El cliente').click() })
    const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'plata_parcial'))!
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(select, 'plata_parcial')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => { boton('Confirmar la decisión')!.click() })
    // La aserción que mata el defecto real: hoy mandaba igual.
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(textoDeLaPantalla()).toContain('Para poder confirmar falta')
    vi.unstubAllGlobals()
  })
})
