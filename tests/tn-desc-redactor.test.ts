/**
 * El redactor con IA, ejercido entero contra un modelo falso.
 *
 * 🔑 Lo que se prueba acá no es «llama bien a la API»: eso lo sabe el SDK. Lo que se prueba es
 * **que el formato lo sostiene el validador y no el esquema** — el reintento, lo que se le
 * dice al modelo cuando falla, y qué sale cuando falla las dos veces. Es el camino que en
 * producción cuesta plata, y acá cuesta cero.
 *
 * ⛔ El fake NO es un `mock` del SDK: `redactar` recibe la función de llamada por parámetro
 * justamente para que el banco corra el MISMO código que producción, no una rama de test.
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
import { ETIQUETAS, MAX_PARRAFO } from '../lib/tn-desc/formato'

const CTX = {
  marca: 'Zattia',
  nombre: 'BLUSA MIRA',
  insumo: 'gasa, botones nacarados',
  variantes: ['blanco', 'negro', 'S', 'M', 'L'],
  categorias: ['NEW IN', 'Blusas'],
  prosaActual: '',
  imagen: 'https://acdn-us.mitiendanube.com/stores/004/445/369/products/mira-1024-1024.jpg',
}

const BUENO = {
  parrafo: 'Una blusa liviana que cae sola y se pone con jean de día o con sastrero a la noche.',
  bullets: [
    { etiqueta: 'Tela', texto: 'gasa liviana con caída' },
    { etiqueta: 'Calce', texto: 'holgado, sin marcar' },
    { etiqueta: 'Detalle', texto: 'botones nacarados al frente' },
  ],
}

/** Un modelo falso que contesta la cola de respuestas que se le da, y anota qué le pidieron. */
function modeloFalso(respuestas: unknown[]) {
  const pedidos: { system: string; contenido: { type: string; text?: string }[] }[] = []
  const llamar = async (pedido: { system: string; contenido: { type: string; text?: string }[] }) => {
    pedidos.push(pedido)
    const r = respuestas.shift()
    if (r instanceof Error) throw r
    return { texto: typeof r === 'string' ? r : JSON.stringify(r), uso: USO }
  }
  return { llamar, pedidos }
}

const USO = { entrada: 1000, salida: 100, cacheLeido: 0, cacheEscrito: 0 }

/** El texto del pedido (el bloque de imagen no tiene `text`). */
const textoDe = (p: { contenido: { type: string; text?: string }[] }) =>
  p.contenido.filter((c) => c.type === 'text').map((c) => c.text).join('\n')

describe('el pedido que se arma', () => {
  it('le dice al modelo qué variantes NO puede nombrar, no sólo se las rechaza después', () => {
    // Si esto sólo viviera en el validador, cada color nombrado costaría un reintento.
    const t = textoDe(armarPedido(CTX))
    expect(t).toContain('blanco')
    expect(t).toContain('NO se pueden nombrar')
  })

  it('manda la foto como bloque de imagen por URL, antes del texto', () => {
    const p = armarPedido(CTX)
    expect(p.contenido[0]).toEqual({ type: 'image', source: { type: 'url', url: CTX.imagen } })
  })

  it('sin foto no manda un bloque de imagen vacío', () => {
    const p = armarPedido({ ...CTX, imagen: null })
    expect(p.contenido.every((c) => c.type === 'text')).toBe(true)
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
  it('nombra los tres límites que el JSON Schema no soporta', () => {
    expect(SISTEMA).toContain(String(MAX_PARRAFO))
    expect(SISTEMA).toContain('entre 3 y 4')
    expect(SISTEMA).toContain('sin punto final')
  })

  it('el esquema fija la lista cerrada de etiquetas, que sí puede', () => {
    expect(ESQUEMA.properties.bullets.items.properties.etiqueta.enum).toEqual([...ETIQUETAS])
  })
})

describe('redactar', () => {
  it('el borrador bueno sale en un solo intento', async () => {
    const { llamar } = modeloFalso([BUENO])
    const r = await redactar(CTX, llamar)
    expect(r.error).toBeNull()
    expect(r.problemas).toEqual([])
    expect(r.intentos).toBe(1)
    expect(r.borrador).toEqual(BUENO)
  })

  it('un borrador que nombra un color se rechaza y el segundo intento sale', async () => {
    // 🔴 El caso real: TOP EMBER prometía «beige, negro y blanco» y las variantes eran dos.
    const conColor = { ...BUENO, parrafo: 'Una blusa de gasa en blanco que cae sola.' }
    const { llamar, pedidos } = modeloFalso([conColor, BUENO])
    const r = await redactar(CTX, llamar)
    expect(r.intentos).toBe(2)
    expect(r.problemas).toEqual([])
    expect(r.borrador).toEqual(BUENO)
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
  })

  it('si falla las dos veces devuelve el borrador CON sus problemas, sin tirarlo', async () => {
    // Tirarlo obliga a pagar otra llamada por algo que se arregla a mano en diez segundos.
    const largo = { ...BUENO, parrafo: 'x'.repeat(300) }
    const { llamar } = modeloFalso([largo, largo])
    const r = await redactar(CTX, llamar)
    expect(r.intentos).toBe(INTENTOS)
    expect(r.error).toBeNull()
    expect(r.borrador).toEqual(largo)
    expect(r.problemas.map((p: { campo: string }) => p.campo)).toContain('parrafo')
  })

  it('una tela que no está en el insumo ni en el nombre se rechaza', async () => {
    // Una foto de estudio no distingue gasa de voile, y la tela mal puesta es una devolución.
    const inventada = {
      ...BUENO,
      bullets: [{ etiqueta: 'Tela', texto: 'voile de seda' }, ...BUENO.bullets.slice(1)],
    }
    const { llamar } = modeloFalso([inventada, inventada])
    const r = await redactar({ ...CTX, insumo: '' }, llamar)
    expect(r.problemas.map((p: { campo: string }) => p.campo)).toContain('bullet Tela')
  })

  it('una respuesta que no es JSON sale con un error legible, no con un borrador vacío', async () => {
    const { llamar } = modeloFalso(['Claro, acá va la descripción:'])
    const r = await redactar(CTX, llamar)
    expect(r.error).toBe('el modelo no devolvió JSON')
    expect(r.borrador).toBeNull()
  })

  it('si la API tira, el error del SDK llega a la pantalla y no se traga', async () => {
    const { llamar } = modeloFalso([new Error('401 authentication_error')])
    const r = await redactar(CTX, llamar)
    expect(r.error).toContain('401')
  })

  it('un error en el REINTENTO no borra lo que ya se había conseguido', async () => {
    const conColor = { ...BUENO, parrafo: 'Una blusa de gasa en blanco que cae sola.' }
    const { llamar } = modeloFalso([conColor, new Error('529 overloaded')])
    const r = await redactar(CTX, llamar)
    expect(r.error).toContain('529')
    expect(r.borrador).toEqual(conColor)
    expect(r.uso.entrada).toBe(1000) // la que sí ocurrió
  })
})

describe('interpretar', () => {
  it('rellena un bullet incompleto en vez de romper', () => {
    const r = interpretar('{"parrafo":"hola","bullets":[{"etiqueta":"Tela"}]}')
    expect(r.borrador?.bullets[0]).toEqual({ etiqueta: 'Tela', texto: '' })
  })

  it('un array pelado no es un borrador', () => {
    expect(interpretar('[]')).toEqual({ error: 'el modelo no devolvió un objeto' })
  })

  it('sin bullets es un error, no una lista vacía', () => {
    expect(interpretar('{"parrafo":"hola"}')).toEqual({ error: 'la respuesta no trae una lista de bullets' })
  })
})

describe('el costo, que es el número con el que se elige el modelo', () => {
  it('Haiku: 1.000 de entrada y 100 de salida son US$0,0015', () => {
    expect(costoDe(USO, 'claude-haiku-4-5', '2026-08-19')).toBeCloseTo(0.0015, 6)
  })

  it('Sonnet cobra el precio de intro hasta el 31-ago y el de lista el 1-sep', () => {
    // 🔑 Las dos puntas: un test de un solo lado del corte no defiende la fecha.
    expect(precioDe('claude-sonnet-5', '2026-08-31')).toEqual({ entrada: 2, salida: 10 })
    expect(precioDe('claude-sonnet-5', '2026-09-01')).toEqual({ entrada: 3, salida: 15 })
  })

  it('Haiku no tiene intro: el mismo precio antes y después', () => {
    expect(precioDe('claude-haiku-4-5', '2026-08-19')).toEqual(precioDe('claude-haiku-4-5', '2027-01-01'))
  })

  it('lo leído del caché cuesta un décimo de la entrada', () => {
    const soloCache = { entrada: 0, salida: 0, cacheLeido: 1_000_000, cacheEscrito: 0 }
    expect(costoDe(soloCache, 'claude-haiku-4-5', '2026-08-19')).toBeCloseTo(0.1, 6)
  })
})

describe('el modelo se elige de la lista', () => {
  it('el default es Haiku: es el que eligió Bruno para arrancar y medir', () => {
    expect(MODELO_POR_DEFECTO).toBe('claude-haiku-4-5')
    expect(MODELOS[MODELO_POR_DEFECTO]).toBeTruthy()
  })

  it('un modelo que no está en la lista no pasa', () => {
    expect(esModelo('claude-opus-5')).toBe(false)
    expect(esModelo('')).toBe(false)
    expect(esModelo(undefined)).toBe(false)
  })

  it('Haiku 4.5 NO lleva effort: la API lo rechaza con 400', () => {
    expect(MODELOS['claude-haiku-4-5'].effort).toBeNull()
    expect(MODELOS['claude-sonnet-5'].effort).toBe('low')
  })
})
