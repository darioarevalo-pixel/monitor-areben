/**
 * La barra de formato del editor: qué le hace cada botón al texto.
 *
 * Está acá y no adentro del componente porque **es lo único de la barra que puede estar mal**, y los
 * tests corren en Node sin DOM: `aplicar()` toma un texto y una selección y devuelve el texto nuevo
 * con la selección nueva. El `<textarea>` sólo pone y saca esos tres valores.
 *
 * 🔑 **La barra escribe markdown, no HTML.** El cuerpo de una novedad se guarda como el markdown
 * chico de `lib/markdown/core.ts` y se pinta a JSX sin pasar por HTML nunca —por eso el repo no
 * necesita un sanitizador—. Un editor de verdad (contentEditable, tiptap) devuelve HTML: obligaría a
 * sanitizar, a convertir en las dos direcciones, y dejaría afuera lo ya guardado y
 * `scripts/novedad.mjs`. Poner los mismos caracteres que se escribirían a mano no rompe nada.
 *
 * Hay tres formas:
 * - **envolver** la selección (`**`, `_`, `` ` ``, y el link, que es un caso aparte);
 * - **prefijar cada línea tocada** (`## `, `### `, `- `, `1. `), y es un **toggle**: si las líneas ya
 *   lo tienen, se lo saca. Sin eso, poner una lista por error no tiene vuelta más que a mano;
 * - **insertar un bloque entero** (la tabla, el recuadro). ⚠️ Ésos **no son toggle**: una tabla no se
 *   desarma sacándole un prefijo, y un botón que a veces borra tres renglones no se aprieta tranquilo.
 */

export type Marca =
  | 'negrita'
  | 'italica'
  | 'codigo'
  | 'titulo'
  | 'subtitulo'
  | 'lista'
  | 'numerada'
  | 'link'
  | 'tabla'
  | 'recuadro'

/** El texto resultante y dónde queda la selección, que es lo que el textarea tiene que reponer. */
export type Resultado = { texto: string; ini: number; fin: number }

const ENVOLVENTES: Partial<Record<Marca, string>> = {
  negrita: '**',
  italica: '_',
  codigo: '`',
}

const PREFIJOS: Partial<Record<Marca, string>> = {
  titulo: '## ',
  subtitulo: '### ',
  lista: '- ',
  numerada: '1. ',
}

/**
 * El esqueleto de una tabla.
 *
 * Tres columnas y una fila vacía porque casi todo un manual es «qué · quién · cuándo»: se llena
 * encima en vez de arrancar de una tabla de una celda que después hay que agrandar a mano.
 */
const TABLA = '| Qué | Quién | Cuándo |\n| --- | --- | --- |\n|  |  |  |'

/** Qué escribe cada botón cuando no hay nada marcado, para el `title` del botón. */
export const AYUDA: Record<Marca, string> = {
  negrita: 'Negrita — **así**',
  italica: 'Cursiva — _así_',
  codigo: 'Código — `así`',
  titulo: 'Título — ## así',
  subtitulo: 'Subtítulo — ### así',
  lista: 'Lista — un - por renglón',
  numerada: 'Lista numerada — 1. por renglón',
  link: 'Link — [texto](https://…)',
  tabla: 'Tabla — qué · quién · cuándo',
  recuadro: 'Recuadro — cambiá OJO por REGLA o NUNCA',
}

export function aplicar(texto: string, ini: number, fin: number, m: Marca): Resultado {
  const a = Math.max(0, Math.min(ini, fin))
  const b = Math.min(texto.length, Math.max(ini, fin))
  if (m === 'link') return envolverLink(texto, a, b)
  if (m === 'tabla') return insertarBloque(texto, a, b, () => TABLA, 2, 3)
  // El recuadro se lleva puesto lo que estuviera marcado, que es como uno lo usa: se escribe el
  // aviso y recién después se decide que va en un recuadro.
  if (m === 'recuadro') {
    const sel = texto.slice(a, b).trim()
    return insertarBloque(texto, a, b, () => `> [!OJO]\n> ${sel}`, 4, 3)
  }
  const par = ENVOLVENTES[m]
  if (par) return envolver(texto, a, b, par)
  return prefijar(texto, a, b, PREFIJOS[m] as string, m === 'numerada')
}

/**
 * Envolver es también un toggle: si lo marcado ya viene envuelto, se desenvuelve. Se mira **adentro**
 * de la selección y también justo **afuera**, porque marcar la palabra con el doble clic no toma los
 * asteriscos y ahí es donde uno espera poder apagar la negrita.
 */
function envolver(texto: string, a: number, b: number, par: string): Resultado {
  const sel = texto.slice(a, b)
  const n = par.length

  if (sel.length >= n * 2 && sel.startsWith(par) && sel.endsWith(par)) {
    const limpio = sel.slice(n, sel.length - n)
    return { texto: texto.slice(0, a) + limpio + texto.slice(b), ini: a, fin: a + limpio.length }
  }
  if (texto.slice(a - n, a) === par && texto.slice(b, b + n) === par) {
    return { texto: texto.slice(0, a - n) + sel + texto.slice(b + n), ini: a - n, fin: a - n + sel.length }
  }

  // Sin selección: quedan los marcadores puestos y el cursor en el medio, listo para escribir.
  return { texto: texto.slice(0, a) + par + sel + par + texto.slice(b), ini: a + n, fin: a + n + sel.length }
}

/** El link es el único que no es simétrico: el texto va en los corchetes y el cursor queda en la URL. */
function envolverLink(texto: string, a: number, b: number): Resultado {
  const sel = texto.slice(a, b) || 'texto'
  const armado = `[${sel}](https://)`
  const antes = texto.slice(0, a)
  // El cursor cae después de `https://`, que es exactamente lo que falta escribir.
  const cursor = antes.length + armado.length - 1
  return { texto: antes + armado + texto.slice(b), ini: cursor, fin: cursor }
}

/**
 * Poner un bloque entero donde está el cursor, y dejar marcada la palabra que hay que reemplazar.
 *
 * 🔑 **Arranca en su propio renglón y despegado de lo de arriba**, porque el parser necesita la línea
 * limpia: una tabla pegada al párrafo anterior se lee como parte del párrafo y no se dibuja. `desde`
 * y `largo` marcan el primer hueco a llenar (`Qué` en la tabla, `OJO` en el recuadro) para que se
 * escriba encima sin tener que ir a buscarlo con el mouse.
 */
function insertarBloque(texto: string, a: number, b: number, armar: (sel: string) => string, desde: number, largo: number): Resultado {
  const antes = texto.slice(0, a)
  const salto = !antes || antes.endsWith('\n\n') ? '' : antes.endsWith('\n') ? '\n' : '\n\n'
  const cuerpo = armar(texto.slice(a, b))
  const inicio = antes.length + salto.length
  return { texto: antes + salto + cuerpo + texto.slice(b), ini: inicio + desde, fin: inicio + desde + largo }
}

/**
 * Prefijar cada línea que la selección toca, aunque la toque por un solo carácter: nadie marca el
 * último `\n` a propósito, y una lista a la que le falta el último renglón es un bug a los ojos.
 */
function prefijar(texto: string, a: number, b: number, prefijo: string, numerar = false): Resultado {
  const desde = texto.lastIndexOf('\n', a - 1) + 1
  let hasta = texto.indexOf('\n', b)
  if (hasta === -1) hasta = texto.length
  // Una selección que termina justo en un salto no arrastra la línea siguiente.
  if (b > desde && texto[b - 1] === '\n') hasta = b - 1

  const lineas = texto.slice(desde, hasta).split('\n')
  const rx = regexPrefijo(prefijo)
  const todasLoTienen = lineas.every((l) => rx.test(l) || !l.trim())
  let nro = 0
  const nuevas = lineas.map((l) => {
    if (!l.trim()) return l
    if (todasLoTienen) return l.replace(rx, '')
    nro++
    // Numerar de verdad (1., 2., 3.) y no repetir «1.»: el parser lo aceptaría igual, pero el que
    // escribe mira el textarea, no el `<ol>`.
    return (numerar ? `${nro}. ` : prefijo) + l.replace(regexCualquierPrefijo(), '')
  })
  const bloque = nuevas.join('\n')
  return { texto: texto.slice(0, desde) + bloque + texto.slice(hasta), ini: desde, fin: desde + bloque.length }
}

/** El `1. ` matchea cualquier número: la segunda línea de una numerada es `2. `, no `1. `. */
function regexPrefijo(prefijo: string): RegExp {
  return prefijo === '1. ' ? /^\d+\.\s/ : new RegExp(`^${prefijo.replace(/[#*.]/g, '\\$&')}`)
}

/** Los prefijos son excluyentes entre sí: un renglón no es título y lista a la vez. */
function regexCualquierPrefijo(): RegExp {
  return /^(#{2,4}\s|[-*]\s|\d+\.\s)/
}
