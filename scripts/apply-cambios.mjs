// Aplica sql/migrate-cambios.sql a las bases de BDI y ZATTIA (crea la tabla `cambios`). Idempotente.
// Uso: node scripts/apply-cambios.mjs
import { readFileSync } from 'fs'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
function parse(raw) { const a = raw.slice(raw.indexOf('://') + 3), at = a.lastIndexOf('@'); const up = a.slice(0, at), hp = a.slice(at + 1), ci = up.indexOf(':'), s = hp.indexOf('/'); return { user: up.slice(0, ci), password: up.slice(ci + 1), host: hp.slice(0, s).split(':')[0], port: Number(hp.slice(0, s).split(':')[1]) || 5432, database: hp.slice(s + 1).split('?')[0] } }
const sql = ['sql/migrate-cambios.sql', 'sql/migrate-cambios-2.sql', 'sql/migrate-cambios-3.sql', 'sql/migrate-cambios-4.sql'].map((f) => readFileSync(f, 'utf8')).join('\n;\n')

for (const [nombre, url] of [['BDI', env.DATABASE_URL_BDI], ['ZATTIA', env.DATABASE_URL_ZATTIA]].filter(([, u]) => u)) {
  const c = new pg.Client({ ...parse(url), ssl: { rejectUnauthorized: false } })
  try {
    await c.connect(); await c.query('BEGIN'); await c.query(sql); await c.query('COMMIT')
    const r = await c.query('select count(*)::int n from cambios')
    console.log(`✓ ${nombre} (${c.host}): cambios lista — ${r.rows[0].n} filas`)
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); console.log(`✗ ${nombre}: ${e.message}`) } finally { await c.end().catch(() => {}) }
}
console.log('\nListo.')
