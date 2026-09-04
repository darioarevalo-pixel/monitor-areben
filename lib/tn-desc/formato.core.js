/**
 * El FORMATO BASE de una descripción, hecho ejecutable.
 *
 * # Qué quedó acá, y qué se fue (27-ago-2026)
 *
 * Hasta esta fecha este archivo validaba **el borrador entero**: la etiqueta de cada bullet, que
 * fueran 3 o 4, que ninguno pasara los 60 caracteres, que no se repitiera una etiqueta, y que la
 * tela se apoyara en el insumo. Todo eso **ya no existe**, y no porque se haya aflojado la regla:
 * porque los bullets dejaron de escribirse. Los compone `lib/tn-desc/atributos.core.js` a partir
 * de la ficha que carga el local, de una lista cerrada. Una etiqueta inválida, repetida, fuera de
 * orden o una tela inventada **dejaron de poder ocurrir** — no hay nada que rechazar.
 *
 * 🔑 Es la diferencia entre una regla mejor escrita y un caso que se vuelve imposible. El
 * validador que sobrevive es el del **párrafo**, que es lo único que sigue escribiendo un modelo.
 *
 * # Las reglas del párrafo
 *
 * Tres venían de antes (largo, colores, talles) y dos las agregó Bruno el 27-ago-2026 mirando la
 * primera corrida real contra tres productos mudos de Zattia:
 *
 *   - **Arranca por el tipo de prenda.** Los tres arrancaron con «Este top», «Este sweater»,
 *     «Esta prenda» — y el peor ni siquiera nombraba la camisa. Los primeros 60 caracteres son
 *     los que se ven en el feed y en la vista previa: si ahí no está la prenda, no está.
 *   - **Cero repetición con los bullets.** TOP BLISS escribió «diseño asimétrico» y «manga
 *     ancha» en el párrafo y los repitió en dos bullets. Son 220 caracteres: gastarlos dos veces
 *     es escribir la mitad.
 *
 * ⚠️ La tercera regla que decidió ese día —el orden fijo de los bullets— **no está acá**: la
 * resuelve el render en `atributos.core.js`. Una regla que se puede hacer imposible no se valida.
 *
 * # Por qué es `.js` plano
 *
 * Lo importan `lib/tn-desc/redactor.core.js` y, por él, `api/_tn-desc-ia.js`. Los handlers de
 * `api/` corren en Node sin pasar por el compilador de Next y **no pueden importar TypeScript** —
 * el mismo motivo de `lib/permisos.core.js`. `formato.ts` re-exporta esto con tipos.
 */

import { esc } from '../esc.core.js'

export const MAX_PARRAFO = 220

/**
 * El tip de look es una línea, no un segundo párrafo. 120 es lo que mide el de FALDA SAGE —«con
 * un top básico metido adentro para marcar la cintura»— con lugar de sobra.
 */
export const MAX_TIP = 120

/** Lo que se lee en el feed y en la vista previa. Ahí adentro tiene que estar la prenda. */
export const PRIMEROS = 60

export const PROSA_INI = '<!--AREBEN-PROSA-INI-->'
export const PROSA_FIN = '<!--AREBEN-PROSA-FIN-->'

const sinAcento = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Palabras de 4+ letras, normalizadas. Sirve para preguntar «¿esto ya está dicho?». */
const palabras = (s) => sinAcento(s).match(/[a-z0-9]{4,}/g) || []

/** ¿El texto nombra alguna de estas palabras, como palabra entera? */
function nombraAlguna(texto, candidatas) {
  const t = ' ' + sinAcento(texto).replace(/[^a-z0-9]+/g, ' ') + ' '
  for (const c of candidatas) {
    const n = sinAcento(c)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
    // 🔑 Piso de 3: los talles viajan como valores de variante igual que los colores, y son
    // cortos —'S', 'U', 'XL', y los de pantalón son NÚMEROS ('1', '2', '36')—. Buscarlos en
    // prosa daría falsos positivos sin sentido: «2 bolsillos» no es el talle 2.
    if (n.length < 3) continue
    if (t.includes(' ' + n + ' ')) return c
  }
  return null
}

/**
 * ¿El texto nombra la prenda? Como `nombraAlguna`, pero **acepta el plural**.
 *
 * 🔴 Salió midiendo, el 4-sep-2026: el modelo escribió «Jeans con un proceso de lavado
 * localizado…» y el validador contestó «no nombra jean en los primeros 60 caracteres» — y sí lo
 * nombraba. `nombraAlguna` compara palabra entera y «jeans» ≠ «jean». Ese falso positivo se paga:
 * dispara un reintento, y el borrador costó **US$0,0050 contra US$0,0014**, 3,5 veces más por una
 * «s». Y el reintento puede volver con un párrafo peor que el que se rechazó.
 *
 * ⛔ Sólo el plural, ⛔ no cualquier palabra que empiece igual: «jeanetta» no nombra un jean.
 */
function nombraLaPrenda(texto, tipo) {
  const n = sinAcento(tipo).replace(/[^a-z0-9]+/g, ' ').trim()
  if (n.length < 3) return false
  const patron = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '\\s+')
  return new RegExp('\\b' + patron + '(?:e?s)?\\b').test(sinAcento(texto).replace(/[^a-z0-9]+/g, ' '))
}

/**
 * Con qué NO puede arrancar el párrafo.
 *
 * ⚠️ Van los demostrativos y nada más. «Un jean de corte amplio…» arranca bien: dice la prenda
 * en la primera línea, que es lo que la regla persigue. Prohibir todos los artículos sería
 * pedirle al modelo que escriba raro para cumplir una regla que ya cumple.
 */
const ARRANQUES_PROHIBIDOS = ['este', 'esta', 'estos', 'estas', 'el mismo', 'la misma']

/**
 * El tipo de prenda, sacado del nombre del producto.
 *
 * En Zattia el nombre SIEMPRE arranca por el tipo: «TOP BLISS», «JEAN DUSK», «CAMISA ALESSA».
 * ⚠️ Salvo dos moldes de dos palabras —«BABY TEE ICON», «LONG TEE SENSE»—, que son 35 productos
 * y donde el tipo es «baby tee», no «baby».
 */
export function tipoDe(nombre) {
  const t = String(nombre || '').trim().split(/\s+/)
  if (!t[0]) return ''
  const dos = sinAcento(t[0])
  if ((dos === 'baby' || dos === 'long') && t[1]) return `${t[0]} ${t[1]}`
  return t[0]
}

/**
 * Los problemas del párrafo. Vacío = se puede aprobar.
 *
 * ⛔ Devuelve TODOS los problemas, no el primero: quien revisa tiene que ver la lista entera de
 * una, y cuando el que lee es un modelo, la lista entera es lo que hace que el reintento
 * arregle todo junto en vez de uno por llamada.
 *
 * @param {string} parrafo
 * @param {{variantes?: string[], nombre?: string, bullets?: {etiqueta:string,texto:string}[]}} ctx
 */
export function validarParrafo(parrafo, ctx) {
  const problemas = []
  const push = (campo, motivo) => problemas.push({ campo, motivo })

  const p = String(parrafo || '').trim()
  if (!p) {
    push('parrafo', 'está vacío')
    return problemas
  }
  if (p.length > MAX_PARRAFO) push('parrafo', `tiene ${p.length} caracteres y el máximo es ${MAX_PARRAFO}`)

  // 1. Los colores los muestra el selector de variantes. Nombrarlos es prometer un stock que se
  //    agota, y la ficha queda mintiendo sin que nadie la toque.
  const color = nombraAlguna(p, (ctx && ctx.variantes) || [])
  if (color) push('parrafo', `nombra «${color}», que es una variante: eso lo muestra el selector y se desactualiza solo`)

  // 2. Los talles, ídem — y además la tabla de talles va abajo, en el mismo campo.
  if (/\btalles?\b/i.test(sinAcento(p))) push('parrafo', 'nombra el talle: eso lo dicen el selector y la tabla')
  if (/\d+\s?cm\b/i.test(p)) push('parrafo', 'da medidas en centímetros: eso lo dice la tabla de talles')

  // 3. Arranca por la prenda, no por un demostrativo (regla de Bruno, 27-ago-2026).
  const arranque = sinAcento(p)
  const malArranque = ARRANQUES_PROHIBIDOS.find((x) => arranque.startsWith(x + ' '))
  if (malArranque) push('parrafo', `arranca con «${malArranque}»: tiene que arrancar nombrando la prenda`)

  const tipo = tipoDe((ctx && ctx.nombre) || '')
  if (tipo && !nombraLaPrenda(p.slice(0, PRIMEROS), tipo)) {
    push('parrafo', `no nombra «${tipo.toLowerCase()}» en los primeros ${PRIMEROS} caracteres, que son los que se ven en el feed`)
  }

  // 4. ⛔ No repite el NOMBRE del producto (regla de Bruno, 4-sep-2026). El nombre ya está
  //    arriba, en el título de la ficha: escribirlo nombra dos veces lo mismo y se come parte de
  //    los 220. Lo trajo «Jean Marina con un corte que aporta volumen…», la primera corrida real
  //    de la tanda del 2-sep. ⚠️ Se mira el nombre SIN el tipo de prenda —«Marina», no «Jean
  //    Marina»—: la regla de arriba EXIGE nombrar la prenda, así que prohibir el nombre entero
  //    dejaría dos reglas peleándose.
  const propio = String((ctx && ctx.nombre) || '')
    .trim()
    .slice(tipoDe((ctx && ctx.nombre) || '').length)
    .trim()
  if (propio && nombraAlguna(p, [propio])) {
    push('parrafo', `nombra «${propio}», que es el nombre del producto: ya está arriba, en el título`)
  }

  // 5. No repite lo que ya dicen los bullets (regla de Bruno, 27-ago-2026).
  //    🔑 Se compara contra los bullets YA COMPUESTOS, así que la regla se mueve sola el día que
  //    se cargue un atributo más: no hay una lista de palabras prohibidas que mantener.
  const enParrafo = new Set(palabras(p))
  const repetidas = []
  for (const b of (ctx && ctx.bullets) || []) {
    for (const w of palabras((b && b.texto) || '')) {
      if (enParrafo.has(w) && !repetidas.includes(w)) repetidas.push(w)
    }
  }
  if (repetidas.length) {
    push('parrafo', `repite lo que ya dicen los bullets (${repetidas.join(', ')}): son ${MAX_PARRAFO} caracteres, no los gastes dos veces`)
  }

  return problemas
}

/**
 * Los problemas del TIP DE LOOK. Vacío = se puede aprobar, y **vacío también es válido**: el tip
 * es opcional por decisión de Bruno (4-sep-2026), porque un tip flojo pesa más que la falta de tip.
 *
 * 🔑 Le corren las mismas reglas duras que al párrafo —colores, talles, centímetros— y por el
 * mismo motivo: viven en el mismo campo de TiendaNube y se desactualizan igual. ⛔ No le corre la
 * de arrancar por la prenda: un tip arranca por cómo se usa, no por qué es.
 *
 * @param {string} tip
 * @param {{variantes?: string[]}} ctx
 */
export function validarTip(tip, ctx) {
  const problemas = []
  const t = String(tip || '').trim()
  if (!t) return problemas
  if (t.length > MAX_TIP) problemas.push({ campo: 'tip', motivo: `tiene ${t.length} caracteres y el máximo es ${MAX_TIP}` })
  const color = nombraAlguna(t, (ctx && ctx.variantes) || [])
  if (color) problemas.push({ campo: 'tip', motivo: `nombra «${color}», que es una variante: eso lo muestra el selector` })
  if (/\btalles?\b/i.test(sinAcento(t))) problemas.push({ campo: 'tip', motivo: 'nombra el talle: eso lo dicen el selector y la tabla' })
  if (/\d+\s?cm\b/i.test(t)) problemas.push({ campo: 'tip', motivo: 'da medidas en centímetros: eso lo dice la tabla de talles' })
  return problemas
}

/**
 * El HTML autónomo (estilos inline, como el de la tabla) que se pega en la descripción,
 * envuelto en la firma AREBEN-PROSA para poder reemplazarlo después sin tocar el resto.
 *
 * 🔑 Los bullets llegan ya compuestos por `atributos.core.js` — acá no se decide ni el orden ni
 * la etiqueta. Este archivo sólo pinta.
 *
 * ⚠️ El `<div>` lleva `max-width:680px`, que es la misma firma con la que el generador de talles
 * reconoce su envoltorio viejo. Por eso el bloque `AREBEN-PROSA` se extrae ANTES de tocar
 * wrappers en las dos puntas: `lib/tn-desc/prosa.ts` acá y `bdi-catalogo/api/_desc-talles.js` del
 * otro lado. Sin eso, medir la prosa da cero y pegar una tabla de talles la borra.
 */
export function generarHtml(b) {
  const items = ((b && b.bullets) || [])
    .map((x) => `<li style="margin-bottom:4px;"><b>${esc(((x && x.etiqueta) || '').trim())}:</b> ${esc(((x && x.texto) || '').trim())}</li>`)
    .join('')
  const tip = String((b && b.tip) || '').trim()
  const cuidados = ((b && b.cuidados && b.cuidados.lineas) || []).filter((x) => String(x || '').trim())

  let h = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">'
  h += `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;">${esc(((b && b.parrafo) || '').trim())}</p>`
  if (items) h += `<ul style="font-size:14px;line-height:1.5;margin:0;padding-left:18px;">${items}</ul>`
  // El tip va donde lo tenía la descripción escrita a mano que sirvió de modelo (FALDA SAGE):
  // después de los datos duros y antes de los cuidados.
  if (tip) h += `<p style="font-size:14px;line-height:1.6;margin:14px 0 0;"><b>Tip de look:</b> ${esc(tip)}</p>`
  if (cuidados.length) {
    h += '<div style="font-size:13px;color:#444;margin-top:16px;"><b style="color:#222;">Cuidados de la prenda</b>'
    h += `<ul style="line-height:1.5;margin:4px 0 0;padding-left:18px;">${cuidados.map((l) => `<li style="margin-bottom:4px;">${esc(l)}</li>`).join('')}</ul></div>`
  }
  h += '</div>'
  return PROSA_INI + h + PROSA_FIN
}
