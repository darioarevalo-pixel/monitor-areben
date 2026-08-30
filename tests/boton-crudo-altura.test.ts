import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `.shell-content button` FIJA LA ALTURA de todo `<button>` crudo.
 *
 * 🔴 **Sale de un defecto real, y de que el invariante ya estaba escrito y se pisó igual.** El
 * 26-ago-2026 la tira de días de Meta se dibujó con `<button>` de cuatro renglones —día, pedidos,
 * la barrita del gasto, el costo— y el bloque legacy de `app/globals.css` los dejó de un renglón:
 * **los números salieron cortados por la mitad, afuera de su caja**. Está en `AGENTS.md` como
 * invariante desde antes, en una línea sola, y una línea de `AGENTS.md` no frena a nadie.
 *
 * 🔑 **Por eso esto es un test y no un comentario.** La regla del kit es usar `<Button>`; cuando
 * hace falta un `<button>` crudo —una tarjeta clickeable, un link que escribe— tiene que traer su
 * `height` explícita.
 *
 * ⚠️ Es un test de TEXTO, no de render: no sabe cuántos renglones tiene el botón. Pide `height`
 * siempre, que es barato y no tiene falsos negativos. Un `<button>` de un renglón que quiera la
 * altura del kit escribe `height: 'var(--mo-ctl-h)'` y dice que la quiere.
 *
 * # 🔴 Dos agujeros que tenía este test, encontrados el 30-ago-2026
 *
 *  1. **Barría DOS carpetas** —`zona` y `parte`— cuando el invariante es de todo lo que se dibuja
 *     adentro de `.shell-content`. Los botones nuevos de `acciones/BotonesAccion.tsx` quedaban
 *     afuera, y son los que se repiten **una vez por fila en dos tablas**.
 *  2. 🔑 **Sólo contaba `height: '…'` con comilla**, o sea alturas de TEXTO. Un `height: 28` —que es
 *     lo natural para un botón de ícono— ⛔ no lo veía: el test daba verde sobre un botón sin altura
 *     declarada. Es el mismo defecto que ya tiene su nota en `vocabulario.test.ts`: **un barrido que
 *     describe la sintaxis en vez de la forma se queda ciego justo donde el código es más denso.**
 *
 * ⚠️ **`components/ui` entero queda AFUERA a propósito, y ⛔ no es un olvido.** Medido el mismo día:
 * nueve archivos del kit tienen `<button>` crudo sin altura —`Tabs`, `MenuMulti`, `FilterBar`,
 * `PasoCantidad`, `Notice`, `Button` (que la pone por CSS)— y varios ⛔ no se dibujan adentro de
 * `.shell-content`. Meterlos de una haría un test rojo que alguien apaga. Entra **archivo por
 * archivo**, y el primero es `MenuAcciones`, que nació para las filas de Meta.
 */

/**
 * Dónde vive lo que se dibuja adentro de `.shell-content`. Carpetas y archivos sueltos.
 */
const RAICES = ['components/meta-ads', 'components/ui/MenuAcciones.tsx']

function tsx(dir: string): string[] {
  if (!statSync(dir).isDirectory()) return dir.endsWith('.tsx') ? [dir] : []
  const salida: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) salida.push(...tsx(p))
    else if (n.endsWith('.tsx')) salida.push(p)
  }
  return salida
}

describe('un `<button>` crudo declara su altura', () => {
  const archivos = RAICES.flatMap(tsx)

  it('hay archivos que revisar (si no, este test pasa por vacío)', () => {
    expect(archivos.length).toBeGreaterThan(0)
  })

  for (const f of archivos) {
    // ⚠️ **Los comentarios se sacan ANTES de contar.** Sin esto, este mismo archivo y el docblock de
    // `TiraDeDias` —que EXPLICAN el defecto nombrando `<button>`— se contaban como botones y el test
    // fallaba sobre su propia explicación. Un test que se dispara con la prosa es un test que se
    // termina desactivando.
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    // `<button` crudo, ⛔ no `<Button` del kit, que ya resuelve la altura.
    const crudos = src.split(/<button\b/).length - 1
    if (!crudos) continue
    it(`${f}: sus ${crudos} \`<button>\` crudos llevan \`height\``, () => {
      // 🔑 Cuenta la FORMA y ⛔ no la sintaxis: `height: 28`, `height: 'auto'`, `height:
      // 'var(--mo-ctl-h)'` y `height: alto` son todos una altura declarada. Lo único que ⛔ no
      // cuenta es `height` seguido de nada.
      const alturas = src.split(/\bheight:\s*\S/).length - 1
      expect(alturas, `«${f}» dibuja ${crudos} <button> crudos y declara ${alturas} \`height\`. ` +
        'El bloque legacy de app/globals.css les fija `var(--mo-ctl-h)` y un botón de dos renglones se desborda.',
      ).toBeGreaterThanOrEqual(crudos)
    })
  }
})
