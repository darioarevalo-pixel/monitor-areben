/**
 * Un markdown chiquito, propio, para las Novedades y los Manuales.
 *
 * # Por qué no una librería
 *
 * Las dos que uno pondría (`marked`, `react-markdown`) traen el CommonMark entero: HTML crudo,
 * tablas, imágenes, referencias. Acá no hace falta nada de eso —para datos de verdad ya está la
 * `Table` del kit, y las imágenes son otra tanda— y cada cosa que el parser entiende es una cosa
 * más que hay que sanear. Son 120 líneas contra una dependencia con superficie de ataque.
 *
 * # Por qué devuelve datos y no HTML
 *
 * **Nunca sale un string de HTML de acá**, así que nunca hay un `dangerouslySetInnerHTML` del otro
 * lado. Devuelve una estructura y `components/ui/Markdown.tsx` la pinta con JSX: React escapa el
 * texto solo y no hay forma de que un `<script>` escrito en una novedad llegue a ejecutarse. El
 * texto lo redacto yo, pero la pantalla lo deja editar, así que la superficie existe igual.
 *
 * # Qué entiende
 *
 *   `## Título` · `### Subtítulo` (el `#` de un solo `#` NO: el `<h1>` es el de la sección)
 *   párrafos (dos saltos separan; un salto simple une)
 *   `- item` / `* item` · `1. item` (sin anidar)
 *   `**negrita**` · `_cursiva_` · `` `código` `` · ```` ``` ```` para un bloque
 *   `[texto](url)` con http://, https:// o una ruta interna `/…`
 *
 * Y nada más: sin tablas, sin imágenes, sin citas, sin HTML, sin listas anidadas, sin tachado. Las
 * URL sueltas **no** se autolinkean: si querés un link, corchetes.
 *
 * ⚠️ La cursiva es con **guion bajo y no con asterisco simple**: `*x*` choca con el `* item` de las
 * listas. Entró con la barra de formato del editor (`lib/markdown/barra.ts`) — un botón de cursiva
 * que escribiera algo que el parser no entiende sería peor que no tener el botón.
 *
 * **Regla de oro: lo que no matchea se muestra tal cual, nunca se borra.** Un `**` sin cerrar se ve
 * como dos asteriscos; un `[x](javascript:…)` se ve como ese texto. Es la misma regla que tiene
 * `armarMensaje` con los marcadores desconocidos (`lib/atencion/core.ts`), y por el mismo motivo:
 * un hueco en blanco no dice qué pasó.
 */

export type Trozo =
  | { t: 'texto' | 'negrita' | 'italica' | 'codigo'; v: string }
  | { t: 'link'; v: string; href: string; externo: boolean }

export type Bloque =
  | { t: 'titulo'; nivel: 2 | 3; hijos: Trozo[] }
  | { t: 'parrafo'; hijos: Trozo[] }
  | { t: 'lista'; ordenada: boolean; items: Trozo[][] }
  | { t: 'codigo'; texto: string }

const VINETA = /^\s{0,3}[-*]\s+(.*)$/
const NUMERO = /^\s{0,3}\d+\.\s+(.*)$/
const TITULO = /^(#{2,3})\s+(.*)$/
const CERCA = /^\s*```/

export function parsearMd(texto: string): Bloque[] {
  const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
  const bloques: Bloque[] = []
  let parrafo: string[] = []

  const cerrarParrafo = () => {
    if (!parrafo.length) return
    bloques.push({ t: 'parrafo', hijos: parsearTrozos(parrafo.join(' ')) })
    parrafo = []
  }

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]

    if (CERCA.test(linea)) {
      cerrarParrafo()
      const cuerpo: string[] = []
      i++
      // Una cerca sin cerrar se come lo que queda, igual que CommonMark: es más probable que
      // alguien se haya olvidado el cierre a que quisiera un backtick triple suelto.
      while (i < lineas.length && !CERCA.test(lineas[i])) cuerpo.push(lineas[i++])
      bloques.push({ t: 'codigo', texto: cuerpo.join('\n') })
      continue
    }

    if (!linea.trim()) {
      cerrarParrafo()
      continue
    }

    const tit = TITULO.exec(linea)
    if (tit) {
      cerrarParrafo()
      bloques.push({ t: 'titulo', nivel: tit[1].length as 2 | 3, hijos: parsearTrozos(tit[2]) })
      continue
    }

    const esVineta = VINETA.exec(linea)
    const esNumero = esVineta ? null : NUMERO.exec(linea)
    if (esVineta || esNumero) {
      cerrarParrafo()
      const ordenada = !esVineta
      const patron = ordenada ? NUMERO : VINETA
      const items: Trozo[][] = []
      while (i < lineas.length) {
        const m = patron.exec(lineas[i])
        if (!m) break
        items.push(parsearTrozos(m[1]))
        i++
      }
      i-- // la del for
      bloques.push({ t: 'lista', ordenada, items })
      continue
    }

    parrafo.push(linea.trim())
  }

  cerrarParrafo()
  return bloques
}

/**
 * Lo de adentro de una línea. **No es recursivo**: una negrita es texto plano, no puede tener un
 * link adentro. Ninguna novedad lo necesitó todavía y anidar duplica el parser.
 */
export function parsearTrozos(s: string): Trozo[] {
  const out: Trozo[] = []
  let buf = ''
  let i = 0

  const soltar = () => {
    if (buf) out.push({ t: 'texto', v: buf })
    buf = ''
  }

  while (i < s.length) {
    if (s[i] === '*' && s[i + 1] === '*') {
      const fin = s.indexOf('**', i + 2)
      if (fin > i + 1) {
        soltar()
        out.push({ t: 'negrita', v: s.slice(i + 2, fin) })
        i = fin + 2
        continue
      }
    }
    // La cursiva pide más condiciones que el resto porque el guion bajo aparece en texto de verdad
    // (`api/_sistema.js`, `snake_case`). Se exige que abra pegado a una palabra por la izquierda NO,
    // que cierre en el mismo renglón, y que lo de adentro no arranque ni termine en espacio.
    if (s[i] === '_' && !esPalabra(s[i - 1])) {
      const fin = s.indexOf('_', i + 1)
      const dentro = fin > i + 1 ? s.slice(i + 1, fin) : ''
      if (dentro && !/^\s|\s$/.test(dentro) && !esPalabra(s[fin + 1])) {
        soltar()
        out.push({ t: 'italica', v: dentro })
        i = fin + 1
        continue
      }
    }
    if (s[i] === '`') {
      const fin = s.indexOf('`', i + 1)
      if (fin > i) {
        soltar()
        out.push({ t: 'codigo', v: s.slice(i + 1, fin) })
        i = fin + 1
        continue
      }
    }
    if (s[i] === '[') {
      const cierra = s.indexOf(']', i + 1)
      if (cierra > i && s[cierra + 1] === '(') {
        const fin = s.indexOf(')', cierra + 2)
        if (fin > cierra) {
          const href = hrefSeguro(s.slice(cierra + 2, fin))
          soltar()
          if (href) out.push({ t: 'link', v: s.slice(i + 1, cierra), href, externo: !href.startsWith('/') })
          // Un href que no pasa se muestra **entero y tal cual**, corchetes incluidos: así se ve
          // qué se escribió, en vez de un link que calla que no va a ningún lado.
          else out.push({ t: 'texto', v: s.slice(i, fin + 1) })
          i = fin + 1
          continue
        }
      }
    }
    buf += s[i]
    i++
  }

  soltar()
  return out
}

/** Si el carácter es letra o número (con acentos y ñ), o sea: si el `_` está en medio de una palabra. */
function esPalabra(c: string | undefined): boolean {
  return !!c && /[\p{L}\p{N}]/u.test(c)
}

/**
 * El href, o `null` si no se acepta. **Lista blanca, no lista negra**: sólo `http://`, `https://` y
 * rutas internas. Todo lo demás —`javascript:`, `data:`, y lo que se invente— cae por no estar en
 * la lista, sin tener que anticiparlo.
 *
 * ⚠️ `//otro-dominio.com` empieza con barra y **no** es una ruta interna: el navegador la resuelve
 * como externa con el protocolo actual. Va aparte a propósito.
 */
function hrefSeguro(crudo: string): string | null {
  const h = crudo.trim()
  if (!h || h.startsWith('//')) return null
  if (h.startsWith('/')) return h
  return /^https?:\/\//i.test(h) ? h : null
}
