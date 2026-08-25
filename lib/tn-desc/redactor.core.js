/**
 * El REDACTOR: de dónde salen `{parrafo, bullets}` cuando no los tipea una persona.
 *
 * 🔑 Es el único lugar de la tanda de IA que tiene reglas. Todo lo demás ya existía y no se
 * tocó: la tabla, la pantalla y `validarBorrador` no se enteran de quién escribió el
 * borrador. Cambiar de modelo —o volver a que lo tipee alguien— no cambia ni una línea de
 * `api/_tn-desc.js`, ni de `bloques.ts`, ni del `sql`.
 *
 * ⛔ Este archivo NO habla con la red: recibe una función `llamar` y la usa. Por eso el banco
 * ejerce el camino entero —incluido el reintento— sin API key y sin gastar un centavo, y por
 * eso un cambio en el prompt se prueba contra el validador de verdad y no contra una copia.
 *
 * 🔴 El reintento no es un adorno. El esquema garantiza la FORMA (que venga un `parrafo` y
 * una lista de `{etiqueta, texto}` con la etiqueta de la lista cerrada) y **el número de
 * bullets**, y nada más: `maxLength` no está soportado, así que «hasta 220 caracteres» no se
 * puede pedir ahí — y «no nombres los colores de ESTE producto» menos todavía. Lo que
 * sostiene el formato es `validarBorrador`, y cuando rechaza, los problemas vuelven al modelo
 * en vez de tirarse el intento.
 *
 * 🔑 Es `.js` plano por lo mismo que `formato.core.js`: lo importa `api/_tn-desc-ia.js`, y un
 * handler de `api/` corre en Node sin pasar por el compilador de Next.
 */

import { ETIQUETAS, MAX_BULLET, MAX_BULLETS, MAX_PARRAFO, MIN_BULLETS, validarBorrador } from './formato.core.js'

/* ------------------------------------------------------------------ modelos */

/**
 * Los modelos que puede elegir la pantalla, con su precio por millón de tokens.
 *
 * 🔑 El precio vive acá, al lado de la llamada, porque lo que decide entre un modelo y otro
 * es el COSTO MEDIDO de la corrida puesto al lado del texto que salió — no una opinión sobre
 * la prosa. La pantalla muestra los tres y Bruno compara.
 *
 * ⚠️ Los Gemini 3.x están con **precio promocional hasta el 31-dic-2026** (después se
 * duplican). Se modela con su fecha en lugar de escribir el número de hoy: el 1-ene-2027 la
 * pantalla tiene que decir la verdad sin que nadie se acuerde de venir a tocar esto.
 *
 * ⚠️ `pensar` (`thinking_level`) va IGUAL en los tres a propósito. Los Gemini 3 razonan por
 * default y **los tokens de pensar se facturan como salida**: dejarlo al default en uno y
 * bajarlo en otro haría que la comparación sea entre dos configuraciones y no entre dos
 * modelos — el mismo error que ya nos costó una vuelta con `effort`.
 *
 * ⚠️ Pro cobra el doble arriba de 200k tokens de prompt. Acá el pedido son ~2k (la foto es
 * casi todo), así que va el tramo de abajo; si algún día se manda el catálogo entero en un
 * pedido, esto miente.
 */
export const MODELOS = {
  'gemini-3.1-flash-lite': {
    nombre: 'Flash Lite',
    lista: { entrada: 0.25, salida: 1.5 },
    intro: null,
    pensar: 'low',
  },
  'gemini-3.7-flash': {
    nombre: 'Flash 3.7',
    lista: { entrada: 1.5, salida: 7.5 },
    intro: { hasta: '2026-12-31', entrada: 0.75, salida: 3.75 },
    pensar: 'low',
  },
  'gemini-3.1-pro-preview': {
    nombre: 'Pro 3.1',
    lista: { entrada: 2, salida: 12 },
    intro: null,
    pensar: 'low',
  },
}

export const MODELO_POR_DEFECTO = 'gemini-3.7-flash'

export function esModelo(x) {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(MODELOS, x)
}

/**
 * El precio vigente en una fecha. `hoy` va en ISO (`2026-08-19`) y **entra por parámetro**:
 * una función que lee el reloj adentro no se puede probar ni el día antes ni el día después
 * del corte, que son justo los dos que importan.
 */
export function precioDe(modelo, hoy) {
  const f = MODELOS[modelo]
  if (f.intro && hoy <= f.intro.hasta) return { entrada: f.intro.entrada, salida: f.intro.salida }
  return f.lista
}

/* --------------------------------------------------------------------- uso */

/**
 * Lo que consumió una llamada.
 *
 * 🔴 `pensado` está separado de `salida` porque **la documentación de Gemini no dice si
 * `total_output_tokens` ya incluye los tokens de pensar o si van aparte** — y las dos
 * lecturas dan costos distintos. No se adivina: el handler concilia contra `total_tokens` y
 * deja acá lo que haya que cobrar de más, nunca de menos. Los dos se facturan al precio de
 * salida.
 *
 * `cacheLeido` va aunque nosotros no pidamos caché: Gemini cachea el prefijo solo, y nuestro
 * system prompt es idéntico en los 370 productos, así que puede aparecer sin que nadie lo
 * haya pedido.
 * @typedef {{entrada:number, salida:number, pensado:number, cacheLeido:number}} Uso
 */

/** @type {Uso} */
export const USO_CERO = { entrada: 0, salida: 0, pensado: 0, cacheLeido: 0 }

export function sumarUso(a, b) {
  return {
    entrada: a.entrada + b.entrada,
    salida: a.salida + b.salida,
    pensado: a.pensado + b.pensado,
    cacheLeido: a.cacheLeido + b.cacheLeido,
  }
}

/**
 * Los dólares de una corrida.
 *
 * ⚠️ `cacheLeido` NO se suma: en Gemini lo cacheado viene **adentro** de los tokens de
 * entrada, así que sumarlo lo cobraría dos veces. Queda a la vista igual porque el día que
 * aparezca explica por qué un producto salió más barato que el de al lado.
 *
 * ⚠️ Y se cobra al precio de entrada lleno, sin el descuento de caché de Google: el descuento
 * exacto no está escrito en la doc del endpoint que usamos, y de los dos errores posibles
 * éste sobreestima unos centavos. El que miente para abajo es el que empuja una decisión de
 * 370 productos hacia el modelo equivocado.
 */
export function costoDe(uso, modelo, hoy) {
  const p = precioDe(modelo, hoy)
  const M = 1_000_000
  return (uso.entrada * p.entrada) / M + ((uso.salida + uso.pensado) * p.salida) / M
}

/* ------------------------------------------------------------------ prompt */

export const SISTEMA = [
  'Escribís descripciones de producto para una tienda de indumentaria femenina de Argentina.',
  'Devolvés un párrafo que vende y de 3 a 4 bullets con los datos duros de la prenda.',
  '',
  'El formato:',
  `- El párrafo: una o dos frases, hasta ${MAX_PARRAFO} caracteres. Contá cómo se usa y cómo queda puesta. No repitas el nombre del producto entero.`,
  `- Los bullets: entre ${MIN_BULLETS} y ${MAX_BULLETS}, hasta ${MAX_BULLET} caracteres cada uno, sin punto final.`,
  `- La etiqueta de cada bullet sale de esta lista y no se repite: ${ETIQUETAS.join(', ')}.`,
  '',
  'Las tres reglas que no se negocian:',
  '- No nombres colores ni talles, ni des medidas en centímetros. Eso lo muestran el selector de variantes y la tabla de talles; si lo escribís en el texto, queda mintiendo el día que se agota un color y nadie lo va a corregir.',
  '- La tela es un dato, no una adivinanza. Poné un bullet «Tela» SÓLO si la tela aparece en el insumo del local o en el nombre del producto. Si no aparece en ninguno de los dos, no hay bullet de Tela: usá otra etiqueta. Una foto no distingue una gasa de un voile, y una tela mal puesta termina en un cambio o una devolución.',
  '- Todo lo que digas tiene que verse en la foto o estar en el insumo. No inventes ocasiones de uso, beneficios ni detalles de confección.',
  '',
  'Castellano de Argentina, sin signos de exclamación y sin frases hechas del tipo «ideal para toda ocasión».',
].join('\n')

/**
 * El esquema de la respuesta.
 *
 * 🔴 Fija la FORMA y el CONTEO, no los largos ni las tres reglas: ésas las sostiene
 * `validarBorrador`, y por eso existe el reintento.
 *
 * 🔑 `minItems`/`maxItems` SÍ entran acá y por eso están puestos: es la única regla de formato
 * que se puede cobrar antes de pagar el reintento. `maxLength` **no está soportado**, así que
 * los 220 caracteres del párrafo siguen siendo del validador.
 *
 * ⚠️ Nada de `additionalProperties`: el esquema de Gemini no lo acepta y el pedido entero
 * vuelve como 400. La forma se sostiene igual con `required`.
 */
export const ESQUEMA = {
  type: 'object',
  properties: {
    parrafo: { type: 'string' },
    bullets: {
      type: 'array',
      minItems: MIN_BULLETS,
      maxItems: MAX_BULLETS,
      items: {
        type: 'object',
        properties: {
          etiqueta: { type: 'string', enum: [...ETIQUETAS] },
          texto: { type: 'string' },
        },
        required: ['etiqueta', 'texto'],
      },
    },
  },
  required: ['parrafo', 'bullets'],
}

const lista = (xs) => (xs || []).filter(Boolean).join(', ')

/**
 * El pedido para UN producto. `problemas` trae lo que rechazó el validador en el intento
 * anterior; en el primero va vacío.
 *
 * 🔑 Las variantes viajan EN EL PROMPT y no sólo en el validador. Si el modelo no sabe que
 * «arena» es un color de este producto lo va a escribir, el validador lo va a rechazar, y se
 * paga un reintento por algo que se podía decir de entrada.
 *
 * 🔑 Y va la prosa que la ficha dice HOY: de los 237 productos cortos, 163 ya nombran una
 * tela ahí. Para ésos el insumo a mano no hace falta, y sin este campo el modelo no tendría
 * de dónde sacarla — la regla de la tela la dejaría sin bullet.
 */
export function armarPedido(ctx, problemas = []) {
  const t = []
  t.push(`Marca: ${ctx.marca}`)
  t.push(`Producto: ${ctx.nombre}`)
  if (ctx.categorias && ctx.categorias.length) t.push(`Categorías: ${lista(ctx.categorias)}`)
  t.push(`Insumo del local: ${(ctx.insumo || '').trim() || '(no cargaron ninguno)'}`)
  t.push(`Lo que dice hoy la ficha: ${(ctx.prosaActual || '').trim() || '(nada)'}`)
  if (ctx.variantes && ctx.variantes.length) {
    t.push(`Valores de variante de este producto, que NO se pueden nombrar: ${lista(ctx.variantes)}`)
  }

  if (problemas.length) {
    t.push('')
    t.push('El borrador anterior lo rechazó el validador por esto:')
    for (const p of problemas) t.push(`- ${p.campo}: ${p.motivo}`)
    t.push('Escribilo de nuevo corrigiendo exactamente eso, sin romper las otras reglas.')
  }

  // 🔑 El pedido sale SIN forma de proveedor: `{system, texto, imagen}` y nada más. La forma
  // de cable —dónde va la foto, cómo se llama el campo del sistema— la arma el handler. Es lo
  // que hace que cambiar de proveedor sean veinte líneas en un archivo y no una recorrida.
  return { system: SISTEMA, texto: t.join('\n'), imagen: ctx.imagen || null }
}

/* ---------------------------------------------------------------- redactar */

/**
 * Lee la respuesta. Structured outputs promete JSON válido con la forma del esquema, pero se
 * chequea igual: un 200 con el cuerpo equivocado entraría como un borrador vacío, y un
 * borrador vacío se lee en la pantalla como «el modelo no supo qué decir» — que es una
 * conclusión distinta y falsa.
 */
export function interpretar(texto) {
  let d
  try {
    d = JSON.parse(texto)
  } catch {
    return { error: 'el modelo no devolvió JSON' }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'el modelo no devolvió un objeto' }
  if (typeof d.parrafo !== 'string') return { error: 'la respuesta no trae un párrafo' }
  if (!Array.isArray(d.bullets)) return { error: 'la respuesta no trae una lista de bullets' }
  const bullets = d.bullets.map((b) => ({
    etiqueta: String((b && b.etiqueta) ?? ''),
    texto: String((b && b.texto) ?? ''),
  }))
  return { borrador: { parrafo: d.parrafo, bullets } }
}

/** Cuántas veces se le pide, contando la primera. Dos: una tercera casi nunca arregla nada. */
export const INTENTOS = 2

/**
 * Pide el borrador y lo valida. Si el validador lo rechaza, se lo devuelve al modelo con la
 * lista de problemas y le pide otro.
 *
 * ⛔ Nunca tira, y **nunca descarta el borrador rechazado**: se devuelve igual, con sus
 * problemas, porque arreglar un párrafo de más en la pantalla lleva diez segundos y tirarlo
 * obliga a pagar otra llamada. El que decide si sale a la tienda es el botón de aprobar, que
 * ya exige `problemas.length === 0`.
 *
 * Devuelve `{borrador, problemas, intentos, uso, error}`.
 */
export async function redactar(ctx, llamar) {
  let uso = USO_CERO
  let problemas = []
  let borrador = null

  for (let intento = 1; intento <= INTENTOS; intento++) {
    let r
    try {
      r = await llamar(armarPedido(ctx, problemas))
    } catch (e) {
      return {
        borrador,
        problemas,
        intentos: intento,
        uso,
        error: e instanceof Error ? e.message : 'no se pudo llamar al modelo',
      }
    }
    uso = sumarUso(uso, r.uso)

    const leido = interpretar(r.texto)
    if (leido.error) return { borrador, problemas, intentos: intento, uso, error: leido.error }

    borrador = leido.borrador
    problemas = validarBorrador(borrador, ctx)
    if (!problemas.length) return { borrador, problemas, intentos: intento, uso, error: null }
  }

  return { borrador, problemas, intentos: INTENTOS, uso, error: null }
}
