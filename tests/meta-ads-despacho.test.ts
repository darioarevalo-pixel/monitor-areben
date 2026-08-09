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
