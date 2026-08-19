/**
 * El FORMATO BASE de una descripción, hecho ejecutable — la parte que también tiene que poder
 * leer un handler de `api/`.
 *
 * Medido contra la tienda el 19-ago-2026: de 369 publicados, UNO solo tenía formato rico.
 * Conviven tres dialectos («Disponible en…» ×58, «Colores disponibles:» ×8, «Talle único»
 * ×3) y ninguno dice la composición. O sea: el formato base no existía.
 *
 * El que eligió Bruno: un párrafo que vende + 3 o 4 bullets duros, y **NO nombra colores
 * ni talles** — eso ya lo dice el selector de variantes de TiendaNube, y es justo lo que se
 * desactualiza: TOP EMBER promete «beige, negro y blanco» y las variantes son blanco y
 * negro; FAJA CLEO promete «negro y marrón» y sólo existe marrón.
 *
 * 🔴 `validarBorrador` es carga estructural, no un adorno: cuando el borrador lo escribe un
 * modelo, el JSON Schema de structured outputs NO puede fijar «3 o 4 bullets» ni «máximo 220
 * caracteres» (no soporta `minItems`/`maxItems`/`maxLength`), y menos «no nombres los colores
 * de ESTE producto». Lo único que sostiene el formato es esta función.
 *
 * 🔑 Por qué es `.js` plano y no `.ts`: lo importan `lib/tn-desc/redactor.core.js` y, por él,
 * `api/_tn-desc-ia.js`. Los handlers de `api/` corren en Node sin pasar por el compilador de
 * Next y **no pueden importar TypeScript** — el mismo motivo por el que `lib/permisos.core.js`
 * es `.js`. `lib/tn-desc/formato.ts` re-exporta todo esto con tipos, y es de ahí de donde
 * siguen importando la pantalla y los tests: nadie tuvo que cambiar un import.
 *
 * ⛔ Una sola implementación. Copiar el validador adentro de un handler es lo que ya dejó a
 * todo el equipo sin ver el padrón de Canjes.
 */

/** Las etiquetas admitidas. Cerrada a propósito: si cada uno inventa la suya, no hay formato. */
export const ETIQUETAS = ['Tela', 'Calce', 'Cuello', 'Escote', 'Detalle', 'Largo', 'Manga', 'Espalda']

export const MAX_PARRAFO = 220
export const MAX_BULLET = 60
export const MIN_BULLETS = 3
export const MAX_BULLETS = 4

export const PROSA_INI = '<!--AREBEN-PROSA-INI-->'
export const PROSA_FIN = '<!--AREBEN-PROSA-FIN-->'

const sinAcento = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Palabras de 4+ letras, normalizadas. Sirve para preguntar «¿esto está en el insumo?». */
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
    // ⚠️ Bajarlo a 2 es un cambio INDISTINGUIBLE en la práctica (no hay variante de dos
    // caracteres que aparezca como palabra suelta en castellano); el mutante que lo prueba
    // sobrevive y es equivalente. El que importa es el piso contra las de UNA.
    if (n.length < 3) continue
    if (t.includes(' ' + n + ' ')) return c
  }
  return null
}

/**
 * Los problemas del borrador. Vacío = se puede publicar.
 *
 * ⛔ Devuelve TODOS los problemas, no el primero: quien revisa tiene que ver la lista entera
 * de una, no arreglar uno y descubrir el siguiente. Y cuando el que lee es un modelo, la
 * lista entera es lo que hace que el reintento arregle todo junto en vez de uno por llamada.
 */
export function validarBorrador(b, ctx) {
  const problemas = []
  const push = (campo, motivo) => problemas.push({ campo, motivo })

  const parrafo = ((b && b.parrafo) || '').trim()
  if (!parrafo) push('parrafo', 'está vacío')
  else if (parrafo.length > MAX_PARRAFO)
    push('parrafo', `tiene ${parrafo.length} caracteres y el máximo es ${MAX_PARRAFO}`)

  const bullets = (b && b.bullets) || []
  if (bullets.length < MIN_BULLETS) push('bullets', `hay ${bullets.length} y el mínimo es ${MIN_BULLETS}`)
  if (bullets.length > MAX_BULLETS) push('bullets', `hay ${bullets.length} y el máximo es ${MAX_BULLETS}`)

  const vistas = new Set()
  bullets.forEach((bu, i) => {
    const et = ((bu && bu.etiqueta) || '').trim()
    const tx = ((bu && bu.texto) || '').trim()
    const dónde = `bullet ${i + 1}`
    if (!ETIQUETAS.includes(et)) push(dónde, `la etiqueta «${et}» no es una de las admitidas`)
    else if (vistas.has(et)) push(dónde, `la etiqueta «${et}» ya se usó`)
    vistas.add(et)
    if (!tx) push(dónde, 'no dice nada')
    else if (tx.length > MAX_BULLET) push(dónde, `tiene ${tx.length} caracteres y el máximo es ${MAX_BULLET}`)
    if (/[.]$/.test(tx)) push(dónde, 'termina en punto')
  })

  // --- Las tres reglas que Bruno decidió, hechas ejecutables ---
  const todo = [parrafo, ...bullets.map((x) => (x && x.texto) || '')].join(' ')

  // 1. Los colores los muestra el selector de variantes. Nombrarlos es prometer un stock
  //    que se agota, y la ficha queda mintiendo sin que nadie la toque.
  const color = nombraAlguna(todo, (ctx && ctx.variantes) || [])
  if (color) push('texto', `nombra «${color}», que es una variante: eso lo muestra el selector y se desactualiza solo`)

  // 2. Los talles, ídem — y además la tabla de talles va abajo, en el mismo campo.
  if (/\btalles?\b/i.test(sinAcento(todo))) push('texto', 'nombra el talle: eso lo dicen el selector y la tabla')
  if (/\d+\s?cm\b/i.test(todo)) push('texto', 'da medidas en centímetros: eso lo dice la tabla de talles')

  // 3. La tela es DATO, no adivinanza: si no está en el insumo ni en el nombre, no se nombra.
  //    Es la regla que evita que un modelo mirando una foto de estudio decida entre gasa,
  //    voile y chiffon — que se ven igual, y una tela mal puesta es un cambio o una devolución.
  const tela = bullets.find((x) => ((x && x.etiqueta) || '').trim() === 'Tela')
  if (tela) {
    const fuente = palabras(`${(ctx && ctx.insumo) || ''} ${(ctx && ctx.nombre) || ''}`)
    const apoyo = palabras(tela.texto || '').some((p) => fuente.includes(p))
    if (!apoyo) push('bullet Tela', 'la tela no aparece ni en el insumo ni en el nombre: no se inventa')
  }

  return problemas
}
