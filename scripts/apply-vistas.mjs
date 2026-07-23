// Recrea las vistas materializadas de ventas en BDI y ZATTIA con el filtro de canal "Ninguno"
// (excluir ventas técnicas del Monitor). Ejecuta sql/vistas-materializadas.sql + reañade los GRANT
// SELECT a anon/authenticated (por si el DROP+CREATE los perdiera). Transacción por base, con verificación.
// Uso: node scripts/apply-vistas.mjs
import { readFileSync } from 'fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
function parse(raw) {
  const a = raw.slice(raw.indexOf('://') + 3), at = a.lastIndexOf('@')
  const up = a.slice(0, at), hp = a.slice(at + 1), ci = up.indexOf(':'), s = hp.indexOf('/')
  return { user: up.slice(0, ci), password: up.slice(ci + 1), host: hp.slice(0, s).split(':')[0], port: Number(hp.slice(0, s).split(':')[1]) || 5432, database: hp.slice(s + 1).split('?')[0] }
}

const VIEWS = ['ventas_por_mes', 'ventas_por_categoria_mes', 'fundas_por_modelo_mes']
const baseSql = readFileSync('sql/vistas-materializadas.sql', 'utf8')
const grants = VIEWS.map((v) => `GRANT SELECT ON ${v} TO anon, authenticated;`).join('\n')
const sql = `${baseSql}\n\n-- Reañadir permisos de lectura (por si el DROP+CREATE los perdió):\n${grants}\n`

const targets = [['BDI', env.DATABASE_URL_BDI], ['ZATTIA', env.DATABASE_URL_ZATTIA]].filter(([, u]) => u)
if (!targets.length) { console.error('Faltan DATABASE_URL_BDI / DATABASE_URL_ZATTIA en .env'); process.exit(1) }

for (const [nombre, url] of targets) {
  const c = new pg.Client({ ...parse(url), ssl: { rejectUnauthorized: false } })
  try {
    await c.connect()
    await c.query('BEGIN')
    await c.query(sql)
    await c.query('COMMIT')
    console.log(`\n✓ ${nombre} (${c.host}) — vistas recreadas`)
    for (const v of VIEWS) {
      const def = await c.query(`select pg_get_viewdef($1::regclass) as def`, [v])
      const filtro = /Ninguno/i.test(def.rows[0].def)
      const filas = (await c.query(`select count(*)::int n from ${v}`)).rows[0].n
      const anon = (await c.query(`select has_table_privilege('anon', $1::regclass, 'SELECT') as ok`, [v])).rows[0].ok
      console.log(`    ${v}: ${filas} filas · filtro ${filtro ? '✓' : '✗ FALTA'} · anon SELECT ${anon ? '✓' : '✗ FALTA'}`)
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    console.log(`\n✗ ${nombre}: ${e.message} (ROLLBACK, sin cambios)`)
  } finally {
    await c.end().catch(() => {})
  }
}
console.log('\nListo.')
