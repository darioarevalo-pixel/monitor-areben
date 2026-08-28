// Aplica sql/migrate-insumos.sql a la base de BDI.
//
// ⚠️ **A UNA sola base, a diferencia de los demás `apply-*`.** No es un olvido: una caja de bolsas
// no es de BDI ni de Zattia, así que el catálogo vive en la maestra de BDI y en ninguna otra. El
// motivo está en el encabezado del `.sql`. Mismo criterio que `apply-memo.mjs`.
//
// Uso: node scripts/apply-insumos.mjs
// Idempotente (create table if not exists): seguro re-correr.
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

const sql = readFileSync('sql/migrate-insumos.sql', 'utf8')

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
  const s = await client.query('select count(*)::int as n from insumo')
  const c = await client.query('select count(*)::int as n from insumo_movimiento')
  console.log(`✓ BDI (${cfg.host}): insumo ${s.rows[0].n} filas · insumo_movimiento ${c.rows[0].n} filas`)
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
