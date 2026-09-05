// Aplica sql/migrate-hallazgo-cierre.sql a la base de BDI del monitor.
// Lee DATABASE_URL_BDI del .env.
// Uso: node scripts/apply-hallazgo-cierre.mjs
//
// ⚠️ Va a UNA SOLA base, igual que apply-meta-reglas.mjs y por el mismo motivo: las cuentas
// publicitarias son compartidas entre líneas, así que las tres tablas de reglas viven en BDI.
// ⛔ Por eso NO entra por `scripts/aplicar-sql.mjs`, que aplica a las dos.
//
// Idempotente (`add column if not exists`): seguro re-correr. Agrega UNA columna nullable y ⛔ no
// toca ninguna fila — el cierre lo escribe después el reloj de las 07:50.
import { readFileSync } from 'fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const sql = readFileSync('sql/migrate-hallazgo-cierre.sql', 'utf8')

function parse(raw) {
  const afterProto = raw.slice(raw.indexOf('://') + 3)
  const at = afterProto.lastIndexOf('@')
  const userpass = afterProto.slice(0, at)
  const hostpart = afterProto.slice(at + 1)
  const ci = userpass.indexOf(':')
  const slash = hostpart.indexOf('/')
  const [host, port] = hostpart.slice(0, slash).split(':')
  return {
    user: userpass.slice(0, ci),
    password: userpass.slice(ci + 1),
    host,
    port: Number(port) || 5432,
    database: hostpart.slice(slash + 1).split('?')[0],
  }
}

const url = env.DATABASE_URL_BDI
if (!url) {
  console.error('Falta DATABASE_URL_BDI en .env')
  process.exit(1)
}

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  // 🔑 El oráculo: que la columna EXISTA, ⛔ no que el `query` no haya tirado. Un `if not exists`
  // sobre una tabla equivocada tampoco tira.
  const r = await client.query(
    `select count(*)::int as n from information_schema.columns
      where table_name = 'meta_ads_hallazgo' and column_name = 'cierre_motivo'`,
  )
  console.log(`✓ BDI (${cfg.host}): meta_ads_hallazgo.cierre_motivo ${r.rows[0].n ? 'está' : '⛔ NO está'}`)
  if (!r.rows[0].n) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
