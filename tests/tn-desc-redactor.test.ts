/**
 * El redactor con IA, ejercido entero contra un modelo falso.
 *
 * 🔑 Lo que se prueba acá no es «llama bien a la API»: eso se ve la primera vez que alguien
 * aprieta el botón. Lo que se prueba es
 * **que el formato lo sostiene el validador y no el esquema** — el reintento, lo que se le
 * dice al modelo cuando falla, y qué sale cuando falla las dos veces. Es el camino que en
 * producción cuesta plata, y acá cuesta cero.
 *
 * ⛔ El fake NO es un `mock` del cliente HTTP: `redactar` recibe la función de llamada por
 * parámetro justamente para que el banco corra el MISMO código que producción, no una rama de
 * test. Lo único que queda afuera es la forma de cable, y eso vive entero en el handler —
 * `textoDeRespuesta` y `usoDe`, que se prueban abajo con respuestas de Gemini de verdad.
 */

import { describe, it, expect } from 'vitest'
import {
  ESQUEMA,
  INTENTOS,
  MODELOS,
  MODELO_POR_DEFECTO,
  SISTEMA,
  armarPedido,
  costoDe,
  esModelo,
  interpretar,
  precioDe,
  redactar,
} from '../lib/tn-desc/redactor.core.js'
import { MAX_PARRAFO, PRIMEROS } from '../lib/tn-desc/formato'
import { bajarFoto, textoDeRespuesta, usoDe } from '../api/_tn-desc-ia.js'

const CTX = {
  marca: 'Zattia',
  nombre: 'BLUSA MIRA',
  insumo: 'gasa, botones nacarados',
  variantes: ['blanco', 'negro', 'S', 'M', 'L'],
  categorias: ['NEW IN', 'Blusas'],
  prosaActual: '',
  imagen: 'https://acdn-us.mitiendanube.com/stores/004/445/369/products/mira-1024-1024.jpg',
  // Los bullets ya compuestos por la ficha: el modelo NO los escribe, los recibe para no
  // repetirlos. Los compone `lib/tn-desc/atributos.core.js`.
  bullets: [
    { etiqueta: 'Tela', texto: 'gasa' },
    { etiqueta: 'Calce', texto: 'holgado' },
  ],
}

const BUENO = {
  parrafo: 'Blusa liviana que se pone con jean de día o con sastrero a la noche.',
}

type Pedido = { system: string; texto: string; imagen: string | null }

/** Un modelo falso que contesta la cola de respuestas que se le da, y anota qué le pidieron. */
function modeloFalso(respuestas: unknown[]) {
  const pedidos: Pedido[] = []
  const llamar = async (pedido: Pedido) => {
    pedidos.push(pedido)
    const r = respuestas.shift()
    if (r instanceof Error) throw r
    return { texto: typeof r === 'string' ? r : JSON.stringify(r), uso: USO }
  }
  return { llamar, pedidos }
}

const USO = { entrada: 1000, salida: 100, pensado: 0, cacheLeido: 0 }

const textoDe = (p: Pedido) => p.texto

describe('el pedido que se arma', () => {
  it('le dice al modelo qué variantes NO puede nombrar, no sólo se las rechaza después', () => {
    // Si esto sólo viviera en el validador, cada color nombrado costaría un reintento.
    const t = textoDe(armarPedido(CTX))
    expect(t).toContain('blanco')
    expect(t).toContain('NO se pueden nombrar')
  })

  it('la foto viaja aparte del texto, sin forma de proveedor: el pedido es {system, texto, imagen}', () => {
    // 🔑 Si la forma de cable volviera a meterse acá, cambiar de proveedor dejaría de ser un
    // archivo. Ya pasó una vez: el pedido salía con bloques de Anthropic adentro del núcleo.
    const p = armarPedido(CTX)
    expect(p.imagen).toBe(CTX.imagen)
    expect(Object.keys(p).sort()).toEqual(['imagen', 'system', 'texto'])
  })

  it('sin foto manda `null`, no una URL vacía que el handler mandaría igual', () => {
    expect(armarPedido({ ...CTX, imagen: null }).imagen).toBeNull()
  })

  it('sin insumo lo dice, en vez de mandar el campo en blanco', () => {
    // Un campo vacío se lee como «no hay dato»; también se lee como «se olvidaron de
    // mandarlo». El modelo tiene que saber que la tela NO está disponible.
    expect(textoDe(armarPedido({ ...CTX, insumo: '' }))).toContain('(no cargaron ninguno)')
  })

  it('manda la prosa que la ficha dice hoy: en 163 de los 237 cortos ahí está la tela', () => {
    const t = textoDe(armarPedido({ ...CTX, insumo: '', prosaActual: 'Buzo de morley con capucha' }))
    expect(t).toContain('Buzo de morley con capucha')
  })

  it('en el primer intento no habla de problemas anteriores', () => {
    expect(textoDe(armarPedido(CTX))).not.toContain('rechazó')
  })

  it('en el reintento le pasa los problemas TODOS juntos', () => {
    const t = textoDe(
      armarPedido(CTX, [
        { campo: 'parrafo', motivo: 'tiene 245 caracteres y el máximo es 220' },
        { campo: 'texto', motivo: 'nombra «blanco»' },
      ]),
    )
    expect(t).toContain('tiene 245 caracteres')
    expect(t).toContain('nombra «blanco»')
  })
})

describe('el sistema dice las reglas que el esquema no puede', () => {
  it('nombra el largo, que el JSON Schema no soporta (`maxLength`)', () => {
    expect(SISTEMA).toContain(String(MAX_PARRAFO))
  })

  it('nombra las dos reglas nuevas: el arranque y la repetición', () => {
    expect(SISTEMA).toContain(String(PRIMEROS))
    expect(SISTEMA).toContain('«Este»')
    expect(SISTEMA).toContain('No repitas')
  })

  it('🆕 le dice de qué SÍ hablar, y le prohíbe el relleno (4-sep-2026)', () => {
    // El prompt viejo sólo decía qué NO repetir, y el modelo contestaba con adjetivos: «aporta
    // volumen», «estructura relajada» —que es el `wide leg` del bullet dicho con otras palabras—.
    // Medido sobre JEAN MARINA, la primera corrida real de la tanda del 2-sep.
    expect(SISTEMA).toContain('la foto sí muestra')
    expect(SISTEMA).toContain('relleno')
    expect(SISTEMA).toContain('escribí menos')
    // Y que un párrafo corto es una salida válida: el mínimo de largo es lo que empuja al relleno.
    expect(SISTEMA).toContain('una sola oración')
  })

  it('🆕 y le prohíbe el vocabulario de revista (4-sep-2026)', () => {
    // Lo cazó Bruno leyendo el primer tip: «usala con un bralette al tono debajo». La palabra no se
    // usa en un local de ropa, y el catálogo tiene las suyas.
    expect(SISTEMA).toContain('bralette')
    expect(SISTEMA).toContain('como habla la clienta')
  })

  it('🔑 el esquema pide el párrafo y el tip, y nada más: los bullets ya no los escribe el modelo', () => {
    // El tip entró el 4-sep-2026 (decisión de Bruno). Los bullets siguen afuera: los compone la
    // ficha. Que esta lista sea corta ES la tanda del 27-ago — si vuelve a crecer, algo volvió a
    // pedirle al modelo lo que ya es dato.
    expect(Object.keys(ESQUEMA.properties)).toEqual(['parrafo', 'tip'])
    expect(ESQUEMA.required).toEqual(['parrafo', 'tip'])
  })

  it('sin `additionalProperties` en ningún nivel: Gemini devuelve 400 y no se redacta nada', () => {
    const json = JSON.stringify(ESQUEMA)
    expect(json).not.toContain('additionalProperties')
  })
})

describe('redactar', () => {
  it('el borrador bueno sale en un solo intento', async () => {
    const { llamar } = modeloFalso([BUENO])
    const r = await redactar(CTX, llamar)
    expect(r.error).toBeNull()
    expect(r.problemas).toEqual([])
    expect(r.intentos).toBe(1)
    expect(r.borrador).toEqual({ ...BUENO, tip: '' })
  })

  it('un borrador que nombra un color se rechaza y el segundo intento sale', async () => {
    // 🔴 El caso real: TOP EMBER prometía «beige, negro y blanco» y las variantes eran dos.
    const conColor = { ...BUENO, parrafo: 'Una blusa de gasa en blanco que cae sola.' }
    const { llamar, pedidos } = modeloFalso([conColor, BUENO])
    const r = await redactar(CTX, llamar)
    expect(r.intentos).toBe(2)
    expect(r.problemas).toEqual([])
    expect(r.borrador).toEqual({ ...BUENO, tip: '' })
    // Y el segundo pedido le explicó por qué, con el color adentro.
    expect(textoDe(pedidos[1])).toContain('blanco')
  })

  it('el uso se SUMA entre intentos: dos llamadas cuestan dos llamadas', async () => {
    // Si el reintento pisara el uso en vez de sumarlo, la pantalla mostraría la mitad del
    // costo real justo en los productos que salen caros.
    const { llamar } = modeloFalso([{ ...BUENO, parrafo: 'x'.repeat(300) }, BUENO])
    const r = await redactar(CTX, llamar)
    expect(r.uso.entrada).toBe(2000)
    expect(r.uso.salida).toBe(200)
    expect(r.uso.pensado).toBe(0)
  })

  it('si falla las dos veces devuelve el borrador CON sus problemas, sin tirarlo', async () => {
    // Tirarlo obliga a pagar otra llamada por algo que se arregla a mano en diez segundos.
    const largo = { ...BUENO, parrafo: 'x'.repeat(300) }
    const { llamar } = modeloFalso([largo, largo])
    const r = await redactar(CTX, llamar)
    expect(r.intentos).toBe(INTENTOS)
    expect(r.error).toBeNull()
    expect(r.borrador).toEqual({ ...largo, tip: '' })
    expect(r.problemas.map((p: { campo: string }) => p.campo)).toContain('parrafo')
  })

  it('🔑 la tela ya NO se puede inventar: no es una regla, es que el modelo no la escribe', async () => {
    // Antes esto era el rechazo más caro del validador — una foto de estudio no distingue gasa
    // de voile, y una tela mal puesta es una devolución. Hoy la tela sale de la ficha, elegida
    // de una lista cerrada por alguien que tiene la prenda en la mano. No hay nada que rechazar.
    const conTela = { parrafo: 'Blusa de voile de seda que cae sola y se pone con jean.' }
    const { llamar } = modeloFalso([conTela, conTela])
    const r = await redactar({ ...CTX, insumo: '', bullets: [{ etiqueta: 'Tela', texto: 'gasa' }] }, llamar)
    // Lo que sí se rechaza es que el párrafo repita lo que el bullet ya dice.
    expect(r.problemas.map((p: { motivo: string }) => p.motivo).join(' ')).not.toContain('tela')
    expect(r.borrador).toEqual({ ...conTela, tip: '' })
  })

  it('🆕 el párrafo que repite lo que dice un bullet se rechaza y se reintenta', async () => {
    const repetido = { parrafo: 'Blusa de gasa liviana, se pone con jean de día.' }
    const { llamar, pedidos } = modeloFalso([repetido, BUENO])
    const r = await redactar(CTX, llamar)
    expect(r.intentos).toBe(2)
    expect(r.problemas).toEqual([])
    // Y el reintento le dijo exactamente qué repitió.
    expect(pedidos[1].texto).toContain('repite lo que ya dicen los bullets')
  })

  it('🆕 el párrafo que arranca con «Este» se rechaza', async () => {
    const demostrativo = { parrafo: 'Esta blusa se pone con jean de día o con sastrero a la noche.' }
    const { llamar } = modeloFalso([demostrativo, demostrativo])
    const r = await redactar(CTX, llamar)
    expect(r.problemas.map((p: { motivo: string }) => p.motivo).join(' ')).toContain('arranca con «esta»')
  })

  it('una respuesta que no es JSON sale con un error legible, no con un borrador vacío', async () => {
    const { llamar } = modeloFalso(['Claro, acá va la descripción:'])
    const r = await redactar(CTX, llamar)
    expect(r.error).toBe('el modelo no devolvió JSON')
    expect(r.borrador).toBeNull()
  })

  it('si la API tira, el error llega a la pantalla y no se traga', async () => {
    const { llamar } = modeloFalso([new Error('la API contestó 401: API key not valid')])
    const r = await redactar(CTX, llamar)
    expect(r.error).toContain('401')
  })

  it('un error en el REINTENTO no borra lo que ya se había conseguido', async () => {
    const conColor = { ...BUENO, parrafo: 'Una blusa de gasa en blanco que cae sola.' }
    const { llamar } = modeloFalso([conColor, new Error('la API contestó 503: overloaded')])
    const r = await redactar(CTX, llamar)
    expect(r.error).toContain('503')
    expect(r.borrador).toEqual({ ...conColor, tip: '' })
    expect(r.uso.entrada).toBe(1000) // la que sí ocurrió
  })
})

describe('interpretar', () => {
  it('lee el párrafo y nada más: los bullets que mande el modelo se ignoran', () => {
    const r = interpretar('{"parrafo":"hola","bullets":[{"etiqueta":"Tela"}]}')
    expect(r.borrador).toEqual({ parrafo: 'hola', tip: '' })
  })

  it('un array pelado no es un borrador', () => {
    expect(interpretar('[]')).toEqual({ error: 'el modelo no devolvió un objeto' })
  })

  it('sin párrafo es un error, no un texto vacío', () => {
    expect(interpretar('{"bullets":[]}')).toEqual({ error: 'la respuesta no trae un párrafo' })
  })
})

describe('el costo, que es el número con el que se elige el modelo', () => {
  it('Flash 3.7: 1.000 de entrada y 100 de salida son US$0,0011 con el precio promocional', () => {
    expect(costoDe(USO, 'gemini-3.7-flash', '2026-08-24')).toBeCloseTo(0.001125, 6)
  })

  it('los Gemini 3 cobran la promo hasta el 31-dic-2026 y el doble el 1-ene-2027', () => {
    // 🔑 Las dos puntas: un test de un solo lado del corte no defiende la fecha. Y acá el
    // corte no es un detalle: el precio se DUPLICA de un día para el otro.
    expect(precioDe('gemini-3.7-flash', '2026-12-31')).toEqual({ entrada: 0.75, salida: 3.75 })
    expect(precioDe('gemini-3.7-flash', '2027-01-01')).toEqual({ entrada: 1.5, salida: 7.5 })
  })

  it('Flash Lite no tiene promo: el mismo precio antes y después del corte', () => {
    expect(precioDe('gemini-3.1-flash-lite', '2026-08-24')).toEqual(
      precioDe('gemini-3.1-flash-lite', '2027-01-01'),
    )
  })

  it('los tokens de PENSAR se cobran como salida: si no, el número miente para abajo', () => {
    // 🔴 Es el lado que importa. Un costo por debajo del real es el que empuja la decisión de
    // 370 productos hacia el modelo equivocado.
    const pensando = { ...USO, pensado: 50 }
    expect(costoDe(pensando, 'gemini-3.7-flash', '2026-08-24')).toBeCloseTo(0.0013125, 7)
  })

  it('lo cacheado NO se suma aparte: en Gemini ya viene adentro de la entrada', () => {
    // Sumarlo lo cobraría dos veces, y justo en los productos que salieron baratos.
    const soloCache = { entrada: 0, salida: 0, pensado: 0, cacheLeido: 1_000_000 }
    expect(costoDe(soloCache, 'gemini-3.7-flash', '2026-08-24')).toBe(0)
  })
})

describe('el modelo se elige de la lista', () => {
  it('🔑 el default es el MÁS BARATO (decisión de Bruno, 27-ago-2026)', () => {
    // El catálogo entero sale US$0,31 contra US$1,16 de Flash 3.7 — y es el único de los tres
    // sin precio promocional, así que en enero la diferencia se agranda en vez de achicarse.
    expect(MODELO_POR_DEFECTO).toBe('gemini-3.1-flash-lite')
    expect(MODELOS[MODELO_POR_DEFECTO]).toBeTruthy()
  })

  it('un modelo que no está en la lista no pasa', () => {
    expect(esModelo('gemini-3.7-pro')).toBe(false)
    expect(esModelo('claude-haiku-4-5')).toBe(false)
    expect(esModelo('')).toBe(false)
    expect(esModelo(undefined)).toBe(false)
  })

  it('los tres piensan IGUAL: si no, la comparación no es entre modelos sino entre configuraciones', () => {
    // Los tokens de pensar se facturan como salida. Dejar uno en el default y bajarle el
    // nivel a otro compara dos cosas distintas y el costo lo esconde.
    const niveles = Object.values(MODELOS).map((m) => m.pensar)
    expect(new Set(niveles).size).toBe(1)
  })
})

/**
 * La forma de cable. Es lo único que quedó afuera del núcleo, así que se prueba acá con
 * respuestas armadas como las devuelve Gemini.
 */
describe('leer la respuesta de Gemini', () => {
  it('junta TODOS los pedazos de texto: uno leído a medias entra como JSON roto', () => {
    const j = {
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"parrafo":"ho' }, { type: 'text', text: 'la"}' }] }],
    }
    expect(textoDeRespuesta(j)).toBe('{"parrafo":"hola"}')
  })

  it('ignora los pasos que no son del modelo, como el razonamiento', () => {
    const j = {
      status: 'completed',
      steps: [
        { type: 'thinking', content: [{ type: 'text', text: 'a ver…' }] },
        { type: 'model_output', content: [{ type: 'text', text: '{}' }] },
      ],
    }
    expect(textoDeRespuesta(j)).toBe('{}')
  })

  it('una respuesta sin pasos devuelve vacío en vez de romper', () => {
    expect(textoDeRespuesta({})).toBe('')
  })
})

describe('el uso que informa Gemini', () => {
  it('si los de pensar YA están adentro de la salida, no se cobran de nuevo', () => {
    // 1000 + 140 = 1140 = el total ⇒ los 40 de pensar están adentro de los 140.
    const u = usoDe({ usage: { total_input_tokens: 1000, total_output_tokens: 140, total_thought_tokens: 40, total_tokens: 1140 } })
    expect(u).toEqual({ entrada: 1000, salida: 140, pensado: 0, cacheLeido: 0 })
  })

  it('si van aparte, se cobran aparte', () => {
    // 1000 + 100 = 1100 ≠ 1140 ⇒ los 40 no estaban contados.
    const u = usoDe({ usage: { total_input_tokens: 1000, total_output_tokens: 100, total_thought_tokens: 40, total_tokens: 1140 } })
    expect(u.pensado).toBe(40)
  })

  it('sin total no se adivina para abajo: se cobran', () => {
    // 🔑 La doc no dice cuál de las dos formas es. Cuando no se puede saber, se cobra de más.
    const u = usoDe({ usage: { total_input_tokens: 1000, total_output_tokens: 100, total_thought_tokens: 40 } })
    expect(u.pensado).toBe(40)
  })

  it('una respuesta sin `usage` es cero, no NaN en la pantalla', () => {
    expect(usoDe({})).toEqual({ entrada: 0, salida: 0, pensado: 0, cacheLeido: 0 })
  })
})

/**
 * Bajar la foto es código nuevo del 24-ago-2026, y existe por algo medido: Gemini **no** va a
 * buscar la URL por nosotros — el mismo pedido con la foto por `uri` contesta 429 y con los
 * bytes adentro contesta 200.
 */
describe('bajar la foto del producto', () => {
  const respuesta = (init: { ok?: boolean; status?: number; tipo?: string; bytes?: Uint8Array }) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: (k: string) => (k === 'content-type' ? init.tipo ?? 'image/webp' : null) },
    arrayBuffer: async () => (init.bytes ?? new Uint8Array([1, 2, 3])).buffer,
  })

  it('devuelve los bytes en base64 con su tipo', async () => {
    const f = await bajarFoto('https://acdn-us.mitiendanube.com/x.webp', async () => respuesta({}))
    expect(f).toEqual({ data: Buffer.from([1, 2, 3]).toString('base64'), mime_type: 'image/webp' })
  })

  it('el content-type del CDN le gana a la extensión del archivo', async () => {
    // Un `.jpg` que en realidad es webp pasa seguido, y el mime_type equivocado lo rechaza Google.
    const f = await bajarFoto('https://acdn-us.mitiendanube.com/x.jpg', async () => respuesta({ tipo: 'image/webp' }))
    expect(f.mime_type).toBe('image/webp')
  })

  it('si el CDN no lo tiene, el error dice qué contestó y no «no se pudo redactar»', async () => {
    await expect(
      bajarFoto('https://acdn-us.mitiendanube.com/x.webp', async () => respuesta({ ok: false, status: 404 })),
    ).rejects.toThrow('404')
  })

  it('una foto vacía se corta acá: ⛔ nunca se redacta sin foto', async () => {
    // Los 41 mudos no tienen ni insumo ni prosa previa. Sin foto, el modelo escribiría a partir
    // del nombre y nada más — que es justo lo que esta sección existe para no hacer.
    await expect(
      bajarFoto('https://acdn-us.mitiendanube.com/x.webp', async () => respuesta({ bytes: new Uint8Array(0) })),
    ).rejects.toThrow('vacía')
  })

  it('si la red se cae, el error llega entero y no como un 500 pelado', async () => {
    await expect(
      bajarFoto('https://acdn-us.mitiendanube.com/x.webp', async () => {
        throw new Error('ECONNRESET')
      }),
    ).rejects.toThrow('ECONNRESET')
  })
})
