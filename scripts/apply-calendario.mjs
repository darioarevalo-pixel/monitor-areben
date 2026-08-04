// Aplica sql/migrate-calendario.sql a las bases de BDI y ZATTIA del monitor.
// Lee DATABASE_URL_BDI / DATABASE_URL_ZATTIA del .env (una o ambas).
// Uso: node scripts/apply-calendario.mjs
//
// Va a las DOS bases —a diferencia de apply-canjes.mjs, que es a propósito solo BDI— porque el
// calendario editorial es por marca: los hitos de Zattia no le sirven a BDI y viceversa. Lo único
// compartido son las fechas comerciales, y esas no se guardan: se calculan en
// `lib/calendario/fechas.core.js`.
//
// Idempotente (`create table if not exists` + `create index if not exists`): seguro re-correr.
// Crea tablas NUEVAS, no toca ninguna existente ni migra datos.
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

const sql = readFileSync('sql/migrate-calendario.sql', 'utf8')
const TABLAS = ['calendario_hitos', 'calendario_fechas_fijadas', 'calendario_decision']

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
    console.log(`✓ ${nombre} (${cfg.host}):`)
    for (const t of TABLAS) {
      const r = await client.query(`select count(*)::int as n from ${t}`)
      console.log(`  ${t.padEnd(26)} ${String(r.rows[0].n).padStart(5)} filas`)
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`✗ ${nombre}: ${e.message}`)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => {})
  }
}
console.log('\nListo.')
