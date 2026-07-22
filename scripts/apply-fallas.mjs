// Aplica sql/migrate-fallas.sql a las bases de BDI y ZATTIA del monitor.
// Lee las connection strings de .env: DATABASE_URL_BDI y DATABASE_URL_ZATTIA (una o ambas).
// Uso: node scripts/apply-fallas.mjs
// La migración es idempotente (create table if not exists), seguro re-correr.
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

const sql = readFileSync('sql/migrate-fallas.sql', 'utf8')

// Parse robusto (la contraseña puede tener caracteres especiales sin encodear).
function parse(raw) {
  const afterProto = raw.slice(raw.indexOf('://') + 3)
  const at = afterProto.lastIndexOf('@')
  const userpass = afterProto.slice(0, at)
  const hostpart = afterProto.slice(at + 1)
  const ci = userpass.indexOf(':')
  const user = userpass.slice(0, ci)
  const password = userpass.slice(ci + 1)
  const slash = hostpart.indexOf('/')
  const hostport = hostpart.slice(0, slash)
  const dbname = hostpart.slice(slash + 1).split('?')[0]
  const [host, port] = hostport.split(':')
  return { user, password, host, port: Number(port) || 5432, database: dbname }
}

const targets = [
  ['BDI', env.DATABASE_URL_BDI],
  ['ZATTIA', env.DATABASE_URL_ZATTIA],
].filter(([, url]) => url)

if (!targets.length) {
  console.error('Falta DATABASE_URL_BDI y/o DATABASE_URL_ZATTIA en .env')
  process.exit(1)
}

for (const [nombre, url] of targets) {
  const cfg = parse(url)
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    // Verificación: la tabla existe y contamos filas (0 al recién crearla).
    const r = await client.query('select count(*)::int as n from fallas_deposito')
    console.log(`✓ ${nombre} (${cfg.host}): fallas_deposito lista — ${r.rows[0].n} filas`)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`✗ ${nombre}: ${e.message}`)
  } finally {
    await client.end().catch(() => {})
  }
}
console.log('\nListo.')
