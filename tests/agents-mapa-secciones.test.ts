import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SECCION_AREA } from '@/lib/permisos'

/**
 * El mapa de secciones de `AGENTS.md`, amarrado al código.
 *
 * Este archivo existe porque el mapa **derivó en silencio**: el 15-ago-2026 decía "46 secciones" y
 * el código tenía 49 — faltaban `envios`, `agenda` y `liquidacion`. Nadie lo notó porque un mapa
 * incompleto no rompe nada: simplemente manda a buscar a una carpeta que no figura, o peor, hace
 * creer que la sección no existe. Y `AGENTS.md` se carga en **cada** sesión de IA, así que una línea
 * equivocada ahí se paga en todas.
 *
 * 🔑 **Compara en las dos direcciones a propósito.** Que toda sección del código esté en el mapa
 * caza la sección nueva sin documentar; que todo lo que el mapa nombra exista en el código caza la
 * entrada vieja que quedó después de borrar una sección — que es la que hace perder más tiempo,
 * porque manda a buscar algo que no está.
 *
 * ⛔ **Esto NO exige que cada sección tenga ficha.** Se descartó ese test: obligaría a escribir las
 * 49 de una o a llenar el archivo de excepciones, y choca con el plan de escribirlas de a una,
 * cuando alguien entra a tocar la sección. Lo que se amarra acá es el mapa, que cuesta nada.
 */

const raiz = fileURLToPath(new URL('..', import.meta.url))
const agents = readFileSync(`${raiz}/AGENTS.md`, 'utf8')

/** El bloque del mapa, no el archivo entero: afuera se nombran secciones al pasar y no son el mapa. */
const mapa = agents.slice(agents.indexOf('## Mapa de secciones'), agents.indexOf('## Comandos'))

/**
 * La fuente de verdad del mapa es el **registro de componentes**, no `SECCION_AREA`.
 *
 * 🔑 Son dos listas distintas y no es un descuido: `SECCION_AREA` es el catálogo de permisos (47) y
 * el registro es lo que la app sabe montar (49). La diferencia son `inicio` y `usuarios`, que no
 * tienen área. El mapa promete "acá está el archivo de cada sección", así que lo que tiene que
 * cubrir es el registro — si mirara el catálogo, esas dos podrían faltar para siempre.
 *
 * 🔑 **Se lee el fuente con una regex en vez de importarlo**: `registro.ts` hace `dynamic()` sobre
 * las 49 pantallas, así que importarlo desde un test de Node arrastra el árbol entero de la app.
 */
const fuenteRegistro = readFileSync(`${raiz}/components/secciones/registro.ts`, 'utf8')
const DEL_CODIGO = [...fuenteRegistro.matchAll(/^ {2}'?([a-z][a-z0-9-]*)'?:/gm)].map((m) => m[1]).sort()

/**
 * Palabras entre backticks del bloque que **no** son una sección. Es una lista corta y a mano
 * porque el mapa es prosa: `key` es el encabezado de la notación y `store` aparece diciendo que
 * `memo` no tiene. Todo lo demás se descarta solo por la forma (rutas con `/`, mayúsculas, `?` o `.`).
 */
const NO_SON_SECCIONES = new Set(['key', 'store'])

/**
 * Lo que el mapa nombra como sección: el contenido de cada backtick, cortado en el `→` (el mapa
 * escribe `fundas-modelo → components/fundas + lib/fundas` adentro de un solo par) y filtrado por
 * la forma de una key.
 */
function seccionesQueNombraElMapa(texto: string): string[] {
  const enBackticks = [...texto.matchAll(/`([^`]+)`/g)].map((m) => m[1])
  const candidatas = enBackticks
    .map((t) => t.split('→')[0].trim())
    .filter((t) => /^[a-z][a-z0-9-]*$/.test(t))
    .filter((t) => !NO_SON_SECCIONES.has(t))
  return [...new Set(candidatas)].sort()
}

describe('el mapa de secciones de AGENTS.md dice la verdad', () => {
  const NOMBRADAS = new Set(seccionesQueNombraElMapa(mapa))

  /**
   * La dirección que caza la sección nueva: se agregó al registro y nadie tocó el mapa.
   *
   * 🔴 **Va contra las secciones que el mapa NOMBRA, no contra `mapa.includes(key)`.** La primera
   * versión hacía lo segundo y **daba verde con `envios` borrado del mapa**, porque la palabra
   * seguía apareciendo adentro de `components/envios/` en otra línea. Se cazó mutando.
   */
  it('toda sección del código figura en el mapa', () => {
    const faltan = DEL_CODIGO.filter((k) => !NOMBRADAS.has(k))
    expect(faltan, `secciones sin entrada en el mapa: ${faltan.join(' · ')}`).toEqual([])
  })

  // La otra dirección: la entrada que sobrevivió al borrado de la sección y manda a buscar humo.
  it('toda sección que el mapa nombra existe en el código', () => {
    const sobran = [...NOMBRADAS].filter((k) => !DEL_CODIGO.includes(k))
    expect(sobran, `el mapa nombra secciones que no existen: ${sobran.join(' · ')}`).toEqual([])
  })

  // El número escrito arriba del mapa. Es lo primero que se lee y era justo lo que estaba mal.
  it('el total declarado es el del código', () => {
    const m = mapa.match(/^(\d+) secciones\./m)
    expect(m, 'el mapa dejó de declarar cuántas secciones son').not.toBeNull()
    expect(Number(m![1])).toBe(DEL_CODIGO.length)
  })
})

/**
 * El tercer lado del triángulo. `permisos-espejo.test.ts` ya ata `SECCION_AREA` a `PERM_CAT`, pero
 * nadie ataba ninguno de los dos al registro: una sección podía tener pantalla y no tener área —que
 * es la puerta por la que ninguna función la hereda— sin que nada lo dijera.
 *
 * 🔴 **No se afirma que sean iguales, se afirma la diferencia exacta.** Son dos hoy (`inicio` y
 * `usuarios`, que se ven sin permiso), y clavar la lista es lo que hace que la tercera se note: con
 * un `toEqual` habría que aflojarlo cada vez, y con nada, una sección nueva sin área pasa entera.
 * ⚠️ Que una sección esté acá **no dice cómo se autoriza** — `inicio` está en `KEYS_PARA_TODOS` y
 * `usuarios` no. Eso vive en `puedeVer`, no en esta lista.
 */
/**
 * Las fichas y sus punteros, atados.
 *
 * 🔑 **Una ficha que nadie manda leer es una ficha muerta.** Se midió el 15-ago-2026 que un
 * `CLAUDE.md` adentro de la carpeta de la sección **no se inyecta solo**: si el índice de
 * `AGENTS.md` no la nombra, la ficha existe y no la abre nadie. Y al revés, un puntero que quedó
 * apuntando a un archivo borrado manda a buscar humo en cada sesión.
 *
 * ⛔ **Esto sigue sin exigir ficha por sección.** Sólo amarra las que ya existen: se pueden tener
 * dos fichas y 47 secciones sin, que es exactamente el plan.
 */
describe('cada ficha tiene su puntero, y cada puntero su ficha', () => {
  const dirFichas = `${raiz}/docs/secciones`
  const indice = agents.slice(agents.indexOf('## Fichas de sección'), agents.indexOf('## Mapa de secciones'))

  /** `_plantilla.md` no es una ficha: es el molde, y no se lee al entrar a ninguna sección. */
  const fichas = existsSync(dirFichas)
    ? readdirSync(dirFichas).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort()
    : []

  it('el índice de AGENTS.md nombra a todas las fichas', () => {
    const sinPuntero = fichas.filter((f) => !indice.includes(`docs/secciones/${f}`))
    expect(sinPuntero, `fichas que nadie manda leer: ${sinPuntero.join(' · ')}`).toEqual([])
  })

  it('todo puntero del índice apunta a una ficha que existe', () => {
    const apuntadas = [...indice.matchAll(/docs\/secciones\/([\w.-]+\.md)/g)].map((m) => m[1])
    const rotos = [...new Set(apuntadas)].filter((f) => !existsSync(`${dirFichas}/${f}`))
    expect(rotos, `punteros a archivos que no existen: ${rotos.join(' · ')}`).toEqual([])
  })

  /**
   * El índice es una orden, no un dato: si deja de estar redactado como orden, deja de servir.
   *
   * 🔴 **Se exige por puntero, no una vez para todo el bloque.** Mutado el 16-ago-2026: con un
   * `/leer/i` sobre el índice entero, escribir el puntero nuevo como «ver `docs/secciones/x.md`»
   * pasaba en VERDE — la palabra seguía apareciendo en los otros cuatro y en el encabezado. El
   * bug que este test existe para cazar es exactamente ese, y entra de a una ficha por vez.
   */
  it('cada puntero está redactado como orden', () => {
    // Una línea de puntero es la que nombra una ficha; el bullet puede seguir en la línea de abajo.
    const flojos = indice
      .split(/\n(?=- )/)
      .filter((b) => /docs\/secciones\/[\w.-]+\.md/.test(b) && !/leer/i.test(b))
      .map((b) => b.match(/docs\/secciones\/([\w.-]+\.md)/)?.[1] ?? b.slice(0, 40))
    expect(flojos, `punteros que no mandan leer: ${flojos.join(' · ')}`).toEqual([])
  })
})

describe('el registro y el catálogo de permisos', () => {
  const SIN_AREA = ['inicio', 'usuarios']

  it('las únicas secciones sin área son las conocidas', () => {
    const sinArea = DEL_CODIGO.filter((k) => !(k in SECCION_AREA))
    expect(sinArea, `sección sin área en SECCION_AREA: ${sinArea.join(' · ')}`).toEqual(SIN_AREA)
  })

  it('el catálogo no tiene secciones que no se puedan montar', () => {
    const sinPantalla = Object.keys(SECCION_AREA).filter((k) => !DEL_CODIGO.includes(k))
    expect(sinPantalla, `con área y sin componente: ${sinPantalla.join(' · ')}`).toEqual([])
  })
})
