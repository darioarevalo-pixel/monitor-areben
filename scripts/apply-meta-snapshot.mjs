// Aplica sql/migrate-meta-snapshot.sql a la base de BDI del monitor.
// Lee DATABASE_URL_BDI del .env.
// Uso: node scripts/apply-meta-snapshot.mjs
//
// ⚠️ Va a UNA SOLA base, igual que apply-meta-acciones.mjs y apply-meta-ads-linea.mjs, y por el
// mismo motivo: las cuentas publicitarias son compartidas entre líneas, así que "cuánto gastó esto
// el martes" es un hecho único y no una decisión editorial de cada marca. El detalle está arriba
// del SQL.
//
// Idempotente (`create table if not exists` + `alter ... add column if not exists` + índices con
// `if not exists`): seguro re-correr. Crea una tabla NUEVA, no toca ninguna existente.
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

const sql = readFileSync('sql/migrate-meta-snapshot.sql', 'utf8')
const TABLA = 'meta_ads_snapshot_dia'

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
  const r = await client.query(`select count(*)::int as n from ${TABLA}`)
  console.log(`✓ BDI (${cfg.host}):`)
  console.log(`  ${TABLA.padEnd(28)} ${String(r.rows[0].n).padStart(5)} filas`)
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
console.log('\nListo.')
