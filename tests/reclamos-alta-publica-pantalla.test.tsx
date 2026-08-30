// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AltaPublica } from '@/components/reclamos/AltaPublica'
import { ReclamoPublico } from '@/components/reclamos/ReclamoPublico'
import { OPCIONES_PUBLICAS, TIENDAS_DEL_ALTA } from '@/lib/reclamos/alta-publica.core.js'

/**
 * **La pantalla del alta pública, montada de verdad.**
 *
 * 🔑 **Se MONTA y ⛔ no se lee el fuente**: los pasos existen recién después de que la persona toca,
 * y `renderToStaticMarkup` —el oráculo del resto de las pantallas— ⛔ no corre efectos ni eventos.
 * Mismo patrón que `tests/reclamo-publico-galeria.test.tsx`.
 *
 * 🔴 **Lo que se fija acá es lo que la vuelve segura**, y ⛔ no que se vea linda:
 *
 * 1. **Al alta viajan ÍNDICES, ⛔ no productos.** Si viajaran los productos, verificar el mail ⛔ no
 *    serviría de nada: cualquiera postearía el reclamo de un artículo que nunca compró. El índice
 *    sólo puede señalar algo que ya está en la orden que contestó el otro servidor.
 * 2. **El mail va en el BODY**, ⛔ nunca en la query string —que queda en el log de acceso, en el
 *    historial del navegador y en el `Referer` de lo que la página cargue después—.
 * 3. **Un «no» ⛔ no explica por qué.** Las razones por las que un pedido no aparece se ven
 *    idénticas; distinguirlas convierte esto en un oráculo de «¿existe la orden N?» sobre una
 *    numeración correlativa.
 */

/** La orden recortada, tal como la contesta `bdi-catalogo`: qué compró y ⛔ ni un monto. */
const ORDEN = {
  number: 21033,
  cliente: 'Victoria Gómez',
  products: [
    { product_id: 111, variant_id: 222, name: 'Funda Girlhood', sku: 'GH-01', quantity: 1 },
    { product_id: 333, variant_id: 444, name: 'Funda Stellar', sku: 'ST-02', quantity: 2 },
  ],
}

type Llamada = { url: string; init: RequestInit }
const llamadas: Llamada[] = []
/** Qué contesta cada punta. `codigo` va aparte del cuerpo a propósito: ver el test del 404 lindo. */
let respuestaOrden: { codigo: number; cuerpo: unknown } = { codigo: 200, cuerpo: { ok: true, orden: ORDEN } }
let respuestaAlta: { codigo: number; cuerpo: unknown } = { codigo: 200, cuerpo: { ok: true, token: 'f'.repeat(64) } }

const creados: string[] = []

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), init })
    const esAlta = String(url).startsWith('/api/')
    const r = esAlta ? respuestaAlta : respuestaOrden
    return { ok: r.codigo >= 200 && r.codigo < 300, status: r.codigo, json: async () => r.cuerpo } as unknown as Response
  }))
}

async function abrir(tienda: string | null = 'bdi') {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(<AltaPublica tienda={tienda} onCreado={(t) => { creados.push(t) }} />)
  })
}

const botones = () => [...document.querySelectorAll('button')]
const botonQueDice = (re: RegExp) => botones().find((b) => re.test(b.textContent || ''))
const texto = () => document.body.textContent || ''

/** Escribe en un input controlado por React (hay que disparar el evento nativo). */
async function tipear(id: string, valor: string) {
  const input = document.getElementById(id) as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Los tres toques hasta la lista de productos: la tienda ya viene en el link. */
async function hastaLosProductos(tienda: string | null = 'bdi') {
  await abrir(tienda)
  await tipear('alta-orden', '21033')
  await tipear('alta-mail', 'victoria@gmail.com')
  await act(async () => { botonQueDice(/Buscar mi pedido/)!.click() })
}

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  llamadas.length = 0
  creados.length = 0
  respuestaOrden = { codigo: 200, cuerpo: { ok: true, orden: ORDEN } }
  respuestaAlta = { codigo: 200, cuerpo: { ok: true, token: 'f'.repeat(64) } }
  stubFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('⓪ de qué tienda es', () => {
  it('con la marca en el link ⛔ no se le pregunta nada', async () => {
    await abrir('bdi')
    expect(document.getElementById('alta-orden')).not.toBeNull()
  })

  it('sin marca en el link se pregunta, en vez de suponer una', async () => {
    // Suponer BDI le contestaría «no encontramos ese pedido» a todo Zattia, que es un «no» que ⛔
    // no se puede distinguir de la llave equivocada.
    await abrir(null)
    expect(document.getElementById('alta-orden')).toBeNull()
    for (const t of TIENDAS_DEL_ALTA) expect(botonQueDice(new RegExp(t.label))).toBeTruthy()
  })

  it('una marca que ⛔ no es del alta se trata como si no hubiera venido ninguna', async () => {
    // `?m=stunned` ⛔ no abre una puerta que el servidor va a rechazar con 400: pregunta.
    await abrir('stunned')
    expect(document.getElementById('alta-orden')).toBeNull()
  })

  it('elegir la tienda lleva al pedido', async () => {
    await abrir(null)
    await act(async () => { botonQueDice(/Zattia/)!.click() })
    expect(document.getElementById('alta-orden')).not.toBeNull()
  })
})

describe('① la llave: el pedido y el mail', () => {
  it('🔴 el mail va en el BODY y ⛔ no en la URL', async () => {
    await hastaLosProductos()
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].init.method).toBe('POST')
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({ mail: 'victoria@gmail.com' })
    expect(llamadas[0].url).not.toContain('victoria')
    expect(llamadas[0].url).not.toContain('mail')
  })

  it('la tienda del link viaja en la consulta', async () => {
    await hastaLosProductos('zattia')
    expect(llamadas[0].url).toContain('store=zattia')
    expect(llamadas[0].url).toContain('orden=21033')
  })

  it('sin los dos datos bien formados el botón ⛔ no se puede apretar', async () => {
    await abrir('bdi')
    await tipear('alta-orden', '21033')
    expect((botonQueDice(/Buscar mi pedido/) as HTMLButtonElement).disabled).toBe(true)
    await tipear('alta-mail', 'victoria@gmail.com')
    expect((botonQueDice(/Buscar mi pedido/) as HTMLButtonElement).disabled).toBe(false)
  })

  it('🔴 un cuerpo que parece bueno con un código que ⛔ no lo es NO abre nada', async () => {
    // El otro repo contesta 400 si el mail va en la URL y 502 si Tienda Nube se cayó, y en los dos
    // casos manda un JSON. Sin mirar el código, un 400 con `{ok:true}` adentro pasaría de largo.
    respuestaOrden = { codigo: 400, cuerpo: { ok: true, orden: ORDEN } }
    await hastaLosProductos()
    expect(texto()).toContain('No encontramos ese pedido con ese mail')
    expect(texto()).not.toContain('Funda Girlhood')
  })

  it('🔴 las dos puertas cerradas dicen exactamente lo MISMO', async () => {
    respuestaOrden = { codigo: 404, cuerpo: { error: 'No encontramos ese pedido con ese mail.' } }
    await hastaLosProductos()
    const noExiste = texto()
    respuestaOrden = { codigo: 200, cuerpo: { ok: true, orden: null } }
    await hastaLosProductos()
    expect(texto()).toBe(noExiste)
  })
})

describe('② el pedido, que ⛔ no se tipea', () => {
  it('saluda por el nombre y muestra el número del pedido', async () => {
    await hastaLosProductos()
    expect(texto()).toContain('Hola Victoria')
    expect(texto()).toContain('#21033')
  })

  it('muestra los productos de la orden', async () => {
    await hastaLosProductos()
    expect(texto()).toContain('Funda Girlhood')
    expect(texto()).toContain('Funda Stellar')
  })

  it('🔴 con DOS productos ⛔ no viene ninguno tildado', async () => {
    // El default sería convertir «no leí la lista» en «el reclamo es por las dos cosas», y eso
    // después se paga o se anula en Gestión Nube. Es la regla `preseleccionDelAlta`, la misma que
    // usa el alta de adentro.
    await hastaLosProductos()
    expect(botones().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0)
    // Y sin nada tocado, todavía ⛔ no hay qué pasó que contestar.
    expect(texto()).not.toContain('¿Qué pasó?')
  })

  it('con UNO viene tildado: ⛔ no hay nada que elegir', async () => {
    respuestaOrden = { codigo: 200, cuerpo: { ok: true, orden: { ...ORDEN, products: [ORDEN.products[0]] } } }
    await hastaLosProductos()
    expect(botones().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(texto()).toContain('¿Qué pasó?')
  })
})

describe('③ qué pasó, y lo que se postea', () => {
  /** Toca el segundo producto y elige una opción. Devuelve el body del alta. */
  async function crearTocando(re: RegExp, indice = 1) {
    await hastaLosProductos()
    await act(async () => { botones().filter((b) => b.hasAttribute('aria-pressed'))[indice].click() })
    await act(async () => { botonQueDice(re)!.click() })
    return JSON.parse(String(llamadas[llamadas.length - 1].init.body))
  }

  it('🔴 lo que viaja son ÍNDICES, ⛔ no productos', async () => {
    const body = await crearTocando(/Me llegó fallado/)
    expect(body.productos).toEqual([1])
    // Ni el nombre, ni el sku, ni los ids: nada de la orden vuelve a subir.
    const crudo = JSON.stringify(body)
    expect(crudo).not.toContain('Funda')
    expect(crudo).not.toContain('ST-02')
    expect(crudo).not.toContain('333')
  })

  it('viaja la opción pública y ⛔ NO un motivo', async () => {
    // El motivo lo decide `motivoDeAlta` del lado de adentro: aceptar uno del body dejaría al
    // cliente elegir `no_llego`, que nace con el reclamo al transportista pendiente.
    const body = await crearTocando(/Me llegó fallado/)
    expect(body.opcion).toBe('fallado')
    expect(body.motivo).toBeUndefined()
    expect(body.accion).toBe('alta')
  })

  it('vuelven a viajar la tienda, la orden y el mail: la llave gira de nuevo adentro', async () => {
    const body = await crearTocando(/Me quedó mal el talle/)
    expect(body.store).toBe('bdi')
    expect(body.orden).toBe('21033')
    expect(body.mail).toBe('victoria@gmail.com')
  })

  it('están las cinco opciones, con el texto del núcleo', async () => {
    await hastaLosProductos()
    await act(async () => { botones().filter((b) => b.hasAttribute('aria-pressed'))[0].click() })
    for (const o of OPCIONES_PUBLICAS) expect(texto()).toContain(o.label)
  })

  it('avisa la foto sólo donde el caso la exige', async () => {
    // Sale de `fotosEnElAlta`, o sea del perfil del motivo: escrito a mano, el día que un caso deje
    // de pedir fotos la pantalla seguiría prometiéndolas.
    await hastaLosProductos()
    await act(async () => { botones().filter((b) => b.hasAttribute('aria-pressed'))[0].click() })
    expect(botonQueDice(/Me llegó fallado/)!.textContent).toContain('Te vamos a pedir una foto')
    expect(botonQueDice(/Me quedó mal el talle/)!.textContent).not.toContain('Te vamos a pedir una foto')
    expect(botonQueDice(/Todavía no me llegó/)!.textContent).not.toContain('Te vamos a pedir una foto')
  })

  it('creado el reclamo, sigue el portal con ESE token', async () => {
    await crearTocando(/Me llegó fallado/)
    expect(creados).toEqual(['f'.repeat(64)])
  })

  it('un error del servidor se dice con lo que contestó, y ⛔ no se sigue de largo', async () => {
    respuestaAlta = { codigo: 429, cuerpo: { error: 'Estamos recibiendo muchos reclamos justo ahora. Probá en un rato.' } }
    await crearTocando(/Me llegó fallado/)
    expect(creados).toEqual([])
    expect(texto()).toContain('Estamos recibiendo muchos reclamos')
  })

  it('🔴 un cuerpo que parece bueno con un código que ⛔ no lo es tampoco crea nada ACÁ', async () => {
    // El mismo modo de falla que en la consulta, y el que dejó vivo un mutante en el servidor: un
    // `{ok:true, token}` con un 500 encima —un deploy a medio subir, un proxy en el medio— dejaría
    // a la persona en un portal con un token que ⛔ no existe, creyendo que cargó el reclamo.
    respuestaAlta = { codigo: 500, cuerpo: { ok: true, token: 'b'.repeat(64) } }
    await crearTocando(/Me llegó fallado/)
    expect(creados).toEqual([])
    expect(texto()).toContain('No encontramos ese pedido con ese mail')
  })

  it('🔴 si YA tenía un reclamo abierto, ⛔ no entra derecho: se lo dice', async () => {
    // El servidor devuelve el token del que ya existe. Entrar derecho al portal sería mostrarle un
    // reclamo con otros productos y otro motivo como si fuera el que acaba de cargar.
    respuestaAlta = { codigo: 200, cuerpo: { ok: true, token: 'a'.repeat(64), yaExistia: true } }
    await crearTocando(/Me llegó fallado/)
    expect(creados).toEqual([])
    expect(texto()).toContain('Ya tenés un reclamo abierto por este pedido')
    await act(async () => { botonQueDice(/Ver mi reclamo/)!.click() })
    expect(creados).toEqual(['a'.repeat(64)])
  })
})

/**
 * 🔑 **El cable de la puerta**, que es lo que ningún test de la pantalla sola alcanza: `/reclamo`
 * **pelado** ⛔ no es un link vencido —es la entrada—, y un token que ⛔ no sirve **sigue** siendo
 * un link vencido. Las dos mitades viven en el mismo `if`, así que se prueban juntas.
 */
describe('la puerta: /reclamo sin token', () => {
  async function abrirLaRuta(token: string | null, tienda: string | null = 'bdi') {
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(<ReclamoPublico token={token} tienda={tienda} />)
    })
  }

  it('🔴 sin token se abre el ALTA, y ⛔ no «este link ya no está disponible»', async () => {
    await abrirLaRuta(null)
    expect(document.getElementById('alta-orden')).not.toBeNull()
    expect(texto()).not.toContain('ya no está disponible')
  })

  it('un token que ⛔ no sirve SIGUE siendo un link vencido', async () => {
    // La mitad que se rompe sola al arreglar la de arriba: si `!token` dejara de marcar el link
    // muerto para todos, un link vencido abriría un alta en blanco y nadie entendería nada.
    respuestaAlta = { codigo: 404, cuerpo: { error: 'no encontrado' } }
    await abrirLaRuta('a'.repeat(64))
    expect(texto()).toContain('ya no está disponible')
    expect(document.getElementById('alta-orden')).toBeNull()
  })

  it('🔴 creado el reclamo, la MISMA pantalla sigue en el portal pidiendo la foto', async () => {
    // Es el ④, y ⛔ no hay navegación en el medio: mandar a la persona a otra URL justo ahí es
    // donde se pierde la mitad de la gente.
    await abrirLaRuta(null)
    await tipear('alta-orden', '21033')
    await tipear('alta-mail', 'victoria@gmail.com')
    await act(async () => { botonQueDice(/Buscar mi pedido/)!.click() })
    await act(async () => { botones().filter((b) => b.hasAttribute('aria-pressed'))[0].click() })
    respuestaAlta = { codigo: 200, cuerpo: { ok: true, token: 'f'.repeat(64) } }
    // El GET del portal contesta el reclamo recién creado.
    const antes = respuestaOrden
    respuestaOrden = antes
    await act(async () => { botonQueDice(/Me llegó fallado/)!.click() })
    // A partir de acá el que contesta es el portal: se le pide el reclamo con el token nuevo.
    const ultima = llamadas[llamadas.length - 1]
    expect(ultima.url).toContain('recurso=reclamo')
    expect(ultima.url).toContain('f'.repeat(64))
  })
})
