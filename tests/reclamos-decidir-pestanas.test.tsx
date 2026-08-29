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
    expect(campo('Cuánto nos saldría traerlo')).toBeTruthy()
  })

  /**
   * 🔑 **EL test del defecto, en su segunda versión.**
   *
   * La primera fijaba que el envío de vuelta estuviera **arriba** de la caja de la oferta: el
   * defecto original era que la caja consumía un número que se pedía más abajo, y quedaba en $0.
   * El 27-ago-2026 el envío se **metió adentro** de la calculadora, así que esa relación dejó de
   * existir — el defecto es imposible por construcción, ⛔ no por orden de lectura.
   *
   * Lo que queda por fijar es la invariante nueva, que es del pedido de Bruno: **la pregunta va
   * antes que la calculadora.** Cargar el envío antes de decidir si el producto vuelve es lo que
   * hacía que la pantalla llegara a la pregunta con la respuesta ya puesta.
   */
  it('la pregunta va ARRIBA de la calculadora, y el envío vive ADENTRO', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    const pregunta = boton('Se lo queda')!
    const envio = campo('Cuánto nos saldría traerlo')
    const oferta = campo('Cuánto se le ofrece')
    expect(envio, 'el envío se pregunta como el insumo de la calculadora').toBeTruthy()
    // DOCUMENT_POSITION_FOLLOWING = viene después de la pregunta en el documento.
    expect(pregunta.compareDocumentPosition(envio!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Y la oferta, después del número del que sale su techo.
    await tipear('Cuánto nos saldría traerlo', '6000')
    expect(campo('Cuánto nos saldría traerlo')!.compareDocumentPosition(campo('Cuánto se le ofrece')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(oferta ?? campo('Cuánto se le ofrece')).toBeTruthy()
  })

  /**
   * 🔴 **El default es «se lo queda»**, y ⛔ no lo que sugiera la cuenta. Con el envío sin cargar,
   * `convieneRetorno` compara contra 0 y contesta «conviene pedirlo» siempre: la pantalla llegaba
   * a la pregunta con «que vuelva» puesto, pedía la vía y el envío, y no se salía más
   * (*«no puedo salir del envío»*, Bruno, 27-ago-2026).
   */
  it('abre en «Se lo queda» y ⛔ no pide vía ni envío de vuelta', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    expect(campo('Envío de vuelta'), 'no hay envío que organizar si no vuelve').toBeUndefined()
    expect(textoDeLaPantalla()).not.toContain('¿Cómo vuelve?')
    // La contracara: elegir «Que vuelva» sí los trae.
    await act(async () => { boton('Que vuelva')!.click() })
    expect(campo('Envío de vuelta')).toBeTruthy()
    expect(textoDeLaPantalla()).toContain('¿Cómo vuelve?')
  })
})

describe('Decidir — la oferta de retención se contesta sola', () => {
  it('sin nada que perder si vuelve, dice que NO conviene y no reta por no registrar', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    const t = textoDeLaPantalla()
    // ⚠️ El veredicto lo dice la cuenta, ⛔ no un título: desde el 27-ago-2026 la caja se llama
    // siempre «Calculadora de retención» y lo que cambia es lo que contesta adentro.
    expect(t).toContain('no perdés plata porque vuelva')
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
    await tipear('Cuánto nos saldría traerlo', '6000')
    expect(textoDeLaPantalla()).toContain('Ofrecele')
    expect(boton('Aceptó: se lo queda')?.disabled).toBe(false)
    expect(boton('No aceptó')?.disabled).toBe(false)
  })

  /**
   * 🔴 **D15 de la auditoría del 28-ago-2026: la oferta hecha POR TELÉFONO no se podía registrar.**
   *
   * Las fotos gatean **armar** la propuesta —hasta ver el producto no se sabe qué se ofrece—, pero
   * una oferta que ya se hizo **es un hecho que pasó**: esconder la caja no lo deshace, sólo lo
   * deja sin registrar, y después la rechazada no aparece en ninguna cuenta. La escapatoria ya
   * existía y vivía **adentro** de la rama que necesitaba las fotos para llegar.
   */
  describe('🔴 sin fotos', () => {
    const SIN_FOTOS = { ...SANO, fotos: [] } as unknown as ReclamoRow

    it('dice que faltan las fotos, ⛔ y no esconde la caja en silencio', async () => {
      await abrir(SIN_FOTOS)
      await act(async () => { tab('El producto').click() })
      expect(textoDeLaPantalla()).toContain('hacen falta las fotos del cliente')
      expect(boton('Aceptó: se lo queda')).toBeUndefined()
    })

    it('🔴 pero ofrece la escapatoria, y desde ahí SÍ se registra', async () => {
      await abrir(SIN_FOTOS)
      await act(async () => { tab('El producto').click() })
      const link = boton('Se lo ofrecí igual')
      expect(link).toBeTruthy()
      await act(async () => { link!.click() })
      expect(boton('Aceptó: se lo queda')).toBeTruthy()
      expect(boton('Se la mandé: esperando')).toBeTruthy()
    })

    /**
     * 🔴 **Lo que tapaba algo peor**: `retencion_monto` y `retencion_forma` se guardan mirando
     * `hayOferta`, ⛔ no `mostrarRetencion`. Un reclamo con la oferta ya registrada y sin fotos
     * **la seguía guardando con la caja escondida** — el dato vivo y la pantalla muda.
     */
    it('🔴 con una oferta YA registrada, la caja aparece sola', async () => {
      const conOferta = {
        ...SIN_FOTOS, retencion_monto: 5000, retencion_forma: 'plata', retencion_at: '2026-08-28T01:41:00Z',
      } as unknown as ReclamoRow
      await abrir(conOferta)
      await act(async () => { tab('El producto').click() })
      expect(textoDeLaPantalla()).not.toContain('hacen falta las fotos del cliente')
      expect(boton('Aceptó: se lo queda')).toBeTruthy()
    })

    /** Y donde el caso ⛔ no admite la oferta, ⛔ no hay escapatoria: no hay nada que ofrecer. */
    it('en un caso que ⛔ no admite retención, ⛔ no aparece el link', async () => {
      const sinRetencion = { ...DEMORA, fotos: [] } as unknown as ReclamoRow
      await abrir(sinRetencion)
      await act(async () => { tab('El producto').click() })
      expect(boton('Se lo ofrecí igual')).toBeUndefined()
    })
  })

  it('si aceptó quedárselo, «Que vuelva» queda trabado: el servidor rechaza las dos juntas', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    await tipear('Cuánto nos saldría traerlo', '6000')
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
    // ⚠️ El veredicto del retorno vive en la rama «Que vuelva»: es ahí donde el envío deja de ser
    // un techo hipotético y pasa a ser plata que se va a gastar.
    await act(async () => { boton('Que vuelva')!.click() })
    const t = textoDeLaPantalla()
    expect(t).toContain('Todavía no se puede saber si conviene traerlo')
    expect(t).not.toContain('Conviene traerlo.')
  })

  // ⚠️ Un 0 TIPEADO sí es un dato: es "la trae al local". La diferencia entre vacío y cero es lo
  // que hace que esto no sea simplemente esconder el veredicto.
  it('un cero tipeado SÍ es un dato y la cuenta contesta', async () => {
    await abrir(SANO)
    await act(async () => { tab('El producto').click() })
    await act(async () => { boton('Que vuelva')!.click() })
    await tipear('Envío de vuelta', '0')
    expect(textoDeLaPantalla()).toContain('Conviene traerlo')
  })
})

describe('Decidir — la salida no se elige sola', () => {
  /**
   * 🔴 **La causa raíz de todo lo del 27-ago-2026.** La salida arrancaba en
   * `compensacionesDe(...)[0]`, que en «no era lo que esperaba» y en «talle» es «lo cambia por
   * otro producto». Confirmar sin haber mirado el último paso **convertía el reclamo en un
   * CAMBIO** — y un cambio queda fuera de «Decidir» a propósito, o sea una puerta de una sola
   * dirección. Pasó dos veces el mismo día, con reclamos reales.
   */
  it('arranca sin elegir, y ⛔ no en la primera del repertorio', async () => {
    await abrir(SANO)
    await act(async () => { tab('El cliente').click() })
    const select = [...document.querySelectorAll('select')]
      .find((x) => [...x.options].some((o) => o.value === 'otro_producto'))!
    expect(select.value).toBe('')
    // La contracara: la opción sigue existiendo, sólo que hay que elegirla.
    expect([...select.options].some((o) => o.value === 'otro_producto')).toBe(true)
  })

  it('sin salida elegida NO se puede guardar, y lo dice', async () => {
    const enviados: string[] = []
    const fetchSpy = vi.fn((_u: unknown, init?: { body?: string }) => {
      if (init?.body) enviados.push(init.body)
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchSpy)
    await abrir(SANO)
    await act(async () => { tab('El cliente').click() })
    await act(async () => { boton('Confirmar la decisión')!.click() })
    expect(enviados.filter((b) => JSON.parse(b).action === 'decidir')).toHaveLength(0)
    expect(textoDeLaPantalla()).toContain('Para poder confirmar falta')
    vi.unstubAllGlobals()
  })

  /**
   * 🔴 **Esta invariante se dio VUELTA el 27-ago-2026, y a pedido.** Antes fijaba que un reclamo ya
   * decidido abriera **con su salida puesta** («rehacer no empieza borrando»). En la práctica eso
   * hacía que el botón del pie la **re-confirmara sola**: apretar el botón que promete cambiar la
   * decisión la dejaba donde estaba. Bruno: *«no puede tener una opción predeterminada cargada,
   * porque sino ponemos confirmar y no se eligió»*.
   *
   * 🔑 El dato ⛔ no se pierde — se muestra como texto. Mostrar es informar; dejarlo cargado en el
   * control es elegir por la persona.
   */
  it('un reclamo ya decidido abre SIN elegir, y dice cuál es la salida de hoy', async () => {
    await abrir({ ...SANO, compensacion: 'plata_total' } as unknown as ReclamoRow)
    await act(async () => { tab('El cliente').click() })
    const select = [...document.querySelectorAll('select')]
      .find((x) => [...x.options].some((o) => o.value === 'otro_producto'))!
    expect(select.value).toBe('')
    expect(textoDeLaPantalla()).toContain('Hoy es:')
    expect(textoDeLaPantalla()).toContain('Se le devuelve todo')
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
    /**
     * ⚠️ **Cambiado a propósito el 27-ago-2026.** Este caso pedía que apareciera «Nunca salió del
     * depósito», que era la contracara correcta cuando la lista se derivaba de `DESTINO_LABEL`: el
     * defecto de entonces era que `no_salio` ⛔ no se podía elegir NUNCA.
     *
     * Ahora la lista sale de `destinosDe`, que además filtra por el caso — y en un arrepentimiento
     * que **ya salió** «Nunca salió del depósito» es literalmente falso. Pedirlo acá sería fijar el
     * defecto que `destinosDe` vino a arreglar.
     *
     * La contracara que vale ahora: la lista **sigue teniendo las otras**, o sea que el filtro no
     * la dejó vacía — que es cómo un filtro nuevo esconde un desplegable entero sin que nadie lo
     * note.
     */
    expect(textos.some((t) => t.includes('Nunca salió'))).toBe(false)
    expect(textos.length, 'el filtro dejó el desplegable sin opciones').toBeGreaterThan(1)
  })
})

describe('Decidir — confirmar', () => {
  /**
   * 🔴 **El 27-ago-2026 se decidió un reclamo real habiendo pasado por un solo paso.** El botón
   * final vivía en el pie compartido y estaba a mano desde la pestaña 1. Ahora cada paso confirma
   * lo suyo y **sólo el último guarda**.
   */
  it('desde un paso que no es el último NO se puede guardar: el botón confirma ESE paso', async () => {
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
    // ⚠️ Desde el 27-ago-2026 el modal abre en el primer paso SIN guardar, y `SANO` ya trae el
    // escenario ⇒ abre en ②. Se vuelve a ① a mano, que es lo que este test mide.
    await act(async () => { tab('Qué pasó').click() })
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
    // ⚠️ Con `retorno_decidido` sin contestar el producto NO vuelve, así que el número se pregunta
    // como el insumo de la calculadora — es el mismo estado con otro rótulo.
    expect(campo('Cuánto nos saldría traerlo')?.value).toBe('6000')
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
  it('con una parcial de $0 NO manda nada, y dice en qué pestaña está', async () => {
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
