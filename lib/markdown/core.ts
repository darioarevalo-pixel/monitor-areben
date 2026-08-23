/**
 * Un markdown chiquito, propio, para las Novedades y los Manuales.
 *
 * # Por qué no una librería
 *
 * Las dos que uno pondría (`marked`, `react-markdown`) traen el CommonMark entero, y con él lo que
 * acá no puede entrar: **HTML crudo**. Cada cosa que el parser entiende es una cosa más que hay que
 * sanear, así que entiende lo que un manual necesita y nada más. Son un par de cientos de líneas
 * contra una dependencia con superficie de ataque.
 *
 * 🔑 **Y lo que devuelve una tabla o un recuadro no es markup: es un dato que la pantalla pinta con
 * el kit** —la `Table` y el `Notice` de `components/ui/`—. Por eso «entender tablas» no agrandó la
 * superficie: agrandó el vocabulario.
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
 *   `## Título` · `### Subtítulo` · `#### Sub-subtítulo` (un `#` solo NO: el `<h1>` es el de la
 *       sección)
 *   párrafos (dos saltos separan; un salto simple une)
 *   `- item` / `* item` · `1. item`, y **un nivel** de anidado con 4 espacios o un tab
 *   una tabla con pipes y su fila de guiones, que se pinta con la `Table` del kit
 *   `> [!REGLA]` · `> [!OJO]` · `> [!NUNCA]`, que se pintan con el `Notice` del kit
 *   `**negrita**` · `_cursiva_` · `` `código` `` · ```` ``` ```` para un bloque
 *   `[texto](url)` con http://, https:// o una ruta interna `/…`
 *
 * Y nada más: sin imágenes, sin citas comunes, sin HTML, sin tachado, sin dos niveles de anidado.
 * Las URL sueltas **no** se autolinkean: si querés un link, corchetes.
 *
 * # Por qué el ancla la calcula el PARSER y no la pantalla
 *
 * Cada título sale con su `ancla` —su nombre en la URL— y con eso `indiceDe` arma la tabla de
 * contenidos. Podría hacerlo el componente, pero **la única forma de que dos títulos iguales no
 * terminen con la misma ancla es verlos a los dos**, y el que ve el documento entero es este. Un
 * manual con dos «Cómo se hace» mandaría siempre al primero, en silencio.
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

/**
 * Un renglón de lista, con su sub-lista si la tiene.
 *
 * ⚠️ **Un solo nivel de anidado, y el sub no puede volver a anidar** — por eso `items` de adentro es
 * `Trozo[][]` y no `ItemLista[]`. Dos niveles ya no es una lista: es un procedimiento que hay que
 * partir en dos manuales, y el tipo lo dice para que no haya que acordarse.
 */
export type ItemLista = { hijos: Trozo[]; sub?: { ordenada: boolean; items: Trozo[][] } }

/** De qué lado se pega el contenido de una columna. Sale de la fila de guiones. */
export type Alineacion = 'izq' | 'centro' | 'der'

/** Los tres tonos de recuadro. Ver `RECUADROS`. */
export type TonoRecuadro = 'regla' | 'ojo' | 'nunca'

export type Bloque =
  /** `ancla` es única dentro del documento: ver `aAncla` y el encabezado. */
  | { t: 'titulo'; nivel: 2 | 3 | 4; hijos: Trozo[]; ancla: string }
  | { t: 'parrafo'; hijos: Trozo[] }
  | { t: 'lista'; ordenada: boolean; items: ItemLista[] }
  | { t: 'codigo'; texto: string }
  /** `alineacion` tiene una entrada por columna del encabezado, y las filas ya vienen emparejadas. */
  | { t: 'tabla'; encabezado: Trozo[][]; alineacion: Alineacion[]; filas: Trozo[][][] }
  | { t: 'recuadro'; tono: TonoRecuadro; parrafos: Trozo[][] }

const VINETA = /^ {0,3}[-*]\s+(.*)$/
const NUMERO = /^ {0,3}\d+\.\s+(.*)$/
/**
 * El sub-renglón: **4 espacios o un tab**, y no 2.
 *
 * 🔴 El patrón de arriba acepta hasta 3 espacios de sangría, así que en los manuales que ya están
 * escritos un ítem con 2 espacios adelante **ya es de primer nivel**. Pedir 4 deja intacto todo lo
 * cargado; pedir 2 le cambiaría la forma a lo que nadie tocó.
 */
const SUB_VINETA = /^(?:\t| {4,})[-*]\s+(.*)$/
const SUB_NUMERO = /^(?:\t| {4,})\d+\.\s+(.*)$/
const TITULO = /^(#{2,4})\s+(.*)$/
const CERCA = /^\s*```/
/** Una línea de cita: `> lo que sea`. El rótulo se mira aparte. */
const CITA = /^ {0,3}>\s?(.*)$/
/** Los tres rótulos, en castellano porque los lee y los escribe el equipo, no un programador. */
const RECUADROS: Record<string, TonoRecuadro> = { REGLA: 'regla', OJO: 'ojo', NUNCA: 'nunca' }
const ROTULO = /^\[!([A-ZÁÉÍÓÚÑ]+)\]\s*$/i

/** El texto pelado de una línea ya parseada: `**Cómo** se hace` → `Cómo se hace`. */
const textoDe = (ts: Trozo[]) => ts.map((t) => t.v).join('')

/**
 * El nombre de un título en la URL.
 *
 * Sin acentos y sin eñe (`configuración` → `configuracion`) porque el ancla viaja en un link que se
 * copia y se pega en WhatsApp, y ahí un carácter no-ASCII se escapa a `%CC%81` y el link deja de
 * leerse. Se corta a 60: un título largo hace un link impresentable y no agrega nada.
 *
 * ⚠️ Puede quedar vacía —un título que es sólo un emoji— y por eso el llamador tiene un fallback:
 * un `id` vacío no es un ancla rota, es un ancla que apunta a cualquier lado.
 */
function aAncla(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Las celdas de una fila de tabla.
 *
 * Se parte por los `|` que **no** vienen escapados, y recién después se desescapa `\|`: si no, una
 * dirección como `Rioja 1234 \| timbre 2` se cortaría en dos columnas. Los pipes de los bordes se
 * descartan, así que `| a | b |` y `a | b` dan lo mismo — nadie escribe la tabla dos veces igual.
 */
function celdasDe(linea: string): string[] {
  const crudo = linea.trim().replace(/^\|/, '').replace(/\|$/, '')
  return crudo.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
}

/**
 * ¿Esta línea es la fila de guiones, la que convierte un párrafo con pipes en una tabla?
 *
 * 🔑 **Sin ella no hay tabla**, y eso es deliberado: un renglón suelto con un pipe adentro es texto,
 * no una tabla de una fila. Es la misma regla de oro de todo el parser —lo que no matchea se muestra
 * tal cual— aplicada al caso en que equivocarse cuesta más caro.
 */
function alineacionesDe(linea: string): Alineacion[] | null {
  if (!linea.includes('-')) return null
  const celdas = celdasDe(linea)
  if (!celdas.length || !celdas.every((c) => /^:?-{2,}:?$/.test(c))) return null
  return celdas.map((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'centro' : c.endsWith(':') ? 'der' : 'izq',
  )
}

export function parsearMd(texto: string): Bloque[] {
  const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
  const bloques: Bloque[] = []
  let parrafo: string[] = []
  // Cuántas veces se usó cada ancla. La segunda «Cómo se hace» es `como-se-hace-2`, como GitHub:
  // repetir el nombre haría que el índice mandara siempre a la primera y nadie sabría por qué.
  const anclasUsadas = new Map<string, number>()
  const anclaUnica = (base: string) => {
    const raiz = base || 'titulo'
    const n = (anclasUsadas.get(raiz) || 0) + 1
    anclasUsadas.set(raiz, n)
    return n === 1 ? raiz : `${raiz}-${n}`
  }

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
      const hijos = parsearTrozos(tit[2])
      bloques.push({
        t: 'titulo',
        nivel: tit[1].length as 2 | 3 | 4,
        hijos,
        ancla: anclaUnica(aAncla(textoDe(hijos))),
      })
      continue
    }

    // Un recuadro: `> [!REGLA]` y abajo lo que dice. ⚠️ Va ANTES de la tabla y de las listas
    // porque una cita puede tener adentro cualquiera de las dos.
    const cita = CITA.exec(linea)
    if (cita) {
      const rot = ROTULO.exec(cita[1].trim())
      const tono = rot ? RECUADROS[rot[1].toUpperCase()] : undefined
      if (tono) {
        cerrarParrafo()
        // Los renglones de adentro, hasta que se corta la cita. Un `>` vacío separa párrafos: es
        // la única forma de escribir dos ideas en un recuadro sin cerrarlo y volver a abrirlo.
        const trozos: string[][] = [[]]
        i++
        while (i < lineas.length) {
          const c = CITA.exec(lineas[i])
          if (!c) break
          const t = c[1].trim()
          if (t) trozos[trozos.length - 1].push(t)
          else if (trozos[trozos.length - 1].length) trozos.push([])
          i++
        }
        i-- // la del for
        bloques.push({
          t: 'recuadro',
          tono,
          parrafos: trozos.filter((p) => p.length).map((p) => parsearTrozos(p.join(' '))),
        })
        continue
      }
      // Un `>` que no abre con uno de los tres rótulos NO es un recuadro: cae a párrafo y se ve
      // tal cual, con el `>` adelante. No se inventa una cita común, que acá no existe.
    }

    // Una tabla: esta línea tiene celdas y **la de abajo es la fila de guiones**. Sin esa fila, es
    // un párrafo con pipes adentro.
    if (linea.includes('|')) {
      const alineacion = i + 1 < lineas.length ? alineacionesDe(lineas[i + 1]) : null
      if (alineacion) {
        cerrarParrafo()
        const encabezado = celdasDe(linea)
        // Las columnas las manda el encabezado: una fila corta se rellena y una larga se corta. Es
        // lo mismo que hace el `<table>` del navegador y evita una tabla dentada por un pipe de más.
        const anchoDe = (celdas: string[]) =>
          Array.from({ length: encabezado.length }, (_, c) => parsearTrozos(celdas[c] ?? ''))
        const filas: Trozo[][][] = []
        i += 2
        while (i < lineas.length && lineas[i].includes('|')) {
          filas.push(anchoDe(celdasDe(lineas[i])))
          i++
        }
        i-- // la del for
        bloques.push({
          t: 'tabla',
          encabezado: encabezado.map((c) => parsearTrozos(c)),
          // La fila de guiones puede traer menos columnas que el encabezado: lo que falta va al
          // default, que es a la izquierda.
          alineacion: encabezado.map((_, c) => alineacion[c] ?? 'izq'),
          filas,
        })
        continue
      }
    }

    const esVineta = VINETA.exec(linea)
    const esNumero = esVineta ? null : NUMERO.exec(linea)
    if (esVineta || esNumero) {
      cerrarParrafo()
      const ordenada = !esVineta
      const patron = ordenada ? NUMERO : VINETA
      const items: ItemLista[] = []
      while (i < lineas.length) {
        const m = patron.exec(lineas[i])
        if (m) {
          items.push({ hijos: parsearTrozos(m[1]) })
          i++
          continue
        }
        // Un sub-renglón: se cuelga del último ítem. Siempre hay uno, porque para entrar acá la
        // primera línea tuvo que ser de primer nivel: **un renglón sangrado NO abre una lista**, y
        // por eso un manual que arranca sangrado cae a párrafo y se ve tal cual.
        const subV = SUB_VINETA.exec(lineas[i])
        const subN = subV ? null : SUB_NUMERO.exec(lineas[i])
        const sub = subV || subN
        if (!sub) break
        const ultimo = items[items.length - 1]
        // La sub-lista es ordenada o no según SU primer renglón, no según la de afuera: unos pasos
        // numerados adentro de una viñeta es lo normal en un procedimiento.
        if (!ultimo.sub) ultimo.sub = { ordenada: !subV, items: [] }
        ultimo.sub.items.push(parsearTrozos(sub[1]))
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

/**
 * Los títulos de un documento, en orden: la tabla de contenidos.
 *
 * 🔑 **Es una función y no un `useMemo` adentro del componente** porque es lo que hace que el índice
 * se pueda probar sin montar nada: dos títulos iguales, un título con formato adentro, un manual
 * sin ningún título. Lo que la pantalla decide es si dibujarlo; qué dice, se decide acá.
 *
 * ⚠️ **Un solo título no es un índice**: el llamador lo dibuja recién con dos o más. Un índice de un
 * renglón ocupa lugar y no ahorra ningún scroll.
 */
export function indiceDe(bloques: Bloque[]): { nivel: 2 | 3 | 4; texto: string; ancla: string }[] {
  return bloques
    .filter((b): b is Extract<Bloque, { t: 'titulo' }> => b.t === 'titulo')
    .map((b) => ({ nivel: b.nivel, texto: textoDe(b.hijos), ancla: b.ancla }))
}
