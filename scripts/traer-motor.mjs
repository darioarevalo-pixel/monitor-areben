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
 * Qué trae: el CIERRE de imports (`scripts/motor-cierre.mjs`) de lo que el motor EXPORTA y de lo que el monitor importa de
 * `motor/` — ⛔ una lista de carpetas a mano, que ya rompió `main` (`1e8ea252`). `lib/X` del motor queda en `motor/X`.
 * Sólo trae un motor sin cambios sin commitear en esos archivos y con su commit en `main` de GitHub: el CI
 * (`scripts/motor-en-main.mjs`) vuelve a chequear eso último, porque un commit de una rama ⛔ es el motor de nadie.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { cierre, entradasDelMonitor, entradasDeExports } from './motor-cierre.mjs'

const ORIGEN = process.argv[2] || join(homedir(), 'Projects/areben-libro-stock')
const DESTINO = join(process.cwd(), 'motor')
const git = (...a) => execFileSync('git', ['-C', ORIGEN, ...a], { encoding: 'utf8' }).trim()

if (!existsSync(join(ORIGEN, 'package.json'))) throw new Error(`No está el motor en ${ORIGEN}`)
const pkg = JSON.parse(readFileSync(join(ORIGEN, 'package.json'), 'utf8'))
if (pkg.name !== 'areben-motor') throw new Error(`${ORIGEN} no es areben-motor (es ${pkg.name})`)
const delMonitor = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.js', '*.mjs'], { encoding: 'utf8' }).split('\n').filter((f) => f && !f.startsWith('motor/') && f !== 'tests/motor-cierre.test.ts') // ese test trae imports de MENTIRA como fixture
const ARCHIVOS = cierre(ORIGEN, [...entradasDeExports(ORIGEN, pkg.exports), ...entradasDelMonitor(process.cwd(), delMonitor)])
const sucio = git('status', '--porcelain', '--', ...ARCHIVOS)
if (sucio) throw new Error(`El motor tiene cambios sin commitear en lo que se copia:\n${sucio}`)
const commit = git('rev-parse', 'HEAD')
git('fetch', '-q', 'origin')
try { git('merge-base', '--is-ancestor', commit, 'origin/main') } catch { throw new Error(`El commit ${commit.slice(0, 8)} del motor ⛔ está en main de GitHub: publicalo primero`) }

export const huella = (ruta) => createHash('sha256').update(readFileSync(ruta)).digest('hex')

rmSync(DESTINO, { recursive: true, force: true })
mkdirSync(DESTINO, { recursive: true })
const lista = {}
for (const f of ARCHIVOS) {
  const hacia = join(DESTINO, relative('lib', f))
  mkdirSync(dirname(hacia), { recursive: true })
  cpSync(join(ORIGEN, f), hacia)
  lista[relative(DESTINO, hacia)] = huella(hacia)
}
const version = { motor: pkg.name, version: pkg.version, commit, traido_en: new Date().toISOString(), archivos: lista }
writeFileSync(join(DESTINO, 'VERSION.json'), JSON.stringify(version, null, 2) + '\n')
writeFileSync(join(DESTINO, 'LEEME.md'), `# ⛔ No editar acá

Copia de \`areben-motor\` ${pkg.version} (commit \`${commit.slice(0, 8)}\`). Se edita en el motor y se trae con
\`node scripts/traer-motor.mjs\`. \`tests/motor-copia.test.ts\` falla si un archivo de acá no es el que se trajo.
`)
console.log(`✓ motor ${pkg.version} (${commit.slice(0, 8)}) → motor/: ${Object.keys(lista).length} archivos`)
