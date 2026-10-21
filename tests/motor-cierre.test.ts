/** El cierre de imports de `scripts/motor-cierre.mjs` (lo que `traer-motor.mjs` copia del motor). */
import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { cierre, entradasDeExports, entradasDelMonitor, importsDe } from '../scripts/motor-cierre.mjs'

const motor = (archivos: Record<string, string>) => {
  const d = mkdtempSync(join(tmpdir(), 'motor-'))
  for (const [f, s] of Object.entries(archivos)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), s) }
  return d
}

describe('cierre de imports del motor', () => {
  it('sigue los imports relativos (también entre carpetas, multilínea y dinámicos) y deja los bare', () => {
    const d = motor({
      'lib/venta/registrar.mjs': "import pg from 'pg'\nimport {\n  a,\n  b,\n} from './armar.mjs'\nexport { x } from '../cuenta/libro.mjs'\nconst m = await import('../stock/ajuste.mjs')\n/** @param {import('pg').ClientBase} db */",
      'lib/venta/armar.mjs': "import { randomUUID } from 'node:crypto'",
      'lib/cuenta/libro.mjs': "import './nada-mas.mjs'",
      'lib/cuenta/nada-mas.mjs': '',
      'lib/stock/ajuste.mjs': '',
      'lib/suelto.mjs': '',
    })
    expect(cierre(d, ['lib/venta/registrar.mjs'])).toEqual(['lib/cuenta/libro.mjs', 'lib/cuenta/nada-mas.mjs', 'lib/stock/ajuste.mjs', 'lib/venta/armar.mjs', 'lib/venta/registrar.mjs'])
  })
  it('frena: import que ⛔ está, que sale de lib/, o lectura por import.meta.url', () => {
    expect(() => cierre(motor({ 'lib/a.mjs': "import './b.mjs'" }), ['lib/a.mjs'])).toThrow(/lib\/b.mjs: ⛔ está/)
    expect(() => cierre(motor({ 'lib/a.mjs': "import '../bin/x.mjs'", 'bin/x.mjs': '' }), ['lib/a.mjs'])).toThrow(/fuera de lib/)
    expect(() => cierre(motor({ 'lib/a.mjs': "readFileSync(new URL('../sql/x.sql', import.meta.url))" }), ['lib/a.mjs'])).toThrow(/import.meta.url/)
  })
  it('las entradas: exports (con *) y lo que el monitor importa de motor/', () => {
    const d = motor({ 'lib/arca/a.js': '', 'lib/arca/b.js': '', 'lib/arca/c.mjs': '', 'lib/venta/registrar.mjs': '' })
    expect(entradasDeExports(d, { './venta': './lib/venta/registrar.mjs', './arca/*': './lib/arca/*.js' }).sort()).toEqual(['lib/arca/a.js', 'lib/arca/b.js', 'lib/venta/registrar.mjs'])
    const m = motor({ 'api/_erp.js': "import { x } from '../motor/venta/registrar.mjs'\nconst y = await import('../motor/arca/a.js')", 'lib/caja/z.ts': "import { a } from '../../motor/cuenta/cuenta.mjs'\nimport b from './motor/no.mjs'" })
    expect(entradasDelMonitor(m, ['api/_erp.js', 'lib/caja/z.ts'])).toEqual(['lib/arca/a.js', 'lib/cuenta/cuenta.mjs', 'lib/venta/registrar.mjs'])
  })
  it('importsDe ⛔ toma bare ni tipos JSDoc', () => {
    expect(importsDe("import pg from 'pg'\n/** @type {import('./x.mjs').T} */\nimport './y.mjs'")).toEqual(['./y.mjs'])
  })
})
