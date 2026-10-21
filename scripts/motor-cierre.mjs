/**
 * El CIERRE de imports del motor (auditoría 20-oct, «copia sin deriva»): qué archivos de `areben-motor` hacen falta para
 * que ande lo que el monitor usa. Reemplaza a la lista fija de carpetas de `traer-motor.mjs`, que ya rompió `main` una vez
 * (`1e8ea252`: el motor empezó a importar una carpeta que la lista no tenía).
 *
 * Parte de las ENTRADAS (los `exports` del motor + lo que el monitor importa de `motor/`) y sigue cada import relativo.
 * Frena — ⛔ copia a medias — si un import sale de `lib/`, apunta a un archivo que ⛔ está, o si un archivo lee algo por
 * `import.meta.url` (eso ⛔ es un import y la copia ⛔ lo traería).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

// `import … from 'x'`, `export … from 'x'`, `import 'x'`, `import('x')`. Los bare (`pg`, `node:fs`) ⛔ son del motor.
const IMPORTS = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm

// Sin comentarios: un tipo JSDoc (`{import('./x.mjs').T}`) ⛔ es un import.
const sinComentarios = (c) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

export function importsDe(codigo) {
  return [...sinComentarios(codigo).matchAll(IMPORTS)].map((m) => m[1] ?? m[2] ?? m[3]).filter((s) => s.startsWith('.'))
}

/** Las entradas que declara el `package.json` del motor (con los `*` expandidos), relativas al motor: `lib/…`. */
export function entradasDeExports(origen, exports) {
  return Object.values(exports).flatMap((destino) => {
    const d = normalize(destino)
    if (!d.includes('*')) return [d]
    const [antes, despues] = d.split('*')
    // `lib/arca/*.js` ⇒ la carpeta es `lib/arca` (⛔ `dirname('lib/arca/')`, que da `lib`).
    const carpeta = antes.endsWith('/') ? antes.slice(0, -1) : dirname(antes)
    const dir = join(origen, carpeta)
    return readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile() && join(carpeta, n).startsWith(antes) && n.endsWith(despues))
      .map((n) => join(carpeta, n))
  })
}

/** Los archivos del cierre, relativos al motor (`lib/venta/armar.mjs`, …), ordenados. */
export function cierre(origen, entradas) {
  const vistos = new Set()
  const pila = entradas.map((e) => normalize(e))
  while (pila.length) {
    const f = pila.pop()
    if (vistos.has(f)) continue
    if (!f.startsWith('lib/')) throw new Error(`${f}: el monitor sólo copia lib/ del motor`)
    if (!existsSync(join(origen, f))) throw new Error(`${f}: ⛔ está en el motor`)
    vistos.add(f)
    const codigo = readFileSync(join(origen, f), 'utf8')
    if (/import\.meta\.url/.test(codigo)) throw new Error(`${f}: lee un archivo por import.meta.url — la copia ⛔ lo traería`)
    for (const s of importsDe(codigo)) {
      const destino = normalize(join(dirname(f), s))
      if (destino.startsWith('..') || !destino.startsWith('lib/')) throw new Error(`${f}: importa «${s}», fuera de lib/`)
      pila.push(destino)
    }
  }
  return [...vistos].sort()
}

/** Lo que el monitor importa de `motor/X`, como `lib/X` del motor. `archivos`: rutas del monitor (sin `motor/`). */
export function entradasDelMonitor(raiz, archivos) {
  const usados = new Set()
  for (const a of archivos) {
    const codigo = readFileSync(join(raiz, a), 'utf8')
    for (const m of codigo.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]*\bmotor\/[^'"]+)['"]/g)) {
      const absoluto = normalize(join(dirname(a), m[1]))
      if (!absoluto.startsWith('motor/')) continue
      usados.add(join('lib', relative('motor', absoluto)))
    }
  }
  return [...usados].sort()
}
