// Aplica sql/migrate-meta-rentabilidad.sql a la base de BDI del monitor.
// Lee DATABASE_URL_BDI del .env.
// Uso: node scripts/apply-meta-rentabilidad.mjs
//
// ⚠️ Va a UNA SOLA base —a diferencia de apply-meta-funnel.mjs, que va a las dos— y es a propósito:
// el umbral se guarda por LÍNEA de pauta (bdi, zattia, stunned), y Stunned no es una marca del
// monitor, así que no tiene base propia donde vivir. Las tres describen la misma cuenta
// publicitaria, igual que apply-meta-ads-linea.mjs. El detalle está arriba del SQL.
//
// Idempotente (`create table if not exists`): seguro re-correr. Crea una tabla NUEVA, no toca
// ninguna existente ni migra datos. Prende RLS sobre la tabla nueva: el barrido de migrate-rls.sql
// corrió sobre las tablas que existían ese día y no alcanza a las que nacen después.
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

const sql = readFileSync('sql/migrate-meta-rentabilidad.sql', 'utf8')
const TABLA = 'meta_ads_rentabilidad'

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
