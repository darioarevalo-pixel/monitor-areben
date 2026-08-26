import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **El espejo entre lo que el cliente PIDE y lo que la puerta DESPACHA.**
 *
 * `api/meta-ads.js` es una sola función de Vercel —el techo de Hobby son 12 y hay 9— así que cada
 * recurso nuevo entra por `?recurso=` en vez de por un archivo propio. La consecuencia es que el
 * despacho es una cadena de `if` a mano, y **un recurso que no figura ahí no falla ruidosamente**:
 * cae al camino de abajo y contesta cualquier otra cosa.
 *
 * Pasó de verdad el 9-ago-2026 con `poda`: llegó a producción con typecheck, lint, las 2.308 pruebas,
 * el build y el CI enteros en verde, y la pantalla dibujando nada. El módulo estaba escrito, probado
 * y era inalcanzable. Ninguna prueba de lógica podía verlo, porque el defecto no estaba en la lógica.
 *
 * Este archivo no prueba comportamiento: **prueba que las dos listas coincidan**, igual que
 * `permisos-espejo.test.ts`. Es texto contra texto a propósito — el handler corre en Node sin pasar
 * por el compilador y no se puede importar desde acá.
 */

const raiz = join(__dirname, '..')
const puerta = readFileSync(join(raiz, 'api/meta-ads.js'), 'utf8')
const cliente = readFileSync(join(raiz, 'lib/meta-ads/cliente.ts'), 'utf8')

/** Todo `recurso: 'X'` y `recurso=X` que aparece en el cliente. Es lo que el browser va a pedir. */
function recursosQuePide(fuente: string): string[] {
  const out = new Set<string>()
  for (const m of fuente.matchAll(/recurso:\s*'([a-z-]+)'/g)) out.add(m[1])
  for (const m of fuente.matchAll(/[?&]recurso=([a-z-]+)/g)) out.add(m[1])
  return [...out].sort()
}

describe('meta-ads — la puerta despacha todo lo que el cliente pide', () => {
  it('el cliente pide varios recursos (si esto da cero, la extracción se rompió)', () => {
    // Sin esta aserción, un cambio de formato en el cliente dejaría la lista vacía y el test de
    // abajo pasaría siempre: una prueba que no puede fallar es peor que ninguna.
    expect(recursosQuePide(cliente).length).toBeGreaterThan(8)
  })

  it('cada recurso que pide el cliente está nombrado en el despacho', () => {
    const faltan = recursosQuePide(cliente).filter((r) => !puerta.includes(`'${r}'`))
    expect(faltan, `Sin despachar en api/meta-ads.js: ${faltan.join(', ')}`).toEqual([])
  })

  /**
   * ⛔ La invariante que frena todos los deploys sin error visible si se rompe: Vercel Hobby admite
   * 12 funciones y cada archivo de `api/` **sin** prefijo `_` cuenta como una. Va acá porque es la
   * razón por la que existe todo el mecanismo de `?recurso=`.
   */
  it('meta-ads sigue siendo UNA función y no un archivo por recurso', () => {
    const rutas = readFileSync(join(raiz, 'AGENTS.md'), 'utf8')
    expect(rutas).toContain('Vercel Hobby admite 12 funciones')
  })
})

/**
 * 🔴 **La OTRA puerta: `api/datos.js`.**
 *
 * Meta Ads entra por dos endpoints y no por uno. Lo que necesita hablar con Meta va por
 * `api/meta-ads.js`; lo que no —el tablero de ideas, el calendario, el umbral de rentabilidad— va
 * por `api/datos.js`, porque aquel corta con 500 si falta o vence `META_ADS_TOKEN` y sería absurdo
 * que la pantalla que dice si algo rinde dependa de un token de Meta.
 *
 * `datos.js` al menos contesta 400 «recurso inválido» y no se queda callado como `meta-ads.js`,
 * pero el 400 aparece **en producción y del lado del que abrió la pantalla**. Que las dos listas
 * coincidan se puede saber acá.
 */
describe('datos.js despacha todos los recursos que el cliente le pide', () => {
  const puertaDatos = readFileSync(join(raiz, 'api/datos.js'), 'utf8')

  /** Los `?recurso=X` que el código del navegador pide a `/api/datos`. */
  const pedidos = [...readFileSync(join(raiz, 'lib/meta-ads/rentabilidad.ts'), 'utf8')
    .matchAll(/\/api\/datos\?recurso=([a-z-]+)/g)].map((m) => m[1])

  it('la extracción encuentra algo (si da cero, el test no puede fallar)', () => {
    expect(pedidos.length).toBeGreaterThan(0)
  })

  it('cada recurso pedido está en el mapa RECURSOS', () => {
    const faltan = pedidos.filter((r) => !puertaDatos.includes(`'${r}'`))
    expect(faltan, `Sin despachar en api/datos.js: ${faltan.join(', ')}`).toEqual([])
  })
})

/**
 * 🔴 **El MISMO defecto, un piso más arriba: el menú pide una vista que el router no despacha.**
 *
 * `MetaAds.tsx` resuelve la vista con `VISTAS[vista] ?? Panel`. Ese `?? Panel` es deliberado —una
 * URL escrita a mano no tiene que romper nada— pero convierte un error de tipeo en el menú en una
 * pantalla que **dibuja el Panel sin decir una palabra**: se entra desde el sidebar, se ve algo
 * razonable, y nadie se entera de que la pantalla nueva es inalcanzable. Es exactamente cómo `poda`
 * llegó a producción con todo en verde.
 *
 * Texto contra texto, como el espejo de arriba: `nav.datos.ts` es data y `MetaAds.tsx` es un
 * componente de cliente que no se puede montar desde acá sin arrastrar medio Next.
 */
describe('meta-ads — el menú y el router nombran las mismas vistas', () => {
  const router = readFileSync(join(raiz, 'components/meta-ads/MetaAds.tsx'), 'utf8')
  const nav = readFileSync(join(raiz, 'lib/nav.datos.ts'), 'utf8')

  /** Los 2º tramos de `/meta-ads/<x>` que el sidebar ofrece. `/meta-ads` pelado es el Panel. */
  const delMenu = [...nav.matchAll(/"ruta":\s*"\/meta-ads\/([a-z-]+)"/g)].map((m) => m[1]).sort()

  /** Las claves del mapa `VISTAS`, más los alias que siguen en bookmarks. */
  const delRouter = [
    ...[...router.matchAll(/^ {2}([a-z-]+):\s*[A-Z]\w*,$/gm)].map((m) => m[1]),
    ...[...router.matchAll(/(\w+):\s*'[a-z-]+'/g)].map((m) => m[1]),
  ].sort()

  it('la extracción encuentra las dos listas (si alguna da cero, el test no puede fallar)', () => {
    // ⚠️ El del menú era `> 8` hasta el 26-ago-2026, cuando la sección pasó de once entradas a
    // cuatro (Rendimiento · Producir · Analizar · Configurar) y `/meta-ads` pelado no tiene 2º
    // tramo, así que la extracción ve tres. El guard no mide calidad: sólo que la expresión regular
    // siga encontrando algo. El del router sigue alto porque las once vistas viejas **no se
    // borraron**: siguen en `VISTAS` para los bookmarks y los `<Link>` del repo.
    expect(delMenu.length).toBeGreaterThan(2)
    expect(delRouter.length).toBeGreaterThan(8)
  })

  it('toda entrada del menú tiene su vista; si no, el sidebar lleva al Panel en silencio', () => {
    const huerfanas = delMenu.filter((r) => !delRouter.includes(r))
    expect(huerfanas, `En el menú pero sin despachar en MetaAds.tsx: ${huerfanas.join(', ')}`).toEqual([])
  })
})
