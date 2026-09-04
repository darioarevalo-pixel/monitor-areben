/**
 * El REDACTOR: de dónde sale el PÁRRAFO cuando no lo tipea una persona.
 *
 * 🔑 Desde el 27-ago-2026 escribe **sólo el párrafo**. Los bullets se componen desde la ficha de
 * atributos que carga el local (`lib/tn-desc/atributos.core.js`), con lista cerrada: no hay
 * etiqueta que validar, ni tela que se pueda inventar, ni orden que corregir. Lo que antes eran
 * las reglas más caras de sostener hoy son casos imposibles.
 *
 * ⛔ Este archivo NO habla con la red: recibe una función `llamar` y la usa. Por eso el banco
 * ejerce el camino entero —incluido el reintento— sin API key y sin gastar un centavo, y por
 * eso un cambio en el prompt se prueba contra el validador de verdad y no contra una copia.
 *
 * 🔴 El reintento sigue haciendo falta, aunque el esquema ahora sea de una sola clave: el
 * esquema de Gemini **no soporta `maxLength`**, así que «hasta 220 caracteres» no se puede pedir
 * ahí — y «no nombres los colores de ESTE producto» ni «no repitas lo que dicen los bullets»
 * menos todavía. Lo que sostiene el formato es `validarParrafo`, y cuando rechaza, los problemas
 * vuelven al modelo en vez de tirarse el intento.
 *
 * 🔑 Es `.js` plano por lo mismo que `formato.core.js`: lo importa `api/_tn-desc-ia.js`, y un
 * handler de `api/` corre en Node sin pasar por el compilador de Next.
 */

import { MAX_PARRAFO, PRIMEROS, validarParrafo, validarTip } from './formato.core.js'

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

/**
 * 🔑 El más barato de los tres, y por decisión de Bruno (27-ago-2026) el que va por defecto:
 * el catálogo entero sale **US$0,31** contra US$1,16 de Flash 3.7 — y es el ÚNICO de los tres
 * sin precio promocional, así que el 1-ene-2027 la diferencia pasa de 3,8× a 5×.
 *
 * ⚠️ Desde que los bullets se componen solos, el modelo escribe **sólo el párrafo**: menos
 * tokens de salida y muchísimo menos que inventar. El desplegable de la pantalla queda para
 * subir un producto puntual a un modelo más caro y comparar con el costo al lado.
 */
export const MODELO_POR_DEFECTO = 'gemini-3.1-flash-lite'

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
  'Escribís el párrafo de venta de una ficha de producto de una tienda de indumentaria femenina de Argentina.',
  'La ficha YA tiene abajo una lista de datos duros (tela, calce, escote, manga, largo) que cargó el local. Vos escribís SÓLO el párrafo que va arriba de esa lista.',
  '',
  'El formato:',
  `- Una o dos frases, hasta ${MAX_PARRAFO} caracteres.`,
  `- Arranca nombrando la prenda. Nunca con «Este», «Esta», «Estos» ni «Estas»: los primeros ${PRIMEROS} caracteres son los que se ven en el feed y en la vista previa, y ahí tiene que estar la prenda.`,
  '- Contá cómo se usa y cómo queda puesta. No repitas el nombre entero del producto.',
  '',
  'Las tres reglas que no se negocian:',
  '- No repitas NADA de lo que ya dicen los datos de abajo. Si la tela está en la lista, la tela no va en el párrafo: son 220 caracteres y gastarlos dos veces es escribir la mitad.',
  '- No nombres colores ni talles, ni des medidas en centímetros. Eso lo muestran el selector de variantes y la tabla de talles; si lo escribís en el texto, queda mintiendo el día que se agota un color y nadie lo va a corregir.',
  '- Todo lo que digas tiene que verse en la foto o estar en los datos. No inventes ocasiones de uso, beneficios ni detalles de confección.',
  '',
  '',
  'Además del párrafo, escribí un TIP DE LOOK: una sola línea de hasta 120 caracteres sobre cómo combinarla o cómo queda mejor puesta («con un top básico metido adentro para marcar la cintura»). Le corren las mismas reglas: sin colores, sin talles, sin centímetros, y nada que no se vea en la foto.',
  '',
  'Castellano de Argentina, sin signos de exclamación y sin frases hechas del tipo «ideal para toda ocasión».',
].join('\n')

/**
 * El esquema de la respuesta.
 *
 * 🔑 **Es de una sola clave, y eso es la tanda entera.** Antes pedía `{parrafo, bullets}` con la
 * etiqueta de una lista cerrada y el conteo de bullets adentro, y aun así no alcanzaba: el
 * esquema de Gemini no soporta `maxLength`, así que «hasta 220 caracteres» y «no nombres los
 * colores de ESTE producto» los tenía que sostener el validador. Desde que los bullets se
 * componen desde la ficha, **lo único que el modelo puede equivocarse es el párrafo**.
 *
 * ⚠️ Nada de `additionalProperties`: el esquema de Gemini no lo acepta y el pedido entero vuelve
 * como 400. La forma se sostiene igual con `required`.
 */
export const ESQUEMA = {
  type: 'object',
  properties: {
    parrafo: { type: 'string' },
    // 🆕 El tip de look (4-sep-2026). Se le pide SIEMPRE y se guarda si sirve: es opcional del
    // lado de la ficha, no del pedido. Pedirlo «si te parece» devuelve string vacío la mitad de
    // las veces y la otra mitad un tip peor.
    tip: { type: 'string' },
  },
  required: ['parrafo', 'tip'],
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
 * 🔑 Y va la prosa que la ficha dice HOY: de los productos cortos, la mayoría ya nombra ahí una
 * tela o un detalle que no está en ningún otro lado. Es lo único que queda de la ficha vieja
 * cuando se la pisa, así que se lee antes de tirarla.
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

  // 🔑 Los bullets ya compuestos viajan EN EL PROMPT por el mismo motivo que las variantes: la
  // regla «no repitas lo que dicen los datos» la puede cumplir sólo el que sabe qué dicen. Sin
  // esto, el modelo escribiría «de microfibra» sin saber que el bullet Tela ya lo dice, el
  // validador lo rechazaría, y se pagaría un reintento por algo que se podía decir de entrada.
  if (ctx.bullets && ctx.bullets.length) {
    t.push('')
    t.push('Los datos que YA están escritos abajo del párrafo. No los repitas ni con otras palabras:')
    for (const b of ctx.bullets) t.push(`- ${b.etiqueta}: ${b.texto}`)
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
  // ⚠️ El tip no corta la respuesta si falta: es opcional, y un párrafo bueno sin tip sirve.
  return { borrador: { parrafo: d.parrafo, tip: typeof d.tip === 'string' ? d.tip.trim() : '' } }
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
    // El tip se valida con el párrafo y en la misma lista: si el reintento va a costar una
    // llamada, que arregle las dos cosas juntas.
    problemas = [...validarParrafo(borrador.parrafo, ctx), ...validarTip(borrador.tip, ctx)]
    if (!problemas.length) return { borrador, problemas, intentos: intento, uso, error: null }
  }

  return { borrador, problemas, intentos: INTENTOS, uso, error: null }
}
