#!/usr/bin/env node
/**
 * Trae al monitor una COPIA del motor del ERP (`areben-motor`, repo de Bruno) a la carpeta `motor/`.
 *
 *   node scripts/traer-motor.mjs [ruta del motor]     (por defecto ~/Projects/areben-libro-stock)
 *
 * 🔑 POR QUÉ UNA COPIA (Bruno, 14-oct): el motor es privado y vive en OTRA cuenta de GitHub. Importarlo
 * como dependencia pedía un token en Vercel y en los 20 workflows de este repo (todos hacen `npm ci`):
 * uno que quedara sin token se caía al instalar. La copia no pide nada: el monitor la importa como
 * cualquier archivo propio. El día que el motor se use en muchos lugares se pasa a dependencia.
 *
 * 🔴 `motor/` ⛔ se edita acá: se edita en `areben-motor` y se vuelve a traer. `tests/motor-copia.test.ts`
 * compara cada archivo con la huella que deja este script: si alguien lo tocó a mano, falla.
 *
 * Qué trae: lo que el motor EXPORTA para el monitor (`lib/venta`, `lib/arca`, `lib/cuentas`: la venta la importa desde la 020; `lib/stock`: el ajuste, desde la 026; `lib/cuenta`: la cuenta corriente, que la venta importa desde la 025), ⛔ el libro ni sus crons.
 * Sólo trae un motor sin cambios sin commitear y con su commit ya en GitHub (para que la versión anotada
 * se pueda ir a mirar).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

const ORIGEN = process.argv[2] || join(homedir(), 'Projects/areben-libro-stock')
const DESTINO = join(process.cwd(), 'motor')
const CARPETAS = ['lib/venta', 'lib/arca', 'lib/cuentas', 'lib/stock', 'lib/cuenta']
const git = (...a) => execFileSync('git', ['-C', ORIGEN, ...a], { encoding: 'utf8' }).trim()

if (!existsSync(join(ORIGEN, 'package.json'))) throw new Error(`No está el motor en ${ORIGEN}`)
const pkg = JSON.parse(readFileSync(join(ORIGEN, 'package.json'), 'utf8'))
if (pkg.name !== 'areben-motor') throw new Error(`${ORIGEN} no es areben-motor (es ${pkg.name})`)
const sucio = git('status', '--porcelain', '--', ...CARPETAS)
if (sucio) throw new Error(`El motor tiene cambios sin commitear en lo que se copia:\n${sucio}`)
const commit = git('rev-parse', 'HEAD')
git('fetch', '-q', 'origin')
if (!git('branch', '-r', '--contains', commit)) throw new Error(`El commit ${commit.slice(0, 8)} del motor no está en GitHub: pushealo primero`)

/** Todos los archivos de una carpeta, recursivo. */
const archivos = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? archivos(p) : [p]
})
export const huella = (ruta) => createHash('sha256').update(readFileSync(ruta)).digest('hex')

rmSync(DESTINO, { recursive: true, force: true })
mkdirSync(DESTINO, { recursive: true })
const lista = {}
for (const c of CARPETAS) {
  const desde = join(ORIGEN, c)
  const hacia = join(DESTINO, c.replace(/^lib\//, ''))
  cpSync(desde, hacia, { recursive: true })
  for (const f of archivos(hacia)) lista[relative(DESTINO, f)] = huella(f)
}
const version = { motor: pkg.name, version: pkg.version, commit, traido_en: new Date().toISOString(), archivos: lista }
writeFileSync(join(DESTINO, 'VERSION.json'), JSON.stringify(version, null, 2) + '\n')
writeFileSync(join(DESTINO, 'LEEME.md'), `# ⛔ No editar acá

Copia de \`areben-motor\` ${pkg.version} (commit \`${commit.slice(0, 8)}\`). Se edita en el motor y se trae con
\`node scripts/traer-motor.mjs\`. \`tests/motor-copia.test.ts\` falla si un archivo de acá no es el que se trajo.
`)
console.log(`✓ motor ${pkg.version} (${commit.slice(0, 8)}) → motor/: ${Object.keys(lista).length} archivos`)
