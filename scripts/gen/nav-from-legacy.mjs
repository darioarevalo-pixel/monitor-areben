// Genera lib/nav.generated.ts extrayendo PERM_CAT y NAV_CATS de index.html.
// Fuente de verdad = el legacy. Correr `node scripts/gen/nav-from-legacy.mjs --check`
// en CI para fallar si alguien toca el menú del legacy y no regenera.
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync('index.html', 'utf8')

function extraerBloque(nombre) {
  const i = html.indexOf(`const ${nombre} = [`)
  if (i < 0) throw new Error(`No encontré ${nombre} en index.html`)
  let d = 0, fin = -1
  for (let j = html.indexOf('[', i); j < html.length; j++) {
    const c = html[j]
    if (c === '[') d++
    else if (c === ']') { d--; if (d === 0) { fin = j + 1; break } }
  }
  if (fin < 0) throw new Error(`No pude cerrar el array de ${nombre}`)
  return html.slice(html.indexOf('[', i), fin)
}

// `_acc` no se usa dentro de PERM_CAT/NAV_CATS, así que un eval acotado alcanza.
const PERM_CAT = new Function(`return ${extraerBloque('PERM_CAT')}`)()
const NAV_CATS = new Function(`return ${extraerBloque('NAV_CATS')}`)()

const ts = `// GENERADO por scripts/gen/nav-from-legacy.mjs — NO editar a mano.
// La fuente de verdad es PERM_CAT / NAV_CATS en index.html. Si tocás el menú del
// legacy, corré: node scripts/gen/nav-from-legacy.mjs

export type Marca = 'bdi' | 'zattia'

export type PermSub = { key: string; label: string; info?: string; brands?: Marca[] }
export type PermCat = { key: string; label: string; info?: string; brands: Marca[]; subs?: PermSub[] }
export type NavCat = { id: string; label: string; keys: string[]; accent?: string; adminOnly?: boolean }

export const PERM_CAT: PermCat[] = ${JSON.stringify(PERM_CAT, null, 2)}

export const NAV_CATS: NavCat[] = ${JSON.stringify(NAV_CATS, null, 2)}
`

const destino = 'lib/nav.generated.ts'
if (process.argv.includes('--check')) {
  const actual = readFileSync(destino, 'utf8')
  if (actual !== ts) {
    console.error('✗ lib/nav.generated.ts está desactualizado respecto de index.html.')
    console.error('  Corré: node scripts/gen/nav-from-legacy.mjs')
    process.exit(1)
  }
  console.log('✓ nav sincronizado con el legacy')
} else {
  writeFileSync(destino, ts)
  console.log(`✓ ${destino}: ${PERM_CAT.length} entradas de PERM_CAT, ${NAV_CATS.length} categorías de nav`)
}
